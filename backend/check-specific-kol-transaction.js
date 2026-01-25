/**
 * Check if a specific transaction exists in influencer table vs whale table
 */

require('dotenv').config()
const mongoose = require('mongoose')

const SIGNATURE = 'vXpzvXXBHsVYBy722MmvPgx2ytXoDGgMtaisy9bWnrCepTdhxuo9BAjxFSE7CCk8RNqxsBuY7Vq1DB5KffZV49m'

async function checkTransaction() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db

    // Check in influencer table
    console.log('=== CHECKING INFLUENCER TABLE ===')
    const influencerTx = await db.collection('influencerwhaletransactionsv2').findOne({
      signature: SIGNATURE
    })

    if (influencerTx) {
      console.log('✅ FOUND in influencerwhaletransactionsv2')
      console.log('\nTransaction Details:')
      console.log('  Signature:', influencerTx.signature)
      console.log('  Type:', influencerTx.type)
      console.log('  KOL Username:', influencerTx.influencerUsername)
      console.log('  KOL Name:', influencerTx.influencerName)
      console.log('  Whale Address:', influencerTx.whaleAddress)
      console.log('  Token Out:', influencerTx.transaction?.tokenOut?.symbol)
      console.log('  Token Out Name:', influencerTx.transaction?.tokenOut?.name)
      console.log('  Amount:', influencerTx.transaction?.tokenOut?.usdAmount)
      console.log('  Hotness Score:', influencerTx.hotnessScore)
      console.log('  Timestamp:', influencerTx.timestamp)
      console.log('  Has whale object?:', !!influencerTx.whale)
      console.log('  Has whaleAddress?:', !!influencerTx.whaleAddress)
    } else {
      console.log('❌ NOT FOUND in influencerwhaletransactionsv2')
    }

    // Check in whale table
    console.log('\n=== CHECKING WHALE TABLE ===')
    const whaleTx = await db.collection('whalealltransactionsv2').findOne({
      signature: SIGNATURE
    })

    if (whaleTx) {
      console.log('✅ FOUND in whalealltransactionsv2')
      console.log('\nTransaction Details:')
      console.log('  Signature:', whaleTx.signature)
      console.log('  Type:', whaleTx.type)
      console.log('  Whale Address:', whaleTx.whale?.address || whaleTx.whaleAddress)
      console.log('  Token Out:', whaleTx.transaction?.tokenOut?.symbol)
      console.log('  Token Out Name:', whaleTx.transaction?.tokenOut?.name)
      console.log('  Amount:', whaleTx.transaction?.tokenOut?.usdAmount)
      console.log('  Hotness Score:', whaleTx.hotnessScore)
      console.log('  Timestamp:', whaleTx.timestamp)
      console.log('  Has whale object?:', !!whaleTx.whale)
      console.log('  Has whaleAddress?:', !!whaleTx.whaleAddress)
    } else {
      console.log('❌ NOT FOUND in whalealltransactionsv2')
    }

    // Check if the whale address is a KOL
    console.log('\n=== CHECKING IF WALLET IS A KOL ===')
    const whaleAddress = influencerTx?.whaleAddress || whaleTx?.whale?.address || whaleTx?.whaleAddress
    
    if (whaleAddress) {
      console.log('Whale Address:', whaleAddress)
      
      const kolInfo = await db.collection('influencerwhalesaddressv2').findOne({
        address: whaleAddress
      })

      if (kolInfo) {
        console.log('✅ This wallet IS a KOL!')
        console.log('  KOL Username:', kolInfo.influencerUsername)
        console.log('  KOL Name:', kolInfo.influencerName)
        console.log('  Followers:', kolInfo.influencerFollowerCount)
      } else {
        console.log('❌ This wallet is NOT a KOL')
      }
    }

    // Summary
    console.log('\n=== SUMMARY ===')
    if (influencerTx && !whaleTx) {
      console.log('✅ This is a PURE KOL transaction (only in influencer table)')
    } else if (!influencerTx && whaleTx) {
      console.log('⚠️  This is a WHALE transaction (only in whale table)')
      console.log('    KOL alerts might be matching whale transactions incorrectly!')
    } else if (influencerTx && whaleTx) {
      console.log('⚠️  This transaction exists in BOTH tables')
      console.log('    This could cause duplicate alerts!')
    } else {
      console.log('❌ Transaction not found in either table')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\nConnection closed')
  }
}

checkTransaction()
