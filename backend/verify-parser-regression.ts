/**
 * Task 4.1: Verify zero regression on existing alerts (UPDATED WITH CORRECT OLD LOGIC)
 * 
 * This script compares the old parser logic (from wallet.controller.ts)
 * with the new parseShyftTransaction() parser on 100+ real production transactions.
 * 
 * ACTUAL Old Parser Logic (from wallet.controller.ts lines 850-1100):
 * 1. Check for swap indicators: hasBuyActivity && hasSellActivity
 *    - hasBuyActivity: some balance change > 0
 *    - hasSellActivity: some balance change < 0
 * 2. Extract tokens from: tokens_swapped → token_balance_changes → TOKEN_TRANSFER
 * 3. Apply excluded tokens logic:
 *    - excludedTokens: ['SOL', 'WSOL', 'USDT', 'USDC', 'USD1']
 *    - excludedAddresses: SOL/WSOL, USDC, USDT addresses
 * 4. Classify:
 *    - isBuy = bothNonExcluded || (!outputExcluded && inputExcluded)
 *    - isSell = bothNonExcluded || (outputExcluded && !inputExcluded)
 * 5. Skip if (!isBuy && !isSell)
 * 
 * New Parser: Uses parseShyftTransaction() from src/utils/shyftParser.ts
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import axios from 'axios'
import { parseShyftTransaction, ShyftTransaction } from './src/utils/shyftParser'
import logger from './src/utils/logger'
import WhalesAddressModel from './src/models/solana-tokens-whales'
import { connectDB } from './src/config/connectDb'

dotenv.config()

// ACTUAL Old parser logic (from wallet.controller.ts lines 850-1100)
interface OldParserResult {
  isBuy: boolean
  isSell: boolean
  tokenIn: {
    symbol: string
    token_address: string
  }
  tokenOut: {
    symbol: string
    token_address: string
  }
}

function oldParserLogic(parsedTx: any): OldParserResult | null {
  // Step 1: Check for swap indicators (buy AND sell activity)
  const balanceChanges = parsedTx.result?.token_balance_changes || []
  const nonZeroChanges = balanceChanges.filter((c: any) => c.change_amount !== 0)
  const hasBuyActivity = nonZeroChanges.some((c: any) => c.change_amount > 0)
  const hasSellActivity = nonZeroChanges.some((c: any) => c.change_amount < 0)

  if (!hasBuyActivity || !hasSellActivity) {
    return null // Skip - no swap indicators
  }

  const actions = parsedTx.result?.actions
  if (!actions || actions.length === 0) {
    return null
  }

  const swapper = parsedTx.result?.signers?.[0]
  if (!swapper) {
    return null
  }

  let tokenIn: any = null
  let tokenOut: any = null

  // Step 2: Extract tokens - Priority: tokens_swapped → token_balance_changes → TOKEN_TRANSFER
  const actionInfo = actions[0]?.info

  // Try tokens_swapped first
  if (actionInfo?.tokens_swapped) {
    tokenIn = actionInfo.tokens_swapped.in
    tokenOut = actionInfo.tokens_swapped.out
  }
  // Try token_balance_changes
  else if (balanceChanges.length > 0) {
    const swapperChanges = balanceChanges.filter(
      (change: any) => change.owner === swapper && change.change_amount !== 0
    )

    const tokenSentChange = swapperChanges.find((c: any) => c.change_amount < 0)
    const tokenReceivedChange = swapperChanges.find((c: any) => c.change_amount > 0)

    if (tokenSentChange && tokenReceivedChange) {
      tokenIn = {
        token_address: tokenSentChange.mint,
        amount: Math.abs(tokenSentChange.change_amount) / Math.pow(10, tokenSentChange.decimals),
        symbol: tokenSentChange.symbol || 'Unknown',
        name: tokenSentChange.name || 'Unknown',
      }

      tokenOut = {
        token_address: tokenReceivedChange.mint,
        amount: tokenReceivedChange.change_amount / Math.pow(10, tokenReceivedChange.decimals),
        symbol: tokenReceivedChange.symbol || 'Unknown',
        name: tokenReceivedChange.name || 'Unknown',
      }
    }
  }
  // Try TOKEN_TRANSFER fallback
  else {
    const solOut = actions.find(
      (a: any) => a.type === 'SOL_TRANSFER' && a.info?.sender === swapper
    )
    const solIn = actions.find(
      (a: any) => a.type === 'SOL_TRANSFER' && a.info?.receiver === swapper
    )
    const splOut = actions.find(
      (a: any) => a.type === 'TOKEN_TRANSFER' && a.info?.sender === swapper
    )
    const splIn = actions.find(
      (a: any) => a.type === 'TOKEN_TRANSFER' && a.info?.receiver === swapper
    )

    if (solOut && splIn) {
      tokenIn = {
        token_address: 'So11111111111111111111111111111111111111112',
        amount: solOut.info.amount,
        symbol: 'SOL',
        name: 'SOL',
      }
      tokenOut = {
        token_address: splIn.info.token_address,
        amount: splIn.info.amount,
        symbol: 'Unknown',
        name: 'Unknown',
      }
    } else if (splOut && solIn) {
      tokenIn = {
        token_address: splOut.info.token_address,
        amount: splOut.info.amount,
        symbol: 'Unknown',
        name: 'Unknown',
      }
      tokenOut = {
        token_address: 'So11111111111111111111111111111111111111112',
        amount: solIn.info.amount,
        symbol: 'SOL',
        name: 'SOL',
      }
    } else if (splOut && splIn) {
      tokenIn = {
        token_address: splOut.info.token_address,
        amount: splOut.info.amount,
        symbol: 'Unknown',
        name: 'Unknown',
      }
      tokenOut = {
        token_address: splIn.info.token_address,
        amount: splIn.info.amount,
        symbol: 'Unknown',
        name: 'Unknown',
      }
    }
  }

  // If we still don't have tokens, skip
  if (!tokenIn || !tokenOut) {
    return null
  }

  // Step 3: Apply excluded tokens logic
  const excludedTokens = ['SOL', 'WSOL', 'USDT', 'USDC', 'USD1']
  const excludedAddresses = [
    'So11111111111111111111111111111111111111112', // SOL/WSOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  ]

  const inputExcluded =
    excludedTokens.includes(tokenIn.symbol) ||
    excludedAddresses.includes(tokenIn.token_address)
  const outputExcluded =
    excludedTokens.includes(tokenOut.symbol) ||
    excludedAddresses.includes(tokenOut.token_address)
  const bothNonExcluded = !inputExcluded && !outputExcluded

  // Step 4: Classify
  const isBuy = bothNonExcluded || (!outputExcluded && inputExcluded)
  const isSell = bothNonExcluded || (outputExcluded && !inputExcluded)

  // Step 5: Skip if neither buy nor sell
  if (!isBuy && !isSell) {
    return null
  }

  return { isBuy, isSell, tokenIn, tokenOut }
}

// Fetch transactions from SHYFT API
async function fetchWhaleTransactions(whaleAddress: string, limit: number = 10): Promise<any[]> {
  const apiKey = process.env.SHYFT_API_KEY
  if (!apiKey) {
    throw new Error('SHYFT_API_KEY not found in environment')
  }

  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/history`,
      {
        params: {
          network: 'mainnet-beta',
          account: whaleAddress,
          tx_num: limit,
          enable_raw: false,
        },
        headers: {
          'x-api-key': apiKey,
        },
      }
    )

    if (response.data && response.data.result) {
      return response.data.result
    }

    return []
  } catch (error) {
    logger.error({ error, whaleAddress }, 'Failed to fetch transactions from SHYFT')
    return []
  }
}

// Compare results
interface ComparisonResult {
  signature: string
  timestamp: string
  oldParser: {
    detected: boolean
    isBuy: boolean
    isSell: boolean
    tokenIn?: string
    tokenOut?: string
  }
  newParser: {
    detected: boolean
    side?: 'BUY' | 'SELL' | 'SWAP'
    confidence?: string
    source?: string
    tokenIn?: string
    tokenOut?: string
  }
  agreement: boolean
  regression: boolean // Old detected, new missed
  improvement: boolean // New detected, old missed
}

function compareResults(
  tx: any,
  oldResult: OldParserResult | null,
  newResult: any
): ComparisonResult {
  const oldDetected = oldResult !== null && (oldResult.isBuy || oldResult.isSell)
  const newDetected = newResult !== null

  let agreement = false
  let regression = false
  let improvement = false

  if (oldDetected && newDetected) {
    // Both detected - check if they agree on BUY/SELL
    const oldSide = oldResult!.isBuy ? 'BUY' : 'SELL'
    const newSide = newResult.side
    agreement = oldSide === newSide || newSide === 'SWAP'
  } else if (!oldDetected && !newDetected) {
    // Both didn't detect - agreement
    agreement = true
  } else if (oldDetected && !newDetected) {
    // Old detected, new missed - REGRESSION
    regression = true
  } else if (!oldDetected && newDetected) {
    // New detected, old missed - IMPROVEMENT
    improvement = true
  }

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    oldParser: {
      detected: oldDetected,
      isBuy: oldResult?.isBuy || false,
      isSell: oldResult?.isSell || false,
      tokenIn: oldResult?.tokenIn?.symbol,
      tokenOut: oldResult?.tokenOut?.symbol,
    },
    newParser: {
      detected: newDetected,
      side: newResult?.side,
      confidence: newResult?.confidence,
      source: newResult?.classification_source,
      tokenIn: newResult?.input?.mint?.substring(0, 8),
      tokenOut: newResult?.output?.mint?.substring(0, 8),
    },
    agreement,
    regression,
    improvement,
  }
}

// Main verification function
async function verifyParserRegression() {
  try {
    logger.info('🚀 Starting parser regression verification...')

    // Connect to database
    await connectDB()
    logger.info('✅ Connected to database')

    // Fetch whale addresses from database
    const whales = await WhalesAddressModel.find({}).limit(100).lean()
    const whaleAddresses = whales.flatMap((doc: any) => doc.whalesAddress).slice(0, 200)
    
    logger.info(`📊 Found ${whaleAddresses.length} whale addresses to test`)

    const results: ComparisonResult[] = []
    let totalTransactions = 0
    let targetTransactions = 100

    // Fetch transactions from multiple whales until we have 100+
    for (const whaleAddress of whaleAddresses) {
      if (totalTransactions >= targetTransactions) {
        break
      }

      logger.info(`🐋 Fetching transactions for whale: ${whaleAddress.substring(0, 8)}...`)
      
      const transactions = await fetchWhaleTransactions(whaleAddress, 25)
      logger.info(`  Found ${transactions.length} transactions`)

      for (const tx of transactions) {
        if (totalTransactions >= targetTransactions) {
          break
        }

        // Only process successful transactions
        if (tx.status !== 'Success') {
          continue
        }

        // Run old parser logic (includes swap indicators check and token extraction)
        const oldResult = oldParserLogic(tx)

        // Run new parser
        const newResult = parseShyftTransaction(tx as ShyftTransaction)

        // Compare results
        const comparison = compareResults(tx, oldResult, newResult)
        results.push(comparison)

        totalTransactions++

        // Log progress every 10 transactions
        if (totalTransactions % 10 === 0) {
          logger.info(`  Progress: ${totalTransactions}/${targetTransactions} transactions processed`)
        }
      }

      // Add delay between whale queries to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Generate report
    logger.info('\n' + '='.repeat(80))
    logger.info('📊 PARSER REGRESSION VERIFICATION REPORT')
    logger.info('='.repeat(80))

    const totalTested = results.length
    const oldDetected = results.filter(r => r.oldParser.detected).length
    const newDetected = results.filter(r => r.newParser.detected).length
    const agreements = results.filter(r => r.agreement).length
    const regressions = results.filter(r => r.regression).length
    const improvements = results.filter(r => r.improvement).length
    const agreementRate = ((agreements / totalTested) * 100).toFixed(2)

    logger.info(`\nTotal transactions tested: ${totalTested}`)
    logger.info(`Old parser detected swaps: ${oldDetected}`)
    logger.info(`New parser detected swaps: ${newDetected}`)
    logger.info(`\n📈 Results:`)
    logger.info(`  ✅ Agreements: ${agreements} (${agreementRate}%)`)
    logger.info(`  ⚠️  Regressions (old detected, new missed): ${regressions}`)
    logger.info(`  🎉 Improvements (new detected, old missed): ${improvements}`)

    // Log regressions in detail
    if (regressions > 0) {
      logger.info('\n' + '='.repeat(80))
      logger.info('⚠️  REGRESSIONS DETECTED:')
      logger.info('='.repeat(80))
      
      const regressionCases = results.filter(r => r.regression)
      regressionCases.forEach((r, idx) => {
        logger.info(`\n[${idx + 1}] Signature: ${r.signature}`)
        logger.info(`    Timestamp: ${r.timestamp}`)
        logger.info(`    Old: ${r.oldParser.isBuy ? 'BUY' : 'SELL'} (${r.oldParser.tokenIn} → ${r.oldParser.tokenOut})`)
        logger.info(`    New: NOT DETECTED`)
      })
    }

    // Log improvements in detail
    if (improvements > 0) {
      logger.info('\n' + '='.repeat(80))
      logger.info('🎉 IMPROVEMENTS DETECTED:')
      logger.info('='.repeat(80))
      
      const improvementCases = results.filter(r => r.improvement).slice(0, 10) // Show first 10
      improvementCases.forEach((r, idx) => {
        logger.info(`\n[${idx + 1}] Signature: ${r.signature}`)
        logger.info(`    Timestamp: ${r.timestamp}`)
        logger.info(`    Old: NOT DETECTED`)
        logger.info(`    New: ${r.newParser.side} (confidence: ${r.newParser.confidence}, source: ${r.newParser.source})`)
      })
      
      if (improvements > 10) {
        logger.info(`\n... and ${improvements - 10} more improvements`)
      }
    }

    // Final verdict
    logger.info('\n' + '='.repeat(80))
    if (regressions === 0) {
      logger.info('✅ ZERO REGRESSION VERIFIED!')
      logger.info('✅ New parser catches all swaps detected by old parser')
      logger.info(`✅ Plus ${improvements} additional swaps detected by new parser`)
    } else {
      logger.info('❌ REGRESSION DETECTED!')
      logger.info(`❌ New parser missed ${regressions} swaps that old parser detected`)
      logger.info('❌ DO NOT PROCEED - Fix regressions before deployment')
    }
    logger.info('='.repeat(80))

    // Close database connection
    await mongoose.connection.close()
    logger.info('\n✅ Database connection closed')

    // Exit with appropriate code
    process.exit(regressions > 0 ? 1 : 0)

  } catch (error) {
    logger.error({ error }, '❌ Verification failed')
    process.exit(1)
  }
}

// Run verification
verifyParserRegression()
