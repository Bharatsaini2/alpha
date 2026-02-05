const { MongoClient } = require('mongodb');
require('dotenv').config();

async function debugParserIssues() {
  console.log('🔍 Debugging Parser Issues...\n');
  
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('alpha-whale-tracker');
  
  // Check recent transactions with detailed info
  console.log('📊 Recent Whale Transactions (detailed):');
  const whaleTransactions = await db.collection('whalealltransactionv2')
    .find({})
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();
    
  whaleTransactions.forEach((tx, i) => {
    console.log(`  [${i+1}] ${tx.signature?.substring(0, 8)}...`);
    console.log(`      ${tx.input?.symbol || 'UNKNOWN'} -> ${tx.output?.symbol || 'UNKNOWN'}`);
    console.log(`      Input: ${tx.input?.amount || 0} (${tx.input?.mint?.substring(0, 8)}...)`);
    console.log(`      Output: ${tx.output?.amount || 0} (${tx.output?.mint?.substring(0, 8)}...)`);
    console.log(`      Side: ${tx.side}, Router: ${tx.router_or_amm}`);
    console.log(`      Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
    console.log('');
  });
  
  // Check for SOL/WSOL splitting issues
  console.log('🔍 Checking for SOL/WSOL splitting issues:');
  const solWsolTransactions = await db.collection('whalealltransactionv2')
    .find({
      $or: [
        { 'input.mint': 'So11111111111111111111111111111111111111112' },
        { 'output.mint': 'So11111111111111111111111111111111111111112' }
      ],
      timestamp: { $gte: Date.now() - 3600000 } // Last hour
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray();
    
  console.log(`Found ${solWsolTransactions.length} SOL/WSOL transactions in last hour:`);
  solWsolTransactions.forEach((tx, i) => {
    console.log(`  [${i+1}] ${tx.input?.symbol} -> ${tx.output?.symbol} | ${tx.side}`);
    console.log(`      Input mint: ${tx.input?.mint}`);
    console.log(`      Output mint: ${tx.output?.mint}`);
  });
  
  // Check for unknown token issues
  console.log('\n🔍 Checking Unknown Token Issues:');
  const unknownTransactions = await db.collection('whalealltransactionv2')
    .find({
      $or: [
        { 'input.symbol': { $regex: /UNKNOWN|Unknown/i } },
        { 'output.symbol': { $regex: /UNKNOWN|Unknown/i } }
      ],
      timestamp: { $gte: Date.now() - 3600000 }
    })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();
    
  console.log(`Found ${unknownTransactions.length} unknown token transactions:`);
  unknownTransactions.forEach((tx, i) => {
    console.log(`  [${i+1}] ${tx.input?.symbol} -> ${tx.output?.symbol}`);
    console.log(`      Input mint: ${tx.input?.mint?.substring(0, 12)}...`);
    console.log(`      Output mint: ${tx.output?.mint?.substring(0, 12)}...`);
    console.log(`      Amounts: ${tx.input?.amount} -> ${tx.output?.amount}`);
  });
  
  // Check for wrong amounts
  console.log('\n🔍 Checking for Wrong Amount Calculations:');
  const suspiciousAmounts = await db.collection('whalealltransactionv2')
    .find({
      $or: [
        { 'input.amount': { $lt: 0 } },
        { 'output.amount': { $lt: 0 } },
        { 'input.amount': { $gt: 1000000000 } }, // Suspiciously large
        { 'output.amount': { $gt: 1000000000 } }
      ],
      timestamp: { $gte: Date.now() - 3600000 }
    })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();
    
  console.log(`Found ${suspiciousAmounts.length} transactions with suspicious amounts:`);
  suspiciousAmounts.forEach((tx, i) => {
    console.log(`  [${i+1}] ${tx.input?.symbol} -> ${tx.output?.symbol}`);
    console.log(`      Input: ${tx.input?.amount} (raw: ${tx.input?.amount_raw})`);
    console.log(`      Output: ${tx.output?.amount} (raw: ${tx.output?.amount_raw})`);
    console.log(`      Decimals: ${tx.input?.decimals} -> ${tx.output?.decimals}`);
  });
  
  // Check stable coin transactions
  console.log('\n🔍 Checking Stable Coin Transactions:');
  const stableCoinMints = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
  ];
  
  const stableCoinTransactions = await db.collection('whalealltransactionv2')
    .find({
      $or: [
        { 'input.mint': { $in: stableCoinMints } },
        { 'output.mint': { $in: stableCoinMints } }
      ],
      timestamp: { $gte: Date.now() - 3600000 }
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray();
    
  console.log(`Found ${stableCoinTransactions.length} stable coin transactions:`);
  stableCoinTransactions.forEach((tx, i) => {
    console.log(`  [${i+1}] ${tx.input?.symbol} -> ${tx.output?.symbol} | ${tx.side}`);
    console.log(`      Should this be split? Input: ${tx.input?.mint === tx.output?.mint ? 'SAME TOKEN!' : 'Different'}`);
  });
  
  await client.close();
  console.log('\n✅ Debug complete!');
}

debugParserIssues().catch(console.error);