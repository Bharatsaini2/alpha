import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../src/config/connectDb'
import { getParsedTransactions } from '../src/config/getParsedTransaction'
import { parseShyftTransactionV2 } from '../src/utils/shyftParserV2'
import { mapParserAmountsToStorage, mapSOLAmounts } from '../src/utils/splitSwapStorageMapper'
import { validateSplitSwapStorage } from '../src/utils/splitSwapStorageValidator'
import { PRIORITY_ASSETS } from '../src/utils/shyftParserV2.types'
import { meetsMinimumConfidence } from '../src/utils/shyftParser'
import type { ParsedSwap, SplitSwapPair } from '../src/utils/shyftParserV2.types'
import type { IWhaleAllTransactionsV2 } from '../src/models/whaleAllTransactionsV2.model'

dotenv.config()

const SIGNATURES = [
  'Ef1TCaitLmDjYAjtKCrDpaEAqCNykx8Ycu9gcEDw3BnnosXP61Z8Wq3DBHtPUN7BDRftz2ouho8VnJwVBipdN2d',
  'wQRUfnG2yWQUtT3LTXkE4LgTKr1YbCbkfJdSXSCtVYSLutP8iscqzanpTuH8KMKEaQ9spy9T4WBfdPTUR69Bwtx',
  'TbPe8R4VijVxoEHdsgyMHCNdV4eCBcK2N5L21w1bgt7gwYh6vuFGXZ8cogWPBi4y3x3vVmHix9KVsWUBZ7YJT5b',
  'whhJTeoBBYMCxuAc74UFH9fHQdutkeCUMLz1V4NutTF9uD8q2YnsQJo7KiTHW9fNyPReq5W5Q7UA3j4s2LX3zti',
  '58yFXKzYEAKomo4cNzDMjLnjUj1vpWe11sy8FPUfLsqDY8spwRLFFDTNRitvEd4J1U9H9RBUpu2nUAN66n55qyPn',
  '5iw8vu5REVCJkQwbYmoCzXVistHiGVyBryMzixBSTwyBDT6bv3cqBkNswioMXAWN8YwhUNxWE3xDaY9JvstorSPT',
  '4zMKbGLYkT33oFtxmBp9cSco7cSV6UX1pNmXNPqrYfGKPXCByFHLC9DsF5t31C9PPLa6txgYKHEo3BAoRGSQNUzy',
  '2uwRjQmeWWqEso1qybHJt2MgNauNESq51mRKQteHtYdzQ6BbiHc5XEP7FCiV3KfZebuqPHCUcgGWenxrxaZSbHms',
  '2pAhjZACyAZCnjeTz8SQqbYRV41YsjrJbaNJqCzDL61254J4y9tqNX9wGp8GREkuKJPULMkhgB4DATCXy7ksNGU4',
  '37TWCmJA16Ms691T4dXf1pDXbfX6wjdV99Pdx22BiDdU9HDCKeT66whARpD5HD68k4xBBn8qh8A6gqUpsrAN89Gt',
  '2zrKkZffZQYKZxhSh1Nq5eDrqrkA96meAiqCUGGzYUCLtErWUfGqri7pxY4FfWtG79skWnzEpybVRdz1JMiuMDX6',
  '381rZ1xgFFHjT5LmW4FLjMqk4knem3zDaypubQTgVC57ZyZyFUtr8iFMMbTYCpoGL8Cjpf7PjKNfp72bxGiTrpw4',
]

const SOL_MINT = PRIORITY_ASSETS.SOL

type ParsedData = {
  result?: Record<string, any>
  success?: boolean
}

type TokenInfo = {
  token_address: string
  amount: number
  symbol: string
  name: string
}

let solanaTokenConfig: null | {
  findWhaleTokens: (whaleAddress: string) => Promise<any>
  getTokenData: (tokenAddress: string) => Promise<any>
  getTokenPrice: (tokenAddress: string) => Promise<number>
} = null

function loadSolanaTokenConfig(): NonNullable<typeof solanaTokenConfig> {
  if (!solanaTokenConfig) {
    require('ts-node/register/transpile-only')
    solanaTokenConfig = require('../src/config/solana-tokens-config')
  }
  return solanaTokenConfig as NonNullable<typeof solanaTokenConfig>
}

function ensureEnv(): void {
  if (!process.env.SHYFT_API_KEY) {
    throw new Error('SHYFT_API_KEY is missing')
  }
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing')
  }
}

