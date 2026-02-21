/**
 * Compare SHYFT vs Helius as transaction data sources for our V2 parser.
 *
 * Runs the SAME parser (parseShyftTransactionV2) on:
 * 1. SHYFT-parsed tx (getParsedTransactions → v2Input)
 * 2. Helius-parsed tx (fetchHeliusParsed → buildV2InputFromHelius → v2Input)
 *
 * Outputs CSV: signature, shyft_result, helius_result, category, winner, directions, amounts, etc.
 *
 * Usage:
 *   npx ts-node scripts/compare-shyft-helius-parser.ts [signature1] [signature2] ...
 *   npx ts-node scripts/compare-shyft-helius-parser.ts --file signatures.txt
 *   npx ts-node scripts/compare-shyft-helius-parser.ts --from-whale-db [limit]  # use all whale wallets, recent txs (default limit 5000)
 *   npx ts-node scripts/compare-shyft-helius-parser.ts   # uses built-in sample list)
 *
 * Env: SHYFT_API_KEY, HELIUS_API_KEY, MONGO_URI (for --from-whale-db)
 */

import dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import mongoose from 'mongoose'
import { getParsedTransactions } from '../src/config/getParsedTransaction'
import { connectDB } from '../src/config/connectDb'
import { parseShyftTransactionV2 } from '../src/utils/shyftParserV2'
import type { ShyftTransactionV2 } from '../src/utils/shyftParserV2'
import type { ParserResult, ParsedSwap, SplitSwapPair } from '../src/utils/shyftParserV2.types'
import { fetchHeliusParsed, buildV2InputFromHelius } from '../src/utils/heliusParserAdapter'
import WhalesAddressModel from '../src/models/solana-tokens-whales'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY
const HELIUS_API_KEY = process.env.HELIUS_API_KEY

type Row = {
  signature: string
  shyft_result: 'valid' | 'erase'
  shyft_erase_reason: string
  shyft_direction: string
  shyft_quote_mint: string
  shyft_base_mint: string
  shyft_quote_symbol: string
  shyft_base_symbol: string
  shyft_amounts: string
  helius_result: 'valid' | 'erase'
  helius_erase_reason: string
  helius_direction: string
  helius_quote_mint: string
  helius_base_mint: string
  helius_quote_symbol: string
  helius_base_symbol: string
  helius_amounts: string
  category: 'both_accepted' | 'both_missed' | 'shyft_only' | 'helius_only'
  winner: 'shyft' | 'helius' | 'both' | 'none'
  notes: string
}

function buildV2InputFromShyft(signature: string, parsedTx: any): ShyftTransactionV2 {
  const result = parsedTx?.result ?? parsedTx
  return {
    signature,
    timestamp: result.timestamp
      ? new Date(result.timestamp).getTime()
      : Date.now(),
    status: result.status || 'Success',
    fee: result.fee || 0,
    fee_payer: result.fee_payer ?? result.signers?.[0],
    signers: result.signers ?? [],
    protocol: result.protocol,
    token_balance_changes: result.token_balance_changes ?? [],
    actions: result.actions ?? [],
  }
}

function summarizeSwap(data: ParsedSwap | SplitSwapPair): string {
  if ('sellRecord' in data && data.sellRecord && 'buyRecord' in data && data.buyRecord) {
    const s = data.sellRecord
    const b = data.buyRecord
    return `SELL ${s.baseAsset?.symbol ?? s.baseAsset?.mint?.slice(0, 8)} | BUY ${b.baseAsset?.symbol ?? b.baseAsset?.mint?.slice(0, 8)}`
  }
  const d = data as ParsedSwap
  const dir = d.direction ?? 'n/a'
  const q = d.quoteAsset?.symbol ?? d.quoteAsset?.mint?.slice(0, 8) ?? 'n/a'
  const b = d.baseAsset?.symbol ?? d.baseAsset?.mint?.slice(0, 8) ?? 'n/a'
  return `${dir} ${q} -> ${b}`
}

