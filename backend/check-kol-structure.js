/**
 * Check KOL Address Structure
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

async function checkKolStructure() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const kolCollection = db.collection('influencerwhalesaddressv2')
    
    // Get first 5 documents to see structure
    const samples = await kolCollection.find({}).limit(5).toArray()
    
    console.log('📋 SAMPLE KOL DOCUMENTS:\n')
    console.log('═══════════════════════════════════════════════════════\n')
    
    samples.forEach((doc, index) => {
      console.log(`Document ${index + 1}:`)
      console.log(JSON.stringify(doc, null, 2))
      console.log('\n─────────────────────────────────────────────────────\n')
    })
    
    // Count total
    const total = await kolCollection.countDocuments()
    console.log(`\n📊 Total KOL Documents: ${total}`)
    
    // Check if whalesAddress field exists and has data
    const withAddresses = await kolCollection.countDocuments({
      whalesAddress: { $exists: true, $ne: null, $ne: [] }
    })
    console.log(`📍 Documents with whalesAddress field: ${withAddresses}`)
    
    // Get all unique field names
    const allDocs = await kolCollection.find({}).limit(100).toArray()
    const allFields = new Set()
    allDocs.forEach(doc => {
      Object.keys(doc).forEach(key => allFields.add(key))
    })
    
    console.log(`\n🔑 All field names found:`)
    Array.from(allFields).sort().forEach(field => {
      console.log(`   • ${field}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('\n✅ Connection closed')
  }
}

checkKolStructure().catch(console.error)
