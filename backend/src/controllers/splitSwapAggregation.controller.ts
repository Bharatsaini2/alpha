/**
 * Split Swap Aggregation Controller
 * 
 * Task 10.1: API endpoint for aggregated split swap view
 * 
 * Purpose: Provide frontend-compatible aggregated view of split swap transactions
 * while maintaining storage layer integrity (two separate records).
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import logger from '../utils/logger'

/**
 * Aggregated split swap view for frontend display
 * 
 * Combines SELL and BUY records into a single view while preserving
 * both on-chain amounts and valuation data
 */
export interface AggregatedSplitSwap {
  signature: string
  timestamp: Date
  whale: {
    address: string
    name?: string
  }
  
  // On-chain economic truth
  tokenSold: {
    symbol: string
    address: string
    amount: string  // Actual token amount sold
  }
  
  tokenBought: {
    symbol: string
    address: string
    amount: string  // Actual token amount bought
  }
  
  // Valuation data (separate from on-chain truth)
  valuation: {
    tokenSoldUsdValue: string
    tokenBoughtUsdValue: string
    totalUsdValue: string
  }
  
  // Metadata
  protocol: string
  classificationSource: string[]
  
  // Original records for reference
  sellRecord: any
  buyRecord: any
}

/**
 * Get aggregated split swap view by signature
 * 
 * Queries both SELL and BUY records and combines them into frontend-compatible format
 * 
 * @param signature - Transaction signature
 * @returns Aggregated split swap view or null if not found/incomplete
 */
export const getAggregatedSplitSwap = async (
  signature: string
): Promise<AggregatedSplitSwap | null> => {
  try {
    logger.info({ signature }, 'Fetching split swap records for aggregation')
    
    // Query both SELL and BUY records
    const records = await whaleAllTransactionModelV2
      .find({
        signature,
        type: { $in: ['sell', 'buy'] },
      })
      .lean()
    
    if (records.length === 0) {
      logger.warn({ signature }, 'No split swap records found')
      return null
    }
    
    if (records.length === 1) {
      logger.warn(
        { signature, foundType: records[0].type },
        'Incomplete split swap - only one record found'
      )
      // Return partial data or null based on requirements
      return null
    }
    
    // Find SELL and BUY records
    const sellRecord = records.find(r => r.type === 'sell')
    const buyRecord = records.find(r => r.type === 'buy')
    
    if (!sellRecord || !buyRecord) {
      logger.warn(
        { signature, types: records.map(r => r.type) },
        'Missing SELL or BUY record'
      )
      return null
    }
    
    // Aggregate into frontend-compatible format
    const aggregated: AggregatedSplitSwap = {
      signature,
      timestamp: sellRecord.timestamp || buyRecord.timestamp,
      whale: {
        address: sellRecord.whale?.address || sellRecord.whaleAddress,
        name: sellRecord.whale?.name,
      },
      
      // On-chain economic truth from actual records
      tokenSold: {
        symbol: sellRecord.transaction?.tokenOut?.symbol || sellRecord.tokenOutSymbol,
        address: sellRecord.transaction?.tokenOut?.address || sellRecord.tokenOutAddress,
        amount: sellRecord.amount?.sellAmount || '0',
      },
      
      tokenBought: {
        symbol: buyRecord.transaction?.tokenIn?.symbol || buyRecord.tokenInSymbol,
        address: buyRecord.transaction?.tokenIn?.address || buyRecord.tokenInAddress,
        amount: buyRecord.amount?.buyAmount || '0',
      },
      
      // Valuation data (separate from on-chain truth)
      valuation: {
        tokenSoldUsdValue: sellRecord.transaction?.tokenOut?.usdAmount || '0',
        tokenBoughtUsdValue: buyRecord.transaction?.tokenIn?.usdAmount || '0',
        totalUsdValue: calculateTotalUsdValue(
          sellRecord.transaction?.tokenOut?.usdAmount,
          buyRecord.transaction?.tokenIn?.usdAmount
        ),
      },
      
      // Metadata
      protocol: sellRecord.transaction?.platform || buyRecord.transaction?.platform || 'unknown',
      classificationSource: [
        sellRecord.classificationSource,
        buyRecord.classificationSource,
      ].filter((source): source is string => Boolean(source)),
      
      // Original records for reference
      sellRecord,
      buyRecord,
    }
    
    logger.info(
      {
        signature,
        tokenSold: aggregated.tokenSold.symbol,
        tokenBought: aggregated.tokenBought.symbol,
      },
      'Successfully aggregated split swap'
    )
    
    return aggregated
  } catch (error) {
    logger.error(
      {
        signature,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error aggregating split swap'
    )
    throw error
  }
}

/**
 * Get multiple aggregated split swaps
 * 
 * Useful for displaying lists of split swaps in the frontend
 * 
 * @param signatures - Array of transaction signatures
 * @returns Array of aggregated split swaps
 */
export const getAggregatedSplitSwaps = async (
  signatures: string[]
): Promise<AggregatedSplitSwap[]> => {
  try {
    logger.info({ count: signatures.length }, 'Fetching multiple split swaps for aggregation')
    
    const aggregated = await Promise.all(
      signatures.map(sig => getAggregatedSplitSwap(sig))
    )
    
    // Filter out nulls (incomplete or missing records)
    const validAggregated = aggregated.filter((a): a is AggregatedSplitSwap => a !== null)
    
    logger.info(
      {
        requested: signatures.length,
        found: validAggregated.length,
      },
      'Completed batch aggregation'
    )
    
    return validAggregated
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in batch aggregation'
    )
    throw error
  }
}

/**
 * Helper: Calculate total USD value
 * 
 * Takes max of tokenIn and tokenOut USD values to avoid double-counting
 */
function calculateTotalUsdValue(
  tokenOutUsd: string | undefined,
  tokenInUsd: string | undefined
): string {
  const outValue = parseFloat(tokenOutUsd || '0')
  const inValue = parseFloat(tokenInUsd || '0')
  
  // Use max to avoid double-counting (both should be similar)
  return Math.max(outValue, inValue).toString()
}