function getDirection(data: ParsedSwap | SplitSwapPair): string {
  if ('sellRecord' in data && data.sellRecord && data.buyRecord) return 'split'
  return (data as ParsedSwap).direction ?? 'n/a'
}

function getQuoteBase(data: ParsedSwap | SplitSwapPair): { quoteMint: string; baseMint: string; quoteSymbol: string; baseSymbol: string } {
  if ('sellRecord' in data && data.sellRecord && data.buyRecord) {
    const s = data.sellRecord
    const b = data.buyRecord
    return {
      quoteMint: `${s.quoteAsset?.mint ?? ''}|${b.quoteAsset?.mint ?? ''}`,
      baseMint: `${s.baseAsset?.mint ?? ''}|${b.baseAsset?.mint ?? ''}`,
      quoteSymbol: `${s.quoteAsset?.symbol ?? ''}|${b.quoteAsset?.symbol ?? ''}`,
      baseSymbol: `${s.baseAsset?.symbol ?? ''}|${b.baseAsset?.symbol ?? ''}`,
    }
  }
  const d = data as ParsedSwap
  return {
    quoteMint: d.quoteAsset?.mint ?? '',
    baseMint: d.baseAsset?.mint ?? '',
    quoteSymbol: d.quoteAsset?.symbol ?? '',
    baseSymbol: d.baseAsset?.symbol ?? '',
  }
}

function getAmountsSummary(data: ParsedSwap | SplitSwapPair): string {
  if ('sellRecord' in data && data.sellRecord && data.buyRecord) {
    const s = data.sellRecord
    const b = data.buyRecord
    const sa = s.amounts?.baseAmount ?? s.amounts?.netWalletReceived ?? s.amounts?.totalWalletCost ?? 0
    const ba = b.amounts?.baseAmount ?? b.amounts?.netWalletReceived ?? b.amounts?.totalWalletCost ?? 0
    return `sellBase=${sa} buyBase=${ba}`
  }
  const d = data as ParsedSwap
  const a = d.amounts
  const q = a?.totalWalletCost ?? a?.netWalletReceived ?? 0
  const baseAmt = a?.baseAmount ?? 0
  return `quote=${q} base=${baseAmt}`
}

