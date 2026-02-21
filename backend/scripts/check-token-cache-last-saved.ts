/**
 * Check when data was last saved to token metadata and token data cache collections.
 * Run: npx ts-node -r tsconfig-paths/register scripts/check-token-cache-last-saved.ts
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import TokenMetadataCacheModel from '../src/models/token-metadata-cache.model'
import TokenDataModel from '../src/models/token-data.model'

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI

async function main() {
  if (!MONGO_URI) {
    console.error('Missing MONGO_URI or MONGODB_URI in env')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  console.log('Connected to MongoDB\n')

  // 1) TokenMetadataCache (symbol, name) - collection: tokenmetadatacache
  const metaCount = await TokenMetadataCacheModel.countDocuments()
  const metaLatest = await TokenMetadataCacheModel.findOne()
    .sort({ lastUpdated: -1 })
    .select('tokenAddress symbol name source lastUpdated createdAt')
    .lean()
  const metaLatestByCreated = await TokenMetadataCacheModel.findOne()
    .sort({ createdAt: -1 })
    .select('tokenAddress symbol name source lastUpdated createdAt')
    .lean()

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('1) TokenMetadataCache (tokenmetadatacache)')
  console.log('   Stores: tokenAddress, symbol, name, source')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`   Total documents: ${metaCount}`)
  if (metaLatest) {
    console.log(`   Last updated (lastUpdated): ${metaLatest.lastUpdated?.toISOString?.() ?? metaLatest.lastUpdated}`)
    console.log(`      → ${metaLatest.symbol} (${metaLatest.tokenAddress?.slice(0, 8)}...)`)
    console.log(`   Most recent by createdAt:  ${metaLatestByCreated?.createdAt?.toISOString?.() ?? metaLatestByCreated?.createdAt}`)
  } else {
    console.log('   No documents in collection.')
  }
  console.log('')

  // 2) TokenData (imageUrl, etc.) - collection: tokendatas (default Mongoose plural)
  const dataCount = await TokenDataModel.countDocuments()
  const dataLatest = await TokenDataModel.findOne()
    .sort({ lastUpdated: -1 })
    .select('tokenAddress imageUrl lastUpdated createdAt')
    .lean()
  const dataLatestByCreated = await TokenDataModel.findOne()
    .sort({ createdAt: -1 })
    .select('tokenAddress imageUrl lastUpdated createdAt')
    .lean()

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('2) TokenData (tokendatas)')
  console.log('   Stores: tokenAddress, imageUrl (symbol/name not written by app)')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`   Total documents: ${dataCount}`)
  if (dataLatest) {
    console.log(`   Last updated (lastUpdated): ${dataLatest.lastUpdated?.toISOString?.() ?? dataLatest.lastUpdated}`)
    console.log(`      → ${dataLatest.tokenAddress?.slice(0, 8)}... (image: ${dataLatest.imageUrl ? 'yes' : 'no'})`)
    console.log(`   Most recent by createdAt:  ${dataLatestByCreated?.createdAt?.toISOString?.() ?? dataLatestByCreated?.createdAt}`)
  } else {
    console.log('   No documents in collection.')
  }
  console.log('')

  await mongoose.disconnect()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
