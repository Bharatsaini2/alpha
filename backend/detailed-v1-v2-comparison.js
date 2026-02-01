require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function detailedComparison() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // Read the comparison report
    const report = require('./v1-v2-comparison-report.json');
    
    const startTime = new Date(report.testWindow.start);
    const endTime = new Date(report.testWindow.end);
    
    console.log('📊 Test Window:');
    console.log(`Start: ${startTime.toISOString()}`);
    console.log(`End: ${endTime.toISOString()}\n`);
    
    // Get V1 transactions from database
    const v1Transactions = await db.collection('whalealltransactionv2').find({
      'transaction.timestamp': {
        $gte: startTime,
        $lte: endTime
      }
    }).toArray();
    
    console.log(`V1 Transactions in DB: ${v1Transactions.length}`);
    console.log(`V2 Transactions detected: ${report.v2.total}\n`);
    
    // Create maps for easy lookup
    const v1Map = new Map();
    const v2Map = new Map();
    
    // Process V1 transactions
    for (const tx of v1Transactions) {
      if (tx.signature) {
        v1Map.set(tx.signature, {
          signature: tx.signature,
          timestamp: tx.transaction?.timestamp || tx.timestamp,
          type: tx.type,
          whaleAddress: tx.whale?.address || tx.whaleAddress,
          inputMint: tx.transaction?.tokenIn?.address || tx.tokenInAddress,
          outputMint: tx.transaction?.tokenOut?.address || tx.tokenOutAddress,
          inputSymbol: tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol,
          outputSymbol: tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol,
          inputAmount: tx.transaction?.tokenIn?.amount || tx.tokenAmount?.sellTokenAmount,
          outputAmount: tx.transaction?.tokenOut?.amount || tx.tokenAmount?.buyTokenAmount,
          inputUSD: tx.transaction?.tokenIn?.usdAmount || tx.amount?.sellAmount,
          outputUSD: tx.transaction?.tokenOut?.usdAmount || tx.amount?.buyAmount,
        });
      }
    }
    
    // Process V2 detections
    for (const detection of report.v2.detections) {
      v2Map.set(detection.signature, {
        signature: detection.signature,
        timestamp: detection.timestamp,
        side: detection.side,
        inputToken: detection.inputToken,
        outputToken: detection.outputToken,
        inputAmount: detection.inputAmount,
        outputAmount: detection.outputAmount,
        confidence: detection.confidence,
        source: detection.source
      });
    }
    
    // Find matches and differences
    const matches = [];
    const v1Only = [];
    const v2Only = [];
    
    for (const [sig, v1Data] of v1Map) {
      if (v2Map.has(sig)) {
        matches.push({ v1: v1Data, v2: v2Map.get(sig) });
      } else {
        v1Only.push(v1Data);
      }
    }
    
    for (const [sig, v2Data] of v2Map) {
      if (!v1Map.has(sig)) {
        v2Only.push(v2Data);
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('MATCHES (Both V1 and V2 detected):');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total Matches: ${matches.length}\n`);
    
    matches.forEach((match, i) => {
      console.log(`${i + 1}. Signature: ${match.v1.signature}`);
      console.log(`   Timestamp: ${match.v1.timestamp}`);
      console.log(`   Whale: ${match.v1.whaleAddress}`);
      console.log(`   V1: ${match.v1.type} | ${match.v1.inputSymbol} → ${match.v1.outputSymbol}`);
      console.log(`       Input:  ${match.v1.inputMint?.substring(0, 8)}... | Amount: ${match.v1.inputAmount} | USD: $${match.v1.inputUSD}`);
      console.log(`       Output: ${match.v1.outputMint?.substring(0, 8)}... | Amount: ${match.v1.outputAmount} | USD: $${match.v1.outputUSD}`);
      console.log(`   V2: ${match.v2.side} | ${match.v2.inputToken} → ${match.v2.outputToken}`);
      console.log(`       Input Amount:  ${match.v2.inputAmount}`);
      console.log(`       Output Amount: ${match.v2.outputAmount}`);
      console.log(`       Confidence: ${match.v2.confidence} | Source: ${match.v2.source}`);
      console.log('');
    });
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('V1 ONLY (V2 missed these):');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total V1 Only: ${v1Only.length}\n`);
    
    v1Only.forEach((tx, i) => {
      console.log(`${i + 1}. Signature: ${tx.signature}`);
      console.log(`   Timestamp: ${tx.timestamp}`);
      console.log(`   Whale: ${tx.whaleAddress}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   ${tx.inputSymbol} → ${tx.outputSymbol}`);
      console.log(`   Input:  ${tx.inputMint?.substring(0, 8)}... | Amount: ${tx.inputAmount} | USD: $${tx.inputUSD}`);
      console.log(`   Output: ${tx.outputMint?.substring(0, 8)}... | Amount: ${tx.outputAmount} | USD: $${tx.outputUSD}`);
      console.log('');
    });
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('V2 ONLY (V2 found these, V1 missed):');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total V2 Only: ${v2Only.length}\n`);
    console.log('Showing first 20 V2-only transactions:\n');
    
    v2Only.slice(0, 20).forEach((tx, i) => {
      console.log(`${i + 1}. Signature: ${tx.signature}`);
      console.log(`   Timestamp: ${tx.timestamp}`);
      console.log(`   Side: ${tx.side}`);
      console.log(`   ${tx.inputToken} → ${tx.outputToken}`);
      console.log(`   Input Amount:  ${tx.inputAmount}`);
      console.log(`   Output Amount: ${tx.outputAmount}`);
      console.log(`   Confidence: ${tx.confidence} | Source: ${tx.source}`);
      console.log('');
    });
    
    if (v2Only.length > 20) {
      console.log(`... and ${v2Only.length - 20} more V2-only transactions\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('FINAL SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`V1 Total: ${v1Transactions.length}`);
    console.log(`V2 Total: ${report.v2.total}`);
    console.log(`Matches: ${matches.length}`);
    console.log(`V1 Only (V2 missed): ${v1Only.length}`);
    console.log(`V2 Only (V1 missed): ${v2Only.length}`);
    console.log('');
    
    const v2Coverage = v1Transactions.length > 0 
      ? ((matches.length / v1Transactions.length) * 100).toFixed(1)
      : 0;
    console.log(`V2 Coverage of V1: ${v2Coverage}% (${matches.length}/${v1Transactions.length})`);
    console.log(`V2 Additional Detections: ${v2Only.length} (${((v2Only.length / report.v2.total) * 100).toFixed(1)}% of V2 total)`);
    
    if (matches.length === v1Transactions.length) {
      console.log('\n✅ V2 detected ALL V1 transactions!');
    } else {
      console.log(`\n⚠️  V2 missed ${v1Only.length} V1 transactions`);
    }
    
    console.log(`\n📈 V2 is ${(report.v2.total / v1Transactions.length).toFixed(1)}x more comprehensive than V1`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

detailedComparison();
