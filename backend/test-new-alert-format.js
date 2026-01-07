const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './.env' });

async function testNewAlertFormat() {
  try {
    console.log('🧪 Testing New Alert Format...');
    
    // Create bot instance without polling (to avoid conflict)
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    
    // Create a test alert with the new improved format
    const improvedAlert = `🐋 *Whale BUY Alert*

*Wallet:* \`E1ED...7j7y\` \\(Smart Money\\)
*Token:* *SOL*
*Swap:* 30\\.00 WSOL → 472,264\\.63 AOL \\($4\\.20K\\)
*Hotness:* 6\\.5/10

[📊 View Details](https://alpha-block.ai/transaction/4GgLhp468vUqp5RbixzdL8Qxx3RDiQ6KWodXuP2SFToBn3Z6RCatD1aRjRC8gKwKMhEKpqJt7e2E28UBM9kLWEjN?type=whale&transaction=buy)
[🔍 Solscan](https://solscan.io/tx/4GgLhp468vUqp5RbixzdL8Qxx3RDiQ6KWodXuP2SFToBn3Z6RCatD1aRjRC8gKwKMhEKpqJt7e2E28UBM9kLWEjN)`;

    const result = await bot.sendMessage('8519526605', improvedAlert, {
      parse_mode: 'MarkdownV2'
    });
    
    console.log('✅ New format alert sent successfully!');
    console.log('📨 Message ID:', result.message_id);
    
    console.log('\n🎉 The new format includes:');
    console.log('   ✅ Clear BUY/SELL/SWAP type');
    console.log('   ✅ Wallet labels (Smart Money, etc.)');
    console.log('   ✅ Clear swap details (X → Y)');
    console.log('   ✅ USD value in parentheses');
    console.log('   ✅ Hotness score');
    console.log('   ✅ Link to your website transaction page');
    console.log('   ✅ Solscan link for verification');
    
  } catch (error) {
    console.error('❌ Error sending new format alert:', error.message);
  }
}

testNewAlertFormat();