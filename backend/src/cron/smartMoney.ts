import cron from 'node-cron'
import axios from 'axios'

const Base_URL = process.env.SERVER_URL || 'https://api.alpha-block.ai/api/v1'

const API_URL = `${Base_URL}/insight/smart-money-label`

// Run every 24 hours 12:20AM
cron.schedule('20 0 * * *', async () => {
  console.log('⏰ Running daily smart money label check...')

  try {
    const response = await axios.get(API_URL)
    console.log(
      '✅ assign smart money label to wallet successfully:',
      response.data,
    )
  } catch (err: any) {
    console.error(`❌ Failed to check smart money label`, err.message)
  }
})
