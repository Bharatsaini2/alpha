import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../src/config/connectDb'
import { getParsedTransactions } from '../src/config/getParsedTransaction'
import { parseShyftTransactionV2 } from '../src/utils/shyftParserV2'
import { parseTransaction } from '../src/utils/shyftParserV2/index'
import { mapParserAmountsToStorage, mapSOLAmounts } from '../src/utils/splitSwapStorageMapper'
import { validateSplitSwapStorage } from '../src/utils/splitSwapStorageValidator'
import WhalesAddressModel from '../src/models/solana-tokens-whales'
import { coordinatedWhaleWalletLabelModel } from '../src/models/coordinatedGroupModel'
import { whaleWalletLabelModel } from '../src/models/whaleLabel.model'
import InfluencerWhalesAddressModelV2 from '../src/models/Influencer-wallet-whalesV2'
import whaleAllTransactionModelV2 from '../src/models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../src/models/influencerWhaleTransactionsV2.model'
import whaleAllTransactionModel from '../src/models/whale-all-transactions.model'
import influencerWhaleAllTransactionModel from '../src/models/Influencer-whale-all-transaction.model'
import type {
  ParsedSwap,
  SplitSwapPair,
  ParserResult,
  TokenBalanceChange,
} from '../src/utils/shyftParserV2.types'
import type { BalanceChange, TransactionMeta } from '../src/utils/shyftParserV2/types'

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
]

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

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
  getTokenData: (tokenAddress: string) => Promise<any>
  getTokenPrice: (tokenAddress: string) => Promise<number>
} = null

let redisClient: any = null

function loadSolanaTokenConfig(): NonNullable<typeof solanaTokenConfig> {
  if (!solanaTokenConfig) {
    require('ts-node/register/transpile-only')
    solanaTokenConfig = require('../src/config/solana-tokens-config')
  }
  return solanaTokenConfig as NonNullable<typeof solanaTokenConfig>
}

function createRedisClient(): any {
  if (redisClient) {
    return redisClient
  }
  const Redis: any = require('ioredis')
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    enableReadyCheck: false,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.max(Math.min(Math.exp(times), 20000), 1000)
      console.log(`BullMQ Redis retry ${times}, waiting ${delay}ms`)
      return delay
    },
  } as any)
  return redisClient
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
}) {
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
      imageUrl: null,
      labels: [],
      symbol: '',
      name: '',
      marketCap: '0',
    },
    marketCap: {
      buyMarketCap: '0',
      sellMarketCap: '0',
    },
    whaleTokenURL: null,
    outTokenURL: null,
    inTokenURL: null,
    type: direction === 'BUY' ? 'buy' : 'sell',
    bothType: [
      {
        buyType: false,
        sellType: false,
      },
    ],
    hotnessScore: 0,
    timestamp: new Date(),
    age: null,
    tokenInAge: null,
    tokenOutAge: null,
  } as unknown
}

function normalizeInstructions(parsedTx: ParsedData): TransactionMeta['instructions'] {
  const instructions = parsedTx.result?.instructions
  if (Array.isArray(instructions) && instructions.length > 0) {
    return instructions.map((inst: any) => ({
      programId: inst.programId || inst.program_id || inst.program || '',
      name: inst.name || inst.type || inst.parsed?.type,
      data: inst.data,
    }))
  }

  const actions = parsedTx.result?.actions
  if (Array.isArray(actions) && actions.length > 0) {
    return actions.map((action: any) => ({
      programId: action.source_protocol?.address || action.source_protocol || '',
      name: action.type,
      data: action.info,
    }))
  }

  return []
}

function toBigIntAmount(value: unknown, decimals: number): bigint {
  if (value === null || value === undefined) {
    return BigInt(0)
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return BigInt(0)
  }
  const scale = Math.pow(10, decimals)
  return BigInt(Math.round(numeric * scale))
}

function toBalanceChanges(changes: TokenBalanceChange[]): BalanceChange[] {
  return changes.map((change) => {
    const decimals = Number(change.decimals || 0)
    const pre = toBigIntAmount(change.pre_balance, decimals)
    const post = toBigIntAmount(change.post_balance, decimals)
    return {
      mint: change.mint,
      owner: change.owner,
      preDelta: pre,
      postDelta: post,
      decimals,
      scale: BigInt(10) ** BigInt(decimals),
    }
  })
}

