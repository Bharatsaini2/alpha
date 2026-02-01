/**
 * SHYFT Parser V2 - Property-Based Test Arbitraries
 * 
 * This file contains fast-check arbitraries (test data generators) for property-based testing.
 * These generators create random but valid test data for transactions, balance changes, and asset deltas.
 * 
 * Task 1: Set up enhanced parser structure and interfaces
 * Requirements: 7.2, 7.3, 7.4, 8.1
 */

import * as fc from 'fast-check'
import {
  TokenBalanceChange,
  AssetDelta,
  AssetDeltaMap,
  FeeData,
  PRIORITY_ASSETS,
} from '../shyftParserV2.types'

// ============================================================================
// Constants for Test Data Generation
// ============================================================================

const SOL_MINT = PRIORITY_ASSETS.SOL
const USDC_MINT = PRIORITY_ASSETS.USDC
const USDT_MINT = PRIORITY_ASSETS.USDT

// Sample token mints for testing
const SAMPLE_TOKEN_MINTS = [
  'TokenMint111111111111111111111111111111111',
  'TokenMint222222222222222222222222222222222',
  'TokenMint333333333333333333333333333333333',
  'WIFMint44444444444444444444444444444444444',
  'BONKMint5555555555555555555555555555555555',
]

// Sample wallet addresses
const SAMPLE_WALLETS = [
  'Wallet11111111111111111111111111111111111111',
  'Wallet22222222222222222222222222222222222222',
  'Wallet33333333333333333333333333333333333333',
  'Relayer1111111111111111111111111111111111111',
]

// Known AMM pool addresses (for exclusion testing)
const SAMPLE_AMM_POOLS = [
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
]

// ============================================================================
// Basic Arbitraries
// ============================================================================

/**
 * Generate a random Solana address (wallet or mint)
 */
export const solanaAddressArbitrary = fc.oneof(
  fc.constantFrom(...SAMPLE_WALLETS),
  fc.constantFrom(...SAMPLE_TOKEN_MINTS),
  fc.constantFrom(SOL_MINT, USDC_MINT, USDT_MINT),
  fc.constantFrom(...SAMPLE_AMM_POOLS)
)

/**
 * Generate a random wallet address (not AMM pool)
 */
export const walletAddressArbitrary = fc.constantFrom(...SAMPLE_WALLETS)

/**
 * Generate a random token mint address
 */
export const tokenMintArbitrary = fc.constantFrom(...SAMPLE_TOKEN_MINTS)

/**
 * Generate a random priority asset mint (SOL, USDC, USDT)
 */
export const priorityAssetMintArbitrary = fc.constantFrom(SOL_MINT, USDC_MINT, USDT_MINT)

/**
 * Generate a random AMM pool address
 */
export const ammPoolAddressArbitrary = fc.constantFrom(...SAMPLE_AMM_POOLS)

/**
 * Generate a random token symbol
 */
export const tokenSymbolArbitrary = fc.oneof(
  fc.constant('SOL'),
  fc.constant('USDC'),
  fc.constant('USDT'),
  fc.constant('WIF'),
  fc.constant('BONK'),
  fc.constant('TOKEN'),
  fc.string({ minLength: 3, maxLength: 5 })
)

/**
 * Generate a random token decimals (common values: 6, 9)
 */
export const tokenDecimalsArbitrary = fc.constantFrom(6, 9, 8, 0)

/**
 * Generate a random balance amount (in raw units)
 */
export const balanceAmountArbitrary = fc.nat({ max: 1_000_000_000_000 })

/**
 * Generate a random delta amount (can be positive or negative)
 */
export const deltaAmountArbitrary = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 })

/**
 * Generate a small positive SOL amount (for rent refunds)
 */
export const smallSolAmountArbitrary = fc.integer({ min: 1_000_000, max: 9_000_000 }) // 0.001 to 0.009 SOL

/**
 * Generate a transaction signature
 */
