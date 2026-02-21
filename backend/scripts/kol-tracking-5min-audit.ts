/**
 * KOL (Influencer) Tracking 5-Minute Audit
 *
 * 1. Load ALL KOL/influencer whale addresses from MongoDB (influencerwhalesaddressv2 collection)
 * 2. Subscribe to Helius WebSocket with those addresses (using env HELIUS_API_KEY / WSS_URL)
 * 3. For 5 minutes: accept every transaction notification (no address matching on receive)
 * 4. Parse each tx via Shyft getParsedTransactions + V2 parser; keep only SWAP txns
 * 5. Store each txn with wallet-as-is (parser's swapper)
 * 6. Write all txns to CSV in docs/
 * 7. Write report: unique wallets in txns, how many of those are in tracked KOL list
 *
 * Run: npm run kol-audit:5min (from backend/)
 */

import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import { getParsedTransactions } from '../src/config/getParsedTransaction'
import { parseShyftTransactionV2 } from '../src/utils/shyftParserV2'
import influencerWhaleTransactionsModelV2 from '../src/models/influencerWhaleTransactionsV2.model'

dotenv.config({ path: path.join(__dirname, '../.env') })

const RUN_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const PARSE_CONCURRENCY = 2
const PARSE_QUEUE_DRAIN_MS = 800

