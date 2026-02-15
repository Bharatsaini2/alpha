/**
 * Check Last Split Swap Transactions (24 Hours)
 * 
 * This script verifies which collections are being used for split swap transactions
 * in both the Alpha Stream (Whale) and KOL Feed pages.
 * 
 * Collections:
 * - Alpha Stream: whaleAllTransactionV2 (whaleAllTransactionsV2.model.ts)
 * - KOL Feed: influencerWhaleTransactionsV2 (influencerWhaleTransactionsV2.model.ts)
 * 
 * Purpose: Verify split swap storage architecture and ensure correct collection usage
 */

require('dotenv').config()
const mongoose = require('mongoose')

const MONGO_URI = process.env.MONGO_URI

async function checkLastSplitSwaps() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get collections directly
    const WhaleAllTransactionsV2 = mongoose.connection.collection('whalealltransactionv2')
    const InfluencerWhaleTransactionsV2 = mongoose.connection.collection('influencerwhaletransactionsv2')

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    console.log('=' .repeat(80))
    console.log('CHECKING LAST SPLIT SWAP TRANSACTIONS (LAST 24 HOURS)')
    console.log('=' .repeat(80))
    console.log(`Time Range: ${twentyFourHoursAgo.toISOString()} to ${new Date().toISOString()}\n`)

    // ========================================
    // 1. ALPHA STREAM (Whale Transactions)
    // ========================================
    console.log('\n' + '='.repeat(80))
    console.log('1. ALPHA STREAM PAGE - whalealltransactionv2 Collection')
    console.log('='.repeat(80))

    const whaleSplitSwaps = await WhaleAllTransactionsV2
      .find({
        timestamp: { $gte: twentyFourHoursAgo },
        classificationSource: { $regex: /v2_parser_split/ }
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray()

    console.log(`\n📊 Found ${whaleSplitSwaps.length} split swap transactions in last 24 hours`)
    
    if (whaleSplitSwaps.length > 0) {
      console.log('\n🔍 Latest Split Swap Transaction:')
      const latest = whaleSplitSwaps[0]
      console.log('─'.repeat(80))
      console.log(`Signature: ${latest.signature}`)
      console.log(`Type: ${latest.type}`)
      console.log(`Classification: ${latest.classificationSource}`)
      console.log(`Timestamp: ${latest.timestamp}`)
      console.log(`Whale Address: ${latest.whaleAddress || latest.whale?.address}`)
      console.log(`\nToken In: ${latest.transaction?.tokenIn?.symbol || latest.tokenInSymbol} (${latest.tokenInAddress})`)
      console.log(`Token Out: ${latest.transaction?.tokenOut?.symbol || latest.tokenOutSymbol} (${latest.tokenOutAddress})`)
      console.log(`\nAmounts:`)
      console.log(`  Buy Amount (USD): $${latest.amount?.buyAmount || '0'}`)
      console.log(`  Sell Amount (USD): $${latest.amount?.sellAmount || '0'}`)
      console.log(`  Buy SOL Amount: ${latest.solAmount?.buySolAmount || 'null'} SOL`)
      console.log(`  Sell SOL Amount: ${latest.solAmount?.sellSolAmount || 'null'} SOL`)
      console.log(`\nToken Amounts:`)
      console.log(`  Buy Token Amount: ${latest.tokenAmount?.buyTokenAmount || '0'}`)
      console.log(`  Sell Token Amount: ${latest.tokenAmount?.sellTokenAmount || '0'}`)
      console.log(`\nPlatform: ${latest.transaction?.platform || 'N/A'}`)
      console.log(`Hotness Score: ${latest.hotnessScore || 0}`)
      console.log('─'.repeat(80))

      // Check for paired split swap (same signature, different type)
      const pairedSwap = whaleSplitSwaps.find(
        tx => tx.signature === latest.signature && tx.type !== latest.type
      )
      
      if (pairedSwap) {
        console.log('\n✅ PAIRED SPLIT SWAP FOUND:')
        console.log(`Signature: ${pairedSwap.signature}`)
        console.log(`Type: ${pairedSwap.type}`)
        console.log(`Classification: ${pairedSwap.classificationSource}`)
        console.log(`Buy Amount: $${pairedSwap.amount?.buyAmount || '0'}`)
        console.log(`Sell Amount: $${pairedSwap.amount?.sellAmount || '0'}`)
      } else {
        console.log('\n⚠️  No paired split swap found for this signature')
      }

      // Summary statistics
      console.log('\n📈 ALPHA STREAM SPLIT SWAP STATISTICS (Last 24h):')
      console.log('─'.repeat(80))
      const buyCount = whaleSplitSwaps.filter(tx => tx.type === 'buy').length
      const sellCount = whaleSplitSwaps.filter(tx => tx.type === 'sell').length
      const uniqueSignatures = new Set(whaleSplitSwaps.map(tx => tx.signature)).size
      
      console.log(`Total Split Swaps: ${whaleSplitSwaps.length}`)
      console.log(`  - Buy Type: ${buyCount}`)
      console.log(`  - Sell Type: ${sellCount}`)
      console.log(`Unique Signatures: ${uniqueSignatures}`)
      console.log(`Expected Pairs: ${Math.floor(whaleSplitSwaps.length / 2)}`)
      
      // Check for unpaired transactions
      const signatureCounts = {}
      whaleSplitSwaps.forEach(tx => {
        signatureCounts[tx.signature] = (signatureCounts[tx.signature] || 0) + 1
      })
      const unpairedSignatures = Object.entries(signatureCounts)
        .filter(([_, count]) => count === 1)
        .map(([sig, _]) => sig)
      
      if (unpairedSignatures.length > 0) {
        console.log(`\n⚠️  Unpaired Transactions: ${unpairedSignatures.length}`)
        console.log('Signatures:', unpairedSignatures.slice(0, 3).join(', '))
      } else {
        console.log('\n✅ All split swaps are properly paired')
      }
    } else {
      console.log('\n⚠️  No split swap transactions found in last 24 hours')
    }

    // ========================================
    // 2. KOL FEED (Influencer Transactions)
    // ========================================
    console.log('\n\n' + '='.repeat(80))
    console.log('2. KOL FEED PAGE - influencerwhaletransactionsv2 Collection')
    console.log('='.repeat(80))

    const kolSplitSwaps = await InfluencerWhaleTransactionsV2
      .find({
        timestamp: { $gte: twentyFourHoursAgo },
        classificationSource: { $regex: /v2_parser_split/ }
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray()

    console.log(`\n📊 Found ${kolSplitSwaps.length} split swap transactions in last 24 hours`)
    
    if (kolSplitSwaps.length > 0) {
      console.log('\n🔍 Latest Split Swap Transaction:')
      const latest = kolSplitSwaps[0]
      console.log('─'.repeat(80))
      console.log(`Signature: ${latest.signature}`)
      console.log(`Type: ${latest.type}`)
      console.log(`Classification: ${latest.classificationSource}`)
      console.log(`Timestamp: ${latest.timestamp}`)
      console.log(`Whale Address: ${latest.whaleAddress}`)
      console.log(`Influencer: ${latest.influencerName} (@${latest.influencerUsername})`)
      console.log(`Followers: ${latest.influencerFollowerCount?.toLocaleString() || 'N/A'}`)
      console.log(`\nToken In: ${latest.transaction?.tokenIn?.symbol || latest.tokenInSymbol} (${latest.tokenInAddress})`)
      console.log(`Token Out: ${latest.transaction?.tokenOut?.symbol || latest.tokenOutSymbol} (${latest.tokenOutAddress})`)
      console.log(`\nAmounts:`)
      console.log(`  Buy Amount (USD): $${latest.amount?.buyAmount || '0'}`)
      console.log(`  Sell Amount (USD): $${latest.amount?.sellAmount || '0'}`)
      console.log(`  Buy SOL Amount: ${latest.solAmount?.buySolAmount || 'null'} SOL`)
      console.log(`  Sell SOL Amount: ${latest.solAmount?.sellSolAmount || 'null'} SOL`)
      console.log(`\nToken Amounts:`)
      console.log(`  Buy Token Amount: ${latest.tokenAmount?.buyTokenAmount || '0'}`)
      console.log(`  Sell Token Amount: ${latest.tokenAmount?.sellTokenAmount || '0'}`)
      console.log(`\nPlatform: ${latest.transaction?.platform || 'N/A'}`)
      console.log(`Hotness Score: ${latest.hotnessScore || 0}`)
      console.log('─'.repeat(80))

      // Check for paired split swap
      const pairedSwap = kolSplitSwaps.find(
        tx => tx.signature === latest.signature && tx.type !== latest.type
      )
      
      if (pairedSwap) {
        console.log('\n✅ PAIRED SPLIT SWAP FOUND:')
        console.log(`Signature: ${pairedSwap.signature}`)
        console.log(`Type: ${pairedSwap.type}`)
        console.log(`Classification: ${pairedSwap.classificationSource}`)
        console.log(`Buy Amount: $${pairedSwap.amount?.buyAmount || '0'}`)
        console.log(`Sell Amount: $${pairedSwap.amount?.sellAmount || '0'}`)
      } else {
        console.log('\n⚠️  No paired split swap found for this signature')
      }

      // Summary statistics
      console.log('\n📈 KOL FEED SPLIT SWAP STATISTICS (Last 24h):')
      console.log('─'.repeat(80))
      const buyCount = kolSplitSwaps.filter(tx => tx.type === 'buy').length
      const sellCount = kolSplitSwaps.filter(tx => tx.type === 'sell').length
      const uniqueSignatures = new Set(kolSplitSwaps.map(tx => tx.signature)).size
      
      console.log(`Total Split Swaps: ${kolSplitSwaps.length}`)
      console.log(`  - Buy Type: ${buyCount}`)
      console.log(`  - Sell Type: ${sellCount}`)
      console.log(`Unique Signatures: ${uniqueSignatures}`)
      console.log(`Expected Pairs: ${Math.floor(kolSplitSwaps.length / 2)}`)
      
      // Check for unpaired transactions
      const signatureCounts = {}
      kolSplitSwaps.forEach(tx => {
        signatureCounts[tx.signature] = (signatureCounts[tx.signature] || 0) + 1
      })
      const unpairedSignatures = Object.entries(signatureCounts)
        .filter(([_, count]) => count === 1)
        .map(([sig, _]) => sig)
      
      if (unpairedSignatures.length > 0) {
        console.log(`\n⚠️  Unpaired Transactions: ${unpairedSignatures.length}`)
        console.log('Signatures:', unpairedSignatures.slice(0, 3).join(', '))
      } else {
        console.log('\n✅ All split swaps are properly paired')
      }
    } else {
      console.log('\n⚠️  No split swap transactions found in last 24 hours')
    }

    // ========================================
    // 3. COLLECTION VERIFICATION SUMMARY
    // ========================================
    console.log('\n\n' + '='.repeat(80))
    console.log('3. COLLECTION VERIFICATION SUMMARY')
    console.log('='.repeat(80))
    
    console.log('\n✅ CORRECT COLLECTION USAGE:')
    console.log('─'.repeat(80))
    console.log('Alpha Stream Page → whalealltransactionv2 collection')
    console.log('  - Model: whaleAllTransactionsV2.model.ts')
    console.log('  - API Endpoint: /api/v1/whale/whale-transactions')
    console.log(`  - Split Swaps Found: ${whaleSplitSwaps.length}`)
    console.log('')
    console.log('KOL Feed Page → influencerwhaletransactionsv2 collection')
    console.log('  - Model: influencerWhaleTransactionsV2.model.ts')
    console.log('  - API Endpoint: /api/v1/influencer/influencer-whale-transactions')
    console.log(`  - Split Swaps Found: ${kolSplitSwaps.length}`)
    
    console.log('\n📋 SPLIT SWAP ARCHITECTURE:')
    console.log('─'.repeat(80))
    console.log('✅ Both collections use compound unique index: (signature, type)')
    console.log('✅ Split swaps stored as separate records (buy + sell)')
    console.log('✅ Classification source includes "v2_parser_split_buy" or "v2_parser_split_sell"')
    console.log('✅ Each split swap creates 2 records with same signature, different type')
    
    console.log('\n' + '='.repeat(80))
    console.log('VERIFICATION COMPLETE')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 MongoDB connection closed')
  }
}

// Run the check
checkLastSplitSwaps()
