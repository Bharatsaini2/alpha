/**
 * Fix type 'both' swap records: make buy card show same USD as sell.
 * Only sets transaction.tokenOut.usdAmount = transaction.tokenIn.usdAmount (copy sell USD to buy).
 * Does NOT use amount.sellAmount for USD – amount.* are token amounts, not USD.
 *
 * Run from backend: npx ts-node scripts/fix-both-usd-amounts.ts
 * Dry run: DRY_RUN=1 npx ts-node scripts/fix-both-usd-amounts.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Set MONGODB_URI or MONGO_URI')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')
  console.log(DRY_RUN ? 'DRY RUN – no writes\n' : 'LIVE – will update\n')

  const bothRecords = await whaleAllTransactionModelV2.find({ type: 'both' }).lean()

  // Only fix where buy (tokenOut) usdAmount is 0 or missing – set it from sell (tokenIn) USD
  const needFix = bothRecords.filter((d: any) => {
    const outUsd = d.transaction?.tokenOut?.usdAmount
    const outVal = parseFloat(outUsd)
    const inUsd = d.transaction?.tokenIn?.usdAmount
    const inVal = parseFloat(inUsd)
    return (outVal === 0 || outUsd === '' || outUsd == null) && !isNaN(inVal) && inVal > 0
  })

  console.log(`type='both' records: ${bothRecords.length}, to fix (tokenOut.usdAmount 0/missing): ${needFix.length}\n`)

  if (needFix.length === 0) {
    console.log('Nothing to fix.')
    await mongoose.disconnect()
    process.exit(0)
    return
  }

  let updated = 0
  for (const doc of needFix) {
    const d = doc as any
    const sellUsd = String(d.transaction?.tokenIn?.usdAmount ?? '0')
    if (DRY_RUN) {
      console.log(`[DRY] Would set tokenOut.usdAmount = ${sellUsd} for ${d.signature?.slice(0, 16)}...`)
      updated++
      continue
    }
    try {
      const r = await whaleAllTransactionModelV2.updateOne(
        { _id: d._id },
        { $set: { 'transaction.tokenOut.usdAmount': sellUsd } }
      )
      if (r.modifiedCount) {
        console.log(`Fixed ${d.signature?.slice(0, 16)}... → tokenOut.usdAmount = ${sellUsd}`)
        updated++
      }
    } catch (err: any) {
      console.error(`Error ${d.signature?.slice(0, 16)}...`, err?.message ?? err)
    }
  }

  console.log('\nDone.')
  console.log(`Updated: ${updated}`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
