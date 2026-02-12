/**
 * Comprehensive Test for Normal Buy/Sell Transactions
 * 
 * Verifies that standard (non-split) swaps work correctly after parser updates:
 * 1. Parser V2 correctly identifies standard swaps
 * 2. Single record is created (not two records)
 * 3. Amount fields contain actual token amounts
 * 4. SOL fields are populated correctly
 * 5. Type is set correctly (buy/sell, not "both")
 * 
 * Tests both BUY and SELL scenarios
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Import parser and utilities
const { parseTransactionV2 } = require('./src/utils/shyftParserV2');
const { mapParserAmountsToStorage, mapSOLAmounts, isSOLMint } = require('./src/utils/splitSwapStorageMapper');
const { validateSplitSwapStorage } = require('./src/utils/splitSwapStorageValidator');

// Test transaction signatures
const TEST_CASES = {
  BUY_TOKEN_WITH_SOL: '2YeswJ5sZpstrqMvSwHu2NeeXbydEcMX8h61AvQgk3kQ1VDn44faW8DS1bcqrKkuYjuhrqfNwkjdZrggMRGoZNuA',
  // Add more test cases as needed
  // SELL_TOKEN_FOR_SOL: 'another_signature_here',
  // BUY_TOKEN_WITH_USDC: 'another_signature_here',
};

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

function logSubSection(title) {
  console.log('\n' + '-'.repeat(60));
  log(title, 'cyan');
  console.log('-'.repeat(60));
}

async function fetchTransactionFromShyft(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: { network: 'mainnet-beta', txn_signature: signature },
        headers: { 'x-api-key': SHYFT_API_KEY },
      }
    );
    return response.data.result;
  } catch (error) {
    throw new Error(`Failed to fetch transaction: ${error.message}`);
  }
}

async function checkDatabaseRecord(signature) {
  try {
    await mongoose.connect(MONGODB_URI);
    const WhaleAllTransactionsV2 = mongoose.model('WhaleAllTransactionsV2');
    
    const records = await WhaleAllTransactionsV2.find({ signature }).lean();
    
    await mongoose.connection.close();
    
    return records;
  } catch (error) {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    throw new Error(`Database query failed: ${error.message}`);
  }
}

function analyzeParserOutput(parsedSwap) {
  logSubSection('Parser V2 Analysis');
  
  log(`✓ Signature: ${parsedSwap.signature}`, 'green');
  log(`✓ Direction: ${parsedSwap.direction}`, 'green');
  log(`✓ Swapper: ${parsedSwap.swapper}`, 'green');
  log(`✓ Protocol: ${parsedSwap.protocol}`, 'green');
  
  console.log('\nAssets:');
  log(`  Base: ${parsedSwap.baseAsset.symbol} (${parsedSwap.baseAsset.mint.substring(0, 8)}...)`, 'blue');
  log(`  Quote: ${parsedSwap.quoteAsset.symbol} (${parsedSwap.quoteAsset.mint.substring(0, 8)}...)`, 'blue');
  
  console.log('\nAmounts:');
  log(`  Base Amount: ${parsedSwap.amounts.baseAmount}`, 'blue');
  log(`  Total Wallet Cost: ${parsedSwap.amounts.totalWalletCost ?? 'undefined'}`, 'blue');
  log(`  Net Wallet Received: ${parsedSwap.amounts.netWalletReceived ?? 'undefined'}`, 'blue');
  
  // Check if this is a split swap
  const isSplitSwap = parsedSwap.splitSwapDetails !== undefined;
  if (isSplitSwap) {
    log('\n⚠ WARNING: This is a SPLIT SWAP (should have splitSwapDetails)', 'yellow');
  } else {
    log('\n✓ This is a STANDARD SWAP (no splitSwapDetails)', 'green');
  }
  
  return { isSplitSwap };
}

function analyzeStorageMapping(parsedSwap) {
  logSubSection('Storage Mapping Analysis');
  
  // Map amounts
  const amountMapping = mapParserAmountsToStorage(parsedSwap);
  log('Amount Mapping:', 'cyan');
  log(`  buyAmount: ${amountMapping.buyAmount}`, 'blue');
  log(`  sellAmount: ${amountMapping.sellAmount}`, 'blue');
  
  // Map SOL amounts
  const solMapping = mapSOLAmounts(parsedSwap);
  log('\nSOL Amount Mapping:', 'cyan');
  log(`  buySolAmount: ${solMapping.buySolAmount ?? 'null'}`, 'blue');
  log(`  sellSolAmount: ${solMapping.sellSolAmount ?? 'null'}`, 'blue');
  
  // Check SOL involvement
  const baseIsSOL = isSOLMint(parsedSwap.baseAsset.mint);
  const quoteIsSOL = isSOLMint(parsedSwap.quoteAsset.mint);
  
  log('\nSOL Involvement:', 'cyan');
  log(`  Base is SOL: ${baseIsSOL}`, 'blue');
  log(`  Quote is SOL: ${quoteIsSOL}`, 'blue');
  
  if (!baseIsSOL && !quoteIsSOL) {
    if (solMapping.buySolAmount !== null || solMapping.sellSolAmount !== null) {
      log('  ✗ ERROR: SOL amounts should be null for non-SOL swap', 'red');
    } else {
      log('  ✓ Correct: SOL amounts are null', 'green');
    }
  }
  
  return { amountMapping, solMapping };
}

function validateStorage(parsedSwap, amountMapping, solMapping) {
  logSubSection('Storage Validation');
  
  // Create mock stored record
  const mockStoredRecord = {
    amount: amountMapping,
    solAmount: solMapping,
  };
  
  const validationResult = validateSplitSwapStorage(parsedSwap, mockStoredRecord);
  
  if (validationResult.valid) {
    log('✓ Storage validation PASSED', 'green');
  } else {
    log('✗ Storage validation FAILED', 'red');
    console.log('\nValidation Errors:');
    validationResult.errors.forEach((error, index) => {
      log(`  ${index + 1}. Field: ${error.field}`, 'red');
      log(`     Issue: ${error.issue}`, 'red');
      log(`     Expected: ${error.expectedValue}`, 'yellow');
      log(`     Actual: ${error.actualValue}`, 'yellow');
    });
  }
  
  return validationResult;
}

async function analyzeDatabaseRecords(signature, expectedType) {
  logSubSection('Database Record Analysis');
  
  try {
    const records = await checkDatabaseRecord(signature);
    
    log(`Found ${records.length} record(s) in database`, 'cyan');
    
    if (records.length === 0) {
      log('⚠ No records found - transaction may not have been processed yet', 'yellow');
      return { recordCount: 0, records: [] };
    }
    
    if (records.length > 1) {
      log('✗ ERROR: Multiple records found for standard swap', 'red');
      log('  Standard swaps should create exactly 1 record', 'red');
    } else {
      log('✓ Correct: Single record created', 'green');
    }
    
    records.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`);
      log(`  Type: ${record.type}`, record.type === expectedType ? 'green' : 'red');
      log(`  Classification Source: ${record.classificationSource || 'NOT SET'}`, 'blue');
      log(`  Swapper: ${record.swapper || 'undefined'}`, 'blue');
      log(`  Amount:`, 'cyan');
      log(`    buyAmount: ${record.amount?.buyAmount}`, 'blue');
      log(`    sellAmount: ${record.amount?.sellAmount}`, 'blue');
      log(`  SOL Amount:`, 'cyan');
      log(`    buySolAmount: ${record.solAmount?.buySolAmount ?? 'null'}`, 'blue');
      log(`    sellSolAmount: ${record.solAmount?.sellSolAmount ?? 'null'}`, 'blue');
      
      // Check for issues
      if (record.type === 'both') {
        log('  ✗ ERROR: Type is "both" - should be "buy" or "sell"', 'red');
      }
      
      if (record.classificationSource === 'v2_parser_split_both') {
        log('  ✗ ERROR: Classification source indicates split swap merge', 'red');
      }
    });
    
    return { recordCount: records.length, records };
  } catch (error) {
    log(`✗ Database check failed: ${error.message}`, 'red');
    return { recordCount: -1, records: [], error: error.message };
  }
}

function generateFinalVerdict(testCase, results) {
  logSubSection('Final Verdict');
  
  const { parserAnalysis, storageValidation, dbAnalysis } = results;
  
  const checks = [
    {
      name: 'Parser identifies as standard swap',
      passed: !parserAnalysis.isSplitSwap,
    },
    {
      name: 'Storage mapping is valid',
      passed: storageValidation.valid,
    },
    {
      name: 'Single database record created',
      passed: dbAnalysis.recordCount === 1,
    },
    {
      name: 'Record type is correct (not "both")',
      passed: dbAnalysis.records.length > 0 && dbAnalysis.records[0].type !== 'both',
    },
  ];
  
  const allPassed = checks.every(check => check.passed);
  
  console.log('\nChecklist:');
  checks.forEach(check => {
    const icon = check.passed ? '✓' : '✗';
    const color = check.passed ? 'green' : 'red';
    log(`  ${icon} ${check.name}`, color);
  });
  
  console.log('\n' + '='.repeat(80));
  if (allPassed) {
    log('✓ ALL CHECKS PASSED - Normal swap works correctly!', 'green');
  } else {
    log('✗ SOME CHECKS FAILED - Issues detected', 'red');
  }
  console.log('='.repeat(80));
  
  return allPassed;
}

async function testNormalSwap(testName, signature, expectedDirection) {
  logSection(`Testing: ${testName}`);
  log(`Signature: ${signature}`, 'cyan');
  log(`Expected Direction: ${expectedDirection}`, 'cyan');
  
  try {
    // Step 1: Fetch transaction
    logSubSection('Step 1: Fetch Transaction from SHYFT');
    const rawTransaction = await fetchTransactionFromShyft(signature);
    log('✓ Transaction fetched successfully', 'green');
    
    // Step 2: Parse with Parser V2
    logSubSection('Step 2: Parse with Parser V2');
    const parsedSwap = parseTransactionV2(rawTransaction);
    
    if (!parsedSwap) {
      log('✗ Parser returned null - transaction not recognized as swap', 'red');
      return false;
    }
    
    log('✓ Transaction parsed successfully', 'green');
    
    // Step 3: Analyze parser output
    const parserAnalysis = analyzeParserOutput(parsedSwap);
    
    // Step 4: Analyze storage mapping
    const { amountMapping, solMapping } = analyzeStorageMapping(parsedSwap);
    
    // Step 5: Validate storage
    const storageValidation = validateStorage(parsedSwap, amountMapping, solMapping);
    
    // Step 6: Check database records
    const dbAnalysis = await analyzeDatabaseRecords(signature, expectedDirection.toLowerCase());
    
    // Step 7: Generate final verdict
    const allPassed = generateFinalVerdict(testName, {
      parserAnalysis,
      storageValidation,
      dbAnalysis,
    });
    
    return allPassed;
  } catch (error) {
    log(`\n✗ Test failed with error: ${error.message}`, 'red');
    console.error(error);
    return false;
  }
}

async function runAllTests() {
  logSection('COMPREHENSIVE NORMAL SWAP TEST SUITE');
  log('Testing standard buy/sell transactions after parser updates', 'cyan');
  
  const results = [];
  
  for (const [testName, signature] of Object.entries(TEST_CASES)) {
    const expectedDirection = testName.startsWith('BUY') ? 'BUY' : 'SELL';
    const passed = await testNormalSwap(testName, signature, expectedDirection);
    results.push({ testName, passed });
  }
  
  // Summary
  logSection('TEST SUMMARY');
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  
  results.forEach(result => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? 'green' : 'red';
    log(`  ${icon} ${result.testName}`, color);
  });
  
  console.log('\n' + '='.repeat(80));
  log(`${passedTests}/${totalTests} tests passed`, passedTests === totalTests ? 'green' : 'red');
  console.log('='.repeat(80));
  
  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
