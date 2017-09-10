const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const axios = require('axios');
const Nightmare = require('nightmare');
const google = require('googleapis');
const { User } = require('./models');
const { DOMParser } = require('xmldom');
const moment = require('moment');
moment().format();
const OAuth2 = google.auth.OAuth2;

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

app.get('/webhook', (req, res) => {
  res.send(req.query['hub.challenge'])
})

app.get('/', (req, res) => {
res.send(`Hello! My name is Sunny :) I promise I won't steal your data, I'm
just a regular bot hoping to help you create simple reminders and events
in your Google Calendar and I'm a DJ too that can play your Spotify and
Soundcloud playlists too! `)
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
    approvalPrompt: 'force',
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
        console.log('tokens got: ', tokens);
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
                res.send(`Thanks ${user.firstName}! Your calendar has been successfully connected!`)
            }
        }
    });
})

app.post('/webhook', function(req, res) {
var data = req.body;
// Make sure this is a page subscription
if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
        var pageID = entry.id;
        var timeOfEvent = entry.time;

        // Iterate over each messaging event
        entry.messaging.forEach(function(event) {
            if (event.message || event.postback) {
                handleReceivedMessage(event);
            } else {
                if (event.sender.id !== '1452318791523318') {
                    console.log("Webhook received unknown event: ", event);
                }
            }
        });
    });

    res.sendStatus(200);
}
});


const handleReceivedMessage = async (event) => {
var senderID = event.sender.id;
var recipientID = event.recipient.id;
var timeOfMessage = event.timestamp;
var message = event.message;

try {
    var { data } = await axios.get('https://graph.facebook.com/v2.10/' + event.sender.id, {
        headers: {
            'Authorization': `Bearer ${process.env.PAGE_ACCESS_TOKEN}`
        }})
        var user = await User.findOne({fbUserId: senderID});
        if (!user) {
            user = new User({
                firstName: data.first_name,
                lastName: data.last_name,
                fbUserId: senderID
            })
            user.save();

        } else {
            if (!user.google) {
                var messageData = {
                    recipient: {
                        id: senderID
                    },
                    message: {
                        text: `
                        Hi ${user.firstName}! My name is Sunny and I will be your personal secretary. You can say things like
                        \Remind me to turn in my homework on Friday
                        Remind me to call mom tomorrow
                        But in order for me to do so, I need your permission
                        to access your calendar by following this link:
                        ${process.env.DOMAIN}/connect/?auth_id=${encodeURIComponent(user._id)}`
                    }
                }
                callSendAPI(messageData);
            } else if (user.currentReminder && event.postback) {
                if (event.postback.payload === 'NO') {
                    user.currentReminder === null;
                    await user.save();
                    var messageData = createMessage(senderID, 'Ok no reminder was made');
                    callSendAPI(messageData);
                } else {
                    createReminder(user, user.currentReminder.subject, user.currentReminder.date);
                    user.currentReminder === null;
                    await user.save();
                    var messageData = createMessage(senderID, 'Ok done!');
                    callSendAPI(messageData);
                }
            } else {
                if (message.text) {
                    console.log('mesg: ', message);
                    // send the message to agent
                    var agentResponse = await queryAgent(message.text, senderID);
                    if (agentResponse.data.result.metadata.intentName === 'reminder:add') {
                        handleAddReminder(user, senderID, agentResponse.data);
                    } else if (agentResponse.data.result.metadata.intentName === 'dictionary') {
                        if (agentResponse.data.result.parameters.action === 'define') {
                            var str = agentResponse.data.result.resolvedQuery.split(" ");
                            defineWord(str[1], senderID);
                        } else if (agentResponse.data.result.parameters.action === 'synonym') {

                        } else if (agentResponse.data.result.parameters.action === 'dj') {
                            spotify(user, senderID);
                        }
                    } else {
                        callSendAPI(createMessage(senderID, agentResponse.data.result.fulfillment.speech))
                    }

                    //if yes send the prompt
                    //if no then fulfill the action
                    //if fulfilled then ask the user to confirm
                    //if confirmed then make the event
                    //otherwise clear pending
                }
            }
        }

    }
    catch(err) {
        console.log("Error getting user: ", err);
    }
}

app.get('/spotifyoauthcallback', async (req, res) => {
    console.log(req.body);
    console.log('QUERY: ', req.query.code);
    var code = req.query.code;
    try {
        var user = await User.findById(req.query.state);
        axios.post('https://accounts.spotify.com/api/token', {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: `${process.env.DOMAIN}/spotifyoauthcallback`,
            client_id: process.env.SPOTIFY_ID,
            client_secret: process.env.SPOTIFY_SECRET
        }
    ).then((resp) => {
        console.log(resp);
        res.send('Thanks for connecting your Spotify account!')
    })
    }
    catch(err) {
        console.log('error in spotify: ', err);
    }
})

const spotify = async(user, senderID) => {
    if (!user.spotify) {
        var client = `?client_id=${process.env.SPOTIFY_ID}&`;
        var response_type = `response_type=code&`;
        var redirect_uri = `redirect_uri=${process.env.DOMAIN}/spotifyoauthcallback&`;
        var scope = encodeURIComponent('scope=playlist-read-private user-modify-playback-state user-read-recently-played user-read-currently-playing&')
        var state = 'state=' + encodeURIComponent(user._id);
        var msg = `Please grant me access to your Spotify playlists so I can wicka wicka DJ: https://accounts.spotify.com/authorize/${client}${response_type}${redirect_uri}${scope}${state}`
        var messageData = createMessage(senderID, msg);
        callSendAPI(messageData);
    }
}

