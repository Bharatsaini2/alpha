const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Import the V2 parser
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

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
    console.error(`Error fetching transaction ${signature}:`, error.message);
    return null;
  }
}

async function analyzeTransactionAmounts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get transactions from last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    console.log(`\n=== COMPREHENSIVE AMOUNT ANALYSIS ===`);
    console.log(`Time range: ${tenMinutesAgo.toISOString()} to ${new Date().toISOString()}\n`);
    
    // Get recent whale transactions
    const whaleTransactions = await mongoose.connection.db.collection('whale_transactions')
      .find({
        timestamp: { $gte: tenMinutesAgo.getTime() / 1000 }
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    // Get recent KOL transactions
    const kolTransactions = await mongoose.connection.db.collection('kol_transactions')
      .find({
        timestamp: { $gte: tenMinutesAgo.getTime() / 1000 }
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    const allTransactions = [...whaleTransactions, ...kolTransactions];
    
    console.log(`Found ${allTransactions.length} recent transactions to analyze\n`);
    
    if (allTransactions.length === 0) {
      console.log('No recent transactions found. Let me check the last hour instead...\n');
      
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const whaleTransactionsHour = await mongoose.connection.db.collection('whale_transactions')
        .find({
          timestamp: { $gte: oneHourAgo.getTime() / 1000 }
        })
        .sort({ timestamp: -1 })
        .limit(5)
        .toArray();
      
      const kolTransactionsHour = await mongoose.connection.db.collection('kol_transactions')
        .find({
          timestamp: { $gte: oneHourAgo.getTime() / 1000 }
        })
        .sort({ timestamp: -1 })
        .limit(5)
        .toArray();
      
      allTransactions.push(...whaleTransactionsHour, ...kolTransactionsHour);
      console.log(`Found ${allTransactions.length} transactions in the last hour\n`);
    }
    
    for (let i = 0; i < Math.min(allTransactions.length, 5); i++) {
      const dbTx = allTransactions[i];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`TRANSACTION ${i + 1}: ${dbTx.signature}`);
      console.log(`${'='.repeat(80)}`);
      
      // 1. Show what's saved in the database
      console.log(`\n1. DATABASE RECORD:`);
      console.log(`   Address: ${dbTx.address}`);
      console.log(`   Type: ${dbTx.type}`);
      console.log(`   Token: ${dbTx.token_symbol} (${dbTx.token_address})`);
      console.log(`   Amount: ${dbTx.amount}`);
      console.log(`   USD Value: $${dbTx.usd_value}`);
      console.log(`   Timestamp: ${new Date(dbTx.timestamp * 1000).toISOString()}`);
      
      // Check if this should be split into BUY/SELL
      const isStableCoin = ['SOL', 'USDC', 'USDT', 'WSOL'].includes(dbTx.token_symbol);
      if (dbTx.type === 'SWAP' && !isStableCoin) {
        console.log(`   ⚠️  ISSUE: SWAP with non-stable token should be split into BUY/SELL`);
      }
      
      // 2. Fetch raw Shyft API response
      console.log(`\n2. SHYFT API RESPONSE:`);
      const shyftResponse = await fetchShyftTransaction(dbTx.signature);
      
      if (!shyftResponse) {
        console.log(`   ❌ Failed to fetch Shyft response`);
        continue;
      }
      
      console.log(`   Status: ${shyftResponse.status}`);
      console.log(`   Fee: ${shyftResponse.fee} SOL`);
      console.log(`   Fee Payer: ${shyftResponse.fee_payer}`);
      console.log(`   Signers: ${shyftResponse.signers?.length || 0}`);
      console.log(`   Token Balance Changes: ${shyftResponse.token_balance_changes?.length || 0}`);
      console.log(`   Actions: ${shyftResponse.actions?.length || 0}`);
      
      // Show token balance changes
      if (shyftResponse.token_balance_changes) {
        console.log(`\n   Token Balance Changes:`);
        shyftResponse.token_balance_changes.forEach((change, idx) => {
          const normalizedAmount = change.change_amount / Math.pow(10, change.decimals);
          console.log(`     ${idx + 1}. ${change.mint.substring(0, 8)}... (${change.decimals} decimals)`);
          console.log(`        Owner: ${change.owner}`);
          console.log(`        Raw Amount: ${change.change_amount}`);
          console.log(`        Normalized: ${normalizedAmount.toFixed(6)}`);
          console.log(`        Pre Balance: ${change.pre_balance}`);
          console.log(`        Post Balance: ${change.post_balance}`);
        });
      }
      
      // Show actions
      if (shyftResponse.actions) {
        console.log(`\n   Actions:`);
        shyftResponse.actions.forEach((action, idx) => {
          console.log(`     ${idx + 1}. Type: ${action.type}`);
          if (action.info) {
            console.log(`        Info: ${JSON.stringify(action.info, null, 8)}`);
          }
        });
      }
      
      // 3. Run V2 parser on the Shyft response
      console.log(`\n3. V2 PARSER OUTPUT:`);
      
      const v2Input = {
        signature: dbTx.signature,
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
        console.log(`   ✅ Parser Success`);
        console.log(`   Processing Time: ${parseResult.processingTimeMs}ms`);
        
        if ('sellRecord' in swapData) {
          // Split swap pair
          console.log(`   Type: Split Swap Pair`);
          console.log(`   Reason: ${swapData.splitReason}`);
          
          console.log(`\n   SELL Record:`);
          console.log(`     Direction: ${swapData.sellRecord.direction}`);
          console.log(`     Quote Asset: ${swapData.sellRecord.quoteAsset.symbol} (${swapData.sellRecord.quoteAsset.mint})`);
          console.log(`     Base Asset: ${swapData.sellRecord.baseAsset.symbol} (${swapData.sellRecord.baseAsset.mint})`);
          console.log(`     Amounts:`);
          console.log(`       Swap Input: ${swapData.sellRecord.amounts.swapInputAmount || 'N/A'}`);
          console.log(`       Swap Output: ${swapData.sellRecord.amounts.swapOutputAmount || 'N/A'}`);
          console.log(`       Base Amount: ${swapData.sellRecord.amounts.baseAmount || 'N/A'}`);
          console.log(`       Total Wallet Cost: ${swapData.sellRecord.amounts.totalWalletCost || 'N/A'}`);
          console.log(`       Net Wallet Received: ${swapData.sellRecord.amounts.netWalletReceived || 'N/A'}`);
          
          console.log(`\n   BUY Record:`);
          console.log(`     Direction: ${swapData.buyRecord.direction}`);
          console.log(`     Quote Asset: ${swapData.buyRecord.quoteAsset.symbol} (${swapData.buyRecord.quoteAsset.mint})`);
          console.log(`     Base Asset: ${swapData.buyRecord.baseAsset.symbol} (${swapData.buyRecord.baseAsset.mint})`);
          console.log(`     Amounts:`);
          console.log(`       Swap Input: ${swapData.buyRecord.amounts.swapInputAmount || 'N/A'}`);
          console.log(`       Swap Output: ${swapData.buyRecord.amounts.swapOutputAmount || 'N/A'}`);
          console.log(`       Base Amount: ${swapData.buyRecord.amounts.baseAmount || 'N/A'}`);
          console.log(`       Total Wallet Cost: ${swapData.buyRecord.amounts.totalWalletCost || 'N/A'}`);
          console.log(`       Net Wallet Received: ${swapData.buyRecord.amounts.netWalletReceived || 'N/A'}`);
          
        } else {
          // Regular parsed swap
          console.log(`   Type: Parsed Swap`);
          console.log(`   Direction: ${swapData.direction}`);
          console.log(`   Swapper: ${swapData.swapper}`);
          console.log(`   Quote Asset: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.mint})`);
          console.log(`   Base Asset: ${swapData.baseAsset.symbol} (${swapData.baseAsset.mint})`);
          console.log(`   Confidence: ${swapData.confidence}`);
          console.log(`   Protocol: ${swapData.protocol}`);
          
          console.log(`\n   Amounts:`);
          console.log(`     Swap Input: ${swapData.amounts.swapInputAmount || 'N/A'}`);
          console.log(`     Swap Output: ${swapData.amounts.swapOutputAmount || 'N/A'}`);
          console.log(`     Base Amount: ${swapData.amounts.baseAmount || 'N/A'}`);
          console.log(`     Total Wallet Cost: ${swapData.amounts.totalWalletCost || 'N/A'}`);
          console.log(`     Net Wallet Received: ${swapData.amounts.netWalletReceived || 'N/A'}`);
          
          console.log(`\n   Fee Breakdown:`);
          console.log(`     Transaction Fee SOL: ${swapData.amounts.feeBreakdown.transactionFeeSOL}`);
          console.log(`     Transaction Fee Quote: ${swapData.amounts.feeBreakdown.transactionFeeQuote}`);
          console.log(`     Platform Fee: ${swapData.amounts.feeBreakdown.platformFee}`);
          console.log(`     Priority Fee: ${swapData.amounts.feeBreakdown.priorityFee}`);
          console.log(`     Total Fee Quote: ${swapData.amounts.feeBreakdown.totalFeeQuote}`);
        }
        
      } else {
        console.log(`   ❌ Parser Failed`);
        console.log(`   Reason: ${parseResult.data?.reason || 'Unknown'}`);
        if (parseResult.data?.metadata) {
          console.log(`   Metadata: ${JSON.stringify(parseResult.data.metadata, null, 6)}`);
        }
      }
      
      // 4. Compare amounts
      console.log(`\n4. AMOUNT COMPARISON:`);
      
      if (parseResult.success && parseResult.data && !('sellRecord' in parseResult.data)) {
        const parsedAmounts = parseResult.data.amounts;
        const dbAmount = dbTx.amount;
        
        let parserAmount;
        if (parseResult.data.direction === 'BUY') {
          parserAmount = parsedAmounts.baseAmount || parsedAmounts.swapOutputAmount;
        } else {
          parserAmount = parsedAmounts.baseAmount || parsedAmounts.swapInputAmount;
        }
        
        console.log(`   Database Amount: ${dbAmount}`);
        console.log(`   Parser Amount: ${parserAmount}`);
        
        if (parserAmount) {
          const difference = Math.abs(dbAmount - parserAmount);
          const percentDiff = (difference / Math.max(dbAmount, parserAmount)) * 100;
          
          console.log(`   Difference: ${difference.toFixed(6)}`);
          console.log(`   Percent Diff: ${percentDiff.toFixed(2)}%`);
          
          if (percentDiff > 5) {
            console.log(`   ⚠️  SIGNIFICANT DIFFERENCE (>${percentDiff.toFixed(2)}%)`);
          } else if (percentDiff > 1) {
            console.log(`   ⚠️  Minor difference (${percentDiff.toFixed(2)}%)`);
          } else {
            console.log(`   ✅ Amounts match closely`);
          }
        }
      } else if (parseResult.success && parseResult.data && 'sellRecord' in parseResult.data) {
        console.log(`   Database shows single SWAP, but parser correctly split into BUY/SELL`);
        console.log(`   This is the expected behavior for token-to-token swaps`);
      } else {
        console.log(`   Cannot compare - parser failed or returned ERASE`);
      }
      
      // Add a delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ANALYSIS COMPLETE`);
    console.log(`${'='.repeat(80)}\n`);
    
  } catch (error) {
    console.error('Error during analysis:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the analysis
analyzeTransactionAmounts().catch(console.error);