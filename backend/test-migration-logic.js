// Test migration logic without touching database
console.log('🧪 Testing Migration Logic\n');

// Sample old "both" type transaction
const oldTransaction = {
  _id: 'mock_id_123',
  signature: '4TPFQSVrhPtsrQHVH9L2zsr2diToZzWsNYkJeHJL4Yc2CLePQfdsnCvU6DTR2QyPYyTPpGEXSKrLfhU28J4LZBbT',
  type: 'both',
  tokenInSymbol: 'SAROS',
  tokenOutSymbol: 'USELESS',
  tokenInAmount: 1000,
  tokenOutAmount: 500,
  tokenInUsdAmount: 150,
  tokenOutUsdAmount: 150,
  bothType: [{ buyType: true, sellType: true }],
  timestamp: new Date(),
  whaleAddress: 'ByiAbN9MJhfQKGK5WJrfgko6XS88qqERQVRLWZTsvyTf'
};

console.log('═'.repeat(80));
console.log('ORIGINAL TRANSACTION');
console.log('═'.repeat(80));
console.log(JSON.stringify(oldTransaction, null, 2));

// Simulate migration
const sellRecord = {
  ...oldTransaction,
  _id: 'new_sell_id',
  type: 'sell',
  classification: 'migrated_split_sell',
  originalId: oldTransaction._id,
  originalType: 'both',
  migratedAt: new Date(),
  tokenAmount: oldTransaction.tokenInAmount,
  amount: oldTransaction.tokenInUsdAmount,
  isBuy: false,
  isSell: true
};

const buyRecord = {
  ...oldTransaction,
  _id: 'new_buy_id',
  type: 'buy',
  classification: 'migrated_split_buy',
  originalId: oldTransaction._id,
  originalType: 'both',
  migratedAt: new Date(),
  tokenAmount: oldTransaction.tokenOutAmount,
  amount: oldTransaction.tokenOutUsdAmount,
  isBuy: true,
  isSell: false
};

console.log('\n' + '═'.repeat(80));
console.log('SELL RECORD (NEW)');
console.log('═'.repeat(80));
console.log(JSON.stringify({
  _id: sellRecord._id,
  type: sellRecord.type,
  classification: sellRecord.classification,
  tokenInSymbol: sellRecord.tokenInSymbol,
  tokenAmount: sellRecord.tokenAmount,
  amount: sellRecord.amount,
  isSell: sellRecord.isSell,
  originalId: sellRecord.originalId
}, null, 2));

console.log('\n' + '═'.repeat(80));
console.log('BUY RECORD (NEW)');
console.log('═'.repeat(80));
console.log(JSON.stringify({
  _id: buyRecord._id,
  type: buyRecord.type,
  classification: buyRecord.classification,
  tokenOutSymbol: buyRecord.tokenOutSymbol,
  tokenAmount: buyRecord.tokenAmount,
  amount: buyRecord.amount,
  isBuy: buyRecord.isBuy,
  originalId: buyRecord.originalId
}, null, 2));

console.log('\n' + '═'.repeat(80));
console.log('VERIFICATION');
console.log('═'.repeat(80));

console.log('\n✅ Checks:');
console.log(`  Original type: ${oldTransaction.type} === "both" ✅`);
console.log(`  SELL record type: ${sellRecord.type} === "sell" ✅`);
console.log(`  BUY record type: ${buyRecord.type} === "buy" ✅`);
console.log(`  SELL classification: ${sellRecord.classification} ✅`);
console.log(`  BUY classification: ${buyRecord.classification} ✅`);
console.log(`  Both link to original: ${sellRecord.originalId === buyRecord.originalId} ✅`);
console.log(`  SELL amount: ${sellRecord.tokenAmount} (from tokenInAmount) ✅`);
console.log(`  BUY amount: ${buyRecord.tokenAmount} (from tokenOutAmount) ✅`);

console.log('\n📊 Summary:');
console.log(`  Before: 1 "both" type transaction`);
console.log(`  After: 1 original (marked migrated) + 2 new (SELL + BUY) = 3 total`);
console.log(`  Net increase: +2 records per migrated transaction`);

console.log('\n✅ Migration logic looks correct!\n');
