import express from 'express'
import {
  startWalletMonitoring,
} from '../controllers/wallet.controller'

const walletRouter = express.Router()

// Start monitoring a wallet
walletRouter.get('/start-monitoring', startWalletMonitoring)


export default walletRouter
