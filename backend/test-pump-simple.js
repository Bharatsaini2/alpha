// Simple test to check if the fix is working
delete require.cache[require.resolve('./dist/utils/shyftParserV2')]
delete require.cache[require.resolve('./dist/utils/shyftParserV2.assetDeltaCollector')]

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

const tx = {
  signature: 'test',
  timestamp: Date.now(),
  status: 'Success',
  fee: 0.000015,
  fee_payer: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
  signers: ['2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ'],
  protocol: { name: 'PUMP' },
  token_balance_changes: [
    {
      address: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
      mint: 'GhPzxUyHuHNRfUkXj4BACd2BVi9odXizWkcZrNzrpump',
      decimals: 6,
      change_amount: 1710587013035,
      post_balance: 1710587013035,
      pre_balance: 0,
      owner: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ'
    }
  ],
  actions: [
    {
      type: 'SWAP',
      info: {
        swapper: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        tokens_swapped: {
          in: {
            token_address: 'So11111111111111111111111111111111111111112',
            amount_raw: 244406250
          },
          out: {
            token_address: 'GhPzxUyHuHNRfUkXj4BACd2BVi9odXizWkcZrNzrpump',
            amount_raw: 1710587013035
          }
        }
      }
    },
    {
      type: 'SOL_TRANSFER',
      info: {
        sender: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        receiver: 'FjC3jE4TG3wRnrKuF1Aj93sXUkrdHt1ifMsAwKFevWSG',
        amount: 0.000733219
      }
    },
    {
      type: 'SOL_TRANSFER',
      info: {
        sender: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        receiver: '4cg3bJsLvAgigCveJyJcnECSRYn9q8fVKdN1Hn3JQ86S',
        amount: 0.24440625
      }
    },
    {
      type: 'SOL_TRANSFER',
      info: {
        sender: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        receiver: '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
        amount: 0.00232186
      }
    },
    {
      type: 'SOL_TRANSFER',
      info: {
        sender: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        receiver: '8mR3wB1nh4D6J9RUCugxUpc6ya8w38LPxZ3ZjcBhgzws',
        amount: 0.0001
      }
    },
    {
      type: 'SOL_TRANSFER',
      info: {
        sender: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        receiver: 'J5XGHmzrRmnYWbmw45DbYkdZAU2bwERFZ11qCDXPvFB5',
        amount: 0.0007425
      }
    },
    {
      type: 'SOL_TRANSFER',
      info: {
        sender: '2G6CNJqfvGP3KWZXtV8rQHra3kxGK28nvzT6TjyWNtiJ',
        receiver: 'DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb',
        amount: 0.0017325
      }
    }
  ]
}

console.log('\n=== Testing PUMP.fun Fix ===\n')
const result = parseShyftTransactionV2(tx)

if (result.success && result.data) {
  console.log('SOL Amount:', result.data.amounts.swapInputAmount)
  console.log('Expected: ~0.244 SOL')
  console.log('Actual: ', result.data.amounts.swapInputAmount, 'SOL')
  
  if (result.data.amounts.swapInputAmount < 0.25) {
    console.log('\n✅ FIX WORKING! Amount is correct')
  } else {
    console.log('\n❌ FIX NOT WORKING! Amount is still doubled')
  }
} else {
  console.log('❌ Parse failed')
}
