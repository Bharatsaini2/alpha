/**
 * Test all "no_swap_action" transactions directly with the parser
 * to see if they actually parse successfully
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

// All "no_swap_action" transactions from the test
const SIGNATURES = [
  '4RhDCom3V97Ry8DuryGM9qtcM45jqKJYHrupV82tqBS3ot4jgCHZYhhgcudEzrXgCwmnkmMNyZTegVm1CveS3MVW',
  '2PkzdzSCbihp4YWUitSTTrNkEyWdUreNffWnVGuTtvPDkMucURjHhva2XFxegK2S2naDvcX8EMWTXchs4XKmFizk',
  '3JG5ffx9Wkr5oJgueaSmrB5FTgp2ZE3PRhn8yVTDnwEC2FF4oqaMXTWz5ZgxKwXvR7v6VWq2YbtJvzkjWZnyRgWX',
  '54jfbrusW9r6cqibywvAwrpDKTdqEgNgcF6pR2XfSLCj2dPLB4ditV9KPa1m9ezFsXGiH4bMVkCB564HvrnAZ2Bh',
  '4zHxxwmt8d7Z1JSEqTNffC9ediMTVATUWLsBM9qTyG4VXjTEi38FJMR2dtXXWNqB3djGqd8j5BqPe5NmiZuZN2jX',
  'fN2UHgVUyBzqHW6T4WLTRCYU67XdxkJDHVxB9KgrsMGHzfoyFDKdaGWYVxPQtyKC4MxJSfsPG9iQ8riZguuNXmD',
  '4PHT9RxMwNUhoKbaLCL3uMC8BeE1ELaQPurWxcdW46RM7zfkKVECNjWL8LuEue21VedqLKPNYorbe2uGnWNyaq4H',
  'dQ6ox1UVQ4mbFE1KQ1kKQkWK2faqq1MohsWJBpGhpUfnLh18rUxYGD7FZae5Dqn9HGK4ShRzN9f6MWBtdQUozQG',
  '2bvf7oZejgf27VEKdbLYpF5GYH24vMXM1j6179vxQqvuzXH7fJmF6nU5A3VZhGZrsvzeqgf96s6Wse6rznxU3Wpt',
  '2cic5bY1WdPUbzkXzzUzrZCHe44oPsm4NHWQmVrqQMgbcsV2MF5WTrm9yJEEkKJeDriVSWoCoFaxW1rHEykXTF8b',
  '4TphftsTTTQH2sAH3MbZ2fn3oCLpZLyySxXAnDaA3rUbPhqK5dhc3Va8kMNx6FQwvPwe7wAsDMsp1foHkmAMZHBX'
]

const results = {
  total: 0,
  success: 0,
  failed: 0
}

async function testTransaction(signature, index) {
  console.log(`\n[${index}/${SIGNATURES.length}] ${signature.substring(0, 20)}...`)
  
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    const tx = response.data.result

    const v2Input = {
      signature,
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: tx.fee || 0,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: tx.protocol,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions || []
    }

    const parseResult = parseShyftTransactionV2(v2Input)

    if (parseResult.success && parseResult.data) {
      results.success++
      const data = parseResult.data
      
      if ('sellRecord' in data) {
        console.log(`  ✅ SPLIT SWAP`)
        console.log(`     SELL: ${data.sellRecord.baseAsset.symbol} → ${data.sellRecord.quoteAsset.symbol}`)
        console.log(`     BUY:  ${data.buyRecord.quoteAsset.symbol} → ${data.buyRecord.baseAsset.symbol}`)
      } else {
        console.log(`  ✅ ${data.direction}: ${data.baseAsset.symbol} (${data.amounts.baseAmount})`)
        if (data.direction === 'BUY') {
          console.log(`     Spent: ${data.quoteAsset.symbol} ${data.amounts.totalWalletCost || data.amounts.swapInputAmount}`)
        } else {
          console.log(`     Received: ${data.quoteAsset.symbol} ${data.amounts.netWalletReceived || data.amounts.swapOutputAmount}`)
        }
      }
    } else {
      results.failed++
      console.log(`  ❌ REJECTED: ${parseResult.erase?.reason}`)
    }

  } catch (error) {
    results.failed++
    console.log(`  ❌ ERROR: ${error.message}`)
  }
}

async function main() {
  console.log('Testing "no_swap_action" transactions with V2 Parser')
  console.log('='.repeat(70))
  
  results.total = SIGNATURES.length

  for (let i = 0; i < SIGNATURES.length; i++) {
    await testTransaction(SIGNATURES[i], i + 1)
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  console.log('\n' + '='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total: ${results.total}`)
  console.log(`✅ Success: ${results.success} (${(results.success / results.total * 100).toFixed(1)}%)`)
  console.log(`❌ Failed: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`)
  console.log('='.repeat(70))
}

main()
