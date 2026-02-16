import axios from 'axios'
import dotenv from 'dotenv'
import { parseShyftTransactionV2 } from '../src/utils/shyftParserV2'
import { parseTransaction } from '../src/utils/shyftParserV2/index'
import type { ShyftTransactionV2 } from '../src/utils/shyftParserV2'
import type { ParserResult, SplitSwapPair } from '../src/utils/shyftParserV2.types'
import type { BalanceChange, Instruction } from '../src/utils/shyftParserV2/types'
import type { RawTransaction } from '../src/utils/shyftParserV2/index'

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
const SHYFT_WSS_URL = process.env.WSS_URL || ''

const KOL_MISSING = [
  'Ef1TCaitLmDjYAjtKCrDpaEAqCNykx8Ycu9gcEDw3BnnosXP61Z8Wq3DBHtPUN7BDRftz2ouho8VnJwVBipdN2d',
  'wQRUfnG2yWQUtT3LTXkE4LgTKr1YbCbkfJdSXSCtVYSLutP8iscqzanpTuH8KMKEaQ9spy9T4WBfdPTUR69Bwtx',
  'TbPe8R4VijVxoEHdsgyMHCNdV4eCBcK2N5L21w1bgt7gwYh6vuFGXZ8cogWPBi4y3x3vVmHix9KVsWUBZ7YJT5b',
  'whhJTeoBBYMCxuAc74UFH9fHQdutkeCUMLz1V4NutTF9uD8q2YnsQJo7KiTHW9fNyPReq5W5Q7UA3j4s2LX3zti',
  '58yFXKzYEAKomo4cNzDMjLnjUj1vpWe11sy8FPUfLsqDY8spwRLFFDTNRitvEd4J1U9H9RBUpu2nUAN66n55qyPn',
  '5iw8vu5REVCJkQwbYmoCzXVistHiGVyBryMzixBSTwyBDT6bv3cqBkNswioMXAWN8YwhUNxWE3xDaY9JvstorSPT',
  '4zMKbGLYkT33oFtxmBp9cSco7cSV6UX1pNmXNPqrYfGKPXCByFHLC9DsF5t31C9PPLa6txgYKHEo3BAoRGSQNUzy',
  '2uwRjQmeWWqEso1qybHJt2MgNauNESq51mRKQteHtYdzQ6BbiHc5XEP7FCiV3KfZebuqPHCUcgGWenxrxaZSbHms',
]

const WHALE_MISSING = [
  '2pAhjZACyAZCnjeTz8SQqbYRV41YsjrJbaNJqCzDL61254J4y9tqNX9wGp8GREkuKJPULMkhgB4DATCXy7ksNGU4',
  '37TWCmJA16Ms691T4dXf1pDXbfX6wjdV99Pdx22BiDdU9HDCKeT66whARpD5HD68k4xBBn8qh8A6gqUpsrAN89Gt',
  '2zrKkZffZQYKZxhSh1Nq5eDrqrkA96meAiqCUGGzYUCLtErWUfGqri7pxY4FfWtG79skWnzEpybVRdz1JMiuMDX6',
  '381rZ1xgFFHjT5LmW4FLjMqk4knem3zDaypubQTgVC57ZyZyFUtr8iFMMbTYCpoGL8Cjpf7PjKNfp72bxGiTrpw4',
]

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

type ShyftParsedResponse = {
  result?: Record<string, unknown>
}

type RawInstructionLike = {
  programId?: string
  program_id?: string
  programIdIndex?: number
  parsed?: { type?: string; instruction_type?: string }
  name?: string
  data?: unknown
}

type ActionLike = {
  type?: string
  info?: Record<string, unknown>
}

function ensureEnv(signature: string): void {
  if (!SHYFT_API_KEY) {
    throw new Error(`signature ${signature}: SHYFT_API_KEY is missing`)
  }
  if (!SHYFT_WSS_URL) {
    throw new Error(`signature ${signature}: WSS_URL is missing`)
  }
}

async function fetchShyftParsed(signature: string): Promise<Record<string, unknown>> {
  ensureEnv(signature)

  try {
    const response = await axios.get<ShyftParsedResponse>(SHYFT_ENDPOINT, {
      params: {
        network: 'mainnet-beta',
        txn_signature: signature,
        enable_raw: true,
      },
      headers: { 'x-api-key': SHYFT_API_KEY },
      timeout: 20000,
    })

    if (!response.data?.result) {
      throw new Error(`signature ${signature}: SHYFT response missing result`)
    }

    return response.data.result as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`signature ${signature}: SHYFT fetch failed: ${message}`)
  }
}

