import mongoose, { Schema, Document } from 'mongoose';

export interface ITokenMetadataCache extends Document {
  tokenAddress: string;
  symbol: string;
  name: string;
  source: 'rpc' | 'solscan' | 'dexscreener' | 'jupiter';
  lastUpdated: Date;
  createdAt: Date;
}

const tokenMetadataCacheSchema = new Schema<ITokenMetadataCache>(
  {
    tokenAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['rpc', 'solscan', 'dexscreener', 'jupiter', 'birdeye'],
      required: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'tokenmetadatacache', // Separate collection name
  }
);

// Index for efficient lookups
tokenMetadataCacheSchema.index({ tokenAddress: 1 });

// TTL index: automatically delete entries older than 7 days
tokenMetadataCacheSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const TokenMetadataCacheModel = mongoose.model<ITokenMetadataCache>(
  'TokenMetadataCache',
  tokenMetadataCacheSchema
);

export default TokenMetadataCacheModel;
