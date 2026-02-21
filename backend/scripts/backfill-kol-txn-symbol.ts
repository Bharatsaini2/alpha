/**
 * Backfill KOL transaction(s) with real symbol/name from Birdeye when they have shortened.
 * Resolves tokenIn/tokenOut via getTokenMetaDataUsingRPC (cache + Birdeye), then updates the txn doc.
 *
 * Usage: npx ts-node scripts/backfill-kol-txn-symbol.ts <signature>
 * Example: npx ts-node scripts/backfill-kol-txn-symbol.ts 2kPZcacaCPdADXZcA9gz9KmdmZR8UA3JxbkbMggjeqzYiP9tUckVLPxoJJug6USrqFkrBo7GYzARUgkCwqSrn86o
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import mongoose from 'mongoose'
import influencerWhaleTransactionsModelV2 from '../src/models/influencerWhaleTransactionsV2.model'
import { getTokenMetaDataUsingRPC } from '../src/config/solana-tokens-config'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''
const SIGNATURE = process.argv[2]

const STABLE_MINTS = new Set([
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
])

function looksShortened(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false
  const t = s.trim()
  if (t.includes('...') && t.length <= 15) return true
  if (/^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/.test(t)) return true
  if (t.length >= 4 && t.length <= 15 && t.includes('...')) return true
  return false
}

async function main() {
  if (!SIGNATURE) {
    console.error('Usage: npx ts-node scripts/backfill-kol-txn-symbol.ts <signature>')
    process.exit(1)
  }
  if (!MONGO_URI) {
    console.error('MONGO_URI or MONGODB_URI required in .env')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)

  const txns = await influencerWhaleTransactionsModelV2.find({ signature: SIGNATURE }).lean()
  if (txns.length === 0) {
    console.log('No KOL transaction(s) found for signature:', SIGNATURE)
    await mongoose.disconnect()
    process.exit(0)
    return
  }

  console.log('Found', txns.length, 'record(s) for signature', SIGNATURE.slice(0, 12) + '...')

  for (const txn of txns) {
    const t = txn as any
    let needUpdate = false
    const updates: Record<string, string> = {}

    const inAddr = t.tokenInAddress
    const outAddr = t.tokenOutAddress

    if (inAddr && !STABLE_MINTS.has(inAddr) && (looksShortened(t.tokenInSymbol) || looksShortened(t.tokenInName) || !t.tokenInName)) {
      const meta = await getTokenMetaDataUsingRPC(inAddr)
      if (meta && !meta._isShortened && meta.symbol) {
        updates.tokenInSymbol = meta.symbol
        updates.tokenInName = (meta.name && meta.name.trim()) ? meta.name : meta.symbol
        needUpdate = true
        console.log('  tokenIn resolved:', meta.symbol, '/', updates.tokenInName)
      } else {
        console.log('  tokenIn could not resolve (still shortened or unknown)')
      }
    }

    if (outAddr && !STABLE_MINTS.has(outAddr) && (looksShortened(t.tokenOutSymbol) || looksShortened(t.tokenOutName) || !t.tokenOutName)) {
      const meta = await getTokenMetaDataUsingRPC(outAddr)
      if (meta && !meta._isShortened && meta.symbol) {
        updates.tokenOutSymbol = meta.symbol
        updates.tokenOutName = (meta.name && meta.name.trim()) ? meta.name : meta.symbol
        needUpdate = true
        console.log('  tokenOut resolved:', meta.symbol, '/', updates.tokenOutName)
      } else {
        console.log('  tokenOut could not resolve (still shortened or unknown)')
      }
    }

    if (needUpdate) {
      await influencerWhaleTransactionsModelV2.updateOne(
        { _id: t._id },
        { $set: updates }
      )
      console.log('  Updated txn', t.type, 'with', Object.keys(updates).join(', '))
    }
  }

  await mongoose.disconnect()
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