function buildRawTransaction(signature: string, parsedTx: ParsedData): {
  signature: string
  balanceChanges: BalanceChange[]
  transactionMeta: TransactionMeta
  timestamp?: number
  protocol?: string
} | null {
  const feePayer = parsedTx.result?.fee_payer
  const signers = parsedTx.result?.signers || []
  const changes = parsedTx.result?.token_balance_changes
  if (!feePayer || !Array.isArray(changes)) {
    return null
  }

  const raw: {
    signature: string
    balanceChanges: BalanceChange[]
    transactionMeta: TransactionMeta
    timestamp?: number
    protocol?: string
  } = {
    signature,
    balanceChanges: toBalanceChanges(changes),
    transactionMeta: {
      feePayer,
      signers,
      instructions: normalizeInstructions(parsedTx),
    },
  }

  const ts = parsedTx.result?.timestamp
  if (ts) {
    raw.timestamp = new Date(ts).getTime()
  }

  const protocol = parsedTx.result?.protocol?.name
  if (protocol) {
    raw.protocol = protocol
  }

  return raw
}

async function getTokenPriceForMint(mint: string): Promise<number> {
  const { getTokenData, getTokenPrice } = loadSolanaTokenConfig()
  if (mint === SOL_MINT || mint === WSOL_MINT) {
    try {
      return await getTokenPrice(mint)
    } catch (error) {
      return 0
    }
  }
  try {
    const data = await getTokenData(mint)
    return data?.price || 0
  } catch (error) {
    return 0
  }
}

async function computeUsdValues(parsedSwap: ParsedSwap) {
  const { tokenIn, tokenOut } = buildTokenInOut(parsedSwap)
  const tokenInPrice = await getTokenPriceForMint(tokenIn.token_address)
  const tokenOutPrice = await getTokenPriceForMint(tokenOut.token_address)

  const tokenInUsdAmount = tokenIn.amount * (tokenInPrice || 0)
  const tokenOutUsdAmount = tokenOut.amount * (tokenOutPrice || 0)

  let txValue: number | undefined
  let sellTxValue: number | undefined
  let buyTxValue: number | undefined

  const isBuy = parsedSwap.direction === 'BUY'
  const isSell = parsedSwap.direction === 'SELL'

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

  return {
    tokenIn,
    tokenOut,
    tokenInUsdAmount,
    tokenOutUsdAmount,
    txValue,
    sellTxValue,
    buyTxValue,
  }
}

async function checkWhaleCollections(address: string) {
  const matches: { collection: string }[] = []
  const whales = await WhalesAddressModel.findOne({ whalesAddress: address }).lean()
  if (whales) {
    matches.push({ collection: 'whales' })
  }

  const groups = await coordinatedWhaleWalletLabelModel
    .findOne({ whaleAddresses: address })
    .lean()
  if (groups) {
    matches.push({ collection: 'whaleGroups' })
  }

  const labels = await whaleWalletLabelModel.findOne({ whaleAddress: address }).lean()
  if (labels) {
    matches.push({ collection: 'coordinatedWallets' })
  }

  return matches
}

async function checkKolCollections(address: string) {
  const matches: { collection: string }[] = []
  const influencer = await InfluencerWhalesAddressModelV2.findOne({
    whalesAddress: address,
  }).lean()
  if (influencer) {
    matches.push({ collection: 'influencers' })
  }

  const db = mongoose.connection.db
  if (db) {
    const rawKolWallets = await db.collection('kolWallets').findOne({
      $or: [
        { wallet: address },
        { wallets: address },
        { whaleAddress: address },
        { whalesAddress: address },
      ],
    })
    if (rawKolWallets) {
      matches.push({ collection: 'kolWallets' })
    }
  }

  return matches
}

