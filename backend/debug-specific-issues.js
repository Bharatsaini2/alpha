/**
 * Debug Specific Transaction Issues
 * 
 * Issue 1: 4Rqs6Ni9... - Flagged as invalid_asset_count but valid
 * Issue 2: 3Xrasm33... - Amount doubled
 */

require('dotenv').config();
const axios = require('axios');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';

const SIGNATURES = [
  '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD',
  '3Xrasm33YS3yALUuqX6gVdzhzpUkBV2FkwuRwC3KwK6RXxwXDP6b7ovzBEoHKdVjk8bQVBGSxZRmjFxTzw5MGxQ4'
];

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    );
    return response.data?.result || null;
  } catch (error) {
    console.error(`Error fetching ${signature}:`, error.message);
    return null;
  }
}

async function debugTransaction(signature, issueDescription) {
  console.log('\n' + '='.repeat(80));
  console.log(`DEBUGGING: ${signature}`);
  console.log(`ISSUE: ${issueDescription}`);
  console.log('='.repeat(80));

  const shyftData = await fetchShyftTransaction(signature);
  
  if (!shyftData) {
    console.log('❌ Could not fetch transaction data');
    return;
  }

  console.log('\n📊 SHYFT DATA:');
  console.log('Status:', shyftData.status);
  console.log('Type:', shyftData.type);
  console.log('Protocol:', shyftData.protocol?.name || 'Unknown');
  console.log('Fee Payer:', shyftData.fee_payer);
  console.log('Signers:', shyftData.signers);

  // Show token balance changes
  console.log('\n💰 TOKEN BALANCE CHANGES:');
  if (shyftData.token_balance_changes && shyftData.token_balance_changes.length > 0) {
    shyftData.token_balance_changes.forEach((change, i) => {
      const delta = change.change_amount || (change.post_balance - change.pre_balance);
      const symbol = change.symbol || (change.token && change.token.symbol) || 'UNKNOWN';
      const mint = change.mint || (change.token && change.token.address) || 'UNKNOWN';
      console.log(`\n  [${i + 1}] ${symbol}`);
      console.log(`      Mint: ${mint}`);
      console.log(`      Owner: ${change.owner}`);
      console.log(`      Pre: ${change.pre_balance || 'N/A'}`);
      console.log(`      Post: ${change.post_balance || 'N/A'}`);
      console.log(`      Delta: ${delta} (${delta > 0 ? '+' : ''}${delta})`);
    });
  } else {
    console.log('  No token balance changes');
  }

  // Show actions
  console.log('\n🎬 ACTIONS:');
  if (shyftData.actions && shyftData.actions.length > 0) {
    shyftData.actions.forEach((action, i) => {
      console.log(`\n  [${i + 1}] ${action.type}`);
      if (action.info) {
        console.log('      Info:', JSON.stringify(action.info, null, 2));
      }
    });
  } else {
    console.log('  No actions');
  }

  // Test with V2 parser
  console.log('\n🔍 V2 PARSER RESULT:');
  
  const v2Input = {
    signature: signature,
    timestamp: shyftData.timestamp ? new Date(shyftData.timestamp).getTime() : Date.now(),
    status: shyftData.status || 'Success',
    fee: shyftData.fee || 0,
    fee_payer: shyftData.fee_payer || '',
    signers: shyftData.signers || [],
    protocol: shyftData.protocol,
    token_balance_changes: shyftData.token_balance_changes || [],
    actions: shyftData.actions || []
  };

  const parseResult = parseShyftTransactionV2(v2Input);

  if (parseResult.success && parseResult.data) {
    const swapData = parseResult.data;
    
    if ('sellRecord' in swapData) {
      console.log('✅ SPLIT SWAP DETECTED');
      console.log('\n  SELL Record:');
      console.log('    Direction:', swapData.sellRecord.direction);
      console.log('    Quote:', swapData.sellRecord.quoteAsset.symbol);
      console.log('    Base:', swapData.sellRecord.baseAsset.symbol);
      console.log('    Amounts:', JSON.stringify(swapData.sellRecord.amounts, null, 2));
      
      console.log('\n  BUY Record:');
      console.log('    Direction:', swapData.buyRecord.direction);
      console.log('    Quote:', swapData.buyRecord.quoteAsset.symbol);
      console.log('    Base:', swapData.buyRecord.baseAsset.symbol);
      console.log('    Amounts:', JSON.stringify(swapData.buyRecord.amounts, null, 2));
    } else {
      console.log('✅ SWAP DETECTED');
      console.log('  Direction:', swapData.direction);
      console.log('  Quote:', swapData.quoteAsset.symbol);
      console.log('  Base:', swapData.baseAsset.symbol);
      console.log('  Swapper:', swapData.swapper);
      console.log('  Confidence:', swapData.confidence);
      console.log('\n  Amounts:');
      console.log(JSON.stringify(swapData.amounts, null, 2));
    }
  } else if (parseResult.erase) {
    console.log('❌ REJECTED');
    console.log('  Reason:', parseResult.erase.reason);
    if (parseResult.erase.metadata) {
      console.log('  Metadata:', JSON.stringify(parseResult.erase.metadata, null, 2));
    }
  } else {
    console.log('⚠️  UNKNOWN RESULT');
    console.log(JSON.stringify(parseResult, null, 2));
  }

  // Analyze the issue
  console.log('\n🔬 ISSUE ANALYSIS:');
  
  if (issueDescription.includes('invalid_asset_count')) {
    // Count unique assets with non-zero delta
    const assetDeltas = new Map();
    
    if (shyftData.token_balance_changes) {
      shyftData.token_balance_changes.forEach(change => {
        const delta = change.change_amount || (change.post_balance - change.pre_balance);
        if (Math.abs(delta) > 0.000001) {
          const key = change.mint || (change.token && change.token.address) || 'UNKNOWN';
          if (!assetDeltas.has(key)) {
            assetDeltas.set(key, {
              symbol: change.symbol || (change.token && change.token.symbol) || 'UNKNOWN',
              mint: key,
              delta: 0,
              owners: []
            });
          }
          const asset = assetDeltas.get(key);
          asset.delta += delta;
          asset.owners.push(change.owner);
        }
      });
    }
    
    console.log(`  Total unique assets with non-zero delta: ${assetDeltas.size}`);
    assetDeltas.forEach((asset, mint) => {
      console.log(`    - ${asset.symbol}: ${asset.delta} (owners: ${asset.owners.length})`);
    });
    
    if (assetDeltas.size > 2) {
      console.log('\n  ⚠️  More than 2 assets detected!');
      console.log('  This might be a multi-hop swap that needs better handling.');
    }
  }
  
  if (issueDescription.includes('doubled')) {
    console.log('  Checking for amount doubling issue...');
    console.log('  This might be caused by counting the same balance change twice.');
  }
}

async function main() {
  console.log('🔍 Debugging Specific Transaction Issues\n');
  
  await debugTransaction(
    SIGNATURES[0],
    'Flagged as invalid_asset_count but should be valid'
  );
  
  await debugTransaction(
    SIGNATURES[1],
    'Amount doubled - showing 2x the correct amount'
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Debug complete');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
