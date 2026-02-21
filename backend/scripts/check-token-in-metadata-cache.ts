/**
 * Check if a token's name and symbol are saved in the metadata cache (tokenmetadatacache).
 * Run: npx ts-node -r tsconfig-paths/register scripts/check-token-in-metadata-cache.ts <tokenAddress>
 * Example: npx ts-node -r tsconfig-paths/register scripts/check-token-in-metadata-cache.ts 4xLk2JHcQQES3D1QrE8tLaKnAxq3zMVmh3YdCSL7pump
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import TokenMetadataCacheModel from '../src/models/token-metadata-cache.model'

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI
const tokenAddress = process.argv[2]

async function main() {
  if (!tokenAddress) {
    console.error('Usage: npx ts-node scripts/check-token-in-metadata-cache.ts <tokenAddress>')
    process.exit(1)
  }

  if (!MONGO_URI) {
    console.error('Missing MONGO_URI or MONGODB_URI in .env')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  console.log('Connected to MongoDB\n')
  console.log(`Token: ${tokenAddress}\n`)

  const doc = await TokenMetadataCacheModel.findOne({ tokenAddress })
    .select('tokenAddress symbol name source lastUpdated createdAt')
    .lean()

  if (!doc) {
    console.log('❌ NOT in database (tokenmetadatacache).')
    console.log('   Name and symbol are not saved for this token.')
    console.log('   Next time it is resolved (e.g. in a whale/KOL tx), Birdeye/RPC will be tried and may cache it.')
  } else {
    console.log('✅ Found in database (tokenmetadatacache):')
    console.log('   symbol:', doc.symbol)
    console.log('   name: ', doc.name)
    console.log('   source:', doc.source)
    console.log('   lastUpdated:', doc.lastUpdated?.toISOString?.() ?? doc.lastUpdated)
    console.log('   createdAt: ', doc.createdAt?.toISOString?.() ?? doc.createdAt)
  }

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
