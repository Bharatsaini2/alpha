/**
 * Diagnostic Script: Amount Discrepancy Investigation
 * 
 * This script helps diagnose why amounts differ from actual transactions
 * and why SOL might show as infinity
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
const { getParsedTransactions } = require('./dist/config/getParsedTransaction')

async function diagnoseTransaction(signature) {
  console.log('\n🔍 Diagnosing Transaction:', signature)
  console.log('='.repeat(80))

  try {
    // Fetch transaction from SHYFT
    const txData = await getParsedTransactions([signature])
    
    if (!txData || txData.length === 0) {
      console.error('❌ Could not fetch transaction from SHYFT')
      return
    }

    const tx = txData[0]
    console.log('\n📊 Raw SHYFT Data:')
    console.log('Status:', tx.status)
    console.log('Fee:', tx.fee)
    
    // Check token_balance_changes
    console.log('\n💰 Token Balance Changes:')
    if (tx.result?.token_balance_changes) {
      tx.result.token_balance_changes.forEach((change, idx) => {
        console.log(`\n  [${idx}] ${change.token_address || 'SOL'}`)
        console.log(`      Owner: ${change.owner}`)
        console.log(`      Change Amount (raw): ${change.change_amount}`)
        console.log(`      Decimals: ${change.decimals}`)
        console.log(`      Change Amount (normalized): ${change.change_amount / Math.pow(10, change.decimals)}`)
        console.log(`      Symbol: ${change.symbol || 'N/A'}`)
      })
    } else {
      console.log('  ⚠️  No token_balance_changes found')
    }

    // Parse with V2 parser
    console.log('\n🔧 V2 Parser Output:')
    const v2Input = {
      signature: tx.signature,
      timestamp: tx.timestamp,
      status: tx.status,
      fee: tx.fee,
      fee_payer: tx.result.fee_payer || '',
      signers: tx.result.signers || [],
      protocol: tx.result.protocol,
      token_balance_changes: tx.result.token_balance_changes || [],
      actions: tx.result.actions || []
    }

    const parseResult = parseShyftTransactionV2(v2Input)

    if (parseResult.success && parseResult.data) {
      const swapData = parseResult.data

      if ('sellRecord' in swapData) {
        console.log('\n  📦 Split Swap Pair Detected')
        console.log('\n  SELL Record:')
        console.log('    Direction:', swapData.sellRecord.direction)
        console.log('    Base Asset:', swapData.sellRecord.baseAsset.symbol, '(', swapData.sellRecord.baseAsset.mint.slice(0, 8), '...)')
        console.log('    Quote Asset:', swapData.sellRecord.quoteAsset.symbol, '(', swapData.sellRecord.quoteAsset.mint.slice(0, 8), '...)')
        console.log('    Amounts:')
        console.log('      - baseAmount:', swapData.sellRecord.amounts.baseAmount)
        console.log('      - swapOutputAmount:', swapData.sellRecord.amounts.swapOutputAmount)
        console.log('      - netWalletReceived:', swapData.sellRecord.amounts.netWalletReceived)
        
        console.log('\n  BUY Record:')
        console.log('    Direction:', swapData.buyRecord.direction)
        console.log('    Base Asset:', swapData.buyRecord.baseAsset.symbol, '(', swapData.buyRecord.baseAsset.mint.slice(0, 8), '...)')
        console.log('    Quote Asset:', swapData.buyRecord.quoteAsset.symbol, '(', swapData.buyRecord.quoteAsset.mint.slice(0, 8), '...)')
        console.log('    Amounts:')
        console.log('      - baseAmount:', swapData.buyRecord.amounts.baseAmount)
        console.log('      - swapInputAmount:', swapData.buyRecord.amounts.swapInputAmount)
        console.log('      - totalWalletCost:', swapData.buyRecord.amounts.totalWalletCost)
      } else {
        console.log('\n  📦 Single Swap Detected')
        console.log('    Direction:', swapData.direction)
        console.log('    Base Asset:', swapData.baseAsset.symbol, '(', swapData.baseAsset.mint.slice(0, 8), '...)')
        console.log('    Quote Asset:', swapData.quoteAsset.symbol, '(', swapData.quoteAsset.mint.slice(0, 8), '...)')
        console.log('    Amounts:')
        console.log('      - baseAmount:', swapData.amounts.baseAmount)
        if (swapData.direction === 'BUY') {
          console.log('      - swapInputAmount:', swapData.amounts.swapInputAmount)
          console.log('      - totalWalletCost:', swapData.amounts.totalWalletCost)
        } else {
          console.log('      - swapOutputAmount:', swapData.amounts.swapOutputAmount)
          console.log('      - netWalletReceived:', swapData.amounts.netWalletReceived)
        }
      }

      console.log('\n  ✅ Confidence:', swapData.confidence || swapData.sellRecord?.confidence)
    } else {
      console.log('  ❌ Parser failed:', parseResult.error)
    }

    // Check for infinity or NaN values
    console.log('\n🔍 Checking for Infinity/NaN Issues:')
    const checkValue = (name, value) => {
      if (value === Infinity || value === -Infinity) {
        console.log(`  ⚠️  ${name} is Infinity!`)
      } else if (isNaN(value)) {
        console.log(`  ⚠️  ${name} is NaN!`)
      } else if (value === 0) {
        console.log(`  ⚠️  ${name} is zero`)
      } else {
        console.log(`  ✅ ${name}: ${value}`)
      }
    }

    if (parseResult.success && parseResult.data) {
      const data = parseResult.data
      if ('sellRecord' in data) {
        checkValue('SELL baseAmount', data.sellRecord.amounts.baseAmount)
        checkValue('SELL swapOutputAmount', data.sellRecord.amounts.swapOutputAmount)
        checkValue('BUY baseAmount', data.buyRecord.amounts.baseAmount)
        checkValue('BUY swapInputAmount', data.buyRecord.amounts.swapInputAmount)
      } else {
        checkValue('baseAmount', data.amounts.baseAmount)
        if (data.direction === 'BUY') {
          checkValue('swapInputAmount', data.amounts.swapInputAmount)
        } else {
          checkValue('swapOutputAmount', data.amounts.swapOutputAmount)
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
  }
}

// Usage
const signature = process.argv[2]

if (!signature) {
  console.log('Usage: node diagnose-amount-discrepancy.js <transaction_signature>')
  console.log('\nExample:')
  console.log('  node diagnose-amount-discrepancy.js 5Qv8...')
  process.exit(1)
}

diagnoseTransaction(signature).then(() => {
  console.log('\n✅ Diagnosis complete')
  process.exit(0)
}).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
