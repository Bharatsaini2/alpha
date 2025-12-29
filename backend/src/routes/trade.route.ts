import express from 'express';
import {
  getSwapQuote,
  getSwapTransaction,
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
 * Get swap quote from Jupiter Ultra API with platform fee
 * 
 * Query Parameters:
 * - inputMint: Token address to sell (required)
 * - outputMint: Token address to buy (required)
 * - amount: Amount in smallest unit (required)
 * - slippageBps: Slippage tolerance in BPS (optional, default: 50)
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
router.get('/quote', getSwapQuote);

/**
 * POST /swap
 * Generate swap transaction from Jupiter Ultra API
 * 
 * Request Body:
 * - quoteResponse: Quote response from /quote endpoint (required)
 * - userPublicKey: User's wallet address (required)
 * - wrapAndUnwrapSol: Auto wrap/unwrap SOL (optional, default: true)
 * - dynamicSlippage: Enable dynamic slippage (optional, default: false)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
router.post('/swap', getSwapTransaction);

export default router;
