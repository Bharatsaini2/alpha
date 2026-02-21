/**
 * Helius Enhanced Transactions API → ShyftTransactionV2 adapter
 *
 * Used to run the same V2 parser on Helius-parsed data for comparison (SHYFT vs Helius).
 * Helius docs: https://docs.helius.dev/solana-apis/enhanced-transactions-api
 */

import type { ShyftTransactionV2 } from './shyftParserV2'
import type { TokenBalanceChange } from './shyftParserV2.types'

const HELIUS_API_BASE =
  process.env.HELIUS_API_BASE || 'https://api.helius.xyz'
const HELIUS_ENDPOINT = `${HELIUS_API_BASE.replace(/\/$/, '')}/v0/transactions`

/** Helius EnhancedTransaction (minimal shape we use) */
export interface HeliusEnhancedTransaction {
  signature: string
  timestamp?: number
  fee?: number
  feePayer?: string
  type?: string
  source?: string
  accountData?: Array<{
    account: string
    nativeBalanceChange?: number
    tokenBalanceChanges?: Array<{
      userAccount?: string
      tokenAccount?: string
      mint: string
      rawTokenAmount?: {
        tokenAmount: string
        decimals?: number
      }
    }>
  }>
  tokenTransfers?: Array<{
    fromUserAccount: string
    toUserAccount: string
    mint: string
    tokenAmount: number
  }>
  nativeTransfers?: Array<{
    fromUserAccount?: string
    toUserAccount?: string
    amount?: number
  }>
  transactionError?: { error?: string }
  events?: {
    swap?: {
      tokenInputs?: Array<{ userAccount?: string; mint?: string; rawTokenAmount?: { tokenAmount: string; decimals?: number } }>
      tokenOutputs?: Array<{ userAccount?: string; mint?: string; rawTokenAmount?: { tokenAmount: string; decimals?: number } }>
    }
  }
}

/**
 * Fetch parsed transaction from Helius Enhanced Transactions API
 */
export async function fetchHeliusParsed(signature: string): Promise<HeliusEnhancedTransaction | null> {
  const apiKey = process.env.HELIUS_API_KEY
  if (!apiKey) {
    throw new Error('HELIUS_API_KEY is required for fetchHeliusParsed')
  }

  const url = `${HELIUS_ENDPOINT}?api-key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: [signature] }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Helius API error ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  if (!Array.isArray(data) || data.length === 0) {
    return null
  }

  const tx = data[0]
  if (!tx || typeof tx !== 'object') {
    return null
  }

  return tx as HeliusEnhancedTransaction
}

function parseTokenAmount(raw: string | undefined): number {
  if (raw === undefined || raw === null) return 0
  const s = String(raw).trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * Build ShyftTransactionV2 from Helius EnhancedTransaction so we can run the same parser.
 */
export function buildV2InputFromHelius(
  signature: string,
  helius: HeliusEnhancedTransaction
): ShyftTransactionV2 {
  const status =
    helius.transactionError?.error != null
      ? 'Failed'
      : 'Success'

  const fee = Number(helius.fee ?? 0)
  const feePayer = helius.feePayer ?? ''
  const timestamp = helius.timestamp != null
    ? (helius.timestamp < 1e12 ? helius.timestamp * 1000 : helius.timestamp)
    : Date.now()

  const signers: string[] = []
  if (feePayer) signers.push(feePayer)
  if (helius.nativeTransfers?.length) {
    for (const t of helius.nativeTransfers) {
      if (t.fromUserAccount && !signers.includes(t.fromUserAccount)) signers.push(t.fromUserAccount)
      if (t.toUserAccount && !signers.includes(t.toUserAccount)) signers.push(t.toUserAccount)
    }
  }
  if (helius.tokenTransfers?.length) {
    for (const t of helius.tokenTransfers) {
      if (t.fromUserAccount && !signers.includes(t.fromUserAccount)) signers.push(t.fromUserAccount)
      if (t.toUserAccount && !signers.includes(t.toUserAccount)) signers.push(t.toUserAccount)
    }
  }

  const token_balance_changes = buildTokenBalanceChanges(helius)

  const protocol = helius.source
    ? { name: String(helius.source), address: '' }
    : undefined

  const actions: ShyftTransactionV2['actions'] = []
  if (helius.events?.swap) {
    const swap = helius.events.swap
    const rawAmt = swap.tokenInputs?.[0]?.rawTokenAmount?.tokenAmount
    actions.push({
      type: 'SWAP',
      info: {
        token_address: swap.tokenInputs?.[0]?.mint,
        amount_raw: rawAmt,
        amount: rawAmt != null ? parseTokenAmount(rawAmt) : undefined,
      },
      source_protocol: { address: '', name: helius.source || 'UNKNOWN' },
    })
  }

  return {
    signature: helius.signature || signature,
    timestamp,
    status,
    fee,
    fee_payer: feePayer,
    signers,
    protocol,
    token_balance_changes,
    actions: actions.length ? actions : undefined,
  }
}

function buildTokenBalanceChanges(helius: HeliusEnhancedTransaction): TokenBalanceChange[] {
  const byKey = new Map<string, { owner: string; mint: string; change_amount: number; decimals: number; tokenAccount: string }>()

  if (Array.isArray(helius.accountData)) {
    for (const acc of helius.accountData) {
      const owner = acc.account || ''
      if (!owner) continue
      for (const tbc of acc.tokenBalanceChanges || []) {
        const userAccount = tbc.userAccount ?? owner
        const mint = tbc.mint ?? ''
        const raw = tbc.rawTokenAmount
        const decimals = raw?.decimals ?? 0
        const tokenAmountStr = raw?.tokenAmount
        const change_amount = parseTokenAmount(tokenAmountStr)
        if (!mint) continue
        const key = `${userAccount}:${mint}`
        const existing = byKey.get(key)
        if (existing) {
          existing.change_amount += change_amount
        } else {
          byKey.set(key, {
            owner: userAccount,
            mint,
            change_amount,
            decimals,
            tokenAccount: tbc.tokenAccount ?? '',
          })
        }
      }
    }
  }

  // Fallback: derive deltas from tokenTransfers (amount may be raw or human; prefer accountData)
  if (byKey.size === 0 && Array.isArray(helius.tokenTransfers)) {
    for (const t of helius.tokenTransfers) {
      const mint = t.mint ?? ''
      const amount = Number(t.tokenAmount) || 0
      if (!mint || !amount) continue
      for (const [owner, sign] of [
        [t.fromUserAccount, -1],
        [t.toUserAccount, 1],
      ] as const) {
        if (!owner) continue
        const key = `${owner}:${mint}`
        const delta = Math.round(amount * sign)
        byKey.set(key, {
          owner,
          mint,
          change_amount: delta,
          decimals: 0,
          tokenAccount: '',
        })
      }
    }
  }

  const out: TokenBalanceChange[] = []
  for (const v of byKey.values()) {
    if (v.change_amount === 0) continue
    out.push({
      address: v.tokenAccount || v.mint,
      decimals: v.decimals,
      change_amount: v.change_amount,
      pre_balance: 0,
      post_balance: 0,
      mint: v.mint,
      owner: v.owner,
    })
  }
  return out
}
