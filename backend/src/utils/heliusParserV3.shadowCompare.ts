/**
 * Helius Parser V3 — Shadow Comparison Utility
 *
 * Runs BOTH parsers (SHYFT V2 and Helius V3) on the same transaction
 * and logs differences for validation without affecting production flow.
 *
 * Usage:
 *   1. Set `HELIUS_SHADOW_MODE=true` in .env
 *   2. The controllers call `runShadowComparison(signature, whaleAddress)`
 *      after the primary parser completes
 *   3. Results are logged to stdout (pino) with `shadowCompare: true`
 *   4. A CSV is written to `backend/test-reports/shadow-v2-vs-v3-{timestamp}.csv`
 *   5. No data is stored in MongoDB — shadow mode is read-only
 *
 * Metrics tracked per-transaction:
 *   - Did each parser succeed or ERASE?
 *   - Direction match (BUY/SELL/SPLIT)
 *   - SOL amount difference (absolute + %)
 *   - Token amount difference
 *   - Erase reasons
 */

import * as fs from 'fs'
import * as path from 'path'
import logger from './logger'
import { parseShyftTransactionV2 } from './shyftParserV2'
import { parseHeliusTransactionV3 } from './heliusParserV3'
import { fetchHeliusParsed } from './heliusParserAdapter'
import { getParsedTransactions } from '../config/getParsedTransaction'
import type { HeliusTransaction } from './heliusParserV3.types'
import type { ParserResult } from './shyftParserV2.types'

// ============================================================================
// Types
// ============================================================================

interface ShadowComparisonResult {
  signature: string
  v2: { success: boolean; direction?: string; solAmount?: number; tokenAmount?: number; eraseReason?: string; tokenMint?: string; protocol?: string }
  v3: { success: boolean; direction?: string; solAmount?: number; tokenAmount?: number; eraseReason?: string; tokenMint?: string; protocol?: string }
  match: boolean
  directionMatch: boolean
  solAmountDiffPercent: number | null
}

// ============================================================================
// CSV writer
// ============================================================================

const CSV_HEADER = [
  'timestamp',
  'signature',
  'match',
  'v2_success',
  'v2_direction',
  'v2_sol_amount',
  'v2_token_amount',
  'v2_token_mint',
  'v2_erase_reason',
  'v2_protocol',
  'v3_success',
  'v3_direction',
  'v3_sol_amount',
  'v3_token_amount',
  'v3_token_mint',
  'v3_erase_reason',
  'v3_protocol',
  'direction_match',
  'sol_diff_pct',
  'verdict',
].join(',')

let csvFilePath: string | null = null
let csvInitialized = false

