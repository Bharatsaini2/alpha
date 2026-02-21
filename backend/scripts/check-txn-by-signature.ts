/**
 * One-off: Check how many whale records exist for a given signature and their types.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/check-txn-by-signature.ts
 * Or:   SIGNATURE=Cz7MxubwfqFgSuSZb7CruiUbkRuLE6dJgbqiWcZPMAbw npx ts-node -r tsconfig-paths/register scripts/check-txn-by-signature.ts
 *
 * Expectation:
 * - Single swap → 1 record with type 'both' | 'buy' | 'sell'
 * - Split swap → 2 records: one type 'sell', one type 'buy'
 */

import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'

const SIGNATURE = process.env.SIGNATURE || 'Cz7MxubwfqFgSuSZb7CruiUbkRuLE6dJgbqiWcZPMAbw'

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Set MONGODB_URI or MONGO_URI')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log('Connected to MongoDB\n')

  const docs = await whaleAllTransactionModelV2
    .find({ signature: SIGNATURE })
    .lean()

  console.log(`Signature: ${SIGNATURE}`)
  console.log(`Records found: ${docs.length}\n`)

  if (docs.length === 0) {
    console.log('No whale records for this signature. Check:')
    console.log('  - Is the signature correct?')
    console.log('  - Was the whale tracked when this tx was processed?')
    console.log('  - Collection: whalealltransactionv2s (Mongoose default for whaleAllTransactionV2)')
    await mongoose.disconnect()
    process.exit(0)
    return
  }

  docs.forEach((d: any, i: number) => {
    console.log(`--- Record ${i + 1} ---`)
    console.log('  type:', d.type)
    console.log('  classificationSource:', d.classificationSource ?? '(none)')
    console.log('  whaleAddress:', d.whaleAddress ?? d.whale?.address)
    console.log('  tokenIn:', d.tokenInSymbol, '| tokenOut:', d.tokenOutSymbol)
    console.log('  amount.buyAmount:', d.amount?.buyAmount, '| amount.sellAmount:', d.amount?.sellAmount)
    console.log('  timestamp:', d.timestamp)
    console.log('')
  })

  const hasSell = docs.some((d: any) => d.type === 'sell')
  const hasBuy = docs.some((d: any) => d.type === 'buy')
  const hasBoth = docs.some((d: any) => d.type === 'both')

  if (docs.length === 1 && (hasSell || hasBuy)) {
    console.log('Note: Only one record with type "sell" or "buy" may indicate an incomplete split swap (second leg missing).')
  }
  if (docs.length === 2 && hasSell && hasBuy) {
    console.log('Split swap: 2 records (sell + buy) — expected.')
  }
  if (docs.length === 1 && hasBoth) {
    console.log('Single swap: 1 record with type "both" — expected.')
  }

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
