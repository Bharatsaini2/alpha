import express from 'express'
import {
  generateLinkToken,
  upsertAlert,
  getMyAlerts,
  deleteAlert,
  getAlertSystemHealth,
} from '../controllers/alert.controller'
import { authenticate } from '../middlewares/auth.middleware'
import {
  validateAlertUpsert,
  validateAlertId,
} from '../middlewares/validation.middleware'

const alertRouter = express.Router()

// Health check endpoint (no authentication required)
alertRouter.get('/health', getAlertSystemHealth)

// All other routes require authentication
alertRouter.use(authenticate)

// POST /api/v1/alerts/link - Generate account linking token
alertRouter.post('/link', generateLinkToken)

// POST /api/v1/alerts/upsert - Create or update alert subscription
alertRouter.post('/upsert', validateAlertUpsert, upsertAlert)

// GET /api/v1/alerts/my-alerts - Get user's alert subscriptions
alertRouter.get('/my-alerts', getMyAlerts)

// DELETE /api/v1/alerts/:alertId - Delete alert subscription
alertRouter.delete('/:alertId', validateAlertId, deleteAlert)

export default alertRouter
