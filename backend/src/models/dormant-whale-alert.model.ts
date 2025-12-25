// import { Schema, model, Document, Model } from 'mongoose'

// export interface IDormantWhaleAlert {
//     tweet?: string
//     createdAt: Date
// }

// export type DormantWhaleAlertDocument = IDormantWhaleAlert & Document

// const dormantWhaleAlertSchema = new Schema<IDormantWhaleAlert>({
//     tweet: { type: String },
//     createdAt: { type: Date, default: Date.now },
// })

// export const dormantWhaleAlertModel: Model<IDormantWhaleAlert> = model<IDormantWhaleAlert>('DormantWhaleAlert', dormantWhaleAlertSchema)

import { Schema, model, Document } from 'mongoose'

export interface IDormantWhaleAlert extends Document {
  whaleAddress: string
  whaleTokenSymbol: string
  tokenOutSymbol: string
  amount: Number
  marketCap: Number
  daysSinceLastTx: number
  alertMessage: string
  tweet: boolean
  createdAt: Date
}

const dormantWhaleEventSchema = new Schema<IDormantWhaleAlert>({
  whaleAddress: { type: String },
  whaleTokenSymbol: { type: String },
  tokenOutSymbol: { type: String },
  amount: { type: Number },
  marketCap: { type: Number },
  daysSinceLastTx: { type: Number },
  alertMessage: { type: String },
  tweet: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
})

export const dormantWhaleAlertModel = model<IDormantWhaleAlert>(
  'DormantWhaleEvents',
  dormantWhaleEventSchema,
)
