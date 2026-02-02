/**
 * Analyze KOL V1 vs V2 Comparison Results
 * 
 * This script analyzes the KOL comparison results and generates detailed CSV reports
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function analyzeKolResults() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // Read the KOL comparison report
    const report = require('./v1-v2-kol-comparison-report.json');
    
    const startTime = new Date(report.testWindow.start);
    const endTime = new Date(report.testWindow.end);
    
    console.log('📊 KOL Analysis Report');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Test Window: ${startTime.toISOString()} to ${endTime.toISOString()}`);
    console.log(`Duration: ${report.testWindow.durationMinutes.toFixed(2)} minutes\n`);
    
    // Get V1 KOL transactions
    const v1KolTransactions = await db.collection('influencerwhaletransactionsv2').find({
      'transaction.timestamp': {
        $gte: startTime,
        $lte: endTime
      }
    }).toArray();
    
    console.log(`V1 KOL Transactions: ${v1KolTransactions.length}`);
    console.log(`V2 KOL Detections: ${report.v2Kol.total}\n`);
    
    // Create CSV for V1 KOL transactions
    const v1KolCsv = ['Signature,Timestamp,Type,KOL_Address,Influencer_Name,Influencer_Username,Followers,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmount,OutputAmount,InputUSD,OutputUSD,HotnessScore'];
    
    for (const tx of v1KolTransactions) {
      const row = [
        tx.signature || '',
        tx.transaction?.timestamp || tx.timestamp || '',
        tx.type || '',
        tx.whaleAddress || '',
        tx.influencerName || '',
        tx.influencerUsername || '',
        tx.influencerFollowerCount || '',
        tx.transaction?.tokenIn?.address || tx.tokenInAddress || '',
        tx.transaction?.tokenOut?.address || tx.tokenOutAddress || '',
        tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || '',
        tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || '',
        tx.transaction?.tokenIn?.amount || tx.tokenAmount?.sellTokenAmount || '',
        tx.transaction?.tokenOut?.amount || tx.tokenAmount?.buyTokenAmount || '',
        tx.transaction?.tokenIn?.usdAmount || tx.amount?.sellAmount || '',
        tx.transaction?.tokenOut?.usdAmount || tx.amount?.buyAmount || '',
        tx.hotnessScore || ''
      ];
      v1KolCsv.push(row.join(','));
    }
    
    fs.writeFileSync('v1-kol-transactions.csv', v1KolCsv.join('\n'));
    console.log('✅ V1 KOL transactions exported to: v1-kol-transactions.csv');
    
    // Create CSV for V2 KOL detections
    const v2KolCsv = ['Signature,Timestamp,Side,KOL_Address,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmountRaw,OutputAmountRaw,InputAmountNormalized,OutputAmountNormalized,Confidence,Source'];
    
    for (const detection of report.v2Kol.detections) {
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
      v2KolCsv.push(row.join(','));
    }
    
    fs.writeFileSync('v2-kol-detections.csv', v2KolCsv.join('\n'));
    console.log('✅ V2 KOL detections exported to: v2-kol-detections.csv\n');
    
    // Analyze V2 KOL detections
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('V2 KOL DETECTION ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Group by confidence
    const byConfidence = {};
    for (const d of report.v2Kol.detections) {
      byConfidence[d.confidence] = (byConfidence[d.confidence] || 0) + 1;
    }
    
    console.log('By Confidence Level:');
    for (const [conf, count] of Object.entries(byConfidence).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / report.v2Kol.total) * 100).toFixed(1);
      console.log(`  ${conf}: ${count} (${pct}%)`);
    }
    console.log('');
    
    // Group by source
    const bySource = {};
    for (const d of report.v2Kol.detections) {
      bySource[d.source] = (bySource[d.source] || 0) + 1;
    }
    
    console.log('By Classification Source:');
    for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / report.v2Kol.total) * 100).toFixed(1);
      console.log(`  ${source}: ${count} (${pct}%)`);
    }
    console.log('');
    
    // Group by side
    const bySide = {};
    for (const d of report.v2Kol.detections) {
      bySide[d.side] = (bySide[d.side] || 0) + 1;
    }
    
    console.log('By Transaction Side:');
    for (const [side, count] of Object.entries(bySide).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / report.v2Kol.total) * 100).toFixed(1);
      console.log(`  ${side}: ${count} (${pct}%)`);
    }
    console.log('');
    
    // Find unique KOL addresses
    const uniqueKols = new Set(report.v2Kol.detections.map(d => d.whaleAddress));
    console.log(`Unique KOL Addresses: ${uniqueKols.size}`);
    
    // Top KOLs by transaction count
    const kolCount = {};
    for (const d of report.v2Kol.detections) {
      kolCount[d.whaleAddress] = (kolCount[d.whaleAddress] || 0) + 1;
    }
    
    const topKols = Object.entries(kolCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log('\nTop 10 Most Active KOLs:');
    topKols.forEach(([kol, count], i) => {
      console.log(`  ${i + 1}. ${kol.substring(0, 8)}... : ${count} transactions`);
    });
    console.log('');
    
    // Create matches analysis
    const v1Sigs = new Set(v1KolTransactions.map(tx => tx.signature).filter(Boolean));
    const v2Sigs = new Set(report.v2Kol.detections.map(d => d.signature));
    
    const matches = [];
    const v1Only = [];
    const v2Only = [];
    
    for (const tx of v1KolTransactions) {
      if (tx.signature) {
        if (v2Sigs.has(tx.signature)) {
          const v2Detection = report.v2Kol.detections.find(d => d.signature === tx.signature);
          matches.push({ v1: tx, v2: v2Detection });
        } else {
          v1Only.push(tx);
        }
      }
    }
    
    for (const detection of report.v2Kol.detections) {
      if (!v1Sigs.has(detection.signature)) {
        v2Only.push(detection);
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('KOL COMPARISON SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total KOL Matches: ${matches.length}`);
    console.log(`V1 KOL Only (V2 missed): ${v1Only.length}`);
    console.log(`V2 KOL Only (V1 missed): ${v2Only.length}\n`);
    
    if (matches.length > 0) {
      console.log(`V2 KOL Coverage: ${((matches.length / v1KolTransactions.length) * 100).toFixed(1)}%`);
    }
    
    console.log(`V2 Additional KOL Detections: ${v2Only.length} (${((v2Only.length / report.v2Kol.total) * 100).toFixed(1)}% of V2 total)\n`);
    
    // Export KOL matches
    if (matches.length > 0) {
      const kolMatchesCsv = ['Signature,V1_Type,V2_Side,V1_InputSymbol,V1_OutputSymbol,V2_InputSymbol,V2_OutputSymbol,V1_InputAmount,V1_OutputAmount,V2_InputAmountNormalized,V2_OutputAmountNormalized,V2_Confidence,Influencer_Name,Influencer_Username,Followers,HotnessScore'];
      
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
          match.v2.confidence || '',
          match.v1.influencerName || '',
          match.v1.influencerUsername || '',
          match.v1.influencerFollowerCount || '',
          match.v1.hotnessScore || ''
        ];
        kolMatchesCsv.push(row.join(','));
      }
      
      fs.writeFileSync('kol-matches.csv', kolMatchesCsv.join('\n'));
      console.log('✅ KOL matches exported to: kol-matches.csv');
    }
    
    // Export V1 KOL only (V2 missed)
    if (v1Only.length > 0) {
      const v1KolOnlyCsv = ['Signature,Type,KOL_Address,Influencer_Name,Influencer_Username,Followers,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmount,OutputAmount,HotnessScore'];
      
      for (const tx of v1Only) {
        const row = [
          tx.signature,
          tx.type || '',
          tx.whaleAddress || '',
          tx.influencerName || '',
          tx.influencerUsername || '',
          tx.influencerFollowerCount || '',
          tx.transaction?.tokenIn?.address || tx.tokenInAddress || '',
          tx.transaction?.tokenOut?.address || tx.tokenOutAddress || '',
          tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || '',
          tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || '',
          tx.transaction?.tokenIn?.amount || tx.tokenAmount?.sellTokenAmount || '',
          tx.transaction?.tokenOut?.amount || tx.tokenAmount?.buyTokenAmount || '',
          tx.hotnessScore || ''
        ];
        v1KolOnlyCsv.push(row.join(','));
      }
      
      fs.writeFileSync('v1-kol-only-v2-missed.csv', v1KolOnlyCsv.join('\n'));
      console.log('✅ V1 KOL only (V2 missed) exported to: v1-kol-only-v2-missed.csv');
    }
    
    // Export V2 KOL only (first 100 for manual review)
    if (v2Only.length > 0) {
      const v2KolOnlyCsv = ['Signature,Side,KOL_Address,InputMint,OutputMint,InputSymbol,OutputSymbol,InputAmountNormalized,OutputAmountNormalized,Confidence,Source'];
      
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
        v2KolOnlyCsv.push(row.join(','));
      }
      
      fs.writeFileSync('v2-kol-only-sample-100.csv', v2KolOnlyCsv.join('\n'));
      console.log('✅ V2 KOL only (first 100) exported to: v2-kol-only-sample-100.csv');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('KOL ANALYSIS COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('KOL Files created:');
    console.log('  1. v1-kol-transactions.csv - All V1 KOL transactions');
    console.log('  2. v2-kol-detections.csv - All V2 KOL detections');
    if (matches.length > 0) {
      console.log('  3. kol-matches.csv - KOL transactions detected by both');
    }
    if (v1Only.length > 0) {
      console.log('  4. v1-kol-only-v2-missed.csv - KOL transactions V2 missed');
    }
    if (v2Only.length > 0) {
      console.log('  5. v2-kol-only-sample-100.csv - Sample of V2 KOL extras (first 100)');
    }
    console.log('  6. v1-v2-kol-comparison-report.json - Full KOL JSON report\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

analyzeKolResults();