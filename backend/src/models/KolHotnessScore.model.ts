import { Document, Schema, model } from 'mongoose';

export interface IKolHotnessScoreModel extends Document {
    tokenAddress: string;
    firstBuyTxnSignature?: string;
    isFirstBuyCompleted: boolean;
    uniqueKolAddresses: string[];
    createTimestamp: Date;
}

export interface IKolPurchaseRecordModel extends Document {
    tokenAddress: string;
    kolAddress: string;
    txnSignature: string;
    amount: number;
    isDailyLimitReached?: boolean;
    timestamp: Date;
}

const KolHotnessScoreSchema = new Schema<IKolHotnessScoreModel>({
    tokenAddress: { type: String, required: true },
    firstBuyTxnSignature: { type: String, required: true },
    isFirstBuyCompleted: { type: Boolean, default: false },
    uniqueKolAddresses: {
        type: [String],
        default: [],
        validate: {
            validator: (arr: string[]) => arr.length <= 5,
            message: "uniqueKolAddresses can contain at most 5 items",
        },
    },
    createTimestamp: { type: Date, default: Date.now },
});

export const kolHotnessScoreModel = model<IKolHotnessScoreModel>(
    'KolHotnessScore',
    KolHotnessScoreSchema
);

const KolPurchaseRecordSchema = new Schema<IKolPurchaseRecordModel>({
    tokenAddress: { type: String, required: true, index: true },
    kolAddress: { type: String, required: true, index: true },
    txnSignature: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    isDailyLimitReached: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now, index: true },
});

KolPurchaseRecordSchema.index({ tokenAddress: 1, kolAddress: 1, timestamp: 1 });

export const kolPurchaseRecordModel = model<IKolPurchaseRecordModel>(
    'KolPurchaseRecord',
    KolPurchaseRecordSchema
);

