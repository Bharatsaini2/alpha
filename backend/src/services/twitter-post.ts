import dotenv from 'dotenv'
import { TwitterApi } from 'twitter-api-v2'
import { broadcastTransaction } from '../app'
import whaleBigTransactionModel from '../models/whale-big-transactions.model'

dotenv.config()

if (
  !process.env.ALPHA_WHALES_X_API_KEY ||
  !process.env.ALPHA_WHALES_X_API_KEY_SECRET ||
  !process.env.ALPHA_WHALES_X_ACCESS_TOKEN ||
  !process.env.ALPHA_WHALES_X_ACCESS_TOKEN_SECRET
) {
  throw new Error('Missing Twitter API credentials in environment variables')
}

const client = new TwitterApi({
  appKey: process.env.ALPHA_WHALES_X_API_KEY,
  appSecret: process.env.ALPHA_WHALES_X_API_KEY_SECRET,
  accessToken: process.env.ALPHA_WHALES_X_ACCESS_TOKEN,
  accessSecret: process.env.ALPHA_WHALES_X_ACCESS_TOKEN_SECRET,
})

const rwClient = client.readWrite

// Alpha whale main alert for whale transaction alert
export const postAlertToTwitter = async (
  message: any,
  shouldStore: boolean,
  signature: string,
) => {
  try {
    if (!message) {
      console.warn('⚠️ Message is empty. Skipping tweet.')
      return false
    }
    if (shouldStore) {
      try {
        const tweet = await rwClient.v2.tweet(message)
        console.log('Tweet posted successfully:', tweet.data.text)
        console.log('Updating tweetPosted for signature:', signature)
        const updateResult = await whaleBigTransactionModel.updateOne(
          { signature },
          { $set: { tweetPosted: true } },
        )
        console.log('Tweet post status update-------', updateResult)
        if (updateResult.modifiedCount > 0) {
          console.log('✅ tweetPosted status updated successfully.')
          // Fetch the updated transaction from DB
          const updatedTxn = await whaleBigTransactionModel.findOne({
            signature,
          })
          if (updatedTxn) {
            broadcastTransaction({
              type: 'bigWhaleTransaction',
              data: updatedTxn,
            })
          }
        } else {
          console.warn('⚠️ tweetPosted not updated. Maybe already true?')
        }
      } catch (err: any) {
        console.error('Error storing whale transaction:', err)
      }
    }
    return true
  } catch (err: any) {
    console.error('Error posting tweet:', err)
    return false
  }
}
