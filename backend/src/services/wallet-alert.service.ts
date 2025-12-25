import dotenv from 'dotenv'
import { TwitterApi } from 'twitter-api-v2'
import logger from '../utils/logger'

dotenv.config()

// Use separate Twitter credentials for wallet tracking if available, otherwise use whale credentials
const WALLET_X_API_KEY = process.env.CANDY_AGENT_X_API_KEY
const WALLET_X_API_KEY_SECRET = process.env.CANDY_AGENT_X_API_KEY_SECRET
const WALLET_X_ACCESS_TOKEN = process.env.CANDY_AGENT_X_ACCESS_TOKEN
const WALLET_X_ACCESS_TOKEN_SECRET =
  process.env.CANDY_AGENT_X_ACCESS_TOKEN_SECRET

if (
  !WALLET_X_API_KEY ||
  !WALLET_X_API_KEY_SECRET ||
  !WALLET_X_ACCESS_TOKEN ||
  !WALLET_X_ACCESS_TOKEN_SECRET
) {
  throw new Error(
    'Missing Twitter API credentials for wallet tracking in environment variables',
  )
}

const client = new TwitterApi({
  appKey: WALLET_X_API_KEY,
  appSecret: WALLET_X_API_KEY_SECRET,
  accessToken: WALLET_X_ACCESS_TOKEN,
  accessSecret: WALLET_X_ACCESS_TOKEN_SECRET,
})

const rwClient = client.readWrite

/**
 * Format buy alert message
 */
export const formatBuyAlert = (data: {
  tokenSymbol: string
  quantity: number // in SOL
  contract: string
  walletBalance: number // in SOL
  signature: string
}): string => {
  const signature = data.signature || 'N/A'
  return `CANDY BOT | BUY EXECUTED

> trade_event: BUY
> token: $${data.tokenSymbol}
> qty: ${data.quantity.toFixed(2)} SOL
> contract: ${data.contract}
> wallet_balance: ${data.walletBalance.toFixed(2)} SOL
> tx: ${signature}

[ status: confirmed ✓ ]`
}

/**
 * Format sell alert message
 */
export const formatSellAlert = (data: {
  tokenSymbol: string
  quantity: number // in SOL
  profit: number // in SOL
  contract: string
  walletBalance: number // in SOL
  signature: string
}): string => {
  const signature = data.signature || 'N/A'
  const profitSign = data.profit >= 0 ? '+' : ''
  // Use toFixed with proper handling for negative values to avoid rounding to 0.00
  const profitFormatted =
    Math.abs(data.profit) < 0.01 && data.profit !== 0
      ? `${profitSign}${data.profit.toFixed(4)}` // Show more decimals for very small values
      : `${profitSign}${data.profit.toFixed(2)}`
  return `CANDY BOT | SELL EXECUTED

> trade_event: SELL
> token: $${data.tokenSymbol}
> qty: ${data.quantity.toFixed(2)} SOL
> profit: ${profitFormatted} SOL
> contract: ${data.contract}
> wallet_balance: ${data.walletBalance.toFixed(2)} SOL
> tx: ${signature}

[ status: confirmed ✓ ]`
}

/**
 * Post buy alert to Twitter
 * Returns: { success: boolean, error?: any, isDuplicate?: boolean }
 */
export const postBuyAlert = async (data: {
  tokenSymbol: string
  quantity: number // in SOL
  contract: string
  walletBalance: number // in SOL
  signature: string
}): Promise<{ success: boolean; error?: any; isDuplicate?: boolean }> => {
  try {
    const message = formatBuyAlert({
      tokenSymbol: data.tokenSymbol,
      quantity: data.quantity,
      contract: data.contract,
      walletBalance: data.walletBalance,
      signature: data.signature,
    })

    const tweet = await rwClient.v2.tweet(message)
    logger.info(`✅ Buy alert posted successfully: ${tweet.data.id}`)
    logger.info(`Tweet: ${message}`)
    return { success: true }
  } catch (err: any) {
    const isDuplicate =
      err?.code === 403 && err?.data?.detail?.includes('duplicate content')
    logger.error({ err }, '❌ Error posting buy alert to Twitter:')
    return { success: false, error: err, isDuplicate }
  }
}

/**
 * Post sell alert to Twitter
 * Returns: { success: boolean, error?: any, isDuplicate?: boolean }
 */
export const postSellAlert = async (data: {
  tokenSymbol: string
  quantity: number // in SOL
  profit: number // in SOL
  contract: string
  walletBalance: number // in SOL
  signature: string
}): Promise<{ success: boolean; error?: any; isDuplicate?: boolean }> => {
  try {
    const message = formatSellAlert({
      tokenSymbol: data.tokenSymbol,
      quantity: data.quantity,
      profit: data.profit,
      contract: data.contract,
      walletBalance: data.walletBalance,
      signature: data.signature,
    })

    const tweet = await rwClient.v2.tweet(message)
    logger.info(`✅ Sell alert posted successfully: ${tweet.data.id}`)
    logger.info(`Tweet: ${message}`)
    return { success: true }
  } catch (err: any) {
    const isDuplicate =
      err?.code === 403 && err?.data?.detail?.includes('duplicate content')
    logger.error({ err }, '❌ Error posting sell alert to Twitter:')
    return { success: false, error: err, isDuplicate }
  }
}
