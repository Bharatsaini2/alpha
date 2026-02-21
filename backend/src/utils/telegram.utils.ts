import { IWhaleAllTransactionsV2 } from '../models/whaleAllTransactionsV2.model'
import { IInfluencerWhaleTransactionsV2 } from '../models/influencerWhaleTransactionsV2.model'

/**
 * Escapes special characters for Telegram MarkdownV2 format
 * Required characters: _ * [ ] ( ) ~ > # + - = | { } . !
 * @param text - The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdownV2(text: string): string {
  const specialChars = /([_*\[\]()~>`#+=|{}\\.!-])/g
  return text.replace(specialChars, '\\$1')
}

/**
 * Formats a number as currency with appropriate decimal precision
 * Minimum 2 decimals, maximum 6 decimals
 * @param amount - The amount to format
 * @param decimals - Optional decimal places (2-6)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, decimals?: number): string {
  let precision = decimals || 2

  // Ensure precision is between 2 and 6
  if (precision < 2) precision = 2
  if (precision > 6) precision = 6

  // For very small amounts, use more decimals
  if (amount < 0.01 && amount > 0) {
    precision = 6
  }

  return amount.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
}

/**
 * Formats large numbers with K/M/B suffixes
 * @param num - The number to format
 * @returns Formatted string with suffix
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B'
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M'
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K'
  } else {
    return num.toFixed(2)
  }
}

/**
 * Generates a Solscan transaction link
 * @param txHash - The transaction hash/signature
 * @returns Solscan URL
 */
export function generateTransactionLink(txHash: string): string {
  return `https://solscan.io/tx/${txHash}`
}

/**
 * Generates a DexScreener token link (used for all alerts: whale, cluster, KOL, KOL profile)
 * @param tokenAddress - The token contract address
 * @returns DexScreener token URL
 */
export function generateTokenLink(tokenAddress: string): string {
  return `https://dexscreener.com/solana/${tokenAddress}`
}

/**
 * Shortens a Solana address for display
 * @param address - Full Solana address
 * @param prefixLength - Number of characters to show at start (default 4)
 * @param suffixLength - Number of characters to show at end (default 4)
 * @returns Shortened address like "ABC...XYZ"
 */
export function shortenAddress(
  address: string,
  prefixLength: number = 4,
  suffixLength: number = 4,
): string {
  if (address.length <= prefixLength + suffixLength) {
    return address
  }
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`
}

/**
 * Formats a whale transaction alert message for Telegram
 * @param tx - The whale transaction data
 * @returns Formatted MarkdownV2 message
 */
export function formatWhaleAlert(tx: IWhaleAllTransactionsV2, resolvedTokenSymbol?: string): string {
  // Determine the primary token and amount based on transaction type
  let tokenSymbol: string
  let tokenName: string
  let tokenAddress: string
  let usdAmount: string
  let marketCap: number

  if (tx.type === 'buy') {
    tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenOut.symbol || 'Unknown'
    tokenName = tx.transaction.tokenOut.name || tokenSymbol
    tokenAddress = tx.transaction.tokenOut.address
    usdAmount = tx.transaction.tokenOut.usdAmount || '0'
    marketCap = parseFloat(tx.transaction.tokenOut.marketCap || tx.marketCap?.buyMarketCap || '0')
  } else if (tx.type === 'sell') {
    tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenIn.symbol || 'Unknown'
    tokenName = tx.transaction.tokenIn.name || tokenSymbol
    tokenAddress = tx.transaction.tokenIn.address
    usdAmount = tx.transaction.tokenIn.usdAmount || '0'
    marketCap = parseFloat(tx.transaction.tokenIn.marketCap || tx.marketCap?.sellMarketCap || '0')
  } else {
    // 'both' type - show tokenOut
    tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenOut.symbol || 'Unknown'
    tokenName = tx.transaction.tokenOut.name || tokenSymbol
    tokenAddress = tx.transaction.tokenOut.address
    usdAmount = tx.transaction.tokenOut.usdAmount || '0'
    marketCap = parseFloat(tx.transaction.tokenOut.marketCap || tx.marketCap?.buyMarketCap || '0')
  }

  const usdAmountNum = parseFloat(usdAmount)
  const formattedUSD = formatLargeNumber(usdAmountNum)
  const formattedMCap = formatLargeNumber(marketCap)

  // Get hotness score (remove .0 decimal if it's a whole number)
  const hotnessScoreNum = tx.hotnessScore || 0
  const hotnessScore = hotnessScoreNum % 1 === 0 ? hotnessScoreNum.toFixed(0) : hotnessScoreNum.toFixed(1)

  // Get wallet labels
  const labels = tx.whaleLabel || []
  const labelText = labels.length > 0 ? labels.join(' / ') : 'None'

  // Format timestamp to HH:MM UTC
  const timestamp = tx.timestamp ? new Date(tx.timestamp) : new Date()
  const hours = timestamp.getUTCHours().toString().padStart(2, '0')
  const minutes = timestamp.getUTCMinutes().toString().padStart(2, '0')
  const timeStr = `${hours}:${minutes} UTC`

  const appTxLink = `https://app.alpha-block.ai/transaction/${tx.signature}?type=whale&transaction=buy`
  const tokenLink = generateTokenLink(tokenAddress)

  return `*Whale Buy Alert* 🐋

*Token:* ${escapeMarkdownV2(tokenName)} \\(${escapeMarkdownV2(tokenSymbol)}\\)
*Chain:* Solana
*CA:* \`${tokenAddress}\`
*MCAP:* ${escapeMarkdownV2(formattedMCap)}

💰 *Buy Amount:* ${escapeMarkdownV2(formattedUSD)}
🔥 *Hotness Score:* ${escapeMarkdownV2(hotnessScore)}/10
🏷️ *Wallet Label:* ${escapeMarkdownV2(labelText)}

🕛 *Time:* ${escapeMarkdownV2(timeStr)}

🔗 [View Transaction](${appTxLink}) \\| [View Token](${tokenLink})

_Powered by @AlphaBlockAI_ `
}

