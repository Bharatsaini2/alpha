/**
 * Diagnostic: Token metadata cache and symbol usage in last 24h
 * Run: npx ts-node scripts/check-token-metadata-cache.ts
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import mongoose from 'mongoose'

dotenv.config({ path: path.join(__dirname, '../.env') })

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''

async function main() {
  if (!MONGO_URI) {
    console.error('MONGO_URI or MONGODB_URI required')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  const db = mongoose.connection.db
  if (!db) throw new Error('No DB connection')

  // Whale addresses loaded for subscription (same logic as whale controller)
  const whalesColl = db.collection('whalesaddresses')
  const whaleDocs = await whalesColl.find({}, { projection: { whalesAddress: 1, _id: 0 } }).toArray()
  const allWhaleAddrs = whaleDocs.flatMap((d: any) => d.whalesAddress || [])
  const uniqueWhaleAddrs = [...new Set(allWhaleAddrs)]
  console.log('\n=== Whale subscription (whalesaddresses) ===')
  console.log(`Docs (tokens): ${whaleDocs.length}`)
  console.log(`Total addresses (flatMap): ${allWhaleAddrs.length}`)
  console.log(`Unique addresses (deduped): ${uniqueWhaleAddrs.length}`)
  console.log(`Duplicates: ${allWhaleAddrs.length - uniqueWhaleAddrs.length}`)

  // List all collections to verify names
  const allColls = await db.listCollections().toArray()
  const collNames = allColls.map((c: any) => c.name).filter((n: string) => n.includes('whale') || n.includes('transaction') || n.includes('influencer'))
  console.log('\n=== Collections (whale/transaction/influencer) ===')
  for (const name of collNames) {
    const count = await db.collection(name).countDocuments()
    console.log(`  ${name}: ${count} docs`)
  }

  const use1Week = process.argv.includes('--1w')
  const periodMs = use1Week ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const periodLabel = use1Week ? '1 week' : '24h'
  const since = new Date(Date.now() - periodMs)

  // 1. TokenMetadataCache - how many created/updated in period
  const tokenMetadataColl = db.collection('tokenmetadatacache')
  const cacheLast24h = await tokenMetadataColl.countDocuments({
    $or: [
      { lastUpdated: { $gte: since } },
      { createdAt: { $gte: since } },
    ],
  })
  const cacheTotal = await tokenMetadataColl.countDocuments({})
  const cacheNewLast24h = await tokenMetadataColl.countDocuments({ createdAt: { $gte: since } })

  // By source (last 24h)
  const cacheBySource = await tokenMetadataColl
    .aggregate([
      {
        $match: {
          $or: [
            { lastUpdated: { $gte: since } },
            { createdAt: { $gte: since } },
          ],
        },
      },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray()

  // 2. Whale transactions last 24h - use correct V2 collections (whalealltransactionv2, influencerwhaletransactionsv2)
  const whaleCollName = collNames.includes('whalealltransactionv2') ? 'whalealltransactionv2' : 'whalealltransactionv2'
  const whaleColl = db.collection(whaleCollName)
  const whaleLast24h = await whaleColl.countDocuments({
    $or: [{ timestamp: { $gte: since } }, { createdAt: { $gte: since } }],
  })
  const whaleTimeFilter = { $or: [{ timestamp: { $gte: since } }, { createdAt: { $gte: since } }] }
  const whaleUnknownIn = await whaleColl.countDocuments({
    $and: [
      whaleTimeFilter,
      { $or: [{ tokenInSymbol: 'Unknown' }, { tokenInSymbol: { $regex: /\.\.\./ } }, { tokenInSymbol: null }] },
    ],
  })
  const whaleUnknownOut = await whaleColl.countDocuments({
    $and: [
      whaleTimeFilter,
      { $or: [{ tokenOutSymbol: 'Unknown' }, { tokenOutSymbol: { $regex: /\.\.\./ } }, { tokenOutSymbol: null }] },
    ],
  })

  // 3. KOL/Influencer transactions last 24h
  const kolCollName = collNames.includes('influencerwhaletransactionsv2') ? 'influencerwhaletransactionsv2' : 'influencerwhaletransactionv2s'
  const kolColl = db.collection(kolCollName)
  const kolTimeFilter = { $or: [{ timestamp: { $gte: since } }, { createdAt: { $gte: since } }] }
  const kolLast24h = await kolColl.countDocuments(kolTimeFilter)
  const kolUnknownIn = await kolColl.countDocuments({
    $and: [
      kolTimeFilter,
      { $or: [{ tokenInSymbol: 'Unknown' }, { tokenInSymbol: { $regex: /\.\.\./ } }, { tokenInSymbol: null }] },
    ],
  })
  const kolUnknownOut = await kolColl.countDocuments({
    $and: [
      kolTimeFilter,
      { $or: [{ tokenOutSymbol: 'Unknown' }, { tokenOutSymbol: { $regex: /\.\.\./ } }, { tokenOutSymbol: null }] },
    ],
  })

  // 4. Sample of recent cache entries
  const recentCache = await tokenMetadataColl
    .find({ lastUpdated: { $gte: since } })
    .sort({ lastUpdated: -1 })
    .limit(5)
    .project({ tokenAddress: 1, symbol: 1, source: 1, lastUpdated: 1 })
    .toArray()

  console.log(`\n=== Token Metadata Cache (last ${periodLabel}) ===`)
  console.log(`Cache total: ${cacheTotal}`)
  console.log(`New tokens added (last ${periodLabel}): ${cacheNewLast24h}`)
  console.log(`Created/updated (last ${periodLabel}): ${cacheLast24h}`)
  console.log(`By source (last ${periodLabel}):`, JSON.stringify(cacheBySource, null, 2))
  console.log('\nRecent cache entries:', JSON.stringify(recentCache, null, 2))

  // Unique whale addresses with txns in last 24h
  const uniqueWhales24h = await whaleColl
    .aggregate([
      { $match: whaleTimeFilter },
      { $group: { _id: '$whaleAddress' } },
      { $count: 'count' },
    ])
    .toArray()
  const uniqueWhaleCount = uniqueWhales24h[0]?.count ?? 0

  console.log(`\n=== Whale transactions (last ${periodLabel}) ===`)
  console.log(`Collection: ${whaleCollName}`)
  console.log(`Total txns: ${whaleLast24h}`)
  console.log(`Unique whale addresses with txns: ${uniqueWhaleCount}`)
  console.log(`With Unknown/shortened tokenInSymbol: ${whaleUnknownIn}`)
  console.log(`With Unknown/shortened tokenOutSymbol: ${whaleUnknownOut}`)

  // Unique KOL addresses with txns in last 24h
  const uniqueKols24h = await kolColl
    .aggregate([
      { $match: kolTimeFilter },
      { $group: { _id: '$whaleAddress' } },
      { $count: 'count' },
    ])
    .toArray()
  const uniqueKolCount = uniqueKols24h[0]?.count ?? 0

  console.log(`\n=== KOL transactions (last ${periodLabel}) ===`)
  console.log(`Collection: ${kolCollName}`)
  console.log(`Total txns: ${kolLast24h}`)
  console.log(`Unique KOL addresses with txns: ${uniqueKolCount}`)
  console.log(`With Unknown/shortened tokenInSymbol: ${kolUnknownIn}`)
  console.log(`With Unknown/shortened tokenOutSymbol: ${kolUnknownOut}`)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