export const signatureArbitrary = fc.string({ minLength: 64, maxLength: 88 })

/**
 * Generate a timestamp (Unix timestamp in seconds)
 */
export const timestampArbitrary = fc.integer({ min: 1600000000, max: 1800000000 })

// ============================================================================
// TokenBalanceChange Arbitraries
// ============================================================================

/**
 * Generate a single token balance change
 */
export const tokenBalanceChangeArbitrary: fc.Arbitrary<TokenBalanceChange> = fc.record({
  address: solanaAddressArbitrary,
  decimals: tokenDecimalsArbitrary,
  change_amount: deltaAmountArbitrary,
  post_balance: balanceAmountArbitrary,
  pre_balance: balanceAmountArbitrary,
  mint: tokenMintArbitrary,
  owner: walletAddressArbitrary,
})

/**
 * Generate a token balance change with specific owner
 */
export function tokenBalanceChangeForOwnerArbitrary(owner: string): fc.Arbitrary<TokenBalanceChange> {
  return fc.record({
    address: solanaAddressArbitrary,
    decimals: tokenDecimalsArbitrary,
    change_amount: deltaAmountArbitrary,
    post_balance: balanceAmountArbitrary,
    pre_balance: balanceAmountArbitrary,
    mint: tokenMintArbitrary,
    owner: fc.constant(owner),
  })
}

/**
 * Generate a token balance change with specific mint
 */
export function tokenBalanceChangeForMintArbitrary(mint: string): fc.Arbitrary<TokenBalanceChange> {
  return fc.record({
    address: solanaAddressArbitrary,
    decimals: tokenDecimalsArbitrary,
    change_amount: deltaAmountArbitrary,
    post_balance: balanceAmountArbitrary,
    pre_balance: balanceAmountArbitrary,
    mint: fc.constant(mint),
    owner: walletAddressArbitrary,
  })
}

/**
 * Generate a SOL rent refund balance change (small positive SOL delta)
 */
export function rentRefundBalanceChangeArbitrary(owner: string): fc.Arbitrary<TokenBalanceChange> {
  return fc.record({
    address: solanaAddressArbitrary,
    decimals: fc.constant(9),
    change_amount: smallSolAmountArbitrary,
    post_balance: balanceAmountArbitrary,
    pre_balance: balanceAmountArbitrary,
    mint: fc.constant(SOL_MINT),
    owner: fc.constant(owner),
  })
}

/**
 * Generate a balance change with positive delta (inflow)
 */
export function positiveBalanceChangeArbitrary(owner: string, mint: string): fc.Arbitrary<TokenBalanceChange> {
  return fc.record({
    address: solanaAddressArbitrary,
    decimals: tokenDecimalsArbitrary,
    change_amount: fc.integer({ min: 1, max: 1_000_000_000 }),
    post_balance: balanceAmountArbitrary,
    pre_balance: balanceAmountArbitrary,
    mint: fc.constant(mint),
    owner: fc.constant(owner),
  })
}

/**
 * Generate a balance change with negative delta (outflow)
 */
export function negativeBalanceChangeArbitrary(owner: string, mint: string): fc.Arbitrary<TokenBalanceChange> {
  return fc.record({
    address: solanaAddressArbitrary,
    decimals: tokenDecimalsArbitrary,
    change_amount: fc.integer({ min: -1_000_000_000, max: -1 }),
    post_balance: balanceAmountArbitrary,
    pre_balance: balanceAmountArbitrary,
    mint: fc.constant(mint),
    owner: fc.constant(owner),
  })
}

/**
 * Generate a balance change with zero delta (no change)
 */
export function zeroBalanceChangeArbitrary(owner: string, mint: string): fc.Arbitrary<TokenBalanceChange> {
  return fc.record({
    address: solanaAddressArbitrary,
    decimals: tokenDecimalsArbitrary,
    change_amount: fc.constant(0),
    post_balance: balanceAmountArbitrary,
    pre_balance: balanceAmountArbitrary,
    mint: fc.constant(mint),
    owner: fc.constant(owner),
  })
}

