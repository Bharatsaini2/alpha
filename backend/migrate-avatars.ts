/**
 * Migration script to assign random avatars to all existing users without avatars
 * Run this once to populate avatars for existing users
 */

import mongoose from 'mongoose'
import { User } from './src/models/user.model'
import { getRandomAvatar } from './src/utils/avatarUtils'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker'

async function migrateAvatars() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Find all users without avatars
    const usersWithoutAvatars = await User.find({ avatar: { $exists: false } })
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
      console.log(`✅ Updated user ${updated}/${usersWithoutAvatars.length}: ${user.walletAddress || user.email}`)
    }

    console.log(`\n✅ Migration complete! Updated ${updated} users with random avatars`)
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateAvatars()
