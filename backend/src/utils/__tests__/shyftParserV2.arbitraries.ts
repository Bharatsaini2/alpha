/**
 * SHYFT Parser V2 - Property-Based Test Arbitraries
 * 
 * This file contains fast-check arbitraries (test data generators) for property-based testing.
 * These generators create random but valid test data for transactions, balance changes, and asset deltas.
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
// Basic Arbitraries
// ============================================================================

/**
 * Generate a valid Solana address (44 character base58 string)
 */
export const solanaAddressArbitrary = fc.stringMatching(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)

/**
 * Generate a valid token mint address
 */
export const tokenMintArbitrary = fc.oneof(
  fc.constant(PRIORITY_ASSETS.SOL),
  fc.constant(PRIORITY_ASSETS.USDC),
  fc.constant(PRIORITY_ASSETS.USDT),
  solanaAddressArbitrary
)

/**
 * Generate a valid token symbol
 */
export const tokenSymbolArbitrary = fc.oneof(
  fc.constant('SOL'),
  fc.constant('USDC'),
  fc.constant('USDT'),
  fc.constant('WSOL'),
  fc.stringMatching(/^[A-Z]{3,10}$/)
)

/**
 * Generate valid token decimals (0-18)
 */
export const tokenDecimalsArbitrary = fc.integer({ min: 0, max: 18 })

/**
 * Generate a transaction signature
 */
export const signatureArbitrary = fc.stringMatching(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)

/**
 * Generate a timestamp (Unix timestamp in seconds)
 */
export const timestampArbitrary = fc.integer({ min: 1600000000, max: 2000000000 })

// ============================================================================
// Token Balance Change Arbitraries
// ============================================================================

/**
 * Generate a single token balance change
 */
export const tokenBalanceChangeArbitrary = fc.record({
  address: solanaAddressArbitrary,
  decimals: tokenDecimalsArbitrary,
  change_amount: fc.integer({ min: -1000000000000, max: 1000000000000 }),
  post_balance: fc.integer({ min: 0, max: 1000000000000 }),
  pre_balance: fc.integer({ min: 0, max: 1000000000000 }),
  mint: tokenMintArbitrary,
  owner: solanaAddressArbitrary,
})

/**
 * Generate token balance changes for a specific owner
 */
export function tokenBalanceChangesForOwnerArbitrary(owner: string) {
  return fc.array(
    fc.record({
      address: solanaAddressArbitrary,
      decimals: tokenDecimalsArbitrary,
      change_amount: fc.integer({ min: -1000000000000, max: 1000000000000 }),
      post_balance: fc.integer({ min: 0, max: 1000000000000 }),
      pre_balance: fc.integer({ min: 0, max: 1000000000000 }),
      mint: tokenMintArbitrary,
      owner: fc.constant(owner),
    }),
    { minLength: 0, maxLength: 10 }
  )
}

/**
 * Generate rent noise transaction (small positive SOL delta with non-SOL activity)
 */
export const rentNoiseTransactionArbitrary = fc.tuple(
  solanaAddressArbitrary,
  fc.integer({ min: 1, max: 9999999 }) // Less than 0.01 SOL (10000000 lamports)
).chain(([owner, solDelta]) => {
  return fc.record({
    owner: fc.constant(owner),
    balanceChanges: fc.constant([
      // Small positive SOL delta (rent refund)
      {
        address: 'sol-account',
        decimals: 9,
        change_amount: solDelta,
        post_balance: 1000000000 + solDelta,
        pre_balance: 1000000000,
        mint: PRIORITY_ASSETS.SOL,
        owner,
      },
      // Non-SOL activity (token swap)
      {
        address: 'token-account',
        decimals: 6,
        change_amount: 1000000,
        post_balance: 1000000,
        pre_balance: 0,
        mint: 'TokenMint123',
        owner,
      },
    ] as TokenBalanceChange[]),
  })
})

/**
 * Generate a swap transaction with two assets (one in, one out)
 */
export const swapTransactionArbitrary = fc.tuple(
  solanaAddressArbitrary,
  tokenMintArbitrary,
  tokenMintArbitrary,
  fc.integer({ min: 1000000, max: 1000000000000 }),
  fc.integer({ min: 1000000, max: 1000000000000 })
).chain(([owner, mintIn, mintOut, amountIn, amountOut]) => {
  return fc.record({
    owner: fc.constant(owner),
    balanceChanges: fc.constant([
      // Outgoing asset (negative delta)
      {
        address: 'account-out',
        decimals: mintOut === PRIORITY_ASSETS.SOL ? 9 : 6,
        change_amount: -amountOut,
        post_balance: 0,
        pre_balance: amountOut,
        mint: mintOut,
        owner,
      },
      // Incoming asset (positive delta)
      {
        address: 'account-in',
        decimals: mintIn === PRIORITY_ASSETS.SOL ? 9 : 6,
        change_amount: amountIn,
        post_balance: amountIn,
        pre_balance: 0,
        mint: mintIn,
        owner,
      },
    ] as TokenBalanceChange[]),
  })
})

