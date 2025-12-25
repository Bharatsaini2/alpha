import { Document, Schema, model } from 'mongoose'

export interface ICoordinatedWhaleWalletLabel extends Document {
  whaleAddresses: string[]
  createTimestamp: Date
  recalculateCoordinatedGroupLabelTimestamp?: Date
  
}

const coordinatedWhaleWalletLabelSchema = new Schema<ICoordinatedWhaleWalletLabel>({
  whaleAddresses:      { type: [String],  required: true },
  createTimestamp:   { type: Date,    default: Date.now },
  recalculateCoordinatedGroupLabelTimestamp: { type: Date },
})

export const coordinatedWhaleWalletLabelModel = model<ICoordinatedWhaleWalletLabel>(
    'CoordinatedWhaleWalletGroup',
    coordinatedWhaleWalletLabelSchema,
)
