require('dotenv').config()
const mongoose = require('mongoose')

async function listCollections() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    
    console.log('=== ALL COLLECTIONS ===')
    collections.forEach(col => {
      console.log(`- ${col.name}`)
    })
    
    // Find collections with "influencer" or "kol" in the name
    console.log('\n=== INFLUENCER/KOL RELATED COLLECTIONS ===')
    const kolCollections = collections.filter(col => 
      col.name.toLowerCase().includes('influencer') || 
      col.name.toLowerCase().includes('kol')
    )
    
    for (const col of kolCollections) {
      const count = await db.collection(col.name).countDocuments()
      console.log(`${col.name}: ${count} documents`)
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
  }
}

listCollections()
