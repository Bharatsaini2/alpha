/**
 * Comprehensive Live Parser Test
 * 
 * Tests V2 parser with live SHYFT API data and generates detailed CSV report
 * 
 * Report includes:
 * 1. Detection rate (accepted vs rejected)
 * 2. Rejection reasons breakdown
 * 3. V1 vs V2 comparison
 * 4. Split swap handling verification
 * 5. Amount calculation verification
 */

import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { parseShyftTransactionV2 } from './src/utils/shyftParserV2'
import { parseShyftTransaction } from './src/utils/shyftParser'

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'your-api-key'
const TEST_WALLET = 'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n' // Known whale wallet

interface TestResult {
  signature: string
  timestamp: number
  v1Result: 'ACCEPTED' | 'REJECTED' | 'ERROR'
  v1Direction?: 'BUY' | 'SELL'
  v1QuoteSymbol?: string
  v1BaseSymbol?: string
  v1Amount?: number
  v2Result: 'ACCEPTED' | 'REJECTED' | 'SPLIT' | 'ERROR'
  v2Direction?: 'BUY' | 'SELL'
  v2QuoteSymbol?: string
  v2BaseSymbol?: string
  v2SwapInputAmount?: number
  v2TotalWalletCost?: number
  v2SwapOutputAmount?: number
  v2NetWalletReceived?: number
  v2SplitSellSymbol?: string
  v2SplitBuySymbol?: string
  rejectionReason?: string
  agreement: 'MATCH' | 'MISMATCH' | 'V2_ONLY' | 'V1_ONLY'
  notes: string
}

interface TestSummary {
  totalTransactions: number
  v1Accepted: number
  v1Rejected: number
  v2Accepted: number
  v2Rejected: number
  v2Split: number
  agreements: number
  mismatches: number
  v2OnlyAccepted: number
  v1OnlyAccepted: number
  rejectionReasons: Record<string, number>
  splitSwapsDetected: number
  processingTimeMs: number
}

