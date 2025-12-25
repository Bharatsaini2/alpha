import express from 'express';
import {
  getSwapQuote,
  getSwapTransaction,
  trackTrade,
  getTransactionHistory,
  getPriorityLevelAnalytics,
} from '../controllers/trade.controller';
import { searchTokens } from '../controllers/jupiter-search.controller';

const router = express.Router();

/**
 * Trade Routes
 * 
 * All routes are wrapped with catchAsyncErrors middleware in the controller
 * to ensure proper error handling without crashing the server.
 */

/**
 * GET /search
 * Search for tokens using Jupiter Ultra API
 * 
 * Query Parameters:
 * - query: Search term (symbol, name, or mint address) (required)
 * 
 * Returns token information including:
 * - Basic info (name, symbol, decimals, icon)
 * - Market data (price, mcap, fdv, liquidity)
 * - Social links (twitter, telegram, website)
 * - Verification status
 * - Tags and categories
 */
router.get('/search', searchTokens);

/**
 * GET /quote
 * Get swap quote from Jupiter API with platform fee
 * 
 * Query Parameters:
 * - inputMint: Token address to sell (required)
 * - outputMint: Token address to buy (required)
 * - amount: Amount in smallest unit (required)
 * - slippageBps: Slippage tolerance in BPS (optional, default: 50)
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
router.get('/quote', getSwapQuote);

/**
 * POST /swap
 * Generate swap transaction from Jupiter API
 * 
 * Request Body:
 * - quoteResponse: Quote response from /quote endpoint (required)
 * - userPublicKey: User's wallet address (required)
 * - wrapAndUnwrapSol: Auto wrap/unwrap SOL (optional, default: true)
 * - prioritizationFeeLamports: Priority fee (optional)
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
router.post('/swap', getSwapTransaction);

/**
 * POST /track
 * Track completed swap transaction
 * 
 * Request Body:
 * - signature: Transaction signature (required)
 * - walletAddress: User's wallet address (required)
 * - inputMint: Token being sold (required)
 * - outputMint: Token being bought (required)
 * - inputAmount: Amount of input token (required)
 * - outputAmount: Amount of output token received (required)
 * - platformFee: Fee collected (required)
 * - timestamp: Transaction timestamp (optional)
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3
 */
router.post('/track', trackTrade);

/**
 * GET /history
 * Get transaction history for a wallet
 * 
 * Query Parameters:
 * - walletAddress: User's wallet address (optional, uses authenticated user if not provided)
 * - limit: Number of transactions to return (optional, default: 10, max: 100)
 * - offset: Number of transactions to skip (optional, default: 0)
 * 
 * Requirements: 16.5 - Display priority level used in transaction history
 */
router.get('/history', getTransactionHistory);

/**
 * GET /analytics/priority-levels
 * Get priority level analytics for a wallet
 * 
 * Query Parameters:
 * - walletAddress: User's wallet address (optional, uses authenticated user if not provided)
 * - timeRange: Time range for analytics ('24h', '7d', '30d', 'all') (optional, default: '7d')
 * 
 * Requirements: 16.5 - Add analytics for priority level usage
 */
router.get('/analytics/priority-levels', getPriorityLevelAnalytics);

export default router;
