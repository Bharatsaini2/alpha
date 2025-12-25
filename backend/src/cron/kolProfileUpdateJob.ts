import cron from 'node-cron'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import { getKolProfileFollowerFunction } from '../services/KolProfileFollower'
import { connectDB } from '../config/connectDb'
import pc from 'picocolors'
// mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker
let isRunning = false

// Function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Function to update KOL profile information
const updateKolProfileInfo = async () => {
  if (isRunning) {
    console.log(
      pc.yellow('⚠️ KOL profile update job is already running, skipping...'),
    )
    return
  }

  isRunning = true
  console.log(pc.blue('🔄 Starting KOL profile update job...'))

  try {
    await connectDB()

    // Get all influencers from the database
    const influencers = await InfluencerWhalesAddressModelV2.find({}).sort({
      _id: -1,
    })

    if (influencers.length === 0) {
      console.log(pc.yellow('⚠️ No influencers found in database'))
      return
    }

    console.log(
      pc.green(`📊 Found ${influencers.length} influencers to update`),
    )

    // Process each influencer with 15-minute delay
    for (let i = 0; i < influencers.length; i++) {
      const influencer = influencers[i]

      try {
        console.log(
          pc.cyan(
            `\n🔄 Processing ${i + 1}/${influencers.length}: ${influencer.influencerUsername}`,
          ),
        )

        // Extract username from influencer name (remove @ if present)
        const username = influencer.influencerUsername.replace('@', '')

        // Fetch profile data from Twitter API
        const profileData = await getKolProfileFollowerFunction(username)

        if (
          profileData &&
          profileData.data &&
          profileData.data.name &&
          username &&
          profileData.data.public_metrics?.followers_count != null
        ) {
          const userData = profileData.data
          let profileImageUrl = userData.profile_image_url || null

          if (profileImageUrl) {
            // replace _normal with _bigger
            profileImageUrl = profileImageUrl.replace('_normal', '_bigger')
          }

          // Update the influencer record
          await InfluencerWhalesAddressModelV2.updateOne(
            { _id: influencer._id },
            {
              $set: {
                influencerName: userData.name,
                influencerFollowerCount:
                  userData.public_metrics.followers_count,
                influencerProfileImageUrl: profileImageUrl || null,
                lastUpdated: new Date(),
              },
            },
          )

          console.log(
            pc.green(
              `✅ Updated ${influencer.influencerUsername}: ${userData.public_metrics.followers_count} followers`,
            ),
          )
        } else {
          console.log(
            pc.red(
              `❌ Data missing for ${influencer.influencerUsername}, skipping update.`,
            ),
          )
        }

        // Add 15-minute delay between API calls (except for the last one)
        if (i < influencers.length - 1) {
          console.log(
            pc.yellow('⏳ Waiting 15 minutes before next API call...'),
          )
          await delay(15 * 60 * 1000) // 15 minutes
        }
      } catch (error) {
        console.error(
          pc.red(`❌ Error updating ${influencer.influencerUsername}:`),
          error,
        )
        // Continue with next influencer even if one fails
        continue
      }
    }

    console.log(pc.green('✅ KOL profile update job completed successfully'))
  } catch (error) {
    console.error(pc.red('❌ Error in KOL profile update job:'), error)
  } finally {
    isRunning = false
  }
}

// Schedule the job to run every Sunday at 2:00 AM
cron.schedule(
  '0 2 * * 0',
  async () => {
    console.log(
      pc.blue(
        '📅 Scheduling KOL profile update job - Weekly on Sunday at 2:00 AM',
      ),
    )

    console.log(pc.blue('🕐 KOL profile update job triggered by cron'))
    await updateKolProfileInfo()
    console.log(pc.green('✅ KOL profile update job scheduled successfully'))
  },
  {
    timezone: 'UTC',
  },
)

// Export functions for manual testing
export { updateKolProfileInfo }
