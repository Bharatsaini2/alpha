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

import logger from './logger'
import { createRentRefundFilter } from './shyftParserV2.rentRefundFilter'
import { createSwapperIdentifier } from './shyftParserV2.swapperIdentifier'
import { createAssetDeltaCollector } from './shyftParserV2.assetDeltaCollector'
import { createQuoteBaseDetector } from './shyftParserV2.quoteBaseDetector'
import { createEraseValidator } from './shyftParserV2.eraseValidator'
import { createAmountNormalizer } from './shyftParserV2.amountNormalizer'
import { PerformanceTracker } from './shyftParserV2.performance'
import { getCoreTokenSuppressionService } from '../services/core-token-suppression.service'
import {
  TokenBalanceChange,
  ParsedSwap,
  SplitSwapPair,
  EraseResult,
  ParserOutput,
  ParserResult,
  FeeData,
  AssetDelta,
  PRIORITY_ASSETS,
} from './shyftParserV2.types'
import { DEFAULT_CORE_TOKENS } from '../types/shyft-parser-v2.types'
import axios from 'axios'

/**
 * Input transaction structure from SHYFT API
 */
export interface ShyftTransactionV2 {
  signature: string
  timestamp: number
  status: string
  type?: string  // Transaction type from Shyft (e.g., SWAP, CHECKANDSETSEQUENCENUMBER, etc.)
  fee: number
  fee_payer: string
  signers: string[]
  protocol?: {
    name: string
    address: string
  }
  token_balance_changes: TokenBalanceChange[]
  actions?: Array<{
    type: string
    info?: {
      sender?: string
      receiver?: string
      amount?: number
      amount_raw?: number | string
      token_address?: string
    }
    source_protocol?: {
      address: string
      name: string
    }
  }>
}

/**
 * SHYFT Parser V2 Main Class
 * 
 * Integrates all components into a cohesive parsing pipeline.
 * Handles standard swaps, split protocol for token-to-token pairs,
 * and ERASE classification for non-swap transactions.
 */
export class ShyftParserV2 {
  private rentRefundFilter = createRentRefundFilter()
  private swapperIdentifier = createSwapperIdentifier()
  private assetDeltaCollector = createAssetDeltaCollector()
  private quoteBaseDetector = createQuoteBaseDetector()
  private eraseValidator = createEraseValidator()
  private amountNormalizer = createAmountNormalizer()
  private coreTokenSuppression = getCoreTokenSuppressionService(DEFAULT_CORE_TOKENS, true) // ✅ Enable suppression

  // ✅ SOL price cache (refreshed every 5 minutes)
  private static solPriceCache: { price: number; timestamp: number } | null = null
  private static readonly SOL_PRICE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private cachedSolPrice: number = 94 // Default SOL price ($94)

