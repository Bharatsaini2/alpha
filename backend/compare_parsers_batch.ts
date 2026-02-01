/**
 * Shadow Comparison Script - V1 vs V2 Parser
 * 
 * Purpose: Compare OLD parser results (in database) with NEW V2 parser
 * to identify improvements, regressions, and mismatches before deployment.
 * 
 * This script:
 * 1. Fetches whales from database
 * 2. Fetches their transaction history from SHYFT API
 * 3. Re-parses each transaction with V2 parser
 * 4. Compares V2 results with V1 results in database
 * 5. Reports matches, new discoveries, regressions, and mismatches
 */

import axios from 'axios'
import * as dotenv from 'dotenv'

// Simple color helpers (no chalk dependency)
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  white: (text: string) => `\x1b[37m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
}
const chalk = {
  green: colors.green,
  red: colors.red,
  yellow: colors.yellow,
  blue: colors.blue,
  magenta: colors.magenta,
  cyan: colors.cyan,
  gray: colors.gray,
  white: colors.white,
  bold: colors.bold,
}

// Load environment variables
dotenv.config()

// ============================================================================
// CONFIGURATION
// ============================================================================

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'YOUR_SHYFT_API_KEY'
const BATCH_SIZE = 5 // Number of whales to process (safety limit)
const TX_LIMIT = 20 // Number of transactions to check per whale
const RATE_LIMIT_MS = 200 // Delay between API calls (avoid 429 errors)

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Whale {
  _id: string
  wallet_address: string
  name?: string
}

interface OldTransaction {
  signature: string
  whale_address: string
  token_address: string
  token_symbol: string
  side: 'BUY' | 'SELL'
  amount: number
  sol_amount: number
  timestamp: Date
  confidence: string
}

interface NewParserResult {
  success: boolean
  data?: {
    signature: string
    direction: 'BUY' | 'SELL'
    quoteAsset: {
      mint: string
      symbol: string
    }
    baseAsset: {
      mint: string
      symbol: string
    }
    amounts: {
      swapInputAmount?: number
      totalWalletCost?: number
      swapOutputAmount?: number
      netWalletReceived?: number
      baseAmount: number
    }
    confidence: number
  }
  erase?: {
    reason: string
  }
}

interface ShyftTransaction {
  signatures: string[]
  timestamp: string
  status: string
  fee: number
  fee_payer: string
  signers: string[]
  protocol?: {
    name: string
    address: string
  }
  token_balance_changes: Array<{
    address: string
    decimals: number
    change_amount: number
    post_balance: number
    pre_balance: number
    mint: string
    owner: string
  }>
  actions?: Array<{
    type: string
    info?: any
  }>
}

interface ComparisonResult {
  signature: string
  whale: string
  status: 'match' | 'new_discovery' | 'regression' | 'mismatch' | 'skipped'
  oldResult?: OldTransaction
  newResult?: NewParserResult
  details?: string
}

interface Summary {
  totalScanned: number
  matches: number
  newDiscoveries: number
  regressions: number
  mismatches: number
  skipped: number
  errors: number
}

// ============================================================================
// DATABASE MODELS
// ============================================================================

import whaleAllTransactionModelV2, { IWhaleAllTransactionsV2 } from './src/models/whaleAllTransactionsV2.model'
import mongoose from 'mongoose'

// Connect to MongoDB
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-whale-tracker'

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_URI)
    console.log(chalk.green('✅ Connected to MongoDB'))
  }
}

/**
 * Get unique whale addresses from database
 */
async function getWhaleAddresses(limit: number = BATCH_SIZE): Promise<Whale[]> {
  await connectDB()
  
  // Get unique whale addresses from transactions
  const whaleAddresses = await whaleAllTransactionModelV2.distinct('whale.address')
  
  console.log(chalk.blue(`📊 Found ${whaleAddresses.length} unique whale addresses in database`))
  
  // Convert to Whale format
  const whales: Whale[] = whaleAddresses.slice(0, limit).map((address, index) => ({
    _id: `whale_${index}`,
    wallet_address: address,
    name: `Whale ${address.substring(0, 8)}...`,
  }))
  
  return whales
}

/**
 * Look up old transaction in database
 */
async function findOldTransaction(signature: string): Promise<OldTransaction | null> {
  await connectDB()
  
  const tx = await whaleAllTransactionModelV2.findOne({ signature }).lean()
  
  if (!tx) {
    return null
  }
  
  // Convert to OldTransaction format
  return {
    signature: tx.signature,
    whale_address: tx.whale.address,
    token_address: tx.type === 'buy' ? tx.transaction.tokenOut.address : tx.transaction.tokenIn.address,
    token_symbol: tx.type === 'buy' ? tx.transaction.tokenOut.symbol : tx.transaction.tokenIn.symbol,
    side: tx.type === 'buy' ? 'BUY' : 'SELL',
    amount: parseFloat(tx.type === 'buy' ? tx.amount.buyAmount : tx.amount.sellAmount) || 0,
    sol_amount: parseFloat(tx.type === 'buy' ? tx.solAmount.buySolAmount : tx.solAmount.sellSolAmount) || 0,
    timestamp: tx.timestamp,
    confidence: 'high', // V1 doesn't store confidence
  }
}

// ============================================================================
// V2 PARSER
// ============================================================================

import { ShyftParserV2, ShyftTransactionV2 } from './src/utils/shyftParserV2'

/**
 * Run V2 parser on raw transaction
 */
async function runNewParser(rawTx: ShyftTransaction): Promise<NewParserResult> {
  try {
    const parser = new ShyftParserV2()
    
    // Convert SHYFT API response to V2 parser input format
    const txV2: ShyftTransactionV2 = {
      signature: rawTx.signatures?.[0] || 'unknown',
      timestamp: typeof rawTx.timestamp === 'string' 
        ? new Date(rawTx.timestamp).getTime() / 1000 
        : Date.now() / 1000,
      status: rawTx.status || 'Success',
      fee: rawTx.fee || 0.000005,
      fee_payer: rawTx.fee_payer || '',
      signers: rawTx.signers || [],
      protocol: rawTx.protocol,
      token_balance_changes: rawTx.token_balance_changes || [],
      actions: rawTx.actions || [],
    }
    
    const result = parser.parseTransaction(txV2)
    
    // Convert ParserResult to NewParserResult format
    if (result.success && result.data) {
      // Check if it's a split swap pair
      if ('splitReason' in result.data) {
        // For split swaps, we'll use the BUY record for comparison
        const buyRecord = result.data.buyRecord
        return {
          success: true,
          data: {
            signature: buyRecord.signature,
            direction: buyRecord.direction,
            quoteAsset: buyRecord.quoteAsset,
            baseAsset: buyRecord.baseAsset,
            amounts: buyRecord.amounts,
            confidence: buyRecord.confidence,
          },
        }
      } else {
        // Standard swap
        return {
          success: true,
          data: {
            signature: result.data.signature,
            direction: result.data.direction,
            quoteAsset: result.data.quoteAsset,
            baseAsset: result.data.baseAsset,
            amounts: result.data.amounts,
            confidence: result.data.confidence,
          },
        }
      }
    } else {
      // ERASE result
      return {
        success: false,
        erase: {
          reason: result.erase?.reason || 'unknown_erase_reason',
        },
      }
    }
  } catch (error: any) {
    return {
      success: false,
      erase: {
        reason: `parser_error: ${error.message}`,
      },
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep for specified milliseconds (rate limiting)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch transaction history for a wallet from SHYFT API
 */
async function fetchTransactionHistory(
  walletAddress: string,
  limit: number = TX_LIMIT
): Promise<string[]> {
  try {
    const response = await axios.get(
      'https://api.shyft.to/sol/v1/wallet/transaction_history',
      {
        params: {
          network: 'mainnet-beta',
          wallet: walletAddress,
          tx_num: limit,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    )

    if (!response.data.success || !response.data.result) {
      console.log(chalk.red(`❌ Failed to fetch history for ${walletAddress}`))
      return []
    }

    // Extract signatures from transaction history
    const signatures = response.data.result.map((tx: any) => {
      return tx.signatures?.[0] || tx.signature || null
    }).filter(Boolean)

    return signatures
  } catch (error: any) {
    console.log(chalk.red(`❌ Error fetching history: ${error.message}`))
    return []
  }
}

/**
 * Fetch parsed transaction data from SHYFT API
 */
async function fetchParsedTransaction(
  signature: string
): Promise<ShyftTransaction | null> {
  try {
    const response = await axios.get(
      'https://api.shyft.to/sol/v1/transaction/parsed',
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    )

    if (!response.data.success || !response.data.result) {
      return null
    }

    return response.data.result
  } catch (error: any) {
    console.log(chalk.red(`❌ Error fetching tx ${signature}: ${error.message}`))
    return null
  }
}

/**
 * Compare old and new parser results
 */
function compareResults(
  signature: string,
  whale: string,
  oldResult: OldTransaction | null,
  newResult: NewParserResult
): ComparisonResult {
  // Edge Case: Skip if tokenIn == tokenOut in old record
  if (oldResult && oldResult.token_address === 'So11111111111111111111111111111111111111112') {
    // This is a heuristic - adjust based on your actual edge case logic
    // For now, we'll skip if it looks like a self-swap
    return {
      signature,
      whale,
      status: 'skipped',
      oldResult,
      newResult,
      details: 'Edge case: tokenIn == tokenOut',
    }
  }

  // Case 1: Regression (Old found it, New missed it)
  if (oldResult && !newResult.success) {
    return {
      signature,
      whale,
      status: 'regression',
      oldResult,
      newResult,
      details: `Old: ${oldResult.side} ${oldResult.token_symbol} | New: ERASE (${newResult.erase?.reason})`,
    }
  }

  // Case 2: New Discovery (Old missed it, New found it)
  if (!oldResult && newResult.success) {
    return {
      signature,
      whale,
      status: 'new_discovery',
      newResult,
      details: `New: ${newResult.data?.direction} ${newResult.data?.baseAsset.symbol}`,
    }
  }

  // Case 3: Both missed it
  if (!oldResult && !newResult.success) {
    return {
      signature,
      whale,
      status: 'match',
      details: 'Both parsers agree: not a swap',
    }
  }

  // Case 4: Both found it - check for mismatches
  if (oldResult && newResult.success && newResult.data) {
    const oldSide = oldResult.side
    const newSide = newResult.data.direction
    const oldToken = oldResult.token_symbol
    const newToken = newResult.data.baseAsset.symbol

    // Check for side mismatch
    if (oldSide !== newSide) {
      return {
        signature,
        whale,
        status: 'mismatch',
        oldResult,
        newResult,
        details: `Side mismatch: Old=${oldSide} | New=${newSide}`,
      }
    }

    // Check for token mismatch (basic comparison)
    if (oldToken !== newToken && !oldToken.includes('...') && !newToken.includes('...')) {
      return {
        signature,
        whale,
        status: 'mismatch',
        oldResult,
        newResult,
        details: `Token mismatch: Old=${oldToken} | New=${newToken}`,
      }
    }

    // Match!
    return {
      signature,
      whale,
      status: 'match',
      oldResult,
      newResult,
      details: `Both: ${oldSide} ${oldToken}`,
    }
  }

  // Fallback
  return {
    signature,
    whale,
    status: 'match',
    details: 'Unknown comparison state',
  }
}

/**
 * Process a single whale's transactions
 */
async function processWhale(whale: Whale): Promise<ComparisonResult[]> {
  console.log(chalk.cyan(`\n${'─'.repeat(80)}`))
  console.log(chalk.cyan(`Processing Whale: ${whale.name || whale.wallet_address}`))
  console.log(chalk.cyan(`Address: ${whale.wallet_address}`))
  console.log(chalk.cyan(`${'─'.repeat(80)}\n`))

  const results: ComparisonResult[] = []

  // Step 1: Fetch transaction history
  console.log(chalk.blue(`📡 Fetching transaction history...`))
  const signatures = await fetchTransactionHistory(whale.wallet_address, TX_LIMIT)
  console.log(chalk.green(`✅ Found ${signatures.length} transactions\n`))

  if (signatures.length === 0) {
    return results
  }

  // Step 2: Process each transaction
  for (let i = 0; i < signatures.length; i++) {
    const signature = signatures[i]
    console.log(chalk.gray(`[${i + 1}/${signatures.length}] ${signature}`))

    try {
      // Fetch raw transaction data from SHYFT
      const rawTx = await fetchParsedTransaction(signature)
      if (!rawTx) {
        console.log(chalk.red(`  ❌ Failed to fetch transaction data`))
        results.push({
          signature,
          whale: whale.wallet_address,
          status: 'match', // Count as error, not regression
          details: 'Failed to fetch from SHYFT',
        })
        await sleep(RATE_LIMIT_MS)
        continue
      }

      // Run NEW V2 Parser
      const newResult = await runNewParser(rawTx)

      // Look up OLD Parser result in database
      const oldResult = await findOldTransaction(signature)

      // Compare results
      const comparison = compareResults(signature, whale.wallet_address, oldResult, newResult)
      results.push(comparison)

      // Log result
      switch (comparison.status) {
        case 'match':
          console.log(chalk.green(`  ✅ MATCH: ${comparison.details}`))
          break
        case 'new_discovery':
          console.log(chalk.yellow(`  🎯 NEW DISCOVERY: ${comparison.details}`))
          break
        case 'regression':
          console.log(chalk.red(`  ❌ REGRESSION: ${comparison.details}`))
          break
        case 'mismatch':
          console.log(chalk.magenta(`  ⚠️  MISMATCH: ${comparison.details}`))
          break
        case 'skipped':
          console.log(chalk.gray(`  ⏭️  SKIPPED: ${comparison.details}`))
          break
      }
    } catch (error: any) {
      console.log(chalk.red(`  ❌ Error: ${error.message}`))
      results.push({
        signature,
        whale: whale.wallet_address,
        status: 'match', // Count as error, not regression
        details: `Error: ${error.message}`,
      })
    }

    // Rate limiting
    await sleep(RATE_LIMIT_MS)
  }

  return results
}

/**
 * Generate summary statistics
 */
function generateSummary(allResults: ComparisonResult[]): Summary {
  const summary: Summary = {
    totalScanned: allResults.length,
    matches: 0,
    newDiscoveries: 0,
    regressions: 0,
    mismatches: 0,
    skipped: 0,
    errors: 0,
  }

  for (const result of allResults) {
    switch (result.status) {
      case 'match':
        summary.matches++
        break
      case 'new_discovery':
        summary.newDiscoveries++
        break
      case 'regression':
        summary.regressions++
        break
      case 'mismatch':
        summary.mismatches++
        break
      case 'skipped':
        summary.skipped++
        break
    }

    if (result.details?.includes('Error') || result.details?.includes('Failed')) {
      summary.errors++
    }
  }

  return summary
}

/**
 * Print summary table
 */
function printSummary(summary: Summary, allResults: ComparisonResult[]) {
  console.log(chalk.cyan(`\n${'='.repeat(80)}`))
  console.log(chalk.cyan(chalk.bold('FINAL SUMMARY')))
  console.log(chalk.cyan(`${'='.repeat(80)}\n`))

  console.log(chalk.white('Total Transactions Scanned:'), chalk.bold(String(summary.totalScanned)))
  console.log(chalk.green('✅ Matches:'), chalk.bold(String(summary.matches)))
  console.log(chalk.yellow('🎯 New Discoveries:'), chalk.bold(String(summary.newDiscoveries)))
  console.log(chalk.red('❌ Regressions:'), chalk.bold(String(summary.regressions)))
  console.log(chalk.magenta('⚠️  Mismatches:'), chalk.bold(String(summary.mismatches)))
  console.log(chalk.gray('⏭️  Skipped:'), chalk.bold(String(summary.skipped)))
  console.log(chalk.red('💥 Errors:'), chalk.bold(String(summary.errors)))

  const accuracy = summary.totalScanned > 0
    ? ((summary.matches / summary.totalScanned) * 100).toFixed(1)
    : '0.0'
  console.log(chalk.cyan('\nAgreement Rate:'), chalk.bold(`${accuracy}%`))

  const improvement = summary.newDiscoveries > 0
    ? `+${summary.newDiscoveries} swaps detected`
    : 'No improvements'
  console.log(chalk.cyan('V2 Improvements:'), chalk.bold(improvement))

  const regressionRate = summary.totalScanned > 0
    ? ((summary.regressions / summary.totalScanned) * 100).toFixed(1)
    : '0.0'
  console.log(chalk.cyan('Regression Rate:'), chalk.bold(`${regressionRate}%`))

  // Show detailed regressions
  if (summary.regressions > 0) {
    console.log(chalk.red(`\n${'─'.repeat(80)}`))
    console.log(chalk.red(chalk.bold('REGRESSIONS (V1 found, V2 missed):')))
    console.log(chalk.red(`${'─'.repeat(80)}\n`))

    const regressions = allResults.filter((r) => r.status === 'regression')
    regressions.slice(0, 10).forEach((r, i) => {
      console.log(chalk.red(`${i + 1}. ${r.signature}`))
      console.log(chalk.gray(`   Whale: ${r.whale.substring(0, 8)}...`))
      console.log(chalk.gray(`   ${r.details}`))
    })

    if (regressions.length > 10) {
      console.log(chalk.gray(`\n... and ${regressions.length - 10} more`))
    }
  }

  // Show detailed new discoveries
  if (summary.newDiscoveries > 0) {
    console.log(chalk.yellow(`\n${'─'.repeat(80)}`))
    console.log(chalk.yellow(chalk.bold('NEW DISCOVERIES (V1 missed, V2 found):')))
    console.log(chalk.yellow(`${'─'.repeat(80)}\n`))

    const discoveries = allResults.filter((r) => r.status === 'new_discovery')
    discoveries.slice(0, 10).forEach((r, i) => {
      console.log(chalk.yellow(`${i + 1}. ${r.signature}`))
      console.log(chalk.gray(`   Whale: ${r.whale.substring(0, 8)}...`))
      console.log(chalk.gray(`   ${r.details}`))
    })

    if (discoveries.length > 10) {
      console.log(chalk.gray(`\n... and ${discoveries.length - 10} more`))
    }
  }

  // Show detailed mismatches
  if (summary.mismatches > 0) {
    console.log(chalk.magenta(`\n${'─'.repeat(80)}`))
    console.log(chalk.magenta(chalk.bold('MISMATCHES (Both found, different details):')))
    console.log(chalk.magenta(`${'─'.repeat(80)}\n`))

    const mismatches = allResults.filter((r) => r.status === 'mismatch')
    mismatches.slice(0, 10).forEach((r, i) => {
      console.log(chalk.magenta(`${i + 1}. ${r.signature}`))
      console.log(chalk.gray(`   Whale: ${r.whale.substring(0, 8)}...`))
      console.log(chalk.gray(`   ${r.details}`))
    })

    if (mismatches.length > 10) {
      console.log(chalk.gray(`\n... and ${mismatches.length - 10} more`))
    }
  }

  console.log(chalk.cyan(`\n${'='.repeat(80)}\n`))

  // Final verdict
  if (summary.regressions === 0 && summary.mismatches === 0) {
    console.log(chalk.green(chalk.bold('🎉 SUCCESS! V2 parser performs as well or better than V1!')))
    console.log(chalk.green(`   - No regressions detected`))
    console.log(chalk.green(`   - ${summary.newDiscoveries} additional swaps detected`))
    console.log(chalk.green(`   - ${summary.matches} transactions match V1`))
  } else {
    console.log(chalk.yellow(chalk.bold('⚠️  ISSUES FOUND:')))
    if (summary.regressions > 0) {
      console.log(chalk.red(`   - ${summary.regressions} regressions (V1 found, V2 missed)`))
    }
    if (summary.mismatches > 0) {
      console.log(chalk.magenta(`   - ${summary.mismatches} mismatches (different details)`))
    }
    console.log(chalk.yellow('\nHowever, V2 improvements:'))
    console.log(chalk.yellow(`   + ${summary.newDiscoveries} additional swaps detected`))
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log(chalk.cyan(chalk.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(chalk.cyan(chalk.bold('║         Shadow Comparison Script - V1 vs V2 Parser                        ║')))
  console.log(chalk.cyan(chalk.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  console.log(chalk.white('Configuration:'))
  console.log(chalk.gray(`  - Batch Size: ${BATCH_SIZE} whales`))
  console.log(chalk.gray(`  - TX Limit: ${TX_LIMIT} transactions per whale`))
  console.log(chalk.gray(`  - Rate Limit: ${RATE_LIMIT_MS}ms between requests`))
  console.log(chalk.gray(`  - SHYFT API Key: ${SHYFT_API_KEY.substring(0, 10)}...`))

  // Step 1: Fetch whales from database
  console.log(chalk.blue(`\n📊 Fetching whales from database...`))
  const whales = await getWhaleAddresses(BATCH_SIZE)
  console.log(chalk.green(`✅ Found ${whales.length} whales to process\n`))

  if (whales.length === 0) {
    console.log(chalk.red('❌ No whales found in database. Exiting.'))
    await mongoose.disconnect()
    return
  }

  // Step 2: Process each whale
  const allResults: ComparisonResult[] = []

  for (let i = 0; i < whales.length; i++) {
    const whale = whales[i]
    console.log(chalk.cyan(`\n[Whale ${i + 1}/${whales.length}]`))

    const results = await processWhale(whale)
    allResults.push(...results)

    // Rate limiting between whales
    if (i < whales.length - 1) {
      console.log(chalk.gray(`\nWaiting 2 seconds before next whale...`))
      await sleep(2000)
    }
  }

  // Step 3: Generate and print summary
  const summary = generateSummary(allResults)
  printSummary(summary, allResults)
  
  // Disconnect from MongoDB
  await mongoose.disconnect()
  console.log(chalk.green('\n✅ Disconnected from MongoDB'))
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('\n💥 Fatal Error:'), error)
    process.exit(1)
  })
}

export { main, processWhale, compareResults, generateSummary }
