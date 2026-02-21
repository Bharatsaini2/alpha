/**
 * Live Shadow Test: SHYFT V2 vs Helius V3 Parser
 *
 * Connects to the production DB, fetches recent whale transaction signatures,
 * and runs both parsers against them. Writes detailed CSV + summary CSV.
 *
 * Usage:  npx ts-node test-shadow-v2-vs-v3.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

// Force shadow mode on for this script
process.env.HELIUS_SHADOW_MODE = 'true'

import mongoose from 'mongoose'
import { runShadowComparison, getShadowStats, writeShadowSummary } from './src/utils/heliusParserV3.shadowCompare'

const MONGO_URI = process.env.MONGO_URI || ''
const BATCH_SIZE = 50
const DELAY_BETWEEN_MS = 500 // rate limit buffer

async function getRecentSignatures(limit: number): Promise<string[]> {
  const db = mongoose.connection.db
  if (!db) throw new Error('DB not connected')

  // Discover all collections and find ones with signatures
  const allCollections = await db.listCollections().toArray()
  const collNames = allCollections.map(c => c.name)
  console.log(`  Available collections (${collNames.length}): ${collNames.join(', ')}`)

  // Try collections likely to have transaction signatures
  const candidates = collNames.filter(n =>
    n.toLowerCase().includes('transaction') ||
    n.toLowerCase().includes('whale') ||
    n.toLowerCase().includes('influencer') ||
    n.toLowerCase().includes('trade') ||
    n.toLowerCase().includes('swap')
  )
  console.log(`  Candidate collections: ${candidates.join(', ') || 'none'}`)

  // If no candidates, try all collections for a 'signature' field
  const toSearch = candidates.length > 0 ? candidates : collNames.slice(0, 10)

  const signatures: string[] = []

  for (const collName of toSearch) {
    try {
      const coll = db.collection(collName)
      // First try 'signature', then 'transactionSignature', then 'txSignature'
      for (const field of ['signature', 'transactionSignature', 'txSignature', 'tx_signature']) {
        const docs = await coll
          .find({ [field]: { $exists: true, $ne: null } }, { projection: { [field]: 1 } })
          .sort({ _id: -1 })
          .limit(Math.ceil(limit / Math.max(candidates.length, 1)))
          .toArray()

        if (docs.length > 0) {
          console.log(`  Found ${docs.length} signatures in ${collName}.${field}`)
          for (const doc of docs) {
            const sig = (doc as any)[field]
            if (sig && typeof sig === 'string' && !signatures.includes(sig)) {
              signatures.push(sig)
            }
          }
          break
        }
      }
    } catch (err) {
      console.log(`  Skipping ${collName}: ${err instanceof Error ? err.message : err}`)
    }
  }

  return signatures.slice(0, limit)
}

async function run() {
  console.log('==========================================================')
  console.log('  SHADOW TEST: SHYFT V2 vs Helius V3 Parser')
  console.log('  ' + new Date().toISOString())
  console.log('==========================================================\n')

  // Connect
  console.log('[1/4] Connecting to MongoDB...')
  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 })
  console.log('  Connected to', mongoose.connection.host)

  // Fetch signatures
  console.log(`\n[2/4] Fetching recent transaction signatures...`)
  const sigs = await getRecentSignatures(BATCH_SIZE)
  console.log(`  Found ${sigs.length} unique signatures to test\n`)

  if (sigs.length === 0) {
    console.log('  No signatures found. Exiting.')
    await mongoose.disconnect()
    return
  }

  // Run shadow comparisons
  console.log(`[3/4] Running shadow comparisons (${sigs.length} transactions)...`)
  console.log('  Each txn fetches from SHYFT + Helius APIs, runs V2 + V3 parsers\n')

  let processed = 0
  const verdicts = { MATCH: 0, DIFF: 0, V3_RECOVERED: 0, V3_MISSED: 0, BOTH_ERASE: 0, ERROR: 0 }

  for (const sig of sigs) {
    processed++
    const prefix = `  [${processed}/${sigs.length}]`

    try {
      const result = await runShadowComparison(sig)

      if (!result) {
        console.log(`${prefix} ${sig.slice(0, 12)}... SKIPPED (no data)`)
        verdicts.ERROR++
        continue
      }

      let verdict = 'MATCH'
      if (result.v3.success && !result.v2.success) verdict = 'V3_RECOVERED'
      else if (result.v2.success && !result.v3.success) verdict = 'V3_MISSED'
      else if (!result.v2.success && !result.v3.success) verdict = 'BOTH_ERASE'
      else if (!result.match) verdict = 'DIFF'

      verdicts[verdict as keyof typeof verdicts]++

      const v2Dir = result.v2.success ? result.v2.direction : `ERASE(${result.v2.eraseReason || '?'})`
      const v3Dir = result.v3.success ? result.v3.direction : `ERASE(${result.v3.eraseReason || '?'})`
      const solDiff = result.solAmountDiffPercent !== null
        ? ` sol_diff=${result.solAmountDiffPercent.toFixed(1)}%`
        : ''

      const icon = verdict === 'MATCH' ? 'OK' :
                   verdict === 'V3_RECOVERED' ? '++ V3 WINS' :
                   verdict === 'V3_MISSED' ? '-- V3 MISS' :
                   verdict === 'BOTH_ERASE' ? '~~ ERASE' : '!= DIFF'

      console.log(`${prefix} ${sig.slice(0, 16)}... [${icon}] V2=${v2Dir} V3=${v3Dir}${solDiff}`)
    } catch (err) {
      verdicts.ERROR++
      console.log(`${prefix} ${sig.slice(0, 16)}... ERROR: ${err instanceof Error ? err.message : err}`)
    }

    // Rate limit buffer
    if (processed < sigs.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
    }
  }

  // Summary
  console.log('\n[4/4] Results Summary')
  console.log('==========================================================')

  const stats = getShadowStats()
  console.log(`  Total transactions: ${stats.total}`)
  console.log(`  V2 success rate:    ${stats.v2SuccessRate}`)
  console.log(`  V3 success rate:    ${stats.v3SuccessRate}`)
  console.log(`  Direction match:    ${stats.directionMatchRate}`)
  console.log('')
  console.log(`  MATCH (both agree):   ${verdicts.MATCH}`)
  console.log(`  V3_RECOVERED (V3 > V2): ${verdicts.V3_RECOVERED}  <-- V3 found swaps V2 missed`)
  console.log(`  V3_MISSED (V2 > V3):    ${verdicts.V3_MISSED}  <-- should be ~0`)
  console.log(`  DIFF (disagree):        ${verdicts.DIFF}`)
  console.log(`  BOTH_ERASE:             ${verdicts.BOTH_ERASE}`)
  console.log(`  ERRORS:                 ${verdicts.ERROR}`)
  console.log('')

  // Write summary CSV
  const summaryPath = writeShadowSummary()
  if (summaryPath) {
    console.log(`  Summary CSV: ${summaryPath}`)
  }
  console.log(`  Detail CSV:  ${stats.csvFilePath}`)

  console.log('\n==========================================================')
  console.log('  DONE. Open the CSV files in Excel to review.')
  console.log('==========================================================')

  await mongoose.disconnect()
  process.exit(0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
