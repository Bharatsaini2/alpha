/**
 * Focused KOL Test - Top 5 Most Active KOLs
 * 
 * Test with just the most active KOL addresses to see if WebSocket
 * notifications are working properly.
 */

const dotenv = require('dotenv');
const axios = require('axios');
const mongoose = require('mongoose');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const InfluencerWhaleTransactionsV2Model = require('./dist/models/influencerWhaleTransactionsV2.model').default;

dotenv.config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const WSS_URL = process.env.WSS_URL || '';
const TEST_DURATION_MS = 3 * 60 * 1000; // 3 minutes for focused test

// Top 5 most active KOL addresses from diagnostic
const TOP_KOL_ADDRESSES = [
  '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f', // Cupsey - 4664 txns
  'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o', // Cented - 3458 txns  
  'BCagckXeMChUKrHEd6fKFA1uiWDtcmCXMsqaheLiUPJd', // dv - 1755 txns
  'BAr5csYtpWoNpwhUjixX7ZPHXkUciFZzjBp9uNxZXJPh', // Jack Duval - 1326 txns
  '4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk'  // jijo - 1138 txns
];

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

let startTime;
let endTime;
const v2Detections = [];
const v2Rejections = [];
const webSocketNotifications = [];
let ws = null;
let testTimeout;

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(`https://api.shyft.to/sol/v1/transaction/parsed`, {
      params: {
        network: 'mainnet-beta',
        txn_signature: signature,
      },
      headers: {
        'x-api-key': SHYFT_API_KEY,
      },
    });

    return response.data?.result || null;
  } catch (error) {
    if (error.response?.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchShyftTransaction(signature);
    }
    return null;
  }
}

async function handleTransaction(tx) {
  const signature = tx.signature;
  if (!signature) return;

  // Track all WebSocket notifications
  webSocketNotifications.push({
    signature: signature,
    timestamp: new Date(),
    feePayer: tx.transaction?.feePayer || 'unknown'
  });

  console.log(colors.blue(`\n📡 WebSocket notification received: ${signature}`));
  console.log(colors.gray(`   Fee Payer: ${(tx.transaction?.feePayer || 'unknown').substring(0, 8)}...`));

  try {
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) {
      console.log(colors.red(`   ❌ Failed to fetch SHYFT data`));
      return;
    }

    // Map SHYFT API response to V2 parser input format
    const v2Input = {
      signature: signature,
      timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
      status: shyftResponse.status || 'Success',
      fee: shyftResponse.fee || 0,
      fee_payer: shyftResponse.fee_payer || '',
      signers: shyftResponse.signers || [],
      protocol: shyftResponse.protocol,
      token_balance_changes: shyftResponse.token_balance_changes || [],
      actions: shyftResponse.actions || []
    };

    const parseResult = parseShyftTransactionV2(v2Input);

    if (parseResult.success && parseResult.data) {
      const swapData = parseResult.data;
      
      const detection = {
        signature: signature,
        timestamp: new Date(),
        side: swapData.direction || 'UNKNOWN',
        kolAddress: swapData.swapper || 'UNKNOWN',
        confidence: swapData.confidence,
        source: 'v2_parser'
      };
      v2Detections.push(detection);

      console.log(colors.green(`   ✅ V2 PARSED: ${swapData.direction}`));
      console.log(colors.gray(`   KOL: ${detection.kolAddress.substring(0, 8)}...`));
    } else {
      const rejection = {
        signature: signature,
        timestamp: new Date(),
        kolAddress: shyftResponse.fee_payer || 'UNKNOWN',
        reason: parseResult.erase?.reason || 'unknown_rejection',
        success: false
      };
      v2Rejections.push(rejection);
      
      console.log(colors.red(`   ❌ V2 REJECTED: ${parseResult.erase?.reason || 'unknown'}`));
    }
  } catch (error) {
    console.log(colors.red(`   ❌ Error processing: ${error.message}`));
  }
}

