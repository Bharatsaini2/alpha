import { TwitterApi } from 'twitter-api-v2'
import dotenv from 'dotenv'

dotenv.config()

if (
  !process.env.ALPHA_CLUSTER2_AGENT_X_API_KEY ||
  !process.env.ALPHA_CLUSTER2_AGENT_X_API_KEY_SECRET ||
  !process.env.ALPHA_CLUSTER2_AGENT_X_ACCESS_TOKEN ||
  !process.env.ALPHA_CLUSTER2_AGENT_X_ACCESS_TOKEN_SECRET
) {
  throw new Error('Missing Twitter API credentials in environment variables')
}

const client = new TwitterApi({
  appKey: process.env.ALPHA_CLUSTER2_AGENT_X_API_KEY,
  appSecret: process.env.ALPHA_CLUSTER2_AGENT_X_API_KEY_SECRET,
  accessToken: process.env.ALPHA_CLUSTER2_AGENT_X_ACCESS_TOKEN,
  accessSecret: process.env.ALPHA_CLUSTER2_AGENT_X_ACCESS_TOKEN_SECRET,
})

const InsightXClient = client.readWrite

// *******************     Big Activity / Volume Spike Alert    *******************
export const postToTwitterUsingAccount2 = async (message: string) => {
  try {
    await InsightXClient.v2.tweet(message)
    console.log('✅ Tweet posted successfully!')
  } catch (err) {
    console.error('❌ Error posting tweet:', err)
  }
}
