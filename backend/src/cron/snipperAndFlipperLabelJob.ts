import cron from 'node-cron'
import axios from 'axios'

const Base_URL = process.env.SERVER_URL || 'https://api.alpha-block.ai/api/v1'

const API_URL = `${Base_URL}/insight/snipper-flipper-whale-label`

// Run every 24 hours 12:00AM
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Running daily sniper and flipper label check...')

  try {
    const response = await axios.get(API_URL)
    console.log('✅ assign sniper and flipper label to wallet succefully:', response.data)
  } catch (err:any) {
    console.error(`❌ Failed to check sniper and flipper label`, err.message)
  }
})