function escapeCsv(s: string): string {
  const t = String(s ?? '').replace(/"/g, '""')
  if (/[",\n\r]/.test(t)) return `"${t}"`
  return t
}

function runShyft(signature: string): Promise<{ v2Input: ShyftTransactionV2 | null; result: ParserResult }> {
  return new Promise((resolve) => {
    getParsedTransactions(signature)
      .then((raw) => {
        if (!raw) {
          resolve({
            v2Input: null,
            result: {
              success: false,
              erase: {
                signature,
                timestamp: 0,
                reason: 'shyft_fetch_failed',
                debugInfo: { feePayer: '', signers: [], assetDeltas: {} },
              },
              processingTimeMs: 0,
            },
          })
          return
        }
        let parsedTx: any
        try {
          parsedTx = typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch {
          resolve({
            v2Input: null,
            result: {
              success: false,
              erase: {
                signature,
                timestamp: 0,
                reason: 'shyft_parse_failed',
                debugInfo: { feePayer: '', signers: [], assetDeltas: {} },
              },
              processingTimeMs: 0,
            },
          })
          return
        }
        const v2Input = buildV2InputFromShyft(signature, parsedTx)
        const result = parseShyftTransactionV2(v2Input)
        resolve({ v2Input, result })
      })
      .catch((err) => {
        resolve({
          v2Input: null,
          result: {
            success: false,
            erase: {
              signature,
              timestamp: 0,
              reason: `shyft_error: ${err?.message ?? String(err)}`,
              debugInfo: { feePayer: '', signers: [], assetDeltas: {} },
            },
            processingTimeMs: 0,
          },
        })
      })
  })
}

async function runHelius(signature: string): Promise<{ v2Input: ShyftTransactionV2 | null; result: ParserResult }> {
  try {
    const helius = await fetchHeliusParsed(signature)
    if (!helius) {
      return {
        v2Input: null,
        result: {
          success: false,
          erase: {
            signature,
            timestamp: 0,
            reason: 'helius_empty',
            debugInfo: { feePayer: '', signers: [], assetDeltas: {} },
          },
          processingTimeMs: 0,
        },
      }
    }
    const v2Input = buildV2InputFromHelius(signature, helius)
    const result = parseShyftTransactionV2(v2Input)
    return { v2Input, result }
  } catch (err: any) {
    return {
      v2Input: null,
      result: {
        success: false,
        erase: {
          signature,
          timestamp: 0,
          reason: `helius_error: ${err?.message ?? String(err)}`,
          debugInfo: { feePayer: '', signers: [], assetDeltas: {} },
        },
        processingTimeMs: 0,
      },
    }
  }
}

async function main() {
  if (!SHYFT_API_KEY) {
    console.error('SHYFT_API_KEY is required')
    process.exit(1)
  }
  if (!HELIUS_API_KEY) {
    console.error('HELIUS_API_KEY is required')
    process.exit(1)
  }

  let signatures: string[] = []
  const args = process.argv.slice(2)
  if (args.length === 0) {
    signatures = [
      '5n7rmEBzom1C31XGVKQdvHkUnU9kd8DhBiTrKXRz78HjDySHoEfnNHggjek9hx2Lb1u8wtSgSN7ey87KBpcGNqGC',
      ...getBuiltInSignatures(),
    ]
    console.log('No signatures provided; using built-in list (' + signatures.length + ' txs)')
  } else if (args[0] === '--file' && args[1]) {
    const filePath = path.isAbsolute(args[1]) ? args[1] : path.join(process.cwd(), args[1])
    const content = fs.readFileSync(filePath, 'utf-8')
    signatures = content
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('#'))
    console.log('Loaded ' + signatures.length + ' signatures from ' + filePath)
  } else {
    signatures = args.filter((s) => s.length > 80)
    console.log('Using ' + signatures.length + ' signatures from args')
  }

  if (signatures.length === 0) {
    console.error('No signatures to compare')
    process.exit(1)
  }

  const rows: Row[] = []
  let shyftValid = 0
  let heliusValid = 0
  let bothAccepted = 0
  let bothMissed = 0
  let shyftOnly = 0
  let heliusOnly = 0

  const delayMs = parseInt(process.env.PARSER_COMPARE_DELAY_MS ?? '200', 10)

  for (let i = 0; i < signatures.length; i++) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    const sig = signatures[i]
    process.stderr.write(`[${i + 1}/${signatures.length}] ${sig.slice(0, 16)}... `)

    const [shyftOut, heliusOut] = await Promise.all([runShyft(sig), runHelius(sig)])

    const sOk = shyftOut.result.success && shyftOut.result.data
    const hOk = heliusOut.result.success && heliusOut.result.data

    if (sOk) shyftValid++
    if (hOk) heliusValid++
    if (sOk && hOk) bothAccepted++
    if (!sOk && !hOk) bothMissed++
    if (sOk && !hOk) shyftOnly++
    if (!sOk && hOk) heliusOnly++

    const shyftReason = !sOk ? (shyftOut.result.erase?.reason ?? 'unknown') : ''
    const heliusReason = !hOk ? (heliusOut.result.erase?.reason ?? 'unknown') : ''

    const shyftDir = sOk ? getDirection(shyftOut.result.data!) : 'n/a'
    const heliusDir = hOk ? getDirection(heliusOut.result.data!) : 'n/a'
    const shyftQB = sOk ? getQuoteBase(shyftOut.result.data!) : { quoteMint: '', baseMint: '', quoteSymbol: '', baseSymbol: '' }
    const heliusQB = hOk ? getQuoteBase(heliusOut.result.data!) : { quoteMint: '', baseMint: '', quoteSymbol: '', baseSymbol: '' }
    const shyftAmt = sOk ? getAmountsSummary(shyftOut.result.data!) : ''
    const heliusAmt = hOk ? getAmountsSummary(heliusOut.result.data!) : ''

    let category: Row['category'] = 'both_missed'
    if (sOk && hOk) category = 'both_accepted'
    else if (sOk) category = 'shyft_only'
    else if (hOk) category = 'helius_only'

    let winner: Row['winner'] = 'none'
    if (sOk && hOk) winner = 'both'
    else if (sOk) winner = 'shyft'
    else if (hOk) winner = 'helius'

    let notes = ''
    if (sOk && hOk && (shyftDir !== heliusDir || shyftQB.quoteMint !== heliusQB.quoteMint)) {
      notes = 'direction_or_assets_differ'
    }

    rows.push({
      signature: sig,
      shyft_result: sOk ? 'valid' : 'erase',
      shyft_erase_reason: shyftReason,
      shyft_direction: shyftDir,
      shyft_quote_mint: shyftQB.quoteMint,
      shyft_base_mint: shyftQB.baseMint,
      shyft_quote_symbol: shyftQB.quoteSymbol,
      shyft_base_symbol: shyftQB.baseSymbol,
      shyft_amounts: shyftAmt,
      helius_result: hOk ? 'valid' : 'erase',
      helius_erase_reason: heliusReason,
      helius_direction: heliusDir,
      helius_quote_mint: heliusQB.quoteMint,
      helius_base_mint: heliusQB.baseMint,
      helius_quote_symbol: heliusQB.quoteSymbol,
      helius_base_symbol: heliusQB.baseSymbol,
      helius_amounts: heliusAmt,
      category,
      winner,
      notes,
    })

    process.stderr.write(`${sOk ? 'S' : '-'} ${hOk ? 'H' : '-'} ${category}\n`)
  }

  const headers: (keyof Row)[] = [
    'signature', 'shyft_result', 'shyft_erase_reason', 'shyft_direction',
    'shyft_quote_mint', 'shyft_base_mint', 'shyft_quote_symbol', 'shyft_base_symbol', 'shyft_amounts',
    'helius_result', 'helius_erase_reason', 'helius_direction',
    'helius_quote_mint', 'helius_base_mint', 'helius_quote_symbol', 'helius_base_symbol', 'helius_amounts',
    'category', 'winner', 'notes',
  ]
  const csvLines = [
    headers.map((h) => escapeCsv(h)).join(','),
    ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
  ]
  const outDir = path.join(__dirname, '..')
  const outPath = path.join(outDir, `parser-comparison-shyft-helius-${Date.now()}.csv`)
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf-8')

  console.log('\n--- Summary ---')
  console.log('Total txs:        ', signatures.length)
  console.log('SHYFT valid:      ', shyftValid)
  console.log('Helius valid:     ', heliusValid)
  console.log('Both accepted:    ', bothAccepted)
  console.log('Both missed:      ', bothMissed)
  console.log('SHYFT only valid: ', shyftOnly)
  console.log('Helius only valid:', heliusOnly)
  console.log('CSV written to:   ', outPath)
}

function getBuiltInSignatures(): string[] {
  const fromParserAudit = [
    'Ef1TCaitLmDjYAjtKCrDpaEAqCNykx8Ycu9gcEDw3BnnosXP61Z8Wq3DBHtPUN7BDRftz2ouho8VnJwVBipdN2d',
    '2pAhjZACyAZCnjeTz8SQqbYRV41YsjrJbaNJqCzDL61254J4y9tqNX9wGp8GREkuKJPULMkhgB4DATCXy7ksNGU4',
  ]
  return fromParserAudit
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
