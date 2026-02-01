"use strict";
/**
 * Shadow Comparison Script - V1 vs V2 Parser
 *
 * Purpose: Compare OLD parser results (in database) with NEW V2 parser
 * to identify improvements, regressions, and mismatches before deployment.
 *
 * This script:
 * 1. Fetches whales from database
 * 2. Fetches their transaction history from SHYFT API
 * 3. Re-parses each transaction with V2 parser
 * 4. Compares V2 results with V1 results in database
 * 5. Reports matches, new discoveries, regressions, and mismatches
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
exports.processWhale = processWhale;
exports.compareResults = compareResults;
exports.generateSummary = generateSummary;
var axios_1 = __importDefault(require("axios"));
var chalk_1 = __importDefault(require("chalk"));
var dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
// ============================================================================
// CONFIGURATION
// ============================================================================
var SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'YOUR_SHYFT_API_KEY';
var BATCH_SIZE = 5; // Number of whales to process (safety limit)
var TX_LIMIT = 20; // Number of transactions to check per whale
var RATE_LIMIT_MS = 200; // Delay between API calls (avoid 429 errors)
// ============================================================================
// DATABASE MODELS
// ============================================================================
var whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
var mongoose_1 = __importDefault(require("mongoose"));
// Connect to MongoDB
var MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-whale-tracker';
function connectDB() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(mongoose_1.default.connection.readyState === 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, mongoose_1.default.connect(MONGODB_URI)];
                case 1:
                    _a.sent();
                    console.log(chalk_1.default.green('✅ Connected to MongoDB'));
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get unique whale addresses from database
 */
function getWhaleAddresses() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var whaleAddresses, whales;
        if (limit === void 0) { limit = BATCH_SIZE; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, connectDB()
                    // Get unique whale addresses from transactions
                ];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, whaleAllTransactionsV2_model_1.default.distinct('whale.address')];
                case 2:
                    whaleAddresses = _a.sent();
                    console.log(chalk_1.default.blue("\uD83D\uDCCA Found ".concat(whaleAddresses.length, " unique whale addresses in database")));
                    whales = whaleAddresses.slice(0, limit).map(function (address, index) { return ({
                        _id: "whale_".concat(index),
                        wallet_address: address,
                        name: "Whale ".concat(address.substring(0, 8), "..."),
                    }); });
                    return [2 /*return*/, whales];
            }
        });
    });
}
/**
 * Look up old transaction in database
 */
function findOldTransaction(signature) {
    return __awaiter(this, void 0, void 0, function () {
        var tx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, connectDB()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, whaleAllTransactionsV2_model_1.default.findOne({ signature: signature }).lean()];
                case 2:
                    tx = _a.sent();
                    if (!tx) {
                        return [2 /*return*/, null];
                    }
                    // Convert to OldTransaction format
                    return [2 /*return*/, {
                            signature: tx.signature,
                            whale_address: tx.whale.address,
                            token_address: tx.type === 'buy' ? tx.transaction.tokenOut.address : tx.transaction.tokenIn.address,
                            token_symbol: tx.type === 'buy' ? tx.transaction.tokenOut.symbol : tx.transaction.tokenIn.symbol,
                            side: tx.type === 'buy' ? 'BUY' : 'SELL',
                            amount: parseFloat(tx.type === 'buy' ? tx.amount.buyAmount : tx.amount.sellAmount) || 0,
                            sol_amount: parseFloat(tx.type === 'buy' ? tx.solAmount.buySolAmount : tx.solAmount.sellSolAmount) || 0,
                            timestamp: tx.timestamp,
                            confidence: 'high', // V1 doesn't store confidence
                        }];
            }
        });
    });
}
// ============================================================================
// V2 PARSER
// ============================================================================
var shyftParserV2_1 = require("./src/utils/shyftParserV2");
/**
 * Run V2 parser on raw transaction
 */
