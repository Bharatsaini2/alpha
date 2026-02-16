import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY
const SHYFT_API_BASE =
  process.env.SHYFT_API_BASE ||
  process.env.SHYFT_API_URL ||
  process.env.SHYFT_ENDPOINT ||
  'https://api.shyft.to'
const SHYFT_ENDPOINT = SHYFT_API_BASE.includes('/sol/v1/transaction/parsed')
  ? SHYFT_API_BASE
  : `${SHYFT_API_BASE.replace(/\/$/, '')}/sol/v1/transaction/parsed`
const WSS_URL = process.env.WSS_URL

const SIGNATURE =
  'Ef1TCaitLmDjYAjtKCrDpaEAqCNykx8Ycu9gcEDw3BnnosXP61Z8Wq3DBHtPUN7BDRftz2ouho8VnJwVBipdN2d'
const SWAPPER = '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6'
const SOL_MINT = 'So11111111111111111111111111111111111111112'

type RawBalanceChange = {
  mint?: string
  owner?: string
  decimals?: number
  pre_balance?: number | string
  post_balance?: number | string
  preBalance?: number | string
  postBalance?: number | string
  change_amount?: number | string
  [key: string]: unknown
}

function ensureEnv(): void {
  if (!SHYFT_API_KEY) {
    throw new Error(`signature ${SIGNATURE}: SHYFT_API_KEY is missing`)
  }
  if (!WSS_URL) {
    throw new Error(`signature ${SIGNATURE}: WSS_URL is missing`)
  }
}

function normalizeNumberString(input: string): string {
  const trimmed = input.trim()
  if (!trimmed.toLowerCase().includes('e')) {
    return trimmed
  }

  const match = trimmed.match(/^([+-]?[\d.]+)e([+-]?\d+)$/i)
  if (!match) {
    return trimmed
  }

  const mantissa = match[1]
  const exponent = Number(match[2])

  const [wholePart, fracPart = ''] = mantissa.split('.')
  const digits = `${wholePart}${fracPart}`.replace(/^([+-])/, '')
  const sign = mantissa.startsWith('-') ? '-' : ''
  const decimalShift = exponent - fracPart.length

  if (decimalShift >= 0) {
    return `${sign}${digits}${'0'.repeat(decimalShift)}`
  }

  const shiftIndex = digits.length + decimalShift
  if (shiftIndex <= 0) {
    return `${sign}0.${'0'.repeat(Math.abs(shiftIndex))}${digits}`
  }

  return `${sign}${digits.slice(0, shiftIndex)}.${digits.slice(shiftIndex)}`
}

function decimalToBigInt(value: number | string, decimals: number): bigint {
  const rawString = typeof value === 'number' ? value.toString() : value
  const normalized = normalizeNumberString(rawString)
  const negative = normalized.startsWith('-')
  const [whole = '0', fraction = ''] = normalized.replace('-', '').split('.')

  const paddedFraction =
    fraction.length >= decimals
      ? fraction.slice(0, decimals)
      : `${fraction}${'0'.repeat(decimals - fraction.length)}`

  const combined = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '')
  const raw = combined === '' ? BigInt(0) : BigInt(combined)

  return negative ? -raw : raw
}

function extractBalance(balance: RawBalanceChange, key: 'pre' | 'post') {
  if (key === 'pre') {
    return balance.pre_balance ?? balance.preBalance ?? 0
  }
  return balance.post_balance ?? balance.postBalance ?? 0
}

async function run(): Promise<void> {
  ensureEnv()

  const response = await axios.get(SHYFT_ENDPOINT, {
    params: {
      network: 'mainnet-beta',
      txn_signature: SIGNATURE,
      enable_raw: true,
    },
    headers: { 'x-api-key': SHYFT_API_KEY },
    timeout: 20000,
  })

  const result = response.data?.result as Record<string, unknown> | undefined
  if (!result) {
    throw new Error(`signature ${SIGNATURE}: SHYFT response missing result`)
  }

  const feePayer =
    (result.fee_payer as string | undefined) ||
    (result.feePayer as string | undefined) ||
    ''
  const balanceChanges = (result.token_balance_changes as RawBalanceChange[]) || []

  console.log(
    JSON.stringify(
      {
        signature: SIGNATURE,
        feePayer,
        balanceChanges,
      },
      null,
      2
    )
  )

  const swapperTokenDeltas = balanceChanges
    .filter((entry) => entry.owner === SWAPPER)
    .map((entry) => {
      const decimals = Number(entry.decimals ?? 0)
      const preBalance = extractBalance(entry, 'pre')
      const postBalance = extractBalance(entry, 'post')
      const preRaw = decimalToBigInt(preBalance as number | string, decimals)
      const postRaw = decimalToBigInt(postBalance as number | string, decimals)
      const delta = postRaw - preRaw

      return {
        mint: String(entry.mint ?? ''),
        preBalance,
        postBalance,
        decimals,
        delta: delta.toString(),
      }
    })

  let swapperSolDelta: string | null = null
  for (const entry of swapperTokenDeltas) {
    if (entry.mint === SOL_MINT) {
      swapperSolDelta = entry.delta
      break
    }
  }

  if (!swapperSolDelta) {
    console.log('NO SOL DELTA FOR SWAPPER IN SHYFT RESPONSE')
  } else {
    console.log(`SWAPPER SOL DELTA: ${swapperSolDelta}`)
  }

  const otherSolDeltas = balanceChanges
    .filter(
      (entry) =>
        entry.mint === SOL_MINT &&
        entry.owner !== undefined &&
        entry.owner !== SWAPPER
    )
    .map((entry) => {
      const decimals = Number(entry.decimals ?? 0)
      const preBalance = extractBalance(entry, 'pre')
      const postBalance = extractBalance(entry, 'post')
      const preRaw = decimalToBigInt(preBalance as number | string, decimals)
      const postRaw = decimalToBigInt(postBalance as number | string, decimals)
      const delta = postRaw - preRaw

      return {
        owner: String(entry.owner ?? ''),
        delta: delta.toString(),
      }
    })

  const output = {
    swapper: SWAPPER,
    swapperSolDelta,
    otherSolDeltas,
    swapperTokenDeltas,
  }

  console.log(JSON.stringify(output, null, 2))
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`shyftSolDeltaCheck failed: ${message}`)
  process.exitCode = 1
})
