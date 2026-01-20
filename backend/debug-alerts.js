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
// Debug script to check alerts and recent transactions
const mongoose_1 = __importDefault(require("mongoose"));
const userAlert_model_1 = require("./src/models/userAlert.model");
const user_model_1 = require("./src/models/user.model");
const whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
function debugAlerts() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            yield mongoose_1.default.connect(MONGO_URI);
            console.log('🔗 Connected to MongoDB');
            // 1. Check your alert subscriptions
            console.log('\n📋 YOUR ALERT SUBSCRIPTIONS:');
            const alerts = yield userAlert_model_1.UserAlert.find({ enabled: true }).lean();
            for (const alert of alerts) {
                console.log(`Alert ID: ${alert._id}`);
                console.log(`User ID: ${alert.userId}`);
                console.log(`Type: ${alert.type}`);
                console.log(`Config:`, JSON.stringify(alert.config, null, 2));
                // Get user info separately
                const user = yield user_model_1.User.findById(alert.userId).lean();
                console.log(`Telegram Chat ID: ${(user === null || user === void 0 ? void 0 : user.telegramChatId) || 'Not connected'}`);
                console.log(`Wallet: ${(user === null || user === void 0 ? void 0 : user.walletAddress) || 'Not connected'}`);
                console.log('---');
            }
            // 2. Check recent transactions (last 5 minutes for better chance)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            console.log(`\n🕐 RECENT TRANSACTIONS (since ${fiveMinutesAgo.toISOString()}):`);
            const recentTx = yield whaleAllTransactionsV2_model_1.default
                .find({
                timestamp: { $gte: fiveMinutesAgo },
                whale: { $exists: true }
            })
                .sort({ timestamp: -1 })
                .limit(10)
                .lean();
            console.log(`Found ${recentTx.length} recent whale transactions:`);
            for (const tx of recentTx) {
                console.log(`\nTransaction: ${tx.signature}`);
                console.log(`Time: ${tx.timestamp}`);
                console.log(`Hotness: ${tx.hotnessScore || 'N/A'}`);
                console.log(`USD Amount: ${((_b = (_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.tokenOut) === null || _b === void 0 ? void 0 : _b.usdAmount) || 'N/A'}`);
                console.log(`Whale Address: ${((_c = tx.whale) === null || _c === void 0 ? void 0 : _c.address) || 'N/A'}`);
                console.log(`Whale Labels: ${JSON.stringify(((_d = tx.whale) === null || _d === void 0 ? void 0 : _d.labels) || [])}`);
                // Check if this transaction matches any alert
                for (const alert of alerts) {
                    const config = alert.config;
                    let matches = true;
                    let reasons = [];
                    // Check hotness
                    if (config.hotnessScoreThreshold !== undefined) {
                        if ((tx.hotnessScore || 0) < config.hotnessScoreThreshold) {
                            matches = false;
                            reasons.push(`Hotness ${tx.hotnessScore || 0} < ${config.hotnessScoreThreshold}`);
                        }
                    }
                    // Check USD amount
                    if (config.minBuyAmountUSD !== undefined) {
                        const usdAmount = parseFloat(((_f = (_e = tx.transaction) === null || _e === void 0 ? void 0 : _e.tokenOut) === null || _f === void 0 ? void 0 : _f.usdAmount) || '0');
                        if (usdAmount < config.minBuyAmountUSD) {
                            matches = false;
                            reasons.push(`USD ${usdAmount} < ${config.minBuyAmountUSD}`);
                        }
                    }
                    // Check labels (empty array = accept all)
                    if (config.walletLabels && config.walletLabels.length > 0) {
                        const txLabels = ((_g = tx.whale) === null || _g === void 0 ? void 0 : _g.labels) || [];
                        const hasMatchingLabel = config.walletLabels.some(label => txLabels.includes(label));
                        if (!hasMatchingLabel) {
                            matches = false;
                            reasons.push(`Labels ${JSON.stringify(txLabels)} not in ${JSON.stringify(config.walletLabels)}`);
                        }
                    }
                    console.log(`  → Matches Alert ${alert._id}: ${matches ? '✅ YES' : '❌ NO'}`);
                    if (!matches && reasons.length > 0) {
                        console.log(`    Reasons: ${reasons.join(', ')}`);
                    }
                }
            }
            // 3. Show alert criteria summary
            console.log('\n🎯 YOUR ALERT CRITERIA:');
            for (const alert of alerts) {
                console.log(`Alert ${alert._id}:`);
                console.log(`- Hotness >= ${alert.config.hotnessScoreThreshold || 0}`);
                console.log(`- USD Amount >= $${alert.config.minBuyAmountUSD || 0}`);
                console.log(`- Labels: ${((_h = alert.config.walletLabels) === null || _h === void 0 ? void 0 : _h.length) ? alert.config.walletLabels.join(', ') : 'ALL (empty array - accepts any)'}`);
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
debugAlerts().catch(console.error);
