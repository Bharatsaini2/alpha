/**
 * Debug KOL Swapper Identification Issues
 * 
 * This script takes a recent KOL transaction and debugs why
 * the V2 parser is failing swapper identification.
 */

const dotenv = require('dotenv');
const axios = require('axios');
const mongoose = require('mongoose');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const InfluencerWhaleTransactionsV2Model = require('./dist/models/influencerWhaleTransactionsV2.model').default;

dotenv.config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

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

async function debugSwapperIdentification() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Debug KOL Swapper Identification                       ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Get a recent successful KOL transaction from database
  console.log(colors.cyan('🔍 Finding recent successful KOL transaction...'));
  const recentKolTx = await InfluencerWhaleTransactionsV2Model.findOne({
    'transaction.timestamp': { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
  }).sort({ 'transaction.timestamp': -1 }).lean();

  if (!recentKolTx) {
    console.log(colors.red('❌ No recent KOL transactions found'));
    await mongoose.disconnect();
    return;
  }

  console.log(colors.green('✅ Found recent KOL transaction:'));
  console.log(colors.white(`   Signature: ${recentKolTx.signature}`));
  console.log(colors.white(`   KOL: ${recentKolTx.whaleAddress} (${recentKolTx.influencerName})`));
  console.log(colors.white(`   Type: ${recentKolTx.type}`));
  console.log(colors.white(`   Time: ${new Date(recentKolTx.transaction.timestamp).toISOString()}`));
  console.log(colors.white(`   ${recentKolTx.transaction.tokenIn.symbol} → ${recentKolTx.transaction.tokenOut.symbol}\n`));

  // Fetch SHYFT data for this transaction
  console.log(colors.cyan('📡 Fetching SHYFT data for this transaction...'));
  const shyftData = await fetchShyftTransaction(recentKolTx.signature);
  
  if (!shyftData) {
    console.log(colors.red('❌ Failed to fetch SHYFT data'));
    await mongoose.disconnect();
    return;
  }

  console.log(colors.green('✅ SHYFT data fetched successfully'));
  console.log(colors.white(`   Status: ${shyftData.status}`));
  console.log(colors.white(`   Fee Payer: ${shyftData.fee_payer}`));
  console.log(colors.white(`   Signers: ${JSON.stringify(shyftData.signers)}`));
  console.log(colors.white(`   Token Balance Changes: ${shyftData.token_balance_changes?.length || 0}`));
  console.log(colors.white(`   Actions: ${shyftData.actions?.length || 0}\n`));

  // Show detailed token balance changes
  if (shyftData.token_balance_changes && shyftData.token_balance_changes.length > 0) {
    console.log(colors.cyan('💰 Token Balance Changes:'));
    shyftData.token_balance_changes.forEach((change, i) => {
      console.log(colors.gray(`   ${i + 1}. ${change.mint?.substring(0, 8)}... (${change.owner?.substring(0, 8)}...)`));
      console.log(colors.gray(`      Change: ${change.change_amount} | Decimals: ${change.decimals}`));
    });
    console.log('');
  }

  // Map to V2 parser input format
  const v2Input = {
    signature: recentKolTx.signature,
    timestamp: shyftData.timestamp ? new Date(shyftData.timestamp).getTime() : Date.now(),
    status: shyftData.status || 'Success',
    fee: shyftData.fee || 0,
    fee_payer: shyftData.fee_payer || '',
    signers: shyftData.signers || [],
    protocol: shyftData.protocol,
    token_balance_changes: shyftData.token_balance_changes || [],
    actions: shyftData.actions || []
  };

  // Test V2 parser
  console.log(colors.cyan('🧪 Testing V2 parser on this transaction...'));
  const parseResult = parseShyftTransactionV2(v2Input);

  if (parseResult.success) {
    console.log(colors.green('✅ V2 PARSER SUCCESS!'));
    console.log(colors.white(`   Direction: ${parseResult.data.direction}`));
    console.log(colors.white(`   Swapper: ${parseResult.data.swapper}`));
    console.log(colors.white(`   Confidence: ${parseResult.data.confidence}`));
  } else {
    console.log(colors.red('❌ V2 PARSER FAILED'));
    console.log(colors.red(`   Reason: ${parseResult.erase?.reason}`));
    
    if (parseResult.erase?.reason === 'swapper_identification_failed') {
      console.log(colors.yellow('\n🔍 SWAPPER IDENTIFICATION DEBUG:'));
      console.log(colors.white(`   Expected KOL Address: ${recentKolTx.whaleAddress}`));
      console.log(colors.white(`   Fee Payer: ${shyftData.fee_payer}`));
      console.log(colors.white(`   Signers: ${JSON.stringify(shyftData.signers)}`));
      
      // Check if KOL address matches any of the transaction participants
      const kolAddress = recentKolTx.whaleAddress;
      const feePayer = shyftData.fee_payer;
      const signers = shyftData.signers || [];
      const tokenChangeOwners = (shyftData.token_balance_changes || []).map(change => change.owner);
      
      console.log(colors.yellow('\n🔍 ADDRESS MATCHING ANALYSIS:'));
      console.log(colors.white(`   KOL matches fee_payer: ${kolAddress === feePayer ? '✅ YES' : '❌ NO'}`));
      console.log(colors.white(`   KOL in signers: ${signers.includes(kolAddress) ? '✅ YES' : '❌ NO'}`));
      console.log(colors.white(`   KOL in token change owners: ${tokenChangeOwners.includes(kolAddress) ? '✅ YES' : '❌ NO'}`));
      
      if (tokenChangeOwners.length > 0) {
        console.log(colors.gray('\n   Token change owners:'));
        tokenChangeOwners.forEach((owner, i) => {
          const isKol = owner === kolAddress;
          console.log(colors.gray(`     ${i + 1}. ${owner?.substring(0, 8)}... ${isKol ? '← KOL ADDRESS' : ''}`));
        });
      }
    }
  }

  // Compare with database expectation
  console.log(colors.cyan('\n📊 COMPARISON WITH DATABASE:'));
  console.log(colors.white(`   Database says: ${recentKolTx.type} transaction by ${recentKolTx.influencerName}`));
  console.log(colors.white(`   Database KOL address: ${recentKolTx.whaleAddress}`));
  console.log(colors.white(`   SHYFT fee_payer: ${shyftData.fee_payer}`));
  console.log(colors.white(`   Match: ${recentKolTx.whaleAddress === shyftData.fee_payer ? '✅ YES' : '❌ NO'}`));

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

debugSwapperIdentification().catch((error) => {
  console.error(colors.red('💥 Debug Error:'), error);
  process.exit(1);
});