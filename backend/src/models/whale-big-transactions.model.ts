import { Document, Schema, model } from 'mongoose'

interface IWhaleBigTransactions extends Document {
  signature: string
  amount: string[]
  tokenAmount: string
  tokenPrice: string
  whaleLabel: string[]
  tweetPosted: boolean
  whaleTokenSymbol: string
  tokenInSymbol: string
  tokenOutSymbol: string
  whaleAddress: string
  tokenInAddress: string
  tokenOutAddress: string
  marketCap: string
  outTokenURL: string
  whaleTokenURL: string
  inTokenURL: string
  alertMessage: string
    hotnessScore: number
  type: 'buy' | 'sell'
  timestamp: Date
  createdAt?: Date
}
const whaleAddressSchema = new Schema<IWhaleBigTransactions>(
  {
    signature: { type: String, unique: true, required: true, index: true },
    amount: [String],
    tokenAmount: String,
    tokenPrice: String,
    whaleLabel: [String],
    tweetPosted: { type: Boolean, default: false },
    whaleTokenSymbol: { type: String, index: true },
    tokenInSymbol: String,
    tokenOutSymbol: String,
    whaleAddress: { type: String, index: true },
    tokenInAddress: String,
    tokenOutAddress: String,
    marketCap: String,
    whaleTokenURL: String,
    inTokenURL: String,
    outTokenURL: String,
    alertMessage: String,
    hotnessScore: Number,
    type: { type: String, enum: ['buy', 'sell'], index: true },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

// ✅ Create indexes explicitly
// whaleAddressSchema.index({ signature: 1 });
// whaleAddressSchema.index({ whaleAddress: 1 });
// whaleAddressSchema.index({ type: 1 });
// whaleAddressSchema.index({ timestamp: -1 });

// ✅ Recommended compound index for dormant whale lookup
whaleAddressSchema.index({ whaleAddress: 1, timestamp: -1 })

const whaleBigTransactionModel = model<IWhaleBigTransactions>(
  'whaleBigTransaction',
  whaleAddressSchema,
)
export default whaleBigTransactionModel