/**
 * Formats a cluster alert message for Telegram
 * @param token - Token contract address
 * @param tokenSymbol - Token symbol
 * @param whaleCount - Number of whales in the cluster
 * @param totalVolumeUSD - Total USD volume
 * @param timeWindowMinutes - Time window in minutes
 * @returns Formatted MarkdownV2 message
 */
export function formatClusterAlert(
  token: string,
  tokenSymbol: string,
  whaleCount: number,
  totalVolumeUSD: number,
  timeWindowMinutes: number,
): string {
  const tokenSymbolEscaped = escapeMarkdownV2(tokenSymbol)
  const tokenShort = shortenAddress(token, 4, 4)
  const tokenShortEscaped = escapeMarkdownV2(tokenShort)
  const formattedVolume = `$${formatLargeNumber(totalVolumeUSD)}`
  const tokenLink = generateTokenLink(token)

  return `🚨 *CLUSTER ALERT*

*${whaleCount} Whales* just entered *${tokenSymbolEscaped}* with a total volume of *${escapeMarkdownV2(formattedVolume)}* in the last *${timeWindowMinutes} minutes*\\!

*Token:* \`${tokenShortEscaped}\`

[View on DexScreener](${tokenLink})`
}

/**
 * Formats a KOL (Key Opinion Leader) activity alert message for Telegram
 * @param kol - KOL/Influencer name
 * @param tx - The influencer transaction data
 * @param resolvedTokenSymbol - Optional resolved token symbol (overrides tx data)
 * @param kolUsername - Optional KOL Twitter/X username for profile link
 * @returns Formatted MarkdownV2 message
 */