  /**
   * Update SOL price cache if needed (non-blocking)
   * Triggers async price fetch but doesn't wait for it
   */
  private updateSolPriceCache(): void {
    const now = Date.now()
    
    // Check if cache needs refresh
    if (
      !ShyftParserV2.solPriceCache ||
      now - ShyftParserV2.solPriceCache.timestamp > ShyftParserV2.SOL_PRICE_CACHE_TTL
    ) {
      // Trigger async update (don't wait for it)
      this.getSolPrice().then(price => {
        this.cachedSolPrice = price
      }).catch(error => {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'ShyftParserV2: Failed to update SOL price cache'
        )
      })
    } else {
      // Use cached price
      this.cachedSolPrice = ShyftParserV2.solPriceCache.price
    }
  }

  /**
   * Fetch current SOL price with caching
   * 
   * @returns Current SOL price in USD
   */
  private async getSolPrice(): Promise<number> {
    const now = Date.now()
    
    // Return cached price if still valid
    if (
      ShyftParserV2.solPriceCache &&
      now - ShyftParserV2.solPriceCache.timestamp < ShyftParserV2.SOL_PRICE_CACHE_TTL
    ) {
      return ShyftParserV2.solPriceCache.price
    }

    // Fetch fresh price from Jupiter API
    try {
      const response = await axios.get(
        `https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112`,
        { timeout: 5000 }
      )

      const price = response.data?.['So11111111111111111111111111111111111111112']?.usdPrice || 94

      // Update cache
      ShyftParserV2.solPriceCache = { price, timestamp: now }

      logger.debug({ price }, 'ShyftParserV2: Fetched fresh SOL price')
      return price
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'ShyftParserV2: Failed to fetch SOL price, using fallback'
      )
      
      // Use cached price if available, otherwise fallback to $94
      return ShyftParserV2.solPriceCache?.price || 94
    }
  }

  /**
   * Parse a SHYFT transaction into a swap record or ERASE result
   * 
   * @param tx - SHYFT transaction data
   * @param enablePerformanceTracking - Enable detailed component-level performance tracking
   * @returns ParserResult with success flag, data, and processing time
   */
  parseTransaction(tx: ShyftTransactionV2, enablePerformanceTracking: boolean = false): ParserResult {
    const startTime = Date.now()
    const perfTracker = enablePerformanceTracking ? new PerformanceTracker(tx.signature) : null

    try {
      // Update cached SOL price if needed (non-blocking)
      this.updateSolPriceCache()
      // Validate required input fields
      perfTracker?.startComponent('input_validation')
      const validationError = this.validateInput(tx)
      perfTracker?.endComponent('input_validation')
      
      if (validationError) {
        logger.error(
          { signature: tx.signature, error: validationError },
          'ShyftParserV2: Invalid input - missing required fields'
        )
        return this.createEraseResult(
          tx,
          'invalid_input',
          { validationError },
          Date.now() - startTime,
          perfTracker
        )
      }

      logger.debug(
        { signature: tx.signature },
        'ShyftParserV2: Starting transaction parse'
      )

      // Status gate - only process successful transactions
      if (tx.status !== 'Success') {
        logger.info(
          { signature: tx.signature, status: tx.status },
          'ShyftParserV2: Transaction not successful, returning ERASE'
        )
        return this.createEraseResult(
          tx,
          'transaction_failed',
          {},
          Date.now() - startTime,
          perfTracker
        )
      }

      // Transaction type gate - reject known non-swap transaction types
      // Instead of whitelisting swap types (which may miss new DEXs),
      // we blacklist known non-swap types
      const nonSwapTypes = [
        'CHECKANDSETSEQUENCENUMBER',
        'COMPUTE_BUDGET',
        'SET_COMPUTE_UNIT_LIMIT',
        'SET_COMPUTE_UNIT_PRICE',
        'CREATE_ACCOUNT',
        'INITIALIZE_ACCOUNT',
        'CLOSE_ACCOUNT',
        'TOKEN_TRANSFER',
        'TRANSFER',
        'NFT_MINT',
        'NFT_BURN',
        'NFT_TRANSFER',
        'STAKE',
        'UNSTAKE',
        'VOTE',
        'WITHDRAW',
        'DEPOSIT',
        'CLAIM',
        'APPROVE',
        'REVOKE'
      ]
      
      if (tx.type && nonSwapTypes.includes(tx.type)) {
        logger.info(
          { signature: tx.signature, type: tx.type },
          'ShyftParserV2: Transaction type is non-swap, returning ERASE'
        )
        return this.createEraseResult(
          tx,
          'non_swap_transaction_type',
          { transactionType: tx.type },
          Date.now() - startTime,
          perfTracker
        )
      }

      // Stage 1: Identify Swapper
      perfTracker?.startComponent('swapper_identification')
      const swapperResult = this.swapperIdentifier.identifySwapper(
        tx.fee_payer,
        tx.signers,
        tx.token_balance_changes
      )
      perfTracker?.endComponent('swapper_identification')

      if (!swapperResult.swapper || swapperResult.method === 'erase') {
        logger.error(
          { 
            signature: tx.signature,
            feePayer: tx.fee_payer,
            signers: tx.signers,
            method: swapperResult.method
          },
          'ShyftParserV2: Swapper identification failed, returning ERASE'
        )
        return this.createEraseResult(
          tx,
          'swapper_identification_failed',
          { swapperResult },
          Date.now() - startTime,
          perfTracker
        )
      }

      const swapper = swapperResult.swapper
      const swapperMethod = swapperResult.method

      logger.debug(
        { signature: tx.signature, swapper, method: swapperMethod },
        'ShyftParserV2: Swapper identified'
      )

      // Stage 1.5: Augment balance changes with SOL transfers from actions (AMM swap detection)
      perfTracker?.startComponent('action_augmentation')
      const augmentedBalanceChanges = this.augmentBalanceChangesWithActions(
        tx.token_balance_changes,
        tx.actions || [],
        swapper
      )
      perfTracker?.endComponent('action_augmentation')

      logger.debug(
        { 
          signature: tx.signature, 
          originalChanges: tx.token_balance_changes.length,
          augmentedChanges: augmentedBalanceChanges.length
        },
        'ShyftParserV2: Balance changes augmented with action transfers'
      )

      // Stage 2: Filter Rent Noise
      perfTracker?.startComponent('rent_filtering')
      const filteredChanges = this.rentRefundFilter.filterRentNoise(
        augmentedBalanceChanges,
        swapper
      )
      perfTracker?.endComponent('rent_filtering')

      logger.debug(
        {
          signature: tx.signature,
          economicChanges: filteredChanges.economicChanges.length,
          rentRefunds: filteredChanges.rentRefunds.length,
        },
        'ShyftParserV2: Rent noise filtered'
      )

      // Stage 3: Collect Asset Deltas
      perfTracker?.startComponent('asset_delta_collection')
      const assetDeltas = this.assetDeltaCollector.collectDeltas(
        filteredChanges.economicChanges,
        swapper,
        tx.actions // Pass actions for fallback when balance changes are missing
      )
      perfTracker?.endComponent('asset_delta_collection')

      const intermediateAssets = Object.values(assetDeltas)
        .filter((a) => a.isIntermediate)
        .map((a) => a.symbol)

      logger.debug(
        {
          signature: tx.signature,
          assetCount: Object.keys(assetDeltas).length,
          intermediateCount: intermediateAssets.length,
        },
        'ShyftParserV2: Asset deltas collected'
      )

      // Stage 3.5: Transfer Detection Gate (NEW FIX)
      perfTracker?.startComponent('transfer_detection')
      const transferCheck = this.detectSimpleTransfer(
        filteredChanges.economicChanges,
        tx.actions || [],
        swapper
      )
      perfTracker?.endComponent('transfer_detection')

      if (transferCheck.isTransfer) {
        logger.info(
          {
            signature: tx.signature,
            reason: transferCheck.reason,
            transferType: transferCheck.transferType,
          },
          'ShyftParserV2: Simple transfer detected, returning ERASE'
        )
        return this.createEraseResult(
          tx,
          transferCheck.reason || 'simple_transfer_detected',
          { transferType: transferCheck.transferType, assetDeltas },
          Date.now() - startTime,
          perfTracker
        )
      }

      // Stage 4: Detect Quote/Base
      perfTracker?.startComponent('quote_base_detection')
      const quoteBaseResult = this.quoteBaseDetector.detectQuoteBase(assetDeltas)
      perfTracker?.endComponent('quote_base_detection')

      if (!quoteBaseResult.quote || !quoteBaseResult.base) {
        logger.info(
          {
            signature: tx.signature,
            reason: quoteBaseResult.eraseReason,
            assetCount: Object.keys(assetDeltas).length,
          },
          'ShyftParserV2: Quote/base detection failed, returning ERASE'
        )
        return this.createEraseResult(
          tx,
          quoteBaseResult.eraseReason || 'quote_base_detection_failed',
          { assetDeltas },
          Date.now() - startTime,
          perfTracker
        )
      }

      const quote = quoteBaseResult.quote
      const base = quoteBaseResult.base

      logger.debug(
        {
          signature: tx.signature,
          quote: { mint: quote.mint, delta: quote.netDelta },
          base: { mint: base.mint, delta: base.netDelta },
          splitRequired: quoteBaseResult.splitRequired,
        },
        'ShyftParserV2: Quote/base detected'
      )

      // Stage 5: Validate ERASE Rules (only for standard swaps, not splits)
      if (!quoteBaseResult.splitRequired) {
        perfTracker?.startComponent('erase_validation')
        const validationResult = this.eraseValidator.validate(quote, base)
        perfTracker?.endComponent('erase_validation')

        if (!validationResult.isValid) {
          logger.info(
            {
              signature: tx.signature,
              reason: validationResult.eraseReason,
              quoteDelta: quote.netDelta,
              baseDelta: base.netDelta,
            },
            'ShyftParserV2: ERASE validation failed, returning ERASE'
          )
          return this.createEraseResult(
            tx,
            validationResult.eraseReason || 'erase_validation_failed',
            { assetDeltas },
            Date.now() - startTime,
            perfTracker
          )
        }
      }

      // Stage 6: Handle Split Protocol or Standard Swap
      if (quoteBaseResult.splitRequired) {
        // ✅ CRITICAL: Check for core-to-core swap suppression BEFORE creating split
        const shouldSuppress = this.coreTokenSuppression.shouldSuppressSwap(
          { mint: quote.mint, symbol: quote.symbol, amount: Math.abs(quote.netDelta), decimals: quote.decimals },
          { mint: base.mint, symbol: base.symbol, amount: Math.abs(base.netDelta), decimals: base.decimals }
        )

        if (shouldSuppress) {
          logger.info(
            {
              signature: tx.signature,
              quoteMint: quote.mint,
              baseMint: base.mint,
              reason: 'core_to_core_swap_suppressed',
            },
            'ShyftParserV2: Core-to-core swap suppressed - returning ERASE'
          )
          return this.createEraseResult(
            tx,
            'core_to_core_swap_suppressed',
            { assetDeltas, quote, base },
            Date.now() - startTime,
            perfTracker
          )
        }

        // Token-to-token split protocol (no minimum value filter for swaps)
        perfTracker?.startComponent('split_swap_creation')
        const splitResult = this.createSplitSwapPair(
          tx,
          swapper,
          swapperMethod,
          quote,
          base,
          filteredChanges.rentRefunds.length,
          intermediateAssets
        )
        perfTracker?.endComponent('split_swap_creation')

        const processingTime = Date.now() - startTime
        
        // Check for performance timeout
        if (processingTime > 100) {
          logger.warn(
            { 
              signature: tx.signature, 
              processingTimeMs: processingTime,
              perfBreakdown: perfTracker?.getSummary()
            },
            'ShyftParserV2: Processing exceeded 100ms threshold'
          )
        }
        
        logger.info(
          { 
            signature: tx.signature, 
            processingTimeMs: processingTime,
            type: 'split_swap_pair',
            outgoingToken: quote.symbol,
            incomingToken: base.symbol,
            perfBreakdown: perfTracker?.getSummary()
          },
          'ShyftParserV2: Split swap pair created successfully'
        )

        return {
          success: true,
          data: splitResult,
          processingTimeMs: processingTime,
          performanceMetrics: perfTracker?.getMetrics(),
        }
      } else {
        // Standard swap (BUY/SELL) - check for core-to-core suppression first
        perfTracker?.startComponent('core_token_suppression_check')
        const shouldSuppress = this.coreTokenSuppression.shouldSuppressSwap(
          { mint: quote.mint, symbol: quote.symbol, amount: Math.abs(quote.netDelta), decimals: quote.decimals },
          { mint: base.mint, symbol: base.symbol, amount: Math.abs(base.netDelta), decimals: base.decimals }
        )
        perfTracker?.endComponent('core_token_suppression_check')

        if (shouldSuppress) {
          logger.info(
            {
              signature: tx.signature,
              quoteMint: quote.mint,
              baseMint: base.mint,
              reason: 'core_to_core_swap_suppressed',
            },
            'ShyftParserV2: Core-to-core swap suppressed - returning ERASE'
          )
          return this.createEraseResult(
            tx,
            'core_to_core_swap_suppressed',
            { assetDeltas, quote, base },
            Date.now() - startTime,
            perfTracker
          )
        }

        // Standard swap (BUY/SELL) - apply minimum value filter
        perfTracker?.startComponent('swap_creation')
        const direction = quoteBaseResult.direction!
        const swapResult = this.createParsedSwap(
          tx,
          swapper,
          swapperMethod,
          direction,
          quote,
          base,
          filteredChanges.rentRefunds.length,
          intermediateAssets
        )
        perfTracker?.endComponent('swap_creation')

        // Stage 6.5: Apply minimum value filter for BUY/SELL (not for token-to-token swaps)
        perfTracker?.startComponent('minimum_value_validation')
        const minimumValueCheck = this.validateMinimumValue(swapResult, direction)
        perfTracker?.endComponent('minimum_value_validation')

        if (!minimumValueCheck.isValid) {
          logger.info(
            {
              signature: tx.signature,
              direction,
              reason: minimumValueCheck.reason,
              usdValue: minimumValueCheck.usdValue,
            },
            'ShyftParserV2: Transaction below minimum value threshold, returning ERASE'
          )
          return this.createEraseResult(
            tx,
            minimumValueCheck.reason || 'below_minimum_value',
            { 
              direction,
              usdValue: minimumValueCheck.usdValue,
              minimumRequired: 5.0
            },
            Date.now() - startTime,
            perfTracker
          )
        }

        const processingTime = Date.now() - startTime
        
        // Check for performance timeout
        if (processingTime > 100) {
          logger.warn(
            { 
              signature: tx.signature, 
              processingTimeMs: processingTime,
              perfBreakdown: perfTracker?.getSummary()
            },
            'ShyftParserV2: Processing exceeded 100ms threshold'
          )
        }
        
        logger.info(
          { 
            signature: tx.signature, 
            processingTimeMs: processingTime,
            direction,
            quote: quote.symbol,
            base: base.symbol,
            perfBreakdown: perfTracker?.getSummary()
          },
          'ShyftParserV2: Parsed swap created successfully'
        )

        return {
          success: true,
          data: swapResult,
          processingTimeMs: processingTime,
          performanceMetrics: perfTracker?.getMetrics(),
        }
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      logger.error(
        {
          signature: tx.signature,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          perfBreakdown: perfTracker?.getSummary()
        },
        'ShyftParserV2: Unexpected error parsing transaction'
      )

      return this.createEraseResult(
        tx,
        'parsing_error',
        { error: error instanceof Error ? error.message : String(error) },
        processingTime,
        perfTracker
      )
    }
  }

  /**
   * Validate required input fields
   * 
   * Returns error message if validation fails, null if valid
   */
  private validateInput(tx: ShyftTransactionV2): string | null {
    if (!tx.signature) {
      return 'Missing required field: signature'
    }
    if (tx.timestamp === undefined || tx.timestamp === null) {
      return 'Missing required field: timestamp'
    }
    if (!tx.fee_payer) {
      return 'Missing required field: fee_payer'
    }
    if (!tx.signers || !Array.isArray(tx.signers)) {
      return 'Missing or invalid required field: signers'
    }
    if (!tx.token_balance_changes || !Array.isArray(tx.token_balance_changes)) {
      return 'Missing or invalid required field: token_balance_changes'
    }
    
    // Validate token addresses
    for (const change of tx.token_balance_changes) {
      if (!change.mint || typeof change.mint !== 'string') {
        return 'Invalid token address: mint must be a non-empty string'
      }
      // Basic Solana address validation (base58, 32-44 characters)
      if (change.mint.length < 32 || change.mint.length > 44) {
        return `Invalid token address length: ${change.mint}`
      }
      if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(change.mint)) {
        return `Invalid token address format: ${change.mint}`
      }
    }
    
    // Validate fee is non-negative
    if (tx.fee < 0) {
      return 'Invalid fee: must be non-negative'
    }
    
    return null
  }

  /**
   * Create a ParsedSwap result for standard swaps
   * 
   * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.11
   */
  private createParsedSwap(
    tx: ShyftTransactionV2,
    swapper: string,
    swapperMethod: 'fee_payer' | 'signer' | 'owner_analysis',
    direction: 'BUY' | 'SELL',
    quote: AssetDelta,
    base: AssetDelta,
    rentRefundsFiltered: number,
    intermediateAssetsCollapsed: string[]
  ): ParsedSwap {
    // Stage 6: Normalize Amounts
    const fees: FeeData = {
      transactionFee: tx.fee,
      platformFee: 0,
      priorityFee: 0,
    }

    const amounts = this.amountNormalizer.normalize(quote, base, direction, fees)

    // Stage 7: Calculate Confidence Score (preserve v1 algorithm)
    const confidence = this.calculateConfidence(swapperMethod)

    return {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction,
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
      amounts,
      confidence,
      protocol: tx.protocol?.name || 'unknown',
      swapperIdentificationMethod: swapperMethod,
      rentRefundsFiltered,
      intermediateAssetsCollapsed,
    }
  }

  /**
   * Create a SplitSwapPair result for token-to-token unstable pairs
   * 
   * Requirements: 3.5, 3.6, 4.6
   */
  private createSplitSwapPair(
    tx: ShyftTransactionV2,
    swapper: string,
    swapperMethod: 'fee_payer' | 'signer' | 'owner_analysis',
    outgoingToken: AssetDelta,
    incomingToken: AssetDelta,
    rentRefundsFiltered: number,
    intermediateAssetsCollapsed: string[]
  ): SplitSwapPair {
    const fees: FeeData = {
      transactionFee: tx.fee,
      platformFee: 0,
      priorityFee: 0,
    }

    // Create SELL record for outgoing token
    // Quote is the outgoing token, base is a placeholder (will be derived from incoming token value)
    const sellAmounts = this.amountNormalizer.normalize(
      outgoingToken,
      incomingToken,
      'SELL',
      fees
    )

    const sellRecord: ParsedSwap = {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction: 'SELL',
      baseAsset: {
        mint: outgoingToken.mint,
        symbol: outgoingToken.symbol,
        decimals: outgoingToken.decimals,
      },
      quoteAsset: {
        mint: incomingToken.mint,
        symbol: incomingToken.symbol,
        decimals: incomingToken.decimals,
      },
      amounts: sellAmounts,
      confidence: this.calculateConfidence(swapperMethod),
      protocol: tx.protocol?.name || 'unknown',
      swapperIdentificationMethod: swapperMethod,
      rentRefundsFiltered,
      intermediateAssetsCollapsed,
    }

    // Create BUY record for incoming token
    // Quote is the incoming token, base is a placeholder (will be derived from outgoing token value)
    const buyAmounts = this.amountNormalizer.normalize(
      incomingToken,
      outgoingToken,
      'BUY',
      fees
    )

    const buyRecord: ParsedSwap = {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction: 'BUY',
      baseAsset: {
        mint: incomingToken.mint,
        symbol: incomingToken.symbol,
        decimals: incomingToken.decimals,
      },
      quoteAsset: {
        mint: outgoingToken.mint,
        symbol: outgoingToken.symbol,
        decimals: outgoingToken.decimals,
      },
      amounts: buyAmounts,
      confidence: this.calculateConfidence(swapperMethod),
      protocol: tx.protocol?.name || 'unknown',
      swapperIdentificationMethod: swapperMethod,
      rentRefundsFiltered,
      intermediateAssetsCollapsed,
    }

    return {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      splitReason: 'token_to_token_unstable_pair',
      sellRecord,
      buyRecord,
      protocol: tx.protocol?.name || 'unknown',
      swapperIdentificationMethod: swapperMethod,
    }
  }

  /**
   * Detect if this is a simple transfer (not a swap)
   * 
   * A transaction is a simple transfer if:
   * 1. Only transfer actions (no SWAP actions)
   * 2. Only one meaningful token change (no counter-asset gained)
   * 3. No opposite deltas indicating exchange
   * 
   * @param economicChanges - Filtered balance changes
   * @param actions - Transaction actions
   * @param swapper - Identified swapper address
   * @returns Transfer detection result
   */
  private detectSimpleTransfer(
    economicChanges: TokenBalanceChange[],
    actions: Array<{
      type: string
      info?: any
    }>,
    swapper: string
  ): { isTransfer: boolean; reason?: string; transferType?: string } {
    
    // Check 1: If there are SWAP actions, this is likely a real swap
    const hasSwapActions = actions.some(action => 
      action.type === 'SWAP' || 
      action.type === 'JUPITER_SWAP' ||
      action.type === 'RAYDIUM_SWAP' ||
      action.type === 'ORCA_SWAP'
    )
    
    if (hasSwapActions) {
      logger.debug({ swapper }, 'Transfer detection: Has swap actions, not a transfer')
      return { isTransfer: false }
    }
    
    // Check 2: Only transfer actions (IMPROVED - ignore empty and non-swap protocol actions)
    // Filter out empty actions and non-swap protocol actions
    const meaningfulActions = actions.filter(action => {
      // Keep if it has a type
      if (!action.type || action.type === '') return false
      
      // These are protocol/sequence actions, not swap-related
      const nonSwapProtocolActions = [
        'CHECKANDSETSEQUENCENUMBER',
        'COMPUTE_BUDGET',
        'SET_COMPUTE_UNIT_LIMIT',
        'SET_COMPUTE_UNIT_PRICE',
        'CREATE_ACCOUNT',
        'INITIALIZE_ACCOUNT',
        'CLOSE_ACCOUNT'
      ]
      
      if (nonSwapProtocolActions.includes(action.type)) return false
      
      return true
    })
    
    const onlyTransferActions = meaningfulActions.length > 0 && meaningfulActions.every(action =>
      action.type === 'TOKEN_TRANSFER' ||
      action.type === 'SOL_TRANSFER' ||
      action.type === 'TRANSFER'
    )
    
    if (onlyTransferActions) {
      logger.info(
        { 
          swapper,
          totalActions: actions.length,
          meaningfulActions: meaningfulActions.length,
          transferActions: meaningfulActions.filter(a => 
            a.type === 'TOKEN_TRANSFER' || 
            a.type === 'SOL_TRANSFER' || 
            a.type === 'TRANSFER'
          ).length
        }, 
        'Transfer detection: Only transfer actions detected (ignoring protocol actions)'
      )
      return { 
        isTransfer: true, 
        reason: 'only_transfer_actions',
        transferType: 'simple_transfer'
      }
    }
    
    // Check 3: Single meaningful token change (no counter-asset)
    const meaningfulChanges = economicChanges.filter(change => 
      Math.abs(change.change_amount) > 0.000001 // Filter out dust
    )
    
    if (meaningfulChanges.length === 1) {
      logger.debug(
        { 
          swapper, 
          changeCount: meaningfulChanges.length,
          change: meaningfulChanges[0]
        }, 
        'Transfer detection: Only one meaningful change, likely transfer'
      )
      return { 
        isTransfer: true, 
        reason: 'single_meaningful_change',
        transferType: 'single_token_transfer'
      }
    }
    
    // Check 4: No opposite deltas (all changes same direction)
    const positiveChanges = meaningfulChanges.filter(c => c.change_amount > 0)
    const negativeChanges = meaningfulChanges.filter(c => c.change_amount < 0)
    
    if (positiveChanges.length === 0 || negativeChanges.length === 0) {
      logger.debug(
        { 
          swapper,
          positiveCount: positiveChanges.length,
          negativeCount: negativeChanges.length
        }, 
        'Transfer detection: No opposite deltas, likely transfer'
      )
      return { 
        isTransfer: true, 
        reason: 'no_opposite_deltas',
        transferType: 'unidirectional_transfer'
      }
    }
    
    // Check 5: All changes for same owner (simple wallet-to-wallet transfer)
    const uniqueOwners = new Set(meaningfulChanges.map(c => c.owner))
    if (uniqueOwners.size === 1 && meaningfulChanges.length === 1) {
      logger.debug(
        { swapper, owner: meaningfulChanges[0].owner }, 
        'Transfer detection: Single owner, single change, likely transfer'
      )
      return { 
        isTransfer: true, 
        reason: 'single_owner_single_change',
        transferType: 'wallet_transfer'
      }
    }
    
    logger.debug({ swapper }, 'Transfer detection: Appears to be a real swap')
    return { isTransfer: false }
  }

  /**
   * Augment balance changes with data from actions
   * 
   * Per Core Parsing Logic Step 4.2:
   * "Compute: native SOL inflow and outflow"
   * 
   * Strategy (following Core Logic exactly):
   * 1. Start with token_balance_changes for all tokens (USDC, USDT, etc.)
   * 2. Compute SOL deltas from SOL_TRANSFER actions (Step 4.2)
   * 3. Add missing tokens from SWAP action if not in balance changes
   * 4. Build complete "balance truth layer"
   * 
   * @param balanceChanges - Original token balance changes
   * @param actions - Transaction actions
   * @param swapper - Identified swapper address
   * @returns Augmented balance changes with computed SOL deltas
   */
  private augmentBalanceChangesWithActions(
    balanceChanges: TokenBalanceChange[],
    actions: Array<{
      type: string
      info?: {
        sender?: string
        receiver?: string
        amount?: number
        amount_raw?: number | string
        token_address?: string
        swapper?: string
        tokens_swapped?: {
          in?: {
            token_address?: string
            amount_raw?: number | string
          }
          out?: {
            token_address?: string
            amount_raw?: number | string
          }
        }
      }
    }>,
    swapper: string
  ): TokenBalanceChange[] {
    const augmented = [...balanceChanges]
    const SOL_MINT = 'So11111111111111111111111111111111111111112'

    // ============================================================================
    // STEP 1: Compute SOL deltas from SOL_TRANSFER actions (Core Logic Step 4.2)
    // ============================================================================
    // This is CRITICAL for PUMP.fun and other protocols where SOL doesn't appear
    // in token_balance_changes but appears in SOL_TRANSFER actions.
    // 
    // Per Core Logic: "Compute: native SOL inflow and outflow"
    // Per Core Logic Step 13: "total_wallet_cost = swap_input + all fees"
    // 
    // We sum ALL SOL_TRANSFER actions to get the true wallet cost.
    //
    // IMPORTANT: SOL_TRANSFER actions provide amounts in SOL (normalized),
    // but token_balance_changes expects amounts in lamports (raw).
    // We must convert: SOL * 1e9 = lamports
    
    let solSent = 0
    let solReceived = 0
    
    for (const action of actions) {
      if (action.type === 'SOL_TRANSFER' && action.info) {
        const { sender, receiver, amount } = action.info
        
        // Skip if amount is missing
        if (amount === undefined || amount === null) continue
        
        if (sender === swapper) {
          solSent += amount
        }
        if (receiver === swapper) {
          solReceived += amount
        }
      }
    }
    
    const netSolChange = solReceived - solSent
    
    // Convert SOL to lamports for consistency with token_balance_changes
    // token_balance_changes stores raw amounts (lamports for SOL)
    const netSolChangeLamports = netSolChange * 1e9
    
    // Add computed SOL delta to balance changes if meaningful
    if (Math.abs(netSolChangeLamports) > 1000) { // > 0.000001 SOL in lamports
      const existingSol = augmented.find(
        (bc) => bc.owner === swapper && bc.mint === SOL_MINT
      )
      
      if (!existingSol) {
        augmented.push({
          address: swapper,
          decimals: 9,
          change_amount: netSolChangeLamports,
          post_balance: Math.max(0, netSolChangeLamports),
          pre_balance: Math.max(0, -netSolChangeLamports),
          mint: SOL_MINT,
          owner: swapper,
        })
        
        logger.debug(
          { 
            swapper, 
            netSolChange, // SOL (normalized)
            netSolChangeLamports, // lamports (raw)
            solSent, 
            solReceived,
            source: 'SOL_TRANSFER_actions'
          },
          'ShyftParserV2: Computed SOL delta from SOL_TRANSFER actions (Core Logic Step 4.2)'
        )
      } else {
        // SOL exists in balance changes - log for debugging
        logger.debug(
          {
            swapper,
            existingChange: existingSol.change_amount,
            computedChange: netSolChangeLamports,
            source: 'both_balance_changes_and_actions'
          },
          'ShyftParserV2: SOL exists in both balance changes and SOL_TRANSFER actions'
        )
      }
    }

    // ============================================================================
    // STEP 2: Add missing tokens from SWAP action (optional accelerator)
    // ============================================================================
    // Per Core Logic Step 10: "tokens_swapped is an accelerator, not an authority"
    // 
    // We use SWAP action ONLY to add missing tokens that don't appear in
    // token_balance_changes. This handles cases where SHYFT omits tokens.
    
    for (const action of actions) {
      if (!action.info) continue

      if (action.type === 'SWAP' && action.info.tokens_swapped) {
        const swapInfo = action.info.tokens_swapped
        const swapperFromAction = action.info.swapper
        
        // Only process if this is the swapper's swap
        if (swapperFromAction !== swapper) continue
        
        // Handle OUT token (what user received) - most commonly missing
        if (swapInfo.out && swapInfo.out.token_address && swapInfo.out.amount_raw) {
          const outToken = swapInfo.out.token_address
          
          // ✅ CRITICAL FIX: Skip SOL if it already exists in balance changes
          // This prevents double-counting when SHYFT provides SOL in both places
          if (outToken === SOL_MINT) {
            const existingSol = augmented.find(
              (bc) => bc.owner === swapper && bc.mint === SOL_MINT
            )
            if (existingSol) {
              logger.debug(
                { swapper, existingChange: existingSol.change_amount },
                'ShyftParserV2: SOL already in balance changes, skipping SWAP action augmentation'
              )
              continue
            }
          }
          
          const outAmount = typeof swapInfo.out.amount_raw === 'string'
            ? parseFloat(swapInfo.out.amount_raw)
            : swapInfo.out.amount_raw
          
          const existingOut = augmented.find(
            (bc) => bc.owner === swapper && bc.mint === outToken
          )
          
          if (!existingOut) {
            augmented.push({
              address: swapper,
              decimals: 9, // Default, will be corrected by AssetDeltaCollector
              change_amount: outAmount,
              post_balance: outAmount,
              pre_balance: 0,
              mint: outToken,
              owner: swapper,
            })
            
            logger.debug(
              { swapper, token: outToken.substring(0, 8) + '...', amount: outAmount },
              'ShyftParserV2: Added missing OUT token from SWAP action'
            )
          }
        }
        
        // Handle IN token (what user sent) - rarely missing, but check anyway
        if (swapInfo.in && swapInfo.in.token_address && swapInfo.in.amount_raw) {
          const inToken = swapInfo.in.token_address
          
          // ✅ CRITICAL FIX: Skip SOL if it already exists in balance changes
          // This prevents double-counting when SHYFT provides SOL in both places
          if (inToken === SOL_MINT) {
            const existingSol = augmented.find(
              (bc) => bc.owner === swapper && bc.mint === SOL_MINT
            )
            if (existingSol) {
              logger.debug(
                { swapper, existingChange: existingSol.change_amount },
                'ShyftParserV2: SOL already in balance changes, skipping SWAP action augmentation'
              )
              continue
            }
          }
          
          const inAmount = typeof swapInfo.in.amount_raw === 'string' 
            ? parseFloat(swapInfo.in.amount_raw) 
            : swapInfo.in.amount_raw
          
          const existingIn = augmented.find(
            (bc) => bc.owner === swapper && bc.mint === inToken
          )
          
          if (!existingIn) {
            augmented.push({
              address: swapper,
              decimals: 9, // Default, will be corrected by AssetDeltaCollector
              change_amount: -inAmount,
              post_balance: 0,
              pre_balance: inAmount,
              mint: inToken,
              owner: swapper,
            })
            
            logger.debug(
              { swapper, token: inToken.substring(0, 8) + '...', amount: -inAmount },
              'ShyftParserV2: Added missing IN token from SWAP action'
            )
          }
        }
      }
    }

    return augmented
  }

  /**
   * Create an EraseResult for rejected transactions
   * 
   * Requirement: 8.10
   */
  private createEraseResult(
    tx: ShyftTransactionV2,
    reason: string,
    debugData: any,
    processingTimeMs: number,
    perfTracker?: PerformanceTracker | null
  ): ParserResult {
    const eraseResult: EraseResult = {
      signature: tx.signature || 'unknown',
      timestamp: tx.timestamp || 0,
      reason,
      debugInfo: {
        feePayer: tx.fee_payer || 'unknown',
        signers: tx.signers || [],
        assetDeltas: {},
        ...debugData,  // Spread additional debug data (like validationError, error, etc.)
      },
    }

    return {
      success: false,
      erase: eraseResult,
      processingTimeMs,
      performanceMetrics: perfTracker?.getMetrics(),
    }
  }

  /**
   * Validate minimum value threshold for BUY/SELL transactions
   * 
   * Filters out micro-transactions under $2 USD value for BUY/SELL operations.
   * Token-to-token swaps are exempt from this filter.
   * 
   * @param swapResult - The parsed swap result
   * @param direction - BUY or SELL direction
   * @returns Validation result with USD value estimate
   */
  private validateMinimumValue(
    swapResult: ParsedSwap,
    direction: 'BUY' | 'SELL'
  ): { isValid: boolean; reason?: string; usdValue?: number } {
    const MINIMUM_USD_VALUE = 2.0 // $2 minimum threshold
    
    // Estimate USD value based on the transaction
    let estimatedUsdValue = 0
    
    if (direction === 'BUY') {
      // For BUY: use the input amount (what user spent)
      const inputAmount = swapResult.amounts.swapInputAmount || swapResult.amounts.totalWalletCost || 0
      
      // If quote asset is SOL, estimate USD value using cached price
      if (swapResult.quoteAsset.mint === PRIORITY_ASSETS.SOL) {
        const solPrice = this.cachedSolPrice || 94 // Use cached price or fallback to $94
        estimatedUsdValue = inputAmount * solPrice
      }
      // If quote asset is USDC/USDT, use direct value
      else if (swapResult.quoteAsset.mint === PRIORITY_ASSETS.USDC || 
               swapResult.quoteAsset.mint === PRIORITY_ASSETS.USDT) {
        estimatedUsdValue = inputAmount
      }
      // For other tokens, we can't easily estimate - allow them through
      else {
        return { isValid: true }
      }
    } else {
      // For SELL: use the output amount (what user received)
      const outputAmount = swapResult.amounts.swapOutputAmount || swapResult.amounts.netWalletReceived || 0
      
      // If quote asset is SOL, estimate USD value using cached price
      if (swapResult.quoteAsset.mint === PRIORITY_ASSETS.SOL) {
        const solPrice = this.cachedSolPrice || 94 // Use cached price or fallback to $94
        estimatedUsdValue = outputAmount * solPrice
      }
      // If quote asset is USDC/USDT, use direct value
      else if (swapResult.quoteAsset.mint === PRIORITY_ASSETS.USDC || 
               swapResult.quoteAsset.mint === PRIORITY_ASSETS.USDT) {
        estimatedUsdValue = outputAmount
      }
      // For other tokens, we can't easily estimate - allow them through
      else {
        return { isValid: true }
      }
    }
    
    // Check if estimated value meets minimum threshold
    if (estimatedUsdValue < MINIMUM_USD_VALUE) {
      return {
        isValid: false,
        reason: 'below_minimum_value_threshold',
        usdValue: estimatedUsdValue
      }
    }
    
    return { isValid: true, usdValue: estimatedUsdValue }
  }

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
  private calculateConfidence(
    method: 'fee_payer' | 'signer' | 'owner_analysis'
  ): number {
    const baseConfidence = 100

    switch (method) {
      case 'fee_payer':
        return baseConfidence // 100 - high confidence
      case 'signer':
        return baseConfidence - 10 // 90 - medium confidence
      case 'owner_analysis':
        return baseConfidence - 20 // 80 - low confidence
      default:
        return 50 // fallback
    }
  }
}

/**
 * Factory function to create a ShyftParserV2 instance
 */
export function createShyftParserV2(): ShyftParserV2 {
  return new ShyftParserV2()
}

/**
 * Convenience function to parse a single transaction
 */
export function parseShyftTransactionV2(tx: ShyftTransactionV2): ParserResult {
  const parser = createShyftParserV2()
  return parser.parseTransaction(tx)
}
