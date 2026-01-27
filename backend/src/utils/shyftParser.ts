import logger from './logger'

// Constants
const SOL_MINT = 'So11111111111111111111111111111111111111112'
// Note: SHYFT already normalizes WSOL in token_balance_changes
// We don't need separate WSOL handling - just use SOL_MINT

// Types
export interface TokenBalanceChange {
  address: string
  decimals: number
  change_amount: number
  post_balance: number
  pre_balance: number
  mint: string
  owner: string
}

export interface TokenSwapped {
  mint: string
  amount_raw: string | number
  decimals?: number
}

export interface SwapEvent {
  input_mint: string
  input_amount: number
  output_mint: string
  output_amount: number
}

export interface Event {
  name: string
  data?: {
    swap_events?: SwapEvent[]
    [key: string]: any
  }
  [key: string]: any
}

export interface Action {
  type: string
  info?: {
    tokens_swapped?: TokenSwapped[]
    [key: string]: any
  }
  [key: string]: any
}

export interface ShyftTransaction {
  signature?: string
  timestamp?: string
  status: string
  fee_payer?: string
  signers?: string[]
  type?: string
  token_balance_changes?: TokenBalanceChange[]
  actions?: Action[]
  events?: Event[]
  [key: string]: any
}

export interface ParsedSwap {
  transaction_hash?: string
  timestamp?: string
  swapper: string
  side: 'BUY' | 'SELL' | 'SWAP'
  input: {
    mint: string
    symbol?: string
    amount_raw: string
    decimals: number
    amount: number
  }
  output: {
    mint: string
    symbol?: string
    amount_raw: string
    decimals: number
    amount: number
  }
  router_or_amm?: string
  ata_created: boolean
  classification_source: 'tokens_swapped' | 'token_balance_changes' | 'events'
  confidence: 'MAX' | 'HIGH' | 'MEDIUM' | 'LOW'
}

/**
 * Main parser function following canonical SHYFT specification
 * Requirement 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */
export function parseShyftTransaction(tx: ShyftTransaction): ParsedSwap | null {
  try {
    // Step 0: Status Gate - Requirement 1.1
    if (tx.status !== 'Success') {
      logger.debug({ signature: tx.signature }, 'Transaction failed, discarding')
      return null
    }

    // Step 1: Identify Swapper - Requirement 1.1
    const swapper = tx.fee_payer || tx.signers?.[0]
    if (!swapper) {
      logger.debug({ signature: tx.signature }, 'No swapper identified, discarding')
      return null
    }
    logger.debug({ signature: tx.signature, swapper }, 'Swapper identified')

    // Step 2: Ignore Type - Requirement 1.5
    // Never use type as a filter, just log if it's potentially misleading
    if (tx.type && ['CREATE_TOKEN_ACCOUNT', 'TOKEN_TRANSFER', 'GETACCOUNTDATASIZE', 'INIT_USER_VOLUME_ACCUMULATOR', 'UNKNOWN'].includes(tx.type)) {
      logger.debug({ signature: tx.signature, type: tx.type }, 'Type label is potentially misleading, continuing evaluation')
    }

    // Step 3: Fast Path (tokens_swapped) - Requirement 1.3
    if (tx.actions && Array.isArray(tx.actions) && tx.actions.length > 0) {
      for (const action of tx.actions) {
        if (action.info?.tokens_swapped) {
          const fastPathResult = parseFastPath(tx, action.info.tokens_swapped, swapper)
          if (fastPathResult) {
            logger.debug({ signature: tx.signature }, 'Fast path classification successful')
            return fastPathResult
          }
        }
      }
    }

    // Step 4: Balance Delta Path (PRIMARY) - Requirement 1.1, 1.2, 1.4
    const balancePathResult = parseBalanceDeltaPath(tx, swapper)
    if (balancePathResult) {
      logger.debug({ signature: tx.signature }, 'Balance delta path classification successful')
      return balancePathResult
    }

    // Step 5: ATA Detection (Informational) - Requirement 1.1
    const ataCreated = detectATACreation(tx.token_balance_changes || [])

    // Step 6: Event Override (Safety Net) - Requirement 1.6
    const eventOverrideResult = parseEventOverride(tx, swapper, ataCreated)
    if (eventOverrideResult) {
      logger.debug({ signature: tx.signature }, 'Event override classification successful')
      return eventOverrideResult
    }

    // Step 7: Non-Swap Classification
    logger.debug({ signature: tx.signature }, 'No swap classification found, discarding')
    return null
  } catch (error) {
    logger.error({ signature: tx.signature, error: error instanceof Error ? error.message : String(error) }, 'Failed to parse transaction')
    return null
  }
}

