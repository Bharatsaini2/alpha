"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseShyftTransaction = parseShyftTransaction;
exports.meetsMinimumConfidence = meetsMinimumConfidence;
var logger_1 = __importDefault(require("./logger"));
// Constants
var SOL_MINT = 'So11111111111111111111111111111111111111112';
/**
 * Main parser function following canonical SHYFT specification
 * Requirement 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */
function parseShyftTransaction(tx) {
    var _a, _b;
    try {
        // Step 0: Status Gate - Requirement 1.1
        if (tx.status !== 'Success') {
            logger_1.default.debug({ signature: tx.signature }, 'Transaction failed, discarding');
            return null;
        }
        // Step 1: Identify Swapper - Requirement 1.1
        var swapper = tx.fee_payer || ((_a = tx.signers) === null || _a === void 0 ? void 0 : _a[0]);
        if (!swapper) {
            logger_1.default.debug({ signature: tx.signature }, 'No swapper identified, discarding');
            return null;
        }
        logger_1.default.debug({ signature: tx.signature, swapper: swapper }, 'Swapper identified');
        // Step 2: Ignore Type - Requirement 1.5
        // Never use type as a filter, just log if it's potentially misleading
        if (tx.type && ['CREATE_TOKEN_ACCOUNT', 'TOKEN_TRANSFER', 'GETACCOUNTDATASIZE', 'INIT_USER_VOLUME_ACCUMULATOR', 'UNKNOWN'].includes(tx.type)) {
            logger_1.default.debug({ signature: tx.signature, type: tx.type }, 'Type label is potentially misleading, continuing evaluation');
        }
        // Step 3: Fast Path (tokens_swapped) - Requirement 1.3
        if (tx.actions && Array.isArray(tx.actions) && tx.actions.length > 0) {
            for (var _i = 0, _c = tx.actions; _i < _c.length; _i++) {
                var action = _c[_i];
                if ((_b = action.info) === null || _b === void 0 ? void 0 : _b.tokens_swapped) {
                    var fastPathResult = parseFastPath(tx, action.info.tokens_swapped, swapper);
                    if (fastPathResult) {
                        logger_1.default.debug({ signature: tx.signature }, 'Fast path classification successful');
                        return fastPathResult;
                    }
                }
            }
        }
        // Step 4: Balance Delta Path (PRIMARY) - Requirement 1.1, 1.2, 1.4
        var balancePathResult = parseBalanceDeltaPath(tx, swapper);
        if (balancePathResult) {
            logger_1.default.debug({ signature: tx.signature }, 'Balance delta path classification successful');
            return balancePathResult;
        }
        // Step 5: ATA Detection (Informational) - Requirement 1.1
        var ataCreated = detectATACreation(tx.token_balance_changes || []);
        // Step 6: Event Override (Safety Net) - Requirement 1.6
        var eventOverrideResult = parseEventOverride(tx, swapper, ataCreated);
        if (eventOverrideResult) {
            logger_1.default.debug({ signature: tx.signature }, 'Event override classification successful');
            return eventOverrideResult;
        }
        // Step 7: Non-Swap Classification
        logger_1.default.debug({ signature: tx.signature }, 'No swap classification found, discarding');
        return null;
    }
    catch (error) {
        logger_1.default.error({ signature: tx.signature, error: error instanceof Error ? error.message : String(error) }, 'Failed to parse transaction');
        return null;
    }
}
/**
 * Fast path using tokens_swapped field - Requirement 1.3
 * Handles both array format and object format with in/out properties
 */
