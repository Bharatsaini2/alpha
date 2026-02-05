/**
 * Test Specific Invalid Asset Count Transaction
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY

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

async function testSignature(signature) {
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('Testing Invalid Asset Count Fix')))
  console.log(colors.cyan('═'.repeat(80)))
  console.log(colors.gray(`Signature: ${signature}\n`))

  const shyftResponse = await fetchShyftTransaction(signature)
  if (!shyftResponse) {
    console.log(colors.red('❌ Failed to fetch transaction'))
    return
  }

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
  console.log(colors.gray(`   Balance Changes: ${v2Input.token_balance_changes.length}`))
  console.log(colors.gray(`   Actions: ${v2Input.actions.length}`))

  // Show balance changes
  console.log(colors.blue('\n💰 Balance Changes:'))
  v2Input.token_balance_changes.forEach((change, i) => {
    console.log(colors.gray(`   ${i + 1}. ${change.token_address?.substring(0, 8)}... (${change.symbol || 'Unknown'})`))
    console.log(colors.gray(`      Owner: ${change.owner?.substring(0, 8)}...`))
    console.log(colors.gray(`      Change: ${change.change_amount} (${change.change_type})`))
  })

  const parseResult = parseShyftTransactionV2(v2Input)

  if (parseResult.success && parseResult.data) {
    console.log(colors.green('\n✅ PARSER ACCEPTED TRANSACTION'))
    console.log(colors.green('   Fix worked! Transaction no longer rejected for invalid_asset_count'))
    
    const swap = parseResult.data
    if ('sellRecord' in swap) {
      console.log(colors.yellow('\n   Split swap detected'))
    } else {
      console.log(colors.blue(`\n   Direction: ${swap.direction}`))
      console.log(colors.gray(`   Base: ${swap.baseAsset.symbol}`))
      console.log(colors.gray(`   Quote: ${swap.quoteAsset.symbol}`))
    }
  } else {
    console.log(colors.red('\n❌ PARSER REJECTED TRANSACTION'))
    console.log(colors.gray(`   Reason: ${parseResult.erase?.reason || 'unknown'}`))
    
    if (parseResult.erase?.reason === 'invalid_asset_count') {
      console.log(colors.red('\n   ⚠️  FIX DID NOT WORK - Still getting invalid_asset_count'))
    } else {
      console.log(colors.yellow('\n   ℹ️  Rejected for different reason (not invalid_asset_count)'))
      console.log(colors.yellow('   This might be expected if transaction has other issues'))
    }
  }
}

async function main() {
  // Test all 5 signatures that were rejected for invalid_asset_count
  const signatures = [
    '5c7D15Ubv4WAF3Xe4si8VSj4JV7YXKY23bKfmWHMeq5nNZs2hh54YNohhEGthrJoppyief6HbE8Gjb9nJXysN2x2',
    '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD',
    'mZyM37GPK8wRcEHcHdp6eiU5DxfNnrAgm6J7L2VRZ21rGrLHakvmdgtPaP4ZKBd4hpLdf8dsDoVPNJ5M6yGP96j',
    '2mCap1gkkm9bxgVVZT83sGKALis5ByVh23n97Rjg7kLQu5w1DwDKqzwd4su8bZoCAS3GNU8EBwnTAwcSVLtfhVuM',
    '4nKpyTXUhB3j54kJH6X1K7gs66cDryC5Um2oVd8g1JtaLA4h2er7M9mTrv7fzEjUCyGSPDBu44oM3KS6S7MK2eTg'
  ]

  for (const sig of signatures) {
    await testSignature(sig)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('SUMMARY')))
  console.log(colors.cyan('═'.repeat(80)))
  console.log(colors.yellow('\nIf any transactions are still rejected for invalid_asset_count,'))
  console.log(colors.yellow('the SOL/WSOL merge fix needs more work.'))
  console.log(colors.yellow('\nIf they are rejected for OTHER reasons (like below_minimum_value_threshold),'))
  console.log(colors.yellow('then the fix is working correctly!\n'))
}

main().catch(error => {
  console.error(colors.red('💥 Fatal Error:'), error)
  process.exit(1)
})