async function fetchParsedWithRetry(signature: string): Promise<string | null> {
  const fetchOnce = () =>
    Promise.race([
      getParsedTransactions(signature),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getParsedTransactions timeout')), 20000),
      ),
    ])

  try {
    return (await fetchOnce()) as string | null
  } catch (error) {
    const maxRetries = 2
    for (let i = 1; i <= maxRetries; i += 1) {
      try {
        await new Promise((resolve) => setTimeout(resolve, i * 2000))
        return (await fetchOnce()) as string | null
      } catch (retryError) {
        if (i === maxRetries) {
          return null
        }
      }
    }
    return null
  }
}

function getSwapsFromParser(data: ParsedSwap | SplitSwapPair): ParsedSwap[] {
  if ('sellRecord' in data) {
    return [data.sellRecord, data.buyRecord]
  }
  return [data]
}

function buildTokenInOut(parsedSwap: ParsedSwap): { tokenIn: TokenInfo; tokenOut: TokenInfo } {
  const isBuy = parsedSwap.direction === 'BUY'
  const tokenIn: TokenInfo = {
    token_address: isBuy ? parsedSwap.quoteAsset.mint : parsedSwap.baseAsset.mint,
    amount: isBuy
      ? (parsedSwap.amounts.swapInputAmount || parsedSwap.amounts.totalWalletCost || 0)
      : (parsedSwap.amounts.baseAmount || 0),
    symbol: isBuy ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
    name: isBuy ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
  }

  const tokenOut: TokenInfo = {
    token_address: isBuy ? parsedSwap.baseAsset.mint : parsedSwap.quoteAsset.mint,
    amount: isBuy
      ? (parsedSwap.amounts.baseAmount || 0)
      : (parsedSwap.amounts.swapOutputAmount || parsedSwap.amounts.netWalletReceived || 0),
    symbol: isBuy ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
    name: isBuy ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
  }

  return { tokenIn, tokenOut }
}

function computeUsdFilter(values: {
  txValue: number | undefined
  sellTxValue: number | undefined
  buyTxValue: number | undefined
}) {
  const { txValue, sellTxValue, buyTxValue } = values
  const hasDefinedValue =
    txValue !== undefined || sellTxValue !== undefined || buyTxValue !== undefined
  const allValuesBelowThreshold =
    (txValue === undefined || txValue < 2) &&
    (sellTxValue === undefined || sellTxValue < 2) &&
    (buyTxValue === undefined || buyTxValue < 2)

  const maxValue = Math.max(txValue ?? 0, sellTxValue ?? 0, buyTxValue ?? 0)
  const earlyFail = hasDefinedValue && allValuesBelowThreshold && maxValue < 2 && maxValue > 0
  const passesThreshold =
    !earlyFail && ((txValue ?? 0) > 2 || (sellTxValue ?? 0) > 2 || (buyTxValue ?? 0) > 2)

  return { maxValue, passesThreshold }
}

function buildStoredRecord(params: {
  signature: string
  direction: 'BUY' | 'SELL'
  tokenIn: TokenInfo
  tokenOut: TokenInfo
  tokenInUsdAmount: number
  tokenOutUsdAmount: number
  amount: { buyAmount: number; sellAmount: number }
  solAmount: { buySolAmount: number | null; sellSolAmount: number | null }
}): IWhaleAllTransactionsV2 {
  const {
    signature,
    direction,
    tokenIn,
    tokenOut,
    tokenInUsdAmount,
    tokenOutUsdAmount,
    amount,
    solAmount,
  } = params

  return {
    signature,
    amount: {
      buyAmount: amount.buyAmount.toString(),
      sellAmount: amount.sellAmount.toString(),
    },
    solAmount: {
      buySolAmount: solAmount.buySolAmount === null ? null : solAmount.buySolAmount.toString(),
      sellSolAmount: solAmount.sellSolAmount === null ? null : solAmount.sellSolAmount.toString(),
    },
    transaction: {
      tokenIn: {
        symbol: tokenIn.symbol,
        name: tokenIn.name,
        address: tokenIn.token_address,
        amount: tokenIn.amount.toString(),
        usdAmount: tokenInUsdAmount.toString(),
        marketCap: '0',
        marketCapSol: '0',
        imageUrl: '',
      },
      tokenOut: {
        symbol: tokenOut.symbol,
        name: tokenOut.name,
        address: tokenOut.token_address,
        amount: tokenOut.amount.toString(),
        usdAmount: tokenOutUsdAmount.toString(),
        marketCap: '0',
        marketCapSol: '0',
        imageUrl: '',
      },
      gasFee: '0',
      platform: '',
      timestamp: new Date(),
    },
    whaleLabel: [],
    whaleTokenSymbol: '',
    tokenInSymbol: tokenIn.symbol,
    tokenOutSymbol: tokenOut.symbol,
    whaleAddress: '',
    tokenInAddress: tokenIn.token_address,
    tokenOutAddress: tokenOut.token_address,
    whale: {
      address: '',
      imageUrl: '',
      labels: [],
      symbol: '',
      name: '',
      marketCap: '',
    },
    marketCap: {
      buyMarketCap: '0',
      sellMarketCap: '0',
    },
    outTokenURL: '',
    whaleTokenURL: '',
    inTokenURL: '',
    type: direction === 'BUY' ? 'buy' : 'sell',
    bothType: [{ buyType: false, sellType: false }],
    hotnessScore: 0,
    timestamp: new Date(),
  } as unknown as IWhaleAllTransactionsV2
}

