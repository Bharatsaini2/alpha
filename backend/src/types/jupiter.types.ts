/**
 * TypeScript interfaces for Jupiter API v6 and Ultra API
 * Documentation: https://station.jup.ag/api-v6/get-quote
 */

/**
 * Priority levels for Jupiter Ultra API
 */
export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'VeryHigh';

/**
 * Platform fee configuration for Jupiter swaps
 */
export interface PlatformFee {
  amount: string;
  mint: string;
  pct: number;
}

/**
 * Route plan step for swap execution
 */
export interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label?: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

/**
 * Response from Jupiter /quote endpoint
 */
export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: PlatformFee;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

/**
 * Request parameters for Jupiter /quote endpoint
 */
export interface JupiterQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps?: number;
  platformFeeBps?: number;
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  maxAccounts?: number;
}

/**
 * Request body for Jupiter Ultra /swap endpoint
 */
export interface UltraSwapRequest {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  feeAccount?: string;
  priorityLevel?: PriorityLevel;
  dynamicSlippage?: boolean;
  asLegacyTransaction?: boolean;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
}

/**
 * Request body for Jupiter /swap endpoint (legacy)
 */
export interface JupiterSwapRequest {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  feeAccount?: string;
  trackingAccount?: string;
  computeUnitPriceMicroLamports?: number;
  prioritizationFeeLamports?: number;
  asLegacyTransaction?: boolean;
  useTokenLedger?: boolean;
  destinationTokenAccount?: string;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
  autoCreateOutATA?: boolean; // Auto-create output Associated Token Account if it doesn't exist
  // Ultra-specific parameters for backward compatibility
  priorityLevel?: PriorityLevel;
  dynamicSlippage?: boolean;
}

/**
 * Response from Jupiter /swap endpoint (including Ultra)
 */
export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  prioritizationType?: {
    computeBudget?: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  priorityFeeEstimate?: number; // Ultra-specific field
}

/**
 * Request body for tracking completed trades
 */
export interface TrackTradeRequest {
  signature: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  platformFee: number;
  timestamp?: Date;
  priorityLevel?: string; // Track priority level used
}

/**
 * Response for trade tracking endpoint
 */
export interface TrackTradeResponse {
  success: boolean;
  message: string;
  trade?: {
    signature: string;
    walletAddress: string;
    inputMint: string;
    outputMint: string;
    inputAmount: number;
    outputAmount: number;
    platformFee: number;
    timestamp: Date;
  };
}

/**
 * Error response structure
 */
export interface JupiterErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}