/**
 * Generate a multi-hop transaction (e.g., SOL → USDC → TOKEN)
 */
export const multiHopTransactionArbitrary = fc.tuple(
  solanaAddressArbitrary,
  fc.integer({ min: 1000000000, max: 10000000000 }), // SOL amount
  fc.integer({ min: 1000000, max: 100000000 }), // USDC amount (intermediate)
  fc.integer({ min: 1000000, max: 1000000000 }) // Token amount
).chain(([owner, solAmount, usdcAmount, tokenAmount]) => {
  return fc.record({
    owner: fc.constant(owner),
    balanceChanges: fc.constant([
      // SOL out
      {
        address: 'sol-account',
        decimals: 9,
        change_amount: -solAmount,
        post_balance: 0,
        pre_balance: solAmount,
        mint: PRIORITY_ASSETS.SOL,
        owner,
      },
      // USDC intermediate (net zero - in and out)
      {
        address: 'usdc-account-in',
        decimals: 6,
        change_amount: usdcAmount,
        post_balance: usdcAmount,
        pre_balance: 0,
        mint: PRIORITY_ASSETS.USDC,
        owner,
      },
      {
        address: 'usdc-account-out',
        decimals: 6,
        change_amount: -usdcAmount,
        post_balance: 0,
        pre_balance: usdcAmount,
        mint: PRIORITY_ASSETS.USDC,
        owner,
      },
      // Token in
      {
        address: 'token-account',
        decimals: 6,
        change_amount: tokenAmount,
        post_balance: tokenAmount,
        pre_balance: 0,
        mint: 'TokenMintXYZ',
        owner,
      },
    ] as TokenBalanceChange[]),
  })
})

/**
 * Generate a relayer transaction (fee payer != swapper)
 */
export const relayerTransactionArbitrary = fc.tuple(
  solanaAddressArbitrary, // relayer (fee payer)
  solanaAddressArbitrary, // actual swapper
  fc.integer({ min: 1000000, max: 1000000000 }),
  fc.integer({ min: 1000000, max: 1000000000 })
).chain(([relayer, swapper, amountIn, amountOut]) => {
  return fc.record({
    feePayer: fc.constant(relayer),
    swapper: fc.constant(swapper),
    signers: fc.constant([swapper, relayer]),
    balanceChanges: fc.constant([
      // Swapper's token out
      {
        address: 'swapper-token-out',
        decimals: 6,
        change_amount: -amountOut,
        post_balance: 0,
        pre_balance: amountOut,
        mint: 'TokenMintABC',
        owner: swapper,
      },
      // Swapper's token in
      {
        address: 'swapper-token-in',
        decimals: 6,
        change_amount: amountIn,
        post_balance: amountIn,
        pre_balance: 0,
        mint: 'TokenMintDEF',
        owner: swapper,
      },
      // Relayer's SOL (fee payment only, no swap activity)
      {
        address: 'relayer-sol',
        decimals: 9,
        change_amount: -5000000, // 0.005 SOL fee
        post_balance: 995000000,
        pre_balance: 1000000000,
        mint: PRIORITY_ASSETS.SOL,
        owner: relayer,
      },
    ] as TokenBalanceChange[]),
  })
})

// ============================================================================
// Asset Delta Arbitraries
// ============================================================================

/**
 * Generate a single asset delta
 */
export const assetDeltaArbitrary = fc.record({
  mint: tokenMintArbitrary,
  symbol: tokenSymbolArbitrary,
  netDelta: fc.integer({ min: -1000000000000, max: 1000000000000 }),
  decimals: tokenDecimalsArbitrary,
  isIntermediate: fc.boolean(),
})

/**
 * Generate an asset delta map with exactly 2 active assets
 */
export const twoAssetDeltaMapArbitrary = fc.tuple(
  tokenMintArbitrary,
  tokenMintArbitrary,
  fc.integer({ min: 1000000, max: 1000000000 }),
  fc.integer({ min: 1000000, max: 1000000000 })
).chain(([mint1, mint2, amount1, amount2]) => {
  const deltaMap: AssetDeltaMap = {
    [mint1]: {
      mint: mint1,
      symbol: mint1 === PRIORITY_ASSETS.SOL ? 'SOL' : 'TOKEN1',
      netDelta: -amount1, // Outgoing
      decimals: mint1 === PRIORITY_ASSETS.SOL ? 9 : 6,
      isIntermediate: false,
    },
    [mint2]: {
      mint: mint2,
      symbol: mint2 === PRIORITY_ASSETS.SOL ? 'SOL' : 'TOKEN2',
      netDelta: amount2, // Incoming
      decimals: mint2 === PRIORITY_ASSETS.SOL ? 9 : 6,
      isIntermediate: false,
    },
  }
  return fc.constant(deltaMap)
})