async function processSwap(signature: string, parsedSwap: ParsedSwap, index: number, total: number) {
  console.log(`SWAP ${index + 1}/${total} (${parsedSwap.direction})`)
  console.log(`SWAPPER: ${parsedSwap.swapper}`)

  const minConfidence = process.env.MIN_ALERT_CONFIDENCE
  if (minConfidence && !meetsMinimumConfidence(parsedSwap as any, minConfidence)) {
    console.log('ADAPTER: SKIPPED')
    console.log('VALIDATOR: SKIPPED')
    console.log('WHALE MATCH: SKIPPED')
    console.log('USD VALUE: n/a')
    console.log('USD FILTER: FAILED')
    console.log('FINAL RESULT: DROPPED')
    console.log('REASON: confidence_below_min')
    console.log('')
    return
  }

  const { tokenIn, tokenOut } = buildTokenInOut(parsedSwap)

  const { getTokenPrice, getTokenData, findWhaleTokens } = loadSolanaTokenConfig()

  const [solPrice, outTokenDataRaw, inTokenDataRaw, whaleToken] = await Promise.all([
    getTokenPrice(SOL_MINT),
    getTokenData(tokenOut.token_address),
    getTokenData(tokenIn.token_address),
    findWhaleTokens(parsedSwap.swapper),
  ])

  const outTokenData = outTokenDataRaw || { price: 0, marketCap: 0, imageUrl: null }
  const inTokenData = inTokenDataRaw || { price: 0, marketCap: 0, imageUrl: null }

  if ((outTokenData.price === 0 || !outTokenData.price) && inTokenData.price > 0 && tokenOut.amount > 0) {
    const estimatedOutPrice = (tokenIn.amount * inTokenData.price) / tokenOut.amount
    if (estimatedOutPrice > 0) {
      outTokenData.price = estimatedOutPrice
    }
  }

  if ((inTokenData.price === 0 || !inTokenData.price) && outTokenData.price > 0 && tokenIn.amount > 0) {
    const estimatedInPrice = (tokenOut.amount * outTokenData.price) / tokenIn.amount
    if (estimatedInPrice > 0) {
      inTokenData.price = estimatedInPrice
    }
  }

  const safeSolPrice = solPrice && solPrice > 0 ? solPrice : 94
  const tokenInUsdAmount = tokenIn.amount * (inTokenData.price || 0)
  const tokenOutUsdAmount = tokenOut.amount * (outTokenData.price || 0)

  const isBuy = parsedSwap.direction === 'BUY'
  const isSell = parsedSwap.direction === 'SELL'

  let txValue: number | undefined
  let sellTxValue: number | undefined
  let buyTxValue: number | undefined

  if (isSell && !isBuy) {
    txValue = tokenInUsdAmount
  }
  if (isBuy && !isSell) {
    txValue = tokenOutUsdAmount
  }
  if (isSell && isBuy) {
    sellTxValue = tokenInUsdAmount
    buyTxValue = tokenOutUsdAmount
  }

  let adapterStatus = 'SUCCESS'
  let amountMapping: { buyAmount: number; sellAmount: number } | null = null
  let solAmountMapping: { buySolAmount: number | null; sellSolAmount: number | null } | null = null
  try {
    const storageAmounts = mapParserAmountsToStorage(parsedSwap)
    amountMapping = storageAmounts.amount
    solAmountMapping = mapSOLAmounts(parsedSwap, tokenInUsdAmount, tokenOutUsdAmount, safeSolPrice)
  } catch (error) {
    adapterStatus = 'FAILED'
  }

  console.log(`ADAPTER: ${adapterStatus}`)

  let validatorStatus = 'SKIPPED'
  let validatorReason = 'n/a'
  if (adapterStatus === 'SUCCESS' && amountMapping && solAmountMapping) {
    const storedRecord = buildStoredRecord({
      signature,
      direction: parsedSwap.direction,
      tokenIn,
      tokenOut,
      tokenInUsdAmount,
      tokenOutUsdAmount,
      amount: amountMapping,
      solAmount: solAmountMapping,
    })
    const validation = validateSplitSwapStorage(parsedSwap, storedRecord)
    validatorStatus = validation.valid ? 'SUCCESS' : 'FAILED'
    if (!validation.valid && validation.errors.length > 0) {
      const first = validation.errors[0]
      validatorReason = `${first.field}: ${first.issue}`
    }
  }

  console.log(`VALIDATOR: ${validatorStatus}`)
  console.log(`VALIDATOR ERASE REASON: ${validatorReason}`)

  const whaleMatch = Boolean(whaleToken)
  console.log(`WHALE MATCH: ${whaleMatch}`)

  const usdCheck = computeUsdFilter({
    txValue,
    sellTxValue,
    buyTxValue,
  })

  const usdValue = Number.isFinite(usdCheck.maxValue)
    ? usdCheck.maxValue.toFixed(2)
    : '0'
  console.log(`USD VALUE: ${usdValue}`)
  console.log(`USD FILTER: ${usdCheck.passesThreshold ? 'PASSED' : 'FAILED'}`)

  let finalStatus = 'SAVED'
  let finalReason = 'n/a'

  if (adapterStatus !== 'SUCCESS') {
    finalStatus = 'DROPPED'
    finalReason = 'adapter_failed'
  } else if (validatorStatus !== 'SUCCESS') {
    finalStatus = 'DROPPED'
    finalReason = validatorReason === 'n/a' ? 'validator_failed' : validatorReason
  } else if (!whaleMatch) {
    finalStatus = 'DROPPED'
    finalReason = 'whale_not_found'
  } else if (!usdCheck.passesThreshold) {
    finalStatus = 'DROPPED'
    finalReason = 'USD threshold'
  }

  console.log(`FINAL RESULT: ${finalStatus}`)
  console.log(`REASON: ${finalReason}`)
  console.log('')
}

