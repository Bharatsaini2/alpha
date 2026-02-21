/**
 * Fix type 'both' swap records where usdAmount was wrongly set to token amount.
 * Recomputes USD from: token amount × token price, then sets both cards to the same value (sell-side USD).
 *
 * Uses:
 *   transaction.tokenIn.amount × tokenPrice.sellTokenPrice = sell side USD
 *   transaction.tokenOut.amount × tokenPrice.buyTokenPrice = buy side USD
 * Sets both tokenIn.usdAmount and tokenOut.usdAmount to sell-side USD so both cards show same $ value.
 *
 * Run from backend: npx ts-node scripts/fix-both-usd-from-token-amount.ts
 * Dry run: DRY_RUN=1 npx ts-node scripts/fix-both-usd-from-token-amount.ts
 * Last N hours only: HOURS=4 npx ts-node scripts/fix-both-usd-from-token-amount.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const HOURS = process.env.HOURS != null ? parseFloat(process.env.HOURS) : null

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Set MONGODB_URI or MONGO_URI')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')
  console.log(DRY_RUN ? 'DRY RUN – no writes\n' : 'LIVE – will update\n')

  const query: any = { type: 'both' }
  if (HOURS != null && HOURS > 0) {
    query.timestamp = { $gte: new Date(Date.now() - HOURS * 60 * 60 * 1000) }
    console.log(`Filter: last ${HOURS} hours\n`)
  }

  const records = await whaleAllTransactionModelV2.find(query).lean()
  console.log(`type='both' records: ${records.length}\n`)

  let updated = 0
  let skipped = 0

  for (const doc of records) {
    const d = doc as any
    const tokenInAmount = parseFloat(d.transaction?.tokenIn?.amount ?? '0')
    const tokenOutAmount = parseFloat(d.transaction?.tokenOut?.amount ?? '0')
    const sellPrice = parseFloat(d.tokenPrice?.sellTokenPrice ?? '0')
    const buyPrice = parseFloat(d.tokenPrice?.buyTokenPrice ?? '0')

    const sellUsd = tokenInAmount * sellPrice
    const buyUsd = tokenOutAmount * buyPrice

    // Use sell-side USD for both cards; fallback to buy-side if sell is 0
    let usdValue: number
    if (sellUsd > 0) {
      usdValue = sellUsd
    } else if (buyUsd > 0) {
      usdValue = buyUsd
    } else {
      skipped++
      continue
    }

    const usdStr = String(usdValue)

    if (DRY_RUN) {
      console.log(`[DRY] ${d.signature?.slice(0, 16)}... tokenIn ${tokenInAmount} × ${sellPrice} = ${usdStr} (setting both usdAmount)`)
      updated++
      continue
    }

    try {
      const r = await whaleAllTransactionModelV2.updateOne(
        { _id: d._id },
        {
          $set: {
            'transaction.tokenIn.usdAmount': usdStr,
            'transaction.tokenOut.usdAmount': usdStr,
          },
        }
      )
      if (r.modifiedCount) {
        console.log(`Fixed ${d.signature?.slice(0, 16)}... → USD ${usdStr}`)
        updated++
      }
    } catch (err: any) {
      console.error(`Error ${d.signature?.slice(0, 16)}...`, err?.message ?? err)
    }
  }

  console.log('\nDone.')
  console.log(`Updated: ${updated}, Skipped (no price): ${skipped}`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
