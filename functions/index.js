const { Expo } = require('expo-server-sdk');
const functions = require('firebase-functions');
// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

let expo = new Expo();


/*
Gets an object containing all of the userId's Expo push tokens.

If a token is found to be invalid, it is removed from the array in the database
*/
async function getUserPushTokensAsync(userId) {
    const pushTokens = (await admin.database().ref(`users/${userId}/pushTokens`).once('value')).val();
    for (let token in pushTokens) {
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error('Invalid push token', pushToken);
            //pushTokens.splice(pushTokens.indexOf(token), 1);
            delete pushTokens[token];
        }
    }
    return pushTokens;
}

/*
Gets an object containing all of the members (userId's) in a chat room

Optional argument dontIncludeUserId omits the argument from the returned object
*/
async function getChatMembersAsync(chatId, dontIncludeUserId) {
    const chatMembers = (await admin.database().ref(`members/${chatId}`).once('value')).val();
    if (dontIncludeUserId && dontIncludeUserId in chatMembers) {
        delete chatMembers[dontIncludeUserId];
    }
    return chatMembers;
}


async function updateChatInfo(chatId, message) {
    const chatRef = admin.datebase().ref(`chats/${chatId}`);
    await chatRef.update({ lastMessage: message.message, timestamp: message.timestamp});
}

/*
    Listens for new messages created in a specific chat session.
    On create, update the notifs path in the DB and send an Expo push notification
    to everyone involved in the chat session (excluding the sender).
*/
exports.sendChatNotificationsAndUpdateDB = functions.database.ref('messages/{chatId}')
    .onCreate( async (snapshot, context) => {
        const chatId = context.params.chatId;

        // Get the message and userId who sent the message
        const messageObj = snapshot.val();
        const message = messageObj.message;
        const userIdSender = messageObj.username;

        // First, update the chats/chatId informatin
        await updateChatInfo(chatId, messageObj);

        // Next, update notifs so that everyone involved in the chat session
        // will be able to download the new message.
        // Also get the list of Expo push tokens to send the notification to

        // Get the id's of all users in the chatId chat session, excluding the id of the sender
        // Note that chatMembers is an object where the keys are the id's of each member
        const chatMembers = await getChatMembers(chatId, userIdSender);
        let notifsPromises = [], pushTokensPromises = [], pushTokens = {};
        for (let userId of Object.keys(chatMembers)) {
            let msgRef = admin.database().ref('notifs/' + userId + '/chats/' + chatId).push();
            notifsPromises.push( msgRef.set(messageObj) );
            pushTokens = pushTokens.concat(getUserPushTokensAsync(userId));
        }

        await Promise.all(notifsPromises);
        pushTokensPromises = await Promise.all(pushTokensPromises);
        for (let obj of pushTokensPromises) {
            pushTokens = Object.assign(pushTokens, obj); // spread syntax (...obj) does not work with firebase?
        }

        // Send the message to each push token
        let messages = [];
        for (let token in pushTokens) {
            messages.push({
                to: token,
                sound: 'default',
                body: 'New message',
                data: { message: message }
            });
        }
        let chunks = expo.chunkPushNotifications(messages);
        let promises = [];
        for (let chunk of chunks) {
            try {
                let ticketChunk = promises.push( expo.sendPushNotificationsAsync(chunk) );
                console.log(ticketChunk);
                // tickets.push(...ticketChunk);
                // NOTE: If a ticket contains an error code in ticket.details.error, you
                // must handle it appropriately. The error codes are listed in the Expo
                // documentation:
                // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
            } 
            catch (error) {
                console.error(error);
            }
        }
        await Promise.all(promises);
    });