async function processSignature(signature: string): Promise<void> {
  console.log('==============================')
  console.log(`SIGNATURE: ${signature}`)
  console.log('')

  let parsedData: string | null = null
  try {
    parsedData = await fetchParsedWithRetry(signature)
  } catch (error) {
    parsedData = null
  }

  if (!parsedData) {
    console.log('FETCH: FAIL')
    console.log('')
    console.log('FINAL RESULT: DROPPED')
    console.log('REASON: fetch_failed')
    console.log('==============================')
    return
  }

  console.log('FETCH: SUCCESS')
  console.log('')

  let parsedTx: ParsedData
  try {
    parsedTx = JSON.parse(parsedData) as ParsedData
  } catch (error) {
    console.log('PARSER: ERASE')
    console.log('SWAPS: 0')
    console.log('ERASE REASON: invalid_shyft_payload')
    console.log('')
    console.log('FINAL RESULT: DROPPED')
    console.log('REASON: invalid_shyft_payload')
    console.log('==============================')
    return
  }

  if (parsedTx.success === false) {
    console.log('PARSER: ERASE')
    console.log('SWAPS: 0')
    console.log('ERASE REASON: transaction_failed')
    console.log('')
    console.log('FINAL RESULT: DROPPED')
    console.log('REASON: transaction_failed')
    console.log('==============================')
    return
  }

  const result = parsedTx.result || {}
  const whaleAddress = result?.signers?.[0] || result?.fee_payer || ''

  const v2Input = {
    signature,
    timestamp: result.timestamp ? new Date(result.timestamp).getTime() : Date.now(),
    status: result.status || 'Success',
    fee: result.fee || 0,
    fee_payer: whaleAddress,
    signers: whaleAddress ? [whaleAddress] : [],
    protocol: result.protocol,
    token_balance_changes: Array.isArray(result.token_balance_changes)
      ? result.token_balance_changes.filter((change: any) => change.owner === whaleAddress)
      : [],
    actions: result.actions || [],
  }

  const parseResult = parseShyftTransactionV2(v2Input)

  if (!parseResult.success || !parseResult.data) {
    const reason = parseResult.erase?.reason || 'unknown'
    console.log('PARSER: ERASE')
    console.log('SWAPS: 0')
    console.log(`ERASE REASON: ${reason}`)
    console.log('')
    console.log('FINAL RESULT: DROPPED')
    console.log(`REASON: ${reason}`)
    console.log('==============================')
    return
  }

  const swaps = getSwapsFromParser(parseResult.data)
  console.log('PARSER: SUCCESS')
  console.log(`SWAPS: ${swaps.length}`)
  console.log('ERASE REASON: n/a')
  console.log('')

  for (let i = 0; i < swaps.length; i += 1) {
    await processSwap(signature, swaps[i], i, swaps.length)
  }

  console.log('==============================')
}

async function run(): Promise<void> {
  ensureEnv()
  await connectDB()

  for (const signature of SIGNATURES) {
    await processSignature(signature)
  }

  await mongoose.disconnect()
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`fullProductionFlowAudit failed: ${message}`)
  process.exitCode = 1
})
