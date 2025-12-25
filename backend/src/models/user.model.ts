import mongoose, { Document, Schema } from 'mongoose'

export interface IUser extends Document {
  _id: string
  email?: string
  emailVerified: boolean
  walletAddress?: string
  displayName?: string
  avatar?: string
  createdAt: Date
  updatedAt: Date
  lastLogin?: Date
  isActive: boolean
  // Telegram fields
  telegramChatId?: string
  telegramLinkToken?: string
  telegramLinkTokenExpiry?: Date
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    walletAddress: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    lastLogin: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Telegram fields with sparse indexes to prevent null collision
    telegramChatId: {
      type: String,
      unique: true,
      sparse: true, // Critical: prevents null collision for existing users
      index: true,
    },
    telegramLinkToken: {
      type: String,
      sparse: true,
    },
    telegramLinkTokenExpiry: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient queries
UserSchema.index({ email: 1 })
UserSchema.index({ walletAddress: 1 })
UserSchema.index({ email: 1, walletAddress: 1 })
UserSchema.index({ telegramLinkToken: 1 })

export const User = mongoose.model<IUser>('User', UserSchema)
