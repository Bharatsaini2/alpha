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
// Test script to manually trigger alert processing on recent transactions
const mongoose_1 = __importDefault(require("mongoose"));
const alertMatcher_service_1 = require("./src/services/alertMatcher.service");
const whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
function testAlertProcessing() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            yield mongoose_1.default.connect(MONGO_URI);
            console.log('🔗 Connected to MongoDB');
            // Initialize AlertMatcherService
            console.log('🚀 Initializing AlertMatcherService...');
            const alertMatcher = new alertMatcher_service_1.AlertMatcherService();
            yield alertMatcher.initialize();
            console.log('✅ AlertMatcherService initialized');
            // Get recent transactions that should match alerts
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            console.log(`\n🔍 Finding recent transactions since ${fiveMinutesAgo.toISOString()}...`);
            const recentTx = yield whaleAllTransactionsV2_model_1.default
                .find({
                timestamp: { $gte: fiveMinutesAgo },
                whale: { $exists: true }
            })
                .sort({ timestamp: -1 })
                .limit(5)
                .lean();
            console.log(`Found ${recentTx.length} recent whale transactions to process`);
            // Process each transaction through AlertMatcherService
            for (const tx of recentTx) {
                console.log(`\n📤 Processing transaction: ${tx.signature}`);
                console.log(`   Time: ${tx.timestamp}`);
                console.log(`   Hotness: ${tx.hotnessScore || 'N/A'}`);
                console.log(`   USD: $${((_b = (_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.tokenOut) === null || _b === void 0 ? void 0 : _b.usdAmount) || 'N/A'}`);
                console.log(`   Labels: ${JSON.stringify(((_c = tx.whale) === null || _c === void 0 ? void 0 : _c.labels) || [])}`);
                try {
                    // This will trigger the actual alert matching and Telegram sending
                    yield alertMatcher.processTransaction(tx);
                    console.log(`   ✅ Processed successfully`);
                }
                catch (error) {
                    console.log(`   ❌ Error processing: ${error}`);
                }
            }
            console.log('\n🎯 Test complete! Check your Telegram for alerts.');
            console.log('If you received alerts, the system is working correctly.');
        }
        catch (error) {
            console.error('❌ Error:', error);
        }
        finally {
            yield mongoose_1.default.disconnect();
            process.exit(0);
        }
    });
}
testAlertProcessing().catch(console.error);
