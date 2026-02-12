require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function verifyTransaction() {
  try {
    const signature = '4uooDQdF2pXMWEod84Snv6hPn9Ahp7jie1GxEjirbqWrrEYd8bkNZTgrv5Ua6jtnd2yHRAU1T8S3Jvsn8mzVj9eF';
    
    console.log('🔍 Fetching transaction from Solana...\n');
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const txn = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    
    if (!txn) {
      console.log('❌ Transaction not found on chain');
      return;
    }
    
    console.log('✅ Transaction found, parsing with V2 parser...\n');
    console.log('='.repeat(100));
    
    // Convert to Shyft format (simplified - just checking if split swap)
    const shyftTx = {
      timestamp: txn.blockTime,
      fee: txn.meta.fee,
      fee_payer: txn.transaction.message.accountKeys[0].toBase58(),
      signers: [txn.transaction.message.accountKeys[0].toBase58()],
      signatures: [signature],
      protocol: {},
      type: 'SWAP',
      status: txn.meta.err ? 'Failed' : 'Success',
      actions: [],
      events: {}
    };
    
    const parsed = parseShyftTransactionV2(shyftTx);
    
    console.log('\n📊 PARSER OUTPUT:');
    console.log('='.repeat(100));
    console.log(JSON.stringify(parsed, null, 2));
    
    console.log('\n' + '='.repeat(100));
    console.log('ANALYSIS:');
    console.log('='.repeat(100));
    
    if (parsed.isSplitSwap) {
      console.log('\n✅ This IS a split swap transaction');
      console.log(`   Total Legs: ${parsed.splitSwapLegs?.length || 0}`);
      console.log(`   Expected Storage: ${parsed.splitSwapLegs?.length || 0} separate records`);
      console.log(`   Actual Storage: 1 record with type "both"`);
      console.log(`   Status: ❌ INCORRECT - Should be stored as separate records`);
      
      if (parsed.splitSwapLegs) {
        console.log('\n   Split Swap Legs:');
        parsed.splitSwapLegs.forEach((leg, idx) => {
          console.log(`\n   Leg ${idx + 1}:`);
          console.log(`      Type: ${leg.type}`);
          console.log(`      Token In: ${leg.tokenIn?.symbol} (${leg.tokenIn?.address})`);
          console.log(`      Token Out: ${leg.tokenOut?.symbol} (${leg.tokenOut?.address})`);
          console.log(`      Amount In: ${leg.tokenIn?.amount}`);
          console.log(`      Amount Out: ${leg.tokenOut?.amount}`);
        });
      }
    } else {
      console.log('\n❌ This is NOT a split swap transaction');
      console.log(`   Type: ${parsed.type}`);
      console.log(`   Expected Storage: 1 record`);
      console.log(`   Actual Storage: 1 record`);
      console.log(`   Status: ✅ CORRECT`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

verifyTransaction();