function connectWebSocket() {
  const WebSocket = require('ws');
  ws = new WebSocket(WSS_URL);

  ws.on('open', () => {
    console.log(colors.green('\n✅ WebSocket connected!'));
    
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: TOP_KOL_ADDRESSES,
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

    ws.send(JSON.stringify(subscribeMessage));
    console.log(colors.cyan(`📡 Subscribed to ${TOP_KOL_ADDRESSES.length} TOP KOL addresses`));
    
    // Show which KOLs we're tracking
    console.log(colors.cyan('\n🎯 Tracking these top KOLs:'));
    TOP_KOL_ADDRESSES.forEach((addr, i) => {
      console.log(colors.gray(`   ${i + 1}. ${addr.substring(0, 8)}...${addr.substring(addr.length - 4)}`));
    });

    // Record start time
    startTime = new Date();
    console.log(colors.yellow(`\n⏱️  FOCUSED KOL TEST STARTED at ${startTime.toISOString()}`));
    console.log(colors.yellow(`   Will run for 3 minutes until ${new Date(startTime.getTime() + TEST_DURATION_MS).toISOString()}`));
    console.log(colors.cyan('\n🔍 Monitoring for KOL transactions...\n'));

    // Set timeout to end test after 3 minutes
    testTimeout = setTimeout(async () => {
      endTime = new Date();
      console.log(colors.yellow(`\n\n⏱️  FOCUSED KOL TEST ENDED at ${endTime.toISOString()}`));
      ws.close();
      await showResults();
    }, TEST_DURATION_MS);
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === 'transactionNotification') {
        await handleTransaction(message.params.result);
      }
    } catch (error) {
      // Silent
    }
  });

  ws.on('error', (error) => {
    console.error(colors.red('❌ WebSocket error:'), error.message);
  });

  ws.on('close', () => {
    console.log(colors.yellow('\n⚠️  WebSocket disconnected'));
  });
}

async function showResults() {
  console.log(colors.cyan('\n\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('FOCUSED KOL TEST RESULTS')));
  console.log(colors.cyan('═'.repeat(80)));
  console.log(colors.white(`\nTime Window: ${startTime.toISOString()} to ${endTime.toISOString()}`));
  console.log(colors.white(`Duration: ${((endTime.getTime() - startTime.getTime()) / 1000 / 60).toFixed(1)} minutes\n`));

  console.log(colors.white(`WebSocket Notifications Received: ${webSocketNotifications.length}`));
  console.log(colors.white(`V2 Parser Detections: ${v2Detections.length}`));
  console.log(colors.white(`V2 Parser Rejections: ${v2Rejections.length}\n`));

  // Check database for KOL transactions in the same time window
  console.log(colors.cyan('📊 Checking database for KOL transactions in test window...'));
  const dbTransactions = await InfluencerWhaleTransactionsV2Model.find({
    'transaction.timestamp': {
      $gte: startTime,
      $lte: endTime
    },
    whaleAddress: { $in: TOP_KOL_ADDRESSES }
  }).lean();

  console.log(colors.white(`Database KOL transactions (same time window): ${dbTransactions.length}\n`));

  if (dbTransactions.length > 0) {
    console.log(colors.green('📋 Database transactions found:'));
    dbTransactions.forEach((tx, i) => {
      const timestamp = new Date(tx.transaction.timestamp).toISOString();
      console.log(colors.gray(`   ${i + 1}. ${tx.signature}`));
      console.log(colors.gray(`      KOL: ${tx.whaleAddress.substring(0, 8)}... (${tx.influencerName})`));
      console.log(colors.gray(`      Time: ${timestamp}`));
      console.log(colors.gray(`      Type: ${tx.type} | ${tx.transaction.tokenIn.symbol} → ${tx.transaction.tokenOut.symbol}`));
    });
  }

  // Analysis
  console.log(colors.cyan('\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('ANALYSIS')));
  console.log(colors.cyan('═'.repeat(80)));

  if (webSocketNotifications.length === 0) {
    console.log(colors.red('❌ NO WEBSOCKET NOTIFICATIONS RECEIVED'));
    console.log(colors.yellow('   This indicates the WebSocket subscription is not working for these KOL addresses'));
  } else {
    console.log(colors.green(`✅ WebSocket is working - received ${webSocketNotifications.length} notifications`));
  }

  if (dbTransactions.length > 0 && webSocketNotifications.length === 0) {
    console.log(colors.red('❌ CRITICAL ISSUE: Database has transactions but WebSocket received none'));
    console.log(colors.yellow('   This suggests a WebSocket subscription or address matching problem'));
  }

  if (dbTransactions.length === 0 && webSocketNotifications.length === 0) {
    console.log(colors.yellow('⚠️  No activity detected - KOLs may not be trading during test window'));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
  process.exit(0);
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Focused KOL WebSocket Test (3 Minutes)                ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Connect WebSocket and start test
  connectWebSocket();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n\n⚠️  Test interrupted by user'));
    if (testTimeout) clearTimeout(testTimeout);
    if (ws) ws.close();
    if (startTime) {
      endTime = new Date();
      await showResults();
    } else {
      await mongoose.disconnect();
      process.exit(0);
    }
  });
}

main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error);
  process.exit(1);
});