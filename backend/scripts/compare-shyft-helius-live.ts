/**
 * LIVE: Track whale transactions using BOTH SHYFT and Helius.
 *
 * 1. Load ALL whale addresses from MongoDB (whalesaddresses)
 * 2. Subscribe to Helius WebSocket (transactionSubscribe with accountInclude)
 * 3. On each transaction: run parser on SHYFT data AND on Helius data (same parser, both with hintSwapper)
 * 4. Log comparison and append to CSV (signature, shyft_result, helius_result, category, winner, ...)
 *
 * Run: npx ts-node scripts/compare-shyft-helius-live.ts
 * Stop: Ctrl+C (writes final CSV and summary)
 *
 * Env: MONGO_URI, SHYFT_API_KEY, HELIUS_API_KEY
 */

import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import WebSocket from 'ws'
import mongoose from 'mongoose'
import { getParsedTransactions } from '../src/config/getParsedTransaction'
import { parseShyftTransactionV2 } from '../src/utils/shyftParserV2'
import type { ShyftTransactionV2 } from '../src/utils/shyftParserV2'
import type { ParsedSwap, SplitSwapPair } from '../src/utils/shyftParserV2.types'
import { fetchHeliusParsed, buildV2InputFromHelius } from '../src/utils/heliusParserAdapter'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const MONGO_URI = process.env.MONGO_URI || ''
const SHYFT_API_KEY = process.env.SHYFT_API_KEY
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_WS_URL =
  process.env.WSS_URL ||
  (HELIUS_API_KEY
    ? `wss://atlas-mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : '')

const DOCS_DIR = path.join(__dirname, '../../docs')
const CSV_PATH = path.join(DOCS_DIR, 'parser-comparison-shyft-helius-LIVE.csv')

type Row = {
  signature: string
  whale_address: string
  ts_utc: string
  shyft_result: 'valid' | 'erase'
  shyft_erase_reason: string
  shyft_direction: string
  helius_result: 'valid' | 'erase'
  helius_erase_reason: string
  helius_direction: string
  category: 'both_accepted' | 'both_missed' | 'shyft_only' | 'helius_only'
  winner: 'shyft' | 'helius' | 'both' | 'none'
}

const rows: Row[] = []
let shyftValid = 0
let heliusValid = 0
let bothAccepted = 0
let bothMissed = 0
let shyftOnly = 0
let heliusOnly = 0
let processedCount = 0
let ws: WebSocket | null = null
let monitoredWhales: string[] = []
const csvHeader =
  'signature,whale_address,ts_utc,shyft_result,shyft_erase_reason,shyft_direction,helius_result,helius_erase_reason,helius_direction,category,winner'

function escapeCsv(s: string): string {
  const t = String(s ?? '').replace(/"/g, '""')
  if (/[",\n\r]/.test(t)) return `"${t}"`
  return t
}

function rowToCsvLine(r: Row): string {
  return [
    escapeCsv(r.signature),
    escapeCsv(r.whale_address),
    escapeCsv(r.ts_utc),
    escapeCsv(r.shyft_result),
    escapeCsv(r.shyft_erase_reason),
    escapeCsv(r.shyft_direction),
    escapeCsv(r.helius_result),
    escapeCsv(r.helius_erase_reason),
    escapeCsv(r.helius_direction),
    escapeCsv(r.category),
    escapeCsv(r.winner),
  ].join(',')
}

function appendCsvRow(r: Row): void {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })
  const exists = fs.existsSync(CSV_PATH)
  const line = rowToCsvLine(r) + '\n'
  if (!exists) fs.writeFileSync(CSV_PATH, csvHeader + '\n' + line, 'utf8')
  else fs.appendFileSync(CSV_PATH, line, 'utf8')
}

function getDirection(data: ParsedSwap | SplitSwapPair): string {
  if ('sellRecord' in data && data.sellRecord && data.buyRecord) return 'split'
  return (data as ParsedSwap).direction ?? 'n/a'
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

function extractWhalesFromTx(tx: any): string[] {
  // Same shape as whale.controller: tx.transaction.transaction.message, tx.transaction.meta
  const transactionData = tx?.transaction
  const message = transactionData?.transaction?.message ?? transactionData?.message
  const txMeta = transactionData?.meta
  if (!message?.accountKeys || !txMeta) return []

  const accounts = message.accountKeys.map((a: any) =>
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

function buildV2InputFromShyft(signature: string, parsedTx: any): ShyftTransactionV2 {
  const result = parsedTx?.result ?? parsedTx
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

async function runShyft(signature: string, hintSwapper: string): Promise<{ success: boolean; data?: ParsedSwap | SplitSwapPair; eraseReason?: string }> {
  try {
    const raw = await getParsedTransactions(signature)
    if (!raw) return { success: false, eraseReason: 'shyft_fetch_failed' }
    const parsedTx = typeof raw === 'string' ? JSON.parse(raw) : raw
    const v2Input = buildV2InputFromShyft(signature, parsedTx)
    const result = parseShyftTransactionV2(v2Input, { hintSwapper })
    if (result.success && result.data) return { success: true, data: result.data }
    return { success: false, eraseReason: result.erase?.reason ?? 'unknown' }
  } catch (e: any) {
    return { success: false, eraseReason: `shyft_error: ${e?.message ?? String(e)}` }
  }
}

async function runHelius(signature: string, hintSwapper: string): Promise<{ success: boolean; data?: ParsedSwap | SplitSwapPair; eraseReason?: string }> {
  try {
    const helius = await fetchHeliusParsed(signature)
    if (!helius) return { success: false, eraseReason: 'helius_empty' }
    const v2Input = buildV2InputFromHelius(signature, helius)
    const result = parseShyftTransactionV2(v2Input, { hintSwapper })
    if (result.success && result.data) return { success: true, data: result.data }
    return { success: false, eraseReason: result.erase?.reason ?? 'unknown' }
  } catch (e: any) {
    return { success: false, eraseReason: `helius_error: ${e?.message ?? String(e)}` }
  }
}

async function processLiveTx(signature: string, whaleAddress: string): Promise<void> {
  processedCount++
  const tsUtc = new Date().toISOString()
  console.log(`[${processedCount}] Fetching SHYFT + Helius for ${signature.slice(0, 16)}… whale=${whaleAddress.slice(0, 8)}…`)

  const [shyftOut, heliusOut] = await Promise.all([
    runShyft(signature, whaleAddress),
    runHelius(signature, whaleAddress),
  ])

  const sOk = shyftOut.success && shyftOut.data
  const hOk = heliusOut.success && heliusOut.data

  if (sOk) shyftValid++
  if (hOk) heliusValid++
  if (sOk && hOk) bothAccepted++
  if (!sOk && !hOk) bothMissed++
  if (sOk && !hOk) shyftOnly++
  if (!sOk && hOk) heliusOnly++

  const shyftDir = sOk ? getDirection(shyftOut.data!) : 'n/a'
  const heliusDir = hOk ? getDirection(heliusOut.data!) : 'n/a'

  let category: Row['category'] = 'both_missed'
  if (sOk && hOk) category = 'both_accepted'
  else if (sOk) category = 'shyft_only'
  else if (hOk) category = 'helius_only'

  let winner: Row['winner'] = 'none'
  if (sOk && hOk) winner = 'both'
  else if (sOk) winner = 'shyft'
  else if (hOk) winner = 'helius'

  const row: Row = {
    signature,
    whale_address: whaleAddress,
    ts_utc: tsUtc,
    shyft_result: sOk ? 'valid' : 'erase',
    shyft_erase_reason: shyftOut.eraseReason ?? '',
    shyft_direction: shyftDir,
    helius_result: hOk ? 'valid' : 'erase',
    helius_erase_reason: heliusOut.eraseReason ?? '',
    helius_direction: heliusDir,
    category,
    winner,
  }
  rows.push(row)
  appendCsvRow(row)

  console.log(
    `  PARSER | SHYFT: ${row.shyft_result} ${row.shyft_direction} | Helius: ${row.helius_result} ${row.helius_direction} | category: ${row.category} | winner: ${row.winner}`
  )
}

function handleTransactionEvent(tx: any): void {
  const signature = tx?.signature
  if (!signature || typeof signature !== 'string') return

  const uniqueWhales = extractWhalesFromTx(tx)
  if (uniqueWhales.length === 0) {
    console.log('  → No whale matched in this tx, skipping')
    return
  }

  const whaleAddress = uniqueWhales[0]
  console.log(`  → Whale matched. Running BOTH parsers (SHYFT + Helius) for ${signature.slice(0, 16)}…`)
  processLiveTx(signature, whaleAddress).catch((err) => {
    console.error(`Error processing ${signature}:`, err)
  })
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
    console.log('Connected. Subscribing to', monitoredWhales.length, 'whale addresses…')
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
      })
    )
  })

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString('utf8'))
      if (msg.result != null && msg.id != null) {
        console.log('Subscription confirmed (id=', msg.id, ')')
      } else if (msg.method === 'transactionNotification') {
        const tx = msg.params?.result
        if (tx) {
          console.log('Tx notification:', tx.signature?.slice(0, 16) + '…')
          handleTransactionEvent(tx)
        }
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
    setTimeout(connectAndSubscribe, 5000)
  })
}

function printSummary(): void {
  console.log('\n--- Live run summary ---')
  console.log('Total processed: ', processedCount)
  console.log('SHYFT valid:     ', shyftValid)
  console.log('Helius valid:    ', heliusValid)
  console.log('Both accepted:   ', bothAccepted)
  console.log('Both missed:     ', bothMissed)
  console.log('SHYFT only:      ', shyftOnly)
  console.log('Helius only:     ', heliusOnly)
  console.log('CSV:', CSV_PATH)
}

async function main(): Promise<void> {
  if (!MONGO_URI || !SHYFT_API_KEY || !HELIUS_API_KEY) {
    console.error('Set MONGO_URI, SHYFT_API_KEY, HELIUS_API_KEY')
    process.exit(1)
  }
  if (!HELIUS_WS_URL) {
    console.error('HELIUS_API_KEY or WSS_URL required for live stream')
    process.exit(1)
  }

  console.log('Loading whale addresses from DB…')
  monitoredWhales = await getWhaleAddresses()
  console.log('Whale addresses loaded:', monitoredWhales.length)
  if (monitoredWhales.length === 0) {
    console.error('No whale addresses found')
    process.exit(1)
  }

  process.on('SIGINT', () => {
    console.log('\nStopping…')
    if (ws) {
      ws.removeAllListeners()
      ws.close()
      ws = null
    }
    printSummary()
    process.exit(0)
  })

  connectAndSubscribe()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