function parseFastPath(tx, tokensSwapped, swapper) {
    var _a, _b;
    var input;
    var output;
    // Handle array format: [input, output]
    if (Array.isArray(tokensSwapped)) {
        if (tokensSwapped.length < 2) {
            logger_1.default.debug({ signature: tx.signature }, 'Fast path: insufficient tokens_swapped entries');
            return null;
        }
        input = tokensSwapped[0];
        output = tokensSwapped[1];
    }
    // Handle object format: { in: {...}, out: {...} }
    else if (tokensSwapped && typeof tokensSwapped === 'object') {
        input = tokensSwapped.in;
        output = tokensSwapped.out;
    }
    if (!input || !output) {
        logger_1.default.debug({ signature: tx.signature }, 'Fast path: missing input or output');
        return null;
    }
    // Extract mint and amount from either format
    var inputMint = input.mint || input.token_address;
    var outputMint = output.mint || output.token_address;
    var inputAmountRaw = input.amount_raw;
    var outputAmountRaw = output.amount_raw;
    var inputDecimals = (_a = input.decimals) !== null && _a !== void 0 ? _a : 0;
    var outputDecimals = (_b = output.decimals) !== null && _b !== void 0 ? _b : 0;
    if (!inputMint || !outputMint || inputAmountRaw === undefined || outputAmountRaw === undefined) {
        logger_1.default.debug({ signature: tx.signature }, 'Fast path: missing required fields');
        return null;
    }
    var inputAmount = normalizeAmount(inputAmountRaw, inputDecimals);
    var outputAmount = normalizeAmount(outputAmountRaw, outputDecimals);
    return {
        transaction_hash: tx.signature,
        timestamp: tx.timestamp,
        swapper: swapper,
        side: 'SWAP',
        input: {
            mint: inputMint,
            amount_raw: String(inputAmountRaw),
            decimals: inputDecimals,
            amount: inputAmount,
        },
        output: {
            mint: outputMint,
            amount_raw: String(outputAmountRaw),
            decimals: outputDecimals,
            amount: outputAmount,
        },
        ata_created: detectATACreation(tx.token_balance_changes || []),
        classification_source: 'tokens_swapped',
        confidence: 'MAX',
    };
}
/**
 * Balance delta path (PRIMARY) - Requirement 1.1, 1.2, 1.4
 *
 * CRITICAL FIX: Track the swapper's balance change for each mint, not an arbitrary one.
 * This ensures we use the correct decimals and reference values from the swapper's account.
 *
 * The bug: changesByMint[mint] = first_change_encountered
 * This is wrong because:
 * - Multiple accounts can change for the same mint in one transaction
 * - We need the swapper's specific account, not an arbitrary one
 * - The decimals and pre_balance must come from the swapper's account
 *
 * The fix: For each mint, track ALL the swapper's changes and use them correctly
 */
