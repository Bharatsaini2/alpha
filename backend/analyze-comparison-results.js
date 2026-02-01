require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function analyzeResults() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // Read the comparison report
    const report = require('./v1-v2-comparison-report.json');
    
    const startTime = new Date(report.testWindow.start);
    const endTime = new Date(report.testWindow.end);
    
    console.log('📊 Analysis Report');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Test Window: ${startTime.toISOString()} to ${endTime.toISOString()}`);
    console.log(`Duration: ${report.testWindow.durationMinutes.toFixed(2)} minutes\n`);
    
    // Get V1 transactions
    const v1Transactions = await db.collection('whalealltransactionv2').find({
      'transaction.timestamp': {
        $gte: startTime,
        $lte: endTime
      }
    }).toArray();
    
    console.log(`V1 Transactions: ${v1Transactions.length}`);
    console.log(`V2 Detections: ${report.v2.total}\n`);
    
    // Create CSV for V1 transactions
    const v1Csv = ['Signature,Timestamp,Type,Whale,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmount,OutputAmount,InputUSD,OutputUSD'];
    
    for (const tx of v1Transactions) {
      const row = [
        tx.signature || '',
        tx.transaction?.timestamp || tx.timestamp || '',
        tx.type || '',
        tx.whale?.address || tx.whaleAddress || '',
        tx.transaction?.tokenIn?.address || tx.tokenInAddress || '',
        tx.transaction?.tokenOut?.address || tx.tokenOutAddress || '',
        tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || '',
        tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || '',
        tx.transaction?.tokenIn?.amount || tx.tokenAmount?.sellTokenAmount || '',
        tx.transaction?.tokenOut?.amount || tx.tokenAmount?.buyTokenAmount || '',
        tx.transaction?.tokenIn?.usdAmount || tx.amount?.sellAmount || '',
        tx.transaction?.tokenOut?.usdAmount || tx.amount?.buyAmount || ''
      ];
      v1Csv.push(row.join(','));
    }
    
    fs.writeFileSync('v1-transactions.csv', v1Csv.join('\n'));
    console.log('✅ V1 transactions exported to: v1-transactions.csv');
    
    // Create CSV for V2 detections
    const v2Csv = ['Signature,Timestamp,Side,Whale,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmountRaw,OutputAmountRaw,InputAmountNormalized,OutputAmountNormalized,Confidence,Source'];
    
    for (const detection of report.v2.detections) {
      const row = [
        detection.signature || '',
        detection.timestamp || '',
        detection.side || '',
        detection.whaleAddress || '',
        detection.inputMint || '',
        detection.outputMint || '',
        detection.inputToken || '',
        detection.outputToken || '',
        detection.inputAmount || '',
        detection.outputAmount || '',
        detection.inputAmountNormalized || '',
        detection.outputAmountNormalized || '',
        detection.confidence || '',
        detection.source || ''
      ];
      v2Csv.push(row.join(','));
    }
    
    fs.writeFileSync('v2-detections.csv', v2Csv.join('\n'));
    console.log('✅ V2 detections exported to: v2-detections.csv\n');
    
    // Analyze V2 detections
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('V2 DETECTION ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Group by confidence
    const byConfidence = {};
    for (const d of report.v2.detections) {
      byConfidence[d.confidence] = (byConfidence[d.confidence] || 0) + 1;
    }
    
    console.log('By Confidence Level:');
    for (const [conf, count] of Object.entries(byConfidence).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / report.v2.total) * 100).toFixed(1);
      console.log(`  ${conf}: ${count} (${pct}%)`);
    }
    console.log('');
    
    // Group by source
    const bySource = {};
    for (const d of report.v2.detections) {
      bySource[d.source] = (bySource[d.source] || 0) + 1;
    }
    
    console.log('By Classification Source:');
    for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / report.v2.total) * 100).toFixed(1);
      console.log(`  ${source}: ${count} (${pct}%)`);
    }
    console.log('');
    
    // Group by side
    const bySide = {};
    for (const d of report.v2.detections) {
      bySide[d.side] = (bySide[d.side] || 0) + 1;
    }
    
    console.log('By Transaction Side:');
    for (const [side, count] of Object.entries(bySide).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / report.v2.total) * 100).toFixed(1);
      console.log(`  ${side}: ${count} (${pct}%)`);
    }
    console.log('');
    
    // Find unique whales
    const uniqueWhales = new Set(report.v2.detections.map(d => d.whaleAddress));
    console.log(`Unique Whale Addresses: ${uniqueWhales.size}`);
    
    // Top whales by transaction count
    const whaleCount = {};
    for (const d of report.v2.detections) {
      whaleCount[d.whaleAddress] = (whaleCount[d.whaleAddress] || 0) + 1;
    }
    
    const topWhales = Object.entries(whaleCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log('\nTop 10 Most Active Whales:');
    topWhales.forEach(([whale, count], i) => {
      console.log(`  ${i + 1}. ${whale.substring(0, 8)}... : ${count} transactions`);
    });
    console.log('');
    
    // Create matches analysis
    const v1Sigs = new Set(v1Transactions.map(tx => tx.signature).filter(Boolean));
    const v2Sigs = new Set(report.v2.detections.map(d => d.signature));
    
    const matches = [];
    const v1Only = [];
    const v2Only = [];
    
    for (const tx of v1Transactions) {
      if (tx.signature) {
        if (v2Sigs.has(tx.signature)) {
          const v2Detection = report.v2.detections.find(d => d.signature === tx.signature);
          matches.push({ v1: tx, v2: v2Detection });
        } else {
          v1Only.push(tx);
        }
      }
    }
    
    for (const detection of report.v2.detections) {
      if (!v1Sigs.has(detection.signature)) {
        v2Only.push(detection);
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('COMPARISON SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total Matches: ${matches.length}`);
    console.log(`V1 Only (V2 missed): ${v1Only.length}`);
    console.log(`V2 Only (V1 missed): ${v2Only.length}\n`);
    
    if (matches.length > 0) {
      console.log(`V2 Coverage: ${((matches.length / v1Transactions.length) * 100).toFixed(1)}%`);
    }
    
    console.log(`V2 Additional Detections: ${v2Only.length} (${((v2Only.length / report.v2.total) * 100).toFixed(1)}% of V2 total)\n`);
    
    // Export matches
    if (matches.length > 0) {
      const matchesCsv = ['Signature,V1_Type,V2_Side,V1_InputSymbol,V1_OutputSymbol,V2_InputSymbol,V2_OutputSymbol,V1_InputAmount,V1_OutputAmount,V2_InputAmountNormalized,V2_OutputAmountNormalized,V2_Confidence'];
      
      for (const match of matches) {
        const row = [
          match.v1.signature,
          match.v1.type || '',
          match.v2.side || '',
          match.v1.transaction?.tokenIn?.symbol || match.v1.tokenInSymbol || '',
          match.v1.transaction?.tokenOut?.symbol || match.v1.tokenOutSymbol || '',
          match.v2.inputToken || '',
          match.v2.outputToken || '',
          match.v1.transaction?.tokenIn?.amount || match.v1.tokenAmount?.sellTokenAmount || '',
          match.v1.transaction?.tokenOut?.amount || match.v1.tokenAmount?.buyTokenAmount || '',
          match.v2.inputAmountNormalized || '',
          match.v2.outputAmountNormalized || '',
          match.v2.confidence || ''
        ];
        matchesCsv.push(row.join(','));
      }
      
      fs.writeFileSync('matches.csv', matchesCsv.join('\n'));
      console.log('✅ Matches exported to: matches.csv');
    }
    
    // Export V1 only (V2 missed)
    if (v1Only.length > 0) {
      const v1OnlyCsv = ['Signature,Type,Whale,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmount,OutputAmount'];
      
      for (const tx of v1Only) {
        const row = [
          tx.signature,
          tx.type || '',
          tx.whale?.address || tx.whaleAddress || '',
          tx.transaction?.tokenIn?.address || tx.tokenInAddress || '',
          tx.transaction?.tokenOut?.address || tx.tokenOutAddress || '',
          tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || '',
          tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || '',
          tx.transaction?.tokenIn?.amount || tx.tokenAmount?.sellTokenAmount || '',
          tx.transaction?.tokenOut?.amount || tx.tokenAmount?.buyTokenAmount || ''
        ];
        v1OnlyCsv.push(row.join(','));
      }
      
      fs.writeFileSync('v1-only-v2-missed.csv', v1OnlyCsv.join('\n'));
      console.log('✅ V1 only (V2 missed) exported to: v1-only-v2-missed.csv');
    }
    
    // Export V2 only (first 100 for manual review)
    if (v2Only.length > 0) {
      const v2OnlyCsv = ['Signature,Side,Whale,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmountNormalized,OutputAmountNormalized,Confidence,Source'];
      
      for (const detection of v2Only.slice(0, 100)) {
        const row = [
          detection.signature,
          detection.side || '',
          detection.whaleAddress || '',
          detection.inputMint || '',
          detection.outputMint || '',
          detection.inputToken || '',
          detection.outputToken || '',
          detection.inputAmountNormalized || '',
          detection.outputAmountNormalized || '',
          detection.confidence || '',
          detection.source || ''
        ];
        v2OnlyCsv.push(row.join(','));
      }
      
      fs.writeFileSync('v2-only-sample-100.csv', v2OnlyCsv.join('\n'));
      console.log('✅ V2 only (first 100) exported to: v2-only-sample-100.csv');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ANALYSIS COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Files created:');
    console.log('  1. v1-transactions.csv - All V1 transactions');
    console.log('  2. v2-detections.csv - All V2 detections');
    if (matches.length > 0) {
      console.log('  3. matches.csv - Transactions detected by both');
    }
    if (v1Only.length > 0) {
      console.log('  4. v1-only-v2-missed.csv - Transactions V2 missed');
    }
    if (v2Only.length > 0) {
      console.log('  5. v2-only-sample-100.csv - Sample of V2 extras (first 100)');
    }
    console.log('  6. v1-v2-comparison-report.json - Full JSON report\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

analyzeResults();
