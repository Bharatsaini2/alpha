/**
 * Import Whale Addresses from File
 * 
 * This script reads the whaleaddress file and imports all whale groups
 * 
 * Usage:
 * node import-whale-addresses-from-file.js
 */

const { MongoClient } = require('mongodb')
const fs = require('fs')
const path = require('path')

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

// Path to the whale address file
const WHALE_ADDRESS_FILE = path.join(__dirname, '..', 'whaleaddress')

/**
 * Parse the whale address file
 * Format:
 * $groupname whales (tokenAddress)
 * address1
 * address2
 * ...
 */
function parseWhaleAddressFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  const groups = []
  let currentGroup = null
  
  for (const line of lines) {
    // Check if line is a group header (starts with $)
    if (line.startsWith('$')) {
      // Save previous group if exists
      if (currentGroup && currentGroup.addresses.length > 0) {
        groups.push(currentGroup)
      }
      
      // Parse group header: $groupname whales (tokenAddress)
      const match = line.match(/^\$(.+?)\s+whales\s+\(([^)]+)\)/)
      if (match) {
        const groupName = match[1].trim()
        const tokenAddress = match[2].trim()
        
        currentGroup = {
          name: `${groupName.charAt(0).toUpperCase() + groupName.slice(1)} Holders`,
          tokenAddress: tokenAddress,
          addresses: []
        }
      }
    } else if (currentGroup) {
      // This is an address line
      // Validate it looks like a Solana address (32-44 characters, base58)
      if (line.length >= 32 && line.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(line)) {
        currentGroup.addresses.push(line)
      }
    }
  }
  
  // Don't forget the last group
  if (currentGroup && currentGroup.addresses.length > 0) {
    groups.push(currentGroup)
  }
  
  return groups
}

async function importWhaleAddresses() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    // Check if file exists
    if (!fs.existsSync(WHALE_ADDRESS_FILE)) {
      console.error(`❌ File not found: ${WHALE_ADDRESS_FILE}`)
      console.log('Please make sure the file exists at: alpha-tracker-ai/whaleaddress')
      return
    }
    
    console.log('📖 Reading whale address file...\n')
    const groups = parseWhaleAddressFile(WHALE_ADDRESS_FILE)
    
    if (groups.length === 0) {
      console.log('⚠️  No whale groups found in file')
      return
    }
    
    console.log(`✅ Parsed ${groups.length} whale groups from file:\n`)
    groups.forEach((group, index) => {
      console.log(`${index + 1}. ${group.name}`)
      console.log(`   Token: ${group.tokenAddress}`)
      console.log(`   Addresses: ${group.addresses.length}`)
      console.log('')
    })
    
    // Connect to MongoDB
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('🐋 IMPORTING WHALE ADDRESS GROUPS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    let totalAdded = 0
    let totalUpdated = 0
    let totalAddresses = 0
    
    for (const group of groups) {
      // Check if group already exists (by name or token address)
      const existing = await collection.findOne({
        $or: [
          { name: group.name },
          { tokenAddress: group.tokenAddress }
        ]
      })
      
      if (existing) {
        console.log(`📝 Group "${group.name}" already exists`)
        console.log(`   Current addresses: ${existing.whalesAddress?.length || 0}`)
        console.log(`   New addresses to add: ${group.addresses.length}`)
        
        // Add new addresses to existing group (avoid duplicates)
        const result = await collection.updateOne(
          { _id: existing._id },
          { 
            $addToSet: { 
              whalesAddress: { $each: group.addresses } 
            },
            $set: {
              tokenAddress: group.tokenAddress, // Update token address if changed
              lastUpdated: new Date()
            }
          }
        )
        
        console.log(`   ✅ Updated group (${result.modifiedCount} modified)`)
        totalUpdated++
        totalAddresses += group.addresses.length
      } else {
        // Create new group
        const document = {
          name: group.name,
          tokenAddress: group.tokenAddress,
          tokenSymbol: null,  // Can be fetched later
          tokenDecimals: null,
          imageUrl: null,
          whalesAddress: group.addresses,
          createdAt: new Date(),
          lastUpdated: new Date(),
          __v: 0
        }
        
        const result = await collection.insertOne(document)
        
        console.log(`✅ Created new group "${group.name}"`)
        console.log(`   Document ID: ${result.insertedId}`)
        console.log(`   Token: ${group.tokenAddress}`)
        console.log(`   Addresses added: ${group.addresses.length}`)
        
        totalAdded++
        totalAddresses += group.addresses.length
      }
      
      console.log('')
    }
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 IMPORT SUMMARY')
    console.log('═══════════════════════════════════════════════════════')
    console.log(`✅ Groups processed: ${groups.length}`)
    console.log(`✅ New groups created: ${totalAdded}`)
    console.log(`✅ Existing groups updated: ${totalUpdated}`)
    console.log(`✅ Total addresses imported: ${totalAddresses}`)
    console.log('')
    console.log('⚠️  IMPORTANT: Restart backend to monitor new addresses:')
    console.log('   pm2 restart backend')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

// Run the script
importWhaleAddresses().catch(console.error)
