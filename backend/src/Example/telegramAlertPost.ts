import axios from 'axios'

console.log('✅ Script loaded')
const BOT_TOKEN = '8028845632:AAEEpGWq8nbDu7ycexgo4bth0W9Lrxfji8I'
const CHANNEL_CHAT_ID = '-1002500100985'

console.log('🛫 Script started')
const telegramAlert = [
  '🚨 AlphaBlockAI Weekly Prediction Bot',
  '',
  'Based on 7D whale activity, here are the top coins to watch this week:',
  '',
  ' 1️⃣ $DOGE — 92/100 | MC: $2.3M ',
  ' 2️⃣ $ALPHA — 87/100 | MC: $1.1M ',
  ' 3️⃣ $MEW — 79/100 | MC: $3.8M ',
  '4️⃣ $ZOO — 76/100 | MC: $980K ',
  '5️⃣ $KNET — 74/100 | MC: $1.7M ',
  '',
  `🔥 Avg Hotness: 8.9/10  `,
  `🐋 Whale Buyers: 14 `,
  `🧠 Smart Wallets: 57%`,
].join('\n');

(async () => {
  try {
    console.log('🔍 BOT_TOKEN:', BOT_TOKEN)
    console.log('🔍 CHANNEL_CHAT_ID:', CHANNEL_CHAT_ID)

    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHANNEL_CHAT_ID,
        text: telegramAlert,
      },
    )

    console.log('✅ Telegram API response:', res.data)
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message)
  } finally {
    console.log('🏁 Script finished')
  }
})()
