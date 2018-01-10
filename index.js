const dotenv = require('dotenv')
const express = require('express')
const RingCentral = require('ringcentral');
const fs = require('fs')
const path = require('path')
const bodyParser = require('body-parser')

const pkg = require('./package.json')

dotenv.config()
const tokenFile = path.join(__dirname, '.token')
const rcsdk = new RingCentral({
  appKey: process.env.GLIP_CLIENT_ID,
  appSecret: process.env.GLIP_CLIENT_SECRET,
  server: process.env.GLIP_API_SERVER
})
const platform = rcsdk.platform()
let botId
let botPerson = {}

async function initBot() {
  if (fs.existsSync(tokenFile)) {
    // restore token
    const authData = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'))
    platform.auth().setData(authData)
    botId = authData.owner_id
    try {
      await createBotSubscribe()
      getGlipPersonInfo()
    } catch (e) {
      console.error('Init Bot infomation fail', e)
      throw e
    }
  }
}

function getGlipPersonInfo(tried) {
  setTimeout(async () => {
    try {
      botPerson = await platform.get('/glip/persons/~')
      console.log('Bot info:', botPerson.json())
    } catch (e) {
      if (tried) {
        console.error(e)
        return;
      }
      console.error(e)
      console.log('it will retry after 20 seconds.')
      getGlipPersonInfo(true)
    }
  }, 20000)
}

initBot()

async function createBotSubscribe() {
  const requestData = {
    eventFilters: [
      '/restapi/v1.0/glip/posts',
      '/restapi/v1.0/glip/groups',
      '/restapi/v1.0/subscription/~?threshold=60&interval=15'
    ],
    deliveryMode: {
      transportType: 'WebHook',
      address: `${process.env.GLIP_BOT_SERVER}/webhook`,
      verificationToken: process.env.GLIP_BOT_VERIFICATION_TOKEN
    },
    expiresIn: 604800 // 7 days
  };
  try {
    const response = await platform.post('/subscription', requestData)
    const subscription = response.json();
    console.log(subscription)
  } catch (e) {
    console.error(e);
  }
}

async function renewGlipSubscription(id){
  console.log('Renewing Subscription');
  try {
    const response = await platform.post(`/subscription/${id}/renew`)
    const subscription = response.json();
    console.log('subscription successfully')
    console.log(subscription)
  } catch (e) {
    console.error(e);
  }
}

const app = express()
app.use(bodyParser.json())

app.get('/', function(req, res) {
  res.send('Bot is working! Path Hit: ' + req.url);
});

app.get('/oauth', async (req, res) => {
  if(!req.query.code){
    res.status(500);
    res.send({"Error": "Looks like we're not getting code."});
    console.log("Looks like we're not getting code.");
    return;
  }
  console.log('starting oauth with code...');
  try {
    const authResponse = await platform.login({
      code: req.query.code,
      redirectUri: `${process.env.GLIP_BOT_SERVER}/oauth`
    });
    const data = authResponse.json();
    fs.writeFileSync(tokenFile, JSON.stringify(data)) // save token
    res.send('ok')
    createBotSubscribe()
    getGlipPersonInfo()
    console.log('oauth successfully.');
  } catch (e) {
    console.log('oauth error:');
    console.error(e)
    res.status(500);
  }
})

async function sendGlipMessage({ groupId, text }) {
  try {
    await platform.post('/glip/posts', { groupId, text })
  } catch (e) {
    console.error(e)
  }
}

app.post('/webhook', async (req, res) => {
  console.log('WebHook Request:')
  const validationToken = req.get('validation-token')
  if (validationToken) {
    res.set('validation-token', req.get('validation-token'))
    res.send('ok')
    return
  }
  const verificationToken = req.get('verification-token')
  if (verificationToken !== process.env.GLIP_BOT_VERIFICATION_TOKEN) {
    res.status(400)
    res.send({ 'Error': 'Bad Request.' })
    console.error(req.body)
    return
  }
  const notification = req.body
  if (notification.event === '/restapi/v1.0/subscription/~?threshold=60&interval=15') {
    res.send('ok')
    renewSubscription(notification.subscriptionId);
    return;
  }
  const message = notification.body
  if (message && message.type === 'TextMessage') {
    console.log('Message from Glip:', message.text)
    if (message.creatorId === botPerson.id) {
      res.send('ok')
      return
    }
    if (message.text === 'ping') {
      sendGlipMessage({ groupId: message.groupId, text: 'pong' })
    }
  }
  res.send('ok')
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
