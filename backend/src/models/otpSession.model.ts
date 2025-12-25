import mongoose, { Document, Schema } from 'mongoose'

export interface IOTPSession extends Document {
  _id: string
  email: string
  otpCode: string
  expiresAt: Date
  attempts: number
  isUsed: boolean
  createdAt: Date
}

const OTPSessionSchema = new Schema<IOTPSession>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otpCode: {
      type: String,
      required: true,
      length: 6,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index
    },
    attempts: {
      type: Number,
      default: 0,
      max: 3,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient queries
OTPSessionSchema.index({ email: 1, createdAt: -1 })
OTPSessionSchema.index({ otpCode: 1, email: 1 })

export const OTPSession = mongoose.model<IOTPSession>(
  'OTPSession',
  OTPSessionSchema,
)
