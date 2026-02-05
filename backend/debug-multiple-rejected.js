/**
 * Debug multiple rejected transactions to identify action type patterns
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

// Sample of rejected transactions
const SIGNATURES = [
  '4RhDCom3V97Ry8DuryGM9qtcM45jqKJYHrupV82tqBS3ot4jgCHZYhhgcudEzrXgCwmnkmMNyZTegVm1CveS3MVW',
  '2PkzdzSCbihp4YWUitSTTrNkEyWdUreNffWnVGuTtvPDkMucURjHhva2XFxegK2S2naDvcX8EMWTXchs4XKmFizk',
  '3JG5ffx9Wkr5oJgueaSmrB5FTgp2ZE3PRhn8yVTDnwEC2FF4oqaMXTWz5ZgxKwXvR7v6VWq2YbtJvzkjWZnyRgWX',
  '5T1ndwx2EdgMuzog59vYGKUGfXNJiUXA985EjecncEx73ECNYBbHSC7RhdmwQZZ1tQ2322SmhkpJXp6TJTnY8jXd',
  '54jfbrusW9r6cqibywvAwrpDKTdqEgNgcF6pR2XfSLCj2dPLB4ditV9KPa1m9ezFsXGiH4bMVkCB564HvrnAZ2Bh'
]

async function debugTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    const tx = response.data.result
    
    const actionTypes = tx.actions?.map(a => a.type) || []
    const hasSwapAction = actionTypes.includes('SWAP')
    const swapRelatedActions = actionTypes.filter(t => 
      t.includes('SWAP') || t === 'BUY' || t === 'SELL' || t.includes('ROUTE')
    )
    
    return {
      signature: signature.substring(0, 20) + '...',
      protocol: tx.protocol?.name || 'unknown',
      actionTypes,
      hasSwapAction,
      swapRelatedActions,
      tokenBalanceChanges: tx.token_balance_changes?.length || 0
    }
  } catch (error) {
    return {
      signature: signature.substring(0, 20) + '...',
      error: error.message
    }
  }
}

async function main() {
  console.log('Analyzing rejected transactions...\n')
  
  for (const sig of SIGNATURES) {
    const result = await debugTransaction(sig)
    console.log('Signature:', result.signature)
    console.log('Protocol:', result.protocol)
    console.log('Has SWAP action:', result.hasSwapAction)
    console.log('Swap-related actions:', result.swapRelatedActions)
    console.log('Action types:', result.actionTypes)
    console.log('Token balance changes:', result.tokenBalanceChanges)
    console.log()
    
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

main()