function isSplitSwapPair(data: unknown): data is SplitSwapPair {
  if (!data || typeof data !== 'object') {
    return false
  }

  const candidate = data as SplitSwapPair
  return Boolean(candidate.sellRecord && candidate.buyRecord)
}

function normalizeOldSwaps(result: ParserResult): unknown[] {
  if (!result.success || !result.data) {
    return []
  }

  if (isSplitSwapPair(result.data)) {
    return [result.data.sellRecord, result.data.buyRecord]
  }

  return [result.data]
}

function getOldEraseReason(result: ParserResult): string {
  if (result.success) {
    return 'n/a'
  }

  return result.erase?.reason || 'unknown'
}

function buildInstruction(
  programId: string,
  name?: string,
  data?: unknown
): Instruction {
  const instruction: Instruction = { programId }
  if (name !== undefined) {
    instruction.name = name
  }
  if (data !== undefined) {
    instruction.data = data
  }
  return instruction
}

function toAccountKeyStrings(keys: unknown[]): string[] {
  return keys.map((key) => {
    if (typeof key === 'string') {
      return key
    }
    if (key && typeof key === 'object' && 'pubkey' in key) {
      return String((key as { pubkey?: string }).pubkey || '')
    }
    return String(key)
  })
}

function extractInstructionsFromRaw(raw: Record<string, unknown>): Instruction[] {
  const transaction = raw.transaction as Record<string, unknown> | undefined
  const message = transaction?.message as Record<string, unknown> | undefined
  const rawInstructions = message?.instructions
  const compiledInstructions = message?.compiledInstructions
  const instructionsRaw = Array.isArray(rawInstructions)
    ? (rawInstructions as RawInstructionLike[])
    : Array.isArray(compiledInstructions)
      ? (compiledInstructions as RawInstructionLike[])
      : []

  const accountKeysRaw = Array.isArray(message?.accountKeys)
    ? (message?.accountKeys as unknown[])
    : []
  const accountKeys = toAccountKeyStrings(accountKeysRaw)

  return instructionsRaw
    .map((instruction): Instruction | null => {
      const programId =
        instruction.programId ||
        instruction.program_id ||
        (instruction.programIdIndex !== undefined
          ? accountKeys[instruction.programIdIndex] || ''
          : '')

      if (!programId) {
        return null
      }

      const name =
        instruction.name ||
        instruction.parsed?.type ||
        instruction.parsed?.instruction_type

      return buildInstruction(programId, name, instruction.data)
    })
    .filter((instruction): instruction is Instruction => instruction !== null)
}

function extractInstructionsFromActions(actions: ActionLike[]): Instruction[] {
  return actions.map((action) => {
    const type = action.type || ''

    if (
      type === 'TOKEN_TRANSFER' ||
      type === 'TRANSFER' ||
      type === 'TRANSFER_CHECKED' ||
      type === 'TOKEN_TRANSFER_CHECKED'
    ) {
      const name = type.toLowerCase().includes('checked')
        ? 'transferChecked'
        : 'transfer'
      return buildInstruction(TOKEN_PROGRAM_ID, name, action.info)
    }

    return buildInstruction('unknown', type.toLowerCase(), action.info)
  })
}

function extractInstructions(parsed: Record<string, unknown>): Instruction[] {
  const explicit = parsed.instructions as RawInstructionLike[] | undefined
  if (explicit && Array.isArray(explicit) && explicit.length > 0) {
    return explicit
      .map((instruction): Instruction | null => {
        const programId = instruction.programId || instruction.program_id || ''
        if (!programId) {
          return null
        }
        const name =
          instruction.name ||
          instruction.parsed?.type ||
          instruction.parsed?.instruction_type
        return buildInstruction(programId, name, instruction.data)
      })
      .filter((instruction): instruction is Instruction => instruction !== null)
  }

  const raw = parsed.raw as Record<string, unknown> | undefined
  if (raw) {
    const fromRaw = extractInstructionsFromRaw(raw)
    if (fromRaw.length > 0) {
      return fromRaw
    }
  }

  const actions = Array.isArray(parsed.actions)
    ? (parsed.actions as ActionLike[])
    : []
  if (actions.length > 0) {
    return extractInstructionsFromActions(actions)
  }

  return []
}