function defineWord(word, senderID) {
    axios.get(`http://www.dictionaryapi.com/api/v1/references/collegiate/xml/${word}?key=${process.env.DICTIONARY_KEY}`)
    .then((resp) => {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(resp.data,"text/xml");
        var num = 1;
        var definitions = [];
        Object.keys(xmlDoc.getElementsByTagName("dt")['0'].childNodes)
        .forEach((def) => {
            if (xmlDoc.getElementsByTagName("dt")['0'].childNodes[def].data) {
                var givenDef = xmlDoc.getElementsByTagName("dt")['0'].childNodes[def].data;
                if (givenDef[0] === ':') {
                    givenDef = givenDef.substring(1);
                }
                definitions.push(num.toString() + '. ' + givenDef + '\n');
                num++;
            }

        })
        var messageData = createMessage(senderID, definitions.join(""));
        callSendAPI(messageData);
    })
}

function createMessage(senderID, message) {
    return {
        recipient: {
            id: senderID
        },
        message: {
            text: message
        }
    }
}

const handleAddReminder = async (user, senderID, data) => {
    if (user.pending) {
        //user has not completed previous intent
        if (user.pending.subject === '') {
            var messageData = {
                recipient: {
                    id: senderID
                },
                message: {
                    text: `Oh no, it looks like you haven\'t told me whether you if you wanted a reminder
                    to ${user.pending.subject}.`
                }
            }
            callSendAPI(messageData)
        }
        else if (user.pending.date === '') {
            var messageData = {
                recipient: {
                    id: senderID
                },
                message: {
                    text: `Oh no, it looks like you haven\'t told me whether you if you wanted a reminder
                    to ${user.pending.subject}.`
                }
            }
            callSendAPI(messageData)
        }
    } else {
        console.log('true data: ', data);
        if (data.result.actionIncomplete) {
            // user.pending = data.result.parameters
            // user = await user.save();
            // console.log('user: ', user);
            console.log('incomplete info');
            var messageData = createMessage(senderID, data.result.fulfillment.speech);
            callSendAPI(messageData);

        } else {
            console.log('complete', data.result.parameters);

            user.currentReminder = data.result.parameters
            user = await user.save();
            console.log('user: ', user);
          var messageData = {
              recipient: {
                  id: senderID
              },
              message: {
                  attachment: {
                    type: "template",
                    payload:{
                      template_type: "button",
                      text: `So you want me to create a reminder for you ${user.currentReminder.subject} for ${user.currentReminder.date}`,
                      buttons: [
                        {
                            type: "postback",
                            title: "Yes",
                            payload: 'YES'
                        },
                        {
                            type: "postback",
                            title: "No",
                            payload: 'NO'
                        }
                      ]
                    }
                  }
              }
          }
          callSendAPI(messageData);

        }
    }
}

const createReminder = async (user, subject, date) => {
    var calendar = google.calendar('v3');

    // Refresh tokens if expired
    var tokens = await refreshToken(user);
    console.log('tokens: ', tokens);
    user.google = Object.assign({}, user.google, tokens);
    await user.save();

    var oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_SECRET,
        process.env.DOMAIN + '/oauthcallback'
    );

    let credentials = Object.assign({}, user.google);
    delete credentials.profile_id;
    delete credentials.profile_name;
    delete credentials.profile_email;
    oauth2Client.setCredentials(credentials);


    var event = {
        'summary': subject,
        'start': {
            'dateTime': moment(date),
            'timeZone': 'America/Los_Angeles',
        },
        'end': {
            'dateTime': moment(date).add(1, 'days'),
            'timeZone': 'America/Los_Angeles',
        },
        'reminders': {
            'useDefault': false,
            'overrides': [
                {'method': 'email', 'minutes': 24 * 60},
                {'method': 'popup', 'minutes': 10},
            ],
        },
    };

    calendar.events.insert({
        auth: oauth2Client,
        calendarId: 'primary',
        resource: event,
    }, function(err, event) {
        if (err) {
            console.log('There was an error contacting the Calendar service: ' + err);
            return;
        }
        console.log('Event created: %s', event.htmlLink);
    });
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

function refreshToken(user) {
    var oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_SECRET,
        process.env.DOMAIN + '/oauthcallback'
    );

  let res = Object.assign({}, user.google);
  delete res.profile_id;
  delete res.profile_name;
  delete res.profile_email;
  oauth2Client.setCredentials(res);

  if (new Date(res.expiry_date) >= new Date()) {
    return new Promise(function(resolve, reject) {
      oauth2Client.refreshAccessToken(function(err, tokens) {
        if (err) {
          user.google.refresh_token = user.google
          reject(err);
        } else {
          console.log(tokens);
          resolve(tokens);
        }
      });
    });
  } else {
    return Promise.resolve(user.google);
  }
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
        console.log('error: ', err);
    })
}

app.listen(3000, () => {console.log("started!")});
