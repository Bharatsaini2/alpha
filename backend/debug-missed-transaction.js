/**
 * Debug Missed Transaction - V2 Parser Investigation
 * 
 * Investigating why V2 parser missed this specific transaction:
 * 5xr7r95wkVZjMg9NQcB5d99HUBP21xZ7q2acnZFeNrKyATUXdG1fyxzeNkQLoZh68kKCMvEkCThQWeLyfXFEwtZN
 * 
 * V1 detected: USDC (2000) → Unknown (13,229,297.363172) - $2001.08
 * V2 missed: Not detected
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
const { parseShyftTransaction } = require('./dist/utils/shyftParser')

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || ''
const SIGNATURE = '5xr7r95wkVZjMg9NQcB5d99HUBP21xZ7q2acnZFeNrKyATUXdG1fyxzeNkQLoZh68kKCMvEkCThQWeLyfXFEwtZN'

async function fetchShyftTransaction(signature) {
  try {
    console.log(`🔍 Fetching SHYFT data for: ${signature}`)
    
    // Try multiple endpoints
    const endpoints = [
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      `https://api.shyft.to/sol/v2/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`
    ]
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            'x-api-key': SHYFT_API_KEY,
          },
          timeout: 10000
        })
        
        if (response.data?.result) {
          console.log(`✅ Got data from: ${endpoint}`)
          return response.data.result
        }
      } catch (err) {
        console.log(`❌ Failed endpoint: ${endpoint} - ${err.message}`)
      }
    }
    
    return null
  } catch (error) {
    console.error('❌ Error fetching SHYFT data:', error.message)
    return null
  }
}

// Mock transaction data based on V1 detection for testing
function createMockTransactionData() {
  return {
    signature: SIGNATURE,
    timestamp: Date.now(),
    status: 'Success',
    fee: 5000,
    fee_payer: '2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU',
    signers: ['2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU'],
    protocol: {
      name: 'Jupiter',
      address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
    },
    token_balance_changes: [
      {
        address: '2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU',
        decimals: 6,
        change_amount: -2000000000, // -2000 USDC (6 decimals)
        post_balance: 0,
        pre_balance: 2000000000,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        owner: '2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU'
      },
      {
        address: '2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU',
        decimals: 6,
        change_amount: 13229297363172, // +13,229,297.363172 tokens (6 decimals)
        post_balance: 13229297363172,
        pre_balance: 0,
        mint: '3aGcHSGDMFAYVt3stLzVGLzyq9ZEKXP1Xzs8yHmDpump', // Unknown token
        owner: '2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU'
      }
    ],
    actions: [
      {
        type: 'SWAP',
        info: {
          swapper: '2Cj6qQvCsZrme9WWjctMCHYpMv1c9j3Lw6zRrPZJiukU',
          tokens_swapped: {
            in: {
              token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount_raw: '2000000000'
            },
            out: {
              token_address: '3aGcHSGDMFAYVt3stLzVGLzyq9ZEKXP1Xzs8yHmDpump',
              amount_raw: '13229297363172'
            }
          }
        }
      }
    ]
  }
}

async function debugMissedTransaction() {
  console.log('🔍 DEBUGGING MISSED TRANSACTION')
  console.log('=' .repeat(60))
  console.log(`Signature: ${SIGNATURE}`)
  console.log(`Expected: USDC (2000) → Token (13,229,297) - $2001.08`)
  console.log('')

  // Try to fetch real SHYFT data first
  let shyftData = await fetchShyftTransaction(SIGNATURE)
  
  if (!shyftData) {
    console.log('⚠️  Could not fetch real SHYFT data, using mock data for analysis')
    shyftData = createMockTransactionData()
  }

  console.log('📊 Transaction Data:')
  console.log(`Status: ${shyftData.status}`)
  console.log(`Fee Payer: ${shyftData.fee_payer}`)
  console.log(`Signers: ${JSON.stringify(shyftData.signers)}`)
  console.log(`Protocol: ${JSON.stringify(shyftData.protocol)}`)
  console.log('')

  console.log('💰 Token Balance Changes:')
  if (shyftData.token_balance_changes) {
    shyftData.token_balance_changes.forEach((change, i) => {
      console.log(`  ${i + 1}. ${change.mint}`)
      console.log(`     Owner: ${change.owner}`)
      console.log(`     Change: ${change.change_amount}`)
      console.log(`     Decimals: ${change.decimals}`)
      console.log('')
    })
  }

  console.log('🎬 Actions:')
  if (shyftData.actions) {
    shyftData.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. Type: ${action.type}`)
      console.log(`     Info: ${JSON.stringify(action.info, null, 2)}`)
      console.log('')
    })
  }

  // Test V1 parser first to confirm it detects the transaction
  console.log('🧪 Testing V1 Parser:')
  console.log('=' .repeat(40))
  
  const v1Result = parseShyftTransaction(shyftData)
  if (v1Result) {
    console.log('✅ V1 Parser SUCCESS:')
    console.log(`   Side: ${v1Result.side}`)
    console.log(`   Input: ${v1Result.input.symbol || v1Result.input.mint.substring(0, 8)} (${v1Result.input.amount})`)
    console.log(`   Output: ${v1Result.output.symbol || v1Result.output.mint.substring(0, 8)} (${v1Result.output.amount})`)
    console.log(`   Confidence: ${v1Result.confidence}`)
    console.log(`   Source: ${v1Result.classification_source}`)
  } else {
    console.log('❌ V1 Parser FAILED - this is unexpected!')
  }

  console.log('')
  console.log('🧪 Testing V2 Parser:')
  console.log('=' .repeat(40))

  // Test with V2 parser
  const parseResult = parseShyftTransactionV2(shyftData)

  if (parseResult.success) {
    console.log('✅ V2 Parser SUCCESS:')
    const swapData = parseResult.data
    
    if ('sellRecord' in swapData) {
      console.log(`   Type: Split Swap Pair`)
      console.log(`   Sell: ${swapData.sellRecord.direction} - ${swapData.sellRecord.quoteAsset.symbol} → ${swapData.sellRecord.baseAsset.symbol}`)
      console.log(`   Buy: ${swapData.buyRecord.direction} - ${swapData.buyRecord.quoteAsset.symbol} → ${swapData.buyRecord.baseAsset.symbol}`)
    } else {
      console.log(`   Direction: ${swapData.direction}`)
      console.log(`   Quote: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.mint})`)
      console.log(`   Base: ${swapData.baseAsset.symbol} (${swapData.baseAsset.mint})`)
      console.log(`   Input Amount: ${swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0}`)
      console.log(`   Output Amount: ${swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || swapData.amounts.baseAmount || 0}`)
    }
    console.log(`   Confidence: ${swapData.confidence || swapData.sellRecord?.confidence}`)
    console.log(`   Processing Time: ${parseResult.processingTimeMs}ms`)
  } else {
    console.log('❌ V2 Parser FAILED:')
    console.log(`   Reason: ${parseResult.erase?.reason}`)
    console.log(`   Debug Info:`)
    if (parseResult.erase?.debugInfo) {
      Object.entries(parseResult.erase.debugInfo).forEach(([key, value]) => {
        if (key === 'assetDeltas' && typeof value === 'object') {
          console.log(`     ${key}:`)
          Object.entries(value).forEach(([mint, delta]) => {
            console.log(`       ${mint}: ${JSON.stringify(delta)}`)
          })
        } else {
          console.log(`     ${key}: ${JSON.stringify(value)}`)
        }
      })
    }
    console.log(`   Processing Time: ${parseResult.processingTimeMs}ms`)
  }

  console.log('')
  console.log('🔍 ANALYSIS:')
  console.log('=' .repeat(40))
  
  if (!parseResult.success) {
    console.log('❌ V2 Parser rejected this transaction')
    console.log(`   Rejection reason: ${parseResult.erase?.reason}`)
    
    // Analyze common rejection reasons
    switch (parseResult.erase?.reason) {
      case 'below_minimum_value_threshold':
        console.log('   💡 Issue: Transaction value below $2 threshold')
        console.log('   🔧 Fix: This is a $2000+ transaction, minimum value logic may be wrong')
        break
      case 'swapper_identification_failed':
        console.log('   💡 Issue: Could not identify the swapper wallet')
        console.log('   🔧 Fix: Check swapper identification logic')
        break
      case 'simple_transfer_detected':
        console.log('   💡 Issue: Detected as transfer, not swap')
        console.log('   🔧 Fix: Review transfer detection logic - this has SWAP actions')
        break
      case 'quote_base_detection_failed':
        console.log('   💡 Issue: Could not determine quote/base assets')
        console.log('   🔧 Fix: Review quote/base detection logic')
        break
      case 'invalid_asset_count':
        console.log('   💡 Issue: Wrong number of assets involved')
        console.log('   🔧 Fix: Check asset delta collection')
        break
      default:
        console.log('   💡 Issue: Unknown rejection reason')
        console.log('   🔧 Fix: Investigate specific case')
    }
    
    // Provide specific recommendations
    console.log('')
    console.log('🔧 RECOMMENDED FIXES:')
    if (parseResult.erase?.reason === 'below_minimum_value_threshold') {
      console.log('   1. Check USD value calculation in validateMinimumValue()')
      console.log('   2. Verify USDC amount normalization (should be 2000, not 0.002)')
      console.log('   3. Ensure minimum value filter uses correct input/output amounts')
    } else if (parseResult.erase?.reason === 'simple_transfer_detected') {
      console.log('   1. Review detectSimpleTransfer() logic')
      console.log('   2. Ensure SWAP actions are properly detected')
      console.log('   3. Check if balance changes show proper inflow/outflow')
    }
  } else {
    console.log('✅ V2 Parser should have detected this transaction')
    console.log('   💡 This might be a timing issue or the transaction was processed differently during live testing')
  }
}

// Run the debug
debugMissedTransaction().catch(console.error)