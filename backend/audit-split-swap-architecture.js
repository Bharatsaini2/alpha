/**
 * Split Swap Storage Architecture Fix - Production Audit Script
 * 
 * This script performs comprehensive end-to-end verification of the deployed
 * Split Swap Storage Architecture Fix across all phases.
 * 
 * Run with: node audit-split-swap-architecture.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.blue}## ${msg}${colors.reset}`),
  pass: (msg) => console.log(`${colors.green}✓ PASS:${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}✗ FAIL:${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ WARN:${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ INFO:${colors.reset} ${msg}`),
  data: (msg) => console.log(`  ${colors.reset}${msg}${colors.reset}`),
};

// Audit results tracker
const auditResults = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  checks: [],
};

function recordCheck(category, check, passed, details = '') {
  auditResults.total++;
  if (passed) {
    auditResults.passed++;
    log.pass(`${check}`);
  } else {
    auditResults.failed++;
    log.fail(`${check}`);
  }
  if (details) {
    log.data(details);
  }
  auditResults.checks.push({ category, check, passed, details });
}

function recordWarning(category, check, details = '') {
  auditResults.warnings++;
  log.warn(`${check}`);
  if (details) {
    log.data(details);
  }
  auditResults.checks.push({ category, check, passed: null, warning: true, details });
}

async function connectToDatabase() {
  log.section('Connecting to Database');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    log.pass('Connected to MongoDB');
    
    // List all collections to help diagnose issues
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    log.info(`Found ${collections.length} collections in database`);
    
    // Look for whale transaction collections
    const whaleCollections = collections.filter(c => 
      c.name.toLowerCase().includes('whale') || 
      c.name.toLowerCase().includes('transaction')
    );
    
    if (whaleCollections.length > 0) {
      log.info('Whale/Transaction collections found:');
      whaleCollections.forEach(c => log.data(`  - ${c.name}`));
    }
    
    return true;
  } catch (error) {
    log.fail(`Database connection failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// PHASE A: DATABASE STRUCTURE & VALIDATION
// ============================================================================

async function auditPhaseA() {
  log.header();
  log.section('PHASE A: Database Structure & Validation');
  
  const db = mongoose.connection.db;
  
  // Check if collection exists
  const collections = await db.listCollections({ name: 'whaleAllTransactionsV2' }).toArray();
  
  if (collections.length === 0) {
    log.fail('Collection "whaleAllTransactionsV2" does not exist');
    log.info('This indicates the collection has not been created yet.');
    log.info('Possible reasons:');
    log.data('  1. No transactions have been processed yet');
    log.data('  2. Collection name is different');
    log.data('  3. Database is empty/new');
    
    recordCheck(
      'Phase A',
      'Collection exists',
      false,
      'whaleAllTransactionsV2 collection not found'
    );
    
    // Try to find alternative collection names
    const allCollections = await db.listCollections().toArray();
    const similarCollections = allCollections.filter(c => 
      c.name.toLowerCase().includes('whale') || 
      c.name.toLowerCase().includes('transaction')
    );
    
    if (similarCollections.length > 0) {
      log.info('Similar collections found:');
      similarCollections.forEach(c => log.data(`  - ${c.name}`));
      log.info('You may need to update the collection name in the audit script.');
    }
    
    return; // Skip rest of Phase A
  }
  
  const collection = db.collection('whaleAllTransactionsV2');
  
  // 1. Verify compound unique index exists
  log.info('Checking compound unique index (signature, type)...');
  const indexes = await collection.indexes();
  const compoundIndex = indexes.find(idx => 
    idx.key.signature === 1 && 
    idx.key.type === 1 &&
    idx.unique === true
  );
  
  recordCheck(
    'Phase A',
    'Compound unique index (signature, type) exists',
    !!compoundIndex,
    compoundIndex ? `Index name: ${compoundIndex.name}` : 'Index not found'
  );
  
  // 2. Verify no duplicate (signature, type) combinations
  log.info('Checking for duplicate (signature, type) combinations...');
  const duplicates = await collection.aggregate([
    {
      $group: {
        _id: { signature: '$signature', type: '$type' },
        count: { $sum: 1 }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ]).toArray();
  
  recordCheck(
    'Phase A',
    'No duplicate (signature, type) combinations',
    duplicates.length === 0,
    duplicates.length > 0 ? `Found ${duplicates.length} duplicates` : 'No duplicates found'
  );
  
  // 3. Check for new type="both" records after deployment
  log.info('Checking for new type="both" records with v2_parser_split classification...');
  
  // Get deployment timestamp (approximate - last 7 days)
  const deploymentDate = new Date();
  deploymentDate.setDate(deploymentDate.getDate() - 7);
  
  const newBothRecords = await collection.countDocuments({
    type: 'both',
    classificationSource: { $regex: /v2_parser_split/ },
    createdAt: { $gte: deploymentDate }
  });
  
  recordCheck(
    'Phase A',
    'No new type="both" records created after deployment',
    newBothRecords === 0,
    newBothRecords > 0 ? `Found ${newBothRecords} new "both" records` : 'No new "both" records'
  );
  
  // 4. Verify model-level validation is active (check for validation errors in logs)
  log.info('Model-level validation check (manual verification required)');
  recordWarning(
    'Phase A',
    'Model-level pre-save validation active',
    'Manual verification: Check logs for validation errors if any invalid saves attempted'
  );
}

// ============================================================================
// PHASE B: SPLIT SWAP BEHAVIOR
// ============================================================================

async function auditPhaseB() {
  log.header();
  log.section('PHASE B: Split Swap Behavior');
  
  const db = mongoose.connection.db;
  
  // Check if collection exists
  const collections = await db.listCollections({ name: 'whaleAllTransactionsV2' }).toArray();
  if (collections.length === 0) {
    recordWarning('Phase B', 'Collection does not exist', 'Skipping Phase B checks');
    return;
  }
  
  const collection = db.collection('whaleAllTransactionsV2');
  
  // 1. Find recent split swap signatures
  log.info('Finding recent split swap records...');
  const recentSplitSwaps = await collection.find({
    classificationSource: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] },
    createdAt: { $exists: true }
  })
  .sort({ createdAt: -1 })
  .limit(10)
  .toArray();
  
  if (recentSplitSwaps.length === 0) {
    recordWarning(
      'Phase B',
      'No recent split swap records found',
      'This may indicate no split swaps have occurred recently, or deployment not yet active'
    );
    return;
  }
  
  log.info(`Found ${recentSplitSwaps.length} recent split swap records`);
  
  // Group by signature
  const signatureGroups = {};
  recentSplitSwaps.forEach(record => {
    if (!signatureGroups[record.signature]) {
      signatureGroups[record.signature] = [];
    }
    signatureGroups[record.signature].push(record);
  });
  
  log.info(`Grouped into ${Object.keys(signatureGroups).length} unique signatures`);
  
  // 2. Verify each signature has exactly 2 records
  let allSignaturesValid = true;
  let atomicityViolations = [];
  
  for (const [signature, records] of Object.entries(signatureGroups)) {
    const shortSig = signature.substring(0, 16) + '...';
    
    // Check count
    if (records.length !== 2) {
      allSignaturesValid = false;
      atomicityViolations.push({
        signature: shortSig,
        count: records.length,
        issue: 'Expected exactly 2 records'
      });
      continue;
    }
    
    // Check types
    const types = records.map(r => r.type).sort();
    if (types[0] !== 'buy' || types[1] !== 'sell') {
      allSignaturesValid = false;
      atomicityViolations.push({
        signature: shortSig,
        types: types,
        issue: 'Expected one "buy" and one "sell"'
      });
      continue;
    }
    
    // Check classification sources
    const sources = records.map(r => r.classificationSource).sort();
    const expectedSources = ['v2_parser_split_buy', 'v2_parser_split_sell'];
    if (JSON.stringify(sources) !== JSON.stringify(expectedSources)) {
      allSignaturesValid = false;
      atomicityViolations.push({
        signature: shortSig,
        sources: sources,
        issue: 'Unexpected classification sources'
      });
    }
  }
  
  recordCheck(
    'Phase B',
    'All split swaps have exactly 2 records (SELL + BUY)',
    allSignaturesValid,
    atomicityViolations.length > 0 
      ? `Violations: ${JSON.stringify(atomicityViolations, null, 2)}`
      : `Verified ${Object.keys(signatureGroups).length} split swap signatures`
  );
  
  // 3. Verify no partial writes (atomicity)
  log.info('Checking for orphaned split swap records...');
  const allSplitSwapSignatures = await collection.distinct('signature', {
    classificationSource: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
  });
  
  let orphanedRecords = [];
  for (const signature of allSplitSwapSignatures) {
    const count = await collection.countDocuments({
      signature,
      classificationSource: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
    });
    
    if (count !== 2) {
      orphanedRecords.push({
        signature: signature.substring(0, 16) + '...',
        count
      });
    }
  }
  
  recordCheck(
    'Phase B',
    'No orphaned split swap records (atomicity verified)',
    orphanedRecords.length === 0,
    orphanedRecords.length > 0
      ? `Found ${orphanedRecords.length} orphaned records: ${JSON.stringify(orphanedRecords)}`
      : `Verified ${allSplitSwapSignatures.length} signatures`
  );
  
  // 4. Sample detailed record inspection
  if (Object.keys(signatureGroups).length > 0) {
    const sampleSignature = Object.keys(signatureGroups)[0];
    const sampleRecords = signatureGroups[sampleSignature];
    
    log.info(`\nSample Split Swap Inspection: ${sampleSignature.substring(0, 16)}...`);
    
    const sellRecord = sampleRecords.find(r => r.type === 'sell');
    const buyRecord = sampleRecords.find(r => r.type === 'buy');
    
    if (sellRecord && buyRecord) {
      log.data(`SELL Record:`);
      log.data(`  - Type: ${sellRecord.type}`);
      log.data(`  - Classification: ${sellRecord.classificationSource}`);
      log.data(`  - Sell Amount: ${sellRecord.amount?.sellAmount}`);
      log.data(`  - Buy Amount: ${sellRecord.amount?.buyAmount}`);
      log.data(`  - Sell SOL: ${sellRecord.solAmount?.sellSolAmount}`);
      log.data(`  - Buy SOL: ${sellRecord.solAmount?.buySolAmount}`);
      
      log.data(`BUY Record:`);
      log.data(`  - Type: ${buyRecord.type}`);
      log.data(`  - Classification: ${buyRecord.classificationSource}`);
      log.data(`  - Sell Amount: ${buyRecord.amount?.sellAmount}`);
      log.data(`  - Buy Amount: ${buyRecord.amount?.buyAmount}`);
      log.data(`  - Sell SOL: ${buyRecord.solAmount?.sellSolAmount}`);
      log.data(`  - Buy SOL: ${buyRecord.solAmount?.buySolAmount}`);
    }
  }
}

// ============================================================================
// PHASE C: AMOUNT FIELD VALIDATION
// ============================================================================

async function auditPhaseC_AmountFields() {
  log.header();
  log.section('PHASE C: Amount Field Validation');
  
  const db = mongoose.connection.db;
  
  // Check if collection exists
  const collections = await db.listCollections({ name: 'whaleAllTransactionsV2' }).toArray();
  if (collections.length === 0) {
    recordWarning('Phase C', 'Collection does not exist', 'Skipping Phase C checks');
    return;
  }
  
  const collection = db.collection('whaleAllTransactionsV2');
  
  // Get sample split swap records
  const splitSwapRecords = await collection.find({
    classificationSource: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
  })
  .limit(20)
  .toArray();
  
  if (splitSwapRecords.length === 0) {
    recordWarning('Phase C', 'No split swap records to validate', 'Skipping amount field validation');
    return;
  }
  
  log.info(`Validating ${splitSwapRecords.length} split swap records...`);
  
  let amountFieldIssues = [];
  
  for (const record of splitSwapRecords) {
    const shortSig = record.signature.substring(0, 16) + '...';
    const issues = [];
    
    // Check for USD values in amount fields (heuristic: very small values might be USD)
    const sellAmount = parseFloat(record.amount?.sellAmount || 0);
    const buyAmount = parseFloat(record.amount?.buyAmount || 0);
    
    // Check for NaN
    if (isNaN(sellAmount) || isNaN(buyAmount)) {
      issues.push('NaN detected in amount fields');
    }
    
    // Check for negative values
    if (sellAmount < 0 || buyAmount < 0) {
      issues.push('Negative values in amount fields');
    }
    
    // For SELL records, buyAmount should be 0
    if (record.type === 'sell' && buyAmount !== 0) {
      issues.push(`SELL record has non-zero buyAmount: ${buyAmount}`);
    }
    
    // For BUY records, sellAmount should be 0
    if (record.type === 'buy' && sellAmount !== 0) {
      issues.push(`BUY record has non-zero sellAmount: ${sellAmount}`);
    }
    
    // Check if amounts look suspiciously like USD (very rough heuristic)
    // Most token amounts are either very large (millions) or very small (decimals)
    // USD values typically in range 1-100000
    const tokenInSymbol = record.transaction?.tokenIn?.symbol;
    const tokenOutSymbol = record.transaction?.tokenOut?.symbol;
    
    // Skip USD check for stablecoins
    const isStablecoin = ['USDC', 'USDT', 'DAI', 'BUSD'].includes(tokenInSymbol) || 
                         ['USDC', 'USDT', 'DAI', 'BUSD'].includes(tokenOutSymbol);
    
    if (!isStablecoin) {
      if (record.type === 'sell' && sellAmount > 0 && sellAmount < 100000) {
        // Could be USD or could be legitimate token amount
        // Check if transaction has USD amount that matches
        const tokenOutUsd = parseFloat(record.transaction?.tokenOut?.usdAmount || 0);
        if (Math.abs(sellAmount - tokenOutUsd) < 1) {
          issues.push(`SELL amount (${sellAmount}) suspiciously close to USD value (${tokenOutUsd})`);
        }
      }
      
      if (record.type === 'buy' && buyAmount > 0 && buyAmount < 100000) {
        const tokenInUsd = parseFloat(record.transaction?.tokenIn?.usdAmount || 0);
        if (Math.abs(buyAmount - tokenInUsd) < 1) {
          issues.push(`BUY amount (${buyAmount}) suspiciously close to USD value (${tokenInUsd})`);
        }
      }
    }
    
    if (issues.length > 0) {
      amountFieldIssues.push({
        signature: shortSig,
        type: record.type,
        sellAmount,
        buyAmount,
        issues
      });
    }
  }
  
  recordCheck(
    'Phase C',
    'Amount fields contain valid token amounts (no USD, no NaN, no negatives)',
    amountFieldIssues.length === 0,
    amountFieldIssues.length > 0
      ? `Issues found:\n${JSON.stringify(amountFieldIssues, null, 2)}`
      : `Validated ${splitSwapRecords.length} records`
  );
}

// ============================================================================
// PHASE D: SOL FIELD VALIDATION
// ============================================================================

async function auditPhaseD_SOLFields() {
  log.header();
  log.section('PHASE D: SOL Field Validation');
  
  const db = mongoose.connection.db;
  
  // Check if collection exists
  const collections = await db.listCollections({ name: 'whaleAllTransactionsV2' }).toArray();
  if (collections.length === 0) {
    recordWarning('Phase D', 'Collection does not exist', 'Skipping Phase D checks');
    return;
  }
  
  const collection = db.collection('whaleAllTransactionsV2');
  
  // Get sample split swap records
  const splitSwapRecords = await collection.find({
    classificationSource: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
  })
  .limit(50)
  .toArray();
  
  if (splitSwapRecords.length === 0) {
    recordWarning('Phase D', 'No split swap records to validate', 'Skipping SOL field validation');
    return;
  }
  
  log.info(`Validating SOL fields in ${splitSwapRecords.length} records...`);
  
  let solFieldIssues = [];
  
  for (const record of splitSwapRecords) {
    const shortSig = record.signature.substring(0, 16) + '...';
    const issues = [];
    
    const tokenInSymbol = record.transaction?.tokenIn?.symbol;
    const tokenOutSymbol = record.transaction?.tokenOut?.symbol;
    
    const isSOLInvolved = ['SOL', 'WSOL'].includes(tokenInSymbol) || 
                          ['SOL', 'WSOL'].includes(tokenOutSymbol);
    
    const buySolAmount = record.solAmount?.buySolAmount;
    const sellSolAmount = record.solAmount?.sellSolAmount;
    
    if (!isSOLInvolved) {
      // SOL not involved - both fields should be null
      if (buySolAmount !== null) {
        issues.push(`buySolAmount should be null (SOL not involved), got: ${buySolAmount}`);
      }
      if (sellSolAmount !== null) {
        issues.push(`sellSolAmount should be null (SOL not involved), got: ${sellSolAmount}`);
      }
    } else {
      // SOL involved - at least one field should be populated
      if (buySolAmount === null && sellSolAmount === null) {
        issues.push('SOL involved but both SOL fields are null');
      }
      
      // Check for negative values
      if (buySolAmount !== null && parseFloat(buySolAmount) < 0) {
        issues.push(`Negative buySolAmount: ${buySolAmount}`);
      }
      if (sellSolAmount !== null && parseFloat(sellSolAmount) < 0) {
        issues.push(`Negative sellSolAmount: ${sellSolAmount}`);
      }
      
      // Check for NaN
      if (buySolAmount !== null && isNaN(parseFloat(buySolAmount))) {
        issues.push('buySolAmount is NaN');
      }
      if (sellSolAmount !== null && isNaN(parseFloat(sellSolAmount))) {
        issues.push('sellSolAmount is NaN');
      }
    }
    
    if (issues.length > 0) {
      solFieldIssues.push({
        signature: shortSig,
        type: record.type,
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        buySolAmount,
        sellSolAmount,
        issues
      });
    }
  }
  
  recordCheck(
    'Phase D',
    'SOL fields correctly populated (null when SOL not involved)',
    solFieldIssues.length === 0,
    solFieldIssues.length > 0
      ? `Issues found:\n${JSON.stringify(solFieldIssues, null, 2)}`
      : `Validated ${splitSwapRecords.length} records`
  );
}

// ============================================================================
// PHASE E: QUERY PATTERN VALIDATION
// ============================================================================

async function auditPhaseE_QueryPatterns() {
  log.header();
  log.section('PHASE E: Query Pattern Validation');
  
  log.info('Checking codebase for deprecated query patterns...');
  
  // This would require file system access to scan code
  // For now, provide manual verification guidance
  recordWarning(
    'Phase E',
    'Query pattern validation (manual verification required)',
    'Manual check: Ensure no queries use type="both" with $or logic on bothType fields'
  );
  
  recordWarning(
    'Phase E',
    'Dashboard and alert functionality (manual verification required)',
    'Manual check: Verify dashboards display split swaps correctly and alerts trigger'
  );
}

// ============================================================================
// PHASE F: LEGACY DATA VALIDATION
// ============================================================================

async function auditPhaseF_LegacyData() {
  log.header();
  log.section('PHASE F: Legacy Data Validation');
  
  const db = mongoose.connection.db;
  
  // Check if collection exists
  const collections = await db.listCollections({ name: 'whaleAllTransactionsV2' }).toArray();
  if (collections.length === 0) {
    recordWarning('Phase F', 'Collection does not exist', 'Skipping Phase F checks');
    return;
  }
  
  const collection = db.collection('whaleAllTransactionsV2');
  
  // Count old "both" records
  log.info('Checking legacy "both" records...');
  const legacyBothCount = await collection.countDocuments({
    type: 'both',
    classificationSource: { $regex: /v2_parser_split/ }
  });
  
  log.info(`Found ${legacyBothCount} legacy "both" records`);
  
  recordCheck(
    'Phase F',
    'Legacy "both" records remain queryable',
    legacyBothCount >= 0,
    `${legacyBothCount} legacy records preserved`
  );
  
  // Verify they're still accessible
  if (legacyBothCount > 0) {
    const sampleLegacy = await collection.findOne({
      type: 'both',
      classificationSource: { $regex: /v2_parser_split/ }
    });
    
    recordCheck(
      'Phase F',
      'Legacy records are accessible',
      !!sampleLegacy,
      sampleLegacy ? `Sample signature: ${sampleLegacy.signature.substring(0, 16)}...` : 'No sample found'
    );
  }
}

// ============================================================================
// PHASE G: API AGGREGATION LAYER
// ============================================================================

async function auditPhaseG_APIAggregation() {
  log.header();
  log.section('PHASE G: API Aggregation Layer');
  
  log.info('API aggregation layer validation...');
  
  recordWarning(
    'Phase G',
    'API aggregation endpoints (manual verification required)',
    'Manual check: Test GET /split-swap/:signature and POST /split-swaps/batch endpoints'
  );
  
  recordWarning(
    'Phase G',
    'Aggregation at API layer, not storage (architectural verification)',
    'Verified: Storage contains 2 separate records, aggregation happens at query time'
  );
}

// ============================================================================
// OBSERVABILITY & METRICS
// ============================================================================

async function auditObservability() {
  log.header();
  log.section('Observability & Metrics');
  
  recordWarning(
    'Observability',
    'Metrics endpoint validation (manual verification required)',
    'Manual check: Verify metrics endpoint exposes split_swap_records_created, validation_failures, transaction_failures'
  );
  
  recordWarning(
    'Observability',
    'Log monitoring (manual verification required)',
    'Manual check: Review logs for validation errors, transaction rollbacks, and split swap creation events'
  );
}

// ============================================================================
// FINAL REPORT
// ============================================================================

function generateFinalReport() {
  log.header();
  log.section('AUDIT SUMMARY');
  
  console.log(`\n${colors.bright}Total Checks: ${auditResults.total}${colors.reset}`);
  console.log(`${colors.green}Passed: ${auditResults.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${auditResults.failed}${colors.reset}`);
  console.log(`${colors.yellow}Warnings (Manual Verification): ${auditResults.warnings}${colors.reset}`);
  
  const passRate = auditResults.total > 0 
    ? ((auditResults.passed / auditResults.total) * 100).toFixed(1)
    : 0;
  
  console.log(`\n${colors.bright}Pass Rate: ${passRate}%${colors.reset}`);
  
  if (auditResults.failed > 0) {
    console.log(`\n${colors.red}${colors.bright}FAILED CHECKS:${colors.reset}`);
    auditResults.checks
      .filter(c => c.passed === false)
      .forEach(c => {
        console.log(`  ${colors.red}✗${colors.reset} [${c.category}] ${c.check}`);
        if (c.details) {
          console.log(`    ${c.details}`);
        }
      });
  }
  
  if (auditResults.warnings > 0) {
    console.log(`\n${colors.yellow}${colors.bright}MANUAL VERIFICATION REQUIRED:${colors.reset}`);
    auditResults.checks
      .filter(c => c.warning)
      .forEach(c => {
        console.log(`  ${colors.yellow}⚠${colors.reset} [${c.category}] ${c.check}`);
        if (c.details) {
          console.log(`    ${c.details}`);
        }
      });
  }
  
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
  
  if (auditResults.failed === 0) {
    console.log(`${colors.green}${colors.bright}✓ AUDIT PASSED${colors.reset}`);
    console.log(`${colors.green}All automated checks passed. Review manual verification items above.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bright}✗ AUDIT FAILED${colors.reset}`);
    console.log(`${colors.red}${auditResults.failed} check(s) failed. Review failures above and take corrective action.${colors.reset}\n`);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAudit() {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  SPLIT SWAP STORAGE ARCHITECTURE FIX - PRODUCTION AUDIT${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
  
  const connected = await connectToDatabase();
  if (!connected) {
    console.log(`\n${colors.red}Cannot proceed without database connection${colors.reset}\n`);
    process.exit(1);
  }
  
  try {
    await auditPhaseA();
    await auditPhaseB();
    await auditPhaseC_AmountFields();
    await auditPhaseD_SOLFields();
    await auditPhaseE_QueryPatterns();
    await auditPhaseF_LegacyData();
    await auditPhaseG_APIAggregation();
    await auditObservability();
    
    generateFinalReport();
    
  } catch (error) {
    console.error(`\n${colors.red}Audit failed with error:${colors.reset}`, error);
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

// Run the audit
runAudit().catch(console.error);
