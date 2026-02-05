const axios = require('axios')
require('dotenv').config()

const signature = 'ZkD29a4wUftF4j2fqpyR9GoKrWvnk5iKHxUbr6vBDFoaNwHNadx51P4ECTHRMvWrwbgWkS6KfqAGxPv9mNZzsc8'

async function debugDeltas() {
  console.log('🔍 Fetching transaction from SHYFT API...\n')
  
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY,
        },
      }
    )
    
    const tx = response.data.result
    const swapper = tx.fee_payer
    
    console.log('✅ Transaction fetched\n')
    console.log('Swapper:', swapper)
    console.log('\n' + '='.repeat(80))
    console.log('TOKEN BALANCE CHANGES')
    console.log('='.repeat(80))
    
    tx.token_balance_changes.forEach((change, i) => {
      console.log(`\n[${i + 1}] ${change.mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'LASER'}`)
      console.log(`  Mint: ${change.mint}`)
      console.log(`  Owner: ${change.owner}`)
      console.log(`  Is Swapper: ${change.owner === swapper ? 'YES ✅' : 'NO'}`)
      console.log(`  Change Amount: ${change.change_amount}`)
      console.log(`  Decimals: ${change.decimals}`)
      console.log(`  Normalized: ${change.change_amount / Math.pow(10, change.decimals)}`)
    })
    
    console.log('\n' + '='.repeat(80))
    console.log('SWAPPER DELTAS ONLY')
    console.log('='.repeat(80))
    
    const swapperChanges = tx.token_balance_changes.filter(c => c.owner === swapper)
    const deltaMap = {}
    
    swapperChanges.forEach(change => {
      const mint = change.mint
      const symbol = mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'LASER'
      
      if (!deltaMap[mint]) {
        deltaMap[mint] = {
          symbol,
          mint,
          decimals: change.decimals,
          rawDelta: 0,
          normalizedDelta: 0
        }
      }
      
      deltaMap[mint].rawDelta += change.change_amount
      deltaMap[mint].normalizedDelta = deltaMap[mint].rawDelta / Math.pow(10, change.decimals)
    })
    
    Object.values(deltaMap).forEach(asset => {
      console.log(`\n${asset.symbol}:`)
      console.log(`  Raw Delta: ${asset.rawDelta}`)
      console.log(`  Normalized Delta: ${asset.normalizedDelta}`)
      console.log(`  Direction: ${asset.normalizedDelta > 0 ? 'RECEIVED ✅' : 'SPENT 📤'}`)
    })
    
    console.log('\n' + '='.repeat(80))
    console.log('ACTIONS (SWAP INFO)')
    console.log('='.repeat(80))
    
    const swapAction = tx.actions.find(a => a.type === 'SWAP')
    if (swapAction && swapAction.info) {
      console.log('\nSwap Action Found:')
      console.log('  Swapper:', swapAction.info.swapper)
      console.log('\n  Tokens Swapped IN:')
      console.log('    Symbol:', swapAction.info.tokens_swapped.in.symbol)
      console.log('    Amount:', swapAction.info.tokens_swapped.in.amount)
      console.log('\n  Tokens Swapped OUT:')
      console.log('    Symbol:', swapAction.info.tokens_swapped.out.symbol)
      console.log('    Amount:', swapAction.info.tokens_swapped.out.amount)
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('EXPECTED PARSER OUTPUT')
    console.log('='.repeat(80))
    
    const laserDelta = deltaMap['C7PkAxSx9XDeAfFXjDUn6Nu5dcx8668gUThEqsCwpump']
    const solDelta = deltaMap['So11111111111111111111111111111111111111112']
    
    console.log('\nFor SELL transaction (LASER → SOL):')
    console.log('  Direction: SELL')
    console.log('  Quote Asset (what you sell): LASER')
    console.log('  Base Asset (what you get): SOL')
    if (solDelta) {
      console.log('  baseAmount:', Math.abs(solDelta.normalizedDelta))
    } else {
      console.log('  baseAmount: NO SOL DELTA FOR SWAPPER! ❌')
      console.log('  (SOL went to other addresses, not swapper)')
    }
    console.log('  swapOutputAmount:', Math.abs(laserDelta.normalizedDelta))
    
    console.log('\n' + '='.repeat(80))
    console.log('ACTUAL PARSER OUTPUT (from test)')
    console.log('='.repeat(80))
    console.log('\n  Direction: SELL')
    console.log('  Quote Asset: SOL ❌ (should be LASER)')
    console.log('  Base Asset: LASER ❌ (should be SOL)')
    console.log('  baseAmount: 3552844.976777 ✅')
    console.log('  swapOutputAmount: 5.0170905 ❌ (should be 2.50854525)')
    
    console.log('\n' + '='.repeat(80))
    console.log('ROOT CAUSE')
    console.log('='.repeat(80))
    console.log('\n1. Quote/Base are swapped in QuoteBaseDetector')
    console.log('2. The detector sees SOL as priority asset and assigns it as quote')
    console.log('3. For SELL, it should swap them back but doesn\'t')
    console.log('4. The 5.01 SOL is likely coming from aggregating pool deltas')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugDeltas().catch(console.error)
