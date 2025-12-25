import express from 'express';
import {
  getJupiterStatus,
  getJupiterConfig,
  testJupiterConnectivity,
} from '../controllers/admin.controller';

const router = express.Router();

/**
 * Admin Routes for Jupiter Ultra Management
 * 
 * These routes provide administrative access to Jupiter Ultra configuration
 * and system status. In production, these should be protected with authentication.
 */

/**
 * GET /status
 * Get comprehensive Jupiter Ultra system status
 * 
 * Returns:
 * - System configuration
 * - Recent transaction statistics
 * - Priority level distribution
 * - Configuration validation results
 */
router.get('/jupiter/status', getJupiterStatus);

/**
 * GET /config
 * Get Jupiter Ultra configuration details
 * 
 * Returns:
 * - Service configuration
 * - API endpoint information
 * - Feature flags status
 * - Configuration validation
 */
router.get('/jupiter/config', getJupiterConfig);

/**
 * POST /test
 * Test Jupiter Ultra API connectivity
 * 
 * Performs a simple connectivity test to verify
 * that the Jupiter Ultra API is accessible and responding.
 */
router.post('/jupiter/test', testJupiterConnectivity);

export default router;