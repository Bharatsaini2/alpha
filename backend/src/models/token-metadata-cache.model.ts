import mongoose, { Schema, Document } from 'mongoose';

export interface ITokenMetadataCache extends Document {
  tokenAddress: string;
  symbol: string;
  name: string;
  source: 'rpc' | 'helius' | 'coingecko' | 'solscan' | 'dexscreener' | 'jupiter' | 'birdeye' | 'shyft';
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
      enum: ['rpc', 'helius', 'coingecko', 'solscan', 'dexscreener', 'jupiter', 'birdeye', 'shyft'],
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

// ✅ NO TTL INDEX - Cache tokens forever!
// Token symbols/names don't change, so we keep them permanently
// This eliminates repeated API calls for the same tokens

const TokenMetadataCacheModel = mongoose.model<ITokenMetadataCache>(
  'TokenMetadataCache',
  tokenMetadataCacheSchema
);

export default TokenMetadataCacheModel;
