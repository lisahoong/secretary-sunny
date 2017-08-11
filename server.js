const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const axios = require('axios');
const Nightmare = require('nightmare');
const google = require('googleapis');

// Nightmare.action('specialKeyPress',
//   function(name, options, parent, win, renderer, done) {
//     parent.respondTo('specialKeyPress', async function(keyCode, done) {
//       // See this: https://github.com/electron/electron/blob/master/docs/api/web-contents.md#contentssendinputeventevent
//       // and this: https://github.com/electron/electron/blob/master/docs/api/accelerator.md
//       win.focus();
//       win.webContents.sendInputEvent({ type:'keyDown', keyCode });
//       await new Promise(resolve => setTimeout(resolve, 50));
//       win.webContents.sendInputEvent({ type:'keyUp', keyCode });
//       done();
//     });
//     done();
//   },
//   function(keyCode, done) {
//     this.child.call('specialKeyPress', keyCode, done);
//   });
//
//   const nightmare = Nightmare({show: true});


// nightmare
//   .goto('https://postmates.com/san-francisco')
//   .type('.search-bar__input', 'teaspoon')
//   .wait(5000)
//   .click('.search-bar__icon')
//   .wait(3000)
//   .type('.search-bar__input', 'teaspoon')
//   .goto('https://postmates.com/san-francisco')
//   .type('.search-bar__input', 'teaspoon')
//   .wait(5000)
//   .click('.search-bar__icon')
//   .wait(3000)
//   .type('.search-bar__input', 'teaspoon')
//
//   // .specialKeyPress('Down')
//   // .type('#delivery_address', '\u000d')
//   .catch(function (error) {
//     console.error('Search failed:', error);
//   });

app.use(bodyParser.json())

app.get('/', (req, res) => {
    res.send(`Hello! My name is Susan :) I promise I won't steal your data, I'm
    just a regular bot hoping to help you create simple reminders and events
    in your Google Calendar and I'm a DJ too that can play your Spotify and
    Soundcloud playlists too!`)
})

app.get('/connect', (req, res) => {
    var oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_SECRET,
        process.env.DOMAIN + '/oauthcallback'
    );

    const scopes = [
        'https://www.googleapis.com/auth/plus.me',
        'https://www.googleapis.com/auth/calendar'
    ];

    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: encodeURIComponent(JSON.stringify({
          auth_id: req.query.auth_id
        }))
    });

    res.redirect(url);
})

app.get('/oauthcallback', (req, res) => {

    var oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_SECRET,
        process.env.DOMAIN + '/oauthcallback'
    );

    oauth2Client.getToken(req.query.code, async (err, tokens) => {
        // Now tokens contains an access_token and an optional refresh_token. Save them.
        if (!err) {
            oauth2Client.setCredentials(tokens);
            var userId = JSON.parse(decodeURIComponent(req.query.state)).auth_id;
            if (!userId) {
                throw new Error("Yikes, couldn't find the user")
            }
            var user = await User.findById(userId);
            if (!user) {
                throw new Error("Couldn't find that user")
            } else {
                user.google = tokens;
                await user.save();
            }
        }
    });
    res.send(200);
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
                    handleReceivedMessage(event);
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

const handleReceivedMessage = async (event) => {
    console.log('event: ', event);
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    axios.get('https://graph.facebook.com/v2.10/' + event.sender.id)
    .then((info) => {
        console.log("info: ", info);
    })
    .catch((err) => console.log("error getting user: ", err))

    console.log(`Received message for user ${senderID} and page
        ${recipientID} at ${timeOfMessage} with message: ${message.text}`
    );

    if (message.text) {
        try {
            var { data } = await queryAgent(message.text, recipientID);
            console.log('DATA', data);
            if (!data.result.actionIncomplete) {
                var messageData = {
                  recipient: {
                    id: senderID
                  },
                  message: {
                    text: data.result.fulfillment.speech
                  }
                }
                callSendAPI(messageData);
            } else {
                var messageData = {
                  recipient: {
                    id: senderID
                  },
                  message: {
                    text: data.result.fulfillment.speech
                  }
                }
                callSendAPI(messageData);
            }
        }
        catch(err) {
            console.log('Error: ', err);
        }
    }
}

const queryAgent = (msg, sessionId) => {
    return axios.post('https://api.api.ai/api/query?v=20150910', {
      query: msg,
      lang: 'en',
      sessionId: sessionId,
      timezone: 'America/Los_Angeles'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.APIAI_TOKEN}`
      }
    });
}

function callSendAPI(messageData) {
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
