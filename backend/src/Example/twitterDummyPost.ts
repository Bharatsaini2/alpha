const { TwitterApi } = require('twitter-api-v2')

// 🔑 Your Alpha Whale app credentials
const consumerKey = 'bfKo3LwTMuAVKSA2B2nlHfK8w'
const consumerSecret = 'rRndGon9PYslNBqVAuF8FY9Ux35boaTdkD7edrupy3XBAOkxeZ'

// 🔐 Alpha Insight user tokens (obtained from the previous PIN flow)
const accessToken = '1989300432641134592-zKZDwR0YXCvUnc0vcysVUitBJF1o6V' // alpha insight
const accessTokenSecret = 'jZuipZTW4qPCwcmFuCJHLSzPl65rCa1OIAlcQsBKSWB0R'

// Alpha Insight's access credentials (after PIN-based OAuth)
const client = new TwitterApi({
  appKey: consumerKey,
  appSecret: consumerSecret,
  accessToken: accessToken,
  accessSecret: accessTokenSecret,
})

// Read-write client
const rwClient = client.readWrite

;(async () => {
  try {
    const explorerLink = `www.solscan.io/tx/WDN44zcmouU3fAT2X8cUjbtgcrSQNRVqfc2X8g8ozTyJNhReAHKVeR7fY2QbXZwU77PfzaUBbAApiu1fPaCdUyM`
    // 📤 Dummy tweet to test
    const message = `This is a test post from alphabot2 ✅\n + explorer link: ${explorerLink}`
    const tweet = await rwClient.v2.tweet(message)

    console.log('✅ Tweet posted!')
    console.log(tweet)

    const rateLimits = await rwClient.v1.rateLimitStatuses()
    console.log('ℹ️ Rate limit info (partial):', rateLimits.resources.statuses)
  } catch (err) {
    console.error('❌ Error posting tweet:', err)
  }
})()
