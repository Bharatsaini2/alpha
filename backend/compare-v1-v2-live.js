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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const mongoose_1 = __importDefault(require("mongoose"));
const shyftParserV2_1 = require("./dist/utils/shyftParserV2");
const whaleAllTransactionsV2_model_1 = __importDefault(require("./src/models/whaleAllTransactionsV2.model"));
const fs = __importStar(require("fs"));
dotenv.config();
const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const WSS_URL = process.env.WSS_URL || '';
const TEST_DURATION_MS = 10 * 60 * 1000; // 10 minutes
// Color helpers
const colors = {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    white: (text) => `\x1b[37m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
};
let startTime;
let endTime;
const v2Detections = [];
const v2Rejections = []; // Track rejected transactions with reasons
let ws = null;
let testTimeout;
async function fetchShyftTransaction(signature) {
    var _a, _b;
    try {
        const response = await axios_1.default.get(`https://api.shyft.to/sol/v1/transaction/parsed`, {
            params: {
                network: 'mainnet-beta',
                txn_signature: signature,
            },
            headers: {
                'x-api-key': SHYFT_API_KEY,
            },
        });
        return ((_a = response.data) === null || _a === void 0 ? void 0 : _a.result) || null;
    }
    catch (error) {
        if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 429) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchShyftTransaction(signature);
        }
        return null;
    }
}
async function handleTransaction(tx) {
    const signature = tx.signature;
    if (!signature)
        return;
    try {
        const shyftResponse = await fetchShyftTransaction(signature);
        if (!shyftResponse)
            return;
        // Map SHYFT API response to V2 parser input format
        const v2Input = {
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
        const parseResult = (0, shyftParserV2_1.parseShyftTransactionV2)(v2Input);
        if (parseResult.success && parseResult.data) {
            const swapData = parseResult.data;
            let inputAmount, outputAmount, inputDecimals, outputDecimals;
            let inputNormalized, outputNormalized;
            // Handle both ParsedSwap and SplitSwapPair
            if ('sellRecord' in swapData) {
                // SplitSwapPair - use sellRecord for display
                const sellRecord = swapData.sellRecord;
                // For SELL: user spends quote asset to get base asset
                inputAmount = sellRecord.amounts.baseAmount || sellRecord.amounts.swapInputAmount || 0;
                outputAmount = sellRecord.amounts.swapOutputAmount || sellRecord.amounts.netWalletReceived || 0;
                inputDecimals = sellRecord.quoteAsset.decimals || 9;
                outputDecimals = sellRecord.baseAsset.decimals || 9;
                inputNormalized = inputAmount > 0
                    ? (Math.abs(inputAmount) / Math.pow(10, inputDecimals)).toFixed(6)
                    : '0';
                outputNormalized = outputAmount > 0
                    ? (Math.abs(outputAmount) / Math.pow(10, outputDecimals)).toFixed(6)
                    : '0';
                const detection = {
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
                // For BUY: user spends quote (SOL/USDC) to get base (token)
                // For SELL: user spends base (token) to get quote (SOL/USDC)
                if (swapData.direction === 'BUY') {
                    // BUY: spending quote asset to get base asset
                    inputAmount = swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0;
                    outputAmount = swapData.amounts.baseAmount || 0;
                    inputDecimals = swapData.quoteAsset.decimals || 9;
                    outputDecimals = swapData.baseAsset.decimals || 9;
                }
                else {
                    // SELL: spending base asset to get quote asset
                    inputAmount = swapData.amounts.baseAmount || 0;
                    outputAmount = swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0;
                    inputDecimals = swapData.baseAsset.decimals || 9;
                    outputDecimals = swapData.quoteAsset.decimals || 9;
                }
                inputNormalized = inputAmount > 0
                    ? (Math.abs(inputAmount) / Math.pow(10, inputDecimals)).toFixed(6)
                    : '0';
                outputNormalized = outputAmount > 0
                    ? (Math.abs(outputAmount) / Math.pow(10, outputDecimals)).toFixed(6)
                    : '0';
                const detection = {
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
            console.log(colors.green(`\n✅ V2 DETECTED: ${swapData.direction || 'UNKNOWN'}`));
            console.log(colors.gray(`   Signature: ${signature}`));
            console.log(colors.gray(`   Whale: ${v2Detections[v2Detections.length - 1].whaleAddress.substring(0, 8)}...`));
            console.log(colors.gray(`   ${v2Detections[v2Detections.length - 1].inputToken} (${inputNormalized}) → ${v2Detections[v2Detections.length - 1].outputToken} (${outputNormalized})`));
            console.log(colors.gray(`   Input Mint:  ${v2Detections[v2Detections.length - 1].inputMint.substring(0, 8)}...`));
            console.log(colors.gray(`   Output Mint: ${v2Detections[v2Detections.length - 1].outputMint.substring(0, 8)}...`));
            console.log(colors.gray(`   Confidence: ${v2Detections[v2Detections.length - 1].confidence} | Source: ${v2Detections[v2Detections.length - 1].source}`));
        } else {
            // Track V2 rejections for analysis
            const rejection = {
                signature: signature,
                timestamp: new Date(),
                whaleAddress: shyftResponse.fee_payer || 'UNKNOWN',
                reason: parseResult.erase?.reason || 'unknown_rejection',
                success: false
            };
            v2Rejections.push(rejection);
            
            console.log(colors.red(`\n❌ V2 REJECTED: ${parseResult.erase?.reason || 'unknown'}`));
            console.log(colors.gray(`   Signature: ${signature}`));
            console.log(colors.gray(`   Whale: ${(shyftResponse.fee_payer || 'UNKNOWN').substring(0, 8)}...`));
        }
    }
    catch (error) {
        // Silent errors to keep output clean
    }
}
function connectWebSocket(whaleAddresses) {
    const WebSocket = require('ws');
    ws = new WebSocket(WSS_URL);
    ws.on('open', () => {
        console.log(colors.green('\n✅ WebSocket connected!'));
        const subscribeMessage = {
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
        console.log(colors.cyan(`📡 Subscribed to ${whaleAddresses.length} whale addresses`));
        // Record start time
        startTime = new Date();
        console.log(colors.yellow(`\n⏱️  TEST STARTED at ${startTime.toISOString()}`));
        console.log(colors.yellow(`   Will run for 10 minutes until ${new Date(startTime.getTime() + TEST_DURATION_MS).toISOString()}`));
        console.log(colors.cyan('\n🔍 Monitoring for transactions...\n'));
        // Set timeout to end test after 5 minutes
        testTimeout = setTimeout(async () => {
            endTime = new Date();
            console.log(colors.yellow(`\n\n⏱️  TEST ENDED at ${endTime.toISOString()}`));
            ws.close();
            await compareResults();
        }, TEST_DURATION_MS);
    });
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.method === 'transactionNotification') {
                await handleTransaction(message.params.result);
            }
        }
        catch (error) {
            // Silent
        }
    });
    ws.on('error', (error) => {
        console.error(colors.red('❌ WebSocket error:'), error.message);
    });
    ws.on('close', () => {
        console.log(colors.yellow('\n⚠️  WebSocket disconnected'));
    });
}
async function compareResults() {
    console.log(colors.cyan('\n\n' + '═'.repeat(80)));
    console.log(colors.cyan(colors.bold('COMPARISON: V1 (Database) vs V2 (Live Parser)')));
    console.log(colors.cyan('═'.repeat(80)));
    console.log(colors.white(`\nTime Window: ${startTime.toISOString()} to ${endTime.toISOString()}`));
    console.log(colors.white(`Duration: ${((endTime.getTime() - startTime.getTime()) / 1000 / 60).toFixed(1)} minutes\n`));
    // Query V1 transactions from database in the same time window
    console.log(colors.cyan('📊 Querying V1 transactions from database...\n'));
    const v1Transactions = await whaleAllTransactionsV2_model_1.default.find({
        'transaction.timestamp': {
            $gte: startTime,
            $lte: endTime
        }
    }).lean();
    console.log(colors.white(`V1 (Database) found: ${v1Transactions.length} transactions`));
    console.log(colors.white(`V2 (Live Parser) found: ${v2Detections.length} transactions\n`));
    // Create signature sets for comparison
    const v1Signatures = new Set(v1Transactions.map((tx) => { var _a; return (_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.signature; }).filter(Boolean));
    const v2Signatures = new Set(v2Detections.map(d => d.signature));
    // Find matches and differences
    const v2HasAll = Array.from(v1Signatures).every(sig => v2Signatures.has(sig));
    const v2Extras = Array.from(v2Signatures).filter(sig => !v1Signatures.has(sig));
    const v1Extras = Array.from(v1Signatures).filter(sig => !v2Signatures.has(sig));
    const matches = Array.from(v1Signatures).filter(sig => v2Signatures.has(sig));
    console.log(colors.cyan('─'.repeat(80)));
    console.log(colors.green(`✅ Matches (Both V1 and V2): ${matches.length}`));
    console.log(colors.yellow(`🎯 V2 Extras (V2 found, V1 missed): ${v2Extras.length}`));
    console.log(colors.red(`❌ V1 Extras (V1 found, V2 missed): ${v1Extras.length}`));
    console.log(colors.cyan('─'.repeat(80)));
    // Detailed breakdown
    if (v2Extras.length > 0) {
        console.log(colors.yellow(`\n🎉 V2 FOUND ${v2Extras.length} ADDITIONAL TRANSACTIONS:\n`));
        v2Extras.slice(0, 20).forEach((sig, i) => {
            const detection = v2Detections.find(d => d.signature === sig);
            if (detection) {
                console.log(colors.yellow(`${i + 1}. ${sig}`));
                console.log(colors.gray(`   Whale: ${detection.whaleAddress.substring(0, 8)}...`));
                console.log(colors.gray(`   ${detection.side}: ${detection.inputToken} (${detection.inputAmountNormalized}) → ${detection.outputToken} (${detection.outputAmountNormalized})`));
                console.log(colors.gray(`   Input Mint:  ${detection.inputMint.substring(0, 8)}...`));
                console.log(colors.gray(`   Output Mint: ${detection.outputMint.substring(0, 8)}...`));
                console.log(colors.gray(`   Confidence: ${detection.confidence} | Source: ${detection.source}\n`));
            }
        });
        if (v2Extras.length > 20) {
            console.log(colors.gray(`   ... and ${v2Extras.length - 20} more\n`));
        }
    }
    if (v1Extras.length > 0) {
        console.log(colors.red(`\n⚠️  V1 FOUND ${v1Extras.length} TRANSACTIONS THAT V2 MISSED:\n`));
        v1Extras.forEach((sig, i) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
            const v1Tx = v1Transactions.find((tx) => { var _a; return ((_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.signature) === sig; });
            if (v1Tx) {
                console.log(colors.red(`${i + 1}. ${sig}`));
                console.log(colors.gray(`   Whale: ${((_b = (_a = v1Tx.whale) === null || _a === void 0 ? void 0 : _a.address) === null || _b === void 0 ? void 0 : _b.substring(0, 8)) || ((_c = v1Tx.whaleAddress) === null || _c === void 0 ? void 0 : _c.substring(0, 8))}...`));
                console.log(colors.gray(`   Type: ${v1Tx.type}`));
                console.log(colors.gray(`   ${(_e = (_d = v1Tx.transaction) === null || _d === void 0 ? void 0 : _d.tokenIn) === null || _e === void 0 ? void 0 : _e.symbol} → ${(_g = (_f = v1Tx.transaction) === null || _f === void 0 ? void 0 : _f.tokenOut) === null || _g === void 0 ? void 0 : _g.symbol}`));
                console.log(colors.gray(`   Input Mint:  ${(_k = (_j = (_h = v1Tx.transaction) === null || _h === void 0 ? void 0 : _h.tokenIn) === null || _j === void 0 ? void 0 : _j.address) === null || _k === void 0 ? void 0 : _k.substring(0, 8)}...`));
                console.log(colors.gray(`   Output Mint: ${(_o = (_m = (_l = v1Tx.transaction) === null || _l === void 0 ? void 0 : _l.tokenOut) === null || _m === void 0 ? void 0 : _m.address) === null || _o === void 0 ? void 0 : _o.substring(0, 8)}...`));
                console.log(colors.gray(`   Input Amount:  ${(_q = (_p = v1Tx.transaction) === null || _p === void 0 ? void 0 : _p.tokenIn) === null || _q === void 0 ? void 0 : _q.amount}`));
                console.log(colors.gray(`   Output Amount: ${(_s = (_r = v1Tx.transaction) === null || _r === void 0 ? void 0 : _r.tokenOut) === null || _s === void 0 ? void 0 : _s.amount}\n`));
            }
        });
    }
    // Show matches details
    if (matches.length > 0) {
        console.log(colors.green(`\n✅ MATCHES (Both V1 and V2 detected): ${matches.length}\n`));
        matches.slice(0, 10).forEach((sig, i) => {
            var _a, _b, _c, _d;
            const v1Tx = v1Transactions.find((tx) => { var _a; return ((_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.signature) === sig; });
            const v2Tx = v2Detections.find(d => d.signature === sig);
            if (v1Tx && v2Tx) {
                console.log(colors.green(`${i + 1}. ${sig}`));
                console.log(colors.gray(`   Whale: ${v2Tx.whaleAddress.substring(0, 8)}...`));
                console.log(colors.gray(`   V1: ${v1Tx.type} | ${(_b = (_a = v1Tx.transaction) === null || _a === void 0 ? void 0 : _a.tokenIn) === null || _b === void 0 ? void 0 : _b.symbol} → ${(_d = (_c = v1Tx.transaction) === null || _c === void 0 ? void 0 : _c.tokenOut) === null || _d === void 0 ? void 0 : _d.symbol}`));
                console.log(colors.gray(`   V2: ${v2Tx.side} | ${v2Tx.inputToken} (${v2Tx.inputAmountNormalized}) → ${v2Tx.outputToken} (${v2Tx.outputAmountNormalized})`));
                console.log(colors.gray(`   Confidence: ${v2Tx.confidence}\n`));
            }
        });
        if (matches.length > 10) {
            console.log(colors.gray(`   ... and ${matches.length - 10} more matches\n`));
        }
    }
    // Final verdict
    console.log(colors.cyan('\n' + '═'.repeat(80)));
    console.log(colors.cyan(colors.bold('VERDICT')));
    console.log(colors.cyan('═'.repeat(80)));
    if (v2Extras.length > 0 && v1Extras.length === 0) {
        console.log(colors.green('\n✅ V2 PARSER IS BETTER!'));
        console.log(colors.green(`   V2 found ALL ${v1Transactions.length} V1 transactions`));
        console.log(colors.green(`   PLUS ${v2Extras.length} additional transactions that V1 missed`));
    }
    else if (v2Extras.length === 0 && v1Extras.length === 0) {
        console.log(colors.green('\n✅ V2 PARSER MATCHES V1 EXACTLY'));
        console.log(colors.white(`   Both found the same ${matches.length} transactions`));
    }
    else if (v1Extras.length > 0) {
        console.log(colors.yellow('\n⚠️  V2 PARSER NEEDS IMPROVEMENT'));
        console.log(colors.yellow(`   V2 found ${v2Detections.length} transactions`));
        console.log(colors.yellow(`   But missed ${v1Extras.length} that V1 detected`));
        if (v2Extras.length > 0) {
            console.log(colors.yellow(`   However, V2 found ${v2Extras.length} new ones that V1 missed`));
        }
    }
    console.log(colors.cyan('\n' + '═'.repeat(80) + '\n'));
    // Save detailed report
    const report = {
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
    await mongoose_1.default.disconnect();
    console.log(colors.green('✅ Disconnected from MongoDB\n'));
    process.exit(0);
}
async function main() {
    console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
    console.log(colors.cyan(colors.bold('║         Live V1 vs V2 Parser Comparison (10 Minutes)                      ║')));
    console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));
    // Connect to MongoDB
    console.log(colors.cyan('📊 Connecting to MongoDB...'));
    await mongoose_1.default.connect(MONGO_URI);
    console.log(colors.green('✅ Connected to MongoDB\n'));
    // Fetch whale addresses
    console.log(colors.cyan('📊 Fetching whale addresses...'));
    const whaleAddresses = await whaleAllTransactionsV2_model_1.default.distinct('whale.address');
    console.log(colors.green(`✅ Found ${whaleAddresses.length} whale addresses\n`));
    // Connect WebSocket and start test
    connectWebSocket(whaleAddresses);
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log(colors.yellow('\n\n⚠️  Test interrupted by user'));
        if (testTimeout)
            clearTimeout(testTimeout);
        if (ws)
            ws.close();
        if (startTime) {
            endTime = new Date();
            await compareResults();
        }
        else {
            await mongoose_1.default.disconnect();
            process.exit(0);
        }
    });
}
main().catch((error) => {
    console.error(colors.red('💥 Fatal Error:'), error);
    process.exit(1);
});
