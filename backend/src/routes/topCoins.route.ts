import express from 'express'
import {
  getTokensWithMostWhaleActivityByMarketCap,
  getTokenChartData,
} from '../controllers/topCoins.controller'

const router = express.Router()

// Get top coins with whale activity
router.get('/', getTokensWithMostWhaleActivityByMarketCap)

// Get chart data for a specific token
router.get('/:tokenAddress/chart', getTokenChartData)

export default router
