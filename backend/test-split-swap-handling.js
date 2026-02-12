require('dotenv').config();
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const signature = '4uooDQdF2pXMWEod84Snv6hPn9Ahp7jie1GxEjirbqWrrEYd8bkNZTgrv5Ua6jtnd2yHRAU1T8S3Jvsn8mzVj9eF';

// Mock Shyft transaction data for this split swap
const mockShyftTransaction = {
  signature: signature,
  timestamp: 1739397486,
  fee: 0.000005,
  fee_payer: '5mx9Y6Mhm1GE5VEAahfnrrWxUAhgsSfXQotzFJ96eCXa',
  signers: ['5mx9Y6Mhm1GE5VEAahfnrrWxUAhgsSfXQotzFJ96eCXa'],
  signatures: [signature],
  protocol: {
    address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    name: 'JUPITER'
  },
  type: 'SWAP',
  status: 'Success',
  actions: [
    {
      info: {
        tokens_swapped: {
          in: {
            token_address: '1zJX5gRnjLgmTpq5sVwkq69mNDQkCemqoasyjaPW6jm',
            name: 'KLED',
            symbol: 'KLED',
            image_uri: '',
            amount: 23996.5763741,
            amount_raw: '23996576374'
          },
          out: {
            token_address: 'So11111111111111111111111111111111111111112',
            name: 'Wrapped SOL',
            symbol: 'SOL',
            image_uri: '',
            amount: 3.74,
            amount_raw: '3740000000'
          }
        }
      },
      source_protocol: {
        address: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
        name: 'ORCA'
      },
      type: 'SWAP'
    },
    {
      info: {
        tokens_swapped: {
          in: {
            token_address: 'So11111111111111111111111111111111111111112',
            name: 'Wrapped SOL',
            symbol: 'SOL',
            image_uri: '',
            amount: 3.74,
            amount_raw: '3740000000'
          },
          out: {
            token_address: 'fRfKGCriduzDwSudCwpL7ySCEiboNuryhZDVJtr1a1C',
            name: 'DUPE',
            symbol: 'DUPE',
            image_uri: '',
            amount: 50000,
            amount_raw: '50000000000'
          }
        }
      },
      source_protocol: {
        address: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
        name: 'RAYDIUM'
      },
      type: 'SWAP'
    }
  ],
  events: {}
};

console.log('🧪 TESTING SPLIT SWAP HANDLING');
console.log('='.repeat(100));
console.log(`\n📝 Transaction Signature: ${signature}`);
console.log(`🐋 Whale Address: 5mx9Y6Mhm1GE5VEAahfnrrWxUAhgsSfXQotzFJ96eCXa\n`);

console.log('='.repeat(100));
console.log('STEP 1: PARSER V2 OUTPUT');
console.log('='.repeat(100));

