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

async function analyzeRealTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get some actual transactions from the main collection
    console.log('\n=== ANALYZING REAL TRANSACTIONS ===');
    
    const transactions = await mongoose.connection.db.collection('whalealltransactionv2')
      .find({})
      .sort({ _id: -1 }) // Sort by _id instead of timestamp
      .limit(5)
      .toArray();
    
    console.log(`Found ${transactions.length} transactions to analyze\n`);
    
    for (let i = 0; i < transactions.length; i++) {
      const dbTx = transactions[i];
      
      // Extract the signature properly
      let signature = dbTx.signature || dbTx.transaction?.signature;
      if (!signature) {
        console.log(`Transaction ${i + 1}: No signature found, skipping`);
        continue;
      }
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`TRANSACTION ${i + 1}: ${signature}`);
      console.log(`${'='.repeat(80)}`);
      
      // 1. Show what's saved in the database
      console.log(`\n1. DATABASE RECORD:`);
      console.log(`   Full record structure:`);
      console.log(JSON.stringify(dbTx, null, 2));
      
      // Extract relevant fields
      const address = dbTx.whale?.address || dbTx.address || 'N/A';
      const type = dbTx.type || 'N/A';
      const tokenSymbol = dbTx.transaction?.tokenOut?.symbol || dbTx.token_symbol || 'N/A';
      const tokenAddress = dbTx.transaction?.tokenOut?.address || dbTx.token_address || 'N/A';
      const amount = dbTx.transaction?.tokenOut?.amount || dbTx.amount || 'N/A';
      const usdValue = dbTx.transaction?.usdValue || dbTx.usd_value || 'N/A';
      
      console.log(`\n   Extracted fields:`);
      console.log(`   Address: ${address}`);
      console.log(`   Type: ${type}`);
      console.log(`   Token: ${tokenSymbol} (${tokenAddress})`);
      console.log(`   Amount: ${amount}`);
      console.log(`   USD Value: $${usdValue}`);
      
      // Check if this should be split into BUY/SELL
      const isStableCoin = ['SOL', 'USDC', 'USDT', 'WSOL'].includes(tokenSymbol);
      if (type === 'SWAP' && !isStableCoin) {
        console.log(`   ⚠️  ISSUE: SWAP with non-stable token should be split into BUY/SELL`);
      }
      
      // 2. Fetch raw Shyft API response
      console.log(`\n2. SHYFT API RESPONSE:`);
      const shyftResponse = await fetchShyftTransaction(signature);
      
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
      
      // Show token balance changes (first 3)
      if (shyftResponse.token_balance_changes) {
        console.log(`\n   Token Balance Changes (first 3):`);
        shyftResponse.token_balance_changes.slice(0, 3).forEach((change, idx) => {
          const normalizedAmount = change.change_amount / Math.pow(10, change.decimals);
          console.log(`     ${idx + 1}. ${change.mint.substring(0, 8)}... (${change.decimals} decimals)`);
          console.log(`        Owner: ${change.owner}`);
          console.log(`        Raw Amount: ${change.change_amount}`);
          console.log(`        Normalized: ${normalizedAmount.toFixed(6)}`);
        });
      }
      
      // 3. Run V2 parser on the Shyft response
      console.log(`\n3. V2 PARSER OUTPUT:`);
      
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
        console.log(`   ✅ Parser Success`);
        console.log(`   Processing Time: ${parseResult.processingTimeMs}ms`);
        
        if ('sellRecord' in swapData) {
          // Split swap pair
          console.log(`   Type: Split Swap Pair`);
          console.log(`   Reason: ${swapData.splitReason}`);
          
          console.log(`\n   SELL Record:`);
          console.log(`     Direction: ${swapData.sellRecord.direction}`);
          console.log(`     Quote Asset: ${swapData.sellRecord.quoteAsset.symbol} (${swapData.sellRecord.quoteAsset.mint.substring(0, 8)}...)`);
          console.log(`     Base Asset: ${swapData.sellRecord.baseAsset.symbol} (${swapData.sellRecord.baseAsset.mint.substring(0, 8)}...)`);
          console.log(`     Base Amount: ${swapData.sellRecord.amounts.baseAmount}`);
          
          console.log(`\n   BUY Record:`);
          console.log(`     Direction: ${swapData.buyRecord.direction}`);
          console.log(`     Quote Asset: ${swapData.buyRecord.quoteAsset.symbol} (${swapData.buyRecord.quoteAsset.mint.substring(0, 8)}...)`);
          console.log(`     Base Asset: ${swapData.buyRecord.baseAsset.symbol} (${swapData.buyRecord.baseAsset.mint.substring(0, 8)}...)`);
          console.log(`     Base Amount: ${swapData.buyRecord.amounts.baseAmount}`);
          
        } else {
          // Regular parsed swap
          console.log(`   Type: Parsed Swap`);
          console.log(`   Direction: ${swapData.direction}`);
          console.log(`   Swapper: ${swapData.swapper.substring(0, 8)}...`);
          console.log(`   Quote Asset: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.mint.substring(0, 8)}...)`);
          console.log(`   Base Asset: ${swapData.baseAsset.symbol} (${swapData.baseAsset.mint.substring(0, 8)}...)`);
          console.log(`   Confidence: ${swapData.confidence}`);
          
          console.log(`\n   Amounts:`);
          console.log(`     Swap Input: ${swapData.amounts.swapInputAmount || 'N/A'}`);
          console.log(`     Swap Output: ${swapData.amounts.swapOutputAmount || 'N/A'}`);
          console.log(`     Base Amount: ${swapData.amounts.baseAmount || 'N/A'}`);
          console.log(`     Total Wallet Cost: ${swapData.amounts.totalWalletCost || 'N/A'}`);
          console.log(`     Net Wallet Received: ${swapData.amounts.netWalletReceived || 'N/A'}`);
        }
        
      } else {
        console.log(`   ❌ Parser Failed`);
        console.log(`   Reason: ${parseResult.data?.reason || 'Unknown'}`);
      }
      
      // 4. Compare amounts
      console.log(`\n4. AMOUNT COMPARISON:`);
      
      if (parseResult.success && parseResult.data && !('sellRecord' in parseResult.data)) {
        const parsedAmounts = parseResult.data.amounts;
        const dbAmount = parseFloat(amount) || 0;
        
        let parserAmount;
        if (parseResult.data.direction === 'BUY') {
          parserAmount = parsedAmounts.baseAmount || parsedAmounts.swapOutputAmount;
        } else {
          parserAmount = parsedAmounts.baseAmount || parsedAmounts.swapInputAmount;
        }
        
        console.log(`   Database Amount: ${dbAmount}`);
        console.log(`   Parser Amount: ${parserAmount}`);
        
        if (parserAmount && dbAmount > 0) {
          const difference = Math.abs(dbAmount - parserAmount);
          const percentDiff = (difference / Math.max(dbAmount, parserAmount)) * 100;
          
          console.log(`   Difference: ${difference.toFixed(6)}`);
          console.log(`   Percent Diff: ${percentDiff.toFixed(2)}%`);
          
          if (percentDiff > 5) {
            console.log(`   ⚠️  SIGNIFICANT DIFFERENCE (${percentDiff.toFixed(2)}%)`);
          } else if (percentDiff > 1) {
            console.log(`   ⚠️  Minor difference (${percentDiff.toFixed(2)}%)`);
          } else {
            console.log(`   ✅ Amounts match closely`);
          }
        }
      } else if (parseResult.success && parseResult.data && 'sellRecord' in parseResult.data) {
        console.log(`   Database shows single transaction, but parser correctly split into BUY/SELL`);
        console.log(`   This is the expected behavior for token-to-token swaps`);
      } else {
        console.log(`   Cannot compare - parser failed or returned ERASE`);
      }
      
      // Add a delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
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
analyzeRealTransactions().catch(console.error);