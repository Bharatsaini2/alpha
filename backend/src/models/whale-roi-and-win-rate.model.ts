import { Document, Schema, model } from 'mongoose'

export interface IWhaleRoiWinRate extends Document {
    whaleAddress: string
    winRate?: string
    averageROI?: string
    createTimestamp: Date
    recalculateTimestamp?: Date
}

const whaleRoiWinRateSchema = new Schema<IWhaleRoiWinRate>({
    whaleAddress:      { type: String,  required: true },
    winRate:           { type: String },
    averageROI:        { type: String },
    createTimestamp:   { type: Date,    default: Date.now },
    recalculateTimestamp: { type: Date },
})

export const whaleRoiWinRateModel = model<IWhaleRoiWinRate>(
    'WhaleRoiWinRate',
    whaleRoiWinRateSchema,
)
