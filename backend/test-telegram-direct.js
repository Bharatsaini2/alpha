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
// Test Telegram service directly
const mongoose_1 = __importDefault(require("mongoose"));
const telegram_service_1 = require("./src/services/telegram.service");
const alert_types_1 = require("./src/types/alert.types");
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
function testTelegramDirect() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield mongoose_1.default.connect(MONGO_URI);
            console.log('🔗 Connected to MongoDB');
            // Test sending a direct alert
            console.log('📤 Testing direct Telegram alert...');
            const testMessage = `🐋 TEST ALERT
Wallet: A4DC...hXgL
Token: TEST
Amount: 100 TEST
USD Value: $849.57
Type: BUY
This is a test message to verify Telegram works.`;
            // Use your user ID from the logs: 695caab996612f706c3ad96b
            const result = yield telegram_service_1.telegramService.queueAlert('695caab996612f706c3ad96b', alert_types_1.AlertType.ALPHA_STREAM, 'test-signature-123', testMessage, alert_types_1.Priority.HIGH);
            console.log('📊 Result:', result);
            if (result) {
                console.log('✅ Alert queued successfully!');
                console.log('🔍 Check your Telegram dev bot (@alphabotdevbot) for the test message.');
            }
            else {
                console.log('❌ Alert failed to queue');
            }
            // Wait a bit for processing
            console.log('⏳ Waiting 5 seconds for message processing...');
            yield new Promise(resolve => setTimeout(resolve, 5000));
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
testTelegramDirect().catch(console.error);
