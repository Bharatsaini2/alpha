import cron from 'node-cron'
import { whaleWalletLabelModel } from '../models/whaleLabel.model'
import { syncWhaleLabels } from '../utils/whale-wallet-label-utililies'

// Clean up expired label locks daily at 12:30 AM
cron.schedule('30 0 * * *', async () => {
  console.log('⏰ Running daily label lock cleanup job...')

  try {
    const now = new Date()

    // Find all whales with expired locks
    const whalesWithExpiredLocks = await whaleWalletLabelModel
      .find({
        labelLockTimestamps: { $exists: true, $ne: {} },
      })
      .lean()

    let totalExpiredLocks = 0
    const labelsToCleanup: { [label: string]: string[] } = {}

    for (const whale of whalesWithExpiredLocks) {
      if (!whale.labelLockTimestamps) continue

      const expiredLabels: string[] = []

      for (const [label, lockTimestamp] of Object.entries(
        whale.labelLockTimestamps,
      )) {
        const lockExpiry = new Date(lockTimestamp as unknown as string)

        if (now >= lockExpiry) {
          expiredLabels.push(label)
          totalExpiredLocks++
        }
      }

      if (expiredLabels.length > 0) {
        // Remove expired lock timestamps and first assigned dates
        const unsetFields: any = {}
        expiredLabels.forEach((label) => {
          unsetFields[`labelLockTimestamps.${label}`] = 1
          unsetFields[`labelFirstAssigned.${label}`] = 1
        })

        await whaleWalletLabelModel.updateOne(
          { whaleAddress: whale.whaleAddress },
          { $unset: unsetFields },
        )

        // Track labels for potential removal
        expiredLabels.forEach((label) => {
          if (!labelsToCleanup[label]) labelsToCleanup[label] = []
          labelsToCleanup[label].push(whale.whaleAddress)
        })
      }
    }

    // Log cleanup results
    console.log(`✅ Cleaned up ${totalExpiredLocks} expired label locks`)

    for (const [label, addresses] of Object.entries(labelsToCleanup)) {
      console.log(
        `   - ${label}: ${addresses.length} wallets now eligible for re-evaluation`,
      )
    }

    // Note: Labels will be removed in the next cron run if they no longer meet criteria
    // This is handled by the existing syncWhaleLabels function in each label's cron job
  } catch (err: any) {
    console.error(`❌ Failed to cleanup label locks:`, err.message)
  }
})
