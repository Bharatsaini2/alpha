import { Document, Schema, model } from 'mongoose'

interface IInfluencerWhaleModelV2 extends Document {
  influencerName?: string
  whalesAddress: string[]
  influencerUsername: string
  influencerFollowerCount?: number
  influencerProfileImageUrl?: string
  lastUpdated?: Date
}

const influencerWhaleAddressSchemaV2: Schema<IInfluencerWhaleModelV2> =
  new Schema<IInfluencerWhaleModelV2>({
    influencerName: { type: String, default: null },
    whalesAddress: [String],
    influencerUsername: { type: String, default: null },
    influencerFollowerCount: { type: Number, default: null },
    influencerProfileImageUrl: { type: String, default: null },
    lastUpdated: { type: Date, default: Date.now },
  })

// Parser V2 Fix Task 7: Index for findInfluencerName / whale address lookups
influencerWhaleAddressSchemaV2.index({ whalesAddress: 1 })

const InfluencerWhalesAddressModelV2 = model<IInfluencerWhaleModelV2>(
  'InfluencerWhalesAddressV2',
  influencerWhaleAddressSchemaV2,
)
export default InfluencerWhalesAddressModelV2
