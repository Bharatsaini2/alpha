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
// Check your actual Telegram chat ID with the dev bot
const mongoose_1 = __importDefault(require("mongoose"));
const user_model_1 = require("./src/models/user.model");
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
function checkChatId() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield mongoose_1.default.connect(MONGO_URI);
            console.log('🔗 Connected to MongoDB');
            // Find your user
            const user = yield user_model_1.User.findById('695caab996612f706c3ad96b').lean();
            if (user) {
                console.log('👤 Your User Info:');
                console.log(`User ID: ${user._id}`);
                console.log(`Wallet: ${user.walletAddress}`);
                console.log(`Telegram Chat ID: ${user.telegramChatId || 'NOT SET'}`);
                console.log(`Email: ${user.email || 'NOT SET'}`);
                if (!user.telegramChatId) {
                    console.log('\n❌ PROBLEM FOUND: No Telegram Chat ID!');
                    console.log('You need to connect your Telegram to the dev bot first.');
                    console.log('1. Go to your local website (localhost:5173)');
                    console.log('2. Go to Telegram Subscription page');
                    console.log('3. Click "Connect Telegram" and follow the dev bot link');
                }
                else {
                    console.log('\n✅ Telegram Chat ID exists');
                    console.log('The issue might be with message processing or bot permissions.');
                }
            }
            else {
                console.log('❌ User not found');
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
checkChatId().catch(console.error);
