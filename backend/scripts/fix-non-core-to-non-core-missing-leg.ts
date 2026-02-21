/**
 * Backfill missing legs for token-to-token (non-core↔non-core) whale transactions
 * that were stored only once. Finds records where both tokenIn and tokenOut are
 * non-core, groups by signature, and inserts the missing sell or buy record.
 *
 * Run from backend: npx ts-node scripts/fix-non-core-to-non-core-missing-leg.ts
 * Dry run (no writes): DRY_RUN=1 npx ts-node scripts/fix-non-core-to-non-core-missing-leg.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'
import { DEFAULT_CORE_TOKENS } from '../src/types/shyft-parser-v2.types'

const CORE_SET = new Set(DEFAULT_CORE_TOKENS)
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
// Only consider txns from the last N days (default 7). Set to 0 or omit for all time.
const RECENT_DAYS = Math.max(0, parseInt(process.env.RECENT_DAYS || '7', 10))

function isCore(mint: string | undefined): boolean {
  return !!mint && CORE_SET.has(mint)
}

function toStr(v: any): string {
  if (v == null) return '0'
  if (typeof v === 'string') return v
  return String(v)
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Set MONGODB_URI or MONGO_URI')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')
  console.log(DRY_RUN ? 'DRY RUN – no writes\n' : 'LIVE – will insert missing legs\n')

  const dateFilter: any = { type: { $in: ['sell', 'buy'] } }
  if (RECENT_DAYS > 0) {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)
    dateFilter.timestamp = { $gte: since }
    console.log(`Filtering txns since ${since.toISOString()} (last ${RECENT_DAYS} days)\n`)
  }

  // Whale records where both tokenIn and tokenOut are non-core
  const all = await whaleAllTransactionModelV2.find(dateFilter).lean()

  const nonCoreBoth = all.filter((d: any) => {
    const inAddr = d.tokenInAddress || d.transaction?.tokenIn?.address
    const outAddr = d.tokenOutAddress || d.transaction?.tokenOut?.address
    return !isCore(inAddr) && !isCore(outAddr)
  })

  // Group by signature
  const bySig = new Map<string, any[]>()
  for (const doc of nonCoreBoth) {
    const sig = doc.signature
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(doc)
  }

  // Signatures that have only one leg
  const incomplete: { signature: string; existing: any; missingType: 'sell' | 'buy' }[] = []
  for (const [sig, docs] of bySig.entries()) {
    const types = new Set(docs.map((d: any) => d.type))
    if (types.size === 2) continue // already has both
    const existing = docs[0]
    const missingType = existing.type === 'sell' ? 'buy' : 'sell'
    incomplete.push({ signature: sig, existing, missingType })
  }

  console.log(`Token-to-token (non-core↔non-core) records: ${nonCoreBoth.length}`)
  console.log(`Signatures with both legs: ${bySig.size - incomplete.length}`)
  console.log(`Signatures missing one leg (to fix): ${incomplete.length}\n`)

  if (incomplete.length === 0) {
    console.log('Nothing to fix.')
    await mongoose.disconnect()
    process.exit(0)
    return
  }

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const { signature, existing, missingType } of incomplete) {
    const doc = existing as any
    // Build the missing leg by cloning and flipping type + amounts
    const newType = missingType
    const classificationSource =
      missingType === 'buy' ? 'v2_parser_split_buy' : 'v2_parser_split_sell'

    const newDoc: any = {
      signature: doc.signature,
      amount: {
        buyAmount: missingType === 'buy' ? toStr(doc.amount?.sellAmount) : toStr(doc.amount?.buyAmount ?? '0'),
        sellAmount: missingType === 'sell' ? toStr(doc.amount?.buyAmount) : toStr(doc.amount?.sellAmount ?? '0'),
      },
      tokenAmount: {
        buyTokenAmount: missingType === 'buy' ? toStr(doc.tokenAmount?.sellTokenAmount) : toStr(doc.tokenAmount?.buyTokenAmount ?? '0'),
        sellTokenAmount: missingType === 'sell' ? toStr(doc.tokenAmount?.buyTokenAmount) : toStr(doc.tokenAmount?.sellTokenAmount ?? '0'),
      },
      tokenPrice: doc.tokenPrice || { buyTokenPrice: '0', sellTokenPrice: '0', buyTokenPriceSol: '0', sellTokenPriceSol: '0' },
      solAmount: doc.solAmount || { buySolAmount: '0', sellSolAmount: '0' },
      transaction: doc.transaction || {
        tokenIn: doc.tokenInSymbol ? { symbol: doc.tokenInSymbol, address: doc.tokenInAddress, usdAmount: '0', amount: '0', marketCap: '0', marketCapSol: '0', name: doc.tokenInSymbol, imageUrl: null } : {},
        tokenOut: doc.tokenOutSymbol ? { symbol: doc.tokenOutSymbol, address: doc.tokenOutAddress, usdAmount: '0', amount: '0', marketCap: '0', marketCapSol: '0', name: doc.tokenOutSymbol, imageUrl: null } : {},
        gasFee: doc.transaction?.gasFee,
        platform: doc.transaction?.platform,
        timestamp: doc.timestamp || new Date(),
      },
      whaleLabel: doc.whaleLabel || [],
      whaleTokenSymbol: doc.whaleTokenSymbol,
      tokenInSymbol: doc.tokenInSymbol,
      tokenOutSymbol: doc.tokenOutSymbol,
      whaleAddress: doc.whaleAddress,
      tokenInAddress: doc.tokenInAddress,
      tokenOutAddress: doc.tokenOutAddress,
      whale: doc.whale || { address: doc.whaleAddress },
      marketCap: doc.marketCap || { buyMarketCap: '0', sellMarketCap: '0' },
      whaleTokenURL: doc.whaleTokenURL,
      inTokenURL: doc.inTokenURL,
      outTokenURL: doc.outTokenURL,
      type: newType,
      bothType: [{ buyType: false, sellType: false }],
      classificationSource,
      hotnessScore: doc.hotnessScore ?? 0,
      timestamp: doc.timestamp || new Date(),
      age: doc.age,
      tokenInAge: doc.tokenInAge,
      tokenOutAge: doc.tokenOutAge,
    }

    if (DRY_RUN) {
      console.log(`[DRY] Would insert ${newType} for ${signature.slice(0, 16)}... (existing: ${doc.type})`)
      inserted++
      continue
    }

    try {
      await whaleAllTransactionModelV2.create(newDoc)
      console.log(`Inserted ${newType} for ${signature.slice(0, 16)}...`)
      inserted++
    } catch (err: any) {
      if (err?.code === 11000) {
        console.log(`Skip (already exists): ${newType} for ${signature.slice(0, 16)}...`)
        skipped++
      } else {
        console.error(`Error inserting ${newType} for ${signature.slice(0, 16)}...`, err?.message ?? err)
        errors++
      }
    }
  }

  console.log('\nDone.')
  console.log(`Inserted: ${inserted}, Skipped (dup): ${skipped}, Errors: ${errors}`)
  await mongoose.disconnect()
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
