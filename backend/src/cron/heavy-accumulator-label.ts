import cron from 'node-cron'
import axios from 'axios'

const Base_URL = process.env.SERVER_URL || 'https://api.alpha-block.ai/api/v1'

const API_URL = `${Base_URL}/insight/heavy-accumulator`


// Run every 24 hours 12:15AM
cron.schedule('15 0 * * *', async () => {
    console.log('⏰ Running daily heavy accumulator job...')

    try {
        const response = await axios.get(API_URL)
        console.log(
            '✅ assign heavy accumulator label to wallet successfully:',
            response.data,
        )
    } catch (err: any) {
        console.error(`❌ Failed to check heavy accumulator label`, err)
    }
})
