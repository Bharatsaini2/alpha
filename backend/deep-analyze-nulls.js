/**
 * Deep analysis of transactions marked as NULL by v1 parser
 * Check if they are actually swaps that should be detected
 */

const fs = require('fs')
const path = require('path')
const { parseShyftTransaction } = require('./src/utils/shyftParser')

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

// Files that returned NULL
const nullFiles = [
  'INIT_USER_VOLUME_ACCUMULATOR2.json',
  'Untitled - response-10.json',
  'Untitled - response-11.json',
  'Untitled - response-14.json',
  'Untitled - response-16.json',
  'Untitled - response-17.json',
  'Untitled - response-18.json',
  'Untitled - response-19.json',
  'Untitled - response-20.json',
  'Untitled - response-21.json',
  'Untitled - response-22.json',
  'Untitled - response-23.json',
]

console.log(`\n${'='.repeat(80)}`)
console.log(`Deep Analysis of NULL Transactions`)
console.log(`${'='.repeat(80)}\n`)

nullFiles.forEach((file, index) => {
  const filePath = path.join(SHYFT_RESPONSE_DIR, file)
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${index + 1}. ${file} - File not found`)
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content)
  const tx = parsed.result || parsed

  console.log(`\n${index + 1}. ${file}`)
  console.log(`${'─'.repeat(80)}`)
  console.log(`Type: ${tx.type} | Status: ${tx.status}`)
  console.log(`Fee Payer: ${tx.fee_payer?.substring(0, 8)}...`)
  console.log(`Signers: ${tx.signers?.map(s => s.substring(0, 8) + '...').join(', ')}`)
  console.log()

  // Analyze balance changes
  const changes = tx.token_balance_changes || []
  console.log(`Balance Changes (${changes.length}):`)
  
  const byOwner = {}
  changes.forEach(change => {
    if (!byOwner[change.owner]) {
      byOwner[change.owner] = []
    }
    byOwner[change.owner].push(change)
  })

  Object.entries(byOwner).forEach(([owner, ownerChanges]) => {
    console.log(`\n  Owner: ${owner.substring(0, 8)}...`)
    ownerChanges.forEach(change => {
      const sign = change.change_amount > 0 ? '+' : ''
      const isSol = change.mint === 'So11111111111111111111111111111111111111112'
      const symbol = isSol ? 'SOL' : change.mint.substring(0, 8) + '...'
      console.log(`    ${sign}${change.change_amount} ${symbol} (decimals: ${change.decimals})`)
    })
  })

  // Check if it's a swap pattern
  console.log(`\n  Analysis:`)
  
  const feePayer = tx.fee_payer
  const feePayerChanges = byOwner[feePayer] || []
  
  if (feePayerChanges.length === 0) {
    console.log(`    ❌ Fee payer has no balance changes`)
  } else {
    const tokenInflows = feePayerChanges.filter(c => c.change_amount > 0 && c.mint !== 'So11111111111111111111111111111111111111112')
    const solOutflows = feePayerChanges.filter(c => c.change_amount < 0 && c.mint === 'So11111111111111111111111111111111111111112')
    const tokenOutflows = feePayerChanges.filter(c => c.change_amount < 0 && c.mint !== 'So11111111111111111111111111111111111111112')
    const solInflows = feePayerChanges.filter(c => c.change_amount > 0 && c.mint === 'So11111111111111111111111111111111111111112')
    
    if (tokenInflows.length > 0 && solOutflows.length > 0) {
      console.log(`    ✅ BUY pattern: Token inflow + SOL outflow (fee payer)`)
    } else if (tokenOutflows.length > 0 && solInflows.length > 0) {
      console.log(`    ✅ SELL pattern: Token outflow + SOL inflow (fee payer)`)
    } else if (tokenInflows.length > 0 || tokenOutflows.length > 0) {
      console.log(`    ⚠️  Token movement but no opposite SOL flow (fee payer)`)
    }
  }

  // Check for SOL transfers in actions
  const actions = tx.actions || []
  const solTransfers = actions.filter(a => a.type === 'SOL_TRANSFER' || a.type === 'TOKEN_TRANSFER')
  
  if (solTransfers.length > 0) {
    console.log(`\n  Actions (${solTransfers.length} transfers):`)
    solTransfers.forEach(action => {
      if (action.info) {
        const sender = action.info.sender?.substring(0, 8) + '...'
        const receiver = action.info.receiver?.substring(0, 8) + '...'
        const amount = action.info.amount
        const token = action.info.token_address?.substring(0, 8) + '...' || 'SOL'
        console.log(`    ${sender} → ${receiver}: ${amount} ${token}`)
      }
    })
  }

  // Check if fee payer sent SOL to someone else (AMM/pool)
  const feePayerSolTransfers = actions.filter(a => 
    (a.type === 'TOKEN_TRANSFER' || a.type === 'SOL_TRANSFER') &&
    a.info?.sender === feePayer &&
    (a.info?.token_address === 'So11111111111111111111111111111111111111112' || a.type === 'SOL_TRANSFER')
  )

  if (feePayerSolTransfers.length > 0) {
    console.log(`\n  💡 Fee payer sent SOL to other addresses (AMM/pool):`)
    feePayerSolTransfers.forEach(transfer => {
      console.log(`    → ${transfer.info.receiver.substring(0, 8)}...: ${transfer.info.amount} SOL`)
    })
  }

  // Check if fee payer received tokens
  const feePayerTokenReceived = actions.filter(a =>
    a.type === 'TOKEN_TRANSFER' &&
    a.info?.receiver === feePayer &&
    a.info?.token_address !== 'So11111111111111111111111111111111111111112'
  )

  if (feePayerTokenReceived.length > 0) {
    console.log(`\n  💡 Fee payer received tokens:`)
    feePayerTokenReceived.forEach(transfer => {
      console.log(`    ← ${transfer.info.amount} tokens from ${transfer.info.sender.substring(0, 8)}...`)
    })
  }

  // Final verdict
  console.log(`\n  Verdict:`)
  if (feePayerSolTransfers.length > 0 && feePayerTokenReceived.length > 0) {
    console.log(`    ✅ THIS IS A SWAP! (BUY: SOL → Token)`)
    console.log(`    ❌ V1 parser missed it because SOL went to AMM/pool, not same owner`)
  } else if (feePayerTokenReceived.length > 0) {
    console.log(`    ⚠️  Token received but no clear SOL payment`)
  } else if (feePayerSolTransfers.length > 0) {
    console.log(`    ⚠️  SOL sent but no token received`)
  } else {
    console.log(`    ❓ Unclear - needs manual review`)
  }

  // Check events
  const events = tx.events || []
  if (events.length > 0) {
    console.log(`\n  Events: ${events.map(e => e.name).join(', ')}`)
  }
})

console.log(`\n${'='.repeat(80)}\n`)
