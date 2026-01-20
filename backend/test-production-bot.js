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
// Test with production bot using your current chat ID
const axios_1 = __importDefault(require("axios"));
function testProductionBot() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            console.log('📤 Testing production bot directly...');
            const botToken = '8361697087:AAHMcvc85_HrASQkwgBKQ_E9CUt3jL5cEt8'; // Production bot
            const chatId = '8519526605'; // Your current chat ID
            const message = `🧪 TEST ALERT - Production Bot
This is a test to verify Telegram messaging works.
Time: ${new Date().toLocaleString()}`;
            const response = yield axios_1.default.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            });
            console.log('✅ Message sent successfully!');
            console.log('📱 Check your Telegram (@AlphaBlockAIbot) for the test message.');
            console.log('Response:', response.data);
        }
        catch (error) {
            console.error('❌ Error sending message:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        }
    });
}
testProductionBot().catch(console.error);
