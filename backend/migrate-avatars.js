/**
 * Migration script to assign random avatars to all existing users without avatars
 * Run this once to populate avatars for existing users
 * 
 * Usage: node migrate-avatars.js
 */

const mongoose = require('mongoose')
const dotenv = require('dotenv')

dotenv.config()

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker'

// Avatar options
const AVAILABLE_AVATARS = [
  '/avatars/1.JPG',
  '/avatars/2.JPG',
  '/avatars/3.JPG',
  '/avatars/4.JPG',
  '/avatars/5.JPG',
]

function getRandomAvatar() {
  const randomIndex = Math.floor(Math.random() * AVAILABLE_AVATARS.length)
  return AVAILABLE_AVATARS[randomIndex]
}

// User schema (minimal for migration)
const userSchema = new mongoose.Schema({
  email: String,
  walletAddress: String,
  avatar: String,
  createdAt: Date,
  updatedAt: Date,
})

const User = mongoose.model('User', userSchema)

async function migrateAvatars() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Find all users without avatars
    const usersWithoutAvatars = await User.find({ 
      $or: [
        { avatar: { $exists: false } },
        { avatar: null },
        { avatar: '' }
      ]
    })
    
    console.log(`📊 Found ${usersWithoutAvatars.length} users without avatars`)

    if (usersWithoutAvatars.length === 0) {
      console.log('✅ All users already have avatars!')
      await mongoose.disconnect()
      return
    }

    // Assign random avatars to each user
    let updated = 0
    for (const user of usersWithoutAvatars) {
      user.avatar = getRandomAvatar()
      await user.save()
      updated++
      const identifier = user.walletAddress || user.email || user._id
      console.log(`✅ Updated user ${updated}/${usersWithoutAvatars.length}: ${identifier}`)
    }

    console.log(`\n✅ Migration complete! Updated ${updated} users with random avatars`)
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateAvatars()