function parseBalanceDeltaPath(tx, swapper) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var changes = tx.token_balance_changes || [];
    // Filter balance changes where owner == swapper
    var relevantChanges = changes.filter(function (change) { return change.owner === swapper; });
    if (relevantChanges.length === 0) {
        logger_1.default.debug({ signature: tx.signature, swapper: swapper }, 'No relevant balance changes for swapper');
        return null;
    }
    // Aggregate by mint - track BOTH the net delta AND all changes for that mint
    var netDeltas = {};
    var changesByMint = {};
    for (var _i = 0, relevantChanges_1 = relevantChanges; _i < relevantChanges_1.length; _i++) {
        var change = relevantChanges_1[_i];
        var delta = change.post_balance - change.pre_balance;
        logger_1.default.debug({
            mint: change.mint,
            address: change.address,
            pre_balance: change.pre_balance,
            post_balance: change.post_balance,
            delta: delta,
            decimals: change.decimals,
        }, 'Balance change delta');
        netDeltas[change.mint] = (netDeltas[change.mint] || 0) + delta;
        // Store ALL changes for this mint (there may be multiple accounts)
        if (!changesByMint[change.mint]) {
            changesByMint[change.mint] = [];
        }
        changesByMint[change.mint].push(change);
    }
    // Normalize SOL - Requirement 1.4
    // Note: SHYFT already normalizes WSOL in token_balance_changes, so we only need SOL
    var solNetDelta = netDeltas[SOL_MINT] || 0;
    logger_1.default.debug({ signature: tx.signature, solNetDelta: solNetDelta }, 'SOL normalization');
    // Identify non-SOL tokens with non-zero deltas
    var nonSolTokens = Object.entries(netDeltas)
        .filter(function (_a) {
        var mint = _a[0], delta = _a[1];
        return mint !== SOL_MINT && delta !== 0;
    })
        .map(function (_a) {
        var mint = _a[0], delta = _a[1];
        return ({ mint: mint, delta: delta });
    });
    logger_1.default.debug({ signature: tx.signature, nonSolTokens: nonSolTokens, solNetDelta: solNetDelta }, 'Balance delta analysis');
    // Classification rules
    // BUY: non-SOL token inflow + SOL outflow
    if (nonSolTokens.some(function (t) { return t.delta > 0; }) && solNetDelta < 0) {
        var tokenInflow = nonSolTokens.find(function (t) { return t.delta > 0; });
        if (tokenInflow) {
            var tokenChange = getBestChangeForMint(changesByMint[tokenInflow.mint]);
            var solChange = getBestChangeForMint(changesByMint[SOL_MINT]);
            return {
                transaction_hash: tx.signature,
                timestamp: tx.timestamp,
                swapper: swapper,
                side: 'BUY',
                input: {
                    mint: SOL_MINT,
                    amount_raw: String(Math.abs(solNetDelta)),
                    decimals: (_a = solChange === null || solChange === void 0 ? void 0 : solChange.decimals) !== null && _a !== void 0 ? _a : 9,
                    amount: Math.abs(solNetDelta) / Math.pow(10, (_b = solChange === null || solChange === void 0 ? void 0 : solChange.decimals) !== null && _b !== void 0 ? _b : 9),
                },
                output: {
                    mint: tokenInflow.mint,
                    amount_raw: String(tokenInflow.delta),
                    decimals: (_c = tokenChange === null || tokenChange === void 0 ? void 0 : tokenChange.decimals) !== null && _c !== void 0 ? _c : 0,
                    amount: tokenInflow.delta / Math.pow(10, (_d = tokenChange === null || tokenChange === void 0 ? void 0 : tokenChange.decimals) !== null && _d !== void 0 ? _d : 0),
                },
                ata_created: detectATACreation(relevantChanges),
                classification_source: 'token_balance_changes',
                confidence: 'MEDIUM',
            };
        }
    }
    // SELL: non-SOL token outflow + SOL inflow
    if (nonSolTokens.some(function (t) { return t.delta < 0; }) && solNetDelta > 0) {
        var tokenOutflow = nonSolTokens.find(function (t) { return t.delta < 0; });
        if (tokenOutflow) {
            var tokenChange = getBestChangeForMint(changesByMint[tokenOutflow.mint]);
            var solChange = getBestChangeForMint(changesByMint[SOL_MINT]);
            return {
                transaction_hash: tx.signature,
                timestamp: tx.timestamp,
                swapper: swapper,
                side: 'SELL',
                input: {
                    mint: tokenOutflow.mint,
                    amount_raw: String(Math.abs(tokenOutflow.delta)),
                    decimals: (_e = tokenChange === null || tokenChange === void 0 ? void 0 : tokenChange.decimals) !== null && _e !== void 0 ? _e : 0,
                    amount: Math.abs(tokenOutflow.delta) / Math.pow(10, (_f = tokenChange === null || tokenChange === void 0 ? void 0 : tokenChange.decimals) !== null && _f !== void 0 ? _f : 0),
                },
                output: {
                    mint: SOL_MINT,
                    amount_raw: String(solNetDelta),
                    decimals: (_g = solChange === null || solChange === void 0 ? void 0 : solChange.decimals) !== null && _g !== void 0 ? _g : 9,
                    amount: solNetDelta / Math.pow(10, (_h = solChange === null || solChange === void 0 ? void 0 : solChange.decimals) !== null && _h !== void 0 ? _h : 9),
                },
                ata_created: detectATACreation(relevantChanges),
                classification_source: 'token_balance_changes',
                confidence: 'MEDIUM',
            };
        }
    }
    return null;
}
/**
 * Get the best change for a mint from multiple possible changes
 * Priority: prefer non-zero delta (actual swap), then first one
 */
function getBestChangeForMint(changes) {
    if (!changes || changes.length === 0)
        return undefined;
    if (changes.length === 1)
        return changes[0];
    // Prefer the change with non-zero delta (actual swap activity)
    var nonZeroDelta = changes.find(function (c) { return c.post_balance !== c.pre_balance; });
    return nonZeroDelta || changes[0];
}
/**
 * ATA Detection (Informational) - Requirement 1.1, 1.5
 */
function detectATACreation(changes) {
    return changes.some(function (change) { return change.pre_balance === 0 && change.post_balance > 0; });
}
/**
 * Event Override (Safety Net) - Requirement 1.6
 */
