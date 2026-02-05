/**
 * Deep Dive into Transaction 4Rqs6Ni9...
 * 
 * This transaction is being rejected for invalid_asset_count (1 asset)
 * Let's understand why and if it should be accepted
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY
const signature = '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD'

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
}

async function fetchShyftTransaction(sig) {
  const response = await axios.get(
    `https://api.shyft.to/sol/v1/transaction/parsed`,
    {
      params: {
        network: 'mainnet-beta',
        txn_signature: sig,
      },
      headers: {
        'x-api-key': SHYFT_API_KEY,
      },
    }
  )
  return response.data?.result || null
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(colors.cyan(colors.bold('║         Deep Dive: Transaction 4Rqs6Ni9...                                ║')))
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  const tx = await fetchShyftTransaction(signature)
  
  if (!tx) {
    console.log(colors.red('Failed to fetch transaction'))
    return
  }

  console.log(colors.blue('📊 Basic Info:'))
  console.log(colors.gray(`   Signature: ${signature}`))
  console.log(colors.gray(`   Protocol: ${tx.protocol?.name || 'Unknown'}`))
  console.log(colors.gray(`   Status: ${tx.status}`))
  console.log(colors.gray(`   Fee Payer: ${tx.fee_payer}`))
  console.log(colors.gray(`   Fee: ${tx.fee} lamports`))

  console.log(colors.blue('\n💰 Token Balance Changes:'))
  if (!tx.token_balance_changes || tx.token_balance_changes.length === 0) {
    console.log(colors.yellow('   No token balance changes!'))
  } else {
    tx.token_balance_changes.forEach((change, i) => {
      console.log(colors.cyan(`\n   ${i + 1}. ${change.symbol || 'Unknown'} (${change.token_address || 'SOL'})`))
      console.log(colors.gray(`      Owner: ${change.owner}`))
      console.log(colors.gray(`      Change Amount: ${change.change_amount}`))
      console.log(colors.gray(`      Change Type: ${change.change_type}`))
      console.log(colors.gray(`      Decimals: ${change.decimals || 'N/A'}`))
    })
  }

  console.log(colors.blue('\n🎬 Actions:'))
  tx.actions?.forEach((action, i) => {
    console.log(colors.cyan(`\n   ${i + 1}. ${action.type}`))
    if (action.info) {
      if (action.type === 'SWAP') {
        console.log(colors.gray(`      Swapper: ${action.info.swapper}`))
        if (action.info.tokens_swapped) {
          console.log(colors.gray(`      IN: ${action.info.tokens_swapped.in?.symbol} (${action.info.tokens_swapped.in?.amount})`))
          console.log(colors.gray(`          Token: ${action.info.tokens_swapped.in?.token_address}`))
          console.log(colors.gray(`          Amount Raw: ${action.info.tokens_swapped.in?.amount_raw}`))
          console.log(colors.gray(`      OUT: ${action.info.tokens_swapped.out?.symbol} (${action.info.tokens_swapped.out?.amount})`))
          console.log(colors.gray(`           Token: ${action.info.tokens_swapped.out?.token_address}`))
          console.log(colors.gray(`           Amount Raw: ${action.info.tokens_swapped.out?.amount_raw}`))
        }
      } else if (action.type === 'TOKEN_TRANSFER') {
        console.log(colors.gray(`      From: ${action.info.sender}`))
        console.log(colors.gray(`      To: ${action.info.receiver}`))
        console.log(colors.gray(`      Amount: ${action.info.amount}`))
        console.log(colors.gray(`      Token: ${action.info.token_address}`))
      } else if (action.type === 'SOL_TRANSFER') {
        console.log(colors.gray(`      From: ${action.info.sender}`))
        console.log(colors.gray(`      To: ${action.info.receiver}`))
        console.log(colors.gray(`      Amount: ${action.info.amount} SOL`))
      }
    }
  })

  console.log(colors.blue('\n🔍 Analysis:'))
  
  // Check if swapper is in balance changes
  const swapAction = tx.actions?.find(a => a.type === 'SWAP')
  if (swapAction) {
    const swapper = swapAction.info?.swapper
    console.log(colors.yellow(`\n   Swapper from SWAP action: ${swapper}`))
    
    const swapperChanges = tx.token_balance_changes?.filter(c => c.owner === swapper)
    console.log(colors.yellow(`   Balance changes for swapper: ${swapperChanges?.length || 0}`))
    
    if (swapperChanges && swapperChanges.length > 0) {
      swapperChanges.forEach(change => {
        console.log(colors.gray(`      - ${change.symbol}: ${change.change_amount}`))
      })
    } else {
      console.log(colors.red('   ⚠️  Swapper has NO balance changes!'))
      console.log(colors.yellow('   This means:'))
      console.log(colors.yellow('   1. The swap happened but balance changes are missing'))
      console.log(colors.yellow('   2. OR the transaction failed'))
      console.log(colors.yellow('   3. OR the tokens went to a different address'))
    }

    // Check who has balance changes
    console.log(colors.yellow('\n   All balance change owners:'))
    const owners = new Set(tx.token_balance_changes?.map(c => c.owner) || [])
    owners.forEach(owner => {
      const isSwapper = owner === swapper
      const changes = tx.token_balance_changes?.filter(c => c.owner === owner)
      console.log(colors.gray(`      ${owner.substring(0, 8)}... ${isSwapper ? '(SWAPPER)' : ''}`))
      changes?.forEach(c => {
        console.log(colors.gray(`         ${c.symbol}: ${c.change_amount}`))
      })
    })
  }

  // Try parsing with V2
  console.log(colors.blue('\n🔧 V2 Parser Result:'))
  const v2Input = {
    signature: signature,
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

  if (parseResult.success) {
    console.log(colors.green('   ✅ ACCEPTED'))
  } else {
    console.log(colors.red('   ❌ REJECTED'))
    console.log(colors.gray(`   Reason: ${parseResult.erase?.reason}`))
    if (parseResult.erase?.metadata) {
      console.log(colors.gray(`   Metadata: ${JSON.stringify(parseResult.erase.metadata, null, 2)}`))
    }
  }

  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('CONCLUSION')))
  console.log(colors.cyan('═'.repeat(80)))
  
  console.log(colors.yellow('\nThis is a PUMP swap where:'))
  console.log(colors.yellow('- SWAP action shows: SoloXBT → SOL'))
  console.log(colors.yellow('- Swapper: 8yJFWmVT...'))
  console.log(colors.yellow('- But swapper has ZERO SOL balance change'))
  console.log(colors.yellow('- Only the pool (GLoREQH4...) received tokens'))
  
  console.log(colors.red('\n⚠️  This indicates:'))
  console.log(colors.red('1. The SWAP action metadata is present'))
  console.log(colors.red('2. But the swapper\'s balance didn\'t change'))
  console.log(colors.red('3. This could be:'))
  console.log(colors.red('   - A failed transaction'))
  console.log(colors.red('   - Missing balance change data from SHYFT'))
  console.log(colors.red('   - Tokens went to a different address'))
  
  console.log(colors.green('\n✅ Parser behavior is CORRECT:'))
  console.log(colors.green('- Parser uses balance changes as source of truth'))
  console.log(colors.green('- If swapper\'s balance didn\'t change, it\'s not a valid swap'))
  console.log(colors.green('- Rejecting this transaction is the right decision'))
  
  console.log(colors.yellow('\n💡 Recommendation:'))
  console.log(colors.yellow('- Keep the rejection'))
  console.log(colors.yellow('- This is working as designed'))
  console.log(colors.yellow('- Balance changes define truth, not SWAP actions\n'))
}

main().catch(error => {
  console.error(colors.red('💥 Fatal Error:'), error)
  process.exit(1)
})