function toShyftTransactionV2(
  signature: string,
  parsed: Record<string, unknown>
): ShyftTransactionV2 {
  const tokenBalanceChanges =
    (parsed.token_balance_changes as ShyftTransactionV2['token_balance_changes']) || []
  const feePayer = (() => {
    if (typeof parsed.fee_payer === 'string') {
      return parsed.fee_payer
    }
    if (typeof parsed.feePayer === 'string') {
      return parsed.feePayer
    }
    const feeField = parsed.fee
    if (feeField && typeof feeField === 'object' && 'payer' in feeField) {
      return String((feeField as { payer?: string }).payer ?? '')
    }
    return ''
  })()

  const base: ShyftTransactionV2 = {
    signature,
    timestamp: Number(parsed.timestamp ?? parsed.block_time ?? parsed.blockTime ?? 0),
    status: String(parsed.status ?? 'unknown'),
    fee: Number(parsed.fee ?? 0),
    fee_payer: feePayer,
    signers: (parsed.signers as string[] | undefined) || [],
    token_balance_changes: tokenBalanceChanges,
  }

  const protocol = parsed.protocol as ShyftTransactionV2['protocol']
  if (protocol !== undefined) {
    base.protocol = protocol
  }

  const actions = parsed.actions as ShyftTransactionV2['actions']
  if (actions !== undefined) {
    base.actions = actions
  }

  return base
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

function toBalanceChange(raw: Record<string, unknown>): BalanceChange {
  const decimals = Number(raw.decimals ?? 0)
  const scale = BigInt(10) ** BigInt(decimals)
  const owner = String(raw.owner ?? '')
  const mint = String(raw.mint ?? '')

  const hasPrePost =
    raw.pre_balance !== undefined && raw.post_balance !== undefined

  if (hasPrePost) {
    const preRaw = decimalToBigInt(raw.pre_balance as number | string, decimals)
    const postRaw = decimalToBigInt(raw.post_balance as number | string, decimals)

    return {
      mint,
      owner,
      decimals,
      preDelta: preRaw,
      postDelta: postRaw,
      scale,
    }
  }

  const changeValue = (raw.change_amount ?? '0') as number | string
  const changeRaw = decimalToBigInt(changeValue, decimals)
  return {
    mint,
    owner,
    decimals,
    preDelta: BigInt(0),
    postDelta: changeRaw,
    scale,
  }
}

function toRawTransaction(
  signature: string,
  parsed: Record<string, unknown>
): RawTransaction {
  const tokenBalanceChanges =
    (parsed.token_balance_changes as Record<string, unknown>[] | undefined) || []
  const instructions = extractInstructions(parsed)
  const feePayer = (() => {
    if (typeof parsed.fee_payer === 'string') {
      return parsed.fee_payer
    }
    if (typeof parsed.feePayer === 'string') {
      return parsed.feePayer
    }
    const feeField = parsed.fee
    if (feeField && typeof feeField === 'object' && 'payer' in feeField) {
      return String((feeField as { payer?: string }).payer ?? '')
    }
    return ''
  })()
  const signers = (parsed.signers as string[] | undefined) || []
  const protocolName =
    (parsed.protocol as { name?: string; address?: string } | undefined)?.name ||
    (parsed.protocol as { name?: string; address?: string } | undefined)?.address ||
    'unknown'

  return {
    signature,
    timestamp: Number(parsed.timestamp ?? parsed.block_time ?? parsed.blockTime ?? 0),
    protocol: protocolName,
    balanceChanges: tokenBalanceChanges.map((change) => toBalanceChange(change)),
    transactionMeta: {
      feePayer,
      signers,
      instructions,
    },
  }
}

type NewSummary = {
  type: 'success' | 'erase'
  eraseReason: string
  swaps: unknown[]
}

function getNewResultSummary(result: ReturnType<typeof parseTransaction>): NewSummary {
  if (result.type === 'success') {
    return {
      type: 'success',
      eraseReason: 'n/a',
      swaps: result.swaps as unknown[],
    }
  }

  return {
    type: 'erase',
    eraseReason: result.error.reason,
    swaps: [],
  }
}

function formatComparisonOutput(params: {
  signature: string
  oldResult: ParserResult
  newSummary: NewSummary
}): string {
  const { signature, oldResult, newSummary } = params

  const oldType = oldResult.success ? 'success' : 'erase'
  const oldEraseReason = getOldEraseReason(oldResult)
  const oldSwaps = normalizeOldSwaps(oldResult)
  const oldSwapCount = oldSwaps.length

  const newType = newSummary.type
  const newEraseReason = newSummary.eraseReason
  const newSwapCount = newSummary.swaps.length

  const mismatch =
    oldType !== newType
      ? `MISMATCH: ${oldType === 'erase' ? 'OLD ERASED, NEW SUCCESS' : 'OLD SUCCESS, NEW ERASED'}`
      : ''

  const lines = [
    '==============================',
    `TX: ${signature}`,
    '',
    `OLD TYPE: ${oldType}`,
    `OLD ERASE REASON: ${oldType === 'erase' ? oldEraseReason : 'n/a'}`,
    `OLD SWAP COUNT: ${oldSwapCount}`,
    '',
    `NEW TYPE: ${newType}`,
    `NEW ERASE REASON: ${newType === 'erase' ? newEraseReason : 'n/a'}`,
    `NEW SWAP COUNT: ${newSwapCount}`,
    mismatch ? `\n${mismatch}` : '',
    '',
    '--- SWAP DIFF ---',
    `OLD: ${JSON.stringify(oldSwaps, null, 2)}`,
    `NEW: ${JSON.stringify(newSummary.swaps, null, 2)}`,
    '==============================',
  ]

  return lines.filter((line) => line !== '').join('\n')
}

type SummaryBuckets = {
  oldErasedNewAccepted: string[]
  bothErasedSameReason: string[]
  bothErasedDifferentReasons: string[]
  bothAcceptedDifferentSwapCount: string[]
}

function summarizeComparison(
  signature: string,
  oldResult: ParserResult,
  newSummary: NewSummary,
  summary: SummaryBuckets
): void {
  const oldType = oldResult.success ? 'success' : 'erase'
  const oldEraseReason = getOldEraseReason(oldResult)
  const newType = newSummary.type

  if (oldType === 'erase' && newType === 'success') {
    summary.oldErasedNewAccepted.push(signature)
    return
  }

  if (oldType === 'erase' && newType === 'erase') {
    if (oldEraseReason === newSummary.eraseReason) {
      summary.bothErasedSameReason.push(signature)
    } else {
      summary.bothErasedDifferentReasons.push(signature)
    }
    return
  }

  if (oldType === 'success' && newType === 'success') {
    const oldSwapCount = normalizeOldSwaps(oldResult).length
    const newSwapCount = newSummary.swaps.length
    if (oldSwapCount !== newSwapCount) {
      summary.bothAcceptedDifferentSwapCount.push(signature)
    }
  }
}

async function processSignature(
  signature: string,
  summary: SummaryBuckets
): Promise<void> {
  const parsed = await fetchShyftParsed(signature)
  const oldInput = toShyftTransactionV2(signature, parsed)
  const newInput = toRawTransaction(signature, parsed)

  let oldResult: ParserResult
  try {
    oldResult = parseShyftTransactionV2(oldInput)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`signature ${signature}: old parser threw: ${message}`)
  }

  let newSummary: NewSummary
  try {
    const newResult = parseTransaction(newInput)
    newSummary = getNewResultSummary(newResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`signature ${signature}: new parser threw: ${message}`)
  }

  console.log(formatComparisonOutput({ signature, oldResult, newSummary }))
  summarizeComparison(signature, oldResult, newSummary, summary)
}

async function run(): Promise<void> {
  const signatures = [...KOL_MISSING, ...WHALE_MISSING]
  const summary: SummaryBuckets = {
    oldErasedNewAccepted: [],
    bothErasedSameReason: [],
    bothErasedDifferentReasons: [],
    bothAcceptedDifferentSwapCount: [],
  }

  for (const signature of signatures) {
    await processSignature(signature, summary)
  }

  console.log('\nSummary')
  console.log('==============================')
  console.log('Old erased but new accepted:')
  console.log(summary.oldErasedNewAccepted.join('\n') || 'none')
  console.log('\nBoth erased (same reason):')
  console.log(summary.bothErasedSameReason.join('\n') || 'none')
  console.log('\nBoth erased (different reasons):')
  console.log(summary.bothErasedDifferentReasons.join('\n') || 'none')
  console.log('\nBoth accepted but different swap count:')
  console.log(summary.bothAcceptedDifferentSwapCount.join('\n') || 'none')
  console.log('==============================')
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`parserComparisonAudit failed: ${message}`)
  process.exitCode = 1
})
