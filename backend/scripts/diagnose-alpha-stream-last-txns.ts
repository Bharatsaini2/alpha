/**
 * Diagnose Alpha Stream / Whale vs KOL data quality.
 * Fetches last 50 whale txns and last 50 KOL txns, prints type, tokens, core/non-core, classificationSource.
 *
 * Run from backend: npx ts-node -r tsconfig-paths/register scripts/diagnose-alpha-stream-last-txns.ts
 *
 * Expectation for Alpha Stream (whale feed):
 * - "Normal" buy/sell = one side CORE (SOL/USDC) and one side NON-CORE (memecoin). type 'both'|'buy'|'sell'.
 * - If you see only NON-CORE ↔ NON-CORE (token-to-token split legs), those are valid swaps but not "normal" whale buys.
 * - Core-to-core (SOL↔USDC) should be suppressed and not stored.
 */
import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'
import InfluencerWhalesTransactionModelV2 from '../src/models/influencerWhaleTransactionsV2.model'
import { DEFAULT_CORE_TOKENS } from '../src/types/shyft-parser-v2.types'

const CORE_SET = new Set(DEFAULT_CORE_TOKENS)

function isCore(mint: string | undefined): boolean {
  return !!mint && CORE_SET.has(mint)
}

function label(inAddr: string | undefined, outAddr: string | undefined): string {
  const inC = isCore(inAddr)
  const outC = isCore(outAddr)
  if (inC && outC) return 'CORE↔CORE (should be suppressed)'
  if (inC && !outC) return 'CORE→NON-CORE (normal buy: SOL/USDC → token)'
  if (!inC && outC) return 'NON-CORE→CORE (normal sell: token → SOL/USDC)'
  return 'NON-CORE↔NON-CORE (token-to-token split)'
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Set MONGODB_URI or MONGO_URI')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB\n')
  console.log('========== LAST 50 WHALE TXNS (Alpha Stream feed source) ==========\n')

  const whaleTxns = await whaleAllTransactionModelV2
    .find({})
    .sort({ timestamp: -1 })
    .limit(50)
    .lean()

  if (whaleTxns.length === 0) {
    console.log('No whale transactions in DB.')
  } else {
    whaleTxns.forEach((tx: any, i: number) => {
      const tokenIn = tx.tokenInAddress || tx.transaction?.tokenIn?.address
      const tokenOut = tx.tokenOutAddress || tx.transaction?.tokenOut?.address
      const inSym = tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol
      const outSym = tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol
      const classification = tx.classificationSource ?? '(none)'
      const buyAmt = tx.amount?.buyAmount ?? tx.transaction?.tokenOut?.usdAmount
      const sellAmt = tx.amount?.sellAmount ?? tx.transaction?.tokenIn?.usdAmount
      console.log(`--- Whale ${i + 1} ---`)
      console.log('  signature:', tx.signature)
      console.log('  type:', tx.type)
      console.log('  classificationSource:', classification)
      console.log('  tokenIn:', inSym, '| tokenOut:', outSym)
      console.log('  tokenInAddress:', (tokenIn || '').slice(0, 20) + '...')
      console.log('  tokenOutAddress:', (tokenOut || '').slice(0, 20) + '...')
      console.log('  core/non-core:', label(tokenIn, tokenOut))
      console.log('  amount buy:', buyAmt, '| sell:', sellAmt)
      console.log('  timestamp:', tx.timestamp)
      console.log('')
    })
  }

  console.log('========== LAST 50 KOL TXNS ==========\n')

  const kolTxns = await InfluencerWhalesTransactionModelV2
    .find({})
    .sort({ timestamp: -1 })
    .limit(50)
    .lean()

  if (kolTxns.length === 0) {
    console.log('No KOL transactions in DB.')
  } else {
    kolTxns.forEach((tx: any, i: number) => {
      const tokenIn = tx.tokenInAddress || tx.transaction?.tokenIn?.address
      const tokenOut = tx.tokenOutAddress || tx.transaction?.tokenOut?.address
      const inSym = tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol
      const outSym = tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol
      const classification = tx.classificationSource ?? '(none)'
      console.log(`--- KOL ${i + 1} ---`)
      console.log('  signature:', tx.signature)
      console.log('  type:', tx.type)
      console.log('  classificationSource:', classification)
      console.log('  tokenIn:', inSym, '| tokenOut:', outSym)
      console.log('  core/non-core:', label(tokenIn, tokenOut))
      console.log('  timestamp:', tx.timestamp)
      console.log('')
    })
  }

  // Summary
  const whaleNonCoreBoth = whaleTxns.filter((tx: any) => {
    const tokenIn = tx.tokenInAddress || tx.transaction?.tokenIn?.address
    const tokenOut = tx.tokenOutAddress || tx.transaction?.tokenOut?.address
    return !isCore(tokenIn) && !isCore(tokenOut)
  })
  const whaleCoreNonCore = whaleTxns.filter((tx: any) => {
    const tokenIn = tx.tokenInAddress || tx.transaction?.tokenIn?.address
    const tokenOut = tx.tokenOutAddress || tx.transaction?.tokenOut?.address
    return isCore(tokenIn) !== isCore(tokenOut)
  })
  const whaleCoreCore = whaleTxns.filter((tx: any) => {
    const tokenIn = tx.tokenInAddress || tx.transaction?.tokenIn?.address
    const tokenOut = tx.tokenOutAddress || tx.transaction?.tokenOut?.address
    return isCore(tokenIn) && isCore(tokenOut)
  })

  console.log('========== SUMMARY ==========')
  console.log('Whale last 50: normal (core↔non-core):', whaleCoreNonCore.length)
  console.log('Whale last 50: token-to-token (non-core↔non-core):', whaleNonCoreBoth.length)
  console.log('Whale last 50: core↔core (should be suppressed):', whaleCoreCore.length)
  if (whaleNonCoreBoth.length >= whaleTxns.length && whaleTxns.length > 0) {
    console.log('\n⚠️ Alpha Stream may be showing mostly token-to-token splits (no SOL/USDC side). Check parser quote/base and whether normal buys are being stored.')
  }
  if (whaleCoreCore.length > 0) {
    console.log('\n⚠️ Core-to-core txns are in DB; suppression may be off or applied only in parser before split creation.')
  }

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
