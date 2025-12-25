import { Request, Response } from 'express'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import WhalesAddressModel from '../models/solana-tokens-whales'
import tokens from '../utils/tokens_Details'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import influencers from '../utils/influencer_Details'

// Add solana token whale list into whaleAddress collection
export const addTokenList = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      // Remove all existing data
      await WhalesAddressModel.deleteMany({})

      // Insert new token data
      await WhalesAddressModel.insertMany(tokens)

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
export const addInfluencerList = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      // Clear existing influencer data
      await InfluencerWhalesAddressModelV2.deleteMany({})

      // Insert new influencer data
      await InfluencerWhalesAddressModelV2.insertMany(influencers)

      return res.status(200).json({
        message: 'Influencer whale data added successfully!',
      })
    } catch (error: any) {
      console.error('Error inserting influencer whales:', error.message)
      return res.status(500).json({ error: 'Internal server error' })
    }
  },
)