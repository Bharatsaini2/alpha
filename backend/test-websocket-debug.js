/**
 * WebSocket Debug Test
 * 
 * This test helps debug why WebSocket isn't receiving transactions
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const WebSocket = require('ws');
const mongoose = require('mongoose');

const WhalesAddress = require('./src/models/solana-tokens-whales').default;

const WSS_URL = process.env.WSS_URL;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
};

let messageCount = 0;
let ws = null;

async function main() {
  console.log(colors.cyan('\n🔍 WebSocket Debug Test\n'));

  // Connect to MongoDB
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Fetch whale addresses
  const whales = await WhalesAddress.find({}).lean();
  const whaleAddresses = whales.flatMap((doc) => doc.whalesAddress || []);
  console.log(colors.green(`✅ Found ${whaleAddresses.length} whale addresses\n`));

  // Take only first 10 for testing
  const testAddresses = whaleAddresses.slice(0, 10);
  console.log(colors.yellow(`📊 Testing with first 10 addresses:\n`));
  testAddresses.forEach((addr, i) => {
    console.log(colors.gray(`   ${i + 1}. ${addr}`));
  });

  console.log(colors.cyan(`\n📡 Connecting to WebSocket: ${WSS_URL.substring(0, 50)}...\n`));

  ws = new WebSocket(WSS_URL);

  ws.on('open', () => {
    console.log(colors.green('✅ WebSocket connected!\n'));

    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: testAddresses,
        },
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    };

    console.log(colors.cyan('📤 Sending subscription message:\n'));
    console.log(colors.gray(JSON.stringify(subscribeMessage, null, 2)));
    console.log();

    ws.send(JSON.stringify(subscribeMessage));
    console.log(colors.yellow('⏳ Waiting for messages... (will run for 2 minutes)\n'));

    // Stop after 2 minutes
    setTimeout(() => {
      console.log(colors.yellow(`\n⏱️  2 minutes elapsed`));
      console.log(colors.white(`📊 Total messages received: ${messageCount}\n`));
      ws.close();
      mongoose.disconnect();
      process.exit(0);
    }, 120000);
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    
    console.log(colors.cyan(`\n📨 Message #${messageCount}:`));
    console.log(colors.gray('─'.repeat(80)));
    
    // Show message structure
    console.log(colors.yellow('Message keys:'), Object.keys(message));
    
    if (message.method) {
      console.log(colors.green(`Method: ${message.method}`));
    }
    
    if (message.result) {
      console.log(colors.green('Has result field'));
      console.log(colors.yellow('Result keys:'), Object.keys(message.result));
    }
    
    if (message.params) {
      console.log(colors.green('Has params field'));
      console.log(colors.yellow('Params keys:'), Object.keys(message.params));
      
      if (message.params.result) {
        console.log(colors.green('Has params.result field'));
        console.log(colors.yellow('Params.result keys:'), Object.keys(message.params.result));
        
        if (message.params.result.transaction) {
          console.log(colors.green('✅ Has transaction!'));
          const tx = message.params.result.transaction;
          console.log(colors.yellow('Transaction keys:'), Object.keys(tx));
          
          if (tx.signature) {
            console.log(colors.green(`   Signature: ${tx.signature.substring(0, 20)}...`));
          }
          if (tx.signatures) {
            console.log(colors.green(`   Signatures: ${tx.signatures[0].substring(0, 20)}...`));
          }
        }
      }
    }
    
    // Show full message (truncated)
    const messageStr = JSON.stringify(message, null, 2);
    if (messageStr.length > 500) {
      console.log(colors.gray('\nFull message (truncated):'));
      console.log(colors.gray(messageStr.substring(0, 500) + '...'));
    } else {
      console.log(colors.gray('\nFull message:'));
      console.log(colors.gray(messageStr));
    }
    
    console.log(colors.gray('─'.repeat(80)));
  });

  ws.on('error', (error) => {
    console.error(colors.red('❌ WebSocket error:'), error.message);
  });

  ws.on('close', () => {
    console.log(colors.yellow('\n⚠️  WebSocket disconnected'));
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(colors.yellow('\n\n⚠️  Test interrupted'));
    console.log(colors.white(`📊 Total messages received: ${messageCount}\n`));
    if (ws) ws.close();
    mongoose.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error);
  process.exit(1);
});
