import { CORE_TOKENS } from './constants'
import { AssetDelta, TransactionMeta } from './types'

export type TransferDetectionResult = {
  isTransfer: boolean
  hasNonCoreToken: boolean
}

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

function isCoreToken(mint: string): boolean {
  return CORE_TOKENS.has(mint)
}

export function detect(
  activeAssets: AssetDelta[],
  transactionMeta: TransactionMeta
): TransferDetectionResult {
  const hasNonCoreToken = activeAssets.some((asset) => !isCoreToken(asset.mint))

  if (hasNonCoreToken) {
    return { isTransfer: false, hasNonCoreToken }
  }

  const isTransfer =
    transactionMeta.instructions.length > 0 &&
    transactionMeta.instructions.every(
      (instruction) =>
        instruction.programId === TOKEN_PROGRAM_ID &&
        (instruction.name === 'transfer' ||
          instruction.name === 'transferChecked')
    )

  return { isTransfer, hasNonCoreToken }
}