async function fetchTransactions(wallet: string, limit: number = 50): Promise<any[]> {
  try {
    console.log(`\n🔍 Fetching ${limit} transactions for wallet: ${wallet}`)
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/history`,
      {
        params: {
          network: 'mainnet-beta',
          tx_num: limit,
          account: wallet,
          enable_raw: true,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
        timeout: 30000,
      }
    )

    if (response.data && response.data.result) {
      console.log(`✅ Fetched ${response.data.result.length} transactions`)
      return response.data.result
    }

    return []
  } catch (error) {
    console.error('❌ Error fetching transactions:', error)
    return []
  }
}

function convertToV2Format(shyftTx: any): any {
  return {
    signature: shyftTx.signatures?.[0] || shyftTx.signature || '',
    timestamp: shyftTx.timestamp ? new Date(shyftTx.timestamp).getTime() : Date.now(),
    status: shyftTx.status || 'Success',
    fee: shyftTx.fee || 0,
    fee_payer: shyftTx.fee_payer || '',
    signers: shyftTx.signers || [],
    protocol: shyftTx.protocol,
    token_balance_changes: shyftTx.actions?.flatMap((action: any) => {
      if (action.type === 'TOKEN_TRANSFER' || action.type === 'SWAP') {
        return action.info?.token_balance_changes || []
      }
      return []
    }) || [],
    actions: shyftTx.actions || [],
  }
}

function testTransaction(tx: any): TestResult {
  const signature = tx.signatures?.[0] || tx.signature || 'unknown'
  const timestamp = tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now()
  
  const result: TestResult = {
    signature,
    timestamp,
    v1Result: 'REJECTED',
    v2Result: 'REJECTED',
    agreement: 'MATCH',
    notes: '',
  }

  try {
    // Test V1 Parser
    try {
      const v1Output = parseShyftTransaction(tx)
      if (v1Output && v1Output.type !== 'UNKNOWN') {
        result.v1Result = 'ACCEPTED'
        result.v1Direction = v1Output.type === 'buy' ? 'BUY' : 'SELL'
        result.v1QuoteSymbol = v1Output.type === 'buy' ? v1Output.tokenInSymbol : v1Output.tokenOutSymbol
        result.v1BaseSymbol = v1Output.type === 'buy' ? v1Output.tokenOutSymbol : v1Output.tokenInSymbol
        result.v1Amount = v1Output.type === 'buy' ? v1Output.tokenInAmount : v1Output.tokenOutAmount
      }
    } catch (error) {
      result.v1Result = 'ERROR'
      result.notes += `V1 Error: ${error instanceof Error ? error.message : String(error)}; `
    }

    // Test V2 Parser
    try {
      const v2Input = convertToV2Format(tx)
      const v2Output = parseShyftTransactionV2(v2Input)

      if (v2Output.success && v2Output.data) {
        const data = v2Output.data

        // Check if it's a split swap
        if ('sellRecord' in data) {
          result.v2Result = 'SPLIT'
          result.v2SplitSellSymbol = data.sellRecord.quoteAsset.symbol
          result.v2SplitBuySymbol = data.buyRecord.quoteAsset.symbol
          result.notes += `Split swap: ${data.sellRecord.quoteAsset.symbol} → ${data.buyRecord.quoteAsset.symbol}; `
        } else {
          result.v2Result = 'ACCEPTED'
          result.v2Direction = data.direction
          result.v2QuoteSymbol = data.quoteAsset.symbol
          result.v2BaseSymbol = data.baseAsset.symbol

          if (data.direction === 'BUY') {
            result.v2SwapInputAmount = data.amounts.swapInputAmount
            result.v2TotalWalletCost = data.amounts.totalWalletCost
          } else {
            result.v2SwapOutputAmount = data.amounts.swapOutputAmount
            result.v2NetWalletReceived = data.amounts.netWalletReceived
          }
        }
      } else if (v2Output.erase) {
        result.v2Result = 'REJECTED'
        result.rejectionReason = v2Output.erase.reason
      }
    } catch (error) {
      result.v2Result = 'ERROR'
      result.notes += `V2 Error: ${error instanceof Error ? error.message : String(error)}; `
    }

    // Determine agreement
    if (result.v1Result === 'ACCEPTED' && result.v2Result === 'ACCEPTED') {
      if (result.v1Direction === result.v2Direction) {
        result.agreement = 'MATCH'
      } else {
        result.agreement = 'MISMATCH'
        result.notes += 'Direction mismatch; '
      }
    } else if (result.v1Result === 'ACCEPTED' && result.v2Result === 'REJECTED') {
      result.agreement = 'V1_ONLY'
    } else if (result.v1Result === 'REJECTED' && result.v2Result === 'ACCEPTED') {
      result.agreement = 'V2_ONLY'
    } else if (result.v1Result === 'REJECTED' && result.v2Result === 'SPLIT') {
      result.agreement = 'V2_ONLY'
      result.notes += 'V2 detected split swap; '
    } else {
      result.agreement = 'MATCH'
    }

  } catch (error) {
    result.notes += `Test Error: ${error instanceof Error ? error.message : String(error)}`
  }

  return result
}

function generateSummary(results: TestResult[]): TestSummary {
  const summary: TestSummary = {
    totalTransactions: results.length,
    v1Accepted: 0,
    v1Rejected: 0,
    v2Accepted: 0,
    v2Rejected: 0,
    v2Split: 0,
    agreements: 0,
    mismatches: 0,
    v2OnlyAccepted: 0,
    v1OnlyAccepted: 0,
    rejectionReasons: {},
    splitSwapsDetected: 0,
    processingTimeMs: 0,
  }

  for (const result of results) {
    // V1 stats
    if (result.v1Result === 'ACCEPTED') summary.v1Accepted++
    else if (result.v1Result === 'REJECTED') summary.v1Rejected++

    // V2 stats
    if (result.v2Result === 'ACCEPTED') summary.v2Accepted++
    else if (result.v2Result === 'REJECTED') summary.v2Rejected++
    else if (result.v2Result === 'SPLIT') {
      summary.v2Split++
      summary.splitSwapsDetected++
    }

    // Agreement stats
    if (result.agreement === 'MATCH') summary.agreements++
    else if (result.agreement === 'MISMATCH') summary.mismatches++
    else if (result.agreement === 'V2_ONLY') summary.v2OnlyAccepted++
    else if (result.agreement === 'V1_ONLY') summary.v1OnlyAccepted++

    // Rejection reasons
    if (result.rejectionReason) {
      summary.rejectionReasons[result.rejectionReason] = 
        (summary.rejectionReasons[result.rejectionReason] || 0) + 1
    }
  }

  return summary
}

function generateCSV(results: TestResult[], summary: TestSummary): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `parser-test-report-${timestamp}.csv`
  const filepath = path.join(__dirname, filename)

  // CSV Header
  let csv = 'Signature,Timestamp,V1_Result,V1_Direction,V1_Quote,V1_Base,V1_Amount,'
  csv += 'V2_Result,V2_Direction,V2_Quote,V2_Base,V2_SwapInput,V2_TotalCost,V2_SwapOutput,V2_NetReceived,'
  csv += 'V2_SplitSell,V2_SplitBuy,Rejection_Reason,Agreement,Notes\n'

  // CSV Rows
  for (const result of results) {
    csv += `"${result.signature}",`
    csv += `${result.timestamp},`
    csv += `${result.v1Result},`
    csv += `${result.v1Direction || ''},`
    csv += `"${result.v1QuoteSymbol || ''}",`
    csv += `"${result.v1BaseSymbol || ''}",`
    csv += `${result.v1Amount || ''},`
    csv += `${result.v2Result},`
    csv += `${result.v2Direction || ''},`
    csv += `"${result.v2QuoteSymbol || ''}",`
    csv += `"${result.v2BaseSymbol || ''}",`
    csv += `${result.v2SwapInputAmount || ''},`
    csv += `${result.v2TotalWalletCost || ''},`
    csv += `${result.v2SwapOutputAmount || ''},`
    csv += `${result.v2NetWalletReceived || ''},`
    csv += `"${result.v2SplitSellSymbol || ''}",`
    csv += `"${result.v2SplitBuySymbol || ''}",`
    csv += `"${result.rejectionReason || ''}",`
    csv += `${result.agreement},`
    csv += `"${result.notes}"\n`
  }

  // Add summary section
  csv += '\n\n=== SUMMARY ===\n'
  csv += `Total Transactions,${summary.totalTransactions}\n`
  csv += `V1 Accepted,${summary.v1Accepted}\n`
  csv += `V1 Rejected,${summary.v1Rejected}\n`
  csv += `V2 Accepted,${summary.v2Accepted}\n`
  csv += `V2 Rejected,${summary.v2Rejected}\n`
  csv += `V2 Split Swaps,${summary.v2Split}\n`
  csv += `Agreements,${summary.agreements}\n`
  csv += `Mismatches,${summary.mismatches}\n`
  csv += `V2 Only Accepted,${summary.v2OnlyAccepted}\n`
  csv += `V1 Only Accepted,${summary.v1OnlyAccepted}\n`
  csv += `\n=== REJECTION REASONS ===\n`
  for (const [reason, count] of Object.entries(summary.rejectionReasons)) {
    csv += `${reason},${count}\n`
  }

  fs.writeFileSync(filepath, csv, 'utf-8')
  console.log(`\n📊 CSV report saved to: ${filename}`)

  return filename
}

function printSummary(summary: TestSummary) {
  console.log('\n' + '='.repeat(80))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(80))
  console.log(`\n📈 Overall Stats:`)
  console.log(`   Total Transactions: ${summary.totalTransactions}`)
  console.log(`\n🔵 V1 Parser:`)
  console.log(`   Accepted: ${summary.v1Accepted} (${((summary.v1Accepted / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`   Rejected: ${summary.v1Rejected} (${((summary.v1Rejected / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`\n🟢 V2 Parser:`)
  console.log(`   Accepted: ${summary.v2Accepted} (${((summary.v2Accepted / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`   Rejected: ${summary.v2Rejected} (${((summary.v2Rejected / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`   Split Swaps: ${summary.v2Split} (${((summary.v2Split / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`\n🔄 Comparison:`)
  console.log(`   Agreements: ${summary.agreements} (${((summary.agreements / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`   Mismatches: ${summary.mismatches} (${((summary.mismatches / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`   V2 Only Accepted: ${summary.v2OnlyAccepted} (${((summary.v2OnlyAccepted / summary.totalTransactions) * 100).toFixed(1)}%)`)
  console.log(`   V1 Only Accepted: ${summary.v1OnlyAccepted} (${((summary.v1OnlyAccepted / summary.totalTransactions) * 100).toFixed(1)}%)`)
  
  if (Object.keys(summary.rejectionReasons).length > 0) {
    console.log(`\n❌ Rejection Reasons:`)
    const sortedReasons = Object.entries(summary.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
    for (const [reason, count] of sortedReasons) {
      console.log(`   ${reason}: ${count} (${((count / summary.totalTransactions) * 100).toFixed(1)}%)`)
    }
  }

  console.log('\n' + '='.repeat(80))
}

async function main() {
  console.log('🚀 Starting Comprehensive Parser Live Test')
  console.log('=' .repeat(80))

  const startTime = Date.now()

  // Fetch transactions
  const transactions = await fetchTransactions(TEST_WALLET, 100)

  if (transactions.length === 0) {
    console.error('❌ No transactions fetched. Exiting.')
    return
  }

  console.log(`\n⚙️  Testing ${transactions.length} transactions...`)

  // Test each transaction
  const results: TestResult[] = []
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]
    process.stdout.write(`\r   Progress: ${i + 1}/${transactions.length} (${((i + 1) / transactions.length * 100).toFixed(1)}%)`)
    
    const result = testTransaction(tx)
    results.push(result)
  }

  console.log('\n')

  // Generate summary
  const summary = generateSummary(results)
  summary.processingTimeMs = Date.now() - startTime

  // Print summary
  printSummary(summary)

  // Generate CSV
  const csvFilename = generateCSV(results, summary)

  console.log(`\n✅ Test completed in ${(summary.processingTimeMs / 1000).toFixed(2)}s`)
  console.log(`📄 Detailed report: ${csvFilename}`)
}

main().catch(console.error)
