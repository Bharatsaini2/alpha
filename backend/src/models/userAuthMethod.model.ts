import mongoose, { Document, Schema } from 'mongoose'

export interface IUserAuthMethod extends Document {
  _id: string
  userId: mongoose.Types.ObjectId
  authType: 'email' | 'phantom' | 'google' | 'twitter'
  providerId: string // OAuth provider ID or wallet address
  providerData: {
    // Google/Twitter specific data
    providerUserId?: string
    accessToken?: string
    refreshToken?: string
    profilePicture?: string
    // Phantom specific data
    walletAddress?: string
    publicKey?: string
  }
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
}

const UserAuthMethodSchema = new Schema<IUserAuthMethod>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authType: {
      type: String,
      enum: ['email', 'phantom', 'google', 'twitter'],
      required: true,
    },
    providerId: {
      type: String,
      required: true,
    },
    providerData: {
      providerUserId: String,
      accessToken: String,
      refreshToken: String,
      profilePicture: String,
      walletAddress: String,
      publicKey: String,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

// Compound index to ensure unique auth methods per user
UserAuthMethodSchema.index(
  { userId: 1, authType: 1, providerId: 1 },
  { unique: true },
)
UserAuthMethodSchema.index({ userId: 1, isPrimary: 1 })

export const UserAuthMethod = mongoose.model<IUserAuthMethod>(
  'UserAuthMethod',
  UserAuthMethodSchema,
)
