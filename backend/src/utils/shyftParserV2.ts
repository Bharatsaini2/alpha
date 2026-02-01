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

/**
 * Input transaction structure from SHYFT API
 */
export interface ShyftTransactionV2 {
  signature: string
  timestamp: number
  status: string
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
        swapper
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
        // Token-to-token split protocol
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
        // Standard swap
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

    // Process each action
    for (const action of actions) {
      if (!action.info) continue

      // PRIORITY 1: Extract from SWAP actions (fixes false negative edge case)
      // Some swaps only have amounts in the SWAP action's tokens_swapped field
      if (action.type === 'SWAP' && action.info.tokens_swapped) {
        const swapInfo = action.info.tokens_swapped
        const swapperFromAction = action.info.swapper
        
        // Only process if this is the swapper's swap
        if (swapperFromAction === swapper) {
          // Handle IN token (what user sent)
          if (swapInfo.in && swapInfo.in.token_address && swapInfo.in.amount_raw) {
            const inToken = swapInfo.in.token_address
            const inAmount = typeof swapInfo.in.amount_raw === 'string' 
              ? parseFloat(swapInfo.in.amount_raw) 
              : swapInfo.in.amount_raw
            
            // Check if we already have this token in balance changes
            const existingIn = augmented.find(
              (bc) => bc.owner === swapper && bc.mint === inToken
            )
            
            if (!existingIn) {
              // Create synthetic balance change for IN token
              augmented.push({
                address: swapper,
                decimals: 9, // Default, will be corrected by AssetDeltaCollector
                change_amount: -inAmount, // Negative because user sent it
                post_balance: 0,
                pre_balance: inAmount,
                mint: inToken,
                owner: swapper,
              })
              
              logger.debug(
                { 
                  swapper, 
                  token: inToken.substring(0, 8) + '...',
                  amount: -inAmount
                },
                'ShyftParserV2: Added synthetic balance change from SWAP action (IN token)'
              )
            }
          }
          
          // Handle OUT token (what user received)
          if (swapInfo.out && swapInfo.out.token_address && swapInfo.out.amount_raw) {
            const outToken = swapInfo.out.token_address
            const outAmount = typeof swapInfo.out.amount_raw === 'string'
              ? parseFloat(swapInfo.out.amount_raw)
              : swapInfo.out.amount_raw
            
            // Check if we already have this token in balance changes
            const existingOut = augmented.find(
              (bc) => bc.owner === swapper && bc.mint === outToken
            )
            
            if (!existingOut) {
              // Create synthetic balance change for OUT token
              augmented.push({
                address: swapper,
                decimals: 9, // Default
                change_amount: outAmount, // Positive because user received it
                post_balance: outAmount,
                pre_balance: 0,
                mint: outToken,
                owner: swapper,
              })
              
              logger.debug(
                { 
                  swapper, 
                  token: outToken.substring(0, 8) + '...',
                  amount: outAmount
                },
                'ShyftParserV2: Added synthetic balance change from SWAP action (OUT token)'
              )
            }
          }
        }
        
        // Continue to next action after processing SWAP
        continue
      }

      // PRIORITY 2: Extract from SOL_TRANSFER and TOKEN_TRANSFER actions
      const { sender, receiver, amount_raw, token_address } = action.info

      // Check if this is a SOL transfer (TOKEN_TRANSFER or SOL_TRANSFER)
      const isSOLTransfer = 
        token_address === PRIORITY_ASSETS.SOL ||
        token_address === PRIORITY_ASSETS.WSOL ||
        action.type === 'SOL_TRANSFER'

      if (!isSOLTransfer || !amount_raw) continue

      // Convert amount_raw to number
      const amountRaw = typeof amount_raw === 'string' ? parseFloat(amount_raw) : amount_raw

      // Check if swapper is involved in this transfer
      let changeAmount = 0
      if (sender === swapper) {
        // Swapper sent SOL (negative change)
        changeAmount = -amountRaw
      } else if (receiver === swapper) {
        // Swapper received SOL (positive change)
        changeAmount = amountRaw
      } else {
        // Swapper not involved, skip
        continue
      }

      // Check if we already have a SOL balance change for this swapper
      const existingSOLChange = augmented.find(
        (bc) => 
          bc.owner === swapper && 
          (bc.mint === PRIORITY_ASSETS.SOL || bc.mint === PRIORITY_ASSETS.WSOL)
      )

      if (existingSOLChange) {
        // Merge with existing SOL change
        existingSOLChange.change_amount += changeAmount
        logger.debug(
          { 
            swapper, 
            existingChange: existingSOLChange.change_amount - changeAmount,
            actionChange: changeAmount,
            mergedChange: existingSOLChange.change_amount
          },
          'ShyftParserV2: Merged SOL transfer from action with existing balance change'
        )
      } else {
        // Create new balance change entry for SOL transfer from action
        const syntheticBalanceChange: TokenBalanceChange = {
          address: swapper, // Use swapper address as account address
          decimals: 9, // SOL has 9 decimals
          change_amount: changeAmount,
          post_balance: 0, // We don't know the actual balance
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        }

        augmented.push(syntheticBalanceChange)

        logger.debug(
          { 
            swapper, 
            changeAmount,
            sender,
            receiver
          },
          'ShyftParserV2: Added synthetic SOL balance change from action'
        )
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
