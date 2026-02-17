/**
 * Parser V2 Live Test - 10 Minute Real Environment Simulation
 *
 * Simulates production flow with ALL Parser V2 fixes (Tasks 1-9):
 * - Multi-source whale/KOL matching
 * - Full v2Input (real fee_payer, signers, token_balance_changes)
 * - Swapper validation
 *
 * Does NOT save to database. Outputs to separate CSVs (whale + KOL). Runs 10 minutes.
 * Compares results with production DB for quality/response/amounts.
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import mongoose from 'mongoose'

dotenv.config({ path: path.join(__dirname, '../.env') })

// Dynamic imports after dotenv
const WebSocket = require('ws')
const { getParsedTransactions } = require('../src/config/getParsedTransaction')
const { parseShyftTransactionV2 } = require('../src/utils/shyftParserV2')
const WhalesAddressModel = require('../src/models/solana-tokens-whales').default
const InfluencerWhalesAddressModelV2 = require('../src/models/Influencer-wallet-whalesV2').default
const whaleAllTransactionModelV2 = require('../src/models/whaleAllTransactionsV2.model').default
const influencerWhaleTransactionsModelV2 = require('../src/models/influencerWhaleTransactionsV2.model').default

// ============================================================================
// CONFIG
// ============================================================================

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''
const WSS_URL =
  process.env.WSS_URL ||
  (HELIUS_API_KEY
    ? `wss://atlas-mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : '')

const TEST_DURATION_MS = 10 * 60 * 1000 // 10 minutes
const OUTPUT_DIR = path.join(__dirname, '../../fixingv2/live-test-output')
const WHALE_CSV_HEADER =
  'timestamp,signature,source,whaleAddress,type,tokenInSymbol,tokenOutSymbol,buyAmount,sellAmount,protocol,isSplitSwap,classificationSource,frontendPreview'
const KOL_CSV_HEADER =
  'timestamp,signature,source,kolAddress,influencerUsername,type,tokenInSymbol,tokenOutSymbol,buyAmount,sellAmount,protocol,isSplitSwap,classificationSource,frontendPreview'

// ============================================================================
// TYPES
// ============================================================================

interface ParsedRecord {
  timestamp: string
  signature: string
  source: 'alpha' | 'kol'
  whaleOrKolAddress: string
  kolUsername?: string
  type: 'buy' | 'sell' | 'split_sell' | 'split_buy'
  tokenInSymbol: string
  tokenOutSymbol: string
  buyAmount: number
  sellAmount: number
  protocol: string
  isSplitSwap: boolean
  classificationSource: string
  frontendPreview: string
}

// ============================================================================
// STATE
// ============================================================================

let ws: any = null
let testStartTime = 0
const records: ParsedRecord[] = []
const alphaAddresses = new Set<string>()
const kolAddresses = new Set<string>()
const allAddresses: string[] = []
const addressToSource = new Map<string, 'alpha' | 'kol'>()
const addressToKolUsername = new Map<string, string>()

let stats = {
  totalTxNotifications: 0,
  totalMatched: 0,
  totalParsed: 0,
  totalAccepted: 0,
  totalRejected: 0,
  totalSplitSwaps: 0,
  shyftCalls: 0,
  shyftErrors: 0,
}

// ============================================================================
// MULTI-SOURCE MATCHING (Task 1)
// ============================================================================

function multiSourceMatch(tx: any): string[] {
  const txEnvelope = tx?.transaction ?? tx
  const message = txEnvelope?.transaction?.message ?? txEnvelope?.message
  const txMeta = txEnvelope?.meta ?? tx?.transaction?.meta ?? tx?.meta
  if (!message?.accountKeys || !txMeta) return []

  const accounts = message.accountKeys.map((a: any) =>
    typeof a === 'string' ? a : a.pubkey
  )
  const monitored = new Set(allAddresses)

  const fromAccounts = accounts.filter((a: string) => monitored.has(a))

  const balanceOwners: string[] = []
  if (txMeta.postTokenBalances) {
    for (const b of txMeta.postTokenBalances) {
      if (b?.owner) balanceOwners.push(b.owner)
    }
  }
  const fromBalances = balanceOwners.filter((o: string) => monitored.has(o))

  const innerAccounts: string[] = []
  if (txMeta.innerInstructions) {
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
  const fromInner = innerAccounts.filter((a: string) => monitored.has(a))

  const combined = [...fromAccounts, ...fromBalances, ...fromInner]
  return [...new Set(combined)]
}

// ============================================================================
// PROCESS SINGLE TX (full Parser V2 flow, no DB write)
// ============================================================================

async function processTx(
  signature: string,
  tx: any,
  matchedAddresses: string[]
): Promise<void> {
  const txMeta = tx?.transaction?.meta ?? tx?.meta
  if (txMeta?.err !== null) return

  stats.totalMatched += matchedAddresses.length

  let parsedData: string | null = null
  try {
    stats.shyftCalls++
    parsedData = await Promise.race([
      getParsedTransactions(signature),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      ),
    ])
  } catch (e: any) {
    stats.shyftErrors++
    return
  }

  if (!parsedData) return

  let parsedTx: any
  try {
    parsedTx = JSON.parse(parsedData)
  } catch {
    return
  }

  if (!parsedTx.success || !parsedTx.result) return
  stats.totalParsed++

  const v2Input = {
    signature,
    timestamp: parsedTx.result.timestamp
      ? new Date(parsedTx.result.timestamp).getTime()
      : Date.now(),
    status: parsedTx.result.status || 'Success',
    fee: parsedTx.result.fee || 0,
    fee_payer: parsedTx.result.fee_payer ?? parsedTx.result.signers?.[0],
    signers: parsedTx.result.signers ?? [],
    protocol: parsedTx.result.protocol,
    token_balance_changes: parsedTx.result.token_balance_changes ?? [],
    actions: parsedTx.result.actions ?? [],
  }

  const parseResult = parseShyftTransactionV2(v2Input)

  if (!parseResult.success || !parseResult.data) {
    stats.totalRejected++
    return
  }

  const swapData = parseResult.data
  const identifiedSwapper = swapData.swapper
  if (identifiedSwapper === undefined || identifiedSwapper === null) {
    stats.totalRejected++
    return
  }

  for (const whaleOrKol of matchedAddresses) {
    if (identifiedSwapper !== whaleOrKol) continue

    const source = addressToSource.get(whaleOrKol) || 'alpha'
    const protocol = swapData.protocol || 'Unknown'

    if ('sellRecord' in swapData) {
      stats.totalSplitSwaps++
      stats.totalAccepted += 2

      const sellR = swapData.sellRecord
      const buyR = swapData.buyRecord

      records.push({
        timestamp: new Date().toISOString(),
        signature,
        source,
        whaleOrKolAddress: whaleOrKol,
        ...(source === 'kol' && { kolUsername: addressToKolUsername.get(whaleOrKol) ?? '' }),
        type: 'split_sell',
        tokenInSymbol: sellR.quoteAsset?.symbol || 'UNKNOWN',
        tokenOutSymbol: sellR.baseAsset?.symbol || 'UNKNOWN',
        buyAmount: sellR.amounts?.netWalletReceived ?? 0,
        sellAmount: sellR.amounts?.baseAmount ?? 0,
        protocol,
        isSplitSwap: true,
        classificationSource: 'v2_parser_split_sell',
        frontendPreview: JSON.stringify({
          direction: 'SELL',
          tokenIn: sellR.quoteAsset?.symbol,
          tokenOut: sellR.baseAsset?.symbol,
          amount: sellR.amounts?.baseAmount,
        }),
      })
      records.push({
        timestamp: new Date().toISOString(),
        signature,
        source,
        whaleOrKolAddress: whaleOrKol,
        ...(source === 'kol' && { kolUsername: addressToKolUsername.get(whaleOrKol) ?? '' }),
        type: 'split_buy',
        tokenInSymbol: buyR.quoteAsset?.symbol || 'UNKNOWN',
        tokenOutSymbol: buyR.baseAsset?.symbol || 'UNKNOWN',
        buyAmount: buyR.amounts?.baseAmount ?? 0,
        sellAmount: buyR.amounts?.totalWalletCost ?? 0,
        protocol,
        isSplitSwap: true,
        classificationSource: 'v2_parser_split_buy',
        frontendPreview: JSON.stringify({
          direction: 'BUY',
          tokenIn: buyR.quoteAsset?.symbol,
          tokenOut: buyR.baseAsset?.symbol,
          amount: buyR.amounts?.baseAmount,
        }),
      })
    } else {
      stats.totalAccepted++
      const d = swapData as any
      const tokenIn = d.quoteAsset?.symbol || 'UNKNOWN'
      const tokenOut = d.baseAsset?.symbol || 'UNKNOWN'
      const type: 'buy' | 'sell' = d.direction === 'BUY' ? 'buy' : 'sell'

      records.push({
        timestamp: new Date().toISOString(),
        signature,
        source,
        whaleOrKolAddress: whaleOrKol,
        ...(source === 'kol' && { kolUsername: addressToKolUsername.get(whaleOrKol) ?? '' }),
        type,
        tokenInSymbol: tokenIn,
        tokenOutSymbol: tokenOut,
        buyAmount: type === 'buy' ? (d.amounts?.baseAmount ?? 0) : (d.amounts?.netWalletReceived ?? 0),
        sellAmount: type === 'buy' ? (d.amounts?.totalWalletCost ?? 0) : (d.amounts?.baseAmount ?? 0),
        protocol,
        isSplitSwap: false,
        classificationSource: 'v2_parser',
        frontendPreview: JSON.stringify({
          direction: d.direction,
          tokenIn,
          tokenOut,
          baseAmount: d.amounts?.baseAmount,
        }),
      })
    }
  }
}

// ============================================================================
// HANDLE TRANSACTION NOTIFICATION
// ============================================================================

async function handleTransactionNotification(tx: any): Promise<void> {
  const signature = tx?.signature
  if (!signature || !tx?.transaction) return

  stats.totalTxNotifications++

  const matched = multiSourceMatch(tx)
  if (matched.length === 0) return

  await processTx(signature, tx, matched)
}

// ============================================================================
// WEBSOCKET
// ============================================================================

function connectWebSocket(): void {
  console.log('\n🔌 Connecting to Helius WebSocket...')
  ws = new WebSocket(WSS_URL)

  ws.on('open', () => {
    console.log('✅ WebSocket connected')
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        { accountInclude: allAddresses },
        {
          commitment: 'finalized',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    }
    ws.send(JSON.stringify(req))
    console.log(`📡 Subscribed to ${allAddresses.length} addresses (alpha + KOL)`)
  })

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.method === 'transactionNotification') {
        await handleTransactionNotification(msg.params?.result)
      }
    } catch (e) {
      // ignore
    }
  })

  ws.on('error', (e: Error) => console.error('WebSocket error:', e.message))
  ws.on('close', () => console.log('WebSocket closed'))
}

// ============================================================================
// CSV & COMPARISON
// ============================================================================

function escapeCsv(val: string | number): string {
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function writeCsv(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  const whaleRecords = records.filter((r) => r.source === 'alpha')
  const whalePath = path.join(OUTPUT_DIR, `parser-v2-live-whale-${ts}.csv`)
  const whaleLines = [
    WHALE_CSV_HEADER,
    ...whaleRecords.map((r) =>
      [
        r.timestamp,
        r.signature,
        r.source,
        r.whaleOrKolAddress,
        r.type,
        r.tokenInSymbol,
        r.tokenOutSymbol,
        r.buyAmount,
        r.sellAmount,
        r.protocol,
        r.isSplitSwap,
        r.classificationSource,
        escapeCsv(r.frontendPreview),
      ].join(',')
    ),
  ]
  fs.writeFileSync(whalePath, whaleLines.join('\n'))
  console.log(`\n📄 Whale CSV: ${whalePath} (${whaleRecords.length} records)`)

  const kolRecords = records.filter((r) => r.source === 'kol')
  const kolPath = path.join(OUTPUT_DIR, `parser-v2-live-kol-${ts}.csv`)
  const kolLines = [
    KOL_CSV_HEADER,
    ...kolRecords.map((r) =>
      [
        r.timestamp,
        r.signature,
        r.source,
        r.whaleOrKolAddress,
        r.kolUsername ?? '',
        r.type,
        r.tokenInSymbol,
        r.tokenOutSymbol,
        r.buyAmount,
        r.sellAmount,
        r.protocol,
        r.isSplitSwap,
        r.classificationSource,
        escapeCsv(r.frontendPreview),
      ].join(',')
    ),
  ]
  fs.writeFileSync(kolPath, kolLines.join('\n'))
  console.log(`📄 KOL CSV: ${kolPath} (${kolRecords.length} records)`)
}

async function compareWithProduction(): Promise<void> {
  const since = new Date(testStartTime - 60_000) // 1 min buffer
  const testSigs = new Set(records.map((r) => r.signature))

  const [alphaInDb, kolInDb] = await Promise.all([
    whaleAllTransactionModelV2
      .find({ timestamp: { $gte: since } })
      .select('signature type')
      .lean(),
    influencerWhaleTransactionsModelV2
      .find({ timestamp: { $gte: since } })
      .select('signature type')
      .lean(),
  ])

  const prodSigs = new Set(
    [...alphaInDb, ...kolInDb].map((d: any) => d.signature)
  )

  const onlyInTest = [...testSigs].filter((s) => !prodSigs.has(s))
  const inBoth = [...testSigs].filter((s) => prodSigs.has(s))

  const comparisonPath = path.join(
    OUTPUT_DIR,
    `comparison-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`
  )
  const report = [
    '=== Parser V2 Live Test vs Production (last 10 min) ===',
    '',
    `Test start: ${new Date(testStartTime).toISOString()}`,
    `Test duration: ${TEST_DURATION_MS / 1000}s`,
    '',
    'Test (no DB save):',
    `  Total tx notifications: ${stats.totalTxNotifications}`,
    `  Matched (multi-source): ${stats.totalMatched}`,
    `  Parsed (Shyft): ${stats.totalParsed}`,
    `  Accepted (V2): ${stats.totalAccepted}`,
    `  Rejected: ${stats.totalRejected}`,
    `  Split swaps: ${stats.totalSplitSwaps}`,
    `  CSV records: ${records.length}`,
    '',
    'Production DB (last 10 min):',
    `  Alpha records: ${alphaInDb.length}`,
    `  KOL records: ${kolInDb.length}`,
    `  Total: ${alphaInDb.length + kolInDb.length}`,
    '',
    'Comparison:',
    `  Signatures only in test (new / relayer / PDA fix): ${onlyInTest.length}`,
    `  Signatures in both: ${inBoth.length}`,
    '',
  ].join('\n')

  fs.writeFileSync(comparisonPath, report)
  console.log(report)
  console.log(`\n📄 Comparison report: ${comparisonPath}`)
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  Parser V2 Live Test - 10 Min Real Environment (NO DB SAVE)  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  if (!process.env.SHYFT_API_KEY) {
    console.error('❌ SHYFT_API_KEY is required. Set it in .env')
    process.exit(1)
  }
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI or MONGODB_URI is required. Set it in .env')
    process.exit(1)
  }
  if (!WSS_URL) {
    console.error('❌ WSS_URL or HELIUS_API_KEY is required. Set it in .env')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  console.log('✅ Connected to MongoDB')

  const [whaleDocs, kolDocs] = await Promise.all([
    WhalesAddressModel.find({}, 'whalesAddress').lean(),
    InfluencerWhalesAddressModelV2.find({}, 'whalesAddress influencerUsername').lean(),
  ])

  for (const d of whaleDocs as any[]) {
    for (const a of d.whalesAddress || []) {
      alphaAddresses.add(a)
      addressToSource.set(a, 'alpha')
    }
  }
  for (const d of kolDocs as any[]) {
    const username = (d as any).influencerUsername || ''
    for (const a of (d as any).whalesAddress || []) {
      kolAddresses.add(a)
      addressToSource.set(a, 'kol')
      addressToKolUsername.set(a, username)
    }
  }

  allAddresses.push(...new Set([...alphaAddresses, ...kolAddresses]))
  console.log(`📊 Alpha addresses: ${alphaAddresses.size}`)
  console.log(`📊 KOL addresses: ${kolAddresses.size}`)
  console.log(`📊 Total unique: ${allAddresses.length}\n`)

  if (allAddresses.length === 0) {
    console.log('❌ No addresses to track. Exiting.')
    await mongoose.disconnect()
    process.exit(1)
  }

  testStartTime = Date.now()
  connectWebSocket()

  setTimeout(async () => {
    console.log('\n⏰ 10 minutes elapsed. Stopping...')
    if (ws) ws.close()

    writeCsv()
    await compareWithProduction()
    await mongoose.disconnect()
    console.log('\n✅ Done. Check fixingv2/live-test-output/')
    process.exit(0)
  }, TEST_DURATION_MS)

  setInterval(() => {
    const elapsed = Math.floor((Date.now() - testStartTime) / 1000)
    console.log(
      `\r⏱️  ${elapsed}s | Tx: ${stats.totalTxNotifications} | Matched: ${stats.totalMatched} | Accepted: ${stats.totalAccepted} | CSV: ${records.length}`
    )
  }, 5000)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
