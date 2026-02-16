/**
 * Check if specific transaction signatures exist in KOL database
 * and diagnose split swap behavior.
 *
 * KOL collection: influencerwhaletransactionsv2
 *
 * Run: npx ts-node scripts/checkMissingKolTransactions.ts
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'

const SIGNATURES = [
  '2pAhjZACyAZCnjeTz8SQqbYRV41YsjrJbaNJqCzDL61254J4y9tqNX9wGp8GREkuKJPULMkhgB4DATCXy7ksNGU4',
  '37TWCmJA16Ms691T4dXf1pDXbfX6wjdV99Pdx22BiDdU9HDCKeT66whARpD5HD68k4xBBn8qh8A6gqUpsrAN89Gt',
  '2zrKkZffZQYKZxhSh1Nq5eDrqrkA96meAiqCUGGzYUCLtErWUfGqri7pxY4FfWtG79skWnzEpybVRdz1JMiuMDX6',
  '381rZ1xgFFHjT5LmW4FLjMqk4knem3zDaypubQTgVC57ZyZyFUtr8iFMMbTYCpoGL8Cjpf7PjKNfp72bxGiTrpw4',
]

const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'EURC']

async function main() {
  const MONGO_URI = process.env.MONGO_URI
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI required')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  const db = mongoose.connection.db!
  const kolCollection = db.collection('influencerwhaletransactionsv2')

  console.log('═'.repeat(80))
  console.log('KOL TRANSACTION CHECK - influencerwhaletransactionsv2')
  console.log('═'.repeat(80))
  console.log(`Checking ${SIGNATURES.length} signatures...\n`)

  for (const sig of SIGNATURES) {
    const txns = await kolCollection.find({ signature: sig }).toArray()
    console.log('─'.repeat(60))
    console.log(`📌 Signature: ${sig.slice(0, 20)}...`)

    if (txns.length === 0) {
      console.log('   ❌ NOT FOUND in KOL collection')
      console.log('   Possible reasons:')
      console.log('      1. Signer wallet is not in influencerwhalesaddressv2 (KOL addresses)')
      console.log('      2. Transaction was never processed by KOL WebSocket / worker')
      console.log('      3. Parser returned no swap (erase/confidence filter)')
      console.log('      4. Transaction exists in whalealltransactionv2 but not KOL')
      console.log('')
      continue
    }

    console.log(`   ✅ Found ${txns.length} record(s)`)
    for (const t of txns) {
      console.log(`      - type: ${t.type}, whaleAddress: ${(t.whaleAddress || '').slice(0, 12)}...`)
      console.log(`      - tokenIn: ${t.tokenInSymbol || 'N/A'}, tokenOut: ${t.tokenOutSymbol || 'N/A'}`)
      console.log(`      - classificationSource: ${t.classificationSource || 'N/A'}`)
      console.log(`      - timestamp: ${t.timestamp ? new Date(t.timestamp).toISOString() : 'N/A'}`)
    }

    // Split swap analysis
    const tokenIn = txns[0]?.tokenInSymbol
    const tokenOut = txns[0]?.tokenOutSymbol
    const tokenInCore = tokenIn && CORE_TOKENS.includes(String(tokenIn).toUpperCase().trim())
    const tokenOutCore = tokenOut && CORE_TOKENS.includes(String(tokenOut).toUpperCase().trim())
    const shouldBeSplit = !tokenInCore && !tokenOutCore && tokenIn && tokenOut

    if (shouldBeSplit && txns.length === 1) {
      console.log('   ⚠️  SPLIT SWAP ISSUE: This looks like token-to-token (non-core ↔ non-core)')
      console.log(`      Expected: 2 records (one BUY, one SELL) with classificationSource split_*`)
      console.log(`      Actual: 1 record, type=${txns[0].type}`)
      console.log('   Why split may not work:')
      console.log('      - Parser did not emit SplitSwapPair (createSplitSwapPair conditions)')
      console.log('      - splitSwapDetector needs exactly 2 active assets + one pos/one neg delta')
      console.log('      - Amount normalizer may have filtered assets before split detection')
      console.log('      - Transaction may have >2 token changes (complex swap)')
    } else if (shouldBeSplit && txns.length === 2) {
      const types = txns.map((t: any) => t.type)
      if (types.includes('buy') && types.includes('sell')) {
        console.log('   ✅ Split swap correctly stored (2 records: BUY + SELL)')
      } else {
        console.log(`   ⚠️  2 records but types: ${types.join(', ')} (expected buy + sell)`)
      }
    } else if (txns.length === 2 && !shouldBeSplit) {
      console.log('   ✅ Correctly stored as 2 records (split swap)')
    }
    console.log('')
  }

  // Also check whale collection for comparison
  const whaleCollection = db.collection('whalealltransactionv2')
  console.log('═'.repeat(80))
  console.log('WHALE COLLECTION CHECK (whalealltransactionv2) - for comparison')
  console.log('═'.repeat(80))

  for (const sig of SIGNATURES) {
    const whaleTxns = await whaleCollection.find({ signature: sig }).toArray()
    if (whaleTxns.length > 0) {
      console.log(`   ${sig.slice(0, 16)}... → ${whaleTxns.length} record(s) in whale collection`)
    }
  }

  await mongoose.disconnect()
  console.log('\n✅ Done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