function formatParserResult(parser: ParserResult | null) {
  if (!parser) {
    return {
      status: 'erase',
      swapper: null,
      reason: 'transaction_failed',
      swapCount: 0,
    }
  }

  if (!parser.success || !parser.data) {
    return {
      status: 'erase',
      swapper: null,
      reason: parser.erase?.reason || 'unknown',
      swapCount: 0,
    }
  }

  const swaps = getSwapsFromParser(parser.data)
  return {
    status: 'success',
    swapper: swaps[0]?.swapper ?? null,
    reason: null,
    swapCount: swaps.length,
  }
}

function formatDeterministicResult(result: ReturnType<typeof parseTransaction>) {
  if (result.type === 'erase') {
    return {
      status: 'erase',
      swapper: result.error.debugInfo?.swapper || null,
      reason: result.error.reason,
      swapCount: 0,
    }
  }
  return {
    status: 'success',
    swapper: result.swaps[0]?.swapper ?? null,
    reason: null,
    swapCount: result.swaps.length,
  }
}

function extractStoredInfo(doc: any) {
  if (!doc) {
    return null
  }
  const wallet = doc.whaleAddress || doc.whale?.address || doc.kolAddress || null
  const token =
    doc.tokenOutSymbol ||
    doc.transaction?.tokenOut?.symbol ||
    doc.tokenInSymbol ||
    doc.transaction?.tokenIn?.symbol ||
    null
  return {
    swapper: wallet,
    wallet,
    token,
  }
}

async function checkDbStorage(signature: string) {
  const results = [
    {
      name: 'whaleAllTransactionsV2',
      doc: await whaleAllTransactionModelV2.findOne({ signature }).lean(),
    },
    {
      name: 'influencerWhaleTransactionsV2',
      doc: await influencerWhaleTransactionsModelV2.findOne({ signature }).lean(),
    },
    {
      name: 'whaleTransactions',
      doc: await whaleAllTransactionModel.findOne({ signature }).lean(),
    },
    {
      name: 'kolTransactions',
      doc: await influencerWhaleAllTransactionModel.findOne({ signature }).lean(),
    },
  ]

  return results.map((result) => ({
    name: result.name,
    found: Boolean(result.doc),
    info: extractStoredInfo(result.doc),
  }))
}

async function simulateProductionFlow(params: {
  signature: string
  parsedTx: ParsedData
  parserResult: ParserResult | null
  whaleMatch: boolean
}) {
  const { signature, parsedTx, parserResult, whaleMatch } = params

  if (!parsedTx.success) {
    return { result: 'dropped', reason: 'transaction_failed' }
  }

  if (!parserResult || !parserResult.success || !parserResult.data) {
    return { result: 'dropped', reason: 'parser_erase' }
  }

  const swaps = getSwapsFromParser(parserResult.data)
  const solPrice = await getTokenPriceForMint(SOL_MINT)

  const reasons = new Set<string>()
  let anyStored = false

  for (const swap of swaps) {
    const usdValues = await computeUsdValues(swap)
    const usdResult = computeUsdFilter({
      txValue: usdValues.txValue,
      sellTxValue: usdValues.sellTxValue,
      buyTxValue: usdValues.buyTxValue,
    })
    const storageAmounts = mapParserAmountsToStorage(swap)
    const solAmount = mapSOLAmounts(
      swap,
      usdValues.tokenInUsdAmount,
      usdValues.tokenOutUsdAmount,
      solPrice,
    )
    const storedRecord = buildStoredRecord({
      signature,
      direction: swap.direction,
      tokenIn: usdValues.tokenIn,
      tokenOut: usdValues.tokenOut,
      tokenInUsdAmount: usdValues.tokenInUsdAmount,
      tokenOutUsdAmount: usdValues.tokenOutUsdAmount,
      amount: storageAmounts.amount,
      solAmount,
    })

    const validation = validateSplitSwapStorage(
      swap,
      storedRecord as any,
    )
    if (!validation.valid) {
      reasons.add('validator_erase')
      continue
    }

    if (!whaleMatch) {
      reasons.add('whale_not_found')
      continue
    }

    if (!usdResult.passesThreshold) {
      reasons.add('usd_filter')
      continue
    }

    const duplicateKey = `processing_signature:${signature}`
    const redisDuplicate = redisClient ? await redisClient.get(duplicateKey) : null
    const dbDuplicate = await whaleAllTransactionModelV2
      .findOne({ signature })
      .select('signature')
      .lean()

    if (redisDuplicate || dbDuplicate) {
      reasons.add('duplicate')
      continue
    }

    anyStored = true
  }

  if (anyStored) {
    return { result: 'stored', reason: null }
  }

  const priority = [
    'transaction_failed',
    'parser_erase',
    'validator_erase',
    'whale_not_found',
    'usd_filter',
    'duplicate',
  ]
  const reason = priority.find((item) => reasons.has(item)) || 'unknown'
  return { result: 'dropped', reason }
}

