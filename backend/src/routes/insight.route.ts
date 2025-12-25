import express from 'express'
import {
  getTopTradedCoins,
  getTopActiveWhales,
  getTokensWithMostWhaleActivityByMarketCap,
  addTokensWithMostWhaleActivityByMarketCap,
  fetchSmartMoneyWhales,
  fetchHeavyAccumulatorWhales,
  snipperAndFlipperWhaleLabel,
  getLeaderBoardPNL,
  getWalletStats,
  getTopPicks,
  assignCoordinatedGroupLabels,
} from '../controllers/insight.controller'

const insightRouter = express.Router()


insightRouter.post('/top-tokens', getTopTradedCoins)
insightRouter.post('/top-whales', getTopActiveWhales)
insightRouter.get(
  '/get-token-whales-byMarketCap',
  getTokensWithMostWhaleActivityByMarketCap,
)
insightRouter.post(
  '/add-token-whales-byMarketCap',
  addTokensWithMostWhaleActivityByMarketCap,
)
insightRouter.get('/snipper-flipper-whale-label', snipperAndFlipperWhaleLabel)
insightRouter.get('/smart-money-label', fetchSmartMoneyWhales)
insightRouter.get('/heavy-accumulator', fetchHeavyAccumulatorWhales)
insightRouter.get('/getLeaderBoardPNL', getLeaderBoardPNL)
insightRouter.get('/getwalletdetails/:address', getWalletStats)
insightRouter.get('/getTopPicks', getTopPicks)
insightRouter.get('/coordinated-group', assignCoordinatedGroupLabels)

// insightRouter.get('/early-buyer', fetchEarlyBuyer)

export default insightRouter