const MONGO_URI = process.env.MONGO_URI || ''
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_WS_URL =
  process.env.WSS_URL ||
  (HELIUS_API_KEY
    ? `wss://atlas-mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'wss://atlas-mainnet.helius-rpc.com/?api-key=ba7496c3-65bf-4a12-a4a2-fb6c20cd4e96')

const DOCS_DIR = path.join(__dirname, '../../docs')
const CSV_PATH = path.join(DOCS_DIR, 'kol_5min_txns.csv')
const REPORT_PATH = path.join(DOCS_DIR, 'KOL_5MIN_AUDIT_REPORT.md')

interface CsvRow {
  signature: string
  wallet: string
  type: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  timestamp: string
  confidence?: string
}

const rows: CsvRow[] = []
const walletsSeen = new Set<string>()
const signatureQueue: string[] = []
const signaturesAdded = new Set<string>()
let processing = false
let ws: WebSocket | null = null
let runEndTime = 0
let runStartMs = 0
let runEndMs = 0

function escapeCsv(s: unknown): string {
  const str = s === null || s === undefined ? '' : String(s)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function rowToCsvLine(r: CsvRow): string {
  return [
    escapeCsv(r.signature),
    escapeCsv(r.wallet),
    escapeCsv(r.type),
    escapeCsv(r.tokenIn),
    escapeCsv(r.tokenOut),
    escapeCsv(r.amountIn),
    escapeCsv(r.amountOut),
    escapeCsv(r.timestamp),
    escapeCsv(r.confidence ?? ''),
  ].join(',')
}

async function getKolAddresses(): Promise<string[]> {
  await mongoose.connect(MONGO_URI)
  const db = mongoose.connection.db
  if (!db) throw new Error('No DB connection')
  const coll = db.collection('influencerwhalesaddressv2')
  const docs = await coll.find({}, { projection: { whalesAddress: 1, _id: 0 } }).toArray()
  const addresses = (docs as any[]).flatMap((d) => d.whalesAddress || [])
  await mongoose.disconnect()
  return addresses.filter(Boolean)
}

function buildV2Input(parsedTx: any, signature: string): any {
  const result = parsedTx?.result || parsedTx
  return {
    signature,
    timestamp: result.timestamp ? new Date(result.timestamp).getTime() : Date.now(),
    status: result.status || 'Success',
    fee: result.fee || 0,
    fee_payer: result.fee_payer ?? result.signers?.[0],
    signers: result.signers ?? [],
    protocol: result.protocol,
    token_balance_changes: result.token_balance_changes ?? [],
    actions: result.actions ?? [],
  }
}

function swapToRow(signature: string, swap: any, kind: 'single' | 'sell' | 'buy'): CsvRow {
  const dir = swap.direction || (kind === 'sell' ? 'SELL' : kind === 'buy' ? 'BUY' : '')
  const quote = swap.quoteAsset
  const base = swap.baseAsset
  const amounts = swap.amounts || {}
  const tokenIn = dir === 'BUY' ? (quote?.symbol ?? quote?.mint ?? '') : (base?.symbol ?? base?.mint ?? '')
  const tokenOut = dir === 'BUY' ? (base?.symbol ?? base?.mint ?? '') : (quote?.symbol ?? quote?.mint ?? '')
  const amountIn = dir === 'BUY' ? String(amounts.totalWalletCost ?? amounts.swapInputAmount ?? '') : String(amounts.baseAmount ?? '')
  const amountOut = dir === 'BUY' ? String(amounts.baseAmount ?? '') : String(amounts.netWalletReceived ?? amounts.swapOutputAmount ?? '')
  return {
    signature,
    wallet: swap.swapper ?? '',
    type: dir || 'unknown',
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    timestamp: swap.timestamp ? new Date(swap.timestamp).toISOString() : new Date().toISOString(),
    confidence: swap.confidence,
  }
}

async function processSignature(signature: string): Promise<void> {
  const raw = await getParsedTransactions(signature)
  if (!raw) return
  let parsedTx: any
  try {
    parsedTx = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return
  }
  if (!parsedTx?.success || parsedTx?.result?.type === 'UNKNOWN') return
  const v2Input = buildV2Input(parsedTx, signature)
  const parseResult = parseShyftTransactionV2(v2Input)
  if (!parseResult.success || !parseResult.data) return
  const data = parseResult.data as any
  if ('sellRecord' in data) {
    rows.push(swapToRow(signature, data.sellRecord, 'sell'))
    rows.push(swapToRow(signature, data.buyRecord, 'buy'))
    if (data.swapper) walletsSeen.add(data.swapper)
  } else {
    rows.push(swapToRow(signature, data, 'single'))
    if (data.swapper) walletsSeen.add(data.swapper)
  }
}

async function drainQueue(): Promise<void> {
  if (processing || signatureQueue.length === 0) return
  processing = true
  while (signatureQueue.length > 0 && Date.now() < runEndTime) {
    const batch = signatureQueue.splice(0, PARSE_CONCURRENCY)
    await Promise.all(batch.map((sig) => processSignature(sig).catch((e) => console.error('Parse error', sig, e))))
    if (signatureQueue.length > 0) await new Promise((r) => setTimeout(r, PARSE_QUEUE_DRAIN_MS))
  }
  processing = false
}

function writeCsv(): void {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })
  const header = 'signature,wallet,type,tokenIn,tokenOut,amountIn,amountOut,timestamp,confidence'
  const lines = [header, ...rows.map(rowToCsvLine)]
  fs.writeFileSync(CSV_PATH, lines.join('\n'), 'utf8')
  console.log(`Wrote ${rows.length} rows to ${CSV_PATH}`)
}

interface DbComparison {
  timeWindowStart: string
  timeWindowEnd: string
  auditRecordCount: number
  auditUniqueSigWallet: number
  dbRecordCount: number
  dbUniqueSigWallet: number
  inBoth: number
  auditOnly: number
  dbOnly: number
  auditOnlySample: string[]
  dbOnlySample: string[]
}

async function getDbComparison(): Promise<DbComparison | null> {
  if (!runStartMs || !runEndMs) return null
  await mongoose.connect(MONGO_URI)
  const runStartDate = new Date(runStartMs)
  const runEndDate = new Date(runEndMs)
  const docs = await influencerWhaleTransactionsModelV2
    .find({
      timestamp: { $gte: runStartDate, $lte: runEndDate },
    })
    .select('signature whaleAddress type timestamp')
    .lean()
    .exec()
  await mongoose.disconnect()

  const auditKeys = new Set(rows.map((r) => `${r.signature}|${r.wallet}`))
  const dbKeys = new Set(
    (docs as any[]).map((d) => `${d.signature}|${(d.whaleAddress || '').trim()}`)
  )
  const inBoth = [...auditKeys].filter((k) => dbKeys.has(k)).length
  const auditOnlyKeys = [...auditKeys].filter((k) => !dbKeys.has(k))
  const dbOnlyKeys = [...dbKeys].filter((k) => !auditKeys.has(k))

  return {
    timeWindowStart: runStartDate.toISOString(),
    timeWindowEnd: runEndDate.toISOString(),
    auditRecordCount: rows.length,
    auditUniqueSigWallet: auditKeys.size,
    dbRecordCount: docs.length,
    dbUniqueSigWallet: dbKeys.size,
    inBoth,
    auditOnly: auditOnlyKeys.length,
    dbOnly: dbOnlyKeys.length,
    auditOnlySample: auditOnlyKeys.slice(0, 15),
    dbOnlySample: dbOnlyKeys.slice(0, 15),
  }
}

function writeReport(trackedKol: string[], dbComparison: DbComparison | null): void {
  const trackedSet = new Set(trackedKol.map((a) => a.trim()).filter(Boolean))
  const uniqueWalletsInTxns = [...walletsSeen]
  const inTracked = uniqueWalletsInTxns.filter((w) => trackedSet.has(w))
  const notInTracked = uniqueWalletsInTxns.filter((w) => !trackedSet.has(w))

  let comparisonSection = ''
  if (dbComparison) {
    comparisonSection = `
## Comparison with database (same time window)

Time window used for DB query: **${dbComparison.timeWindowStart}** → **${dbComparison.timeWindowEnd}**  
(Prod/local server should have been writing to DB during this window.)

| Metric | Audit (this run) | DB (influencerWhaleTransactionsV2) |
|--------|------------------|------------------------------------|
| Record count | ${dbComparison.auditRecordCount} | ${dbComparison.dbRecordCount} |
| Unique (signature\|wallet) | ${dbComparison.auditUniqueSigWallet} | ${dbComparison.dbUniqueSigWallet} |
| In both (matched) | — | ${dbComparison.inBoth} |
| Audit only (not in DB) | ${dbComparison.auditOnly} | — |
| DB only (not in audit) | — | ${dbComparison.dbOnly} |

**Sample audit-only (first 15):** ${dbComparison.auditOnlySample.length ? dbComparison.auditOnlySample.join('; ') : '—'}

**Sample DB-only (first 15):** ${dbComparison.dbOnlySample.length ? dbComparison.dbOnlySample.join('; ') : '—'}
`
  }

  const report = `# KOL (Influencer) Tracking 5-Minute Audit Report

**Run:** ${new Date().toISOString()}  
**Duration:** 5 minutes  
**Helius:** Subscribed to all KOL/influencer addresses from DB (no address matching on receive).

## Summary

| Metric | Value |
|--------|--------|
| Tracked KOL addresses (from DB) | ${trackedKol.length} |
| Total swap txns recorded | ${rows.length} |
| Unique wallets in txns | ${uniqueWalletsInTxns.length} |
| Of those in tracked list | ${inTracked.length} |
| Of those NOT in tracked list | ${notInTracked.length} |
${comparisonSection}
## Files

- **CSV:** \`docs/kol_5min_txns.csv\` (signature, wallet, type, tokenIn, tokenOut, amountIn, amountOut, timestamp, confidence)
- **Report:** \`docs/KOL_5MIN_AUDIT_REPORT.md\` (this file)

## Notes

- No address matching was applied on WebSocket receive: every \`transactionNotification\` from Helius was accepted.
- Wallet stored as-is from the parser (swapper).
- Wallets not in tracked list may be relayers, co-signers, or parser attribution differences.
- Comparison is (signature, whaleAddress) key; one signature can have 2 records (buy+sell split).
`

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, report, 'utf8')
  console.log(`Wrote report to ${REPORT_PATH}`)
}

