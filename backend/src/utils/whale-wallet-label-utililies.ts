import whaleAllTransactionModel from '../models/whale-all-transactions.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import { whaleWalletLabelModel } from '../models/whaleLabel.model'

interface AddWhaleLabelParams {
  whaleAddress: string
  label: string
  whaleTokenSymbol: string
  whaleTokenImageUrl?: string
}

// Add whale wallet label with 7-day lock system

export const addWhaleLabel = async ({
  whaleAddress,
  label,
  whaleTokenSymbol,
  whaleTokenImageUrl,
}: AddWhaleLabelParams) => {
  if (!whaleAddress || !label || !whaleTokenSymbol) return

  const upperLabel = label.toUpperCase()
  const now = new Date()
  const lockExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

  // 1. Add or update label in whaleWalletLabelModel
  const existing = await whaleWalletLabelModel.findOne({ whaleAddress })

  if (existing) {
    // Check if label is already locked
    const isLabelLocked = isLabelLockedForWhale(existing, upperLabel)

    if (!isLabelLocked) {
      // Update existing: add label (no duplicates) and set lock
      await whaleWalletLabelModel.updateOne(
        { whaleAddress },
        {
          $addToSet: { whaleLabel: upperLabel },
          $set: {
            [`labelLockTimestamps.${upperLabel}`]: lockExpiry,
            [`labelFirstAssigned.${upperLabel}`]: now,
          },
        },
      )
    }
  } else {
    // Create new with all fields including lock
    await whaleWalletLabelModel.create({
      whaleAddress,
      whaleTokenSymbol,
      whaleLabel: [upperLabel],
      whaleTokenImageUrl,
      createTimestamp: now,
      labelLockTimestamps: { [upperLabel]: lockExpiry },
      labelFirstAssigned: { [upperLabel]: now },
    })
  }

  // 2. Fetch updated label array from wallet model
  const updatedWallet = await whaleWalletLabelModel.findOne({ whaleAddress })

  // 3. Overwrite label array in all matching transactions
  if (updatedWallet) {
    await whaleAllTransactionModelV2.updateMany(
      { whaleAddress },
      { $set: { whaleLabel: updatedWallet.whaleLabel || [] } },
    )
  }
}

// Update/sync whale label with 7-day lock system
export const syncWhaleLabels = async (
  label: string,
  previouslyLabeled: string[],
  currentlyValid: Set<string>,
) => {
  const walletsToRemove = previouslyLabeled.filter(
    (wallet) => !currentlyValid.has(wallet),
  )

  if (walletsToRemove.length === 0) return
  const upperLabel = label.toUpperCase()

  // Get all wallets with their lock status
  const walletsWithLocks = await whaleWalletLabelModel.find({
    whaleAddress: { $in: walletsToRemove },
  })

  // Filter out wallets where label is still locked
  const walletsToActuallyRemove = walletsWithLocks
    .filter((wallet) => {
      return !isLabelLockedForWhale(wallet, upperLabel)
    })
    .map((wallet) => wallet.whaleAddress)

  if (walletsToActuallyRemove.length === 0) {
    console.log(
      `[syncWhaleLabels] All ${walletsToRemove.length} wallets have locked '${upperLabel}' labels`,
    )
    return
  }

  // Remove label from whaleWalletLabelModel (only unlocked ones)
  await whaleWalletLabelModel.updateMany(
    { whaleAddress: { $in: walletsToActuallyRemove } },
    {
      $pull: { whaleLabel: upperLabel },
      $unset: {
        [`labelLockTimestamps.${upperLabel}`]: 1,
        [`labelFirstAssigned.${upperLabel}`]: 1,
      },
      $set: { recalculateTimestamp: new Date() },
    },
  )

  // Remove label from whaleAllTransactionModel
  await whaleAllTransactionModelV2.updateMany(
    { whaleAddress: { $in: walletsToActuallyRemove } },
    { $pull: { whaleLabel: upperLabel } },
  )

  console.log(
    `[syncWhaleLabels] Removed label '${upperLabel}' from ${walletsToActuallyRemove.length} wallets (${walletsToRemove.length - walletsToActuallyRemove.length} were locked)`,
  )
}

// Check if a label is locked for a whale
export const isLabelLockedForWhale = (whale: any, label: string): boolean => {
  if (!whale.labelLockTimestamps || !whale.labelLockTimestamps[label]) {
    return false
  }

  const lockExpiry = new Date(whale.labelLockTimestamps[label])
  const now = new Date()

  return now < lockExpiry
}

// getWhaleLabel
export const getWhaleLabelsByAddress = async (
  address: string,
): Promise<string[]> => {
  try {
    const whale = await whaleWalletLabelModel.findOne({ whaleAddress: address })
    return whale?.whaleLabel ?? []
  } catch (error) {
    console.error('Failed to fetch whale labels:', error)
    return []
  }
}