/**
 * Fast path using tokens_swapped field - Requirement 1.3
 * Handles both array format and object format with in/out properties
 */
function parseFastPath(tx: ShyftTransaction, tokensSwapped: any, swapper: string): ParsedSwap | null {
  let input: any
  let output: any

  // Handle array format: [input, output]
  if (Array.isArray(tokensSwapped)) {
    if (tokensSwapped.length < 2) {
      logger.debug({ signature: tx.signature }, 'Fast path: insufficient tokens_swapped entries')
      return null
    }
    input = tokensSwapped[0]
    output = tokensSwapped[1]
  }
  // Handle object format: { in: {...}, out: {...} }
  else if (tokensSwapped && typeof tokensSwapped === 'object') {
    input = tokensSwapped.in
    output = tokensSwapped.out
  }

  if (!input || !output) {
    logger.debug({ signature: tx.signature }, 'Fast path: missing input or output')
    return null
  }

  // Extract mint and amount from either format
  const inputMint = input.mint || input.token_address
  const outputMint = output.mint || output.token_address
  const inputAmountRaw = input.amount_raw
  const outputAmountRaw = output.amount_raw
  const inputDecimals = input.decimals ?? 0
  const outputDecimals = output.decimals ?? 0

  if (!inputMint || !outputMint || inputAmountRaw === undefined || outputAmountRaw === undefined) {
    logger.debug({ signature: tx.signature }, 'Fast path: missing required fields')
    return null
  }

  const inputAmount = normalizeAmount(inputAmountRaw, inputDecimals)
  const outputAmount = normalizeAmount(outputAmountRaw, outputDecimals)

  return {
    transaction_hash: tx.signature,
    timestamp: tx.timestamp,
    swapper,
    side: 'SWAP',
    input: {
      mint: inputMint,
      amount_raw: String(inputAmountRaw),
      decimals: inputDecimals,
      amount: inputAmount,
    },
    output: {
      mint: outputMint,
      amount_raw: String(outputAmountRaw),
      decimals: outputDecimals,
      amount: outputAmount,
    },
    ata_created: detectATACreation(tx.token_balance_changes || []),
    classification_source: 'tokens_swapped',
    confidence: 'MAX',
  }
}

/**
 * Balance delta path (PRIMARY) - Requirement 1.1, 1.2, 1.4
 * 
 * CRITICAL FIX: Track the swapper's balance change for each mint, not an arbitrary one.
 * This ensures we use the correct decimals and reference values from the swapper's account.
 * 
 * The bug: changesByMint[mint] = first_change_encountered
 * This is wrong because:
 * - Multiple accounts can change for the same mint in one transaction
 * - We need the swapper's specific account, not an arbitrary one
 * - The decimals and pre_balance must come from the swapper's account
 * 
 * The fix: For each mint, track ALL the swapper's changes and use them correctly
 */
