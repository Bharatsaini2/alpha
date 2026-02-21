/**
 * Migrate token-to-token (non-core↔non-core) whale txns from last 2 hours to single record format.
 * - Pairs (sell + buy): merge into one doc with type 'both', bothType [buy+sell], then delete the two.
 * - Singles: update to type 'both', bothType [buy+sell], duplicate amount so both cards show.
 *
 * Run from backend: npx ts-node scripts/migrate-split-to-single-record.ts
 * Dry run: DRY_RUN=1 npx ts-node scripts/migrate-split-to-single-record.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'
import { DEFAULT_CORE_TOKENS } from '../src/types/shyft-parser-v2.types'

const CORE_SET = new Set(DEFAULT_CORE_TOKENS)
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const HOURS = Math.max(0.5, parseFloat(process.env.HOURS || '2'))

function isCore(mint: string | undefined): boolean {
  return !!mint && CORE_SET.has(mint)
}

function toStr(v: any): string {
  if (v == null || v === undefined) return '0'
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
  console.log(DRY_RUN ? 'DRY RUN – no writes\n' : 'LIVE – will migrate\n')

  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000)
  const dateFilter = { timestamp: { $gte: since }, type: { $in: ['sell', 'buy'] } }
  console.log(`Last ${HOURS} hours since ${since.toISOString()}\n`)

  const all = await whaleAllTransactionModelV2.find(dateFilter).lean()
  const nonCoreBoth = all.filter((d: any) => {
    const inAddr = d.tokenInAddress || d.transaction?.tokenIn?.address
    const outAddr = d.tokenOutAddress || d.transaction?.tokenOut?.address
    return !isCore(inAddr) && !isCore(outAddr)
  })

  const bySig = new Map<string, any[]>()
  for (const doc of nonCoreBoth) {
    const sig = doc.signature
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(doc)
  }

  const pairs: { signature: string; sell: any; buy: any }[] = []
  const singles: { signature: string; doc: any }[] = []
  for (const [sig, docs] of bySig.entries()) {
    const sell = docs.find((d: any) => d.type === 'sell')
    const buy = docs.find((d: any) => d.type === 'buy')
    if (sell && buy) pairs.push({ signature: sig, sell, buy })
    else if (docs.length === 1) singles.push({ signature: sig, doc: docs[0] })
  }

  console.log(`Token-to-token in window: ${nonCoreBoth.length} records, ${bySig.size} signatures`)
  console.log(`Pairs (sell+buy) to merge: ${pairs.length}`)
  console.log(`Singles to convert to 'both': ${singles.length}\n`)

  let merged = 0
  let converted = 0
  let errors = 0

  // 1) Pairs: insert one 'both', then delete the two
  for (const { signature, sell, buy } of pairs) {
    const base = sell as any
    // Use sell leg's USD for both cards; amount.* stay as token amounts from legs
    const sellUsd = toStr(base.transaction?.tokenIn?.usdAmount || base.transaction?.tokenOut?.usdAmount || buy.transaction?.tokenIn?.usdAmount || buy.transaction?.tokenOut?.usdAmount || '0')
    const mergedDoc = {
      signature: base.signature,
      amount: {
        buyAmount: toStr(buy.amount?.buyAmount ?? buy.amount?.sellAmount ?? '0'),
        sellAmount: toStr(sell.amount?.sellAmount ?? sell.amount?.buyAmount ?? '0'),
      },
      tokenAmount: {
        buyTokenAmount: toStr(buy.tokenAmount?.buyTokenAmount || buy.tokenAmount?.sellTokenAmount),
        sellTokenAmount: toStr(sell.tokenAmount?.sellTokenAmount || sell.tokenAmount?.buyTokenAmount),
      },
      tokenPrice: base.tokenPrice || { buyTokenPrice: '0', sellTokenPrice: '0', buyTokenPriceSol: '0', sellTokenPriceSol: '0' },
      solAmount: base.solAmount || { buySolAmount: '0', sellSolAmount: '0' },
      transaction: {
        ...(base.transaction || {}),
        tokenIn: { ...(base.transaction?.tokenIn || {}), usdAmount: sellUsd },
        tokenOut: { ...(base.transaction?.tokenOut || {}), usdAmount: sellUsd },
      },
      whaleLabel: base.whaleLabel || [],
      whaleTokenSymbol: base.whaleTokenSymbol,
      tokenInSymbol: base.tokenInSymbol,
      tokenOutSymbol: base.tokenOutSymbol,
      whaleAddress: base.whaleAddress,
      tokenInAddress: base.tokenInAddress,
      tokenOutAddress: base.tokenOutAddress,
      whale: base.whale || { address: base.whaleAddress },
      marketCap: base.marketCap || { buyMarketCap: '0', sellMarketCap: '0' },
      whaleTokenURL: base.whaleTokenURL,
      inTokenURL: base.inTokenURL,
      outTokenURL: base.outTokenURL,
      type: 'both',
      bothType: [{ buyType: true, sellType: true }],
      classificationSource: 'migrated_split',
      hotnessScore: base.hotnessScore ?? 0,
      timestamp: base.timestamp || new Date(),
      age: base.age,
      tokenInAge: base.tokenInAge,
      tokenOutAge: base.tokenOutAge,
    }

    if (DRY_RUN) {
      console.log(`[DRY] Would merge pair ${signature.slice(0, 16)}... → one 'both' then delete 2`)
      merged++
      continue
    }
    try {
      await whaleAllTransactionModelV2.create(mergedDoc)
      const del = await whaleAllTransactionModelV2.deleteMany({
        signature,
        type: { $in: ['sell', 'buy'] },
      })
      if (del.deletedCount === 2) {
        console.log(`Merged pair ${signature.slice(0, 16)}... (deleted 2)`)
        merged++
      } else {
        console.warn(`Merged ${signature.slice(0, 16)}... but deleted ${del.deletedCount} (expected 2)`)
        errors++
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        await whaleAllTransactionModelV2.deleteMany({ signature, type: { $in: ['sell', 'buy'] } })
        console.log(`Merged pair ${signature.slice(0, 16)}... (dup on insert, cleaned old)`)
        merged++
      } else {
        console.error(`Error merging ${signature.slice(0, 16)}...`, err?.message ?? err)
        errors++
      }
    }
  }

  // 2) Singles: update to type 'both'; use existing tokenIn.usdAmount (USD) for both cards – never use amount.* (token amounts) for USD
  for (const { signature, doc } of singles) {
    const d = doc as any
    const sellUsd = toStr(d.transaction?.tokenIn?.usdAmount || d.transaction?.tokenOut?.usdAmount || '0')
    if (DRY_RUN) {
      console.log(`[DRY] Would convert single ${signature.slice(0, 16)}... to type 'both'`)
      converted++
      continue
    }
    try {
      await whaleAllTransactionModelV2.updateOne(
        { _id: d._id },
        {
          $set: {
            type: 'both',
            bothType: [{ buyType: true, sellType: true }],
            'transaction.tokenIn.usdAmount': sellUsd,
            'transaction.tokenOut.usdAmount': sellUsd,
            classificationSource: 'migrated_split',
          },
        }
      )
      console.log(`Converted single ${signature.slice(0, 16)}... to 'both'`)
      converted++
    } catch (err: any) {
      console.error(`Error converting ${signature.slice(0, 16)}...`, err?.message ?? err)
      errors++
    }
  }

  console.log('\nDone.')
  console.log(`Merged pairs: ${merged}, Converted singles: ${converted}, Errors: ${errors}`)
  await mongoose.disconnect()
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