/**
 * Generate an array of token balance changes
 */
export const tokenBalanceChangesArbitrary: fc.Arbitrary<TokenBalanceChange[]> = fc.array(
  tokenBalanceChangeArbitrary,
  { minLength: 1, maxLength: 10 }
)

// ============================================================================
// AssetDelta Arbitraries
// ============================================================================

/**
 * Generate a single asset delta
 */
export const assetDeltaArbitrary: fc.Arbitrary<AssetDelta> = fc.record({
  mint: tokenMintArbitrary,
  symbol: tokenSymbolArbitrary,
  netDelta: deltaAmountArbitrary,
  decimals: tokenDecimalsArbitrary,
  isIntermediate: fc.boolean(),
})

/**
 * Generate an asset delta with positive net delta
 */
export const positiveAssetDeltaArbitrary: fc.Arbitrary<AssetDelta> = fc.record({
  mint: tokenMintArbitrary,
  symbol: tokenSymbolArbitrary,
  netDelta: fc.integer({ min: 1, max: 1_000_000_000 }),
  decimals: tokenDecimalsArbitrary,
  isIntermediate: fc.constant(false),
})

/**
 * Generate an asset delta with negative net delta
 */
export const negativeAssetDeltaArbitrary: fc.Arbitrary<AssetDelta> = fc.record({
  mint: tokenMintArbitrary,
  symbol: tokenSymbolArbitrary,
  netDelta: fc.integer({ min: -1_000_000_000, max: -1 }),
  decimals: tokenDecimalsArbitrary,
  isIntermediate: fc.constant(false),
})

/**
 * Generate an asset delta with zero net delta (intermediate)
 */
export const intermediateAssetDeltaArbitrary: fc.Arbitrary<AssetDelta> = fc.record({
  mint: tokenMintArbitrary,
  symbol: tokenSymbolArbitrary,
  netDelta: fc.constant(0),
  decimals: tokenDecimalsArbitrary,
  isIntermediate: fc.constant(true),
})

/**
 * Generate an AssetDeltaMap with exactly 2 active assets (for swap detection)
 */
export const twoAssetDeltaMapArbitrary: fc.Arbitrary<AssetDeltaMap> = fc
  .tuple(
    positiveAssetDeltaArbitrary,
    negativeAssetDeltaArbitrary,
    tokenMintArbitrary,
    tokenMintArbitrary
  )
  .filter(([positive, negative, mint1, mint2]) => mint1 !== mint2)
  .map(([positive, negative, mint1, mint2]) => ({
    [mint1]: { ...positive, mint: mint1 },
    [mint2]: { ...negative, mint: mint2 },
  }))

/**
 * Generate an AssetDeltaMap with intermediate assets (multi-hop)
 */
export const multiHopAssetDeltaMapArbitrary: fc.Arbitrary<AssetDeltaMap> = fc
  .tuple(
    positiveAssetDeltaArbitrary,
    negativeAssetDeltaArbitrary,
    fc.array(intermediateAssetDeltaArbitrary, { minLength: 1, maxLength: 3 }),
    tokenMintArbitrary,
    tokenMintArbitrary
  )
  .filter(([positive, negative, intermediates, mint1, mint2]) => mint1 !== mint2)
  .map(([positive, negative, intermediates, mint1, mint2]) => {
    const map: AssetDeltaMap = {
      [mint1]: { ...positive, mint: mint1 },
      [mint2]: { ...negative, mint: mint2 },
    }
    intermediates.forEach((intermediate, index) => {
      map[`intermediate_${index}`] = intermediate
    })
    return map
  })

// ============================================================================
// FeeData Arbitraries
// ============================================================================

/**
 * Generate fee data
 */
