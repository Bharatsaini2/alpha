"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Check the latest transaction and see why it didn't match alerts
const mongoose_1 = __importDefault(require("mongoose"));
const userAlert_model_1 = require("./src/models/userAlert.model");
const whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
function checkLatestTransaction() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            yield mongoose_1.default.connect(MONGO_URI);
            console.log('🔗 Connected to MongoDB');
            // Get the very latest transaction
            const latestTx = yield whaleAllTransactionsV2_model_1.default
                .findOne({ whale: { $exists: true } })
                .sort({ timestamp: -1 })
                .lean();
            if (!latestTx) {
                console.log('❌ No whale transactions found');
                return;
            }
            console.log('\n🔍 LATEST TRANSACTION:');
            console.log(`Signature: ${latestTx.signature}`);
            console.log(`Time: ${latestTx.timestamp}`);
            console.log(`Hotness: ${latestTx.hotnessScore || 'N/A'}`);
            console.log(`USD Amount: ${((_b = (_a = latestTx.transaction) === null || _a === void 0 ? void 0 : _a.tokenOut) === null || _b === void 0 ? void 0 : _b.usdAmount) || 'N/A'}`);
            console.log(`Whale Address: ${((_c = latestTx.whale) === null || _c === void 0 ? void 0 : _c.address) || 'N/A'}`);
            console.log(`Whale Labels: ${JSON.stringify(((_d = latestTx.whale) === null || _d === void 0 ? void 0 : _d.labels) || [])}`);
            console.log(`Type: ${latestTx.type || 'N/A'}`);
            // Get your alerts with Telegram chat ID 8519526605 (your dev bot)
            const yourAlerts = yield userAlert_model_1.UserAlert.find({
                enabled: true,
                // Add filter for your user if needed
            }).lean();
            console.log(`\n📋 CHECKING AGAINST ${yourAlerts.length} ALERTS:`);
            for (const alert of yourAlerts) {
                const config = alert.config;
                let matches = true;
                let reasons = [];
                console.log(`\nAlert ${alert._id}:`);
                console.log(`- Hotness >= ${config.hotnessScoreThreshold || 0}`);
                console.log(`- USD >= $${config.minBuyAmountUSD || 0}`);
                console.log(`- Labels: ${((_e = config.walletLabels) === null || _e === void 0 ? void 0 : _e.length) ? config.walletLabels.join(', ') : 'ALL (empty array)'}`);
                // Check hotness
                if (config.hotnessScoreThreshold !== undefined) {
                    const txHotness = latestTx.hotnessScore || 0;
                    if (txHotness < config.hotnessScoreThreshold) {
                        matches = false;
                        reasons.push(`Hotness ${txHotness} < ${config.hotnessScoreThreshold}`);
                    }
                }
                // Check USD amount
                if (config.minBuyAmountUSD !== undefined) {
                    const usdAmount = parseFloat(((_g = (_f = latestTx.transaction) === null || _f === void 0 ? void 0 : _f.tokenOut) === null || _g === void 0 ? void 0 : _g.usdAmount) || '0');
                    if (usdAmount < config.minBuyAmountUSD) {
                        matches = false;
                        reasons.push(`USD ${usdAmount} < ${config.minBuyAmountUSD}`);
                    }
                }
                // Check labels (empty array = accept all)
                if (config.walletLabels && config.walletLabels.length > 0) {
                    const txLabels = ((_h = latestTx.whale) === null || _h === void 0 ? void 0 : _h.labels) || [];
                    const hasMatchingLabel = config.walletLabels.some(label => txLabels.includes(label));
                    if (!hasMatchingLabel) {
                        matches = false;
                        reasons.push(`Labels ${JSON.stringify(txLabels)} not in ${JSON.stringify(config.walletLabels)}`);
                    }
                }
                // Check if it's a whale transaction (not KOL)
                if (!latestTx.whale || !latestTx.whale.address) {
                    matches = false;
                    reasons.push('Not a whale transaction (no whale object)');
                }
                console.log(`Result: ${matches ? '✅ SHOULD MATCH' : '❌ NO MATCH'}`);
                if (!matches) {
                    console.log(`Reasons: ${reasons.join(', ')}`);
                }
            }
        }
        catch (error) {
            console.error('❌ Error:', error);
        }
        finally {
            yield mongoose_1.default.disconnect();
        }
    });
}
checkLatestTransaction().catch(console.error);
