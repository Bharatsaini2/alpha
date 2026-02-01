/**
 * Test V2 Parser with Real SHYFT Responses
 * 
 * This script tests the v2 parser against all real SHYFT API responses
 * in the shyft_response folder to verify:
 * 1. Correct swap detection
 * 2. Proper filtering of transfers to other users
 * 3. Comparison with v1 parser results
 */

const fs = require('fs');
const path = require('path');

// Use ts-node to load TypeScript files
require('ts-node/register');

// Import both parsers
const { ShyftParserV2 } = require('./src/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');

const parserV2 = new ShyftParserV2();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Convert v1 transaction format to v2 format
 */
function convertToV2Format(tx) {
  // Handle nested result structure from SHYFT API
  const txData = tx.result || tx;
  
  return {
    signature: txData.signatures?.[0] || txData.signature || 'unknown',
    timestamp: txData.timestamp ? new Date(txData.timestamp).getTime() / 1000 : Date.now() / 1000,
    status: txData.status || 'Success',
    fee: txData.fee || 0.000005,
    fee_payer: txData.fee_payer || '',
    signers: txData.signers || [],
    protocol: txData.protocol || (txData.actions?.[0]?.type 
      ? { name: txData.actions[0].type, address: 'unknown' }
      : undefined),
    token_balance_changes: txData.token_balance_changes || [],
  };
}

/**
 * Check if transaction is a transfer to another user
 * (not a swap for the fee payer/signer)
 */
