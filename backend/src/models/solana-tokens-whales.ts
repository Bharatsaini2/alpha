import { Document, Schema, model } from 'mongoose'

interface IWhaleModel extends Document {
  tokenAddress: string
  tokenDecimals: number
  tokenSymbol: string
  whalesAddress: string[]
  imageUrl?: string
}

const whaleAddressSchema: Schema<IWhaleModel> = new Schema<IWhaleModel>({
  tokenAddress: String,
  tokenDecimals: Number,
  tokenSymbol: String,
  whalesAddress: [String],
  imageUrl: { type: String, default: null },
})

const WhalesAddressModel = model<IWhaleModel>(
  'WhalesAddress',
  whaleAddressSchema,
)
export default WhalesAddressModel
