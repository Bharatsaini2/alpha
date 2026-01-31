require('dotenv').config()
const mongoose = require('mongoose')

async function getRejectedTxSignature() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    
    const WhaleAllTransactionModelV2 = mongoose.model(
      'whalealltransactionv2',
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' })
    )

    const tx = await WhaleAllTransactionModelV2.findOne({
      signature: { $regex: '^2wtUN4mn9D2tz18c' }
    }).lean()

    if (tx) {
      console.log(tx.signature)
    } else {
      console.log('Not found')
    }

    await mongoose.disconnect()
  } catch (error) {
    console.error('Error:', error)
  }
}

getRejectedTxSignature()