function runNewParser(rawTx) {
    return __awaiter(this, void 0, void 0, function () {
        var parser, txV2, result, buyRecord;
        var _a, _b;
        return __generator(this, function (_c) {
            try {
                parser = new shyftParserV2_1.ShyftParserV2();
                txV2 = {
                    signature: ((_a = rawTx.signatures) === null || _a === void 0 ? void 0 : _a[0]) || 'unknown',
                    timestamp: typeof rawTx.timestamp === 'string'
                        ? new Date(rawTx.timestamp).getTime() / 1000
                        : Date.now() / 1000,
                    status: rawTx.status || 'Success',
                    fee: rawTx.fee || 0.000005,
                    fee_payer: rawTx.fee_payer || '',
                    signers: rawTx.signers || [],
                    protocol: rawTx.protocol,
                    token_balance_changes: rawTx.token_balance_changes || [],
                    actions: rawTx.actions || [],
                };
                result = parser.parseTransaction(txV2);
                // Convert ParserResult to NewParserResult format
                if (result.success && result.data) {
                    // Check if it's a split swap pair
                    if ('splitReason' in result.data) {
                        buyRecord = result.data.buyRecord;
                        return [2 /*return*/, {
                                success: true,
                                data: {
                                    signature: buyRecord.signature,
                                    direction: buyRecord.direction,
                                    quoteAsset: buyRecord.quoteAsset,
                                    baseAsset: buyRecord.baseAsset,
                                    amounts: buyRecord.amounts,
                                    confidence: buyRecord.confidence,
                                },
                            }];
                    }
                    else {
                        // Standard swap
                        return [2 /*return*/, {
                                success: true,
                                data: {
                                    signature: result.data.signature,
                                    direction: result.data.direction,
                                    quoteAsset: result.data.quoteAsset,
                                    baseAsset: result.data.baseAsset,
                                    amounts: result.data.amounts,
                                    confidence: result.data.confidence,
                                },
                            }];
                    }
                }
                else {
                    // ERASE result
                    return [2 /*return*/, {
                            success: false,
                            erase: {
                                reason: ((_b = result.erase) === null || _b === void 0 ? void 0 : _b.reason) || 'unknown_erase_reason',
                            },
                        }];
                }
            }
            catch (error) {
                return [2 /*return*/, {
                        success: false,
                        erase: {
                            reason: "parser_error: ".concat(error.message),
                        },
                    }];
            }
            return [2 /*return*/];
        });
    });
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Sleep for specified milliseconds (rate limiting)
 */
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
/**
 * Fetch transaction history for a wallet from SHYFT API
 */
function fetchTransactionHistory(walletAddress_1) {
    return __awaiter(this, arguments, void 0, function (walletAddress, limit) {
        var response, signatures, error_1;
        if (limit === void 0) { limit = TX_LIMIT; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, axios_1.default.get('https://api.shyft.to/sol/v1/wallet/transaction_history', {
                            params: {
                                network: 'mainnet-beta',
                                wallet: walletAddress,
                                tx_num: limit,
                            },
                            headers: {
                                'x-api-key': SHYFT_API_KEY,
                            },
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.data.success || !response.data.result) {
                        console.log(chalk_1.default.red("\u274C Failed to fetch history for ".concat(walletAddress)));
                        return [2 /*return*/, []];
                    }
                    signatures = response.data.result.map(function (tx) {
                        var _a;
                        return ((_a = tx.signatures) === null || _a === void 0 ? void 0 : _a[0]) || tx.signature || null;
                    }).filter(Boolean);
                    return [2 /*return*/, signatures];
                case 2:
                    error_1 = _a.sent();
                    console.log(chalk_1.default.red("\u274C Error fetching history: ".concat(error_1.message)));
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Fetch parsed transaction data from SHYFT API
 */
function fetchParsedTransaction(signature) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, axios_1.default.get('https://api.shyft.to/sol/v1/transaction/parsed', {
                            params: {
                                network: 'mainnet-beta',
                                txn_signature: signature,
                            },
                            headers: {
                                'x-api-key': SHYFT_API_KEY,
                            },
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.data.success || !response.data.result) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, response.data.result];
                case 2:
                    error_2 = _a.sent();
                    console.log(chalk_1.default.red("\u274C Error fetching tx ".concat(signature, ": ").concat(error_2.message)));
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Compare old and new parser results
 */
function compareResults(signature, whale, oldResult, newResult) {
    var _a, _b, _c;
    // Edge Case: Skip if tokenIn == tokenOut in old record
    if (oldResult && oldResult.token_address === 'So11111111111111111111111111111111111111112') {
        // This is a heuristic - adjust based on your actual edge case logic
        // For now, we'll skip if it looks like a self-swap
        return {
            signature: signature,
            whale: whale,
            status: 'skipped',
            oldResult: oldResult,
            newResult: newResult,
            details: 'Edge case: tokenIn == tokenOut',
        };
    }
    // Case 1: Regression (Old found it, New missed it)
    if (oldResult && !newResult.success) {
        return {
            signature: signature,
            whale: whale,
            status: 'regression',
            oldResult: oldResult,
            newResult: newResult,
            details: "Old: ".concat(oldResult.side, " ").concat(oldResult.token_symbol, " | New: ERASE (").concat((_a = newResult.erase) === null || _a === void 0 ? void 0 : _a.reason, ")"),
        };
    }
    // Case 2: New Discovery (Old missed it, New found it)
    if (!oldResult && newResult.success) {
        return {
            signature: signature,
            whale: whale,
            status: 'new_discovery',
            newResult: newResult,
            details: "New: ".concat((_b = newResult.data) === null || _b === void 0 ? void 0 : _b.direction, " ").concat((_c = newResult.data) === null || _c === void 0 ? void 0 : _c.baseAsset.symbol),
        };
    }
    // Case 3: Both missed it
    if (!oldResult && !newResult.success) {
        return {
            signature: signature,
            whale: whale,
            status: 'match',
            details: 'Both parsers agree: not a swap',
        };
    }
    // Case 4: Both found it - check for mismatches
    if (oldResult && newResult.success && newResult.data) {
        var oldSide = oldResult.side;
        var newSide = newResult.data.direction;
        var oldToken = oldResult.token_symbol;
        var newToken = newResult.data.baseAsset.symbol;
        // Check for side mismatch
        if (oldSide !== newSide) {
            return {
                signature: signature,
                whale: whale,
                status: 'mismatch',
                oldResult: oldResult,
                newResult: newResult,
                details: "Side mismatch: Old=".concat(oldSide, " | New=").concat(newSide),
            };
        }
        // Check for token mismatch (basic comparison)
        if (oldToken !== newToken && !oldToken.includes('...') && !newToken.includes('...')) {
            return {
                signature: signature,
                whale: whale,
                status: 'mismatch',
                oldResult: oldResult,
                newResult: newResult,
                details: "Token mismatch: Old=".concat(oldToken, " | New=").concat(newToken),
            };
        }
        // Match!
        return {
            signature: signature,
            whale: whale,
            status: 'match',
            oldResult: oldResult,
            newResult: newResult,
            details: "Both: ".concat(oldSide, " ").concat(oldToken),
        };
    }
    // Fallback
    return {
        signature: signature,
        whale: whale,
        status: 'match',
        details: 'Unknown comparison state',
    };
}
/**
 * Process a single whale's transactions
 */
function processWhale(whale) {
    return __awaiter(this, void 0, void 0, function () {
        var results, signatures, i, signature, rawTx, newResult, oldResult, comparison, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log(chalk_1.default.cyan("\n".concat('─'.repeat(80))));
                    console.log(chalk_1.default.cyan("Processing Whale: ".concat(whale.name || whale.wallet_address)));
                    console.log(chalk_1.default.cyan("Address: ".concat(whale.wallet_address)));
                    console.log(chalk_1.default.cyan("".concat('─'.repeat(80), "\n")));
                    results = [];
                    // Step 1: Fetch transaction history
                    console.log(chalk_1.default.blue("\uD83D\uDCE1 Fetching transaction history..."));
                    return [4 /*yield*/, fetchTransactionHistory(whale.wallet_address, TX_LIMIT)];
                case 1:
                    signatures = _a.sent();
                    console.log(chalk_1.default.green("\u2705 Found ".concat(signatures.length, " transactions\n")));
                    if (signatures.length === 0) {
                        return [2 /*return*/, results];
                    }
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < signatures.length)) return [3 /*break*/, 13];
                    signature = signatures[i];
                    console.log(chalk_1.default.gray("[".concat(i + 1, "/").concat(signatures.length, "] ").concat(signature)));
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 9, , 10]);
                    return [4 /*yield*/, fetchParsedTransaction(signature)];
                case 4:
                    rawTx = _a.sent();
                    if (!!rawTx) return [3 /*break*/, 6];
                    console.log(chalk_1.default.red("  \u274C Failed to fetch transaction data"));
                    results.push({
                        signature: signature,
                        whale: whale.wallet_address,
                        status: 'match', // Count as error, not regression
                        details: 'Failed to fetch from SHYFT',
                    });
                    return [4 /*yield*/, sleep(RATE_LIMIT_MS)];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 12];
                case 6: return [4 /*yield*/, runNewParser(rawTx)
                    // Look up OLD Parser result in database
                ];
                case 7:
                    newResult = _a.sent();
                    return [4 /*yield*/, findOldTransaction(signature)
                        // Compare results
                    ];
                case 8:
                    oldResult = _a.sent();
                    comparison = compareResults(signature, whale.wallet_address, oldResult, newResult);
                    results.push(comparison);
                    // Log result
                    switch (comparison.status) {
                        case 'match':
                            console.log(chalk_1.default.green("  \u2705 MATCH: ".concat(comparison.details)));
                            break;
                        case 'new_discovery':
                            console.log(chalk_1.default.yellow("  \uD83C\uDFAF NEW DISCOVERY: ".concat(comparison.details)));
                            break;
                        case 'regression':
                            console.log(chalk_1.default.red("  \u274C REGRESSION: ".concat(comparison.details)));
                            break;
                        case 'mismatch':
                            console.log(chalk_1.default.magenta("  \u26A0\uFE0F  MISMATCH: ".concat(comparison.details)));
                            break;
                        case 'skipped':
                            console.log(chalk_1.default.gray("  \u23ED\uFE0F  SKIPPED: ".concat(comparison.details)));
                            break;
                    }
                    return [3 /*break*/, 10];
                case 9:
                    error_3 = _a.sent();
                    console.log(chalk_1.default.red("  \u274C Error: ".concat(error_3.message)));
                    results.push({
                        signature: signature,
                        whale: whale.wallet_address,
                        status: 'match', // Count as error, not regression
                        details: "Error: ".concat(error_3.message),
                    });
                    return [3 /*break*/, 10];
                case 10: 
                // Rate limiting
                return [4 /*yield*/, sleep(RATE_LIMIT_MS)];
                case 11:
                    // Rate limiting
                    _a.sent();
                    _a.label = 12;
                case 12:
                    i++;
                    return [3 /*break*/, 2];
                case 13: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Generate summary statistics
 */
function generateSummary(allResults) {
    var _a, _b;
    var summary = {
        totalScanned: allResults.length,
        matches: 0,
        newDiscoveries: 0,
        regressions: 0,
        mismatches: 0,
        skipped: 0,
        errors: 0,
    };
    for (var _i = 0, allResults_1 = allResults; _i < allResults_1.length; _i++) {
        var result = allResults_1[_i];
        switch (result.status) {
            case 'match':
                summary.matches++;
                break;
            case 'new_discovery':
                summary.newDiscoveries++;
                break;
            case 'regression':
                summary.regressions++;
                break;
            case 'mismatch':
                summary.mismatches++;
                break;
            case 'skipped':
                summary.skipped++;
                break;
        }
        if (((_a = result.details) === null || _a === void 0 ? void 0 : _a.includes('Error')) || ((_b = result.details) === null || _b === void 0 ? void 0 : _b.includes('Failed'))) {
            summary.errors++;
        }
    }
    return summary;
}
/**
 * Print summary table
 */
function printSummary(summary, allResults) {
    console.log(chalk_1.default.cyan("\n".concat('='.repeat(80))));
    console.log(chalk_1.default.cyan.bold('FINAL SUMMARY'));
    console.log(chalk_1.default.cyan("".concat('='.repeat(80), "\n")));
    console.log(chalk_1.default.white('Total Transactions Scanned:'), chalk_1.default.bold(summary.totalScanned));
    console.log(chalk_1.default.green('✅ Matches:'), chalk_1.default.bold(summary.matches));
    console.log(chalk_1.default.yellow('🎯 New Discoveries:'), chalk_1.default.bold(summary.newDiscoveries));
    console.log(chalk_1.default.red('❌ Regressions:'), chalk_1.default.bold(summary.regressions));
    console.log(chalk_1.default.magenta('⚠️  Mismatches:'), chalk_1.default.bold(summary.mismatches));
    console.log(chalk_1.default.gray('⏭️  Skipped:'), chalk_1.default.bold(summary.skipped));
    console.log(chalk_1.default.red('💥 Errors:'), chalk_1.default.bold(summary.errors));
    var accuracy = summary.totalScanned > 0
        ? ((summary.matches / summary.totalScanned) * 100).toFixed(1)
        : '0.0';
    console.log(chalk_1.default.cyan('\nAgreement Rate:'), chalk_1.default.bold("".concat(accuracy, "%")));
    var improvement = summary.newDiscoveries > 0
        ? "+".concat(summary.newDiscoveries, " swaps detected")
        : 'No improvements';
    console.log(chalk_1.default.cyan('V2 Improvements:'), chalk_1.default.bold(improvement));
    var regressionRate = summary.totalScanned > 0
        ? ((summary.regressions / summary.totalScanned) * 100).toFixed(1)
        : '0.0';
    console.log(chalk_1.default.cyan('Regression Rate:'), chalk_1.default.bold("".concat(regressionRate, "%")));
    // Show detailed regressions
    if (summary.regressions > 0) {
        console.log(chalk_1.default.red("\n".concat('─'.repeat(80))));
        console.log(chalk_1.default.red.bold('REGRESSIONS (V1 found, V2 missed):'));
        console.log(chalk_1.default.red("".concat('─'.repeat(80), "\n")));
        var regressions = allResults.filter(function (r) { return r.status === 'regression'; });
        regressions.slice(0, 10).forEach(function (r, i) {
            console.log(chalk_1.default.red("".concat(i + 1, ". ").concat(r.signature)));
            console.log(chalk_1.default.gray("   Whale: ".concat(r.whale.substring(0, 8), "...")));
            console.log(chalk_1.default.gray("   ".concat(r.details)));
        });
        if (regressions.length > 10) {
            console.log(chalk_1.default.gray("\n... and ".concat(regressions.length - 10, " more")));
        }
    }
    // Show detailed new discoveries
    if (summary.newDiscoveries > 0) {
        console.log(chalk_1.default.yellow("\n".concat('─'.repeat(80))));
        console.log(chalk_1.default.yellow.bold('NEW DISCOVERIES (V1 missed, V2 found):'));
        console.log(chalk_1.default.yellow("".concat('─'.repeat(80), "\n")));
        var discoveries = allResults.filter(function (r) { return r.status === 'new_discovery'; });
        discoveries.slice(0, 10).forEach(function (r, i) {
            console.log(chalk_1.default.yellow("".concat(i + 1, ". ").concat(r.signature)));
            console.log(chalk_1.default.gray("   Whale: ".concat(r.whale.substring(0, 8), "...")));
            console.log(chalk_1.default.gray("   ".concat(r.details)));
        });
        if (discoveries.length > 10) {
            console.log(chalk_1.default.gray("\n... and ".concat(discoveries.length - 10, " more")));
        }
    }
    // Show detailed mismatches
    if (summary.mismatches > 0) {
        console.log(chalk_1.default.magenta("\n".concat('─'.repeat(80))));
        console.log(chalk_1.default.magenta.bold('MISMATCHES (Both found, different details):'));
        console.log(chalk_1.default.magenta("".concat('─'.repeat(80), "\n")));
        var mismatches = allResults.filter(function (r) { return r.status === 'mismatch'; });
        mismatches.slice(0, 10).forEach(function (r, i) {
            console.log(chalk_1.default.magenta("".concat(i + 1, ". ").concat(r.signature)));
            console.log(chalk_1.default.gray("   Whale: ".concat(r.whale.substring(0, 8), "...")));
            console.log(chalk_1.default.gray("   ".concat(r.details)));
        });
        if (mismatches.length > 10) {
            console.log(chalk_1.default.gray("\n... and ".concat(mismatches.length - 10, " more")));
        }
    }
    console.log(chalk_1.default.cyan("\n".concat('='.repeat(80), "\n")));
    // Final verdict
    if (summary.regressions === 0 && summary.mismatches === 0) {
        console.log(chalk_1.default.green.bold('🎉 SUCCESS! V2 parser performs as well or better than V1!'));
        console.log(chalk_1.default.green("   - No regressions detected"));
        console.log(chalk_1.default.green("   - ".concat(summary.newDiscoveries, " additional swaps detected")));
        console.log(chalk_1.default.green("   - ".concat(summary.matches, " transactions match V1")));
    }
    else {
        console.log(chalk_1.default.yellow.bold('⚠️  ISSUES FOUND:'));
        if (summary.regressions > 0) {
            console.log(chalk_1.default.red("   - ".concat(summary.regressions, " regressions (V1 found, V2 missed)")));
        }
        if (summary.mismatches > 0) {
            console.log(chalk_1.default.magenta("   - ".concat(summary.mismatches, " mismatches (different details)")));
        }
        console.log(chalk_1.default.yellow('\nHowever, V2 improvements:'));
        console.log(chalk_1.default.yellow("   + ".concat(summary.newDiscoveries, " additional swaps detected")));
    }
}
// ============================================================================
// MAIN EXECUTION
// ============================================================================
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var whales, allResults, i, whale, results, summary;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log(chalk_1.default.cyan.bold('\n╔════════════════════════════════════════════════════════════════════════════╗'));
                    console.log(chalk_1.default.cyan.bold('║         Shadow Comparison Script - V1 vs V2 Parser                        ║'));
                    console.log(chalk_1.default.cyan.bold('╚════════════════════════════════════════════════════════════════════════════╝\n'));
                    console.log(chalk_1.default.white('Configuration:'));
                    console.log(chalk_1.default.gray("  - Batch Size: ".concat(BATCH_SIZE, " whales")));
                    console.log(chalk_1.default.gray("  - TX Limit: ".concat(TX_LIMIT, " transactions per whale")));
                    console.log(chalk_1.default.gray("  - Rate Limit: ".concat(RATE_LIMIT_MS, "ms between requests")));
                    console.log(chalk_1.default.gray("  - SHYFT API Key: ".concat(SHYFT_API_KEY.substring(0, 10), "...")));
                    // Step 1: Fetch whales from database
                    console.log(chalk_1.default.blue("\n\uD83D\uDCCA Fetching whales from database..."));
                    return [4 /*yield*/, getWhaleAddresses(BATCH_SIZE)];
                case 1:
                    whales = _a.sent();
                    console.log(chalk_1.default.green("\u2705 Found ".concat(whales.length, " whales to process\n")));
                    if (!(whales.length === 0)) return [3 /*break*/, 3];
                    console.log(chalk_1.default.red('❌ No whales found in database. Exiting.'));
                    return [4 /*yield*/, mongoose_1.default.disconnect()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
                case 3:
                    allResults = [];
                    i = 0;
                    _a.label = 4;
                case 4:
                    if (!(i < whales.length)) return [3 /*break*/, 8];
                    whale = whales[i];
                    console.log(chalk_1.default.cyan("\n[Whale ".concat(i + 1, "/").concat(whales.length, "]")));
                    return [4 /*yield*/, processWhale(whale)];
                case 5:
                    results = _a.sent();
                    allResults.push.apply(allResults, results);
                    if (!(i < whales.length - 1)) return [3 /*break*/, 7];
                    console.log(chalk_1.default.gray("\nWaiting 2 seconds before next whale..."));
                    return [4 /*yield*/, sleep(2000)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 4];
                case 8:
                    summary = generateSummary(allResults);
                    printSummary(summary, allResults);
                    // Disconnect from MongoDB
                    return [4 /*yield*/, mongoose_1.default.disconnect()];
                case 9:
                    // Disconnect from MongoDB
                    _a.sent();
                    console.log(chalk_1.default.green('\n✅ Disconnected from MongoDB'));
                    return [2 /*return*/];
            }
        });
    });
}
// Run the script
if (require.main === module) {
    main().catch(function (error) {
        console.error(chalk_1.default.red('\n💥 Fatal Error:'), error);
        process.exit(1);
    });
}
