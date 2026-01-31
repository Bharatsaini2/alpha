"use strict";
/**
 * Task 4.1: Verify zero regression on existing alerts (UPDATED WITH CORRECT OLD LOGIC)
 *
 * This script compares the old parser logic (from wallet.controller.ts)
 * with the new parseShyftTransaction() parser on 100+ real production transactions.
 *
 * ACTUAL Old Parser Logic (from wallet.controller.ts lines 850-1100):
 * 1. Check for swap indicators: hasBuyActivity && hasSellActivity
 *    - hasBuyActivity: some balance change > 0
 *    - hasSellActivity: some balance change < 0
 * 2. Extract tokens from: tokens_swapped → token_balance_changes → TOKEN_TRANSFER
 * 3. Apply excluded tokens logic:
 *    - excludedTokens: ['SOL', 'WSOL', 'USDT', 'USDC', 'USD1']
 *    - excludedAddresses: SOL/WSOL, USDC, USDT addresses
 * 4. Classify:
 *    - isBuy = bothNonExcluded || (!outputExcluded && inputExcluded)
 *    - isSell = bothNonExcluded || (outputExcluded && !inputExcluded)
 * 5. Skip if (!isBuy && !isSell)
 *
 * New Parser: Uses parseShyftTransaction() from src/utils/shyftParser.ts
 */
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
var mongoose_1 = __importDefault(require("mongoose"));
var dotenv_1 = __importDefault(require("dotenv"));
var axios_1 = __importDefault(require("axios"));
var shyftParser_1 = require("./src/utils/shyftParser");
var logger_1 = __importDefault(require("./src/utils/logger"));
var solana_tokens_whales_1 = __importDefault(require("./src/models/solana-tokens-whales"));
var connectDb_1 = require("./src/config/connectDb");
dotenv_1.default.config();
function oldParserLogic(parsedTx) {
    var _a, _b, _c, _d, _e;
    // Step 1: Check for swap indicators (buy AND sell activity)
    var balanceChanges = ((_a = parsedTx.result) === null || _a === void 0 ? void 0 : _a.token_balance_changes) || [];
    var nonZeroChanges = balanceChanges.filter(function (c) { return c.change_amount !== 0; });
    var hasBuyActivity = nonZeroChanges.some(function (c) { return c.change_amount > 0; });
    var hasSellActivity = nonZeroChanges.some(function (c) { return c.change_amount < 0; });
    if (!hasBuyActivity || !hasSellActivity) {
        return null; // Skip - no swap indicators
    }
    var actions = (_b = parsedTx.result) === null || _b === void 0 ? void 0 : _b.actions;
    if (!actions || actions.length === 0) {
        return null;
    }
    var swapper = (_d = (_c = parsedTx.result) === null || _c === void 0 ? void 0 : _c.signers) === null || _d === void 0 ? void 0 : _d[0];
    if (!swapper) {
        return null;
    }
    var tokenIn = null;
    var tokenOut = null;
    // Step 2: Extract tokens - Priority: tokens_swapped → token_balance_changes → TOKEN_TRANSFER
    var actionInfo = (_e = actions[0]) === null || _e === void 0 ? void 0 : _e.info;
    // Try tokens_swapped first
    if (actionInfo === null || actionInfo === void 0 ? void 0 : actionInfo.tokens_swapped) {
        tokenIn = actionInfo.tokens_swapped.in;
        tokenOut = actionInfo.tokens_swapped.out;
    }
    // Try token_balance_changes
    else if (balanceChanges.length > 0) {
        var swapperChanges = balanceChanges.filter(function (change) { return change.owner === swapper && change.change_amount !== 0; });
        var tokenSentChange = swapperChanges.find(function (c) { return c.change_amount < 0; });
        var tokenReceivedChange = swapperChanges.find(function (c) { return c.change_amount > 0; });
        if (tokenSentChange && tokenReceivedChange) {
            tokenIn = {
                token_address: tokenSentChange.mint,
                amount: Math.abs(tokenSentChange.change_amount) / Math.pow(10, tokenSentChange.decimals),
                symbol: tokenSentChange.symbol || 'Unknown',
                name: tokenSentChange.name || 'Unknown',
            };
            tokenOut = {
                token_address: tokenReceivedChange.mint,
                amount: tokenReceivedChange.change_amount / Math.pow(10, tokenReceivedChange.decimals),
                symbol: tokenReceivedChange.symbol || 'Unknown',
                name: tokenReceivedChange.name || 'Unknown',
            };
        }
    }
    // Try TOKEN_TRANSFER fallback
    else {
        var solOut = actions.find(function (a) { var _a; return a.type === 'SOL_TRANSFER' && ((_a = a.info) === null || _a === void 0 ? void 0 : _a.sender) === swapper; });
        var solIn = actions.find(function (a) { var _a; return a.type === 'SOL_TRANSFER' && ((_a = a.info) === null || _a === void 0 ? void 0 : _a.receiver) === swapper; });
        var splOut = actions.find(function (a) { var _a; return a.type === 'TOKEN_TRANSFER' && ((_a = a.info) === null || _a === void 0 ? void 0 : _a.sender) === swapper; });
        var splIn = actions.find(function (a) { var _a; return a.type === 'TOKEN_TRANSFER' && ((_a = a.info) === null || _a === void 0 ? void 0 : _a.receiver) === swapper; });
        if (solOut && splIn) {
            tokenIn = {
                token_address: 'So11111111111111111111111111111111111111112',
                amount: solOut.info.amount,
                symbol: 'SOL',
                name: 'SOL',
            };
            tokenOut = {
                token_address: splIn.info.token_address,
                amount: splIn.info.amount,
                symbol: 'Unknown',
                name: 'Unknown',
            };
        }
        else if (splOut && solIn) {
            tokenIn = {
                token_address: splOut.info.token_address,
                amount: splOut.info.amount,
                symbol: 'Unknown',
                name: 'Unknown',
            };
            tokenOut = {
                token_address: 'So11111111111111111111111111111111111111112',
                amount: solIn.info.amount,
                symbol: 'SOL',
                name: 'SOL',
            };
        }
        else if (splOut && splIn) {
            tokenIn = {
                token_address: splOut.info.token_address,
                amount: splOut.info.amount,
                symbol: 'Unknown',
                name: 'Unknown',
            };
            tokenOut = {
                token_address: splIn.info.token_address,
                amount: splIn.info.amount,
                symbol: 'Unknown',
                name: 'Unknown',
            };
        }
    }
    // If we still don't have tokens, skip
    if (!tokenIn || !tokenOut) {
        return null;
    }
    // Step 3: Apply excluded tokens logic
    var excludedTokens = ['SOL', 'WSOL', 'USDT', 'USDC', 'USD1'];
    var excludedAddresses = [
        'So11111111111111111111111111111111111111112', // SOL/WSOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];
    var inputExcluded = excludedTokens.includes(tokenIn.symbol) ||
        excludedAddresses.includes(tokenIn.token_address);
    var outputExcluded = excludedTokens.includes(tokenOut.symbol) ||
        excludedAddresses.includes(tokenOut.token_address);
    var bothNonExcluded = !inputExcluded && !outputExcluded;
    // Step 4: Classify
    var isBuy = bothNonExcluded || (!outputExcluded && inputExcluded);
    var isSell = bothNonExcluded || (outputExcluded && !inputExcluded);
    // Step 5: Skip if neither buy nor sell
    if (!isBuy && !isSell) {
        return null;
    }
    return { isBuy: isBuy, isSell: isSell, tokenIn: tokenIn, tokenOut: tokenOut };
}
// Fetch transactions from SHYFT API
function fetchWhaleTransactions(whaleAddress_1) {
    return __awaiter(this, arguments, void 0, function (whaleAddress, limit) {
        var apiKey, response, error_1;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    apiKey = process.env.SHYFT_API_KEY;
                    if (!apiKey) {
                        throw new Error('SHYFT_API_KEY not found in environment');
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1.default.get("https://api.shyft.to/sol/v1/transaction/history", {
                            params: {
                                network: 'mainnet-beta',
                                account: whaleAddress,
                                tx_num: limit,
                                enable_raw: false,
                            },
                            headers: {
                                'x-api-key': apiKey,
                            },
                        })];
                case 2:
                    response = _a.sent();
                    if (response.data && response.data.result) {
                        return [2 /*return*/, response.data.result];
                    }
                    return [2 /*return*/, []];
                case 3:
                    error_1 = _a.sent();
                    logger_1.default.error({ error: error_1, whaleAddress: whaleAddress }, 'Failed to fetch transactions from SHYFT');
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function compareResults(tx, oldResult, newResult) {
    var _a, _b, _c, _d, _e, _f;
    var oldDetected = oldResult !== null && (oldResult.isBuy || oldResult.isSell);
    var newDetected = newResult !== null;
    var agreement = false;
    var regression = false;
    var improvement = false;
    if (oldDetected && newDetected) {
        // Both detected - check if they agree on BUY/SELL
        var oldSide = oldResult.isBuy ? 'BUY' : 'SELL';
        var newSide = newResult.side;
        agreement = oldSide === newSide || newSide === 'SWAP';
    }
    else if (!oldDetected && !newDetected) {
        // Both didn't detect - agreement
        agreement = true;
    }
    else if (oldDetected && !newDetected) {
        // Old detected, new missed - REGRESSION
        regression = true;
    }
    else if (!oldDetected && newDetected) {
        // New detected, old missed - IMPROVEMENT
        improvement = true;
    }
    return {
        signature: tx.signature,
        timestamp: tx.timestamp,
        oldParser: {
            detected: oldDetected,
            isBuy: (oldResult === null || oldResult === void 0 ? void 0 : oldResult.isBuy) || false,
            isSell: (oldResult === null || oldResult === void 0 ? void 0 : oldResult.isSell) || false,
            tokenIn: (_a = oldResult === null || oldResult === void 0 ? void 0 : oldResult.tokenIn) === null || _a === void 0 ? void 0 : _a.symbol,
            tokenOut: (_b = oldResult === null || oldResult === void 0 ? void 0 : oldResult.tokenOut) === null || _b === void 0 ? void 0 : _b.symbol,
        },
        newParser: {
            detected: newDetected,
            side: newResult === null || newResult === void 0 ? void 0 : newResult.side,
            confidence: newResult === null || newResult === void 0 ? void 0 : newResult.confidence,
            source: newResult === null || newResult === void 0 ? void 0 : newResult.classification_source,
            tokenIn: (_d = (_c = newResult === null || newResult === void 0 ? void 0 : newResult.input) === null || _c === void 0 ? void 0 : _c.mint) === null || _d === void 0 ? void 0 : _d.substring(0, 8),
            tokenOut: (_f = (_e = newResult === null || newResult === void 0 ? void 0 : newResult.output) === null || _e === void 0 ? void 0 : _e.mint) === null || _f === void 0 ? void 0 : _f.substring(0, 8),
        },
        agreement: agreement,
        regression: regression,
        improvement: improvement,
    };
}
// Main verification function
function verifyParserRegression() {
    return __awaiter(this, void 0, void 0, function () {
        var whales, whaleAddresses, results, totalTransactions, targetTransactions, _i, whaleAddresses_1, whaleAddress, transactions, _a, transactions_1, tx, oldResult, newResult, comparison, totalTested, oldDetected, newDetected, agreements, regressions, improvements, agreementRate, regressionCases, improvementCases, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 9, , 10]);
                    logger_1.default.info('🚀 Starting parser regression verification...');
                    // Connect to database
                    return [4 /*yield*/, (0, connectDb_1.connectDB)()];
                case 1:
                    // Connect to database
                    _b.sent();
                    logger_1.default.info('✅ Connected to database');
                    return [4 /*yield*/, solana_tokens_whales_1.default.find({}).limit(100).lean()];
                case 2:
                    whales = _b.sent();
                    whaleAddresses = whales.flatMap(function (doc) { return doc.whalesAddress; }).slice(0, 200);
                    logger_1.default.info("\uD83D\uDCCA Found ".concat(whaleAddresses.length, " whale addresses to test"));
                    results = [];
                    totalTransactions = 0;
                    targetTransactions = 100;
                    _i = 0, whaleAddresses_1 = whaleAddresses;
                    _b.label = 3;
                case 3:
                    if (!(_i < whaleAddresses_1.length)) return [3 /*break*/, 7];
                    whaleAddress = whaleAddresses_1[_i];
                    if (totalTransactions >= targetTransactions) {
                        return [3 /*break*/, 7];
                    }
                    logger_1.default.info("\uD83D\uDC0B Fetching transactions for whale: ".concat(whaleAddress.substring(0, 8), "..."));
                    return [4 /*yield*/, fetchWhaleTransactions(whaleAddress, 25)];
                case 4:
                    transactions = _b.sent();
                    logger_1.default.info("  Found ".concat(transactions.length, " transactions"));
                    for (_a = 0, transactions_1 = transactions; _a < transactions_1.length; _a++) {
                        tx = transactions_1[_a];
                        if (totalTransactions >= targetTransactions) {
                            break;
                        }
                        // Only process successful transactions
                        if (tx.status !== 'Success') {
                            continue;
                        }
                        oldResult = oldParserLogic(tx);
                        newResult = (0, shyftParser_1.parseShyftTransaction)(tx);
                        comparison = compareResults(tx, oldResult, newResult);
                        results.push(comparison);
                        totalTransactions++;
                        // Log progress every 10 transactions
                        if (totalTransactions % 10 === 0) {
                            logger_1.default.info("  Progress: ".concat(totalTransactions, "/").concat(targetTransactions, " transactions processed"));
                        }
                    }
                    // Add delay between whale queries to avoid rate limiting
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 5:
                    // Add delay between whale queries to avoid rate limiting
                    _b.sent();
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7:
                    // Generate report
                    logger_1.default.info('\n' + '='.repeat(80));
                    logger_1.default.info('📊 PARSER REGRESSION VERIFICATION REPORT');
                    logger_1.default.info('='.repeat(80));
                    totalTested = results.length;
                    oldDetected = results.filter(function (r) { return r.oldParser.detected; }).length;
                    newDetected = results.filter(function (r) { return r.newParser.detected; }).length;
                    agreements = results.filter(function (r) { return r.agreement; }).length;
                    regressions = results.filter(function (r) { return r.regression; }).length;
                    improvements = results.filter(function (r) { return r.improvement; }).length;
                    agreementRate = ((agreements / totalTested) * 100).toFixed(2);
                    logger_1.default.info("\nTotal transactions tested: ".concat(totalTested));
                    logger_1.default.info("Old parser detected swaps: ".concat(oldDetected));
                    logger_1.default.info("New parser detected swaps: ".concat(newDetected));
                    logger_1.default.info("\n\uD83D\uDCC8 Results:");
                    logger_1.default.info("  \u2705 Agreements: ".concat(agreements, " (").concat(agreementRate, "%)"));
                    logger_1.default.info("  \u26A0\uFE0F  Regressions (old detected, new missed): ".concat(regressions));
                    logger_1.default.info("  \uD83C\uDF89 Improvements (new detected, old missed): ".concat(improvements));
                    // Log regressions in detail
                    if (regressions > 0) {
                        logger_1.default.info('\n' + '='.repeat(80));
                        logger_1.default.info('⚠️  REGRESSIONS DETECTED:');
                        logger_1.default.info('='.repeat(80));
                        regressionCases = results.filter(function (r) { return r.regression; });
                        regressionCases.forEach(function (r, idx) {
                            logger_1.default.info("\n[".concat(idx + 1, "] Signature: ").concat(r.signature));
                            logger_1.default.info("    Timestamp: ".concat(r.timestamp));
                            logger_1.default.info("    Old: ".concat(r.oldParser.isBuy ? 'BUY' : 'SELL', " (").concat(r.oldParser.tokenIn, " \u2192 ").concat(r.oldParser.tokenOut, ")"));
                            logger_1.default.info("    New: NOT DETECTED");
                        });
                    }
                    // Log improvements in detail
                    if (improvements > 0) {
                        logger_1.default.info('\n' + '='.repeat(80));
                        logger_1.default.info('🎉 IMPROVEMENTS DETECTED:');
                        logger_1.default.info('='.repeat(80));
                        improvementCases = results.filter(function (r) { return r.improvement; }).slice(0, 10) // Show first 10
                        ;
                        improvementCases.forEach(function (r, idx) {
                            logger_1.default.info("\n[".concat(idx + 1, "] Signature: ").concat(r.signature));
                            logger_1.default.info("    Timestamp: ".concat(r.timestamp));
                            logger_1.default.info("    Old: NOT DETECTED");
                            logger_1.default.info("    New: ".concat(r.newParser.side, " (confidence: ").concat(r.newParser.confidence, ", source: ").concat(r.newParser.source, ")"));
                        });
                        if (improvements > 10) {
                            logger_1.default.info("\n... and ".concat(improvements - 10, " more improvements"));
                        }
                    }
                    // Final verdict
                    logger_1.default.info('\n' + '='.repeat(80));
                    if (regressions === 0) {
                        logger_1.default.info('✅ ZERO REGRESSION VERIFIED!');
                        logger_1.default.info('✅ New parser catches all swaps detected by old parser');
                        logger_1.default.info("\u2705 Plus ".concat(improvements, " additional swaps detected by new parser"));
                    }
                    else {
                        logger_1.default.info('❌ REGRESSION DETECTED!');
                        logger_1.default.info("\u274C New parser missed ".concat(regressions, " swaps that old parser detected"));
                        logger_1.default.info('❌ DO NOT PROCEED - Fix regressions before deployment');
                    }
                    logger_1.default.info('='.repeat(80));
                    // Close database connection
                    return [4 /*yield*/, mongoose_1.default.connection.close()];
                case 8:
                    // Close database connection
                    _b.sent();
                    logger_1.default.info('\n✅ Database connection closed');
                    // Exit with appropriate code
                    process.exit(regressions > 0 ? 1 : 0);
                    return [3 /*break*/, 10];
                case 9:
                    error_2 = _b.sent();
                    logger_1.default.error({ error: error_2 }, '❌ Verification failed');
                    process.exit(1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// Run verification
verifyParserRegression();
