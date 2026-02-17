import { Request, Response } from 'express'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import WhalesAddressModel from '../models/solana-tokens-whales'
import tokens from '../utils/tokens_Details'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import influencers from '../utils/influencer_Details'

// Add solana token whale list into whaleAddress collection
// Parser V2 Fix Task 8: Use upsert instead of deleteMany+insertMany to avoid data wipe during updates
export const addTokenList = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const bulkOps = tokens.map((token: any) => ({
        updateOne: {
          filter: { tokenAddress: token.tokenAddress },
          update: { $set: token },
          upsert: true,
        },
      }))
      await WhalesAddressModel.bulkWrite(bulkOps)

      return res.status(200).json({
        message: 'New tokens added successfully!',
      })
    } catch (error: any) {
      console.error('Error updating database:', error.message)
      return res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// Add influencer whale list into separate collection
// Parser V2 Fix Task 8: Use upsert instead of deleteMany+insertMany to avoid data wipe during updates
export const addInfluencerList = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const bulkOps = influencers.map((influencer: any) => ({
        updateOne: {
          filter: { influencerUsername: influencer.influencerUsername },
          update: { $set: { ...influencer, lastUpdated: new Date() } },
          upsert: true,
        },
      }))
      await InfluencerWhalesAddressModelV2.bulkWrite(bulkOps)

      return res.status(200).json({
        message: 'Influencer whale data added successfully!',
      })
    } catch (error: any) {
      console.error('Error inserting influencer whales:', error.message)
      return res.status(500).json({ error: 'Internal server error' })
    }
  },
)