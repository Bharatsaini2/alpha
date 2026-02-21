/**
 * One-off script: fetch Birdeye token metadata for a given address and print raw response.
 * Usage: npx ts-node scripts/check-birdeye-metadata.ts <tokenAddress>
 * Example: npx ts-node scripts/check-birdeye-metadata.ts 8fyY5Xb4EY37CUNeak8J6YAtBzBCXrf4Az6B9Lke9mG2
 */

import dotenv from 'dotenv'
dotenv.config()

const BIRD_EYE_API_KEY = process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4'
const tokenAddress = process.argv[2] || '8fyY5Xb4EY37CUNeak8J6YAtBzBCXrf4Az6B9Lke9mG2'

async function main() {
  const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`
  console.log('Fetching:', url)
  console.log('')

  const response = await fetch(url, {
    headers: {
      'X-API-KEY': BIRD_EYE_API_KEY,
      accept: 'application/json',
      'x-chain': 'solana',
    },
  })

  const json = await response.json()
  console.log('Status:', response.status)
  console.log('Raw response:', JSON.stringify(json, null, 2))
  console.log('')

  const data = json?.data
  if (data) {
    const symbol = (data.symbol ?? data.symbol_str ?? '').toString().trim()
    const name = (data.name ?? data.symbol ?? symbol).toString().trim()
    const logoUri = data.logo_uri ?? data.logoURI ?? null
    console.log('Parsed (as in tryBirdEyeMetadata):')
    console.log('  symbol:', symbol || '(empty)')
    console.log('  name:', name || '(empty)')
    console.log('  logo_uri / logoURI:', logoUri || '(empty)')
  } else {
    console.log('No data in response.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
