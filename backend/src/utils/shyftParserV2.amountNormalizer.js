"use strict";
/**
 * SHYFT Parser V2 - AmountNormalizer Component
 *
 * Purpose: Calculate both swap amounts and total wallet costs
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8
 * Task 10: Implement AmountNormalizer component
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmountNormalizerImpl = void 0;
exports.createAmountNormalizer = createAmountNormalizer;
var logger_1 = __importDefault(require("./logger"));
var shyftParserV2_types_1 = require("./shyftParserV2.types");
var AmountNormalizerImpl = /** @class */ (function () {
    function AmountNormalizerImpl() {
    }
    AmountNormalizerImpl.prototype.normalize = function (quote, base, direction, fees) {
        try {
            // Validate inputs
            if (quote.netDelta === 0) {
                logger_1.default.warn({ quoteMint: quote.mint, direction: direction }, 'AmountNormalizer: Quote delta is zero, using fallback');
            }
            if (base.netDelta === 0) {
                logger_1.default.warn({ baseMint: base.mint, direction: direction }, 'AmountNormalizer: Base delta is zero, using fallback');
            }
            if (direction === 'BUY') {
                return this.normalizeBuy(quote, base, fees);
            }
            else {
                return this.normalizeSell(quote, base, fees);
            }
        }
        catch (error) {
            logger_1.default.error({
                error: error instanceof Error ? error.message : String(error),
                quoteMint: quote.mint,
                baseMint: base.mint,
                direction: direction,
            }, 'AmountNormalizer: Error normalizing amounts, using fallback values');
            // Return fallback values
            return this.createFallbackAmounts(quote, base, direction, fees);
        }
    };
    AmountNormalizerImpl.prototype.normalizeBuy = function (quote, base, fees) {
        var swapInputAmount = Math.abs(quote.netDelta);
        var feeBreakdown = this.calculateFeeBreakdown(fees, quote.mint);
        var totalWalletCost = swapInputAmount + feeBreakdown.totalFeeQuote;
        var baseAmount = Math.abs(base.netDelta);
        return {
            swapInputAmount: swapInputAmount,
            totalWalletCost: totalWalletCost,
            baseAmount: baseAmount,
            feeBreakdown: feeBreakdown,
        };
    };
    AmountNormalizerImpl.prototype.normalizeSell = function (quote, base, fees) {
        var swapOutputAmount = Math.abs(quote.netDelta);
        var feeBreakdown = this.calculateFeeBreakdown(fees, quote.mint);
        var netWalletReceived = swapOutputAmount - feeBreakdown.totalFeeQuote;
        var baseAmount = Math.abs(base.netDelta);
        return {
            swapOutputAmount: swapOutputAmount,
            netWalletReceived: netWalletReceived,
            baseAmount: baseAmount,
            feeBreakdown: feeBreakdown,
        };
    };
    AmountNormalizerImpl.prototype.calculateFeeBreakdown = function (fees, quoteMint) {
        var transactionFeeSOL = fees.transactionFee;
        var priorityFeeSOL = fees.priorityFee || 0;
        var platformFee = fees.platformFee || 0;
        var transactionFeeQuote;
        var priorityFeeQuote;
        if (quoteMint === shyftParserV2_types_1.PRIORITY_ASSETS.SOL || quoteMint === shyftParserV2_types_1.PRIORITY_ASSETS.WSOL) {
            transactionFeeQuote = transactionFeeSOL;
            priorityFeeQuote = priorityFeeSOL;
        }
        else {
            var solToQuoteRate = this.getSolToQuoteRate(quoteMint);
            transactionFeeQuote = transactionFeeSOL * solToQuoteRate;
            priorityFeeQuote = priorityFeeSOL * solToQuoteRate;
        }
        var totalFeeQuote = transactionFeeQuote + priorityFeeQuote + platformFee;
        return {
            transactionFeeSOL: transactionFeeSOL,
            transactionFeeQuote: transactionFeeQuote,
            platformFee: platformFee,
            priorityFee: priorityFeeSOL,
            totalFeeQuote: totalFeeQuote,
        };
    };
    AmountNormalizerImpl.prototype.getSolToQuoteRate = function (quoteMint) {
        // For stablecoins, use approximate SOL price
        if (quoteMint === shyftParserV2_types_1.PRIORITY_ASSETS.USDC || quoteMint === shyftParserV2_types_1.PRIORITY_ASSETS.USDT) {
            return 100;
        }
        // For other tokens, we don't have market data, so use 1:1 fallback
        // This means fees will be in SOL terms, which is acceptable
        logger_1.default.warn({ quoteMint: quoteMint }, 'AmountNormalizer: No market rate available for quote asset, using 1:1 fallback');
        return 1;
    };
    /**
     * Create fallback amounts when calculation fails
     */
    AmountNormalizerImpl.prototype.createFallbackAmounts = function (quote, base, direction, fees) {
        var baseAmount = Math.abs(base.netDelta);
        var feeBreakdown = {
            transactionFeeSOL: fees.transactionFee,
            transactionFeeQuote: 0,
            platformFee: 0,
            priorityFee: 0,
            totalFeeQuote: 0,
        };
        if (direction === 'BUY') {
            return {
                swapInputAmount: Math.abs(quote.netDelta),
                totalWalletCost: Math.abs(quote.netDelta),
                baseAmount: baseAmount,
                feeBreakdown: feeBreakdown,
            };
        }
        else {
            return {
                swapOutputAmount: Math.abs(quote.netDelta),
                netWalletReceived: Math.abs(quote.netDelta),
                baseAmount: baseAmount,
                feeBreakdown: feeBreakdown,
            };
        }
    };
    return AmountNormalizerImpl;
}());
exports.AmountNormalizerImpl = AmountNormalizerImpl;
function createAmountNormalizer() {
    return new AmountNormalizerImpl();
}