function ensureCsvFile(): string {
  if (csvFilePath && csvInitialized) return csvFilePath

  const reportsDir = path.resolve(__dirname, '../../test-reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }

  csvFilePath = path.join(reportsDir, `shadow-v2-vs-v3-${Date.now()}.csv`)
  fs.writeFileSync(csvFilePath, CSV_HEADER + '\n', 'utf-8')
  csvInitialized = true

  logger.info({ csvFilePath }, 'Shadow CSV report created')
  return csvFilePath
}

function appendCsvRow(comparison: ShadowComparisonResult): void {
  try {
    const filePath = ensureCsvFile()

    let verdict = 'SAME'
    if (comparison.v3.success && !comparison.v2.success) verdict = 'V3_RECOVERED'
    else if (comparison.v2.success && !comparison.v3.success) verdict = 'V3_MISSED'
    else if (!comparison.v2.success && !comparison.v3.success) verdict = 'BOTH_ERASE'
    else if (comparison.match) verdict = 'MATCH'
    else verdict = 'DIFF'

    const row = [
      new Date().toISOString(),
      comparison.signature,
      comparison.match,
      comparison.v2.success,
      comparison.v2.direction ?? '',
      comparison.v2.solAmount?.toFixed(6) ?? '',
      comparison.v2.tokenAmount?.toFixed(2) ?? '',
      comparison.v2.tokenMint ? comparison.v2.tokenMint.slice(0, 8) + '...' : '',
      comparison.v2.eraseReason ?? '',
      comparison.v2.protocol ?? '',
      comparison.v3.success,
      comparison.v3.direction ?? '',
      comparison.v3.solAmount?.toFixed(6) ?? '',
      comparison.v3.tokenAmount?.toFixed(2) ?? '',
      comparison.v3.tokenMint ? comparison.v3.tokenMint.slice(0, 8) + '...' : '',
      comparison.v3.eraseReason ?? '',
      comparison.v3.protocol ?? '',
      comparison.directionMatch,
      comparison.solAmountDiffPercent !== null ? comparison.solAmountDiffPercent.toFixed(2) + '%' : '',
      verdict,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`)

    fs.appendFileSync(filePath, row.join(',') + '\n', 'utf-8')
  } catch (err) {
    logger.debug({ err }, 'Shadow CSV append failed (non-critical)')
  }
}

// ============================================================================
// Running aggregation
// ============================================================================

let shadowStats = {
  total: 0,
  v2Success: 0,
  v3Success: 0,
  bothSuccess: 0,
  directionMatches: 0,
  v3OnlySuccess: 0,
  v2OnlySuccess: 0,
  bothErase: 0,
  startedAt: Date.now(),
}

export function getShadowStats() {
  return {
    ...shadowStats,
    v2SuccessRate: shadowStats.total ? (shadowStats.v2Success / shadowStats.total * 100).toFixed(1) + '%' : 'N/A',
    v3SuccessRate: shadowStats.total ? (shadowStats.v3Success / shadowStats.total * 100).toFixed(1) + '%' : 'N/A',
    v2EraseRate: shadowStats.total ? ((shadowStats.total - shadowStats.v2Success) / shadowStats.total * 100).toFixed(1) + '%' : 'N/A',
    v3EraseRate: shadowStats.total ? ((shadowStats.total - shadowStats.v3Success) / shadowStats.total * 100).toFixed(1) + '%' : 'N/A',
    directionMatchRate: shadowStats.bothSuccess ? (shadowStats.directionMatches / shadowStats.bothSuccess * 100).toFixed(1) + '%' : 'N/A',
    runningForSeconds: Math.round((Date.now() - shadowStats.startedAt) / 1000),
    csvFilePath: csvFilePath ?? 'not started',
  }
}

export function resetShadowStats() {
  shadowStats = { total: 0, v2Success: 0, v3Success: 0, bothSuccess: 0, directionMatches: 0, v3OnlySuccess: 0, v2OnlySuccess: 0, bothErase: 0, startedAt: Date.now() }
  csvFilePath = null
  csvInitialized = false
}

// ============================================================================
// Main comparison function
// ============================================================================

export async function runShadowComparison(
  signature: string,
  hintSwapper?: string,
): Promise<ShadowComparisonResult | null> {
  if (process.env.HELIUS_SHADOW_MODE !== 'true') return null

  try {
    // Fetch from both sources in parallel
    const [shyftRaw, heliusTx] = await Promise.allSettled([
      getParsedTransactions(signature).catch(() => null),
      fetchHeliusParsed(signature).catch(() => null),
    ])

    // Run V2 parser
    let v2Result: ParserResult | null = null
    const shyftData = shyftRaw.status === 'fulfilled' ? shyftRaw.value : null
    if (shyftData) {
      try {
        const parsedTx = JSON.parse(shyftData)
        if (parsedTx.success) {
          const v2Input = {
            signature,
            timestamp: parsedTx.result?.timestamp
              ? new Date(parsedTx.result.timestamp).getTime()
              : Date.now(),
            status: parsedTx.result?.status || 'Success',
            fee: parsedTx.result?.fee || 0,
            fee_payer: parsedTx.result?.fee_payer ?? parsedTx.result?.signers?.[0],
            signers: parsedTx.result?.signers ?? [],
            protocol: parsedTx.result?.protocol,
            token_balance_changes: parsedTx.result?.token_balance_changes ?? [],
            actions: parsedTx.result?.actions ?? [],
          }
          v2Result = parseShyftTransactionV2(v2Input, hintSwapper ? { hintSwapper } : undefined)
        }
      } catch { /* parse error — v2Result stays null */ }
    }

    // Run V3 parser
    let v3Result: ParserResult | null = null
    const heliusData = heliusTx.status === 'fulfilled' ? heliusTx.value : null
    if (heliusData) {
      v3Result = parseHeliusTransactionV3(
        heliusData as unknown as HeliusTransaction,
        hintSwapper ? { hintSwapper } : undefined,
      )
    }

    // Extract comparison fields
    const v2 = extractFields(v2Result)
    const v3 = extractFields(v3Result)

    const directionMatch = v2.direction === v3.direction
    let solAmountDiffPercent: number | null = null
    if (v2.solAmount != null && v3.solAmount != null && v2.solAmount > 0) {
      solAmountDiffPercent = ((v3.solAmount - v2.solAmount) / v2.solAmount) * 100
    }

    const match = v2.success === v3.success && directionMatch && (
      solAmountDiffPercent === null || Math.abs(solAmountDiffPercent) < 5
    )

    // Update stats
    shadowStats.total++
    if (v2.success) shadowStats.v2Success++
    if (v3.success) shadowStats.v3Success++
    if (v2.success && v3.success) {
      shadowStats.bothSuccess++
      if (directionMatch) shadowStats.directionMatches++
    }
    if (v3.success && !v2.success) shadowStats.v3OnlySuccess++
    if (v2.success && !v3.success) shadowStats.v2OnlySuccess++
    if (!v2.success && !v3.success) shadowStats.bothErase++

    const comparison: ShadowComparisonResult = {
      signature,
      v2,
      v3,
      match,
      directionMatch,
      solAmountDiffPercent,
    }

    // Write to CSV
    appendCsvRow(comparison)

    // Log every comparison and periodic summaries
    logger.info(
      { shadowCompare: true, ...comparison },
      `Shadow: ${match ? 'MATCH' : 'DIFF'} | V2=${v2.success ? v2.direction : 'ERASE'} V3=${v3.success ? v3.direction : 'ERASE'}`,
    )

    if (shadowStats.total % 50 === 0) {
      logger.info(
        { shadowCompare: true, shadowStats: getShadowStats() },
        'Shadow comparison periodic summary',
      )
    }

    return comparison
  } catch (error) {
    logger.warn(
      { signature, error: error instanceof Error ? error.message : String(error) },
      'Shadow comparison failed (non-critical)',
    )
    return null
  }
}

// ============================================================================
// Helpers
// ============================================================================

function extractFields(result: ParserResult | null): ShadowComparisonResult['v2'] {
  if (!result || !result.success || !result.data) {
    return {
      success: false,
      eraseReason: result?.erase?.reason ?? 'no_data',
    }
  }

  const data = result.data

  if ('sellRecord' in data) {
    return {
      success: true,
      direction: 'SPLIT',
      solAmount: 0,
      tokenMint: data.sellRecord?.baseAsset?.mint,
      protocol: data.sellRecord?.protocol,
    }
  }

  const swap = data
  const solAmt = swap.direction === 'BUY'
    ? (swap.amounts.swapInputAmount ?? swap.amounts.totalWalletCost ?? 0)
    : (swap.amounts.swapOutputAmount ?? swap.amounts.netWalletReceived ?? 0)

  return {
    success: true,
    direction: swap.direction,
    solAmount: solAmt,
    tokenAmount: swap.amounts.baseAmount,
    tokenMint: swap.baseAsset?.mint,
    protocol: swap.protocol,
  }
}

// ============================================================================
// Summary CSV writer — call when stopping shadow mode or on shutdown
// ============================================================================

export function writeShadowSummary(): string | null {
  if (shadowStats.total === 0) return null

  const stats = getShadowStats()
  const reportsDir = path.resolve(__dirname, '../../test-reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }

  const summaryPath = path.join(reportsDir, `shadow-summary-${Date.now()}.csv`)

  const rows = [
    'metric,value',
    `total_transactions,${stats.total}`,
    `v2_success,${stats.v2Success}`,
    `v3_success,${stats.v3Success}`,
    `v2_success_rate,${stats.v2SuccessRate}`,
    `v3_success_rate,${stats.v3SuccessRate}`,
    `v2_erase_rate,${stats.v2EraseRate}`,
    `v3_erase_rate,${stats.v3EraseRate}`,
    `both_success,${stats.bothSuccess}`,
    `direction_match_rate,${stats.directionMatchRate}`,
    `v3_only_success (V3 recovered),${stats.v3OnlySuccess}`,
    `v2_only_success (V3 missed),${stats.v2OnlySuccess}`,
    `both_erase,${stats.bothErase}`,
    `running_seconds,${stats.runningForSeconds}`,
    `csv_detail_file,${stats.csvFilePath}`,
  ]

  fs.writeFileSync(summaryPath, rows.join('\n') + '\n', 'utf-8')
  logger.info({ summaryPath }, 'Shadow summary CSV written')
  return summaryPath
}
