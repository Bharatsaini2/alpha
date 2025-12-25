import mongoose, { Document, Schema } from 'mongoose'
import { AlertType, Priority, AlertConfig } from '../types/alert.types'

export interface IUserAlert extends Document {
  _id: string
  userId: mongoose.Types.ObjectId
  type: AlertType
  priority: Priority
  enabled: boolean
  config: AlertConfig
  createdAt: Date
  updatedAt: Date
}

const UserAlertSchema = new Schema<IUserAlert>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(AlertType),
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(Priority),
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
  },
  {
    timestamps: true,
  },
)

// Compound indexes for efficient queries
UserAlertSchema.index({ userId: 1, enabled: 1 })
UserAlertSchema.index({ type: 1, enabled: 1 })

// Validation for alert type-specific config
UserAlertSchema.pre('save', function (next) {
  const alert = this as IUserAlert

  // Validate that type is one of the allowed values
  if (!Object.values(AlertType).includes(alert.type)) {
    return next(
      new Error(
        `Invalid alert type: ${alert.type}. Must be one of: ${Object.values(AlertType).join(', ')}`,
      ),
    )
  }

  // Validate config based on type
  switch (alert.type) {
    case AlertType.ALPHA_STREAM:
      // Config can have minAmount, tokens, wallets
      break
    case AlertType.WHALE_CLUSTER:
      // Config can have minClusterSize, tokens
      break
    case AlertType.KOL_ACTIVITY:
      // Config can have kolIds, tokens
      break
  }

  next()
})

export const UserAlert = mongoose.model<IUserAlert>(
  'UserAlert',
  UserAlertSchema,
)
