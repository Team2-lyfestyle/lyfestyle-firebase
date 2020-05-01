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
        console.log('create')
        return;
        /*
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
            // spread syntax (...obj) does not work with firebase?
            pushTokens = Object.assign(pushTokens, obj); 
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
        */
    });



exports.updateFriendsOnFriendCreate = functions.database.ref('users/{userId}/friends/{friendId}')
    .onCreate( async (snapshot, context) => {
        let friendRef = admin.database().ref(`users/${context.params.friendId}/friends/${context.params.userId}`);

        // Clear any friend requests sent or received between these two users
        let ref1 = admin.database().ref(`users/${context.params.friendId}/friendRequestsSent/${context.params.userId}`);
        let ref2 = admin.database().ref(`users/${context.params.friendId}/friendRequestsRcvd/${context.params.userId}`);
        let ref3 = admin.database().ref(`users/${context.params.userId}/friendRequestsSent/${context.params.friendId}`);
        let ref4 = admin.database().ref(`users/${context.params.userId}/friendRequestsRcvd/${context.params.friendId}`);
        return Promise.all([friendRef.set(true), ref1.remove(), ref2.remove(), ref3.remove(), ref4.remove()]);
    });


exports.updateFriendRequestOnSend = functions.database.ref('users/{userId}/friendRequestsSent/{otherUserId}')
    .onCreate( async (snapshot, context) => {
        let otherUser = (await admin.database().ref(`users/${context.params.otherUserId}`).once('value')).val();

        // If other user has sent a friend request as well, then just add the two users as friends
        if (otherUser.friendRequestsSent && context.params.userId in otherUser.friendRequestsSent) {
            let otherUserRef = admin.database().ref(`users/${context.params.otherUserId}/friends/${context.params.userId}`);
            let userRef = admin.database().ref(`users/${context.params.userId}/friends/${context.params.otherUserId}`);

            // Clear any friend requests sent or received between these two users
            let ref1 = admin.database().ref(`users/${context.params.otherUserId}/friendRequestsSent/${context.params.userId}`);
            let ref2 = admin.database().ref(`users/${context.params.otherUserId}/friendRequestsRcvd/${context.params.userId}`);
            let ref3 = admin.database().ref(`users/${context.params.userId}/friendRequestsSent/${context.params.otherUserId}`);
            let ref4 = admin.database().ref(`users/${context.params.userId}/friendRequestsRcvd/${context.params.otherUserId}`);
            return Promise.all([userRef.set(true), otherUserRef.set(true), ref1.remove(), ref2.remove(), ref3.remove(), ref4.remove()]);
        }
        // Otherwise, just add to friendRequestsRcvd
        else {
            let otherUserRef = admin.database().ref(`users/${context.params.otherUserId}/friendRequestsRcvd/${context.params.userId}`);
            return otherUserRef.set(true);
        }
    });


exports.updateFriendRequestRcvdOnSentDelete = functions.database.ref('users/{userId}/friendRequestsSent/{otherUserId}')
    .onDelete( async (snapshot, context) => {
        let otherUserRef = admin.database().ref(`users/${context.params.otherUserId}/friendRequestsRcvd/${context.params.userId}`);
        return otherUserRef.remove();
    });


exports.updateFriendOnFriendDelete = functions.database.ref('users/{userId}/friends/{otherUserId}')
    .onDelete( async (snapshot, context) => {
        let otherUserRef = admin.database().ref(`users/${context.params.otherUserId}/friends/${context.params.userId}`);
        return otherUserRef.remove();
    });


function addChatSessionToUserChats(userId, chatId) {
    let userRef = admin.database().ref('users/' + userId + '/chats');
    return userRef.update({
        [chatId]: true
    });
}

exports.updateUserInfoOnChatSessionCreate = functions.database.ref('chats/{chatId}')
    .onCreate( async (snapshot, context) => {
        let promises = [];
        console.log('On create event');
        let chatSession = snapshot.val();
        for (let member of Object.keys(chatSession.members)) {
            promises.push(addChatSessionToUserChats(member, snapshot.key));
        }
        return Promise.all(promises);
    });


async function updateNotifsOnNewMessage(snapshot, context) {
    let promises = [];
    let senderId = context.auth.uid;

    // Get an object containing the users to update notifs for
    let recipients = await admin.database().ref(`chats/${context.params.chatId}`).once('value');
    recipients = recipients.val().members;
    for (let userId of Object.keys(recipients)) {
        if (userId === senderId) {
            // Do nothing, don't need to notify the sender
            continue;
        }
        let notifsRef = admin.database().ref(`notifs/${userId}/chats/${context.params.chatId}`);
        promises.push(notifsRef.update(snapshot.val()));
    }
    return Promise.all(promises);
}


exports.updateNotifsOnNewMessage = functions.database.ref('messages/{chatId}/{messageId}')
    .onCreate( async (snapshot, context) => {
        let promises = [];
        let senderId = context.auth.uid;

        // Get an object containing the users to update notifs for
        let recipients = await admin.database().ref(`chats/${context.params.chatId}`).once('value');
        recipients = recipients.val().members;
        for (let userId of Object.keys(recipients)) {
            if (senderId && userId === senderId) {
                // Do nothing, don't need to notify the sender
                continue;
            }
            let notifsRef = admin.database().ref(`notifs/${userId}/chats/${context.params.chatId}`);
            promises.push(
                notifsRef.child(context.params.messageId).set(snapshot.val())
            );
        }
        return Promise.all(promises);
    });

exports.updateChatSessionOnNewMessage = functions.database.ref('messages/{chatId}/{messageId}')
    .onCreate( async (snapshot, context) => {
        let message = snapshot.val();
        let chatRef = admin.database().ref(`chats/${context.params.chatId}`);
        return chatRef.update({
            lastMessageText: message.text,
            lastMessageAt: message.createdAt,
        });
    });


/*
    Create a new chatSession:
    updates chats to include new session.
    updates users to include new chat id
*/
/*
DOESNT WORK IDK WHY

exports.createNewChatSession = functions.https.onCall(async (data, context) => {
    const senderId = context.auth.uid;
    let timestamp = (new Date()).toISOString();

    // Update chats
    let chatsRef = admin.database().ref('chats').push();
    chatsRef.set({
        members: data.members,
        lastMessage: data.message.message,
        timestamp: timestamp
    });

    // Update messages
    let messagesRef = admin.database().ref('messages');
    messagesRef.update({
        [chatsRef.key]: {
            message: data.message.message,
            name: senderId,
            timestamp: timestamp
        }
    });

    // Update users
    for (let member of data.members) {
        addChatSessionToUserChats(member, chatsRef.key);
    }

    return { chatId: chatsRef.key };
});



exports.sendMessage = functions.https.onCall((data, context) => {
    const senderId = context.auth.uid;
    let timestamp = (new Date()).toISOString();

    // Update chats
    let chatsRef = admin.database().ref('chats/' + data.chatId);
    chatsRef.update({
        members: data.members,
        lastMessage: data.message.message,
        timestamp: timestamp
    });

    // Update messages
    let messagesRef = admin.database().ref('messages/' + data.chatId);
    let newMessageRef = messagesRef.push({
        [chatsRef.key]: {
            message: data.message.message,
            name: senderId,
            timestamp: timestamp
        }
    });
    
    return { messageId: newMessageRef.key };
});
*/