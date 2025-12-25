import { Document, Schema, model } from 'mongoose';

export interface IHotnessScoreModel extends Document {
    tokenAddress: string;
    firstBuyTxnSignature?: string;
    isFirstBuyCompleted: boolean;
    uniqueWhaleAddresses: string[];
    createTimestamp: Date;
}

export interface IPurchaseRecordModel extends Document {
    tokenAddress: string;
    whaleAddress: string;
    txnSignature: string;
    amount: number;
    isDailyLimitReached?: boolean;
    timestamp: Date;
}

const HotnessScoreSchema = new Schema<IHotnessScoreModel>({
    tokenAddress: { type: String, required: true },
    firstBuyTxnSignature: { type: String, required: true },
    isFirstBuyCompleted: { type: Boolean, default: false },
    uniqueWhaleAddresses: {
        type: [String],
        default: [],
        validate: {
            validator: (arr: string[]) => arr.length <= 5,
            message: "uniqueWhaleAddresses can contain at most 5 items",
        },
    },
    createTimestamp: { type: Date, default: Date.now },
});

export const hotnessScoreModel = model<IHotnessScoreModel>(
    'HotnessScore',
    HotnessScoreSchema
);

const PurchaseRecordSchema = new Schema<IPurchaseRecordModel>({
    tokenAddress: { type: String, required: true, index: true },
    whaleAddress: { type: String, required: true, index: true },
    txnSignature: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    isDailyLimitReached: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now, index: true },
});

PurchaseRecordSchema.index({ tokenAddress: 1, whaleAddress: 1, timestamp: 1 });

export const purchaseRecordModel = model<IPurchaseRecordModel>(
    'PurchaseRecord',
    PurchaseRecordSchema
);

