"use strict";
/**
 * Live V1 vs V2 Parser Comparison
 *
 * 1. Start tracking at a specific time
 * 2. Run V2 parser for 5 minutes
 * 3. Log all V2 detections
 * 4. Query DB for V1 transactions in the same time window
 * 5. Compare: Does V2 have all V1 transactions + extras?
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv = __importStar(require("dotenv"));
var axios_1 = __importDefault(require("axios"));
var mongoose_1 = __importDefault(require("mongoose"));
var shyftParserV2_1 = require("./dist/utils/shyftParserV2");
var whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
var solana_tokens_whales_1 = __importDefault(require("./src/models/solana-tokens-whales"));
var fs = __importStar(require("fs"));
var WebSocket = require('ws');
dotenv.config();
var SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
var MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
var WSS_URL = process.env.WSS_URL || '';
var TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
// Color helpers
var colors = {
    green: function (text) { return "\u001B[32m".concat(text, "\u001B[0m"); },
    red: function (text) { return "\u001B[31m".concat(text, "\u001B[0m"); },
    yellow: function (text) { return "\u001B[33m".concat(text, "\u001B[0m"); },
    blue: function (text) { return "\u001B[34m".concat(text, "\u001B[0m"); },
    magenta: function (text) { return "\u001B[35m".concat(text, "\u001B[0m"); },
    cyan: function (text) { return "\u001B[36m".concat(text, "\u001B[0m"); },
    gray: function (text) { return "\u001B[90m".concat(text, "\u001B[0m"); },
    white: function (text) { return "\u001B[37m".concat(text, "\u001B[0m"); },
    bold: function (text) { return "\u001B[1m".concat(text, "\u001B[0m"); },
};
var startTime;
var endTime;
var v2Detections = [];
var v2Rejections = []; // Track rejected transactions with reasons
var ws = null;
var testTimeout;
function fetchShyftTransaction(signature) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 5]);
                    return [4 /*yield*/, axios_1.default.get("https://api.shyft.to/sol/v1/transaction/parsed", {
                            params: {
                                network: 'mainnet-beta',
                                txn_signature: signature,
                            },
                            headers: {
                                'x-api-key': SHYFT_API_KEY,
                            },
                        })];
                case 1:
                    response = _c.sent();
                    return [2 /*return*/, ((_a = response.data) === null || _a === void 0 ? void 0 : _a.result) || null];
                case 2:
                    error_1 = _c.sent();
                    if (!(((_b = error_1.response) === null || _b === void 0 ? void 0 : _b.status) === 429)) return [3 /*break*/, 4];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 3:
                    _c.sent();
                    return [2 /*return*/, fetchShyftTransaction(signature)];
                case 4: return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function handleTransaction(tx) {
    return __awaiter(this, void 0, void 0, function () {
        var signature, shyftResponse, v2Input, parseResult, swapData, inputAmount, outputAmount, inputNormalized, outputNormalized, sellRecord, detection, detection, rejection, error_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    signature = tx.signature;
                    if (!signature)
                        return [2 /*return*/];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetchShyftTransaction(signature)];
                case 2:
                    shyftResponse = _c.sent();
                    if (!shyftResponse)
                        return [2 /*return*/];
                    v2Input = {
                        signature: signature,
                        timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
                        status: shyftResponse.status || 'Success',
                        fee: shyftResponse.fee || 0,
                        fee_payer: shyftResponse.fee_payer || '',
                        signers: shyftResponse.signers || [],
                        protocol: shyftResponse.protocol,
                        token_balance_changes: shyftResponse.token_balance_changes || [],
                        actions: shyftResponse.actions || []
                    };
                    parseResult = (0, shyftParserV2_1.parseShyftTransactionV2)(v2Input);
                    if (parseResult.success && parseResult.data) {
                        swapData = parseResult.data;
                        inputAmount = void 0, outputAmount = void 0;
                        inputNormalized = void 0, outputNormalized = void 0;
                        // Handle both ParsedSwap and SplitSwapPair
                        if ('sellRecord' in swapData) {
                            sellRecord = swapData.sellRecord;
                            // CRITICAL FIX: For split swaps, use correct amount fields per architecture
                            // SELL record: User sold base to get quote
                            // Input = base_amount (tokens sold)
                            // Output = net_wallet_received (what user got after fees)
                            inputAmount = sellRecord.amounts.baseAmount || 0;
                            outputAmount = sellRecord.amounts.netWalletReceived || 0;
                            // These are already normalized amounts from the V2 parser
                            inputNormalized = Math.abs(inputAmount).toFixed(6);
                            outputNormalized = Math.abs(outputAmount).toFixed(6);
                            detection = {
                                signature: signature,
                                timestamp: new Date(),
                                side: sellRecord.direction || 'SELL',
                                inputToken: sellRecord.quoteAsset.symbol || 'UNKNOWN',
                                outputToken: sellRecord.baseAsset.symbol || 'UNKNOWN',
                                inputMint: sellRecord.quoteAsset.mint,
                                outputMint: sellRecord.baseAsset.mint,
                                inputAmount: inputAmount,
                                outputAmount: outputAmount,
                                inputAmountNormalized: inputNormalized,
                                outputAmountNormalized: outputNormalized,
                                whaleAddress: sellRecord.swapper || 'UNKNOWN',
                                confidence: sellRecord.confidence,
                                source: 'v2_parser_split'
                            };
                            v2Detections.push(detection);
                        }
                        else {
                            // ParsedSwap
                            // CRITICAL: Use correct amount fields per architecture
                            // For BUY: Show swap_input_amount (to pool), NOT total_wallet_cost (includes fees)
                            // For SELL: Show net_wallet_received (after fees), NOT swap_output_amount (before fees)
                            if (swapData.direction === 'BUY') {
                                // BUY: User spent quote to buy base
                                // Input = swap_input_amount (what went to pool)
                                // Output = base_amount (tokens received)
                                inputAmount = swapData.amounts.swapInputAmount || 0;
                                outputAmount = swapData.amounts.baseAmount || 0;
                            }
                            else {
                                // SELL: User sold base to receive quote
                                // Input = base_amount (tokens sold)
                                // Output = net_wallet_received (what user actually got after fees)
                                inputAmount = swapData.amounts.baseAmount || 0;
                                outputAmount = swapData.amounts.netWalletReceived || 0;
                            }
                            // These are already normalized amounts from the V2 parser
                            inputNormalized = Math.abs(inputAmount).toFixed(6);
                            outputNormalized = Math.abs(outputAmount).toFixed(6);
                            detection = {
                                signature: signature,
                                timestamp: new Date(),
                                side: swapData.direction || 'UNKNOWN',
                                inputToken: swapData.direction === 'BUY' ? (swapData.quoteAsset.symbol || 'UNKNOWN') : (swapData.baseAsset.symbol || 'UNKNOWN'),
                                outputToken: swapData.direction === 'BUY' ? (swapData.baseAsset.symbol || 'UNKNOWN') : (swapData.quoteAsset.symbol || 'UNKNOWN'),
                                inputMint: swapData.direction === 'BUY' ? swapData.quoteAsset.mint : swapData.baseAsset.mint,
                                outputMint: swapData.direction === 'BUY' ? swapData.baseAsset.mint : swapData.quoteAsset.mint,
                                inputAmount: inputAmount,
                                outputAmount: outputAmount,
                                inputAmountNormalized: inputNormalized,
                                outputAmountNormalized: outputNormalized,
                                whaleAddress: swapData.swapper || 'UNKNOWN',
                                confidence: swapData.confidence,
                                source: 'v2_parser'
                            };
                            v2Detections.push(detection);
                        }
                        console.log(colors.green("\n\u2705 V2 DETECTED: ".concat(swapData.direction || 'UNKNOWN')));
                        console.log(colors.gray("   Signature: ".concat(signature)));
                        console.log(colors.gray("   Whale: ".concat(v2Detections[v2Detections.length - 1].whaleAddress.substring(0, 8), "...")));
                        console.log(colors.gray("   ".concat(v2Detections[v2Detections.length - 1].inputToken, " (").concat(inputNormalized, ") \u2192 ").concat(v2Detections[v2Detections.length - 1].outputToken, " (").concat(outputNormalized, ")")));
                        console.log(colors.gray("   Input Mint:  ".concat(v2Detections[v2Detections.length - 1].inputMint.substring(0, 8), "...")));
                        console.log(colors.gray("   Output Mint: ".concat(v2Detections[v2Detections.length - 1].outputMint.substring(0, 8), "...")));
                        console.log(colors.gray("   Confidence: ".concat(v2Detections[v2Detections.length - 1].confidence, " | Source: ").concat(v2Detections[v2Detections.length - 1].source)));
                    }
                    else {
                        rejection = {
                            signature: signature,
                            timestamp: new Date(),
                            whaleAddress: shyftResponse.fee_payer || 'UNKNOWN',
                            reason: ((_a = parseResult.erase) === null || _a === void 0 ? void 0 : _a.reason) || 'unknown_rejection',
                            success: false
                        };
                        v2Rejections.push(rejection);
                        console.log(colors.red("\n\u274C V2 REJECTED: ".concat(((_b = parseResult.erase) === null || _b === void 0 ? void 0 : _b.reason) || 'unknown')));
                        console.log(colors.gray("   Signature: ".concat(signature)));
                        console.log(colors.gray("   Whale: ".concat((shyftResponse.fee_payer || 'UNKNOWN').substring(0, 8), "...")));
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _c.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function connectWebSocket(whaleAddresses) {
    var _this = this;
    ws = new WebSocket(WSS_URL);
    ws.on('open', function () {
        console.log(colors.green('\n✅ WebSocket connected!'));
        var subscribeMessage = {
            jsonrpc: '2.0',
            id: 1,
            method: 'transactionSubscribe',
            params: [
                {
                    accountInclude: whaleAddresses,
                },
                {
                    commitment: 'confirmed',
                    encoding: 'jsonParsed',
                    transactionDetails: 'full',
                    showRewards: false,
                    maxSupportedTransactionVersion: 0,
                },
            ],
        };
        ws.send(JSON.stringify(subscribeMessage));
        console.log(colors.cyan("\uD83D\uDCE1 Subscribed to ".concat(whaleAddresses.length, " whale addresses")));
        // Record start time
        startTime = new Date();
        console.log(colors.yellow("\n\u23F1\uFE0F  TEST STARTED at ".concat(startTime.toISOString())));
        console.log(colors.yellow("   Will run for 5 minutes until ".concat(new Date(startTime.getTime() + TEST_DURATION_MS).toISOString())));
        console.log(colors.cyan('\n🔍 Monitoring for transactions...\n'));
        // Set timeout to end test after 5 minutes
        testTimeout = setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTime = new Date();
                        console.log(colors.yellow("\n\n\u23F1\uFE0F  TEST ENDED at ".concat(endTime.toISOString())));
                        ws.close();
                        return [4 /*yield*/, compareResults()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, TEST_DURATION_MS);
    });
    ws.on('message', function (data) { return __awaiter(_this, void 0, void 0, function () {
        var message, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    message = JSON.parse(data.toString());
                    if (!(message.method === 'transactionNotification')) return [3 /*break*/, 2];
                    return [4 /*yield*/, handleTransaction(message.params.result)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ws.on('error', function (error) {
        console.error(colors.red('❌ WebSocket error:'), error.message);
    });
    ws.on('close', function () {
        console.log(colors.yellow('\n⚠️  WebSocket disconnected'));
    });
}
function compareResults() {
    return __awaiter(this, void 0, void 0, function () {
        var v1Transactions, v1Signatures, v2Signatures, v2Extras, v1Extras, matches, rejectionReasons, _i, v2Rejections_1, rejection, reason, report, timestamp, detailedCSV, rejectionsCSV, summaryCSV;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log(colors.cyan('\n\n' + '═'.repeat(80)));
                    console.log(colors.cyan(colors.bold('COMPARISON: V1 (Database) vs V2 (Live Parser)')));
                    console.log(colors.cyan('═'.repeat(80)));
                    console.log(colors.white("\nTime Window: ".concat(startTime.toISOString(), " to ").concat(endTime.toISOString())));
                    console.log(colors.white("Duration: ".concat(((endTime.getTime() - startTime.getTime()) / 1000 / 60).toFixed(1), " minutes\n")));
                    // Query V1 transactions from database in the same time window
                    console.log(colors.cyan('📊 Querying V1 transactions from database...\n'));
                    return [4 /*yield*/, whaleAllTransactionsV2_model_1.default.find({
                            'transaction.timestamp': {
                                $gte: startTime,
                                $lte: endTime
                            }
                        }).lean()];
                case 1:
                    v1Transactions = _a.sent();
                    console.log(colors.white("V1 (Database) found: ".concat(v1Transactions.length, " transactions")));
                    console.log(colors.white("V2 (Live Parser) found: ".concat(v2Detections.length, " transactions")));
                    console.log(colors.white("V2 (Live Parser) rejected: ".concat(v2Rejections.length, " transactions\n")));
                    v1Signatures = new Set(v1Transactions.map(function (tx) { var _a; return (_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.signature; }).filter(Boolean));
                    v2Signatures = new Set(v2Detections.map(function (d) { return d.signature; }));
                    v2Extras = Array.from(v2Signatures).filter(function (sig) { return !v1Signatures.has(sig); });
                    v1Extras = Array.from(v1Signatures).filter(function (sig) { return !v2Signatures.has(sig); });
                    matches = Array.from(v1Signatures).filter(function (sig) { return v2Signatures.has(sig); });
                    console.log(colors.cyan('─'.repeat(80)));
                    console.log(colors.green("\u2705 Matches (Both V1 and V2): ".concat(matches.length)));
                    console.log(colors.yellow("\uD83C\uDFAF V2 Extras (V2 found, V1 missed): ".concat(v2Extras.length)));
                    console.log(colors.red("\u274C V1 Extras (V1 found, V2 missed): ".concat(v1Extras.length)));
                    console.log(colors.magenta("\uD83D\uDEAB V2 Rejections (V2 filtered out): ".concat(v2Rejections.length)));
                    console.log(colors.cyan('─'.repeat(80)));
                    // Detailed breakdown
                    if (v2Extras.length > 0) {
                        console.log(colors.yellow("\n\uD83C\uDF89 V2 FOUND ".concat(v2Extras.length, " ADDITIONAL TRANSACTIONS:\n")));
                        v2Extras.slice(0, 20).forEach(function (sig, i) {
                            var detection = v2Detections.find(function (d) { return d.signature === sig; });
                            if (detection) {
                                console.log(colors.yellow("".concat(i + 1, ". ").concat(sig)));
                                console.log(colors.gray("   Whale: ".concat(detection.whaleAddress.substring(0, 8), "...")));
                                console.log(colors.gray("   ".concat(detection.side, ": ").concat(detection.inputToken, " (").concat(detection.inputAmountNormalized, ") \u2192 ").concat(detection.outputToken, " (").concat(detection.outputAmountNormalized, ")")));
                                console.log(colors.gray("   Input Mint:  ".concat(detection.inputMint.substring(0, 8), "...")));
                                console.log(colors.gray("   Output Mint: ".concat(detection.outputMint.substring(0, 8), "...")));
                                console.log(colors.gray("   Confidence: ".concat(detection.confidence, " | Source: ").concat(detection.source, "\n")));
                            }
                        });
                        if (v2Extras.length > 20) {
                            console.log(colors.gray("   ... and ".concat(v2Extras.length - 20, " more\n")));
                        }
                    }
                    if (v1Extras.length > 0) {
                        console.log(colors.red("\n\u26A0\uFE0F  V1 FOUND ".concat(v1Extras.length, " TRANSACTIONS THAT V2 MISSED:\n")));
                        v1Extras.forEach(function (sig, i) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
                            var v1Tx = v1Transactions.find(function (tx) { var _a; return ((_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.signature) === sig; });
                            if (v1Tx) {
                                console.log(colors.red("".concat(i + 1, ". ").concat(sig)));
                                console.log(colors.gray("   Whale: ".concat(((_b = (_a = v1Tx.whale) === null || _a === void 0 ? void 0 : _a.address) === null || _b === void 0 ? void 0 : _b.substring(0, 8)) || ((_c = v1Tx.whaleAddress) === null || _c === void 0 ? void 0 : _c.substring(0, 8)), "...")));
                                console.log(colors.gray("   Type: ".concat(v1Tx.type)));
                                console.log(colors.gray("   ".concat((_e = (_d = v1Tx.transaction) === null || _d === void 0 ? void 0 : _d.tokenIn) === null || _e === void 0 ? void 0 : _e.symbol, " \u2192 ").concat((_g = (_f = v1Tx.transaction) === null || _f === void 0 ? void 0 : _f.tokenOut) === null || _g === void 0 ? void 0 : _g.symbol)));
                                console.log(colors.gray("   Input Mint:  ".concat((_k = (_j = (_h = v1Tx.transaction) === null || _h === void 0 ? void 0 : _h.tokenIn) === null || _j === void 0 ? void 0 : _j.address) === null || _k === void 0 ? void 0 : _k.substring(0, 8), "...")));
                                console.log(colors.gray("   Output Mint: ".concat((_o = (_m = (_l = v1Tx.transaction) === null || _l === void 0 ? void 0 : _l.tokenOut) === null || _m === void 0 ? void 0 : _m.address) === null || _o === void 0 ? void 0 : _o.substring(0, 8), "...")));
                                console.log(colors.gray("   Input Amount:  ".concat((_q = (_p = v1Tx.transaction) === null || _p === void 0 ? void 0 : _p.tokenIn) === null || _q === void 0 ? void 0 : _q.amount)));
                                console.log(colors.gray("   Output Amount: ".concat((_s = (_r = v1Tx.transaction) === null || _r === void 0 ? void 0 : _r.tokenOut) === null || _s === void 0 ? void 0 : _s.amount, "\n")));
                            }
                        });
                    }
                    // Show matches details
                    if (matches.length > 0) {
                        console.log(colors.green("\n\u2705 MATCHES (Both V1 and V2 detected): ".concat(matches.length, "\n")));
                        matches.slice(0, 10).forEach(function (sig, i) {
                            var _a, _b, _c, _d;
                            var v1Tx = v1Transactions.find(function (tx) { var _a; return ((_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.signature) === sig; });
                            var v2Tx = v2Detections.find(function (d) { return d.signature === sig; });
                            if (v1Tx && v2Tx) {
                                console.log(colors.green("".concat(i + 1, ". ").concat(sig)));
                                console.log(colors.gray("   Whale: ".concat(v2Tx.whaleAddress.substring(0, 8), "...")));
                                console.log(colors.gray("   V1: ".concat(v1Tx.type, " | ").concat((_b = (_a = v1Tx.transaction) === null || _a === void 0 ? void 0 : _a.tokenIn) === null || _b === void 0 ? void 0 : _b.symbol, " \u2192 ").concat((_d = (_c = v1Tx.transaction) === null || _c === void 0 ? void 0 : _c.tokenOut) === null || _d === void 0 ? void 0 : _d.symbol)));
                                console.log(colors.gray("   V2: ".concat(v2Tx.side, " | ").concat(v2Tx.inputToken, " (").concat(v2Tx.inputAmountNormalized, ") \u2192 ").concat(v2Tx.outputToken, " (").concat(v2Tx.outputAmountNormalized, ")")));
                                console.log(colors.gray("   Confidence: ".concat(v2Tx.confidence, "\n")));
                            }
                        });
                        if (matches.length > 10) {
                            console.log(colors.gray("   ... and ".concat(matches.length - 10, " more matches\n")));
                        }
                    }
                    // Show rejection analysis
                    if (v2Rejections.length > 0) {
                        console.log(colors.magenta("\n\uD83D\uDEAB V2 REJECTED ".concat(v2Rejections.length, " TRANSACTIONS:\n")));
                        rejectionReasons = {};
                        for (_i = 0, v2Rejections_1 = v2Rejections; _i < v2Rejections_1.length; _i++) {
                            rejection = v2Rejections_1[_i];
                            reason = rejection.reason || 'Unknown';
                            rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
                        }
                        console.log(colors.magenta('Rejection Reasons:'));
                        Object.entries(rejectionReasons)
                            .sort(function (a, b) { return b[1] - a[1]; })
                            .forEach(function (_a) {
                            var reason = _a[0], count = _a[1];
                            var pct = ((count / v2Rejections.length) * 100).toFixed(1);
                            console.log(colors.gray("  ".concat(reason, ": ").concat(count, " (").concat(pct, "%)")));
                        });
                        // Show sample rejections
                        console.log(colors.magenta("\nSample Rejections (first 10):"));
                        v2Rejections.slice(0, 10).forEach(function (rejection, i) {
                            console.log(colors.magenta("".concat(i + 1, ". ").concat(rejection.signature.substring(0, 20), "...")));
                            console.log(colors.gray("   Reason: ".concat(rejection.reason)));
                            console.log(colors.gray("   Whale: ".concat(rejection.whaleAddress.substring(0, 8), "...\n")));
                        });
                        if (v2Rejections.length > 10) {
                            console.log(colors.gray("   ... and ".concat(v2Rejections.length - 10, " more rejections\n")));
                        }
                    }
                    // Final verdict
                    console.log(colors.cyan('\n' + '═'.repeat(80)));
                    console.log(colors.cyan(colors.bold('VERDICT')));
                    console.log(colors.cyan('═'.repeat(80)));
                    if (v2Extras.length > 0 && v1Extras.length === 0) {
                        console.log(colors.green('\n✅ V2 PARSER IS BETTER!'));
                        console.log(colors.green("   V2 found ALL ".concat(v1Transactions.length, " V1 transactions")));
                        console.log(colors.green("   PLUS ".concat(v2Extras.length, " additional transactions that V1 missed")));
                    }
                    else if (v2Extras.length === 0 && v1Extras.length === 0) {
                        console.log(colors.green('\n✅ V2 PARSER MATCHES V1 EXACTLY'));
                        console.log(colors.white("   Both found the same ".concat(matches.length, " transactions")));
                    }
                    else if (v1Extras.length > 0) {
                        console.log(colors.yellow('\n⚠️  V2 PARSER NEEDS IMPROVEMENT'));
                        console.log(colors.yellow("   V2 found ".concat(v2Detections.length, " transactions")));
                        console.log(colors.yellow("   But missed ".concat(v1Extras.length, " that V1 detected")));
                        if (v2Extras.length > 0) {
                            console.log(colors.yellow("   However, V2 found ".concat(v2Extras.length, " new ones that V1 missed")));
                        }
                    }
                    console.log(colors.cyan('\n' + '═'.repeat(80) + '\n'));
                    report = {
                        testWindow: {
                            start: startTime.toISOString(),
                            end: endTime.toISOString(),
                            durationMinutes: (endTime.getTime() - startTime.getTime()) / 1000 / 60
                        },
                        v1: {
                            total: v1Transactions.length,
                            signatures: Array.from(v1Signatures)
                        },
                        v2: {
                            total: v2Detections.length,
                            signatures: Array.from(v2Signatures),
                            detections: v2Detections
                        },
                        v2Rejections: {
                            total: v2Rejections.length,
                            rejections: v2Rejections
                        },
                        comparison: {
                            matches: matches.length,
                            v2Extras: v2Extras.length,
                            v1Extras: v1Extras.length,
                            v2ExtraSignatures: v2Extras,
                            v1ExtraSignatures: v1Extras
                        }
                    };
                    fs.writeFileSync('v1-v2-comparison-report.json', JSON.stringify(report, null, 2));
                    console.log(colors.gray('📄 Detailed report saved to: v1-v2-comparison-report.json\n'));
                    timestamp = Date.now();
                    detailedCSV = __spreadArray([
                        'Signature,Timestamp,Side,Input_Token,Output_Token,Input_Mint,Output_Mint,Input_Amount,Output_Amount,Whale_Address,Confidence,Source'
                    ], v2Detections.map(function (d) {
                        return "\"".concat(d.signature, "\",\"").concat(d.timestamp.toISOString(), "\",\"").concat(d.side, "\",\"").concat(d.inputToken, "\",\"").concat(d.outputToken, "\",\"").concat(d.inputMint, "\",\"").concat(d.outputMint, "\",\"").concat(d.inputAmountNormalized, "\",\"").concat(d.outputAmountNormalized, "\",\"").concat(d.whaleAddress, "\",\"").concat(d.confidence, "\",\"").concat(d.source, "\"");
                    }), true).join('\n');
                    fs.writeFileSync("v2-detections-".concat(timestamp, ".csv"), detailedCSV);
                    console.log(colors.gray("\uD83D\uDCC4 V2 detections CSV saved to: v2-detections-".concat(timestamp, ".csv\n")));
                    rejectionsCSV = __spreadArray([
                        'Signature,Timestamp,Whale_Address,Rejection_Reason'
                    ], v2Rejections.map(function (r) {
                        return "\"".concat(r.signature, "\",\"").concat(r.timestamp.toISOString(), "\",\"").concat(r.whaleAddress, "\",\"").concat(r.reason, "\"");
                    }), true).join('\n');
                    fs.writeFileSync("v2-rejections-".concat(timestamp, ".csv"), rejectionsCSV);
                    console.log(colors.gray("\uD83D\uDCC4 V2 rejections CSV saved to: v2-rejections-".concat(timestamp, ".csv\n")));
                    summaryCSV = [
                        'Metric,Value',
                        "Test Duration (minutes),".concat(((endTime.getTime() - startTime.getTime()) / 1000 / 60).toFixed(2)),
                        "V1 Total,".concat(v1Transactions.length),
                        "V2 Total,".concat(v2Detections.length),
                        "V2 Rejections,".concat(v2Rejections.length),
                        "Matches,".concat(matches.length),
                        "V2 Extras,".concat(v2Extras.length),
                        "V1 Extras,".concat(v1Extras.length)
                    ].join('\n');
                    fs.writeFileSync("comparison-summary-".concat(timestamp, ".csv"), summaryCSV);
                    console.log(colors.gray("\uD83D\uDCC4 Summary CSV saved to: comparison-summary-".concat(timestamp, ".csv\n")));
                    return [4 /*yield*/, mongoose_1.default.disconnect()];
                case 2:
                    _a.sent();
                    console.log(colors.green('✅ Disconnected from MongoDB\n'));
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var whales, whaleAddresses;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
                    console.log(colors.cyan(colors.bold('║         Live V1 vs V2 Parser Comparison (5 Minutes)                       ║')));
                    console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));
                    // Connect to MongoDB
                    console.log(colors.cyan('📊 Connecting to MongoDB...'));
                    return [4 /*yield*/, mongoose_1.default.connect(MONGO_URI)];
                case 1:
                    _a.sent();
                    console.log(colors.green('✅ Connected to MongoDB\n'));
                    // Fetch whale addresses from dedicated whale collection
                    console.log(colors.cyan('📊 Fetching whale addresses from WhalesAddress collection...'));
                    return [4 /*yield*/, solana_tokens_whales_1.default.find({}).lean()];
                case 2:
                    whales = _a.sent();
                    whaleAddresses = whales.flatMap(function (doc) { return doc.whalesAddress; });
                    console.log(colors.green("\u2705 Found ".concat(whaleAddresses.length, " whale addresses from ").concat(whales.length, " token records\n")));
                    // Connect WebSocket and start test
                    connectWebSocket(whaleAddresses);
                    // Handle graceful shutdown
                    process.on('SIGINT', function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    console.log(colors.yellow('\n\n⚠️  Test interrupted by user'));
                                    if (testTimeout)
                                        clearTimeout(testTimeout);
                                    if (ws)
                                        ws.close();
                                    if (!startTime) return [3 /*break*/, 2];
                                    endTime = new Date();
                                    return [4 /*yield*/, compareResults()];
                                case 1:
                                    _a.sent();
                                    return [3 /*break*/, 4];
                                case 2: return [4 /*yield*/, mongoose_1.default.disconnect()];
                                case 3:
                                    _a.sent();
                                    process.exit(0);
                                    _a.label = 4;
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (error) {
    console.error(colors.red('💥 Fatal Error:'), error);
    process.exit(1);
});
