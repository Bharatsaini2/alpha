/**
 * Test Core-to-Core Transaction Suppression
 * 
 * Tests the two transactions that should be suppressed
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

const TEST_SIGNATURES = [
  '5uGrxZNSd2BPBGQqjfSLWkmqvsLcY2sXjKdSizmSCz63FLXhL5yE6DSNxeM3jJtE7X8EGMHDpjucKZD17JdpWg6o',
  'v7LoThQVdZZhAcwLW7dEmPR7LbuyifRncP1q272QwyfVKhAZXnvFh4NqMz96mRNynU9a4k5AJDNUoiDM8UgAUyE'
]

// Clear require cache
delete require.cache[require.resolve('./dist/utils/shyftParserV2')]
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

async function testCoreToCore() {
  for (const signature of TEST_SIGNATURES) {
    console.log('\n' + '='.repeat(80))
    console.log(`Testing: ${signature}`)
    console.log('='.repeat(80))
    
    try {
      // Fetch transaction from SHYFT
      const response = await axios.get(
        `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
        {
          headers: { 'x-api-key': SHYFT_API_KEY }
        }
      )

      if (!response.data.success) {
        console.error('❌ Failed to fetch transaction')
        continue
      }

      const parsedTx = response.data.result

      // Convert to V2 format
      const v2Input = {
        signature,
        timestamp: parsedTx.timestamp ? new Date(parsedTx.timestamp).getTime() : Date.now(),
        status: parsedTx.status || 'Success',
        fee: parsedTx.fee || 0,
        fee_payer: parsedTx.fee_payer || '',
        signers: parsedTx.signers || [],
        protocol: parsedTx.protocol,
        token_balance_changes: parsedTx.token_balance_changes || [],
        actions: parsedTx.actions || []
      }

      // Parse with V2
      const parseResult = parseShyftTransactionV2(v2Input)

      console.log('\n📊 Transaction Info:')
      console.log(`  Type: ${parsedTx.type}`)
      console.log(`  Protocol: ${parsedTx.protocol?.name || 'Unknown'}`)
      
      // Check token balance changes
      if (parsedTx.token_balance_changes && parsedTx.token_balance_changes.length > 0) {
        console.log('\n💰 Token Balance Changes:')
        const swapperChanges = parsedTx.token_balance_changes.filter(
          c => c.owner === parsedTx.fee_payer
        )
        swapperChanges.forEach(change => {
          const direction = change.change_amount > 0 ? 'RECEIVED' : 'SENT'
          console.log(`  ${direction}: ${change.symbol || change.mint.substring(0, 8)} (${Math.abs(change.change_amount)})`)
        })
      }

      console.log('\n🔍 V2 Parser Result:')
      if (parseResult.success) {
        console.log('  ❌ PARSED (should be suppressed!)')
        const data = parseResult.data
        if ('sellRecord' in data) {
          console.log(`  Direction: SPLIT (${data.sellRecord.direction} + ${data.buyRecord.direction})`)
          console.log(`  Quote: ${data.sellRecord.quoteAsset.symbol}`)
          console.log(`  Base: ${data.sellRecord.baseAsset.symbol}`)
        } else {
          console.log(`  Direction: ${data.direction}`)
          console.log(`  Quote: ${data.quoteAsset.symbol}`)
          console.log(`  Base: ${data.baseAsset.symbol}`)
        }
      } else {
        console.log('  ✅ SUPPRESSED')
        console.log(`  Reason: ${parseResult.erase?.reason || 'unknown'}`)
        if (parseResult.erase?.debugInfo) {
          console.log(`  Debug: ${JSON.stringify(parseResult.erase.debugInfo)}`)
        }
      }

    } catch (error) {
      console.error('❌ Error:', error.message)
    }
  }
}

testCoreToCore()