try {
  const parseResult = parseShyftTransactionV2(mockShyftTransaction);
  
  console.log(`\n✅ Parser Success: ${parseResult.success}`);
  
  if (parseResult.success && parseResult.data) {
    const swapData = parseResult.data;
    
    // Check if it's a split swap
    const isSplitSwap = 'sellRecord' in swapData;
    
    console.log(`\n🔍 Is Split Swap: ${isSplitSwap ? '✅ YES' : '❌ NO'}`);
    
    if (isSplitSwap) {
      console.log('\n' + '='.repeat(100));
      console.log('SPLIT SWAP DETECTED - TWO LEGS IDENTIFIED');
      console.log('='.repeat(100));
      
      console.log('\n📊 LEG 1: SELL RECORD');
      console.log('-'.repeat(100));
      console.log(JSON.stringify(swapData.sellRecord, null, 2));
      
      console.log('\n📊 LEG 2: BUY RECORD');
      console.log('-'.repeat(100));
      console.log(JSON.stringify(swapData.buyRecord, null, 2));
      
      console.log('\n' + '='.repeat(100));
      console.log('STEP 2: HOW CONTROLLER WILL HANDLE THIS');
      console.log('='.repeat(100));
      
      console.log('\n🔄 Controller Logic:');
      console.log('   1. Detect split swap: if ("sellRecord" in swapData) ✅');
      console.log('   2. Start MongoDB transaction session');
      console.log('   3. Process SELL leg:');
      console.log(`      - Call processSingleSwapTransaction(sellRecord, ...)`);
      console.log(`      - Classification Source: "v2_parser_split_sell"`);
      console.log(`      - Type will be set to: "sell"`);
      console.log('   4. Process BUY leg:');
      console.log(`      - Call processSingleSwapTransaction(buyRecord, ...)`);
      console.log(`      - Classification Source: "v2_parser_split_buy"`);
      console.log(`      - Type will be set to: "buy"`);
      console.log('   5. Commit transaction (both records saved atomically)');
      
      console.log('\n' + '='.repeat(100));
      console.log('STEP 3: DATABASE STORAGE AFTER DEPLOYMENT');
      console.log('='.repeat(100));
      
      console.log('\n📦 WhaleAllTransactionsV2 Collection:');
      console.log('   Expected: 2 separate records\n');
      
      console.log('   🔴 RECORD 1 (SELL):');
      console.log('   {');
      console.log(`     signature: "${signature}",`);
      console.log('     type: "sell",');
      console.log('     classificationSource: "v2_parser_split_sell",');
      console.log('     amount: {');
      console.log(`       buyAmount: "0",`);
      console.log(`       sellAmount: "374.8"  // USD value of KLED sold`);
      console.log('     },');
      console.log('     transaction: {');
      console.log('       tokenIn: {');
      console.log('         symbol: "KLED",');
      console.log('         address: "1zJX5gRnjLgmTpq5sVwkq69mNDQkCemqoasyjaPW6jm",');
      console.log('         amount: "23996.5763741"');
      console.log('       },');
      console.log('       tokenOut: {');
      console.log('         symbol: "SOL",');
      console.log('         address: "So11111111111111111111111111111111111111112",');
      console.log('         amount: "3.74"');
      console.log('       }');
      console.log('     },');
      console.log('     whale: {');
      console.log('       address: "5mx9Y6Mhm1GE5VEAahfnrrWxUAhgsSfXQotzFJ96eCXa"');
      console.log('     }');
      console.log('   }\n');
      
      console.log('   🟢 RECORD 2 (BUY):');
      console.log('   {');
      console.log(`     signature: "${signature}",  // Same signature`);
      console.log('     type: "buy",');
      console.log('     classificationSource: "v2_parser_split_buy",');
      console.log('     amount: {');
      console.log(`       buyAmount: "374.8",  // USD value of DUPE bought`);
      console.log(`       sellAmount: "0"`);
      console.log('     },');
      console.log('     transaction: {');
      console.log('       tokenIn: {');
      console.log('         symbol: "SOL",');
      console.log('         address: "So11111111111111111111111111111111111111112",');
      console.log('         amount: "3.74"');
      console.log('       },');
      console.log('       tokenOut: {');
      console.log('         symbol: "DUPE",');
      console.log('         address: "fRfKGCriduzDwSudCwpL7ySCEiboNuryhZDVJtr1a1C",');
      console.log('         amount: "50000"');
      console.log('       }');
      console.log('     },');
      console.log('     whale: {');
      console.log('       address: "5mx9Y6Mhm1GE5VEAahfnrrWxUAhgsSfXQotzFJ96eCXa"');
      console.log('     }');
      console.log('   }');
      
      console.log('\n' + '='.repeat(100));
      console.log('STEP 4: COMPOUND UNIQUE INDEX');
      console.log('='.repeat(100));
      console.log('\n   Index: { signature: 1, type: 1 } (unique)');
      console.log('   Allows: Same signature with different types');
      console.log(`   Record 1: ("${signature.slice(0, 20)}...", "sell") ✅`);
      console.log(`   Record 2: ("${signature.slice(0, 20)}...", "buy") ✅`);
      console.log(`   Would Reject: ("${signature.slice(0, 20)}...", "sell") again ❌`);
      
      console.log('\n' + '='.repeat(100));
      console.log('STEP 5: AMOUNT MAPPING');
      console.log('='.repeat(100));
      
      console.log('\n   Using mapParserAmountsToStorage() utility:');
      console.log('\n   SELL Record:');
      console.log('   - Parser direction: "SELL"');
      console.log('   - amount.sellAmount = USD value of baseAsset (KLED)');
      console.log('   - amount.buyAmount = 0');
      console.log('   - solAmount.sellSolAmount = SOL value of baseAsset');
      console.log('   - solAmount.buySolAmount = null');
      
      console.log('\n   BUY Record:');
      console.log('   - Parser direction: "BUY"');
      console.log('   - amount.buyAmount = USD value of baseAsset (DUPE)');
      console.log('   - amount.sellAmount = 0');
      console.log('   - solAmount.buySolAmount = SOL value of baseAsset');
      console.log('   - solAmount.sellSolAmount = null');
      
    } else {
      console.log('\n❌ Not a split swap - would be stored as single record');
      console.log(JSON.stringify(swapData, null, 2));
    }
  } else {
    console.log('\n❌ Parser failed or returned no data');
    console.log(JSON.stringify(parseResult, null, 2));
  }
  
} catch (error) {
  console.error('\n❌ Error during parsing:', error.message);
  console.error(error);
}

console.log('\n' + '='.repeat(100));
console.log('TEST COMPLETE');
console.log('='.repeat(100));