function parseBalanceDeltaPath(tx: ShyftTransaction, swapper: string): ParsedSwap | null {
  const changes = tx.token_balance_changes || []

  // Filter balance changes where owner == swapper
  const relevantChanges = changes.filter((change) => change.owner === swapper)

  if (relevantChanges.length === 0) {
    logger.debug({ signature: tx.signature, swapper }, 'No relevant balance changes for swapper')
    return null
  }

  // Aggregate by mint - track BOTH the net delta AND all changes for that mint
  const netDeltas: { [mint: string]: number } = {}
  const changesByMint: { [mint: string]: TokenBalanceChange[] } = {}

  for (const change of relevantChanges) {
    const delta = change.post_balance - change.pre_balance
    logger.debug(
      {
        mint: change.mint,
        address: change.address,
        pre_balance: change.pre_balance,
        post_balance: change.post_balance,
        delta,
        decimals: change.decimals,
      },
      'Balance change delta'
    )
    netDeltas[change.mint] = (netDeltas[change.mint] || 0) + delta

    // Store ALL changes for this mint (there may be multiple accounts)
    if (!changesByMint[change.mint]) {
      changesByMint[change.mint] = []
    }
    changesByMint[change.mint].push(change)
  }

  // Normalize SOL - Requirement 1.4
  // Note: SHYFT already normalizes WSOL in token_balance_changes, so we only need SOL
  const solNetDelta = netDeltas[SOL_MINT] || 0

  logger.debug(
    { signature: tx.signature, solNetDelta },
    'SOL normalization'
  )

  // Identify non-SOL tokens with non-zero deltas
  const nonSolTokens = Object.entries(netDeltas)
    .filter(([mint, delta]) => mint !== SOL_MINT && delta !== 0)
    .map(([mint, delta]) => ({ mint, delta }))

  logger.debug(
    { signature: tx.signature, nonSolTokens, solNetDelta },
    'Balance delta analysis'
  )

  // Classification rules
  // BUY: non-SOL token inflow + SOL outflow
  if (nonSolTokens.some((t) => t.delta > 0) && solNetDelta < 0) {
    const tokenInflow = nonSolTokens.find((t) => t.delta > 0)
    if (tokenInflow) {
      const tokenChange = getBestChangeForMint(changesByMint[tokenInflow.mint])
      const solChange = getBestChangeForMint(changesByMint[SOL_MINT])

      return {
        transaction_hash: tx.signature,
        timestamp: tx.timestamp,
        swapper,
        side: 'BUY',
        input: {
          mint: SOL_MINT,
          amount_raw: String(Math.abs(solNetDelta)),
          decimals: solChange?.decimals ?? 9,
          amount: Math.abs(solNetDelta) / Math.pow(10, solChange?.decimals ?? 9),
        },
        output: {
          mint: tokenInflow.mint,
          amount_raw: String(tokenInflow.delta),
          decimals: tokenChange?.decimals ?? 0,
          amount: tokenInflow.delta / Math.pow(10, tokenChange?.decimals ?? 0),
        },
        ata_created: detectATACreation(relevantChanges),
        classification_source: 'token_balance_changes',
        confidence: 'MEDIUM',
      }
    }
  }

  // SELL: non-SOL token outflow + SOL inflow
  if (nonSolTokens.some((t) => t.delta < 0) && solNetDelta > 0) {
    const tokenOutflow = nonSolTokens.find((t) => t.delta < 0)
    if (tokenOutflow) {
      const tokenChange = getBestChangeForMint(changesByMint[tokenOutflow.mint])
      const solChange = getBestChangeForMint(changesByMint[SOL_MINT])

      return {
        transaction_hash: tx.signature,
        timestamp: tx.timestamp,
        swapper,
        side: 'SELL',
        input: {
          mint: tokenOutflow.mint,
          amount_raw: String(Math.abs(tokenOutflow.delta)),
          decimals: tokenChange?.decimals ?? 0,
          amount: Math.abs(tokenOutflow.delta) / Math.pow(10, tokenChange?.decimals ?? 0),
        },
        output: {
          mint: SOL_MINT,
          amount_raw: String(solNetDelta),
          decimals: solChange?.decimals ?? 9,
          amount: solNetDelta / Math.pow(10, solChange?.decimals ?? 9),
        },
        ata_created: detectATACreation(relevantChanges),
        classification_source: 'token_balance_changes',
        confidence: 'MEDIUM',
      }
    }
  }

  return null
}

/**
 * Get the best change for a mint from multiple possible changes
 * Priority: prefer non-zero delta (actual swap), then first one
 */
