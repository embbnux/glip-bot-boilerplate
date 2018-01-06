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

if (fs.existsSync(tokenFile)) { // restore token
  platform.auth().setData(JSON.parse(fs.readFileSync(tokenFile, 'utf-8')))
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
    console.log('oauth successfully.');
  } catch (e) {
    console.log('oauth error:');
    console.error(e)
  }
  res.send('ok')
})

app.post('/webhook', async (req, res) => {
  console.log('WebHook Request:')
  const verificationToken = req.get('verification-token')
  if (verificationToken !== process.env.GLIP_BOT_VERIFICATION_TOKEN) {
    res.status(400)
    res.send({ "Error": "Bad Request." })
    console.error(req.body)
    return
  }
  const message = req.body.body
  const validationToken = req.get('validation-token')
  if (message && message.type === 'TextMessage') {
    console.log(message.text)
    if (message.text === 'ping') {
      try {
        const response = await platform.post('/glip/posts', { groupId: message.groupId, text: 'pong' })
        console.log(response)
      } catch (e) {
        console.error(e)
      }
    }
  }
  if (validationToken) {
    res.set('validation-token', req.get('validation-token'))
  }
  res.send('ok')
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
