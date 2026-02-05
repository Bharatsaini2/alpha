/**
 * Test Parser Fixes
 * 
 * Tests both fixes:
 * 1. Enhanced multi-hop collapse for 3+ assets (Issue 1)
 * 2. Correct amount fields in compare script (Issue 2)
 */

require('dotenv').config();
const axios = require('axios');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';

const TEST_CASES = [
  {
    name: 'Issue 1: Invalid Asset Count (should now be accepted)',
    signature: '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD',
    expectedResult: 'ACCEPTED',
    expectedReason: null
  },
  {
    name: 'Issue 2: Amount Display (verify correct amounts)',
    signature: '3Xrasm33YS3yALUuqX6gVdzhzpUkBV2FkwuRwC3KwK6RXxwXDP6b7ovzBEoHKdVjk8bQVBGSxZRmjFxTzw5MGxQ4',
    expectedResult: 'ACCEPTED',
    expectedReason: null,
    expectedAmounts: {
      swapInputAmount: 0.9995392799999999, // What went to pool
      totalWalletCost: 0.999818244, // Includes fees
      baseAmount: 10724382.092074 // Tokens received
    }
  }
];

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    );
    return response.data?.result || null;
  } catch (error) {
    console.error(`Error fetching ${signature}:`, error.message);
    return null;
  }
}

async function runTestCase(testCase) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testCase.name}`);
  console.log('='.repeat(80));
  console.log(`Signature: ${testCase.signature}`);

  const shyftData = await fetchShyftTransaction(testCase.signature);
  
  if (!shyftData) {
    console.log('❌ FAILED: Could not fetch transaction data');
    return false;
  }

  const v2Input = {
    signature: testCase.signature,
    timestamp: shyftData.timestamp ? new Date(shyftData.timestamp).getTime() : Date.now(),
    status: shyftData.status || 'Success',
    fee: shyftData.fee || 0,
    fee_payer: shyftData.fee_payer || '',
    signers: shyftData.signers || [],
    protocol: shyftData.protocol,
    token_balance_changes: shyftData.token_balance_changes || [],
    actions: shyftData.actions || []
  };

  const parseResult = parseShyftTransactionV2(v2Input);

  // Check result
  if (testCase.expectedResult === 'ACCEPTED') {
    if (parseResult.success && parseResult.data) {
      console.log('✅ PASSED: Transaction accepted as expected');
      
      const swapData = parseResult.data;
      
      if ('sellRecord' in swapData) {
        console.log('\n📊 SPLIT SWAP DETECTED:');
        console.log('  SELL Record:');
        console.log('    Direction:', swapData.sellRecord.direction);
        console.log('    Quote:', swapData.sellRecord.quoteAsset.symbol);
        console.log('    Base:', swapData.sellRecord.baseAsset.symbol);
        console.log('    Amounts:', JSON.stringify(swapData.sellRecord.amounts, null, 2));
        
        console.log('\n  BUY Record:');
        console.log('    Direction:', swapData.buyRecord.direction);
        console.log('    Quote:', swapData.buyRecord.quoteAsset.symbol);
        console.log('    Base:', swapData.buyRecord.baseAsset.symbol);
        console.log('    Amounts:', JSON.stringify(swapData.buyRecord.amounts, null, 2));
      } else {
        console.log('\n📊 SWAP DETECTED:');
        console.log('  Direction:', swapData.direction);
        console.log('  Quote:', swapData.quoteAsset.symbol);
        console.log('  Base:', swapData.baseAsset.symbol);
        console.log('  Swapper:', swapData.swapper);
        console.log('  Confidence:', swapData.confidence);
        console.log('\n  Amounts:');
        console.log(JSON.stringify(swapData.amounts, null, 2));

        // Verify expected amounts if provided
        if (testCase.expectedAmounts) {
          console.log('\n🔍 AMOUNT VERIFICATION:');
          let allMatch = true;
          
          for (const [key, expectedValue] of Object.entries(testCase.expectedAmounts)) {
            const actualValue = swapData.amounts[key];
            const matches = Math.abs(actualValue - expectedValue) < 0.000001;
            
            console.log(`  ${key}:`);
            console.log(`    Expected: ${expectedValue}`);
            console.log(`    Actual:   ${actualValue}`);
            console.log(`    ${matches ? '✅ MATCH' : '❌ MISMATCH'}`);
            
            if (!matches) allMatch = false;
          }
          
          if (allMatch) {
            console.log('\n✅ All amounts match expected values!');
          } else {
            console.log('\n❌ Some amounts do not match!');
            return false;
          }
        }
      }
      
      return true;
    } else if (parseResult.erase) {
      console.log('❌ FAILED: Transaction rejected when it should be accepted');
      console.log('  Rejection Reason:', parseResult.erase.reason);
      if (parseResult.erase.metadata) {
        console.log('  Metadata:', JSON.stringify(parseResult.erase.metadata, null, 2));
      }
      return false;
    }
  } else if (testCase.expectedResult === 'REJECTED') {
    if (parseResult.erase) {
      if (parseResult.erase.reason === testCase.expectedReason) {
        console.log('✅ PASSED: Transaction rejected with expected reason');
        console.log('  Reason:', parseResult.erase.reason);
        return true;
      } else {
        console.log('❌ FAILED: Transaction rejected with wrong reason');
        console.log('  Expected:', testCase.expectedReason);
        console.log('  Actual:', parseResult.erase.reason);
        return false;
      }
    } else {
      console.log('❌ FAILED: Transaction accepted when it should be rejected');
      return false;
    }
  }

  return false;
}

async function main() {
  console.log('🧪 Testing Parser Fixes\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of TEST_CASES) {
    const result = await runTestCase(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${TEST_CASES.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log('='.repeat(80));
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
