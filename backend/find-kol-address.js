/**
 * Find where a KOL address is registered
 */

require('dotenv').config()
const mongoose = require('mongoose')

const WALLET_ADDRESS = 'CA4keXLtGJWBcsWivjtMFBghQ8pFsGRWFxLrRCtirzu5'
const KOL_USERNAME = '@old'

async function findKOL() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db

    // Check all KOL-related collections
    const kolCollections = [
      'influencerwhalesaddressv2',
      'influencerwhalesaddresses',
      'influencerwhalesv2'
    ]

    console.log('=== SEARCHING FOR KOL BY ADDRESS ===')
    console.log('Address:', WALLET_ADDRESS)
    console.log('')

    for (const collName of kolCollections) {
      console.log(`Checking ${collName}...`)
      const result = await db.collection(collName).findOne({
        address: WALLET_ADDRESS
      })
      
      if (result) {
        console.log(`  ✅ FOUND!`)
        console.log('  ', JSON.stringify(result, null, 2))
      } else {
        console.log(`  ❌ Not found`)
      }
    }

    console.log('\n=== SEARCHING FOR KOL BY USERNAME ===')
    console.log('Username:', KOL_USERNAME)
    console.log('')

    for (const collName of kolCollections) {
      console.log(`Checking ${collName}...`)
      const result = await db.collection(collName).findOne({
        influencerUsername: KOL_USERNAME
      })
      
      if (result) {
        console.log(`  ✅ FOUND!`)
        console.log('    Username:', result.influencerUsername)
        console.log('    Name:', result.influencerName)
        console.log('    Address:', result.address)
        console.log('    Followers:', result.influencerFollowerCount)
      } else {
        console.log(`  ❌ Not found`)
      }
    }

    // Check how many transactions this KOL has
    console.log('\n=== TRANSACTION COUNT FOR THIS KOL ===')
    const txCount = await db.collection('influencerwhaletransactionsv2').countDocuments({
      influencerUsername: KOL_USERNAME
    })
    console.log(`Transactions with username "${KOL_USERNAME}": ${txCount}`)

    const addressTxCount = await db.collection('influencerwhaletransactionsv2').countDocuments({
      whaleAddress: WALLET_ADDRESS
    })
    console.log(`Transactions with address "${WALLET_ADDRESS}": ${addressTxCount}`)

    // Get sample transactions
    console.log('\n=== SAMPLE TRANSACTIONS ===')
    const samples = await db.collection('influencerwhaletransactionsv2').find({
      influencerUsername: KOL_USERNAME
    }).sort({ timestamp: -1 }).limit(5).toArray()

    samples.forEach((tx, idx) => {
      console.log(`\nTransaction ${idx + 1}:`)
      console.log('  Signature:', tx.signature.substring(0, 30) + '...')
      console.log('  Type:', tx.type)
      console.log('  Username:', tx.influencerUsername)
      console.log('  Address:', tx.whaleAddress)
      console.log('  Token:', tx.transaction?.tokenOut?.symbol)
      console.log('  Amount:', tx.transaction?.tokenOut?.usdAmount)
      console.log('  Hotness:', tx.hotnessScore)
      console.log('  Time:', tx.timestamp)
    })

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\nConnection closed')
  }
}

findKOL()
