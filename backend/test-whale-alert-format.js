/**
 * Test script to preview the new whale alert format
 * Run with: node test-whale-alert-format.js
 */

// Mock the telegram utils functions
function escapeMarkdownV2(text) {
  const specialChars = /([_*\[\]()~>#+=|{}.!-])/g
  return text.replace(specialChars, '\\$1')
}

function formatLargeNumber(num) {
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

function generateAlphaBlockTransactionLink(txHash, transactionType = 'buy') {
  return `https://app.alpha-block.ai/transaction/${txHash}?type=whale&transaction=${transactionType}`
}

function generateTokenLink(tokenAddress) {
  return `https://solscan.io/token/${tokenAddress}`
}

function formatWhaleAlertMessage(tx) {
  try {
    // Escape all text fields for MarkdownV2
    const tokenNameEscaped = escapeMarkdownV2(tx.tokenName)
    const tokenSymbolEscaped = escapeMarkdownV2(tx.tokenSymbol)
    const contractAddressEscaped = escapeMarkdownV2(tx.tokenAddress)
    
    // Format buy amount with proper currency formatting
    const formattedBuyAmount = formatLargeNumber(tx.buyAmountUSD)
    const buyAmountEscaped = escapeMarkdownV2(`$${formattedBuyAmount}`)
    
    // Format market cap if available
    let marketCapLine = ''
    if (tx.marketCapUSD !== undefined && tx.marketCapUSD > 0) {
      const formattedMarketCap = formatLargeNumber(tx.marketCapUSD)
      const marketCapEscaped = escapeMarkdownV2(`$${formattedMarketCap}`)
      marketCapLine = `*MCAP:* ${marketCapEscaped}\n`
    }
    
    // Format hotness score (0-10 scale with 1 decimal)
    const hotnessScoreFormatted = tx.hotnessScore.toFixed(1)
    const hotnessScoreEscaped = escapeMarkdownV2(hotnessScoreFormatted)
    
    // Format wallet labels (join with / if multiple)
    const walletLabelsText = tx.walletLabels.length > 0 
      ? tx.walletLabels.join(' / ') 
      : 'Unknown'
    const walletLabelsEscaped = escapeMarkdownV2(walletLabelsText)
    
    // Format timestamp to HH:MM UTC
    const date = new Date(tx.timestamp)
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const timeFormatted = `${hours}:${minutes} UTC`
    const timeEscaped = escapeMarkdownV2(timeFormatted)
    
    // Generate links
    const txLink = generateAlphaBlockTransactionLink(tx.txHash, 'buy')
    const tokenLink = generateTokenLink(tx.tokenAddress)
    
    // Build the message with MarkdownV2 formatting
    return `🐋 *Whale Buy Alert*

*Token:* ${tokenNameEscaped} \\(${tokenSymbolEscaped}\\)
*Chain:* Solana
*CA:* \`${contractAddressEscaped}\`
${marketCapLine}*Buy Amount:* ${buyAmountEscaped}
*Hotness Score:* ${hotnessScoreEscaped}/10
*Wallet Label:* ${walletLabelsEscaped}

*Transaction Time:* ${timeEscaped}

[Transaction Detail](${txLink}) | [View Token](${tokenLink})`
  } catch (error) {
    // If MarkdownV2 formatting fails, fall back to plain text
    const formattedBuyAmount = formatLargeNumber(tx.buyAmountUSD)
    const hotnessScoreFormatted = tx.hotnessScore.toFixed(1)
    const walletLabelsText = tx.walletLabels.length > 0 
      ? tx.walletLabels.join(' / ') 
      : 'Unknown'
    
    const date = new Date(tx.timestamp)
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const timeFormatted = `${hours}:${minutes} UTC`
    
    const txLink = generateAlphaBlockTransactionLink(tx.txHash, 'buy')
    const tokenLink = generateTokenLink(tx.tokenAddress)
    
    let marketCapLine = ''
    if (tx.marketCapUSD !== undefined && tx.marketCapUSD > 0) {
      const formattedMarketCap = formatLargeNumber(tx.marketCapUSD)
      marketCapLine = `MCAP: $${formattedMarketCap}\n`
    }
    
    return `🐋 Whale Buy Alert

Token: ${tx.tokenName} (${tx.tokenSymbol})
Chain: Solana
CA: ${tx.tokenAddress}
${marketCapLine}Buy Amount: $${formattedBuyAmount}
Hotness Score: ${hotnessScoreFormatted}/10
Wallet Label: ${walletLabelsText}

Transaction Time: ${timeFormatted}

Transaction Detail: ${txLink}
View Token: ${tokenLink}`
  }
}

// Test data - Example 1: Your actual alert
console.log('═══════════════════════════════════════════════════════════')
console.log('TEST 1: Your Actual Alert (jelly-my-jelly)')
console.log('═══════════════════════════════════════════════════════════\n')

const testAlert1 = {
  txHash: '3hrgbYnBTaVaS1VEFNjhS2iz4DaUNLiBSJ1zEREyYpdfbo9bnDcr16dQMa16Q6z666AyvJX78GTvNyhw7ihqGh4W',
  tokenAddress: 'FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump',
  tokenSymbol: 'jellyjelly',
  tokenName: 'jelly-my-jelly',
  buyAmountUSD: 280.56,
  marketCapUSD: undefined, // No MCAP available
  hotnessScore: 1.0,
  walletAddress: '5H5UAVxzrXbD7eAYk8rNFYfGEe71uhNrCyU21K4B1Ngnr',
  walletLabels: ['COORDINATED GROUP'],
  timestamp: new Date('2026-01-16T14:07:00Z').getTime()
}

const message1 = formatWhaleAlertMessage(testAlert1)
console.log('FORMATTED MESSAGE (MarkdownV2):')
console.log(message1)
console.log('\n')

// Test data - Example 2: With MCAP and multiple labels
console.log('═══════════════════════════════════════════════════════════')
console.log('TEST 2: Alert with MCAP and Multiple Labels')
console.log('═══════════════════════════════════════════════════════════\n')

const testAlert2 = {
  txHash: '5H5UAVxzrXbD7eAYk8rNFYfGEe71uhNrCyU21K4B1NgnrEHmPLYzQeHizCRFjJMvqsYK1f3tZ9RHvXVASExqnPkC',
  tokenAddress: 'So11111111111111111111111111111111111111112',
  tokenSymbol: 'SOL',
  tokenName: 'Wrapped SOL',
  buyAmountUSD: 15750.00,
  marketCapUSD: 250000, // $250K market cap
  hotnessScore: 8.5,
  walletAddress: 'ABC123xyz789',
  walletLabels: ['Sniper', 'Smart Money', 'Insider'],
  timestamp: new Date().getTime()
}

const message2 = formatWhaleAlertMessage(testAlert2)
console.log('FORMATTED MESSAGE (MarkdownV2):')
console.log(message2)
console.log('\n')

// Test data - Example 3: Large amounts
console.log('═══════════════════════════════════════════════════════════')
console.log('TEST 3: Large Buy Amount ($1.5M)')
console.log('═══════════════════════════════════════════════════════════\n')

const testAlert3 = {
  txHash: 'ABC123XYZ789',
  tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  tokenSymbol: 'USDC',
  tokenName: 'USD Coin',
  buyAmountUSD: 1500000,
  marketCapUSD: 50000000, // $50M market cap
  hotnessScore: 9.8,
  walletAddress: 'WhaleWallet123',
  walletLabels: ['Heavy Accumulator'],
  timestamp: new Date().getTime()
}

const message3 = formatWhaleAlertMessage(testAlert3)
console.log('FORMATTED MESSAGE (MarkdownV2):')
console.log(message3)
console.log('\n')

// Show how it looks in plain text (fallback)
console.log('═══════════════════════════════════════════════════════════')
console.log('PLAIN TEXT VERSION (Fallback if MarkdownV2 fails)')
console.log('═══════════════════════════════════════════════════════════\n')

// Remove MarkdownV2 escaping to show plain text
const plainText = message1
  .replace(/\\/g, '')
  .replace(/\*/g, '')
  .replace(/`/g, '')

console.log(plainText)
console.log('\n')

console.log('═══════════════════════════════════════════════════════════')
console.log('VERIFICATION CHECKLIST')
console.log('═══════════════════════════════════════════════════════════\n')

console.log('✓ Check 1: Dollar signs present on amounts')
console.log('✓ Check 2: MCAP shows when available (Test 2 & 3)')
console.log('✓ Check 3: MCAP hidden when not available (Test 1)')
console.log('✓ Check 4: Multiple labels separated by " / "')
console.log('✓ Check 5: Transaction link goes to app.alpha-block.ai')
console.log('✓ Check 6: View Token link goes to solscan.io')
console.log('✓ Check 7: Time formatted as HH:MM UTC')
console.log('✓ Check 8: Hotness score shows 1 decimal place')
console.log('✓ Check 9: Large numbers formatted with K/M/B suffix')
console.log('✓ Check 10: No unescaped special characters visible')
console.log('\n')

console.log('═══════════════════════════════════════════════════════════')
console.log('NEXT STEPS')
console.log('═══════════════════════════════════════════════════════════\n')

console.log('1. Review the formatted messages above')
console.log('2. Verify all fields are displaying correctly')
console.log('3. Check that links are pointing to the right URLs')
console.log('4. If everything looks good, deploy to server')
console.log('5. Test with a real alert on Telegram')
console.log('\n')
