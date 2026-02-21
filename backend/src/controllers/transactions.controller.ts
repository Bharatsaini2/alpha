import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import { Request, Response } from 'express'
import whaleBigTransactionModel from '../models/whale-big-transactions.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import { getTokenMetadataAndImage, getTokenPrice, getTokenImageUrl } from '../config/solana-tokens-config'

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

/** JIT-enrich whale tx token symbol, name, image from Birdeye when missing or Unknown */
async function enrichWhaleTxTokens(tx: any): Promise<void> {
  const needs = (sym: string | undefined, name: string | undefined, img: string | null | undefined) =>
    !sym || sym === 'Unknown' || !name || name === 'Unknown' || !img || img === ''

  if (tx?.transaction?.tokenOut) {
    const addr = tx.transaction.tokenOut.address || tx.tokenOutAddress
    const sym = tx.transaction.tokenOut.symbol ?? tx.tokenOutSymbol
    const name = tx.transaction.tokenOut.name ?? tx.tokenOutName
    const img = tx.transaction.tokenOut.imageUrl ?? tx.outTokenURL
    if (addr && needs(sym, name, img)) {
      const meta = await getTokenMetadataAndImage(addr)
      if (meta) {
        tx.transaction.tokenOut.symbol = meta.symbol
        tx.transaction.tokenOut.name = meta.name
        tx.transaction.tokenOut.imageUrl = meta.imageUrl
        tx.tokenOutSymbol = meta.symbol
        if (tx.tokenOutName != null) tx.tokenOutName = meta.name
        tx.outTokenURL = meta.imageUrl
      }
    }
  }
  if (tx?.transaction?.tokenIn) {
    const addr = tx.transaction.tokenIn.address || tx.tokenInAddress
    const sym = tx.transaction.tokenIn.symbol ?? tx.tokenInSymbol
    const name = tx.transaction.tokenIn.name ?? tx.tokenInName
    const img = tx.transaction.tokenIn.imageUrl ?? tx.inTokenURL
    if (addr && needs(sym, name, img)) {
      const meta = await getTokenMetadataAndImage(addr)
      if (meta) {
        tx.transaction.tokenIn.symbol = meta.symbol
        tx.transaction.tokenIn.name = meta.name
        tx.transaction.tokenIn.imageUrl = meta.imageUrl
        tx.tokenInSymbol = meta.symbol
        if (tx.tokenInName != null) tx.tokenInName = meta.name
        tx.inTokenURL = meta.imageUrl
      }
    }
  }
}

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

      const txObj = transaction.toObject ? transaction.toObject() : transaction
      await enrichWhaleTxTokens(txObj)
      res.status(200).json({ success: true, data: txObj })
    } catch (err: any) {
      console.error(`error`, err)
    }
  },
)

/** JIT-enrich token symbol, name, image (same pipeline as Alpha Stream: metadata + getTokenImageUrl for image) */
async function enrichInfluencerTxTokens(tx: any): Promise<void> {
  const needs = (sym: string | undefined, name: string | undefined, img: string | null | undefined) =>
    !sym || sym === 'Unknown' || !name || name === 'Unknown' || !img || img === ''

  if (tx?.transaction?.tokenOut) {
    const addr = tx.transaction.tokenOut.address || tx.tokenOutAddress
    const sym = tx.transaction.tokenOut.symbol ?? tx.tokenOutSymbol
    const name = tx.transaction.tokenOut.name ?? tx.tokenOutName
    const img = tx.transaction.tokenOut.imageUrl ?? tx.outTokenURL
    if (addr && needs(sym, name, img)) {
      let meta = await getTokenMetadataAndImage(addr)
      if (meta && (!meta.imageUrl || meta.imageUrl === '')) {
        const imageUrl = await getTokenImageUrl(addr)
        if (imageUrl) meta = { ...meta, imageUrl }
      }
      if (meta) {
        tx.transaction.tokenOut.symbol = meta.symbol
        tx.transaction.tokenOut.name = meta.name
        tx.transaction.tokenOut.imageUrl = meta.imageUrl
        tx.tokenOutSymbol = meta.symbol
        if (tx.tokenOutName != null) tx.tokenOutName = meta.name
        tx.outTokenURL = meta.imageUrl
      }
    } else if (addr && (!img || img === '')) {
      const imageUrl = await getTokenImageUrl(addr)
      if (imageUrl) {
        tx.transaction.tokenOut.imageUrl = imageUrl
        tx.outTokenURL = imageUrl
      }
    }
  }
  if (tx?.transaction?.tokenIn) {
    const addr = tx.transaction.tokenIn.address || tx.tokenInAddress
    const sym = tx.transaction.tokenIn.symbol ?? tx.tokenInSymbol
    const name = tx.transaction.tokenIn.name ?? tx.tokenInName
    const img = tx.transaction.tokenIn.imageUrl ?? tx.inTokenURL
    if (addr && needs(sym, name, img)) {
      let meta = await getTokenMetadataAndImage(addr)
      if (meta && (!meta.imageUrl || meta.imageUrl === '')) {
        const imageUrl = await getTokenImageUrl(addr)
        if (imageUrl) meta = { ...meta, imageUrl }
      }
      if (meta) {
        tx.transaction.tokenIn.symbol = meta.symbol
        tx.transaction.tokenIn.name = meta.name
        tx.transaction.tokenIn.imageUrl = meta.imageUrl
        tx.tokenInSymbol = meta.symbol
        if (tx.tokenInName != null) tx.tokenInName = meta.name
        tx.inTokenURL = meta.imageUrl
      }
    } else if (addr && (!img || img === '')) {
      const imageUrl = await getTokenImageUrl(addr)
      if (imageUrl) {
        tx.transaction.tokenIn.imageUrl = imageUrl
        tx.inTokenURL = imageUrl
      }
    }
  }
}

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

      const txObj = transaction.toObject ? transaction.toObject() : transaction
      await enrichInfluencerTxTokens(txObj)
      // Fix SOL amount when stored as 0 but USD amount exists (so card does not show 0 SOL)
      try {
        const solPrice = await getTokenPrice('So11111111111111111111111111111111111111112')
        if (solPrice && solPrice > 0) {
          const buyUsd = Number(txObj.amount?.buyAmount) || 0
          const sellUsd = Number(txObj.amount?.sellAmount) || 0
          const buySol = Number(txObj.solAmount?.buySolAmount) || 0
          const sellSol = Number(txObj.solAmount?.sellSolAmount) || 0
          if (buySol === 0 && buyUsd > 0) {
            if (!txObj.solAmount) txObj.solAmount = { buySolAmount: '', sellSolAmount: '' }
            txObj.solAmount.buySolAmount = String(buyUsd / solPrice)
          }
          if (sellSol === 0 && sellUsd > 0) {
            if (!txObj.solAmount) txObj.solAmount = { buySolAmount: '', sellSolAmount: '' }
            txObj.solAmount.sellSolAmount = String(sellUsd / solPrice)
          }
        }
      } catch (_) {
        /* ignore */
      }
      res.status(200).json({ success: true, data: txObj })
    } catch (err: any) {
      console.error(`error`, err)
    }
  },
)