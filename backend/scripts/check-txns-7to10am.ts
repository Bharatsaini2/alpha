/**
 * Check transactions from whaleAllTransactionV2 and influencerWhaleTransactionsV2
 * during 7–10 AM window.
 *
 * Run: npx ts-node scripts/check-txns-7to10am.ts [YYYY-MM-DD] [--ist]
 *   --ist  = 7–10 AM IST (otherwise UTC)
 *   Or: npx ts-node scripts/check-txns-7to10am.ts --last3h  (last 3 hours from now)
 *
 * Uses timestamp (on-chain tx time) and createdAt; query matches either.
 */

import dotenv from 'dotenv'
import path from 'path'
import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../src/models/influencerWhaleTransactionsV2.model'

dotenv.config({ path: path.join(__dirname, '../.env') })

const MONGO_URI = process.env.MONGO_URI || ''

function formatDate(d: Date): string {
  return d.toISOString()
}

async function main() {
  const args = process.argv.slice(2)
  const useIst = args.includes('--ist')
  const useLast3h = args.includes('--last3h') || args.length === 0
  const dateArg = args.find((a) => !a.startsWith('--'))

  let startUtc: Date
  let endUtc: Date
  let label: string

  if (useLast3h) {
    endUtc = new Date()
    startUtc = new Date(endUtc.getTime() - 3 * 60 * 60 * 1000)
    label = 'Last 3 hours'
  } else {
    const dateStr = dateArg || new Date().toISOString().slice(0, 10)
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) {
      console.error('Usage: npx ts-node scripts/check-txns-7to10am.ts [YYYY-MM-DD] [--ist] | --last3h')
      process.exit(1)
    }
    if (useIst) {
      startUtc = new Date(Date.UTC(y, m - 1, d, 1, 30, 0, 0))
      endUtc = new Date(Date.UTC(y, m - 1, d, 4, 30, 0, 0))
      label = '7–10 AM IST'
    } else {
      startUtc = new Date(Date.UTC(y, m - 1, d, 7, 0, 0, 0))
      endUtc = new Date(Date.UTC(y, m - 1, d, 10, 0, 0, 0))
      label = '7–10 AM UTC'
    }
  }

  console.log('\n=== Transactions:', label, '===')
  console.log('From:', formatDate(startUtc))
  console.log('To:  ', formatDate(endUtc))
  console.log('')

  await mongoose.connect(MONGO_URI)

  try {
    const filter = {
      $or: [
        { timestamp: { $gte: startUtc, $lt: endUtc } },
        { createdAt: { $gte: startUtc, $lt: endUtc } },
      ],
    }

    // Whale transactions
    const whaleTxns = await whaleAllTransactionModelV2
      .find(filter)
      .sort({ timestamp: -1, createdAt: -1 })
      .lean()

    console.log('--- whaleAllTransactionV2 ---')
    console.log('Count:', whaleTxns.length)
    if (whaleTxns.length > 0) {
      console.log('\nFirst 20:')
      whaleTxns.slice(0, 20).forEach((tx: any, i: number) => {
        const t = tx.createdAt || tx.timestamp
        const ts = t ? new Date(t).toISOString() : '-'
        console.log(
          `  ${i + 1}. ${tx.signature?.slice(0, 16)}… | ${tx.type} | ${tx.whaleAddress?.slice(0, 8)}… | ${tx.tokenOutSymbol || tx.tokenInSymbol || '-'} | ${ts}`,
        )
      })
      if (whaleTxns.length > 20) {
        console.log(`  ... and ${whaleTxns.length - 20} more`)
      }
    }

    // Influencer transactions
    const influencerTxns = await influencerWhaleTransactionsModelV2
      .find(filter)
      .sort({ timestamp: -1, createdAt: -1 })
      .lean()

    console.log('\n--- influencerWhaleTransactionsV2 ---')
    console.log('Count:', influencerTxns.length)
    if (influencerTxns.length > 0) {
      console.log('\nFirst 20:')
      influencerTxns.slice(0, 20).forEach((tx: any, i: number) => {
        const t = tx.createdAt || tx.timestamp
        const ts = t ? new Date(t).toISOString() : '-'
        console.log(
          `  ${i + 1}. ${tx.signature?.slice(0, 16)}… | ${tx.type} | ${tx.whaleAddress?.slice(0, 8)}… | ${tx.influencerName || '-'} | ${ts}`,
        )
      })
      if (influencerTxns.length > 20) {
        console.log(`  ... and ${influencerTxns.length - 20} more`)
      }
    }

    console.log('\n--- Summary ---')
    console.log('Whale total:', whaleTxns.length)
    console.log('Influencer total:', influencerTxns.length)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
