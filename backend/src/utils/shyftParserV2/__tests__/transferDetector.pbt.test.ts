import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { CORE_TOKENS } from '../constants'
import { detect } from '../transferDetector'
import { AssetDelta, TransactionMeta } from '../types'

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toAssetDelta(mint: string, index: number): AssetDelta {
  return {
    mint,
    owner: `Owner${index}`,
    decimals: 6,
    delta: BigInt(1),
    scale: scaleFor(6),
    role: 'intermediate',
  }
}

function toMeta(instructions: TransactionMeta['instructions']): TransactionMeta {
  return { feePayer: 'FeePayer111111111111111111111111111111111', signers: [], instructions }
}

const coreMintArb = fc.constantFrom(...Array.from(CORE_TOKENS))
const nonCoreMintArb = fc
  .string({ minLength: 5, maxLength: 20 })
  .filter((mint) => !CORE_TOKENS.has(mint))

const transferInstructionArb = fc.constantFrom('transfer', 'transferChecked').map((name) => ({
  programId: TOKEN_PROGRAM_ID,
  name,
}))

const nonTransferInstructionArb = fc.record({
  programId: fc.string({ minLength: 5, maxLength: 20 }),
  name: fc.string({ minLength: 3, maxLength: 20 }),
})

// Feature: parser-v2-balance-truth-refactor, Property 15: Non-Core Token Requirement
test('all core tokens => hasNonCoreToken false', () => {
  fc.assert(
    fc.property(fc.array(coreMintArb, { minLength: 1, maxLength: 10 }), (mints) => {
      const assets = mints.map((mint, index) => toAssetDelta(mint, index))
      const result = detect(assets, toMeta([]))
      expect(result.hasNonCoreToken).toBe(false)
    }),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 15: Non-Core Token Requirement
test('mixed tokens => hasNonCoreToken true', () => {
  fc.assert(
    fc.property(
      fc.array(coreMintArb, { minLength: 0, maxLength: 5 }),
      nonCoreMintArb,
      (coreMints, nonCoreMint) => {
        const assets = [
          ...coreMints.map((mint, index) => toAssetDelta(mint, index)),
          toAssetDelta(nonCoreMint, coreMints.length + 1),
        ]
        const result = detect(assets, toMeta([]))
        expect(result.hasNonCoreToken).toBe(true)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 16: Transfer with Non-Core Token Acceptance
test('transfer instructions but non-core token exists => isTransfer false', () => {
  fc.assert(
    fc.property(
      fc.array(transferInstructionArb, { minLength: 1, maxLength: 5 }),
      nonCoreMintArb,
      (instructions, nonCoreMint) => {
        const assets = [toAssetDelta(nonCoreMint, 0)]
        const result = detect(assets, toMeta(instructions))
        expect(result.hasNonCoreToken).toBe(true)
        expect(result.isTransfer).toBe(false)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 17: Pure Transfer Rejection
test('only transfer instructions and no non-core => isTransfer true', () => {
  fc.assert(
    fc.property(
      fc.array(coreMintArb, { minLength: 1, maxLength: 5 }),
      fc.array(transferInstructionArb, { minLength: 1, maxLength: 5 }),
      (coreMints, instructions) => {
        const assets = coreMints.map((mint, index) => toAssetDelta(mint, index))
        const snapshot = assets.map((asset) => ({ ...asset }))
        const meta = toMeta(instructions)
        const metaSnapshot = { ...meta, instructions: [...meta.instructions] }

        const result = detect(assets, meta)

        expect(result.hasNonCoreToken).toBe(false)
        expect(result.isTransfer).toBe(true)
        expect(assets).toEqual(snapshot)
        expect(meta).toEqual(metaSnapshot)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 17: Pure Transfer Rejection
test('non-transfer instruction with core-only assets => isTransfer false', () => {
  fc.assert(
    fc.property(
      fc.array(coreMintArb, { minLength: 1, maxLength: 5 }),
      fc.array(nonTransferInstructionArb, { minLength: 1, maxLength: 3 }),
      (coreMints, instructions) => {
        const assets = coreMints.map((mint, index) => toAssetDelta(mint, index))
        const result = detect(assets, toMeta(instructions))
        expect(result.hasNonCoreToken).toBe(false)
        expect(result.isTransfer).toBe(false)
      }
    ),
    { numRuns: 100 }
  )
})
