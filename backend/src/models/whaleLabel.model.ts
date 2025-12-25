import { Document, Schema, model } from 'mongoose'

export interface IWhaleWalletLabel extends Document {
  whaleAddress: string
  whaleLabel: string[]
  whaleTokenSymbol: string
  whaleTokenImageUrl: string
  createTimestamp: Date
  recalculateTimestamp?: Date
  recalculateCoordinatedGroupLabelTimestamp?: Date
  labelLockTimestamps?: { [label: string]: Date }
  labelFirstAssigned?: { [label: string]: Date }
}

const whaleWalletLabelSchema = new Schema<IWhaleWalletLabel>({
  whaleAddress: { type: String, required: true },
  whaleLabel: { type: [String], required: true },
  whaleTokenSymbol: { type: String },
  whaleTokenImageUrl: { type: String },
  createTimestamp: { type: Date, default: Date.now },
  recalculateTimestamp: { type: Date },
  recalculateCoordinatedGroupLabelTimestamp: { type: Date },
  labelLockTimestamps: { type: Schema.Types.Mixed, default: {} },
  labelFirstAssigned: { type: Schema.Types.Mixed, default: {} },
})

export const whaleWalletLabelModel = model<IWhaleWalletLabel>(
  'WhaleWalletLabel',
  whaleWalletLabelSchema,
)
