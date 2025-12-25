import mongoose, { Document, Schema } from 'mongoose'

export interface IUserSession extends Document {
  _id: string
  userId: mongoose.Types.ObjectId
  refreshTokenHash: string
  deviceInfo: {
    userAgent?: string
    platform?: string
    browser?: string
  }
  ipAddress?: string
  expiresAt: Date
  lastUsed: Date
  createdAt: Date
}

const UserSessionSchema = new Schema<IUserSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    deviceInfo: {
      userAgent: String,
      platform: String,
      browser: String,
    },
    ipAddress: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient queries
UserSessionSchema.index({ userId: 1 })
UserSessionSchema.index({ refreshTokenHash: 1 })
UserSessionSchema.index({ expiresAt: 1 })

export const UserSession = mongoose.model<IUserSession>(
  'UserSession',
  UserSessionSchema,
)
