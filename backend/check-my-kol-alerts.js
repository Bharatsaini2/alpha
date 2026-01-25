/**
 * Check all KOL alerts and identify which ones are yours
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function checkMyAlerts() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db

    // Get all KOL alerts
    console.log('=== ALL KOL_ACTIVITY ALERTS ===\n')
    const alerts = await db.collection('useralerts').find({
      type: 'KOL_ACTIVITY'
    }).toArray()

    for (const alert of alerts) {
      // Get user info
      const user = await db.collection('users').findOne({
        _id: alert.userId
      })

      console.log('Alert ID:', alert._id)
      console.log('  User ID:', alert.userId)
      console.log('  User Email:', user?.email || 'N/A')
      console.log('  User Wallet:', user?.walletAddress || 'N/A')
      console.log('  Telegram Connected:', !!user?.telegramChatId)
      console.log('  Telegram Chat ID:', user?.telegramChatId || 'N/A')
      console.log('  Enabled:', alert.enabled)
      console.log('  Priority:', alert.priority)
      console.log('  Config:', JSON.stringify(alert.config))
      console.log('  Created:', alert.createdAt)
      console.log('  Updated:', alert.updatedAt)
      console.log('')
    }

    // Summary
    console.log('=== SUMMARY ===')
    console.log('Total KOL alerts:', alerts.length)
    console.log('Enabled:', alerts.filter(a => a.enabled).length)
    console.log('Disabled:', alerts.filter(a => !a.enabled).length)
    
    // Group by user
    const byUser = {}
    for (const alert of alerts) {
      const userId = alert.userId.toString()
      if (!byUser[userId]) {
        byUser[userId] = []
      }
      byUser[userId].push(alert)
    }
    
    console.log('\nAlerts by user:')
    for (const [userId, userAlerts] of Object.entries(byUser)) {
      const user = await db.collection('users').findOne({
        _id: new mongoose.Types.ObjectId(userId)
      })
      console.log(`  User ${userId.substring(0, 8)}... (${user?.email || 'No email'}):`, userAlerts.length, 'alerts')
    }

    // Check for duplicates
    console.log('\n=== CHECKING FOR DUPLICATES ===')
    for (const [userId, userAlerts] of Object.entries(byUser)) {
      if (userAlerts.length > 1) {
        console.log(`\n⚠️  User ${userId.substring(0, 8)}... has ${userAlerts.length} alerts:`)
        userAlerts.forEach((alert, idx) => {
          console.log(`  ${idx + 1}. ${alert.enabled ? 'ENABLED' : 'DISABLED'} - Hotness: ${alert.config.hotnessScoreThreshold}, Amount: $${alert.config.minBuyAmountUSD}`)
        })
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\nConnection closed')
  }
}

checkMyAlerts()
