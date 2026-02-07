// Analyze this specific transaction to see why it wasn't split
const axios = require('axios');
const { parseShyftTransaction } = require('./src/utils/shyftParserV2');

const SIGNATURE = '39FVDvhmYftAkuZxxAN6uwNEyAhYmVUevvwfUdcsevKuHaBmPLxHr16vBsk2q4R2DyxoJnNydyquNZBvN8smX4A';
const SHYFT_API_KEY = 'caLOLZwVdg736Emy';

async function analyzeTransaction() {
  try {
    console.log('🔍 Fetching transaction from Shyft...\n');
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: SIGNATURE
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    );

    if (!response.data.success) {
      console.log('❌ Failed to fetch transaction from Shyft');
      return;
    }

    const shyftData = response.data.result;
    console.log('✅ Transaction fetched from Shyft\n');
    console.log('═'.repeat(80));
    console.log(`Signature: ${shyftData.signature}`);
    console.log(`Type: ${shyftData.type}`);
    console.log(`Timestamp: ${new Date(shyftData.timestamp * 1000).toISOString()}`);
    console.log(`Fee Payer: ${shyftData.fee_payer}`);
    console.log('═'.repeat(80));

    // Parse with v2 parser
    console.log('\n🔧 Parsing with v2 parser...\n');
    
    const parsed = await parseShyftTransaction(shyftData, shyftData.fee_payer);

    if (!parsed) {
      console.log('❌ Parser returned null - transaction was filtered out');
      return;
    }

    console.log('✅ Parser result:\n');
    console.log('═'.repeat(80));
    console.log(`Type: ${parsed.type}`);
    console.log(`Is Split Swap: ${parsed.isSplitSwap || false}`);
    
    if (parsed.type === 'SWAP') {
      console.log('\n💱 SWAP DETAILS:');
      console.log(`Base Asset: ${parsed.baseAsset.symbol} (${parsed.baseAsset.mint})`);
      console.log(`Base Amount: ${parsed.amounts.base}`);
      console.log(`Quote Asset: ${parsed.quoteAsset.symbol} (${parsed.quoteAsset.mint})`);
      console.log(`Quote Amount: ${parsed.amounts.quote}`);
      console.log(`USD Value: $${parsed.amounts.usd || 0}`);
      console.log(`Direction: ${parsed.direction}`);

      // Check core token status
      const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT'];
      const baseIsCore = CORE_TOKENS.includes(parsed.baseAsset.symbol);
      const quoteIsCore = CORE_TOKENS.includes(parsed.quoteAsset.symbol);

      console.log('\n🎯 CORE TOKEN ANALYSIS:');
      console.log(`Base "${parsed.baseAsset.symbol}" is core: ${baseIsCore}`);
      console.log(`Quote "${parsed.quoteAsset.symbol}" is core: ${quoteIsCore}`);
      console.log(`Should be split: ${baseIsCore !== quoteIsCore ? 'YES' : 'NO'}`);

      if (baseIsCore !== quoteIsCore) {
        console.log('\n🔴 ISSUE DETECTED:');
        console.log('   This is a core↔non-core swap');
        console.log('   Expected: Parser should split into BUY + SELL');
        console.log(`   Actual: Parser returned single ${parsed.type} transaction`);
        console.log(`   isSplitSwap flag: ${parsed.isSplitSwap || false}`);

        if (!parsed.isSplitSwap) {
          console.log('\n   ❌ BUG CONFIRMED: Split swap logic did not trigger!');
          console.log('\n   Possible causes:');
          console.log('   1. Core token detection failed');
          console.log('   2. Split swap logic not applied in parser');
          console.log('   3. Transaction filtered before split logic');
        }
      }
    }

    // Show raw Shyft actions
    console.log('\n📋 SHYFT ACTIONS:');
    if (shyftData.actions && shyftData.actions.length > 0) {
      shyftData.actions.forEach((action, i) => {
        console.log(`\n   Action ${i + 1}: ${action.type}`);
        if (action.info) {
          console.log(`   Info:`, JSON.stringify(action.info, null, 2));
        }
      });
    }

    // Show full parsed result
    console.log('\n📄 FULL PARSED RESULT:');
    console.log(JSON.stringify(parsed, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

analyzeTransaction();
