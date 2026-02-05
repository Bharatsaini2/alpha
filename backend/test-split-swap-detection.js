/**
 * Test Split Swap Detection
 * 
 * Test if the V2 parser correctly detects and creates split swaps
 * for non-core to non-core token swaps
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

// Test transaction from database: TESTICLE → LORIA
// This should be split into 2 records (SELL TESTICLE + BUY LORIA)
const testTransaction = {
  signature: '4FA2Xe8Pez1wcoS8...',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'TestWallet123',
  signers: ['TestWallet123'],
  protocol: {
    name: 'Jupiter',
    address: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'
  },
  token_balance_changes: [
    {
      address: 'TestWallet123',
      mint: '4TyZGqRLakYBKz4eZbnYZAp5FYKJnfZcXNXzHYMGxgFh', // TESTICLE (non-core)
      decimals: 6,
      change_amount: -88511.197892, // Sold TESTICLE
      post_balance: 0,
      pre_balance: 88511.197892,
      owner: 'TestWallet123'
    },
    {
      address: 'TestWallet123',
      mint: 'Gj4TowizSXZJZQqYXDBJXpjWpNsS7xra5JFJXXXXXXXX', // LORIA (non-core)
      decimals: 6,
      change_amount: 50000, // Bought LORIA
      post_balance: 50000,
      pre_balance: 0,
      owner: 'TestWallet123'
    }
  ],
  actions: [
    {
      type: 'SWAP',
      info: {
        swapper: 'TestWallet123',
        tokens_swapped: {
          in: {
            token_address: '4TyZGqRLakYBKz4eZbnYZAp5FYKJnfZcXNXzHYMGxgFh',
            amount_raw: '88511197892'
          },
          out: {
            token_address: 'Gj4TowizSXZJZQqYXDBJXpjWpNsS7xra5JFJXXXXXXXX',
            amount_raw: '50000000000'
          }
        }
      }
    }
  ]
};

console.log('🧪 Testing Split Swap Detection');
console.log('='.repeat(80));
console.log('\n📝 Test Transaction:');
console.log(`   TokenIn: TESTICLE (4TyZGqRL...) - NON-CORE`);
console.log(`   TokenOut: LORIA (Gj4Towiz...) - NON-CORE`);
console.log(`   Expected: Split into 2 records (SELL + BUY)`);
console.log('\n' + '='.repeat(80));

const result = parseShyftTransactionV2(testTransaction);

console.log('\n📊 Parser Result:');
console.log('='.repeat(80));

if (result.success && result.data) {
  // Check if it's a split swap
  if ('sellRecord' in result.data) {
    console.log('\n✅ SPLIT SWAP DETECTED!');
    console.log('\n🔴 SELL Record:');
    console.log(`   Direction: ${result.data.sellRecord.direction}`);
    console.log(`   Quote: ${result.data.sellRecord.quoteAsset.symbol} (${result.data.sellRecord.quoteAsset.mint.slice(0, 8)}...)`);
    console.log(`   Base: ${result.data.sellRecord.baseAsset.symbol} (${result.data.sellRecord.baseAsset.mint.slice(0, 8)}...)`);
    console.log(`   Base Amount: ${result.data.sellRecord.amounts.baseAmount}`);
    console.log(`   Full sellRecord:`, JSON.stringify(result.data.sellRecord, null, 2));
    
    console.log('\n🟢 BUY Record:');
    console.log(`   Direction: ${result.data.buyRecord.direction}`);
    console.log(`   Quote: ${result.data.buyRecord.quoteAsset.symbol} (${result.data.buyRecord.quoteAsset.mint.slice(0, 8)}...)`);
    console.log(`   Base: ${result.data.buyRecord.baseAsset.symbol} (${result.data.buyRecord.baseAsset.mint.slice(0, 8)}...)`);
    console.log(`   Base Amount: ${result.data.buyRecord.amounts.baseAmount}`);
    console.log(`   Full buyRecord:`, JSON.stringify(result.data.buyRecord, null, 2));
    
    console.log('\n✅ TEST PASSED: Split swap correctly detected and created 2 records');
  } else {
    console.log('\n❌ SINGLE SWAP DETECTED (SHOULD BE SPLIT!)');
    console.log(`   Direction: ${result.data.direction}`);
    console.log(`   Quote: ${result.data.quoteAsset.symbol} (${result.data.quoteAsset.mint.slice(0, 8)}...)`);
    console.log(`   Base: ${result.data.baseAsset.symbol} (${result.data.baseAsset.mint.slice(0, 8)}...)`);
    console.log('\n❌ TEST FAILED: Non-core to non-core swap was NOT split into 2 records');
  }
} else if (result.erase) {
  console.log('\n❌ TRANSACTION REJECTED');
  console.log(`   Reason: ${result.erase.reason}`);
  console.log('\n❌ TEST FAILED: Transaction was rejected instead of being split');
} else {
  console.log('\n❌ PARSER ERROR');
  console.log('\n❌ TEST FAILED: Parser returned unexpected result');
}

console.log('\n' + '='.repeat(80));