async function main(): Promise<void> {
  console.log('Loading KOL/influencer addresses from MongoDB...')
  const kolAddresses = await getKolAddresses()
  console.log(`Loaded ${kolAddresses.length} KOL addresses`)

  if (kolAddresses.length === 0) {
    console.error('No KOL addresses found. Exiting.')
    process.exit(1)
  }

  runStartMs = Date.now()
  runEndTime = runStartMs + RUN_DURATION_MS
  runEndMs = runEndTime + 2 * 60 * 1000 // 2 min buffer for prod writes
  console.log(`Subscribing to Helius for 5 minutes (until ${new Date(runEndTime).toISOString()})...`)

  ws = new WebSocket(HELIUS_WS_URL)

  ws.on('open', () => {
    console.log('Helius WebSocket connected. Subscribing to all KOL addresses...')
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        { accountInclude: kolAddresses },
        {
          commitment: 'finalized',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    }
    ws!.send(JSON.stringify(request))
  })

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString('utf8'))
      if (msg.method === 'transactionNotification' && msg.params?.result) {
        const tx = msg.params.result
        const sig = tx?.signature
        if (sig && !signaturesAdded.has(sig)) {
          signaturesAdded.add(sig)
          signatureQueue.push(sig)
          drainQueue()
        }
      }
    } catch (_) {}
  })

  ws.on('error', (err) => console.error('WebSocket error:', err))
  ws.on('close', () => console.log('WebSocket closed'))

  const drainInterval = setInterval(drainQueue, 500)

  await new Promise((r) => setTimeout(r, RUN_DURATION_MS))

  clearInterval(drainInterval)
  if (ws) {
    ws.close()
    ws = null
  }
  await new Promise((r) => setTimeout(r, 2000))
  await drainQueue()

  writeCsv()
  console.log('Querying DB for same time window to compare...')
  const dbComparison = await getDbComparison()
  writeReport(kolAddresses, dbComparison)
  console.log('Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