function isTransferToOther(tx) {
  // Handle nested result structure
  const txData = tx.result || tx;
  
  const feePayer = txData.fee_payer;
  const signers = txData.signers || [];
  const userAddresses = [feePayer, ...signers].filter(Boolean);
  
  const balanceChanges = txData.token_balance_changes || [];
  
  // Check if there are balance changes for users other than fee payer/signers
  const otherUserChanges = balanceChanges.filter(
    change => !userAddresses.includes(change.owner)
  );
  
  // If all changes are for other users, it's likely a transfer
  if (otherUserChanges.length > 0 && otherUserChanges.length === balanceChanges.length) {
    return true;
  }
  
  // Check for simple transfer pattern: one negative, one positive, same token
  if (balanceChanges.length === 2) {
    const [change1, change2] = balanceChanges;
    if (
      change1.mint === change2.mint &&
      change1.change_amount < 0 &&
      change2.change_amount > 0 &&
      change1.owner !== change2.owner
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Test a single transaction file
 */
function testTransaction(filePath) {
  const fileName = path.basename(filePath);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const tx = JSON.parse(content);
    
    // Handle nested result structure
    const txData = tx.result || tx;
    
    // Check if it's a transfer to another user
    const isTransfer = isTransferToOther(tx);
    
    // Parse with v1
    const resultV1 = parseShyftTransaction(txData);
    
    // Parse with v2
    const txV2 = convertToV2Format(tx);
    const resultV2 = parserV2.parseTransaction(txV2);
    
    return {
      fileName,
      isTransfer,
      v1: {
        detected: resultV1 !== null,
        result: resultV1,
      },
      v2: {
        detected: resultV2.success,
        result: resultV2,
      },
      tx: txData,
    };
  } catch (error) {
    return {
      fileName,
      error: error.message,
    };
  }
}

/**
 * Main test function
 */
function runTests() {
  const responseDir = path.join(__dirname, '../shyft_response');
  
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║  SHYFT Parser V2 - Real Response Testing                      ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  // Get all JSON files
  const files = fs.readdirSync(responseDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(responseDir, f));
  
  console.log(`${colors.blue}Found ${files.length} transaction files${colors.reset}\n`);
  
  const results = files.map(testTransaction);
  
  // Categorize results
  const transfers = results.filter(r => r.isTransfer);
  const swaps = results.filter(r => !r.isTransfer && !r.error);
  const errors = results.filter(r => r.error);
  
  // Statistics
  const stats = {
    total: results.length,
    transfers: transfers.length,
    swaps: swaps.length,
    errors: errors.length,
    v1Detected: results.filter(r => r.v1?.detected).length,
    v2Detected: results.filter(r => r.v2?.detected).length,
    v1Erased: results.filter(r => !r.v1?.detected && !r.error).length,
    v2Erased: results.filter(r => !r.v2?.detected && !r.error).length,
    bothDetected: results.filter(r => r.v1?.detected && r.v2?.detected).length,
    onlyV1: results.filter(r => r.v1?.detected && !r.v2?.detected).length,
    onlyV2: results.filter(r => !r.v1?.detected && r.v2?.detected).length,
  };
  
  // Print transfers (should be ignored)
  if (transfers.length > 0) {
    console.log(`${colors.yellow}═══ TRANSFERS TO OTHER USERS (Should be ignored) ═══${colors.reset}\n`);
    transfers.forEach(r => {
      const v1Status = r.v1.detected ? `${colors.red}✗ Detected${colors.reset}` : `${colors.green}✓ Ignored${colors.reset}`;
      const v2Status = r.v2.detected ? `${colors.red}✗ Detected${colors.reset}` : `${colors.green}✓ Ignored${colors.reset}`;
      console.log(`  ${r.fileName}`);
      console.log(`    V1: ${v1Status} | V2: ${v2Status}`);
    });
    console.log();
  }
  
  // Print swaps
  if (swaps.length > 0) {
    console.log(`${colors.green}═══ SWAPS (Should be detected) ═══${colors.reset}\n`);
    swaps.forEach(r => {
      const v1Status = r.v1.detected ? `${colors.green}✓ Detected${colors.reset}` : `${colors.red}✗ Missed${colors.reset}`;
      const v2Status = r.v2.detected ? `${colors.green}✓ Detected${colors.reset}` : `${colors.red}✗ Missed${colors.reset}`;
      
      console.log(`  ${r.fileName}`);
      console.log(`    V1: ${v1Status} | V2: ${v2Status}`);
      
      if (r.v1.detected && r.v1.result) {
        console.log(`    ${colors.gray}V1: ${r.v1.result.side} | ${r.v1.result.confidence}${colors.reset}`);
      }
      
      if (r.v2.detected && r.v2.result.data) {
        const swap = 'sellRecord' in r.v2.result.data ? r.v2.result.data.buyRecord : r.v2.result.data;
        console.log(`    ${colors.gray}V2: ${swap.direction} | Confidence: ${swap.confidence}${colors.reset}`);
      }
      
      if (!r.v2.detected && r.v2.result.erase) {
        console.log(`    ${colors.gray}V2 ERASE: ${r.v2.result.erase.reason}${colors.reset}`);
      }
      
      console.log();
    });
  }
  
  // Print errors
  if (errors.length > 0) {
    console.log(`${colors.red}═══ ERRORS ═══${colors.reset}\n`);
    errors.forEach(r => {
      console.log(`  ${r.fileName}: ${r.error}`);
    });
    console.log();
  }
  
  // Print detailed comparison for mismatches
  const mismatches = results.filter(r => 
    !r.error && !r.isTransfer && (r.v1.detected !== r.v2.detected)
  );
  
  if (mismatches.length > 0) {
    console.log(`${colors.yellow}═══ DETECTION MISMATCHES ═══${colors.reset}\n`);
    mismatches.forEach(r => {
      console.log(`  ${r.fileName}`);
      console.log(`    V1: ${r.v1.detected ? 'Detected' : 'Missed'}`);
      console.log(`    V2: ${r.v2.detected ? 'Detected' : 'Missed'}`);
      
      if (r.v2.result.erase) {
        console.log(`    V2 Reason: ${r.v2.result.erase.reason}`);
        if (r.v2.result.erase.debugInfo) {
          console.log(`    V2 Debug: ${JSON.stringify(r.v2.result.erase.debugInfo, null, 2)}`);
        }
      }
      console.log();
    });
  }
  
  // Print summary
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}SUMMARY${colors.reset}\n`);
  console.log(`  Total Files:           ${stats.total}`);
  console.log(`  Transfers (ignored):   ${stats.transfers}`);
  console.log(`  Swaps:                 ${stats.swaps}`);
  console.log(`  Errors:                ${stats.errors}`);
  console.log();
  console.log(`  V1 Detected:           ${stats.v1Detected} (${((stats.v1Detected / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  V2 Detected:           ${stats.v2Detected} (${((stats.v2Detected / stats.total) * 100).toFixed(1)}%)`);
  console.log();
  console.log(`  Both Detected:         ${stats.bothDetected}`);
  console.log(`  Only V1:               ${stats.onlyV1}`);
  console.log(`  Only V2:               ${stats.onlyV2}`);
  console.log();
  
  // Detection rate comparison
  const v1Rate = (stats.v1Detected / (stats.total - stats.errors)) * 100;
  const v2Rate = (stats.v2Detected / (stats.total - stats.errors)) * 100;
  const improvement = v2Rate - v1Rate;
  
  console.log(`  V1 Detection Rate:     ${v1Rate.toFixed(1)}%`);
  console.log(`  V2 Detection Rate:     ${v2Rate.toFixed(1)}%`);
  
  if (improvement > 0) {
    console.log(`  ${colors.green}Improvement:           +${improvement.toFixed(1)}%${colors.reset}`);
  } else if (improvement < 0) {
    console.log(`  ${colors.red}Regression:            ${improvement.toFixed(1)}%${colors.reset}`);
  } else {
    console.log(`  ${colors.gray}Change:                ${improvement.toFixed(1)}%${colors.reset}`);
  }
  
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);
  
  // Final verdict
  if (stats.v2Detected >= stats.v1Detected && mismatches.length === 0) {
    console.log(`${colors.green}✓ V2 Parser: All tests passed!${colors.reset}`);
    console.log(`${colors.green}✓ No regressions detected${colors.reset}`);
    console.log(`${colors.green}✓ Detection rate maintained or improved${colors.reset}\n`);
  } else if (stats.v2Detected >= stats.v1Detected) {
    console.log(`${colors.yellow}⚠ V2 Parser: Detection rate maintained but with differences${colors.reset}`);
    console.log(`${colors.yellow}⚠ Review mismatches above${colors.reset}\n`);
  } else {
    console.log(`${colors.red}✗ V2 Parser: Regression detected${colors.reset}`);
    console.log(`${colors.red}✗ V2 detects fewer swaps than V1${colors.reset}\n`);
  }
}

// Run the tests
runTests();
