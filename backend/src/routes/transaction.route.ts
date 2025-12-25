import express from 'express'
import {
  getSignatureInfo,
  getSignatureInfoAllTransactions,
  getSignatureInfoInfluencerAllTransactions,
} from '../controllers/transactions.controller'
import tokenRouter from './token.route'

const transactionRouter = express.Router()

tokenRouter.get('/transaction/:signature', getSignatureInfo)
transactionRouter.get(
  '/all-transaction/:signature',
  getSignatureInfoAllTransactions,
)
transactionRouter.get(
  '/influencer-all-transaction/:signature',
  getSignatureInfoInfluencerAllTransactions,
)

export default transactionRouter
