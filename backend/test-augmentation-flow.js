/**
 * Test Augmentation Flow
 * 
 * Tests if SOL_TRANSFER actions are being properly added to balance changes
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

async function testAugmentationFlow() {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    )

    const parsedTx = response.data
    const swapper = parsedTx.result.signers[0]
    const actions = parsedTx.result.actions || []
    
    console.log('=== SWAPPER ===')
    console.log(swapper)
    
    console.log('\n=== CHECKING FOR TRANSFER ACTIONS ===')
    const hasTransferActions = actions.some(a => 
      (a.type === 'SOL_TRANSFER' || a.type === 'TOKEN_TRANSFER') &&
      a.info &&
      (a.info.sender === swapper || a.info.receiver === swapper)
    )
    console.log('Has transfer actions for swapper:', hasTransferActions)
    
    console.log('\n=== SOL_TRANSFER ACTIONS FOR SWAPPER ===')
    const solTransfers = actions.filter(a => 
      a.type === 'SOL_TRANSFER' &&
      a.info &&
      (a.info.sender === swapper || a.info.receiver === swapper)
    )
    
    solTransfers.forEach((transfer, idx) => {
      console.log(`\n[${idx + 1}] ${transfer.info.sender === swapper ? 'OUTGOING' : 'INCOMING'}`)
      console.log(`    From: ${transfer.info.sender}`)
      console.log(`    To: ${transfer.info.receiver}`)
      console.log(`    Amount: ${transfer.info.amount} SOL`)
      console.log(`    Amount Raw: ${transfer.info.amount_raw}`)
    })
    
    console.log('\n=== EXPECTED BEHAVIOR ===')
    console.log('1. SWAP action should be SKIPPED (hasTransferActions = true)')
    console.log('2. SOL_TRANSFER actions should be processed')
    console.log('3. Net SOL delta should be calculated from SOL_TRANSFER actions')
    
    // Calculate net SOL from transfers
    let netSOL = 0
    solTransfers.forEach(transfer => {
      if (transfer.info.sender === swapper) {
        netSOL -= transfer.info.amount
      } else {
        netSOL += transfer.info.amount
      }
    })
    
    console.log(`\n4. Net SOL delta from transfers: ${netSOL} SOL`)
    console.log(`5. Expected (Solscan): -0.247461329 SOL`)
    console.log(`6. V2 Parser output: -0.494442579 SOL`)

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testAugmentationFlow()
