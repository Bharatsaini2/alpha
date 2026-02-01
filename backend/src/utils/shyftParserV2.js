"use strict";
/**
 * SHYFT Parser V2 - Main Parser Integration
 *
 * Purpose: Integrate all components into a cohesive parsing pipeline
 *
 * Task 12.1: Wire components together in processing pipeline
 * Task 12.2: Implement output schema generation
 *
 * Requirements: 7.1, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11
 *
 * Pipeline Flow:
 * 1. RentRefundFilter - Remove non-economic SOL noise
 * 2. SwapperIdentifier - Escalation logic (fee_payer → signer → owners)
 * 3. AssetDeltaCollector - Collect non-zero deltas, exclude intermediates
 * 4. QuoteBaseDetector - Dynamic role assignment
 * 5. EraseValidator - Strict non-swap rejection
 * 6. AmountNormalizer - Calculate swap + wallet amounts
 * 7. ConfidenceScoring - Existing system preserved
 * 8. OutputGeneration - ParsedSwap, SplitSwapPair, or EraseResult
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
exports.ShyftParserV2 = void 0;
exports.createShyftParserV2 = createShyftParserV2;
exports.parseShyftTransactionV2 = parseShyftTransactionV2;
var logger_1 = __importDefault(require("./logger"));
var shyftParserV2_rentRefundFilter_1 = require("./shyftParserV2.rentRefundFilter");
var shyftParserV2_swapperIdentifier_1 = require("./shyftParserV2.swapperIdentifier");
var shyftParserV2_assetDeltaCollector_1 = require("./shyftParserV2.assetDeltaCollector");
var shyftParserV2_quoteBaseDetector_1 = require("./shyftParserV2.quoteBaseDetector");
var shyftParserV2_eraseValidator_1 = require("./shyftParserV2.eraseValidator");
var shyftParserV2_amountNormalizer_1 = require("./shyftParserV2.amountNormalizer");
var shyftParserV2_performance_1 = require("./shyftParserV2.performance");
var shyftParserV2_types_1 = require("./shyftParserV2.types");
/**
 * SHYFT Parser V2 Main Class
 *
 * Integrates all components into a cohesive parsing pipeline.
 * Handles standard swaps, split protocol for token-to-token pairs,
 * and ERASE classification for non-swap transactions.
 */
