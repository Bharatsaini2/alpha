require('dotenv').config()
const axios = require('axios')

const SIGNATURE = '56Tk6mvXzwD1249govZuxSVv4dGrgTxwRTUR57UaZoVzBYfR8EVJKcR4evMynWd9qbWVcqRmG1F7XzJTP3LsynR7'

async function fetchShyftRawResponse() {
  try {
    console.log('Fetching raw Shyft response for transaction:', SIGNATURE)
    console.log('='.repeat(80))
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: SIGNATURE,
          enable_raw: true
        },
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY
        }
      }
    )
    
    console.log('\n📦 FULL RAW RESPONSE:')
    console.log('='.repeat(80))
    console.log(JSON.stringify(response.data, null, 2))
    
    console.log('\n\n📋 KEY FIELDS:')
    console.log('='.repeat(80))
    console.log('Success:', response.data.success)
    console.log('Transaction Type:', response.data.result?.type)
    console.log('Status:', response.data.result?.status)
    console.log('Timestamp:', response.data.result?.timestamp)
    console.log('Fee:', response.data.result?.fee)
    
    console.log('\n\n🔄 ACTIONS:')
    console.log('='.repeat(80))
    if (response.data.result?.actions) {
      response.data.result.actions.forEach((action, index) => {
        console.log(`\nAction ${index + 1}:`)
        console.log('  Type:', action.type)
        console.log('  Info:', JSON.stringify(action.info, null, 4))
      })
    }
    
    console.log('\n\n💰 TOKEN TRANSFERS:')
    console.log('='.repeat(80))
    if (response.data.result?.actions) {
      const transfers = response.data.result.actions.filter(a => 
        a.type === 'TOKEN_TRANSFER' || 
        a.type === 'SOL_TRANSFER' || 
        a.type === 'TRANSFER'
      )
      console.log(JSON.stringify(transfers, null, 2))
    }
    
    console.log('\n\n🔀 SWAP ACTIONS:')
    console.log('='.repeat(80))
    if (response.data.result?.actions) {
      const swaps = response.data.result.actions.filter(a => 
        a.type?.includes('SWAP') || 
        a.type?.includes('JUPITER') ||
        a.type?.includes('RAYDIUM') ||
        a.type?.includes('ORCA')
      )
      console.log(JSON.stringify(swaps, null, 2))
    }
    
    // Save to file
    const fs = require('fs')
    const filename = `shyft-raw-response-${SIGNATURE.substring(0, 10)}.json`
    fs.writeFileSync(filename, JSON.stringify(response.data, null, 2))
    console.log(`\n\n✅ Full response saved to: ${filename}`)
    
  } catch (error) {
    console.error('❌ Error fetching Shyft response:')
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', JSON.stringify(error.response.data, null, 2))
    } else {
      console.error(error.message)
    }
  }
}

fetchShyftRawResponse()