export function formatKOLAlert(
  kol: string,
  tx: IInfluencerWhaleTransactionsV2 | IWhaleAllTransactionsV2,
  resolvedTokenSymbol?: string,
  kolUsername?: string,
): string {
  // Determine the primary token and amount based on transaction type
  let tokenSymbol: string
  let tokenName: string
  let tokenAddress: string
  let usdAmount: string
  let marketCap: number

  if (tx.type === 'buy') {
    tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenOut.symbol || 'Unknown'
    tokenName = tx.transaction.tokenOut.name || tokenSymbol
    tokenAddress = tx.transaction.tokenOut.address
    usdAmount = tx.transaction.tokenOut.usdAmount || '0'
    marketCap = parseFloat(tx.transaction.tokenOut.marketCap || tx.marketCap?.buyMarketCap || '0')
  } else if (tx.type === 'sell') {
    tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenIn.symbol || 'Unknown'
    tokenName = tx.transaction.tokenIn.name || tokenSymbol
    tokenAddress = tx.transaction.tokenIn.address
    usdAmount = tx.transaction.tokenIn.usdAmount || '0'
    marketCap = parseFloat(tx.transaction.tokenIn.marketCap || tx.marketCap?.sellMarketCap || '0')
  } else {
    // 'both' type - show tokenOut
    tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenOut.symbol || 'Unknown'
    tokenName = tx.transaction.tokenOut.name || tokenSymbol
    tokenAddress = tx.transaction.tokenOut.address
    usdAmount = tx.transaction.tokenOut.usdAmount || '0'
    marketCap = parseFloat(tx.transaction.tokenOut.marketCap || tx.marketCap?.buyMarketCap || '0')
  }

  const usdAmountNum = parseFloat(usdAmount)
  const formattedUSD = formatLargeNumber(usdAmountNum)
  const formattedMCap = formatLargeNumber(marketCap)

  // KOL Activity alerts are only sent for buy transactions (sell is skipped in matcher)
  const xLink = kolUsername ? `https://x.com/${kolUsername}` : null
  const kolDisplay = xLink
    ? `[${escapeMarkdownV2(kol)}](${xLink})`
    : escapeMarkdownV2(kol)

  const hotnessScoreNum = Number((tx as any).hotnessScore) || 0
  const hotnessScore =
    hotnessScoreNum % 1 === 0 ? hotnessScoreNum.toFixed(0) : hotnessScoreNum.toFixed(1)
  const timestamp = tx.timestamp ? new Date(tx.timestamp) : new Date()
  const timeStr = `${timestamp.getUTCHours().toString().padStart(2, '0')}:${timestamp.getUTCMinutes().toString().padStart(2, '0')} UTC`

  const appTxLink = `https://app.alpha-block.ai/transaction/${tx.signature}?type=kol&transaction=buy`
  const tokenLink = generateTokenLink(tokenAddress)

  return `*KOL Buy Alert* 👤

*KOL:* ${kolDisplay}

*Token:* ${escapeMarkdownV2(tokenName)} \\(${escapeMarkdownV2(tokenSymbol)}\\)
*Chain:* Solana
*CA:* \`${escapeMarkdownV2(tokenAddress)}\`
*MCAP:* $${escapeMarkdownV2(formattedMCap)}

💰 *Buy Amount:* $${escapeMarkdownV2(formattedUSD)}
🔥 *Hotness Score:* ${escapeMarkdownV2(hotnessScore)}

*Transaction Time:* ${escapeMarkdownV2(timeStr)}

🔗 [View Transaction](${appTxLink}) \\| [View Token](${tokenLink})
`
}

/**
 * Format KOL Profile Alert message for Telegram
 * Similar to KOL Alert but specifically for subscribed KOL profiles
 * 
 * @param kolName - The KOL's display name
 * @param tx - The influencer transaction data
 * @param resolvedTokenSymbol - Optional resolved token symbol
 * @param kolUsername - Optional KOL Twitter/X username
 * @returns Formatted MarkdownV2 message
 */
export function formatKOLProfileAlert(
  kolName: string,
  tx: IInfluencerWhaleTransactionsV2,
  resolvedTokenSymbol?: string,
  kolUsername?: string,
): string {
  // Determine the primary token and amount based on transaction type
  let tokenSymbol: string
  let tokenName: string
  let tokenAddress: string
  let usdAmount: string
  let marketCap: number
  // KOL Profile alerts are only sent for buy transactions (sell is skipped in matcher)
  tokenSymbol = resolvedTokenSymbol || tx.transaction.tokenOut.symbol || 'Unknown'
  tokenName = tx.transaction.tokenOut.name || tokenSymbol
  tokenAddress = tx.transaction.tokenOut.address
  usdAmount = tx.transaction.tokenOut.usdAmount || '0'
  marketCap = parseFloat(tx.transaction.tokenOut.marketCap || tx.marketCap?.buyMarketCap || '0')

  const usdAmountNum = parseFloat(usdAmount)
  const formattedUSD = formatLargeNumber(usdAmountNum)
  const formattedMCap = formatLargeNumber(marketCap)

  // Get hotness score
  const hotnessScoreNum = tx.hotnessScore || 0
  const hotnessScore = hotnessScoreNum % 1 === 0 ? hotnessScoreNum.toFixed(0) : hotnessScoreNum.toFixed(1)

  // Format timestamp
  const timestamp = tx.timestamp ? new Date(tx.timestamp) : new Date()
  const hours = timestamp.getUTCHours().toString().padStart(2, '0')
  const minutes = timestamp.getUTCMinutes().toString().padStart(2, '0')
  const timeStr = `${hours}:${minutes} UTC`

  // Generate X/Twitter profile link
  const xLink = kolUsername ? `https://x.com/${kolUsername}` : null
  const kolDisplay = xLink
    ? `[${escapeMarkdownV2(kolName)}](${xLink})`
    : escapeMarkdownV2(kolName)

  const appTxLink = `https://app.alpha-block.ai/transaction/${tx.signature}?type=kol&transaction=buy`
  const tokenLink = generateTokenLink(tokenAddress)

  return `🎯 *KOL Profile Buy Alert*

👤 *KOL:* ${kolDisplay}

🪙 *Token:* ${escapeMarkdownV2(tokenName)} \\(${escapeMarkdownV2(tokenSymbol)}\\)
⛓️ *Chain:* Solana
📝 *CA:* \`${escapeMarkdownV2(tokenAddress)}\`
💰 *MCAP:* $${escapeMarkdownV2(formattedMCap)}

💵 *Buy Amount:* $${escapeMarkdownV2(formattedUSD)}
🔥 *Hotness Score:* ${escapeMarkdownV2(hotnessScore)}/10

⏰ *Transaction Time:* ${escapeMarkdownV2(timeStr)}

🔗 [View Transaction](${appTxLink}) \\| 🪙 [View Token](${tokenLink})

_Powered by @AlphaBlockAI_ `
}

