/**
 * Test Signature Saving
 * 
 * Test if signatures are being saved correctly to the database
 */

const mongoose = require('mongoose')
const WhaleAllTransactionsV2 = require('./src/models/whaleAllTransactionsV2.model').default

require('dotenv').config()

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''

async function testSignatureSaving() {
  console.log('🔍 TESTING SIGNATURE SAVING')
  console.log('=' .repeat(60))

  // Connect to MongoDB
  console.log('📊 Connecting to MongoDB...')
  await mongoose.connect(MONGO_URI)
  console.log('✅ Connected to MongoDB\n')

  // Create a test transaction with signature
  const testTransaction = {
    signature: 'TEST_SIGNATURE_' + Date.now(),
    amount: {
      buyAmount: '1000',
      sellAmount: '0',
    },
    tokenAmount: {
      buyTokenAmount: '1000000',
      sellTokenAmount: '0',
    },
    tokenPrice: {
      buyTokenPrice: '0.001',
      sellTokenPrice: '0',
      buyTokenPriceSol: '0.004',
      sellTokenPriceSol: '0',
    },
    solAmount: {
      buySolAmount: '4',
      sellSolAmount: '0',
    },
    transaction: {
      tokenIn: {
        symbol: 'USDC',
        name: 'USD Coin',
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000',
        usdAmount: '1000',
        marketCap: '1000000000',
        marketCapSol: '4000000',
        imageUrl: null,
      },
      tokenOut: {
        symbol: 'TEST',
        name: 'Test Token',
        address: 'TEST123456789',
        amount: '1000000',
        usdAmount: '1000',
        marketCap: '50000000',
        marketCapSol: '200000',
        imageUrl: null,
      },
      gasFee: '0.005',
      platform: 'Jupiter',
      timestamp: new Date(),
    },
    whaleLabel: [],
    whaleTokenSymbol: 'TEST_WHALE',
    tokenInSymbol: 'USDC',
    tokenOutSymbol: 'TEST',
    whaleAddress: 'TEST_WHALE_ADDRESS_123',
    tokenInAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenOutAddress: 'TEST123456789',
    whale: {
      address: 'TEST_WHALE_ADDRESS_123',
      imageUrl: null,
      labels: [],
      symbol: 'TEST_WHALE',
      name: 'Test Whale',
      marketCap: '0',
    },
    marketCap: {
      buyMarketCap: '50000000',
      sellMarketCap: '0',
    },
    whaleTokenURL: null,
    inTokenURL: null,
    outTokenURL: null,
    type: 'buy',
    bothType: [{
      buyType: true,
      sellType: false,
    }],
    hotnessScore: 5,
    timestamp: new Date(),
    age: new Date(),
    tokenInAge: new Date(),
    tokenOutAge: new Date(),
  }

  console.log('💾 Saving test transaction...')
  console.log(`Signature: ${testTransaction.signature}`)

  try {
    const savedTransaction = await WhaleAllTransactionsV2.create(testTransaction)
    console.log('✅ Transaction saved successfully!')
    console.log(`Saved signature: ${savedTransaction.signature}`)
    console.log(`Document ID: ${savedTransaction._id}`)

    // Query it back to verify
    console.log('\n🔍 Querying back the saved transaction...')
    const queriedTransaction = await WhaleAllTransactionsV2.findOne({
      signature: testTransaction.signature
    }).lean()

    if (queriedTransaction) {
      console.log('✅ Transaction found in database!')
      console.log(`Queried signature: ${queriedTransaction.signature}`)
      console.log(`Type: ${queriedTransaction.type}`)
      console.log(`Whale: ${queriedTransaction.whaleAddress}`)
    } else {
      console.log('❌ Transaction NOT found in database!')
    }

    // Clean up - delete the test transaction
    console.log('\n🧹 Cleaning up test transaction...')
    await WhaleAllTransactionsV2.deleteOne({ signature: testTransaction.signature })
    console.log('✅ Test transaction deleted')

  } catch (error) {
    console.error('❌ Error saving transaction:', error.message)
    if (error.code === 11000) {
      console.log('   This is a duplicate key error - signature already exists')
    }
  }

  // Now check a few recent real transactions to see their signature status
  console.log('\n🔍 Checking recent real transactions...')
  const recentTransactions = await WhaleAllTransactionsV2.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .lean()

  console.log(`Found ${recentTransactions.length} recent transactions:`)
  recentTransactions.forEach((tx, i) => {
    console.log(`${i + 1}. Signature: ${tx.signature || 'MISSING'}`)
    console.log(`   Type: ${tx.type}`)
    console.log(`   Created: ${tx.createdAt}`)
    console.log(`   Whale: ${tx.whaleAddress?.substring(0, 8)}...`)
    console.log('')
  })

  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

testSignatureSaving().catch(console.error)