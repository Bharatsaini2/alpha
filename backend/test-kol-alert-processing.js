/**
 * Test if KOL transactions are being processed correctly
 * This simulates what happens when a KOL transaction comes in
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function testKOLAlertProcessing() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db

    // Get a recent BUY transaction
    console.log('=== FETCHING RECENT BUY TRANSACTION ===')
    const recentBuy = await db.collection('influencerwhaletransactionsv2').findOne(
      { type: 'buy' },
      { sort: { timestamp: -1 } }
    )

    if (!recentBuy) {
      console.log('❌ No BUY transactions found')
      return
    }

    console.log('Found transaction:')
    console.log('  Signature:', recentBuy.signature.substring(0, 40) + '...')
    console.log('  KOL:', recentBuy.influencerUsername)
    console.log('  Type:', recentBuy.type)
    console.log('  Token:', recentBuy.transaction?.tokenOut?.symbol)
    console.log('  Amount:', recentBuy.transaction?.tokenOut?.usdAmount)
    console.log('  Hotness:', recentBuy.hotnessScore)
    console.log('  Has whale object?:', !!recentBuy.whale)
    console.log('  Has whaleAddress?:', !!recentBuy.whaleAddress)
    console.log('')

    // Check what the OLD code would do
    console.log('=== OLD CODE BEHAVIOR (BUGGY) ===')
    if (!recentBuy.whale || !recentBuy.whale.address) {
      console.log('❌ OLD CODE: Would SKIP this transaction!')
      console.log('   Reason: No tx.whale.address found')
    } else {
      console.log('✅ OLD CODE: Would process this transaction')
    }
    console.log('')

    // Check what the NEW code would do
    console.log('=== NEW CODE BEHAVIOR (FIXED) ===')
    const whaleAddress = recentBuy.whale?.address || recentBuy.whaleAddress
    const isKOLTransaction = !recentBuy.whale && recentBuy.whaleAddress
    
    if (!whaleAddress) {
      console.log('❌ NEW CODE: Would SKIP this transaction')
      console.log('   Reason: No whale or KOL address found')
    } else {
      console.log('✅ NEW CODE: Would PROCESS this transaction')
      console.log('   Whale Address:', whaleAddress)
      console.log('   Is KOL Transaction:', isKOLTransaction)
    }
    console.log('')

    // Check if user has active KOL alert subscription
    console.log('=== CHECKING FOR ACTIVE SUBSCRIPTIONS ===')
    const activeAlerts = await db.collection('useralerts').find({
      type: 'KOL_ACTIVITY',
      enabled: true
    }).toArray()

    console.log(`Found ${activeAlerts.length} active KOL_ACTIVITY alerts`)
    
    if (activeAlerts.length > 0) {
      console.log('\nActive subscriptions:')
      activeAlerts.forEach((alert, idx) => {
        console.log(`  ${idx + 1}. User: ${alert.userId}`)
        console.log(`     Config:`, JSON.stringify(alert.config))
        console.log(`     Priority: ${alert.priority}`)
      })
    } else {
      console.log('⚠️  NO ACTIVE KOL ALERTS FOUND!')
      console.log('   This is why you\'re not getting alerts!')
    }
    console.log('')

    // Check if this transaction would match filters
    if (activeAlerts.length > 0) {
      console.log('=== CHECKING IF TRANSACTION MATCHES FILTERS ===')
      const alert = activeAlerts[0]
      const config = alert.config || {}
      
      console.log('Checking first subscription...')
      console.log('  Hotness threshold:', config.hotnessScoreThreshold || 'None')
      console.log('  Min buy amount:', config.minBuyAmountUSD || 'None')
      console.log('  KOL filter:', config.kolIds?.length > 0 ? config.kolIds : 'All KOLs')
      console.log('')
      
      // Check hotness score
      if (config.hotnessScoreThreshold !== undefined) {
        if (recentBuy.hotnessScore >= config.hotnessScoreThreshold) {
          console.log('  ✅ Hotness score passes:', recentBuy.hotnessScore, '>=', config.hotnessScoreThreshold)
        } else {
          console.log('  ❌ Hotness score fails:', recentBuy.hotnessScore, '<', config.hotnessScoreThreshold)
        }
      }
      
      // Check amount
      if (config.minBuyAmountUSD !== undefined) {
        const amount = parseFloat(recentBuy.transaction?.tokenOut?.usdAmount || '0')
        if (amount >= config.minBuyAmountUSD) {
          console.log('  ✅ Amount passes: $' + amount, '>=', '$' + config.minBuyAmountUSD)
        } else {
          console.log('  ❌ Amount fails: $' + amount, '<', '$' + config.minBuyAmountUSD)
        }
      }
      
      // Check KOL filter
      if (config.kolIds && config.kolIds.length > 0) {
        if (config.kolIds.includes(recentBuy.influencerUsername)) {
          console.log('  ✅ KOL filter passes:', recentBuy.influencerUsername, 'is in filter')
        } else {
          console.log('  ❌ KOL filter fails:', recentBuy.influencerUsername, 'not in filter')
        }
      } else {
        console.log('  ✅ KOL filter: All KOLs accepted')
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\nConnection closed')
  }
}

testKOLAlertProcessing()