async function processSignature(signature: string) {
  console.log('====================')
  console.log(`SIGNATURE: ${signature}`)
  console.log('')

  const rawParsed = await fetchParsedWithRetry(signature)
  if (!rawParsed) {
    console.log('SHYFT FETCH: FAIL')
    console.log('')
    console.log('PROD PARSER:')
    console.log('erase')
    console.log('swapper: null')
    console.log('reason: fetch_failed')
    console.log('')
    console.log('NEW PARSER:')
    console.log('erase')
    console.log('swapper: null')
    console.log('reason: fetch_failed')
    console.log('')
    console.log('DB STORAGE:')
    console.log('NOT FOUND')
    console.log('')
    console.log('WHALE MATCH:')
    console.log('false')
    console.log('collection: none')
    console.log('')
    console.log('KOL MATCH:')
    console.log('false')
    console.log('collection: none')
    console.log('')
    console.log('USD FILTER:')
    console.log('value: n/a')
    console.log('fail')
    console.log('')
    console.log('FINAL PROD RESULT:')
    console.log('dropped')
    console.log('reason: fetch_failed')
    console.log('====================')
    return
  }

  const parsedTx: ParsedData = JSON.parse(rawParsed)

  console.log('SHYFT FETCH: SUCCESS')
  console.log(`status: ${parsedTx.result?.status ?? 'unknown'}`)
  console.log(`feePayer: ${parsedTx.result?.fee_payer ?? 'unknown'}`)
  console.log(`signers: ${JSON.stringify(parsedTx.result?.signers ?? [])}`)
  console.log(`token_balance_changes: ${JSON.stringify(parsedTx.result?.token_balance_changes ?? [])}`)
  console.log('')

  let prodParserResult: ParserResult | null = null
  if (parsedTx.success) {
    try {
      const resultTimestamp = parsedTx.result?.timestamp
      const normalizedTimestamp =
        typeof resultTimestamp === 'number'
          ? resultTimestamp
          : resultTimestamp
          ? new Date(resultTimestamp).getTime()
          : Date.now()

      const prodInput = {
        ...parsedTx.result,
        signature,
        timestamp: normalizedTimestamp,
      }
      prodParserResult = parseShyftTransactionV2(prodInput as any)
    } catch (error) {
      prodParserResult = null
    }
  }
  const prodSummary = formatParserResult(prodParserResult)

  console.log('PROD PARSER:')
  console.log(prodSummary.status)
  console.log(`swapper: ${prodSummary.swapper ?? 'null'}`)
  console.log(`reason: ${prodSummary.reason ?? ''}`)
  console.log(`swap count: ${prodSummary.swapCount}`)
  console.log('')

  const rawTransaction = buildRawTransaction(signature, parsedTx)
  let deterministicSummary: {
    status: string
    swapper: string | null
    reason: string | null
    swapCount: number
  } = {
    status: 'erase',
    swapper: null as string | null,
    reason: 'invalid_input',
    swapCount: 0,
  }

  if (rawTransaction) {
    const deterministicResult = parseTransaction(rawTransaction)
    deterministicSummary = formatDeterministicResult(deterministicResult)
  }

  console.log('NEW PARSER:')
  console.log(deterministicSummary.status)
  console.log(`swapper: ${deterministicSummary.swapper ?? 'null'}`)
  console.log(`reason: ${deterministicSummary.reason ?? ''}`)
  console.log(`swap count: ${deterministicSummary.swapCount}`)
  console.log('')

  const storageResults = await checkDbStorage(signature)
  const anyStored = storageResults.some((entry) => entry.found)
  console.log('DB STORAGE:')
  console.log(anyStored ? 'FOUND' : 'NOT FOUND')
  storageResults.forEach((entry) => {
    if (entry.found && entry.info) {
      console.log(
        `${entry.name}: FOUND (swapper: ${entry.info.swapper ?? 'null'}, wallet: ${entry.info.wallet ?? 'null'}, token: ${entry.info.token ?? 'null'})`,
      )
    } else {
      console.log(`${entry.name}: NOT FOUND`)
    }
  })
  console.log('')

  const feePayer = parsedTx.result?.fee_payer
  const signers = parsedTx.result?.signers || []
  const addressesToCheck = [
    prodSummary.swapper,
    feePayer,
    ...signers,
  ].filter(Boolean) as string[]

  let whaleMatch = false
  let whaleMatchCollection = 'none'
  let whaleMatchAddress = 'none'
  for (const address of addressesToCheck) {
    const matches = await checkWhaleCollections(address)
    if (matches.length > 0) {
      whaleMatch = true
      whaleMatchCollection = matches[0].collection
      whaleMatchAddress = address
      break
    }
  }

  console.log('WHALE MATCH:')
  console.log(whaleMatch ? 'true' : 'false')
  console.log(`collection: ${whaleMatchCollection} (${whaleMatchAddress})`)
  console.log('')

  let whaleMatchForSwapper = false
  if (prodSummary.swapper) {
    const swapperMatches = await checkWhaleCollections(prodSummary.swapper)
    whaleMatchForSwapper = swapperMatches.length > 0
  }

  let kolMatch = false
  let kolMatchCollection = 'none'
  let kolMatchAddress = 'none'
  for (const address of addressesToCheck) {
    const matches = await checkKolCollections(address)
    if (matches.length > 0) {
      kolMatch = true
      kolMatchCollection = matches[0].collection
      kolMatchAddress = address
      break
    }
  }

  console.log('KOL MATCH:')
  console.log(kolMatch ? 'true' : 'false')
  console.log(`collection: ${kolMatchCollection} (${kolMatchAddress})`)
  console.log('')

  let usdMaxValue = 0
  let usdPass = false
  if (prodParserResult?.success && prodParserResult.data) {
    const swaps = getSwapsFromParser(prodParserResult.data)
    for (const swap of swaps) {
      const usdValues = await computeUsdValues(swap)
      mapParserAmountsToStorage(swap)
      const usdResult = computeUsdFilter({
        txValue: usdValues.txValue,
        sellTxValue: usdValues.sellTxValue,
        buyTxValue: usdValues.buyTxValue,
      })
      usdMaxValue = Math.max(usdMaxValue, usdResult.maxValue)
      if (usdResult.passesThreshold) {
        usdPass = true
      }
    }
  }

  console.log('USD FILTER:')
  console.log(`value: ${usdMaxValue}`)
  console.log(usdPass ? 'pass' : 'fail')
  console.log('')

  const finalSim = await simulateProductionFlow({
    signature,
    parsedTx,
    parserResult: prodParserResult,
    whaleMatch: whaleMatchForSwapper,
  })

  console.log('FINAL PROD RESULT:')
  console.log(finalSim.result)
  console.log(`reason: ${finalSim.reason ?? ''}`)
  console.log('====================')
}

async function run() {
  ensureEnv()
  await connectDB()
  redisClient = createRedisClient()
  await redisClient.connect().catch(() => {
    redisClient = null
  })

  for (const signature of SIGNATURES) {
    try {
      await processSignature(signature)
    } catch (error) {
      console.log('====================')
      console.log(`SIGNATURE: ${signature}`)
      console.log('ERROR')
      console.log(String(error))
      console.log('====================')
    }
  }

  try {
    await mongoose.disconnect()
  } catch (error) {
    console.log(`Failed to disconnect mongoose: ${String(error)}`)
  }

  try {
    if (redisClient) {
      await redisClient.quit()
    }
  } catch (error) {
    console.log(`Failed to disconnect redis: ${String(error)}`)
  }
}

run().catch((error) => {
  console.log(String(error))
  process.exit(1)
})
