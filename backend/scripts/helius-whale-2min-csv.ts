/**
 * Run Helius parser on whale transactions for 2 minutes and write accepted/rejected CSVs.
 *
 * 1. Load whale addresses from MongoDB
 * 2. Subscribe to Helius WebSocket (transactionSubscribe with accountInclude)
 * 3. For each tx: fetch Helius Enhanced, run parseHeliusTransactionV3 with hintSwapper
 * 4. Classify as accepted (swap parsed) or rejected (erase)
 * 5. After 2 minutes (or Ctrl+C): write accepted.csv and rejected.csv to test-reports/
 *
 * Run: npx ts-node scripts/helius-whale-2min-csv.ts
 * Env: MONGO_URI, HELIUS_API_KEY
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import { fetchHeliusParsed } from '../src/utils/heliusParserAdapter'
import { parseHeliusTransactionV3 } from '../src/utils/heliusParserV3'
import type { HeliusTransaction } from '../src/utils/heliusParserV3.types'
import type { ParsedSwap, SplitSwapPair } from '../src/utils/shyftParserV2.types'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_WS_URL =
  process.env.WSS_URL ||
  (HELIUS_API_KEY
    ? `wss://atlas-mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : '')

const RUN_MS = 2 * 60 * 1000 // 2 minutes
const OUT_DIR = path.join(__dirname, '..', 'test-reports')
const TS = Date.now()
const ACCEPTED_CSV = path.join(OUT_DIR, `helius-whale-accepted-${TS}.csv`)
const REJECTED_CSV = path.join(OUT_DIR, `helius-whale-rejected-${TS}.csv`)

type AcceptedRow = {
  signature: string
  whale_address: string
  timestamp_utc: string
  direction: string
  is_split: string
  source: string
}

type RejectedRow = {
  signature: string
  whale_address: string
  timestamp_utc: string
  erase_reason: string
  processing_time_ms?: number
}

const acceptedRows: AcceptedRow[] = []
const rejectedRows: RejectedRow[] = []
let monitoredWhales: string[] = []
let ws: WebSocket | null = null
let processedCount = 0

function escapeCsv(s: string): string {
  const t = String(s ?? '').replace(/"/g, '""')
  if (/[",\n\r]/.test(t)) return `"${t}"`
  return t
}

function getDirection(data: ParsedSwap | SplitSwapPair): string {
  if ('sellRecord' in data && data.sellRecord && data.buyRecord) return 'split'
  return (data as ParsedSwap).direction ?? 'n/a'
}

function writeCsv(filePath: string, header: string, rows: Record<string, string>[]): void {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const lines = [header, ...rows.map((r) => Object.values(r).map(escapeCsv).join(','))]
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

function extractWhalesFromTx(tx: any): string[] {
  const transactionData = tx?.transaction
  const message = transactionData?.transaction?.message ?? transactionData?.message
  const txMeta = transactionData?.meta ?? tx?.meta
  if (!message?.accountKeys || !txMeta) return []

  const accounts = (message.accountKeys as any[]).map((a: any) =>
    typeof a === 'string' ? a : a?.pubkey
  ).filter(Boolean) as string[]
  if (accounts.length === 0) return []

  const whaleSet = new Set(monitoredWhales)
  const matchesFromAccounts = accounts.filter((acc: string) => whaleSet.has(acc))

  const balanceOwners: string[] = []
  if (Array.isArray(txMeta.postTokenBalances)) {
    for (const b of txMeta.postTokenBalances) {
      if (b?.owner) balanceOwners.push(b.owner)
    }
  }
  const matchesFromBalances = balanceOwners.filter((o: string) => whaleSet.has(o))

  const innerAccounts: string[] = []
  if (Array.isArray(txMeta.innerInstructions)) {
    for (const inner of txMeta.innerInstructions) {
      for (const inst of inner?.instructions || []) {
        const accts = inst?.accounts
        if (Array.isArray(accts)) {
          for (const a of accts) {
            const pubkey =
              typeof a === 'number' && accounts[a] ? accounts[a] : typeof a === 'string' ? a : null
            if (pubkey) innerAccounts.push(pubkey)
          }
        }
      }
    }
  }
  const matchesFromInner = innerAccounts.filter((acc: string) => whaleSet.has(acc))

  return [...new Set([...matchesFromAccounts, ...matchesFromBalances, ...matchesFromInner])]
}

async function getWhaleAddresses(): Promise<string[]> {
  await mongoose.connect(MONGO_URI)
  const db = mongoose.connection.db
  if (!db) throw new Error('No DB connection')
  const coll = db.collection('whalesaddresses')
  const docs = await coll.find({}, { projection: { whalesAddress: 1, _id: 0 } }).toArray()
  const addresses = (docs as { whalesAddress?: string[] }[]).flatMap((d) => d.whalesAddress || [])
  await mongoose.disconnect()
  return [...new Set(addresses.filter(Boolean))]
}

async function processOne(signature: string, whaleAddress: string): Promise<void> {
  processedCount++
  const tsUtc = new Date().toISOString()
  console.log(`[${processedCount}] Helius parse ${signature.slice(0, 16)}… whale=${whaleAddress.slice(0, 8)}…`)

  let heliusTx: any = null
  try {
    heliusTx = await Promise.race([
      fetchHeliusParsed(signature),
      new Promise<null>((_, rej) =>
        setTimeout(() => rej(new Error('Helius fetch timeout')), 15000),
      ),
    ])
  } catch (e: any) {
    rejectedRows.push({
      signature,
      whale_address: whaleAddress,
      timestamp_utc: tsUtc,
      erase_reason: `fetch_error: ${e?.message ?? String(e)}`,
    })
    console.log(`  → Rejected (fetch error)`)
    return
  }

  if (!heliusTx) {
    rejectedRows.push({
      signature,
      whale_address: whaleAddress,
      timestamp_utc: tsUtc,
      erase_reason: 'helius_empty',
    })
    console.log(`  → Rejected (empty)`)
    return
  }

  const parseResult = parseHeliusTransactionV3(
    heliusTx as unknown as HeliusTransaction,
    { hintSwapper: whaleAddress },
  )

  if (parseResult.success && parseResult.data) {
    const data = parseResult.data
    const direction = getDirection(data)
    const isSplit = 'sellRecord' in data && data.sellRecord && data.buyRecord ? 'yes' : 'no'
    acceptedRows.push({
      signature,
      whale_address: whaleAddress,
      timestamp_utc: tsUtc,
      direction,
      is_split: isSplit,
      source: heliusTx.source ?? 'unknown',
    })
    console.log(`  → Accepted (${direction}${isSplit === 'yes' ? ' split' : ''})`)
  } else {
    const reason = (parseResult as any).erase?.reason ?? 'unknown'
    const processingTimeMs = (parseResult as any).processingTimeMs
    rejectedRows.push({
      signature,
      whale_address: whaleAddress,
      timestamp_utc: tsUtc,
      erase_reason: reason,
      processing_time_ms: processingTimeMs,
    })
    console.log(`  → Rejected (${reason})`)
  }
}

function handleTransactionEvent(tx: any): void {
  const signature = tx?.signature
  if (!signature || typeof signature !== 'string') return

  const uniqueWhales = extractWhalesFromTx(tx)
  if (uniqueWhales.length === 0) {
    console.log('  → No whale in tx, skip')
    return
  }

  const whaleAddress = uniqueWhales[0]
  processOne(signature, whaleAddress).catch((err) => {
    console.error(`Error ${signature}:`, err)
    rejectedRows.push({
      signature,
      whale_address: whaleAddress,
      timestamp_utc: new Date().toISOString(),
      erase_reason: `error: ${(err as Error)?.message ?? String(err)}`,
    })
  })
}

function closeAndWrite(): void {
  if (ws) {
    try {
      ws.removeAllListeners()
      ws.close()
    } catch (_) {}
    ws = null
  }

  const acceptedHeader = 'signature,whale_address,timestamp_utc,direction,is_split,source'
  const rejectedHeader = 'signature,whale_address,timestamp_utc,erase_reason,processing_time_ms'

  writeCsv(
    ACCEPTED_CSV,
    acceptedHeader,
    acceptedRows.map((r) => ({
      signature: r.signature,
      whale_address: r.whale_address,
      timestamp_utc: r.timestamp_utc,
      direction: r.direction,
      is_split: r.is_split,
      source: r.source,
    })),
  )
  writeCsv(
    REJECTED_CSV,
    rejectedHeader,
    rejectedRows.map((r) => ({
      signature: r.signature,
      whale_address: r.whale_address,
      timestamp_utc: r.timestamp_utc,
      erase_reason: r.erase_reason,
      processing_time_ms: r.processing_time_ms != null ? String(r.processing_time_ms) : '',
    })),
  )

  console.log('\n--- Helius whale 2min run ---')
  console.log('Total processed:', processedCount)
  console.log('Accepted:', acceptedRows.length, '→', ACCEPTED_CSV)
  console.log('Rejected:', rejectedRows.length, '→', REJECTED_CSV)
}

function connectAndSubscribe(): void {
  if (ws) {
    try {
      ws.removeAllListeners()
      ws.close()
    } catch (_) {}
    ws = null
  }

  console.log('Connecting to Helius WebSocket…')
  ws = new WebSocket(HELIUS_WS_URL)

  ws.on('open', () => {
    console.log('Subscribing to', monitoredWhales.length, 'whale addresses for 2 minutes…')
    ws!.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'transactionSubscribe',
        params: [
          { accountInclude: monitoredWhales },
          {
            commitment: 'finalized',
            encoding: 'jsonParsed',
            transactionDetails: 'full',
            showRewards: false,
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    )
  })

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString('utf8'))
      if (msg.result != null && msg.id != null) {
        console.log('Subscription confirmed.')
      } else if (msg.method === 'transactionNotification') {
        const tx = msg.params?.result
        if (tx) handleTransactionEvent(tx)
      }
    } catch (e) {
      console.error('Message parse error:', e)
    }
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })

  ws.on('close', (code, reason) => {
    console.log('WebSocket closed:', code, reason?.toString())
    ws = null
  })
}

async function main(): Promise<void> {
  if (!MONGO_URI) {
    console.error('Set MONGO_URI or MONGODB_URI')
    process.exit(1)
  }
  if (!HELIUS_API_KEY || !HELIUS_WS_URL) {
    console.error('Set HELIUS_API_KEY for Helius fetch and WebSocket')
    process.exit(1)
  }

  console.log('Loading whale addresses…')
  monitoredWhales = await getWhaleAddresses()
  console.log('Whales loaded:', monitoredWhales.length)
  if (monitoredWhales.length === 0) {
    console.error('No whale addresses found')
    process.exit(1)
  }

  const timeout = setTimeout(() => {
    console.log('\n2 minutes elapsed. Stopping…')
    closeAndWrite()
    process.exit(0)
  }, RUN_MS)

  process.on('SIGINT', () => {
    clearTimeout(timeout)
    console.log('\nStopping…')
    closeAndWrite()
    process.exit(0)
  })

  connectAndSubscribe()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