export const feeDataArbitrary: fc.Arbitrary<FeeData> = fc.record({
  transactionFee: fc.double({ min: 0.000001, max: 0.01, noNaN: true }),
  platformFee: fc.option(fc.double({ min: 0, max: 100, noNaN: true })),
  priorityFee: fc.option(fc.double({ min: 0, max: 0.001, noNaN: true })),
})

/**
 * Generate fee data with zero fees
 */
export const zeroFeeDataArbitrary: fc.Arbitrary<FeeData> = fc.constant({
  transactionFee: 0,
  platformFee: 0,
  priorityFee: 0,
})

// ============================================================================
// Transaction Arbitraries
// ============================================================================

/**
 * Generate a basic transaction structure with balance changes
 */
export interface TransactionArbitrary {
  signature: string
  timestamp: number
  feePayer: string
  signers: string[]
  tokenBalanceChanges: TokenBalanceChange[]
  fee: number
}

/**
 * Generate a transaction with random balance changes
 */
export const transactionArbitrary: fc.Arbitrary<TransactionArbitrary> = fc.record({
  signature: signatureArbitrary,
  timestamp: timestampArbitrary,
  feePayer: walletAddressArbitrary,
  signers: fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 }),
  tokenBalanceChanges: tokenBalanceChangesArbitrary,
  fee: fc.double({ min: 0.000001, max: 0.01, noNaN: true }),
})

/**
 * Generate a transaction with rent noise (small SOL refund + non-SOL activity)
 */
export const rentNoiseTransactionArbitrary: fc.Arbitrary<TransactionArbitrary> = fc
  .tuple(
    signatureArbitrary,
    timestampArbitrary,
    walletAddressArbitrary,
    fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 })
  )
  .chain(([signature, timestamp, feePayer, signers]) =>
    fc.record({
      signature: fc.constant(signature),
      timestamp: fc.constant(timestamp),
      feePayer: fc.constant(feePayer),
      signers: fc.constant(signers),
      tokenBalanceChanges: fc
        .tuple(
          rentRefundBalanceChangeArbitrary(feePayer),
          negativeBalanceChangeArbitrary(feePayer, SAMPLE_TOKEN_MINTS[0]),
          positiveBalanceChangeArbitrary(feePayer, SAMPLE_TOKEN_MINTS[1])
        )
        .map(([rentRefund, tokenOut, tokenIn]) => [rentRefund, tokenOut, tokenIn]),
      fee: fc.double({ min: 0.000001, max: 0.01, noNaN: true }),
    })
  )

/**
 * Generate a relayer transaction (fee payer != actual swapper)
 */
export const relayerTransactionArbitrary: fc.Arbitrary<TransactionArbitrary> = fc
  .tuple(
    signatureArbitrary,
    timestampArbitrary,
    fc.constant(SAMPLE_WALLETS[3]), // Relayer as fee payer
    fc.constant([SAMPLE_WALLETS[0]] as string[]) // Actual swapper as signer
  )
  .chain(([signature, timestamp, feePayer, signers]) =>
    fc.record({
      signature: fc.constant(signature),
      timestamp: fc.constant(timestamp),
      feePayer: fc.constant(feePayer),
      signers: fc.constant(signers),
      tokenBalanceChanges: fc
        .tuple(
          negativeBalanceChangeArbitrary(signers[0], SOL_MINT),
          positiveBalanceChangeArbitrary(signers[0], SAMPLE_TOKEN_MINTS[0])
        )
        .map(([solOut, tokenIn]) => [solOut, tokenIn]),
      fee: fc.double({ min: 0.000001, max: 0.01, noNaN: true }),
    })
  )

/**
 * Generate a multi-hop transaction (SOL → USDC → TOKEN)
 */
