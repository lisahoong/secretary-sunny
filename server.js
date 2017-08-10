const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const axios = require('axios');

app.use(bodyParser.json())

app.get('/', (req, res) => {
    res.send("Hello! My name is Susan :)")
})

app.post('/webhook', function(req, res) {
    var data = req.body;
    // Make sure this is a page subscription
    console.log('data: ', data);
    if (data.object === 'page') {

        // Iterate over each entry - there may be multiple if batched
        data.entry.forEach(function(entry) {
            var pageID = entry.id;
            var timeOfEvent = entry.time;

            // Iterate over each messaging event
            entry.messaging.forEach(function(event) {
                if (event.message) {
                    receivedMessage(event);
                } else {
                    if (event.sender.id === '1452318791523318') {
                        console.log('it is just susan saying some bullshit');
                    } else
                    {console.log("Webhook received unknown event: ", event);}
                }
            });
        });

        res.sendStatus(200);
    }
});



function receivedMessage(event) {
    console.log('ok got a message: ', event.message);
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log(`Received message for user ${senderID} and page
      ${recipientID} at ${timeOfMessage} with message: ${JSON.stringify(message)}`);

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {

    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'generic':
        sendGenericMessage(senderID);
        break;

      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}

function sendTextMessage(recipientId, messageText) {
    console.log('trying to send a message');
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: 'omg like what ??!'
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
    console.log('does it work?');
    axios.post('https://graph.facebook.com/v2.6/me/messages',
        messageData,
        {
            headers: {
              'Authorization': `Bearer ${process.env.PAGE_ACCESS_TOKEN}`
            }
    })
    .then((response) => {

    })
    .catch((err) => {
        console.log('error: ', error);
    })
}

app.listen(3000, () => {console.log("started!")});
