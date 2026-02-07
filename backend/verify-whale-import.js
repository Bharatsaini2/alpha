/**
 * Verify Whale Address Import
 * 
 * This script:
 * 1. Counts total whale addresses in database
 * 2. Checks for duplicate addresses across groups
 * 3. Shows the new groups that were added
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

async function verifyImport() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('🔍 VERIFYING WHALE ADDRESS IMPORT')
    console.log('═══════════════════════════════════════════════════════\n')
    
    // Get all whale documents
    const allDocs = await collection.find({}).toArray()
    
    console.log(`📄 Total Whale Groups: ${allDocs.length}`)
    
    // Count total addresses
    let totalAddresses = 0
    const allAddresses = []
    
    for (const doc of allDocs) {
      const addresses = doc.whalesAddress || []
      totalAddresses += addresses.length
      allAddresses.push(...addresses)
    }
    
    console.log(`🔢 Total Whale Addresses: ${totalAddresses}`)
    
    // Check for duplicates
    const addressCounts = {}
    const duplicates = []
    
    for (const address of allAddresses) {
      addressCounts[address] = (addressCounts[address] || 0) + 1
      if (addressCounts[address] === 2) {
        duplicates.push(address)
      }
    }
    
    const uniqueAddresses = Object.keys(addressCounts).length
    console.log(`✨ Unique Addresses: ${uniqueAddresses}`)
    
    if (duplicates.length > 0) {
      console.log(`⚠️  Duplicate Addresses Found: ${duplicates.length}`)
      console.log(`\n📋 First 10 duplicates:`)
      duplicates.slice(0, 10).forEach((addr, i) => {
        console.log(`   ${i + 1}. ${addr} (appears ${addressCounts[addr]} times)`)
      })
    } else {
      console.log(`✅ No Duplicates Found - All addresses are unique!`)
    }
    
    console.log('')
    
    // Show recently added groups
    console.log('═══════════════════════════════════════════════════════')
    console.log('📦 RECENTLY ADDED GROUPS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    const recentGroups = await collection.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray()
    
    recentGroups.forEach((group, index) => {
      console.log(`${index + 1}. ${group.name || 'Unnamed Group'}`)
      console.log(`   ID: ${group._id}`)
      console.log(`   Token: ${group.tokenAddress || 'N/A'}`)
      console.log(`   Addresses: ${group.whalesAddress?.length || 0}`)
      console.log(`   Created: ${group.createdAt || 'N/A'}`)
      console.log('')
    })
    
    // Show specific new groups
    console.log('═══════════════════════════════════════════════════════')
    console.log('🆕 NEW GROUPS FROM IMPORT')
    console.log('═══════════════════════════════════════════════════════\n')
    
    const newGroups = [
      'Whitewhale Holders',
      'Penguin Holders',
      'PUMP Holders'
    ]
    
    for (const groupName of newGroups) {
      const group = await collection.findOne({ name: groupName })
      if (group) {
        console.log(`✅ ${groupName}`)
        console.log(`   ID: ${group._id}`)
        console.log(`   Token: ${group.tokenAddress}`)
        console.log(`   Addresses: ${group.whalesAddress?.length || 0}`)
        console.log(`   Sample addresses:`)
        const samples = group.whalesAddress?.slice(0, 3) || []
        samples.forEach((addr, i) => {
          console.log(`      ${i + 1}. ${addr}`)
        })
        console.log('')
      } else {
        console.log(`❌ ${groupName} - NOT FOUND`)
        console.log('')
      }
    }
    
    // Summary
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 SUMMARY')
    console.log('═══════════════════════════════════════════════════════')
    console.log(`Total Groups: ${allDocs.length}`)
    console.log(`Total Addresses: ${totalAddresses}`)
    console.log(`Unique Addresses: ${uniqueAddresses}`)
    console.log(`Duplicates: ${duplicates.length}`)
    console.log('')
    
    if (duplicates.length > 0) {
      console.log('⚠️  NOTE: Duplicates are OK if the same wallet holds multiple tokens')
      console.log('   The WebSocket will only subscribe once per unique address')
      console.log('')
    }
    
    console.log('✅ System will monitor all unique addresses')
    console.log('⚠️  Remember to restart backend: pm2 restart backend')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

verifyImport().catch(console.error)
