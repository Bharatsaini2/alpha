/**
 * Debug Helius V3 parse for a single signature.
 * Shows whether we get a split (SELL+BUY) or single swap, and token count from deltas.
 *
 * Usage: npx ts-node scripts/debug-helius-parse-one.ts <signature>
 * Example: npx ts-node scripts/debug-helius-parse-one.ts 2u3j9mdk58EuhveskA9QCsVx6oWmophJUd3gYC35mkURHZ3MpxJE4vTMLCn6quCGTyJQgA2hHbZgDjik9kLizq1p
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import { fetchHeliusParsed } from '../src/utils/heliusParserAdapter'
import { parseHeliusTransactionV3 } from '../src/utils/heliusParserV3'
import { collectDeltas } from '../src/utils/heliusParserV3.deltaCollector'
import type { HeliusTransaction } from '../src/utils/heliusParserV3.types'
import { isSplitSwapPair, isParsedSwap } from '../src/utils/shyftParserV2.types'

const sig = process.argv[2] || '2u3j9mdk58EuhveskA9QCsVx6oWmophJUd3gYC35mkURHZ3MpxJE4vTMLCn6quCGTyJQgA2hHbZgDjik9kLizq1p'

async function main() {
  console.log('Fetching from Helius:', sig.slice(0, 20) + '...')
  const raw = await fetchHeliusParsed(sig)
  if (!raw) {
    console.log('No transaction returned from Helius')
    return
  }

  const tx = raw as unknown as HeliusTransaction
  const swapper = tx.feePayer || ''
  console.log('feePayer (swapper):', swapper.slice(0, 12) + '...')
  console.log('tokenTransfers count:', tx.tokenTransfers?.length ?? 0)
  console.log('accountData count:', tx.accountData?.length ?? 0)
  const swapperAcc = tx.accountData?.find((a: any) => a.account === swapper)
  console.log('swapper accountData.tokenBalanceChanges count:', swapperAcc?.tokenBalanceChanges?.length ?? 0)

  const deltas = collectDeltas(tx, swapper)
  console.log('\n--- Deltas ---')
  console.log('tokenCount:', deltas.tokenCount)
  console.log('hasSignificantSol:', deltas.hasSignificantSol)
  console.log('nativeBalanceChange:', deltas.nativeBalanceChange)
  console.log('tokens (mint -> net):', [...deltas.tokens.entries()].map(([m, d]) => [m.slice(0, 8), d.net]))
  console.log('intermediateTokens:', deltas.intermediateTokens.size)

  const result = parseHeliusTransactionV3(tx, { hintSwapper: swapper })
  console.log('\n--- Parse result ---')
  console.log('success:', result.success)
  if (result.erase) {
    console.log('erase reason:', result.erase.reason)
    return
  }
  if (result.data && isSplitSwapPair(result.data)) {
    console.log('type: SPLIT (SELL + BUY)')
    console.log('sellRecord direction:', result.data.sellRecord.direction, 'baseAmount:', result.data.sellRecord.amounts.baseAmount)
    console.log('buyRecord direction:', result.data.buyRecord.direction, 'baseAmount:', result.data.buyRecord.amounts.baseAmount)
  } else if (result.data && isParsedSwap(result.data)) {
    console.log('type: SINGLE')
    console.log('direction:', result.data.direction)
    console.log('baseAmount:', result.data.amounts.baseAmount)
  } else {
    console.log('type: unknown', result.data)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
