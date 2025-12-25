import cron from 'node-cron'
import { whaleWalletLabelModel } from '../models/whaleLabel.model'
import { syncWhaleLabels } from '../utils/whale-wallet-label-utililies'

// Clean up Dormant Whale labels after 7 days daily at 12:35 AM
cron.schedule('35 0 * * *', async () => {
  console.log('⏰ Running daily dormant whale cleanup job...')

  try {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Find all whales with DORMANT WHALE label
    const dormantWhales = await whaleWalletLabelModel
      .find({ whaleLabel: 'DORMANT WHALE' })
      .lean()

    const whalesToRemove: string[] = []

    for (const whale of dormantWhales) {
      // Check if label was assigned more than 7 days ago
      const labelFirstAssigned = whale.labelFirstAssigned?.['DORMANT WHALE']

      if (labelFirstAssigned) {
        const assignedDate = new Date(labelFirstAssigned)
        if (assignedDate <= sevenDaysAgo) {
          whalesToRemove.push(whale.whaleAddress)
        }
      } else {
        // If no first assigned date, use createTimestamp as fallback
        if (whale.createTimestamp <= sevenDaysAgo) {
          whalesToRemove.push(whale.whaleAddress)
        }
      }
    }

    if (whalesToRemove.length > 0) {
      // Remove DORMANT WHALE labels from whales assigned more than 7 days ago
      await syncWhaleLabels('DORMANT WHALE', whalesToRemove, new Set())

      console.log(
        `✅ Removed DORMANT WHALE label from ${whalesToRemove.length} whales after 7-day period`,
      )
    } else {
      console.log(
        'ℹ️ No DORMANT WHALE labels to remove (all are within 7-day period)',
      )
    }
  } catch (err: any) {
    console.error(`❌ Failed to cleanup dormant whale labels:`, err.message)
  }
})
