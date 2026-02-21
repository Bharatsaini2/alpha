/**
 * Export recent whale + KOL transactions from DB to CSV for matching with website.
 * Run after backend has been saving txns (e.g. with USE_HELIUS_PARSER=true).
 *
 * Usage (from backend/): npx ts-node scripts/export-recent-txns-to-csv.ts
 * Optional: EXPORT_TXNS_HOURS=1 (default 2) or EXPORT_TXNS_LIMIT=200 (default 500)
 */

import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import mongoose from 'mongoose'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../src/models/influencerWhaleTransactionsV2.model'

const MONGO_URI = process.env.MONGO_URI || ''
const HOURS = Math.max(0.1, Math.min(168, Number(process.env.EXPORT_TXNS_HOURS) || 2))
const LIMIT = Math.max(1, Math.min(5000, Number(process.env.EXPORT_TXNS_LIMIT) || 500))

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(
  source: 'whale' | 'kol',
  doc: any,
): string[] {
  const t = doc.transaction || {}
  const ti = t.tokenIn || {}
  const to = t.tokenOut || {}
  return [
    doc.signature ?? '',
    source,
    doc.whaleAddress ?? '',
    doc.type ?? '',
    ti.symbol ?? '',
    ti.name ?? '',
    ti.address ?? '',
    ti.amount ?? '',
    to.symbol ?? '',
    to.name ?? '',
    to.address ?? '',
    to.amount ?? '',
    doc.amount?.buyAmount ?? '',
    doc.amount?.sellAmount ?? '',
    doc.solAmount?.buySolAmount ?? '',
    doc.solAmount?.sellSolAmount ?? '',
    doc.classificationSource ?? '',
    doc.timestamp ? new Date(doc.timestamp).toISOString() : '',
    doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
  ]
}

const HEADER = [
  'signature', 'source', 'whale_address', 'type',
  'token_in_symbol', 'token_in_name', 'token_in_address', 'token_in_amount',
  'token_out_symbol', 'token_out_name', 'token_out_address', 'token_out_amount',
  'buy_amount', 'sell_amount', 'buy_sol_amount', 'sell_sol_amount',
  'classification_source', 'timestamp', 'created_at',
]

async function run() {
  if (!MONGO_URI) {
    console.error('MONGO_URI is required')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 })
  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000)

  console.log(`Exporting transactions since ${since.toISOString()} (limit ${LIMIT} per source)...`)

  const [whaleDocs, kolDocs] = await Promise.all([
    whaleAllTransactionModelV2
      .find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    influencerWhaleTransactionsModelV2
      .find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
  ])

  const lines: string[] = [HEADER.join(',')]
  for (const doc of whaleDocs) lines.push(row('whale', doc).map(escapeCsv).join(','))
  for (const doc of kolDocs) lines.push(row('kol', doc).map(escapeCsv).join(','))

  const outDir = path.join(__dirname, '..', 'test-reports')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `saved-txns-${Date.now()}.csv`)
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')

  console.log(`Whale: ${whaleDocs.length}, KOL: ${kolDocs.length} → ${outPath}`)
  await mongoose.disconnect()
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
