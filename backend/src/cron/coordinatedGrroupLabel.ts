import cron from 'node-cron'
import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config()

const Base_URL = process.env.SERVER_URL || 'https://api.alpha-block.ai/api/v1'

const API_URL = `${Base_URL}/insight/coordinated-group`


// Run every 24 hours 12:10AM
cron.schedule('10 0 * * *', async () => {
    console.log('⏰ Running daily coordinated Group job...')

    try {
        const response = await axios.get(API_URL)
        console.log(
            '✅ assign coordinated Group label to wallet successfully:',
            response.data,
        )
    } catch (err: any) {
        console.error(`❌ Failed to check coordinated Group label`, err)
    }
})
