import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import { Request, Response } from 'express'
import whaleBigTransactionModel from '../models/whale-big-transactions.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'

export const getSignatureInfo = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const { signature } = req.params

      const transaction = await whaleBigTransactionModel
        .findOne({ signature })
        .select(
          'whaleAddress tokenOutSymbol tokenInSymbol signature outTokenURL inTokenURL',
        )
        .lean()
      if (!transaction) {
        return res.status(404).json({ message: 'Transaction not found' })
      }
      return res.status(200).json({
        success: true,
        data: transaction,
      })
    } catch (err: any) {
      console.error(`error`, err)
      return res.status(400).json({
        success: false,
        error: err,
      })
    }
  },
)

export const getSignatureInfoAllTransactions = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const { signature } = req.params

      const transaction = await whaleAllTransactionModelV2.findOne({
        signature,
      })

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found.' })
      }
      res.status(200).json({ success: true, data: transaction })
    } catch (err: any) {
      console.error(`error`, err)
    }
  },
)

export const getSignatureInfoInfluencerAllTransactions = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const { signature } = req.params

      const transaction = await influencerWhaleTransactionsModelV2.findOne({
        signature,
      })

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found.' })
      }
      res.status(200).json({ success: true, data: transaction })
    } catch (err: any) {
      console.error(`error`, err)
    }
  },
)