export const multiHopTransactionArbitrary: fc.Arbitrary<TransactionArbitrary> = fc
  .tuple(signatureArbitrary, timestampArbitrary, walletAddressArbitrary)
  .chain(([signature, timestamp, feePayer]) =>
    fc.record({
      signature: fc.constant(signature),
      timestamp: fc.constant(timestamp),
      feePayer: fc.constant(feePayer),
      signers: fc.constant([feePayer] as string[]),
      tokenBalanceChanges: fc
        .tuple(
          negativeBalanceChangeArbitrary(feePayer, SOL_MINT),
          zeroBalanceChangeArbitrary(feePayer, USDC_MINT), // Intermediate (net zero)
          positiveBalanceChangeArbitrary(feePayer, SAMPLE_TOKEN_MINTS[0])
        )
        .map(([solOut, usdcIntermediate, tokenIn]) => [solOut, usdcIntermediate, tokenIn]),
      fee: fc.double({ min: 0.000001, max: 0.01, noNaN: true }),
    })
  )

/**
 * Generate a token-to-token swap transaction (no priority assets)
 */
export const tokenToTokenTransactionArbitrary: fc.Arbitrary<TransactionArbitrary> = fc
  .tuple(signatureArbitrary, timestampArbitrary, walletAddressArbitrary)
  .chain(([signature, timestamp, feePayer]) =>
    fc.record({
      signature: fc.constant(signature),
      timestamp: fc.constant(timestamp),
      feePayer: fc.constant(feePayer),
      signers: fc.constant([feePayer] as string[]),
      tokenBalanceChanges: fc
        .tuple(
          negativeBalanceChangeArbitrary(feePayer, SAMPLE_TOKEN_MINTS[0]),
          positiveBalanceChangeArbitrary(feePayer, SAMPLE_TOKEN_MINTS[1])
        )
        .map(([tokenOut, tokenIn]) => [tokenOut, tokenIn]),
      fee: fc.double({ min: 0.000001, max: 0.01, noNaN: true }),
    })
  )

// ============================================================================
// Export all arbitraries
// ============================================================================

export const arbitraries = {
  // Basic
  solanaAddress: solanaAddressArbitrary,
  walletAddress: walletAddressArbitrary,
  tokenMint: tokenMintArbitrary,
  priorityAssetMint: priorityAssetMintArbitrary,
  ammPoolAddress: ammPoolAddressArbitrary,
  tokenSymbol: tokenSymbolArbitrary,
  tokenDecimals: tokenDecimalsArbitrary,
  balanceAmount: balanceAmountArbitrary,
  deltaAmount: deltaAmountArbitrary,
  smallSolAmount: smallSolAmountArbitrary,
  signature: signatureArbitrary,
  timestamp: timestampArbitrary,

  // TokenBalanceChange
  tokenBalanceChange: tokenBalanceChangeArbitrary,
  tokenBalanceChangeForOwner: tokenBalanceChangeForOwnerArbitrary,
  tokenBalanceChangeForMint: tokenBalanceChangeForMintArbitrary,
  rentRefundBalanceChange: rentRefundBalanceChangeArbitrary,
  positiveBalanceChange: positiveBalanceChangeArbitrary,
  negativeBalanceChange: negativeBalanceChangeArbitrary,
  zeroBalanceChange: zeroBalanceChangeArbitrary,
  tokenBalanceChanges: tokenBalanceChangesArbitrary,

  // AssetDelta
  assetDelta: assetDeltaArbitrary,
  positiveAssetDelta: positiveAssetDeltaArbitrary,
  negativeAssetDelta: negativeAssetDeltaArbitrary,
  intermediateAssetDelta: intermediateAssetDeltaArbitrary,
  twoAssetDeltaMap: twoAssetDeltaMapArbitrary,
  multiHopAssetDeltaMap: multiHopAssetDeltaMapArbitrary,

  // FeeData
  feeData: feeDataArbitrary,
  zeroFeeData: zeroFeeDataArbitrary,

  // Transaction
  transaction: transactionArbitrary,
  rentNoiseTransaction: rentNoiseTransactionArbitrary,
  relayerTransaction: relayerTransactionArbitrary,
  multiHopTransaction: multiHopTransactionArbitrary,
  tokenToTokenTransaction: tokenToTokenTransactionArbitrary,
}
