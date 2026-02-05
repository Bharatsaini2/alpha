const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config()

const signature = 'ZkD29a4wUftF4j2fqpyR9GoKrWvnk5iKHxUbr6vBDFoaNwHNadx51P4ECTHRMvWrwbgWkS6KfqAGxPv9mNZzsc8'

async function testParser() {
  console.log('🔍 Fetching transaction from SHYFT API...\n')
  
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY,
        },
      }
    )
    
    const tx = response.data.result
    
    console.log('✅ Transaction fetched successfully\n')
    console.log('🔍 Debug - Raw tx object keys:', Object.keys(tx))
    console.log('🔍 Debug - tx.signature:', tx.signature)
    console.log('🔍 Debug - tx.txn_signature:', tx.txn_signature)
    
    console.log('\n📊 Preparing V2 Parser Input...')
    
    // SHYFT API returns the transaction data directly, not nested
    const v2Input = {
      signature: tx.txn_signature || tx.signature || signature,
      timestamp: tx.timestamp,
      status: tx.status,
      fee: tx.fee,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: tx.protocol || { name: 'UNKNOWN', address: '' },
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions || []
    }
    
    console.log('\n🔍 Debug - v2Input:')
    console.log('  signature:', v2Input.signature)
    console.log('  timestamp:', v2Input.timestamp)
    console.log('  status:', v2Input.status)
    console.log('  fee:', v2Input.fee)
    console.log('  token_balance_changes count:', v2Input.token_balance_changes.length)
    console.log('  actions count:', v2Input.actions.length)
    
    console.log('\n🔧 Calling V2 Parser...\n')
    const parseResult = parseShyftTransactionV2(v2Input)
    
    if (!parseResult.success) {
      console.error('❌ Parser failed:', parseResult.error)
      return
    }
    
    console.log('✅ Parser succeeded!\n')
    console.log('='.repeat(80))
    
    const swapData = parseResult.data
    
    if ('sellRecord' in swapData) {
      console.log('📦 SPLIT SWAP PAIR DETECTED')
      console.log('\n🔴 SELL Record:')
      console.log(JSON.stringify(swapData.sellRecord, null, 2))
      console.log('\n🟢 BUY Record:')
      console.log(JSON.stringify(swapData.buyRecord, null, 2))
    } else {
      console.log('📦 SINGLE SWAP')
      console.log('\nDirection:', swapData.direction)
      console.log('\n📥 Quote Asset (what you spend):')
      console.log('  Mint:', swapData.quoteAsset.mint)
      console.log('  Symbol:', swapData.quoteAsset.symbol)
      console.log('  Decimals:', swapData.quoteAsset.decimals)
      
      console.log('\n📤 Base Asset (what you get):')
      console.log('  Mint:', swapData.baseAsset.mint)
      console.log('  Symbol:', swapData.baseAsset.symbol)
      console.log('  Decimals:', swapData.baseAsset.decimals)
      
      console.log('\n💰 Amounts:')
      console.log('  baseAmount:', swapData.amounts.baseAmount)
      console.log('  swapInputAmount:', swapData.amounts.swapInputAmount)
      console.log('  swapOutputAmount:', swapData.amounts.swapOutputAmount)
      console.log('  totalWalletCost:', swapData.amounts.totalWalletCost)
      console.log('  netWalletReceived:', swapData.amounts.netWalletReceived)
      
      console.log('\n🔍 Fee Breakdown:')
      console.log(JSON.stringify(swapData.amounts.feeBreakdown, null, 2))
      
      console.log('\n📊 Metadata:')
      console.log('  Confidence:', swapData.confidence)
      console.log('  Protocol:', swapData.protocol)
      console.log('  Swapper:', swapData.swapper)
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('\n🔍 ANALYSIS:')
    
    if ('sellRecord' in swapData) {
      console.log('⚠️  This is a SPLIT SWAP but should be a SINGLE SWAP!')
      console.log('   LASER → SOL should NOT create a split swap')
    } else {
      console.log('✅ Correctly identified as single swap')
      
      if (swapData.direction === 'SELL') {
        console.log('✅ Direction is SELL (correct)')
        
        // Check amounts
        if (swapData.amounts.baseAmount === undefined) {
          console.log('❌ baseAmount is undefined!')
        } else {
          console.log(`✅ baseAmount: ${swapData.amounts.baseAmount}`)
          console.log(`   Expected: 3552844.976777`)
          console.log(`   Match: ${Math.abs(swapData.amounts.baseAmount - 3552844.976777) < 1 ? 'YES' : 'NO'}`)
        }
        
        if (swapData.amounts.swapOutputAmount === undefined && swapData.amounts.netWalletReceived === undefined) {
          console.log('❌ swapOutputAmount and netWalletReceived are both undefined!')
        } else {
          const outputAmount = swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived
          console.log(`✅ Output amount: ${outputAmount}`)
          console.log(`   Expected: 2.50854525`)
          console.log(`   Match: ${Math.abs(outputAmount - 2.50854525) < 0.01 ? 'YES' : 'NO'}`)
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

testParser().catch(console.error)
