import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config()

const BOT_TOKEN =
  process.env.ALPHA_BOT_TOKEN ||
  '8028845632:AAEEpGWq8nbDu7ycexgo4bth0W9Lrxfji8I'
const CHANNEL_CHAT_ID = process.env.CHANNEL_CHAT_ID || '-1002500100985'

// **********************   Predictions Token Telegram Alert   *************
export const predictionsTokenPostToTelegram = async (message: string) => {
  try {
    console.log('🔍 BOT_TOKEN:', BOT_TOKEN)
    console.log('🔍 CHANNEL_CHAT_ID:', CHANNEL_CHAT_ID)

    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHANNEL_CHAT_ID,
        text: message,
      },
    )

    console.log('✅ Telegram API response:', res.data)
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message)
  } finally {
    console.log('🏁 Script finished')
  }
}
