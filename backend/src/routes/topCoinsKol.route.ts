import express from 'express'
import { getTokensWithMostKolActivityByMarketCap } from '../controllers/topCoinsKol.controller'

const router = express.Router()

// Get top coins with kol activity
router.get('/', getTokensWithMostKolActivityByMarketCap)

export default router
