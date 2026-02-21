/**
 * Diagnose why a KOL transaction has shortened symbol/name.
 * 1) Load the KOL txn by signature and print stored tokenIn/Out symbol, name, address.
 * 2) Look up those token addresses in TokenMetadataCache and report if shortened is cached.
 *
 * Usage: npx ts-node scripts/diagnose-kol-txn-symbol.ts [signature]
 * Example: npx ts-node scripts/diagnose-kol-txn-symbol.ts 2kPZcacaCPdADXZcA9gz9KmdmZR8UA3JxbkbMggjeqzYiP9tUckVLPxoJJug6USrqFkrBo7GYzARUgkCwqSrn86o
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import mongoose from 'mongoose'

dotenv.config({ path: path.join(__dirname, '../.env') })

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''
const SIGNATURE =
  process.argv[2] || '2kPZcacaCPdADXZcA9gz9KmdmZR8UA3JxbkbMggjeqzYiP9tUckVLPxoJJug6USrqFkrBo7GYzARUgkCwqSrn86o'

function looksShortened(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false
  const t = s.trim()
  if (t.includes('...') && t.length <= 15) return true
  if (/^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/.test(t)) return true
  return false
}

async function main() {
  if (!MONGO_URI) {
    console.error('MONGO_URI or MONGODB_URI required in .env')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  const db = mongoose.connection.db
  if (!db) throw new Error('No DB connection')

  const kolColl = db.collection('influencerwhaletransactionsv2')
  const cacheColl = db.collection('tokenmetadatacache')

  console.log('\n=== KOL transaction by signature ===')
  console.log('Signature:', SIGNATURE)

  const txns = await kolColl.find({ signature: SIGNATURE }).toArray()
  if (txns.length === 0) {
    console.log('No KOL transaction found with this signature.')
    await mongoose.disconnect()
    process.exit(0)
    return
  }

  for (const t of txns) {
    const txn = t as any
    console.log('\n--- Record (type: ' + (txn.type || '?') + ') ---')
    console.log('tokenInSymbol:', txn.tokenInSymbol ?? '(missing)')
    console.log('tokenInName:', txn.tokenInName ?? '(missing)')
    console.log('tokenInAddress:', txn.tokenInAddress ?? '(missing)')
    console.log('tokenOutSymbol:', txn.tokenOutSymbol ?? '(missing)')
    console.log('tokenOutName:', txn.tokenOutName ?? '(missing)')
    console.log('tokenOutAddress:', txn.tokenOutAddress ?? '(missing)')

    const inShort = looksShortened(txn.tokenInSymbol) || looksShortened(txn.tokenInName)
    const outShort = looksShortened(txn.tokenOutSymbol) || looksShortened(txn.tokenOutName)
    if (inShort) console.log('  ^ tokenIn symbol/name LOOKS SHORTENED')
    if (outShort) console.log('  ^ tokenOut symbol/name LOOKS SHORTENED')
  }

  const first = txns[0] as any
  const inAddr = first?.tokenInAddress
  const outAddr = first?.tokenOutAddress

  console.log('\n=== TokenMetadataCache for these tokens ===')
  for (const addr of [inAddr, outAddr]) {
    if (!addr) continue
    const cached = await cacheColl.findOne({ tokenAddress: addr })
    if (!cached) {
      console.log(`\n${addr.slice(0, 8)}... : NOT IN CACHE`)
      continue
    }
    const c = cached as any
    console.log(`\n${addr}`)
    console.log('  symbol:', c.symbol ?? '(missing)')
    console.log('  name:', c.name ?? '(missing)')
    console.log('  source:', c.source ?? '(missing)')
    console.log('  lastUpdated:', c.lastUpdated ?? c.updatedAt)
    const symShort = looksShortened(c.symbol)
    const nameShort = looksShortened(c.name)
    if (symShort || nameShort) console.log('  *** CACHE CONTAINS SHORTENED (should not happen with current saveTokenToCache validation) ***')
  }

  // Also list any cache entries that look like shortened (sanity check)
  const allCached = await cacheColl.find({}).toArray()
  const shortenedInCache = allCached.filter((d: any) => looksShortened(d.symbol) || looksShortened(d.name))
  console.log('\n=== Any shortened symbol/name in entire TokenMetadataCache ===')
  console.log('Total cache docs:', allCached.length)
  console.log('Docs with shortened symbol or name:', shortenedInCache.length)
  if (shortenedInCache.length > 0) {
    shortenedInCache.slice(0, 10).forEach((d: any) => {
      console.log('  ', d.tokenAddress?.slice(0, 12) + '...', 'symbol:', d.symbol, 'name:', d.name)
    })
    if (shortenedInCache.length > 10) console.log('  ... and', shortenedInCache.length - 10, 'more')
  }

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
