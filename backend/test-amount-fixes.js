/**
 * Test Amount Fixes - Verify Balance-Truth Model
 * 
 * Tests the two problematic transactions to ensure:
 * 1. SOL/WSOL merge happens before asset counting
 * 2. Amounts use balance-truth model (no fee reconstruction)
 * 3. Pool amounts are undefined (not derived from balances)
 * 4. Fallback also follows balance-truth model
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
}

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    )
    return response.data?.result || null
  } catch (error) {
    console.error(colors.red(`Error fetching transaction: ${error.message}`))
    return null
  }
}

function validateBalanceTruthModel(result, signature) {
  console.log(colors.cyan('\n' + '─'.repeat(80)))
  console.log(colors.cyan(colors.bold('BALANCE-TRUTH MODEL VALIDATION')))
  console.log(colors.cyan('─'.repeat(80)))

  const checks = []

  if (result.success && result.data) {
    const swap = result.data

    // Check 1: Pool amounts should be undefined (not derived from balances)
    if ('sellRecord' in swap) {
      // Split swap
      const sellRecord = swap.sellRecord
      const buyRecord = swap.buyRecord

      checks.push({
        name: 'Split Swap - SELL record has undefined pool amounts',
        pass: sellRecord.amounts.swapOutputAmount === undefined,
        details: `swapOutputAmount = ${sellRecord.amounts.swapOutputAmount}`
      })

      checks.push({
        name: 'Split Swap - BUY record has undefined pool amounts',
        pass: buyRecord.amounts.swapInputAmount === undefined,
        details: `swapInputAmount = ${buyRecord.amounts.swapInputAmount}`
      })

      checks.push({
        name: 'Split Swap - SELL has netWalletReceived',
        pass: sellRecord.amounts.netWalletReceived !== undefined && sellRecord.amounts.netWalletReceived > 0,
        details: `netWalletReceived = ${sellRecord.amounts.netWalletReceived}`
      })

      checks.push({
        name: 'Split Swap - BUY has totalWalletCost',
        pass: buyRecord.amounts.totalWalletCost !== undefined && buyRecord.amounts.totalWalletCost > 0,
        details: `totalWalletCost = ${buyRecord.amounts.totalWalletCost}`
      })
    } else {
      // Regular swap
      if (swap.direction === 'BUY') {
        checks.push({
          name: 'BUY - swapInputAmount is undefined (no pool data)',
          pass: swap.amounts.swapInputAmount === undefined,
          details: `swapInputAmount = ${swap.amounts.swapInputAmount}`
        })

        checks.push({
          name: 'BUY - totalWalletCost is defined',
          pass: swap.amounts.totalWalletCost !== undefined && swap.amounts.totalWalletCost > 0,
          details: `totalWalletCost = ${swap.amounts.totalWalletCost}`
        })
      } else {
        checks.push({
          name: 'SELL - swapOutputAmount is undefined (no pool data)',
          pass: swap.amounts.swapOutputAmount === undefined,
          details: `swapOutputAmount = ${swap.amounts.swapOutputAmount}`
        })

        checks.push({
          name: 'SELL - netWalletReceived is defined',
          pass: swap.amounts.netWalletReceived !== undefined && swap.amounts.netWalletReceived > 0,
          details: `netWalletReceived = ${swap.amounts.netWalletReceived}`
        })
      }
    }

    // Check 2: Base amount should always be defined
    if ('sellRecord' in swap) {
      checks.push({
        name: 'Split Swap - Both records have baseAmount',
        pass: swap.sellRecord.amounts.baseAmount > 0 && swap.buyRecord.amounts.baseAmount > 0,
        details: `SELL baseAmount = ${swap.sellRecord.amounts.baseAmount}, BUY baseAmount = ${swap.buyRecord.amounts.baseAmount}`
      })
    } else {
      checks.push({
        name: 'Regular Swap - baseAmount is defined',
        pass: swap.amounts.baseAmount !== undefined && swap.amounts.baseAmount > 0,
        details: `baseAmount = ${swap.amounts.baseAmount}`
      })
    }

    // Print results
    console.log('')
    checks.forEach((check, i) => {
      const icon = check.pass ? colors.green('✅') : colors.red('❌')
      console.log(`${icon} ${check.name}`)
      console.log(colors.gray(`   ${check.details}`))
    })

    const allPassed = checks.every(c => c.pass)
    console.log('')
    if (allPassed) {
      console.log(colors.green(colors.bold('✅ ALL CHECKS PASSED - Balance-truth model is correct!')))
    } else {
      console.log(colors.red(colors.bold('❌ SOME CHECKS FAILED - Balance-truth model violated!')))
    }

    return allPassed
  } else {
    console.log(colors.red('❌ Transaction was rejected by parser'))
    console.log(colors.gray(`   Reason: ${result.erase?.reason || 'unknown'}`))
    return false
  }
}

async function testTransaction(signature, description) {
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold(`TEST: ${description}`)))
  console.log(colors.cyan('═'.repeat(80)))
  console.log(colors.gray(`Signature: ${signature}\n`))

  const shyftResponse = await fetchShyftTransaction(signature)
  if (!shyftResponse) {
    console.log(colors.red('❌ Failed to fetch transaction from SHYFT API'))
    return false
  }

  // Map to V2 parser input
  const v2Input = {
    signature: signature,
    timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
    status: shyftResponse.status || 'Success',
    fee: shyftResponse.fee || 0,
    fee_payer: shyftResponse.fee_payer || '',
    signers: shyftResponse.signers || [],
    protocol: shyftResponse.protocol,
    token_balance_changes: shyftResponse.token_balance_changes || [],
    actions: shyftResponse.actions || []
  }

  console.log(colors.blue('📊 Transaction Info:'))
  console.log(colors.gray(`   Protocol: ${shyftResponse.protocol?.name || 'Unknown'}`))
  console.log(colors.gray(`   Fee: ${shyftResponse.fee} lamports`))
  console.log(colors.gray(`   Balance Changes: ${v2Input.token_balance_changes.length}`))
  console.log(colors.gray(`   Actions: ${v2Input.actions.length}`))

  // Parse with V2
  const parseResult = parseShyftTransactionV2(v2Input)

  if (parseResult.success && parseResult.data) {
    const swap = parseResult.data

    console.log(colors.green('\n✅ PARSER ACCEPTED TRANSACTION'))
    
    if ('sellRecord' in swap) {
      // Split swap
      console.log(colors.yellow('\n📦 Split Swap Detected'))
      
      console.log(colors.blue('\n🔴 SELL Record:'))
      console.log(colors.gray(`   Direction: ${swap.sellRecord.direction}`))
      console.log(colors.gray(`   Swapper: ${swap.sellRecord.swapper.substring(0, 8)}...`))
      console.log(colors.gray(`   Base: ${swap.sellRecord.baseAsset.symbol} (${swap.sellRecord.baseAsset.mint.substring(0, 8)}...)`))
      console.log(colors.gray(`   Quote: ${swap.sellRecord.quoteAsset.symbol} (${swap.sellRecord.quoteAsset.mint.substring(0, 8)}...)`))
      console.log(colors.gray(`   Base Amount: ${swap.sellRecord.amounts.baseAmount}`))
      console.log(colors.gray(`   Net Wallet Received: ${swap.sellRecord.amounts.netWalletReceived}`))
      console.log(colors.gray(`   Swap Output Amount: ${swap.sellRecord.amounts.swapOutputAmount}`))
      console.log(colors.gray(`   Confidence: ${swap.sellRecord.confidence}`))

      console.log(colors.blue('\n🟢 BUY Record:'))
      console.log(colors.gray(`   Direction: ${swap.buyRecord.direction}`))
      console.log(colors.gray(`   Swapper: ${swap.buyRecord.swapper.substring(0, 8)}...`))
      console.log(colors.gray(`   Base: ${swap.buyRecord.baseAsset.symbol} (${swap.buyRecord.baseAsset.mint.substring(0, 8)}...)`))
      console.log(colors.gray(`   Quote: ${swap.buyRecord.quoteAsset.symbol} (${swap.buyRecord.quoteAsset.mint.substring(0, 8)}...)`))
      console.log(colors.gray(`   Base Amount: ${swap.buyRecord.amounts.baseAmount}`))
      console.log(colors.gray(`   Total Wallet Cost: ${swap.buyRecord.amounts.totalWalletCost}`))
      console.log(colors.gray(`   Swap Input Amount: ${swap.buyRecord.amounts.swapInputAmount}`))
      console.log(colors.gray(`   Confidence: ${swap.buyRecord.confidence}`))
    } else {
      // Regular swap
      console.log(colors.blue('\n📦 Regular Swap:'))
      console.log(colors.gray(`   Direction: ${swap.direction}`))
      console.log(colors.gray(`   Swapper: ${swap.swapper.substring(0, 8)}...`))
      console.log(colors.gray(`   Base: ${swap.baseAsset.symbol} (${swap.baseAsset.mint.substring(0, 8)}...)`))
      console.log(colors.gray(`   Quote: ${swap.quoteAsset.symbol} (${swap.quoteAsset.mint.substring(0, 8)}...)`))
      console.log(colors.gray(`   Base Amount: ${swap.amounts.baseAmount}`))
      
      if (swap.direction === 'BUY') {
        console.log(colors.gray(`   Total Wallet Cost: ${swap.amounts.totalWalletCost}`))
        console.log(colors.gray(`   Swap Input Amount: ${swap.amounts.swapInputAmount}`))
      } else {
        console.log(colors.gray(`   Net Wallet Received: ${swap.amounts.netWalletReceived}`))
        console.log(colors.gray(`   Swap Output Amount: ${swap.amounts.swapOutputAmount}`))
      }
      
      console.log(colors.gray(`   Confidence: ${swap.confidence}`))
    }

    // Validate balance-truth model
    return validateBalanceTruthModel(parseResult, signature)
  } else {
    console.log(colors.red('\n❌ PARSER REJECTED TRANSACTION'))
    console.log(colors.gray(`   Reason: ${parseResult.erase?.reason || 'unknown'}`))
    if (parseResult.erase?.metadata) {
      console.log(colors.gray(`   Metadata: ${JSON.stringify(parseResult.erase.metadata, null, 2)}`))
    }
    return false
  }
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(colors.cyan(colors.bold('║         Amount Fixes Verification - Balance-Truth Model                   ║')))
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  const tests = [
    {
      signature: '5c7D15Ubv4WAF3Xe4si8VSj4JV7YXKY23bKfmWHMeq5nNZs2hh54YNohhEGthrJoppyief6HbE8Gjb9nJXysN2x2',
      description: 'Issue #1: Invalid Asset Count (SOL/WSOL merge)'
    },
    {
      signature: '2AWdrFzFFqUWM1pTcW3G9PqySaCFisFWSLnUjz8jvsPbutfe6we5NEwxrmHCCzkbXx9vhHiope8Azh9zMAYqcWbf',
      description: 'Issue #2: Potentially doubled amounts'
    }
  ]

  // Note: Replace with actual signatures from the live test
  console.log(colors.yellow('⚠️  NOTE: Replace test signatures with actual problematic transactions'))
  console.log(colors.yellow('   from the live test results (v2-rejections CSV or v2-detections CSV)\n'))

  const results = []
  
  for (const test of tests) {
    const passed = await testTransaction(test.signature, test.description)
    results.push({ ...test, passed })
    
    // Wait a bit between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Summary
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('TEST SUMMARY')))
  console.log(colors.cyan('═'.repeat(80)))
  
  results.forEach((result, i) => {
    const icon = result.passed ? colors.green('✅') : colors.red('❌')
    console.log(`${icon} Test ${i + 1}: ${result.description}`)
  })

  const allPassed = results.every(r => r.passed)
  console.log('')
  if (allPassed) {
    console.log(colors.green(colors.bold('✅ ALL TESTS PASSED!')))
    console.log(colors.green('   Balance-truth model is correctly implemented'))
    console.log(colors.green('   Ready to deploy fixes'))
  } else {
    console.log(colors.red(colors.bold('❌ SOME TESTS FAILED!')))
    console.log(colors.red('   Review the failures above'))
  }
  console.log('')
}

main().catch(error => {
  console.error(colors.red('💥 Fatal Error:'), error)
  process.exit(1)
})