function getBestChangeForMint(changes: TokenBalanceChange[] | undefined): TokenBalanceChange | undefined {
  if (!changes || changes.length === 0) return undefined
  if (changes.length === 1) return changes[0]

  // Prefer the change with non-zero delta (actual swap activity)
  const nonZeroDelta = changes.find((c) => c.post_balance !== c.pre_balance)
  return nonZeroDelta || changes[0]
}

/**
 * ATA Detection (Informational) - Requirement 1.1, 1.5
 */
function detectATACreation(changes: TokenBalanceChange[]): boolean {
  return changes.some((change) => change.pre_balance === 0 && change.post_balance > 0)
}

/**
 * Event Override (Safety Net) - Requirement 1.6
 */
function parseEventOverride(tx: ShyftTransaction, swapper: string, ataCreated: boolean): ParsedSwap | null {
  const events = tx.events || []

  // Check for swap events
  const hasSwapEvent = events.some((e) => {
    const eventName = e.name || ''
    return ['BuyEvent', 'SellEvent', 'SwapEvent', 'SwapsEvent'].includes(eventName)
  })

  if (!hasSwapEvent) {
    return null
  }

  // Try to extract swap details from events
  for (const event of events) {
    if (event.name === 'BuyEvent' && event.data) {
      // BuyEvent detected
      logger.debug({ signature: tx.signature }, 'BuyEvent detected in events')
      return {
        transaction_hash: tx.signature,
        timestamp: tx.timestamp,
        swapper,
        side: 'BUY',
        input: {
          mint: SOL_MINT,
          amount_raw: '0',
          decimals: 9,
          amount: 0,
        },
        output: {
          mint: 'UNKNOWN',
          amount_raw: '0',
          decimals: 0,
          amount: 0,
        },
        ata_created: ataCreated,
        classification_source: 'events',
        confidence: 'LOW',
      }
    }

    if (event.name === 'SellEvent' && event.data) {
      // SellEvent detected
      logger.debug({ signature: tx.signature }, 'SellEvent detected in events')
      return {
        transaction_hash: tx.signature,
        timestamp: tx.timestamp,
        swapper,
        side: 'SELL',
        input: {
          mint: 'UNKNOWN',
          amount_raw: '0',
          decimals: 0,
          amount: 0,
        },
        output: {
          mint: SOL_MINT,
          amount_raw: '0',
          decimals: 9,
          amount: 0,
        },
        ata_created: ataCreated,
        classification_source: 'events',
        confidence: 'LOW',
      }
    }

    if ((event.name === 'SwapEvent' || event.name === 'SwapsEvent') && event.data?.swap_events) {
      // SwapEvent detected
      logger.debug({ signature: tx.signature }, 'SwapEvent detected in events')
      const swapEvents = event.data.swap_events as SwapEvent[]
      if (swapEvents.length > 0) {
        const firstSwap = swapEvents[0]
        return {
          transaction_hash: tx.signature,
          timestamp: tx.timestamp,
          swapper,
          side: 'SWAP',
          input: {
            mint: firstSwap.input_mint,
            amount_raw: String(firstSwap.input_amount),
            decimals: 0,
            amount: firstSwap.input_amount,
          },
          output: {
            mint: firstSwap.output_mint,
            amount_raw: String(firstSwap.output_amount),
            decimals: 0,
            amount: firstSwap.output_amount,
          },
          ata_created: ataCreated,
          classification_source: 'events',
          confidence: 'LOW',
        }
      }
    }
  }

  return null
}

/**
 * Normalize amount - Requirement 1.7
 */
function normalizeAmount(amount_raw: string | number, decimals: number): number {
  try {
    const rawNum = typeof amount_raw === 'string' ? BigInt(amount_raw) : BigInt(amount_raw)
    return Number(rawNum) / Math.pow(10, decimals)
  } catch (error) {
    logger.warn({ amount_raw, decimals, error: error instanceof Error ? error.message : String(error) }, 'Failed to normalize amount')
    return 0
  }
}
