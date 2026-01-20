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
// Manually trigger AlertMatcherService on the latest transaction to prove it works
const mongoose_1 = __importDefault(require("mongoose"));
const alertMatcher_service_1 = require("./src/services/alertMatcher.service");
const whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
function manualAlertTest() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            yield mongoose_1.default.connect(MONGO_URI);
            console.log('🔗 Connected to MongoDB');
            // Get the latest transaction (the one with hotness 4)
            const latestTx = yield whaleAllTransactionsV2_model_1.default
                .findOne({
                signature: '4r1xUzfRZamqeNWKLT7gCitGDFb9EWXVLATVzuAYV7xfpdiyaSNiDKnZbdeyp7T7WaeuexZEYBF2mrkUfYCzN8xZ'
            })
                .lean();
            if (!latestTx) {
                console.log('❌ Transaction not found');
                return;
            }
            console.log('🎯 FOUND TRANSACTION:');
            console.log(`Signature: ${latestTx.signature}`);
            console.log(`Hotness: ${latestTx.hotnessScore}`);
            console.log(`USD: $${(_b = (_a = latestTx.transaction) === null || _a === void 0 ? void 0 : _a.tokenOut) === null || _b === void 0 ? void 0 : _b.usdAmount}`);
            console.log(`Labels: ${JSON.stringify((_c = latestTx.whale) === null || _c === void 0 ? void 0 : _c.labels)}`);
            // Initialize AlertMatcherService
            console.log('\n🚀 Initializing AlertMatcherService...');
            const alertMatcher = new alertMatcher_service_1.AlertMatcherService();
            yield alertMatcher.initialize();
            console.log('✅ AlertMatcherService initialized');
            // Manually process this transaction
            console.log('\n📤 Processing transaction through AlertMatcherService...');
            console.log('This should send Telegram alerts if the system works!');
            yield alertMatcher.processTransaction(latestTx);
            console.log('\n✅ Processing complete!');
            console.log('🔍 Check your Telegram dev bot (@alphabotdevbot) NOW!');
            console.log('If you got alerts, the system works perfectly and is ready for production.');
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
manualAlertTest().catch(console.error);
