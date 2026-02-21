/**
 * Live 5-Minute V2 vs V3 Parser Comparison
 *
 * Subscribes to the Helius WebSocket for whale + KOL addresses,
 * captures real-time transaction signatures, runs both SHYFT V2 and Helius V3
 * parsers on each, and generates 3 CSV reports:
 *
 *   1. whale-transactions-{ts}.csv    — per-txn whale results
 *   2. kol-transactions-{ts}.csv      — per-txn KOL results
 *   3. comparison-summary-{ts}.csv    — aggregate stats
 *
 * Usage (run from backend/): npx ts-node test-live-5min-v2-vs-v3.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import mongoose from 'mongoose'
import WebSocket from 'ws'
import { getParsedTransactions } from './src/config/getParsedTransaction'
import { parseShyftTransactionV2, type ShyftTransactionV2 } from './src/utils/shyftParserV2'
import { parseHeliusTransactionV3 } from './src/utils/heliusParserV3'
import { fetchHeliusParsed } from './src/utils/heliusParserAdapter'
import type { HeliusTransaction } from './src/utils/heliusParserV3.types'
import type { ParserResult, ParsedSwap, SplitSwapPair } from './src/utils/shyftParserV2.types'

const MONGO_URI = process.env.MONGO_URI || ''
const WSS_URL = process.env.WSS_URL || ''
const DURATION_MS = 5 * 60 * 1000
const DELAY_BETWEEN_PARSE_MS = 350 // rate-limit breathing room

// ============================================================================
// Types
// ============================================================================

interface TxnRow {
  signature: string
  source: 'whale' | 'kol'
  walletAddress: string
  timestamp: string

  v2_success: boolean
  v2_direction: string
  v2_sol: string
  v2_token_amount: string
  v2_token_mint: string
  v2_erase_reason: string
  v2_protocol: string

  v3_success: boolean
  v3_direction: string
  v3_sol: string
  v3_token_amount: string
  v3_token_mint: string
  v3_erase_reason: string
  v3_protocol: string

  direction_match: boolean
  sol_diff_pct: string
  verdict: string
}

// ============================================================================
// CSV helpers
// ============================================================================

const TXN_HEADER = [
  'signature', 'wallet_address', 'timestamp',
  'v2_success', 'v2_direction', 'v2_sol', 'v2_token_amount', 'v2_token_mint', 'v2_erase_reason', 'v2_protocol',
  'v3_success', 'v3_direction', 'v3_sol', 'v3_token_amount', 'v3_token_mint', 'v3_erase_reason', 'v3_protocol',
  'direction_match', 'sol_diff_pct', 'verdict',
].join(',')

function csvLine(r: TxnRow): string {
  return [
    r.signature, r.walletAddress, r.timestamp,
    r.v2_success, r.v2_direction, r.v2_sol, r.v2_token_amount, r.v2_token_mint,
    `"${r.v2_erase_reason}"`, `"${r.v2_protocol}"`,
    r.v3_success, r.v3_direction, r.v3_sol, r.v3_token_amount, r.v3_token_mint,
    `"${r.v3_erase_reason}"`, `"${r.v3_protocol}"`,
    r.direction_match, r.sol_diff_pct, r.verdict,
  ].join(',')
}

// ============================================================================
// Parse result extraction
// ============================================================================

function extractFields(result: ParserResult | null): {
  success: boolean; direction: string; sol: string; tokenAmount: string;
  tokenMint: string; eraseReason: string; protocol: string;
} {
  if (!result || !result.success || !result.data) {
    return {
      success: false, direction: '', sol: '', tokenAmount: '', tokenMint: '',
      eraseReason: result?.erase?.reason ?? 'parse_failed', protocol: '',
    }
  }
  const data = result.data

  // SplitSwapPair
  if ('sellRecord' in data && 'buyRecord' in data) {
    const sp = data as SplitSwapPair
    const sellSol = sp.sellRecord.amounts.netWalletReceived ?? sp.sellRecord.amounts.swapOutputAmount ?? 0
    const buySol = sp.buyRecord.amounts.totalWalletCost ?? sp.buyRecord.amounts.swapInputAmount ?? 0
    return {
      success: true, direction: 'SPLIT',
      sol: Math.max(Number(sellSol), Number(buySol)).toFixed(6),
      tokenAmount: `SELL:${Number(sp.sellRecord.amounts.baseAmount).toFixed(2)} BUY:${Number(sp.buyRecord.amounts.baseAmount).toFixed(2)}`,
      tokenMint: `${sp.sellRecord.baseAsset?.mint?.slice(0, 10) || '?'}/${sp.buyRecord.baseAsset?.mint?.slice(0, 10) || '?'}`,
      eraseReason: '', protocol: sp.protocol || '',
    }
  }

  // Standard ParsedSwap
  const swap = data as ParsedSwap
  const solAmt = swap.direction === 'BUY'
    ? (swap.amounts.totalWalletCost ?? swap.amounts.swapInputAmount ?? 0)
    : (swap.amounts.netWalletReceived ?? swap.amounts.swapOutputAmount ?? 0)
  return {
    success: true, direction: swap.direction,
    sol: Number(solAmt).toFixed(6),
    tokenAmount: Number(swap.amounts.baseAmount).toFixed(2),
    tokenMint: swap.baseAsset?.mint?.slice(0, 12) || '',
    eraseReason: '', protocol: swap.protocol || '',
  }
}

// ============================================================================
// Process a single signature through both parsers
// ============================================================================

async function processOneSig(
  sig: string, source: 'whale' | 'kol', walletAddr: string,
): Promise<TxnRow | null> {
  try {
    // Fetch from both APIs in parallel
    const [shyftRaw, heliusTx] = await Promise.allSettled([
      getParsedTransactions(sig).catch(() => null),
      fetchHeliusParsed(sig).catch(() => null),
    ])

    // ── V2 (SHYFT) ──
    let v2Result: ParserResult | null = null
    const shyftStr = shyftRaw.status === 'fulfilled' ? shyftRaw.value : null
    if (shyftStr) {
      try {
        const parsedTx = JSON.parse(shyftStr)
        if (parsedTx.success && parsedTx.result) {
          const v2Input: ShyftTransactionV2 = {
            signature: sig,
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
          v2Result = parseShyftTransactionV2(v2Input, { hintSwapper: walletAddr })
        }
      } catch {}
    }

    // ── V3 (Helius) ──
    let v3Result: ParserResult | null = null
    const heliusData = heliusTx.status === 'fulfilled' ? heliusTx.value : null
    if (heliusData) {
      v3Result = parseHeliusTransactionV3(
        heliusData as unknown as HeliusTransaction,
        { hintSwapper: walletAddr },
      )
    }

    const v2 = extractFields(v2Result)
    const v3 = extractFields(v3Result)

    const dirMatch = (v2.direction === v3.direction) || (!v2.success && !v3.success)
    let solDiff = ''
    if (v2.success && v3.success && Number(v2.sol) > 0) {
      solDiff = (((Number(v3.sol) - Number(v2.sol)) / Number(v2.sol)) * 100).toFixed(2) + '%'
    }

    let verdict = 'SAME'
    if (v3.success && !v2.success) verdict = 'V3_RECOVERED'
    else if (v2.success && !v3.success) verdict = 'V3_MISSED'
    else if (!v2.success && !v3.success) verdict = 'BOTH_ERASE'
    else if (v2.success && v3.success && dirMatch) verdict = 'MATCH'
    else verdict = 'DIFF'

    return {
      signature: sig, source, walletAddress: walletAddr,
      timestamp: new Date().toISOString(),
      v2_success: v2.success, v2_direction: v2.direction, v2_sol: v2.sol,
      v2_token_amount: v2.tokenAmount, v2_token_mint: v2.tokenMint,
      v2_erase_reason: v2.eraseReason, v2_protocol: v2.protocol,
      v3_success: v3.success, v3_direction: v3.direction, v3_sol: v3.sol,
      v3_token_amount: v3.tokenAmount, v3_token_mint: v3.tokenMint,
      v3_erase_reason: v3.eraseReason, v3_protocol: v3.protocol,
      direction_match: dirMatch, sol_diff_pct: solDiff, verdict,
    }
  } catch (err: any) {
    console.error(`  Error processing ${sig}: ${err.message}`)
    return null
  }
}

// ============================================================================
// Main
// ============================================================================

async function run() {
  const ts = Date.now()
  const reportsDir = path.resolve(__dirname, 'test-reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })

  const whaleFile = path.join(reportsDir, `whale-transactions-${ts}.csv`)
  const kolFile = path.join(reportsDir, `kol-transactions-${ts}.csv`)
  const summaryFile = path.join(reportsDir, `comparison-summary-${ts}.csv`)

  fs.writeFileSync(whaleFile, TXN_HEADER + '\n')
  fs.writeFileSync(kolFile, TXN_HEADER + '\n')

  console.log('==========================================================')
  console.log('  LIVE 5-MIN TEST: V2 (SHYFT) vs V3 (Helius)')
  console.log('  Whale + KOL combined')
  console.log('  ' + new Date().toISOString())
  console.log('==========================================================\n')

  // ── 1. MongoDB ──
  console.log('[1/5] Connecting to MongoDB...')
  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 })
  console.log('  Connected.\n')

  // ── 2. Fetch addresses ──
  console.log('[2/5] Fetching tracked wallet addresses...')
  const db = mongoose.connection.db!

  // Whale: whalesaddresses collection, whalesAddress[] arrays
  let whaleAddresses: string[] = []
  try {
    const wDocs = await db.collection('whalesaddresses')
      .find({}, { projection: { whalesAddress: 1, _id: 0 } })
      .toArray()
    whaleAddresses = wDocs.flatMap((d: any) => d.whalesAddress || []).filter(Boolean)
  } catch {}

  // KOL: influencerwhalesaddressv2 collection, whalesAddress[] arrays
  let kolAddresses: string[] = []
  try {
    const kDocs = await db.collection('influencerwhalesaddressv2')
      .find({}, { projection: { whalesAddress: 1, _id: 0 } })
      .toArray()
    kolAddresses = kDocs.flatMap((d: any) => d.whalesAddress || []).filter(Boolean)
  } catch {}

  // Deduplicate
  whaleAddresses = [...new Set(whaleAddresses)]
  kolAddresses = [...new Set(kolAddresses)]

  const overlap = whaleAddresses.filter(a => kolAddresses.includes(a)).length
  console.log(`  Whale addresses: ${whaleAddresses.length}`)
  console.log(`  KOL addresses:   ${kolAddresses.length} (${kolAddresses.length - overlap} KOL-only, ${overlap} overlap → labeled KOL)`)

  // Build lookup: address → source (KOL takes priority over whale)
  const addrSource = new Map<string, 'whale' | 'kol'>()
  for (const a of whaleAddresses) addrSource.set(a, 'whale')
  for (const a of kolAddresses) addrSource.set(a, 'kol') // KOL overwrites whale for overlaps

  if (addrSource.size === 0) {
    console.log('\n  No addresses found in DB. Exiting.')
    await mongoose.disconnect()
    return
  }

  // ── Stats trackers ──
  const stats = {
    whale: { total: 0, v2_ok: 0, v3_ok: 0, match: 0, diff: 0, v3_recovered: 0, v3_missed: 0, both_erase: 0 },
    kol:   { total: 0, v2_ok: 0, v3_ok: 0, match: 0, diff: 0, v3_recovered: 0, v3_missed: 0, both_erase: 0 },
  }

  // ── 3. WebSocket ──
  console.log(`\n[3/5] Connecting to Helius WebSocket...`)

  const queue: { sig: string; source: 'whale' | 'kol'; wallet: string }[] = []
  const seen = new Set<string>()
  let wsReady = false

  const ws = new WebSocket(WSS_URL)

  ws.on('open', () => {
    console.log('  WebSocket connected.\n')
    wsReady = true

    const allAddrs = [...addrSource.keys()]
    const CHUNK = 50
    for (let i = 0; i < allAddrs.length; i += CHUNK) {
      const chunk = allAddrs.slice(i, i + CHUNK)
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(i / CHUNK) + 1,
        method: 'transactionSubscribe',
        params: [{
          accountInclude: chunk,
        }, {
          commitment: 'finalized',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        }],
      }))
    }
    console.log(`  Subscribed to ${allAddrs.length} addresses (${Math.ceil(allAddrs.length / CHUNK)} chunks)\n`)
  })

  ws.on('message', (raw: any) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.result && msg.id) return // subscription ack

      if (msg.method === 'transactionNotification') {
        const tx = msg.params?.result
        const sig = tx?.signature
        if (!sig || seen.has(sig)) return
        seen.add(sig)

        // Multi-source address matching (mirrors whale.controller.ts logic)
        const transactionData = tx?.transaction
        const message = transactionData?.transaction?.message || transactionData?.message
        const accounts: string[] = (
          message?.accountKeys?.map((k: any) =>
            typeof k === 'string' ? k : k?.pubkey
          ) || []
        ).filter(Boolean)

        // Also check postTokenBalances owners
        const txMeta = transactionData?.meta
        const balanceOwners: string[] = []
        if (txMeta?.postTokenBalances && Array.isArray(txMeta.postTokenBalances)) {
          for (const b of txMeta.postTokenBalances) {
            if (b?.owner) balanceOwners.push(b.owner)
          }
        }

        // Also check innerInstructions accounts
        const innerAccounts: string[] = []
        if (txMeta?.innerInstructions && Array.isArray(txMeta.innerInstructions)) {
          for (const inner of txMeta.innerInstructions) {
            for (const inst of (inner?.instructions || [])) {
              const accts = inst?.accounts
              if (Array.isArray(accts)) {
                for (const a of accts) {
                  const pubkey = typeof a === 'number' && accounts[a]
                    ? accounts[a]
                    : typeof a === 'string' ? a : null
                  if (pubkey) innerAccounts.push(pubkey)
                }
              }
            }
          }
        }

        const allCandidates = [...accounts, ...balanceOwners, ...innerAccounts]

        // Find matches — prefer KOL over whale for overlapping addresses
        let source: 'whale' | 'kol' = 'whale'
        let wallet = ''
        let foundKol = false
        for (const acc of allCandidates) {
          if (!addrSource.has(acc)) continue
          if (addrSource.get(acc) === 'kol') {
            source = 'kol'
            wallet = acc
            foundKol = true
            break
          }
          if (!wallet) {
            wallet = acc
            source = addrSource.get(acc)!
          }
        }
        if (!wallet) wallet = accounts[0] || 'unknown'

        queue.push({ sig, source, wallet })
      }
    } catch {}
  })

  ws.on('error', (err: any) => console.error('  WS error:', err.message))

  // Wait for WS
  const deadline = Date.now() + 15_000
  while (!wsReady && Date.now() < deadline) await new Promise(r => setTimeout(r, 300))
  if (!wsReady) {
    console.log('  WebSocket failed to connect. Exiting.')
    await mongoose.disconnect()
    return
  }

  // ── 4. Process for 5 minutes ──
  console.log('[4/5] Processing live transactions for 5 minutes...')
  console.log(`  Start: ${new Date().toISOString()}`)
  console.log(`  End:   ${new Date(Date.now() + DURATION_MS).toISOString()}\n`)

  const endTime = Date.now() + DURATION_MS
  let totalProcessed = 0

  while (Date.now() < endTime) {
    if (queue.length === 0) {
      await new Promise(r => setTimeout(r, 200))
      continue
    }

    const item = queue.shift()!
    totalProcessed++

    const row = await processOneSig(item.sig, item.source, item.wallet)
    if (!row) {
      const el = Math.round((Date.now() - (endTime - DURATION_MS)) / 1000)
      console.log(`  [${el}s] #${totalProcessed} ${item.sig.slice(0, 16)}... ERROR`)
      continue
    }

    // Append to the right CSV
    const line = csvLine(row) + '\n'
    if (row.source === 'whale') {
      fs.appendFileSync(whaleFile, line)
    } else {
      fs.appendFileSync(kolFile, line)
    }

    // Update stats
    const s = stats[row.source]
    s.total++
    if (row.v2_success) s.v2_ok++
    if (row.v3_success) s.v3_ok++
    switch (row.verdict) {
      case 'MATCH': s.match++; break
      case 'DIFF': s.diff++; break
      case 'V3_RECOVERED': s.v3_recovered++; break
      case 'V3_MISSED': s.v3_missed++; break
      case 'BOTH_ERASE': s.both_erase++; break
    }

    // Live log
    const el = Math.round((Date.now() - (endTime - DURATION_MS)) / 1000)
    const icon = { MATCH: 'OK', V3_RECOVERED: '++V3', V3_MISSED: '--V3', BOTH_ERASE: '~~', DIFF: '!=', SAME: '==' }[row.verdict] || '??'
    const dir = row.v3_success ? row.v3_direction : (row.v2_success ? row.v2_direction : 'ERASE')
    const sol = row.v3_success ? row.v3_sol : row.v2_sol
    console.log(`  [${String(el).padStart(3)}s] #${String(totalProcessed).padStart(3)} [${row.source.toUpperCase().padEnd(5)}] ${item.sig.slice(0, 20)}... [${icon.padEnd(4)}] ${dir.padEnd(6)} ${sol ? sol + ' SOL' : ''}`)

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_PARSE_MS))
  }

  ws.close()

  // ── 5. Summary report ──
  console.log('\n[5/5] Writing summary...\n')

  const pct = (n: number, d: number) => d > 0 ? (n / d * 100).toFixed(1) + '%' : 'N/A'
  const w = stats.whale, k = stats.kol
  const c = {
    total: w.total + k.total,
    v2_ok: w.v2_ok + k.v2_ok,
    v3_ok: w.v3_ok + k.v3_ok,
    match: w.match + k.match,
    diff: w.diff + k.diff,
    v3_recovered: w.v3_recovered + k.v3_recovered,
    v3_missed: w.v3_missed + k.v3_missed,
    both_erase: w.both_erase + k.both_erase,
  }

  const summaryRows = [
    'category,metric,whale,kol,combined',
    `counts,total_transactions,${w.total},${k.total},${c.total}`,
    `counts,v2_success,${w.v2_ok},${k.v2_ok},${c.v2_ok}`,
    `counts,v3_success,${w.v3_ok},${k.v3_ok},${c.v3_ok}`,
    `counts,v2_erase,${w.total - w.v2_ok},${k.total - k.v2_ok},${c.total - c.v2_ok}`,
    `counts,v3_erase,${w.total - w.v3_ok},${k.total - k.v3_ok},${c.total - c.v3_ok}`,
    `rates,v2_success_rate,${pct(w.v2_ok, w.total)},${pct(k.v2_ok, k.total)},${pct(c.v2_ok, c.total)}`,
    `rates,v3_success_rate,${pct(w.v3_ok, w.total)},${pct(k.v3_ok, k.total)},${pct(c.v3_ok, c.total)}`,
    `rates,v2_erase_rate,${pct(w.total - w.v2_ok, w.total)},${pct(k.total - k.v2_ok, k.total)},${pct(c.total - c.v2_ok, c.total)}`,
    `rates,v3_erase_rate,${pct(w.total - w.v3_ok, w.total)},${pct(k.total - k.v3_ok, k.total)},${pct(c.total - c.v3_ok, c.total)}`,
    `verdicts,MATCH (both agree),${w.match},${k.match},${c.match}`,
    `verdicts,DIFF (disagree on dir/amount),${w.diff},${k.diff},${c.diff}`,
    `verdicts,V3_RECOVERED (V3 wins V2 erased),${w.v3_recovered},${k.v3_recovered},${c.v3_recovered}`,
    `verdicts,V3_MISSED (V2 ok V3 erased),${w.v3_missed},${k.v3_missed},${c.v3_missed}`,
    `verdicts,BOTH_ERASE,${w.both_erase},${k.both_erase},${c.both_erase}`,
    `meta,duration_seconds,300,300,300`,
    `meta,total_processed,${w.total},${k.total},${totalProcessed}`,
    `meta,queue_remaining,${queue.length},${queue.length},${queue.length}`,
    `winner,V3_net_wins (recovered - missed),${w.v3_recovered - w.v3_missed},${k.v3_recovered - k.v3_missed},${c.v3_recovered - c.v3_missed}`,
  ]

  fs.writeFileSync(summaryFile, summaryRows.join('\n') + '\n')

  // Print to console
  console.log('==========================================================')
  console.log('  FINAL RESULTS — 5-Minute Live Test')
  console.log('==========================================================')
  console.log(`                           WHALE      KOL      COMBINED`)
  console.log(`  Total transactions:      ${String(w.total).padStart(5)}      ${String(k.total).padStart(5)}      ${String(c.total).padStart(5)}`)
  console.log(`  V2 success:              ${String(w.v2_ok).padStart(5)}      ${String(k.v2_ok).padStart(5)}      ${String(c.v2_ok).padStart(5)}`)
  console.log(`  V3 success:              ${String(w.v3_ok).padStart(5)}      ${String(k.v3_ok).padStart(5)}      ${String(c.v3_ok).padStart(5)}`)
  console.log(`  V2 success rate:         ${pct(w.v2_ok, w.total).padStart(5)}      ${pct(k.v2_ok, k.total).padStart(5)}      ${pct(c.v2_ok, c.total).padStart(5)}`)
  console.log(`  V3 success rate:         ${pct(w.v3_ok, w.total).padStart(5)}      ${pct(k.v3_ok, k.total).padStart(5)}      ${pct(c.v3_ok, c.total).padStart(5)}`)
  console.log(`  ─────────────────────────────────────────────────────`)
  console.log(`  MATCH (agree):           ${String(w.match).padStart(5)}      ${String(k.match).padStart(5)}      ${String(c.match).padStart(5)}`)
  console.log(`  DIFF (disagree):         ${String(w.diff).padStart(5)}      ${String(k.diff).padStart(5)}      ${String(c.diff).padStart(5)}`)
  console.log(`  V3_RECOVERED (V3 wins):  ${String(w.v3_recovered).padStart(5)}      ${String(k.v3_recovered).padStart(5)}      ${String(c.v3_recovered).padStart(5)}`)
  console.log(`  V3_MISSED (V3 regress):  ${String(w.v3_missed).padStart(5)}      ${String(k.v3_missed).padStart(5)}      ${String(c.v3_missed).padStart(5)}`)
  console.log(`  BOTH_ERASE:              ${String(w.both_erase).padStart(5)}      ${String(k.both_erase).padStart(5)}      ${String(c.both_erase).padStart(5)}`)
  console.log(`  ─────────────────────────────────────────────────────`)
  console.log(`  V3 net wins:             ${String(w.v3_recovered - w.v3_missed).padStart(5)}      ${String(k.v3_recovered - k.v3_missed).padStart(5)}      ${String(c.v3_recovered - c.v3_missed).padStart(5)}`)
  console.log('')
  console.log(`  Reports written to:`)
  console.log(`    Whale:   ${whaleFile}`)
  console.log(`    KOL:     ${kolFile}`)
  console.log(`    Summary: ${summaryFile}`)
  console.log('==========================================================')

  await mongoose.disconnect()
  process.exit(0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