function parseEventOverride(tx, swapper, ataCreated) {
    var _a;
    var events = tx.events || [];
    // Check for swap events
    var hasSwapEvent = events.some(function (e) {
        var eventName = e.name || '';
        return ['BuyEvent', 'SellEvent', 'SwapEvent', 'SwapsEvent'].includes(eventName);
    });
    if (!hasSwapEvent) {
        return null;
    }
    // Try to extract swap details from events
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (event_1.name === 'BuyEvent' && event_1.data) {
            // BuyEvent detected
            logger_1.default.debug({ signature: tx.signature }, 'BuyEvent detected in events');
            return {
                transaction_hash: tx.signature,
                timestamp: tx.timestamp,
                swapper: swapper,
                side: 'BUY',
                input: {
                    mint: SOL_MINT,
                    amount_raw: '0',
                    decimals: 9,
                    amount: 0,
                },
                output: {
                    mint: 'UNKNOWN',
                    amount_raw: '0',
                    decimals: 0,
                    amount: 0,
                },
                ata_created: ataCreated,
                classification_source: 'events',
                confidence: 'LOW',
            };
        }
        if (event_1.name === 'SellEvent' && event_1.data) {
            // SellEvent detected
            logger_1.default.debug({ signature: tx.signature }, 'SellEvent detected in events');
            return {
                transaction_hash: tx.signature,
                timestamp: tx.timestamp,
                swapper: swapper,
                side: 'SELL',
                input: {
                    mint: 'UNKNOWN',
                    amount_raw: '0',
                    decimals: 0,
                    amount: 0,
                },
                output: {
                    mint: SOL_MINT,
                    amount_raw: '0',
                    decimals: 9,
                    amount: 0,
                },
                ata_created: ataCreated,
                classification_source: 'events',
                confidence: 'LOW',
            };
        }
        if ((event_1.name === 'SwapEvent' || event_1.name === 'SwapsEvent') && ((_a = event_1.data) === null || _a === void 0 ? void 0 : _a.swap_events)) {
            // SwapEvent detected
            logger_1.default.debug({ signature: tx.signature }, 'SwapEvent detected in events');
            var swapEvents = event_1.data.swap_events;
            if (swapEvents.length > 0) {
                var firstSwap = swapEvents[0];
                return {
                    transaction_hash: tx.signature,
                    timestamp: tx.timestamp,
                    swapper: swapper,
                    side: 'SWAP',
                    input: {
                        mint: firstSwap.input_mint,
                        amount_raw: String(firstSwap.input_amount),
                        decimals: 0,
                        amount: firstSwap.input_amount,
                    },
                    output: {
                        mint: firstSwap.output_mint,
                        amount_raw: String(firstSwap.output_amount),
                        decimals: 0,
                        amount: firstSwap.output_amount,
                    },
                    ata_created: ataCreated,
                    classification_source: 'events',
                    confidence: 'LOW',
                };
            }
        }
    }
    return null;
}
/**
 * Normalize amount - Requirement 1.7
 */
function normalizeAmount(amount_raw, decimals) {
    try {
        var rawNum = typeof amount_raw === 'string' ? BigInt(amount_raw) : BigInt(amount_raw);
        return Number(rawNum) / Math.pow(10, decimals);
    }
    catch (error) {
        logger_1.default.warn({ amount_raw: amount_raw, decimals: decimals, error: error instanceof Error ? error.message : String(error) }, 'Failed to normalize amount');
        return 0;
    }
}
/**
 * Confidence level ordering for filtering
 * Task 3.3: Add confidence-based filtering
 */
var CONFIDENCE_LEVELS = {
    MAX: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
};
/**
 * Check if a parsed swap meets the minimum confidence threshold
 * Task 3.3: Add confidence-based filtering
 *
 * @param parsedSwap - The parsed swap result from parseShyftTransaction
 * @param minConfidence - Minimum confidence level (from MIN_ALERT_CONFIDENCE env var)
 * @returns true if the swap meets or exceeds the minimum confidence, false otherwise
 *
 * @example
 * // No filtering (default)
 * meetsMinimumConfidence(swap, undefined) // returns true for all
 *
 * // Filter out LOW confidence
 * meetsMinimumConfidence(swap, 'MEDIUM') // returns true for MEDIUM, HIGH, MAX
 *
 * // Only accept highest confidence
 * meetsMinimumConfidence(swap, 'MAX') // returns true only for MAX
 */
function meetsMinimumConfidence(parsedSwap, minConfidence) {
    // If no swap or no minimum confidence set, accept all
    if (!parsedSwap || !minConfidence) {
        return true;
    }
    // Validate minConfidence is a valid level
    var minLevel = minConfidence.toUpperCase();
    if (!(minLevel in CONFIDENCE_LEVELS)) {
        logger_1.default.warn({ minConfidence: minConfidence }, 'Invalid MIN_ALERT_CONFIDENCE value, accepting all confidence levels');
        return true;
    }
    // Compare confidence levels
    var swapLevel = CONFIDENCE_LEVELS[parsedSwap.confidence];
    var minLevelValue = CONFIDENCE_LEVELS[minLevel];
    return swapLevel >= minLevelValue;
}