/**
 * Generate an asset delta map with intermediate assets (multi-hop)
 */
export const multiHopAssetDeltaMapArbitrary = fc.tuple(
  tokenMintArbitrary,
  tokenMintArbitrary,
  fc.integer({ min: 1000000, max: 1000000000 }),
  fc.integer({ min: 1000000, max: 1000000000 })
).chain(([mintStart, mintEnd, amountStart, amountEnd]) => {
  const deltaMap: AssetDeltaMap = {
    [mintStart]: {
      mint: mintStart,
      symbol: mintStart === PRIORITY_ASSETS.SOL ? 'SOL' : 'TOKEN_START',
      netDelta: -amountStart, // Outgoing
      decimals: mintStart === PRIORITY_ASSETS.SOL ? 9 : 6,
      isIntermediate: false,
    },
    [PRIORITY_ASSETS.USDC]: {
      mint: PRIORITY_ASSETS.USDC,
      symbol: 'USDC',
      netDelta: 0, // Intermediate (net zero)
      decimals: 6,
      isIntermediate: true,
    },
    [mintEnd]: {
      mint: mintEnd,
      symbol: mintEnd === PRIORITY_ASSETS.SOL ? 'SOL' : 'TOKEN_END',
      netDelta: amountEnd, // Incoming
      decimals: mintEnd === PRIORITY_ASSETS.SOL ? 9 : 6,
      isIntermediate: false,
    },
  }
  return fc.constant(deltaMap)
})

// ============================================================================
// Fee Data Arbitraries
// ============================================================================

/**
 * Generate fee data
 */
export const feeDataArbitrary = fc.record({
  transactionFee: fc.integer({ min: 5000, max: 10000 }).map(n => n / 1e9), // 0.000005 - 0.00001 SOL
  platformFee: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
  priorityFee: fc.option(fc.integer({ min: 0, max: 100000 }).map(n => n / 1e9), { nil: undefined }),
})

// ============================================================================
// ERASE Transaction Arbitraries
// ============================================================================

/**
 * Generate a transaction that should be classified as ERASE (both positive deltas)
 */
export const bothPositiveEraseArbitrary = fc.tuple(
  solanaAddressArbitrary,
  fc.integer({ min: 1000000, max: 1000000000 }),
  fc.integer({ min: 1000000, max: 1000000000 })
).chain(([owner, amount1, amount2]) => {
  return fc.record({
    owner: fc.constant(owner),
    balanceChanges: fc.constant([
      {
        address: 'account-1',
        decimals: 6,
        change_amount: amount1, // Positive
        post_balance: amount1,
        pre_balance: 0,
        mint: 'TokenMint1',
        owner,
      },
      {
        address: 'account-2',
        decimals: 6,
        change_amount: amount2, // Positive
        post_balance: amount2,
        pre_balance: 0,
        mint: 'TokenMint2',
        owner,
      },
    ] as TokenBalanceChange[]),
  })
})

/**
 * Generate a transaction that should be classified as ERASE (both negative deltas)
 */
export const bothNegativeEraseArbitrary = fc.tuple(
  solanaAddressArbitrary,
  fc.integer({ min: 1000000, max: 1000000000 }),
  fc.integer({ min: 1000000, max: 1000000000 })
).chain(([owner, amount1, amount2]) => {
  return fc.record({
    owner: fc.constant(owner),
    balanceChanges: fc.constant([
      {
        address: 'account-1',
        decimals: 6,
        change_amount: -amount1, // Negative
        post_balance: 0,
        pre_balance: amount1,
        mint: 'TokenMint1',
        owner,
      },
      {
        address: 'account-2',
        decimals: 6,
        change_amount: -amount2, // Negative
        post_balance: 0,
        pre_balance: amount2,
        mint: 'TokenMint2',
        owner,
      },
    ] as TokenBalanceChange[]),
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a token balance change with specific parameters
 */
export function createTokenBalanceChange(
  owner: string,
  mint: string,
  delta: number,
  decimals: number = 6
): TokenBalanceChange {
  const preBalance = delta < 0 ? Math.abs(delta) : 0
  const postBalance = delta > 0 ? delta : 0
  
  return {
    address: `account-${mint.substring(0, 8)}`,
    decimals,
    change_amount: delta,
    post_balance: postBalance,
    pre_balance: preBalance,
    mint,
    owner,
  }
}

/**
 * Create an asset delta with specific parameters
 */
export function createAssetDelta(
  mint: string,
  symbol: string,
  netDelta: number,
  decimals: number = 6,
  isIntermediate: boolean = false
): AssetDelta {
  return {
    mint,
    symbol,
    netDelta,
    decimals,
    isIntermediate,
  }
}
