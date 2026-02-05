/**
 * Check what pSo1f9nQ token is
 */

const axios = require('axios')

const MINT = 'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL'

async function checkToken() {
  console.log(`Checking token: ${MINT}\n`)
  
  try {
    // Try DexScreener
    console.log('🔍 Checking DexScreener...')
    const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${MINT}`)
    
    if (dexResponse.data && dexResponse.data.pairs && dexResponse.data.pairs.length > 0) {
      const pair = dexResponse.data.pairs[0]
      console.log('✅ Found on DexScreener:')
      console.log(`  Name: ${pair.baseToken.name}`)
      console.log(`  Symbol: ${pair.baseToken.symbol}`)
      console.log(`  Address: ${pair.baseToken.address}`)
      console.log(`  Price USD: $${pair.priceUsd}`)
      console.log(`  Liquidity: $${pair.liquidity?.usd || 'N/A'}`)
    } else {
      console.log('❌ Not found on DexScreener')
    }
  } catch (error) {
    console.error('Error checking DexScreener:', error.message)
  }
  
  try {
    // Try Jupiter
    console.log('\n🔍 Checking Jupiter...')
    const jupResponse = await axios.get(`https://tokens.jup.ag/token/${MINT}`)
    
    if (jupResponse.data) {
      console.log('✅ Found on Jupiter:')
      console.log(`  Name: ${jupResponse.data.name}`)
      console.log(`  Symbol: ${jupResponse.data.symbol}`)
      console.log(`  Decimals: ${jupResponse.data.decimals}`)
      console.log(`  Tags: ${jupResponse.data.tags?.join(', ') || 'None'}`)
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ Not found on Jupiter')
    } else {
      console.error('Error checking Jupiter:', error.message)
    }
  }
}

checkToken()