var ShyftParserV2 = /** @class */ (function () {
    function ShyftParserV2() {
        this.rentRefundFilter = (0, shyftParserV2_rentRefundFilter_1.createRentRefundFilter)();
        this.swapperIdentifier = (0, shyftParserV2_swapperIdentifier_1.createSwapperIdentifier)();
        this.assetDeltaCollector = (0, shyftParserV2_assetDeltaCollector_1.createAssetDeltaCollector)();
        this.quoteBaseDetector = (0, shyftParserV2_quoteBaseDetector_1.createQuoteBaseDetector)();
        this.eraseValidator = (0, shyftParserV2_eraseValidator_1.createEraseValidator)();
        this.amountNormalizer = (0, shyftParserV2_amountNormalizer_1.createAmountNormalizer)();
    }
    /**
     * Parse a SHYFT transaction into a swap record or ERASE result
     *
     * @param tx - SHYFT transaction data
     * @param enablePerformanceTracking - Enable detailed component-level performance tracking
     * @returns ParserResult with success flag, data, and processing time
     */
    ShyftParserV2.prototype.parseTransaction = function (tx, enablePerformanceTracking) {
        if (enablePerformanceTracking === void 0) { enablePerformanceTracking = false; }
        var startTime = Date.now();
        var perfTracker = enablePerformanceTracking ? new shyftParserV2_performance_1.PerformanceTracker(tx.signature) : null;
        try {
            // Validate required input fields
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('input_validation');
            var validationError = this.validateInput(tx);
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('input_validation');
            if (validationError) {
                logger_1.default.error({ signature: tx.signature, error: validationError }, 'ShyftParserV2: Invalid input - missing required fields');
                return this.createEraseResult(tx, 'invalid_input', { validationError: validationError }, Date.now() - startTime, perfTracker);
            }
            logger_1.default.debug({ signature: tx.signature }, 'ShyftParserV2: Starting transaction parse');
            // Status gate - only process successful transactions
            if (tx.status !== 'Success') {
                logger_1.default.info({ signature: tx.signature, status: tx.status }, 'ShyftParserV2: Transaction not successful, returning ERASE');
                return this.createEraseResult(tx, 'transaction_failed', {}, Date.now() - startTime, perfTracker);
            }
            // Stage 1: Identify Swapper
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('swapper_identification');
            var swapperResult = this.swapperIdentifier.identifySwapper(tx.fee_payer, tx.signers, tx.token_balance_changes);
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('swapper_identification');
            if (!swapperResult.swapper || swapperResult.method === 'erase') {
                logger_1.default.error({
                    signature: tx.signature,
                    feePayer: tx.fee_payer,
                    signers: tx.signers,
                    method: swapperResult.method
                }, 'ShyftParserV2: Swapper identification failed, returning ERASE');
                return this.createEraseResult(tx, 'swapper_identification_failed', { swapperResult: swapperResult }, Date.now() - startTime, perfTracker);
            }
            var swapper = swapperResult.swapper;
            var swapperMethod = swapperResult.method;
            logger_1.default.debug({ signature: tx.signature, swapper: swapper, method: swapperMethod }, 'ShyftParserV2: Swapper identified');
            // Stage 1.5: Augment balance changes with SOL transfers from actions (AMM swap detection)
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('action_augmentation');
            var augmentedBalanceChanges = this.augmentBalanceChangesWithActions(tx.token_balance_changes, tx.actions || [], swapper);
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('action_augmentation');
            logger_1.default.debug({
                signature: tx.signature,
                originalChanges: tx.token_balance_changes.length,
                augmentedChanges: augmentedBalanceChanges.length
            }, 'ShyftParserV2: Balance changes augmented with action transfers');
            // Stage 2: Filter Rent Noise
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('rent_filtering');
            var filteredChanges = this.rentRefundFilter.filterRentNoise(augmentedBalanceChanges, swapper);
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('rent_filtering');
            logger_1.default.debug({
                signature: tx.signature,
                economicChanges: filteredChanges.economicChanges.length,
                rentRefunds: filteredChanges.rentRefunds.length,
            }, 'ShyftParserV2: Rent noise filtered');
            // Stage 3: Collect Asset Deltas
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('asset_delta_collection');
            var assetDeltas = this.assetDeltaCollector.collectDeltas(filteredChanges.economicChanges, swapper);
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('asset_delta_collection');
            var intermediateAssets = Object.values(assetDeltas)
                .filter(function (a) { return a.isIntermediate; })
                .map(function (a) { return a.symbol; });
            logger_1.default.debug({
                signature: tx.signature,
                assetCount: Object.keys(assetDeltas).length,
                intermediateCount: intermediateAssets.length,
            }, 'ShyftParserV2: Asset deltas collected');
            // Stage 4: Detect Quote/Base
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('quote_base_detection');
            var quoteBaseResult = this.quoteBaseDetector.detectQuoteBase(assetDeltas);
            perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('quote_base_detection');
            if (!quoteBaseResult.quote || !quoteBaseResult.base) {
                logger_1.default.info({
                    signature: tx.signature,
                    reason: quoteBaseResult.eraseReason,
                    assetCount: Object.keys(assetDeltas).length,
                }, 'ShyftParserV2: Quote/base detection failed, returning ERASE');
                return this.createEraseResult(tx, quoteBaseResult.eraseReason || 'quote_base_detection_failed', { assetDeltas: assetDeltas }, Date.now() - startTime, perfTracker);
            }
            var quote = quoteBaseResult.quote;
            var base = quoteBaseResult.base;
            logger_1.default.debug({
                signature: tx.signature,
                quote: { mint: quote.mint, delta: quote.netDelta },
                base: { mint: base.mint, delta: base.netDelta },
                splitRequired: quoteBaseResult.splitRequired,
            }, 'ShyftParserV2: Quote/base detected');
            // Stage 5: Validate ERASE Rules (only for standard swaps, not splits)
            if (!quoteBaseResult.splitRequired) {
                perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('erase_validation');
                var validationResult = this.eraseValidator.validate(quote, base);
                perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('erase_validation');
                if (!validationResult.isValid) {
                    logger_1.default.info({
                        signature: tx.signature,
                        reason: validationResult.eraseReason,
                        quoteDelta: quote.netDelta,
                        baseDelta: base.netDelta,
                    }, 'ShyftParserV2: ERASE validation failed, returning ERASE');
                    return this.createEraseResult(tx, validationResult.eraseReason || 'erase_validation_failed', { assetDeltas: assetDeltas }, Date.now() - startTime, perfTracker);
                }
            }
            // Stage 6: Handle Split Protocol or Standard Swap
            if (quoteBaseResult.splitRequired) {
                // Token-to-token split protocol
                perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('split_swap_creation');
                var splitResult = this.createSplitSwapPair(tx, swapper, swapperMethod, quote, base, filteredChanges.rentRefunds.length, intermediateAssets);
                perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('split_swap_creation');
                var processingTime = Date.now() - startTime;
                // Check for performance timeout
                if (processingTime > 100) {
                    logger_1.default.warn({
                        signature: tx.signature,
                        processingTimeMs: processingTime,
                        perfBreakdown: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getSummary()
                    }, 'ShyftParserV2: Processing exceeded 100ms threshold');
                }
                logger_1.default.info({
                    signature: tx.signature,
                    processingTimeMs: processingTime,
                    type: 'split_swap_pair',
                    outgoingToken: quote.symbol,
                    incomingToken: base.symbol,
                    perfBreakdown: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getSummary()
                }, 'ShyftParserV2: Split swap pair created successfully');
                return {
                    success: true,
                    data: splitResult,
                    processingTimeMs: processingTime,
                    performanceMetrics: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getMetrics(),
                };
            }
            else {
                // Standard swap
                perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.startComponent('swap_creation');
                var direction = quoteBaseResult.direction;
                var swapResult = this.createParsedSwap(tx, swapper, swapperMethod, direction, quote, base, filteredChanges.rentRefunds.length, intermediateAssets);
                perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.endComponent('swap_creation');
                var processingTime = Date.now() - startTime;
                // Check for performance timeout
                if (processingTime > 100) {
                    logger_1.default.warn({
                        signature: tx.signature,
                        processingTimeMs: processingTime,
                        perfBreakdown: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getSummary()
                    }, 'ShyftParserV2: Processing exceeded 100ms threshold');
                }
                logger_1.default.info({
                    signature: tx.signature,
                    processingTimeMs: processingTime,
                    direction: direction,
                    quote: quote.symbol,
                    base: base.symbol,
                    perfBreakdown: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getSummary()
                }, 'ShyftParserV2: Parsed swap created successfully');
                return {
                    success: true,
                    data: swapResult,
                    processingTimeMs: processingTime,
                    performanceMetrics: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getMetrics(),
                };
            }
        }
        catch (error) {
            var processingTime = Date.now() - startTime;
            logger_1.default.error({
                signature: tx.signature,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                perfBreakdown: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getSummary()
            }, 'ShyftParserV2: Unexpected error parsing transaction');
            return this.createEraseResult(tx, 'parsing_error', { error: error instanceof Error ? error.message : String(error) }, processingTime, perfTracker);
        }
    };
    /**
     * Validate required input fields
     *
     * Returns error message if validation fails, null if valid
     */
    ShyftParserV2.prototype.validateInput = function (tx) {
        if (!tx.signature) {
            return 'Missing required field: signature';
        }
        if (tx.timestamp === undefined || tx.timestamp === null) {
            return 'Missing required field: timestamp';
        }
        if (!tx.fee_payer) {
            return 'Missing required field: fee_payer';
        }
        if (!tx.signers || !Array.isArray(tx.signers)) {
            return 'Missing or invalid required field: signers';
        }
        if (!tx.token_balance_changes || !Array.isArray(tx.token_balance_changes)) {
            return 'Missing or invalid required field: token_balance_changes';
        }
        // Validate token addresses
        for (var _i = 0, _a = tx.token_balance_changes; _i < _a.length; _i++) {
            var change = _a[_i];
            if (!change.mint || typeof change.mint !== 'string') {
                return 'Invalid token address: mint must be a non-empty string';
            }
            // Basic Solana address validation (base58, 32-44 characters)
            if (change.mint.length < 32 || change.mint.length > 44) {
                return "Invalid token address length: ".concat(change.mint);
            }
            if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(change.mint)) {
                return "Invalid token address format: ".concat(change.mint);
            }
        }
        // Validate fee is non-negative
        if (tx.fee < 0) {
            return 'Invalid fee: must be non-negative';
        }
        return null;
    };
    /**
     * Create a ParsedSwap result for standard swaps
     *
     * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.11
     */
    ShyftParserV2.prototype.createParsedSwap = function (tx, swapper, swapperMethod, direction, quote, base, rentRefundsFiltered, intermediateAssetsCollapsed) {
        var _a;
        // Stage 6: Normalize Amounts
        var fees = {
            transactionFee: tx.fee,
            platformFee: 0,
            priorityFee: 0,
        };
        var amounts = this.amountNormalizer.normalize(quote, base, direction, fees);
        // Stage 7: Calculate Confidence Score (preserve v1 algorithm)
        var confidence = this.calculateConfidence(swapperMethod);
        return {
            signature: tx.signature,
            timestamp: tx.timestamp,
            swapper: swapper,
            direction: direction,
            quoteAsset: {
                mint: quote.mint,
                symbol: quote.symbol,
                decimals: quote.decimals,
            },
            baseAsset: {
                mint: base.mint,
                symbol: base.symbol,
                decimals: base.decimals,
            },
            amounts: amounts,
            confidence: confidence,
            protocol: ((_a = tx.protocol) === null || _a === void 0 ? void 0 : _a.name) || 'unknown',
            swapperIdentificationMethod: swapperMethod,
            rentRefundsFiltered: rentRefundsFiltered,
            intermediateAssetsCollapsed: intermediateAssetsCollapsed,
        };
    };
    /**
     * Create a SplitSwapPair result for token-to-token unstable pairs
     *
     * Requirements: 3.5, 3.6, 4.6
     */
    ShyftParserV2.prototype.createSplitSwapPair = function (tx, swapper, swapperMethod, outgoingToken, incomingToken, rentRefundsFiltered, intermediateAssetsCollapsed) {
        var _a, _b, _c;
        var fees = {
            transactionFee: tx.fee,
            platformFee: 0,
            priorityFee: 0,
        };
        // Create SELL record for outgoing token
        // Quote is the outgoing token, base is a placeholder (will be derived from incoming token value)
        var sellAmounts = this.amountNormalizer.normalize(outgoingToken, incomingToken, 'SELL', fees);
        var sellRecord = {
            signature: tx.signature,
            timestamp: tx.timestamp,
            swapper: swapper,
            direction: 'SELL',
            quoteAsset: {
                mint: outgoingToken.mint,
                symbol: outgoingToken.symbol,
                decimals: outgoingToken.decimals,
            },
            baseAsset: {
                mint: incomingToken.mint,
                symbol: incomingToken.symbol,
                decimals: incomingToken.decimals,
            },
            amounts: sellAmounts,
            confidence: this.calculateConfidence(swapperMethod),
            protocol: ((_a = tx.protocol) === null || _a === void 0 ? void 0 : _a.name) || 'unknown',
            swapperIdentificationMethod: swapperMethod,
            rentRefundsFiltered: rentRefundsFiltered,
            intermediateAssetsCollapsed: intermediateAssetsCollapsed,
        };
        // Create BUY record for incoming token
        // Quote is the incoming token, base is a placeholder (will be derived from outgoing token value)
        var buyAmounts = this.amountNormalizer.normalize(incomingToken, outgoingToken, 'BUY', fees);
        var buyRecord = {
            signature: tx.signature,
            timestamp: tx.timestamp,
            swapper: swapper,
            direction: 'BUY',
            quoteAsset: {
                mint: incomingToken.mint,
                symbol: incomingToken.symbol,
                decimals: incomingToken.decimals,
            },
            baseAsset: {
                mint: outgoingToken.mint,
                symbol: outgoingToken.symbol,
                decimals: outgoingToken.decimals,
            },
            amounts: buyAmounts,
            confidence: this.calculateConfidence(swapperMethod),
            protocol: ((_b = tx.protocol) === null || _b === void 0 ? void 0 : _b.name) || 'unknown',
            swapperIdentificationMethod: swapperMethod,
            rentRefundsFiltered: rentRefundsFiltered,
            intermediateAssetsCollapsed: intermediateAssetsCollapsed,
        };
        return {
            signature: tx.signature,
            timestamp: tx.timestamp,
            swapper: swapper,
            splitReason: 'token_to_token_unstable_pair',
            sellRecord: sellRecord,
            buyRecord: buyRecord,
            protocol: ((_c = tx.protocol) === null || _c === void 0 ? void 0 : _c.name) || 'unknown',
            swapperIdentificationMethod: swapperMethod,
        };
    };
    /**
     * Augment balance changes with SOL transfers from actions
     *
     * This fixes the AMM swap detection bug where SOL goes to pool/AMM address
     * instead of being recorded as a balance change for the swapper.
     *
     * Pattern: Fee payer sends SOL to pool (in actions) + receives tokens (in balance changes)
     *
     * @param balanceChanges - Original token balance changes
     * @param actions - Transaction actions containing transfers
     * @param swapper - Identified swapper address
     * @returns Augmented balance changes including SOL transfers from actions
     */
    ShyftParserV2.prototype.augmentBalanceChangesWithActions = function (balanceChanges, actions, swapper) {
        var augmented = __spreadArray([], balanceChanges, true);
        var _loop_1 = function (action) {
            if (!action.info)
                return "continue";
            // PRIORITY 1: Extract from SWAP actions (fixes false negative edge case)
            // Some swaps only have amounts in the SWAP action's tokens_swapped field
            if (action.type === 'SWAP' && action.info.tokens_swapped) {
                var swapInfo = action.info.tokens_swapped;
                var swapperFromAction = action.info.swapper;
                // Only process if this is the swapper's swap
                if (swapperFromAction === swapper) {
                    // Handle IN token (what user sent)
                    if (swapInfo.in && swapInfo.in.token_address && swapInfo.in.amount_raw) {
                        var inToken_1 = swapInfo.in.token_address;
                        var inAmount = typeof swapInfo.in.amount_raw === 'string'
                            ? parseFloat(swapInfo.in.amount_raw)
                            : swapInfo.in.amount_raw;
                        // Check if we already have this token in balance changes
                        var existingIn = augmented.find(function (bc) { return bc.owner === swapper && bc.mint === inToken_1; });
                        if (!existingIn) {
                            // Create synthetic balance change for IN token
                            augmented.push({
                                address: swapper,
                                decimals: 9, // Default, will be corrected by AssetDeltaCollector
                                change_amount: -inAmount, // Negative because user sent it
                                post_balance: 0,
                                pre_balance: inAmount,
                                mint: inToken_1,
                                owner: swapper,
                            });
                            logger_1.default.debug({
                                swapper: swapper,
                                token: inToken_1.substring(0, 8) + '...',
                                amount: -inAmount
                            }, 'ShyftParserV2: Added synthetic balance change from SWAP action (IN token)');
                        }
                    }
                    // Handle OUT token (what user received)
                    if (swapInfo.out && swapInfo.out.token_address && swapInfo.out.amount_raw) {
                        var outToken_1 = swapInfo.out.token_address;
                        var outAmount = typeof swapInfo.out.amount_raw === 'string'
                            ? parseFloat(swapInfo.out.amount_raw)
                            : swapInfo.out.amount_raw;
                        // Check if we already have this token in balance changes
                        var existingOut = augmented.find(function (bc) { return bc.owner === swapper && bc.mint === outToken_1; });
                        if (!existingOut) {
                            // Create synthetic balance change for OUT token
                            augmented.push({
                                address: swapper,
                                decimals: 9, // Default
                                change_amount: outAmount, // Positive because user received it
                                post_balance: outAmount,
                                pre_balance: 0,
                                mint: outToken_1,
                                owner: swapper,
                            });
                            logger_1.default.debug({
                                swapper: swapper,
                                token: outToken_1.substring(0, 8) + '...',
                                amount: outAmount
                            }, 'ShyftParserV2: Added synthetic balance change from SWAP action (OUT token)');
                        }
                    }
                }
                return "continue";
            }
            // PRIORITY 2: Extract from SOL_TRANSFER and TOKEN_TRANSFER actions
            var _a = action.info, sender = _a.sender, receiver = _a.receiver, amount_raw = _a.amount_raw, token_address = _a.token_address;
            // Check if this is a SOL transfer (TOKEN_TRANSFER or SOL_TRANSFER)
            var isSOLTransfer = token_address === shyftParserV2_types_1.PRIORITY_ASSETS.SOL ||
                token_address === shyftParserV2_types_1.PRIORITY_ASSETS.WSOL ||
                action.type === 'SOL_TRANSFER';
            if (!isSOLTransfer || !amount_raw)
                return "continue";
            // Convert amount_raw to number
            var amountRaw = typeof amount_raw === 'string' ? parseFloat(amount_raw) : amount_raw;
            // Check if swapper is involved in this transfer
            var changeAmount = 0;
            if (sender === swapper) {
                // Swapper sent SOL (negative change)
                changeAmount = -amountRaw;
            }
            else if (receiver === swapper) {
                // Swapper received SOL (positive change)
                changeAmount = amountRaw;
            }
            else {
                return "continue";
            }
            // Check if we already have a SOL balance change for this swapper
            var existingSOLChange = augmented.find(function (bc) {
                return bc.owner === swapper &&
                    (bc.mint === shyftParserV2_types_1.PRIORITY_ASSETS.SOL || bc.mint === shyftParserV2_types_1.PRIORITY_ASSETS.WSOL);
            });
            if (existingSOLChange) {
                // Merge with existing SOL change
                existingSOLChange.change_amount += changeAmount;
                logger_1.default.debug({
                    swapper: swapper,
                    existingChange: existingSOLChange.change_amount - changeAmount,
                    actionChange: changeAmount,
                    mergedChange: existingSOLChange.change_amount
                }, 'ShyftParserV2: Merged SOL transfer from action with existing balance change');
            }
            else {
                // Create new balance change entry for SOL transfer from action
                var syntheticBalanceChange = {
                    address: swapper, // Use swapper address as account address
                    decimals: 9, // SOL has 9 decimals
                    change_amount: changeAmount,
                    post_balance: 0, // We don't know the actual balance
                    pre_balance: 0,
                    mint: shyftParserV2_types_1.PRIORITY_ASSETS.SOL,
                    owner: swapper,
                };
                augmented.push(syntheticBalanceChange);
                logger_1.default.debug({
                    swapper: swapper,
                    changeAmount: changeAmount,
                    sender: sender,
                    receiver: receiver
                }, 'ShyftParserV2: Added synthetic SOL balance change from action');
            }
        };
        // Process each action
        for (var _i = 0, actions_1 = actions; _i < actions_1.length; _i++) {
            var action = actions_1[_i];
            _loop_1(action);
        }
        return augmented;
    };
    /**
     * Create an EraseResult for rejected transactions
     *
     * Requirement: 8.10
     */
    ShyftParserV2.prototype.createEraseResult = function (tx, reason, debugData, processingTimeMs, perfTracker) {
        var eraseResult = {
            signature: tx.signature || 'unknown',
            timestamp: tx.timestamp || 0,
            reason: reason,
            debugInfo: __assign({ feePayer: tx.fee_payer || 'unknown', signers: tx.signers || [], assetDeltas: {} }, debugData),
        };
        return {
            success: false,
            erase: eraseResult,
            processingTimeMs: processingTimeMs,
            performanceMetrics: perfTracker === null || perfTracker === void 0 ? void 0 : perfTracker.getMetrics(),
        };
    };
    /**
     * Calculate confidence score based on swapper identification method
     *
     * Requirement: 7.5 - Preserve existing confidence scoring system
     *
     * Algorithm (from v1):
     * - fee_payer: 100 (high confidence)
     * - signer: 90 (medium confidence, -10 deduction)
     * - owner_analysis: 80 (low confidence, -20 deduction)
     */
    ShyftParserV2.prototype.calculateConfidence = function (method) {
        var baseConfidence = 100;
        switch (method) {
            case 'fee_payer':
                return baseConfidence; // 100 - high confidence
            case 'signer':
                return baseConfidence - 10; // 90 - medium confidence
            case 'owner_analysis':
                return baseConfidence - 20; // 80 - low confidence
            default:
                return 50; // fallback
        }
    };
    return ShyftParserV2;
}());
exports.ShyftParserV2 = ShyftParserV2;
/**
 * Factory function to create a ShyftParserV2 instance
 */
function createShyftParserV2() {
    return new ShyftParserV2();
}
/**
 * Convenience function to parse a single transaction
 */
function parseShyftTransactionV2(tx) {
    var parser = createShyftParserV2();
    return parser.parseTransaction(tx);
}
