/**
 * List All Whale Groups
 * 
 * Shows all whale groups in the database with their details
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

async function listAllGroups() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    // Get all groups sorted by name
    const allGroups = await collection.find({}).sort({ name: 1 }).toArray()
    
    console.log('═══════════════════════════════════════════════════════')
    console.log(`📦 ALL WHALE GROUPS (${allGroups.length} total)`)
    console.log('═══════════════════════════════════════════════════════\n')
    
    let totalAddresses = 0
    
    allGroups.forEach((group, index) => {
      const addressCount = group.whalesAddress?.length || 0
      totalAddresses += addressCount
      
      const name = group.name || 'Unnamed Group'
      const token = group.tokenAddress || 'N/A'
      const symbol = group.tokenSymbol || 'N/A'
      
      console.log(`${index + 1}. ${name}`)
      console.log(`   ID: ${group._id}`)
      console.log(`   Token: ${token}`)
      console.log(`   Symbol: ${symbol}`)
      console.log(`   Addresses: ${addressCount}`)
      console.log(`   Created: ${group.createdAt || 'N/A'}`)
      console.log('')
    })
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 SUMMARY')
    console.log('═══════════════════════════════════════════════════════')
    console.log(`Total Groups: ${allGroups.length}`)
    console.log(`Total Addresses: ${totalAddresses}`)
    console.log('')
    
    // Check for groups with similar names
    console.log('═══════════════════════════════════════════════════════')
    console.log('🔍 CHECKING FOR SIMILAR NAMES')
    console.log('═══════════════════════════════════════════════════════\n')
    
    const nameGroups = {}
    allGroups.forEach(group => {
      const name = (group.name || 'Unnamed').toLowerCase()
      if (!nameGroups[name]) {
        nameGroups[name] = []
      }
      nameGroups[name].push(group)
    })
    
    let foundDuplicates = false
    Object.entries(nameGroups).forEach(([name, groups]) => {
      if (groups.length > 1) {
        foundDuplicates = true
        console.log(`⚠️  "${name}" - ${groups.length} groups with similar names:`)
        groups.forEach((g, i) => {
          console.log(`   ${i + 1}. ID: ${g._id}`)
          console.log(`      Token: ${g.tokenAddress || 'N/A'}`)
          console.log(`      Addresses: ${g.whalesAddress?.length || 0}`)
          console.log(`      Created: ${g.createdAt || 'N/A'}`)
        })
        console.log('')
      }
    })
    
    if (!foundDuplicates) {
      console.log('✅ No duplicate group names found')
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

listAllGroups().catch(console.error)
