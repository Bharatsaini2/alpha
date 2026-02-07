/**
 * Complete Analysis of Tracked Whale and KOL Addresses
 * 
 * This script shows:
 * 1. How many whale addresses are tracked
 * 2. How many KOL addresses are tracked
 * 3. How they're stored in the database (grouped or individual)
 * 4. Sample data structure
 * 5. Which addresses are actively being monitored by WebSocket
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

async function analyzeTrackedAddresses() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    
    // ============================================
    // 1. WHALE ADDRESSES ANALYSIS
    // ============================================
    console.log('═══════════════════════════════════════════════════════')
    console.log('🐋 WHALE ADDRESSES ANALYSIS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    const whaleCollection = db.collection('whalesaddresses')
    
    // Count documents (groups)
    const whaleDocCount = await whaleCollection.countDocuments()
    console.log(`📄 Total Whale Documents (Groups): ${whaleDocCount}`)
    
    // Get all whale addresses
    const whaleDocuments = await whaleCollection.find({}).toArray()
    
    // Count total addresses across all documents
    let totalWhaleAddresses = 0
    const whaleGroups = []
    
    for (const doc of whaleDocuments) {
      const addressCount = doc.whalesAddress ? doc.whalesAddress.length : 0
      totalWhaleAddresses += addressCount
      
      whaleGroups.push({
        id: doc._id,
        name: doc.name || doc.label || 'Unnamed Group',
        addressCount: addressCount,
        sampleAddress: doc.whalesAddress?.[0] || 'N/A'
      })
    }
    
    console.log(`🔢 Total Whale Addresses Being Tracked: ${totalWhaleAddresses}`)
    console.log(`📊 Average Addresses per Group: ${(totalWhaleAddresses / whaleDocCount).toFixed(2)}\n`)
    
    // Show storage structure
    console.log('📦 WHALE STORAGE STRUCTURE:')
    console.log('─────────────────────────────────────────────────────')
    console.log('Whales are stored in GROUPS (documents)')
    console.log('Each document contains an array of addresses\n')
    
    // Show top 10 groups
    whaleGroups.sort((a, b) => b.addressCount - a.addressCount)
    console.log('🏆 TOP 10 WHALE GROUPS BY SIZE:')
    console.log('─────────────────────────────────────────────────────')
    whaleGroups.slice(0, 10).forEach((group, index) => {
      console.log(`${index + 1}. ${group.name}`)
      console.log(`   📍 Addresses: ${group.addressCount}`)
      console.log(`   🔑 Sample: ${group.sampleAddress}`)
      console.log(`   🆔 Doc ID: ${group.id}`)
      console.log('')
    })
    
    // Show sample document structure
    console.log('📋 SAMPLE WHALE DOCUMENT STRUCTURE:')
    console.log('─────────────────────────────────────────────────────')
    const sampleWhaleDoc = whaleDocuments[0]
    console.log(JSON.stringify({
      _id: sampleWhaleDoc._id,
      name: sampleWhaleDoc.name || sampleWhaleDoc.label || 'N/A',
      whalesAddress: sampleWhaleDoc.whalesAddress?.slice(0, 3) || [],
      totalAddresses: sampleWhaleDoc.whalesAddress?.length || 0,
      otherFields: Object.keys(sampleWhaleDoc).filter(k => k !== '_id' && k !== 'whalesAddress')
    }, null, 2))
    console.log('')
    
    // ============================================
    // 2. KOL ADDRESSES ANALYSIS
    // ============================================
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('👤 KOL (INFLUENCER) ADDRESSES ANALYSIS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    const kolCollection = db.collection('influencerwhalesaddressv2')
    
    // Count documents
    const kolDocCount = await kolCollection.countDocuments()
    console.log(`📄 Total KOL Documents: ${kolDocCount}`)
    
    // Get all KOL documents
    const kolDocuments = await kolCollection.find({}).toArray()
    
    // Analyze KOL structure
    let totalKolAddresses = 0
    const kolProfiles = []
    
    for (const doc of kolDocuments) {
      // KOLs might be stored differently - check for address field
      const address = doc.address || doc.walletAddress || doc.whaleAddress || null
      if (address) {
        totalKolAddresses++
        kolProfiles.push({
          id: doc._id,
          name: doc.name || doc.username || doc.twitterHandle || 'Unknown',
          address: address,
          twitterHandle: doc.twitterHandle || 'N/A',
          followers: doc.followers || 0
        })
      }
    }
    
    console.log(`🔢 Total KOL Addresses Being Tracked: ${totalKolAddresses}`)
    console.log(`📊 Storage Type: ${totalKolAddresses === kolDocCount ? 'INDIVIDUAL (1 address per document)' : 'MIXED'}\n`)
    
    // Show storage structure
    console.log('📦 KOL STORAGE STRUCTURE:')
    console.log('─────────────────────────────────────────────────────')
    console.log('KOLs are stored INDIVIDUALLY (1 document per KOL)')
    console.log('Each document represents one influencer with their address\n')
    
    // Show top 10 KOLs by followers
    kolProfiles.sort((a, b) => b.followers - a.followers)
    console.log('🏆 TOP 10 KOLs BY FOLLOWERS:')
    console.log('─────────────────────────────────────────────────────')
    kolProfiles.slice(0, 10).forEach((kol, index) => {
      console.log(`${index + 1}. ${kol.name}`)
      console.log(`   🐦 Twitter: @${kol.twitterHandle}`)
      console.log(`   👥 Followers: ${kol.followers.toLocaleString()}`)
      console.log(`   🔑 Address: ${kol.address}`)
      console.log(`   🆔 Doc ID: ${kol.id}`)
      console.log('')
    })
    
    // Show sample document structure
    console.log('📋 SAMPLE KOL DOCUMENT STRUCTURE:')
    console.log('─────────────────────────────────────────────────────')
    const sampleKolDoc = kolDocuments[0]
    console.log(JSON.stringify({
      _id: sampleKolDoc._id,
      name: sampleKolDoc.name || sampleKolDoc.username,
      address: sampleKolDoc.address || sampleKolDoc.walletAddress,
      twitterHandle: sampleKolDoc.twitterHandle,
      followers: sampleKolDoc.followers,
      otherFields: Object.keys(sampleKolDoc).filter(k => 
        k !== '_id' && 
        k !== 'address' && 
        k !== 'walletAddress' && 
        k !== 'name' && 
        k !== 'username' &&
        k !== 'twitterHandle' &&
        k !== 'followers'
      )
    }, null, 2))
    console.log('')
    
    // ============================================
    // 3. TRANSACTION STATISTICS
    // ============================================
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('📊 TRANSACTION STATISTICS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    // Whale transactions
    const whaleTransactionCollection = db.collection('whalealltransactionv2')
    const totalWhaleTxns = await whaleTransactionCollection.countDocuments()
    console.log(`🐋 Total Whale Transactions: ${totalWhaleTxns.toLocaleString()}`)
    
    // Get unique whale addresses from transactions
    const uniqueWhalesInTxns = await whaleTransactionCollection.distinct('whaleAddress')
    console.log(`🔑 Unique Whale Addresses with Transactions: ${uniqueWhalesInTxns.length}`)
    console.log(`📈 Coverage: ${((uniqueWhalesInTxns.length / totalWhaleAddresses) * 100).toFixed(2)}% of tracked whales have transactions\n`)
    
    // KOL transactions
    const kolTransactionCollection = db.collection('influencerwhaletransactionsv2')
    const totalKolTxns = await kolTransactionCollection.countDocuments()
    console.log(`👤 Total KOL Transactions: ${totalKolTxns.toLocaleString()}`)
    
    // Get unique KOL addresses from transactions
    const uniqueKolsInTxns = await kolTransactionCollection.distinct('whaleAddress')
    console.log(`🔑 Unique KOL Addresses with Transactions: ${uniqueKolsInTxns.length}`)
    console.log(`📈 Coverage: ${((uniqueKolsInTxns.length / totalKolAddresses) * 100).toFixed(2)}% of tracked KOLs have transactions\n`)
    
    // Recent activity (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentWhaleTxns = await whaleTransactionCollection.countDocuments({
      timestamp: { $gte: last24Hours }
    })
    const recentKolTxns = await kolTransactionCollection.countDocuments({
      timestamp: { $gte: last24Hours }
    })
    
    console.log('⏰ LAST 24 HOURS ACTIVITY:')
    console.log('─────────────────────────────────────────────────────')
    console.log(`🐋 Whale Transactions: ${recentWhaleTxns.toLocaleString()}`)
    console.log(`👤 KOL Transactions: ${recentKolTxns.toLocaleString()}`)
    console.log(`📊 Total: ${(recentWhaleTxns + recentKolTxns).toLocaleString()}\n`)
    
    // ============================================
    // 4. SUMMARY
    // ============================================
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('📝 SUMMARY')
    console.log('═══════════════════════════════════════════════════════\n')
    
    console.log('🐋 WHALE TRACKING:')
    console.log(`   • ${totalWhaleAddresses} addresses tracked`)
    console.log(`   • Stored in ${whaleDocCount} groups`)
    console.log(`   • ${uniqueWhalesInTxns.length} addresses have transactions`)
    console.log(`   • ${totalWhaleTxns.toLocaleString()} total transactions`)
    console.log(`   • ${recentWhaleTxns.toLocaleString()} transactions in last 24h\n`)
    
    console.log('👤 KOL TRACKING:')
    console.log(`   • ${totalKolAddresses} addresses tracked`)
    console.log(`   • Stored individually (1 per document)`)
    console.log(`   • ${uniqueKolsInTxns.length} addresses have transactions`)
    console.log(`   • ${totalKolTxns.toLocaleString()} total transactions`)
    console.log(`   • ${recentKolTxns.toLocaleString()} transactions in last 24h\n`)
    
    console.log('🎯 TOTAL SYSTEM:')
    console.log(`   • ${totalWhaleAddresses + totalKolAddresses} total addresses monitored`)
    console.log(`   • ${totalWhaleTxns + totalKolTxns} total transactions`)
    console.log(`   • ${recentWhaleTxns + recentKolTxns} transactions in last 24h`)
    console.log(`   • ${((recentWhaleTxns + recentKolTxns) / 24).toFixed(2)} transactions per hour\n`)
    
    // ============================================
    // 5. WEBSOCKET MONITORING STATUS
    // ============================================
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('🔌 WEBSOCKET MONITORING STATUS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    console.log('The WebSocket monitors ALL addresses from:')
    console.log(`   • whalesaddresses collection (${totalWhaleAddresses} addresses)`)
    console.log(`   • influencerwhalesaddressv2 collection (${totalKolAddresses} addresses)`)
    console.log(`   • Total monitored: ${totalWhaleAddresses + totalKolAddresses} addresses\n`)
    
    console.log('When a transaction is detected:')
    console.log('   1. WebSocket receives notification')
    console.log('   2. Transaction is added to BullMQ queue')
    console.log('   3. Worker processes the transaction')
    console.log('   4. V2 parser classifies the swap')
    console.log('   5. Transaction saved to database')
    console.log('   6. Alerts matched and sent\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

// Run the analysis
analyzeTrackedAddresses().catch(console.error)
