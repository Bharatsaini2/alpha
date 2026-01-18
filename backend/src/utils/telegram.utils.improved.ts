import { IWhaleAllTransactionsV2 } from '../models/whaleAllTransactionsV2.model'
import { IInfluencerWhaleTransactionsV2 } from '../models/influencerWhaleTransactionsV2.model'

/**
 * Escapes special characters for Telegram MarkdownV2 format
 * Required characters: _ * [ ] ( ) ~ > # + - = | { } . !
 * @param text - The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdownV2(text: string): string {
  const specialChars = /([_*\[\]()~>#+=|{}.!-])/g
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
 * IMPROVED: Formats a whale transaction alert message for Telegram with clear swap details
 * @param tx - The whale transaction data
 * @returns Formatted MarkdownV2 message
 */
export function formatWhaleAlert(tx: IWhaleAllTransactionsV2, resolvedTokenSymbol?: string): string {
  const walletShort = shortenAddress(tx.whale.address)
  const walletEscaped = escapeMarkdownV2(walletShort)
  
  // Get token details for both sides of the swap
  const tokenInSymbol = tx.transaction.tokenIn.symbol || 'Unknown'
  const tokenOutSymbol = resolvedTokenSymbol || tx.transaction.tokenOut.symbol || 'Unknown'
  const tokenInAmount = parseFloat(tx.transaction.tokenIn.amount || '0')
  const tokenOutAmount = parseFloat(tx.transaction.tokenOut.amount || '0')
  const usdAmount = parseFloat(tx.transaction.tokenOut.usdAmount || '0')
  
  // Determine transaction type and format accordingly
  let transactionType: string
  let primaryToken: string
  let swapDescription: string
  
  if (tx.type === 'buy') {
    transactionType = 'BUY'
    primaryToken = tokenOutSymbol
    swapDescription = `${formatCurrency(tokenInAmount)} ${tokenInSymbol} → ${formatCurrency(tokenOutAmount)} ${tokenOutSymbol}`
  } else if (tx.type === 'sell') {
    transactionType = 'SELL'
    primaryToken = tokenInSymbol
    swapDescription = `${formatCurrency(tokenInAmount)} ${tokenInSymbol} → ${formatCurrency(tokenOutAmount)} ${tokenOutSymbol}`
  } else {
    transactionType = 'SWAP'
    primaryToken = tokenOutSymbol
    swapDescription = `${formatCurrency(tokenInAmount)} ${tokenInSymbol} → ${formatCurrency(tokenOutAmount)} ${tokenOutSymbol}`
  }
  
  const tokenEscaped = escapeMarkdownV2(primaryToken)
  const formattedUSD = formatLargeNumber(usdAmount)
  const swapEscaped = escapeMarkdownV2(swapDescription)
  
  // Generate links
  const solscanLink = generateTransactionLink(tx.signature)
  const websiteLink = `https://alpha-block.ai/transaction/${tx.signature}?type=whale&transaction=${tx.type}`
  
  // Add wallet labels if available
  const walletLabels = tx.whale.labels && tx.whale.labels.length > 0 
    ? tx.whale.labels.join(', ') 
    : 'Unlabeled'
  const labelsEscaped = escapeMarkdownV2(walletLabels)
  
  // Add hotness score if available
  const hotnessScore = tx.hotnessScore ? tx.hotnessScore.toFixed(1) : 'N/A'
  const hotnessEscaped = escapeMarkdownV2(hotnessScore)
  
  return `🐋 *Whale ${transactionType} Alert*

*Wallet:* \`${walletEscaped}\` \\(${labelsEscaped}\\)
*Token:* *${tokenEscaped}*
*Swap:* ${swapEscaped}
*USD Value:* *$${escapeMarkdownV2(formattedUSD)}*
*Hotness:* ${hotnessEscaped}/10

[📊 View Details](${websiteLink})
[🔍 Solscan](${solscanLink})`
}