/**
 * Whale transaction data for alert formatting
 */
export interface WhaleTransactionData {
  txHash: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  buyAmountUSD: number
  hotnessScore: number
  walletAddress: string
  walletLabels: string[]
  timestamp: number
}

/**
 * Generates a Quick Buy deep link for the AlphaBlock swap interface
 * @param tokenAddress - The token contract address
 * @returns Quick Buy URL
 */
export function generateQuickBuyLink(tokenAddress: string): string {
  return `https://alphablock.ai/swap?token=${tokenAddress}`
}

/**
 * Formats a whale buy alert message for Telegram with hotness score and wallet labels
 * This is specifically for the ALPHA_STREAM whale alert system
 * @param tx - The whale transaction data
 * @returns Formatted MarkdownV2 message
 */
export function formatWhaleAlertMessage(tx: WhaleTransactionData): string {
  try {
    // Plain text formatting (no MarkdownV2 escaping)
    const formattedBuyAmount = `$${formatLargeNumber(tx.buyAmountUSD)}`
    const hotnessScoreFormatted =
      tx.hotnessScore % 1 === 0
        ? tx.hotnessScore.toFixed(0)
        : tx.hotnessScore.toFixed(1)
    const walletLabelsText =
      tx.walletLabels.length > 0 ? tx.walletLabels.join(' / ') : 'Unknown'

    const date = new Date(tx.timestamp)
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const timeFormatted = `${hours}:${minutes} UTC`

    const txLink = `https://app.alpha-block.ai/transaction/${tx.txHash}`
    const tokenLink = generateTokenLink(tx.tokenAddress)

    return `🐋 Whale Buy Alert

Token: ${tx.tokenName} (${tx.tokenSymbol})
Chain: Solana
CA: ${tx.tokenAddress}

Buy Amount: ${formattedBuyAmount}
Hotness Score: ${hotnessScoreFormatted}/10
Wallet Label: ${walletLabelsText}
Transaction Time: ${timeFormatted}

Transaction Detail: ${txLink}
View Token: ${tokenLink}`
  } catch (error) {
    const formattedBuyAmount = `$${formatLargeNumber(tx.buyAmountUSD)}`
    const hotnessScoreFormatted =
      tx.hotnessScore % 1 === 0
        ? tx.hotnessScore.toFixed(0)
        : tx.hotnessScore.toFixed(1)
    const walletLabelsText =
      tx.walletLabels.length > 0 ? tx.walletLabels.join(' / ') : 'Unknown'

    const date = new Date(tx.timestamp)
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const timeFormatted = `${hours}:${minutes} UTC`

    const txLink = `https://app.alpha-block.ai/transaction/${tx.txHash}`
    const tokenLink = generateTokenLink(tx.tokenAddress)

    return `🐋 Whale Buy Alert

Token: ${tx.tokenName} (${tx.tokenSymbol})
Chain: Solana
CA: ${tx.tokenAddress}

Buy Amount: ${formattedBuyAmount}
Hotness Score: ${hotnessScoreFormatted}/10
Wallet Label: ${walletLabelsText}
Transaction Time: ${timeFormatted}

Transaction Detail: ${txLink}
View Token: ${tokenLink}`
  }
}
