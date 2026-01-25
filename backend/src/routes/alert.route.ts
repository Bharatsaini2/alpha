import express from 'express'
import {
  checkPremiumAccessStatus,
  createWhaleAlert,
  getWhaleAlerts,
  deleteWhaleAlert,
  createKolAlert,
  getKolAlerts,
  deleteKolAlert,
  createKolProfileAlert,
  getKolProfileAlerts,
  deleteKolProfileAlert,
  generateLinkToken,
  unlinkTelegram,
  upsertAlert,
  getMyAlerts,
  deleteAlert,
  getAlertSystemHealth,
} from '../controllers/alert.controller'
import { authenticate } from '../middlewares/auth.middleware'
import { premiumGate } from '../middlewares/premiumGate.middleware'
import {
  validateAlertUpsert,
  validateAlertId,
} from '../middlewares/validation.middleware'

const alertRouter = express.Router()

// Health check endpoint (no authentication required)
alertRouter.get('/health', getAlertSystemHealth)

// All other routes require authentication
alertRouter.use(authenticate)

// GET /api/v1/alerts/premium-access - Check premium access status
alertRouter.get('/premium-access', checkPremiumAccessStatus)

// POST /api/v1/alerts/whale-alert - Create or update whale alert subscription
alertRouter.post('/whale-alert', createWhaleAlert)

// GET /api/v1/alerts/whale-alerts - Get user's whale alert subscriptions
alertRouter.get('/whale-alerts', getWhaleAlerts)

// DELETE /api/v1/alerts/whale-alert/:alertId - Delete whale alert subscription
alertRouter.delete('/whale-alert/:alertId', validateAlertId, deleteWhaleAlert)

// POST /api/v1/alerts/kol-alert - Create or update KOL alert subscription
alertRouter.post('/kol-alert', createKolAlert)

// GET /api/v1/alerts/kol-alerts - Get user's KOL alert subscriptions
alertRouter.get('/kol-alerts', getKolAlerts)

// DELETE /api/v1/alerts/kol-alert/:alertId - Delete KOL alert subscription
alertRouter.delete('/kol-alert/:alertId', validateAlertId, deleteKolAlert)

// POST /api/v1/alerts/kol-profile - Create or update KOL Profile alert subscription
alertRouter.post('/kol-profile', createKolProfileAlert)

// GET /api/v1/alerts/kol-profile-alerts - Get user's KOL Profile alert subscriptions
alertRouter.get('/kol-profile-alerts', getKolProfileAlerts)

// DELETE /api/v1/alerts/kol-profile/:alertId - Delete KOL Profile alert subscription
alertRouter.delete('/kol-profile/:alertId', validateAlertId, deleteKolProfileAlert)

// POST /api/v1/alerts/link - Generate account linking token
alertRouter.post('/link', premiumGate, generateLinkToken)

// POST /api/v1/alerts/unlink-telegram - Disconnect Telegram account
alertRouter.post('/unlink-telegram', unlinkTelegram)

// POST /api/v1/alerts/upsert - Create or update alert subscription
alertRouter.post('/upsert', validateAlertUpsert, upsertAlert)

// GET /api/v1/alerts/my-alerts - Get user's alert subscriptions
alertRouter.get('/my-alerts', getMyAlerts)

// DELETE /api/v1/alerts/:alertId - Delete alert subscription
alertRouter.delete('/:alertId', validateAlertId, deleteAlert)

export default alertRouter
