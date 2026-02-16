/**
 * Telegram Balance RPC Stress Test
 *
 * For all users with Telegram connected, checks their ALPHA balance 20 times
 * continuously to verify RPC reliability. Uses the same RPC setup as production
 * (RPC_URL + FALLBACK_RPC_URLS from .env).
 *
 * Run: npx ts-node scripts/telegramBalanceRpcStressTest.ts
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { executeWithFallback } from '../src/config/solana-config'

const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump'
const NUM_CHECKS_PER_USER = 20

function maskRpcUrl(url: string): string {
  if (!url) return '(not set)'
  try {
    const u = new URL(url)
    if (u.searchParams.has('api-key')) {
      const key = u.searchParams.get('api-key')!
      u.searchParams.set('api-key', key.slice(0, 4) + '***' + key.slice(-4))
    }
    return u.toString()
  } catch {
    return url.slice(0, 50) + (url.length > 50 ? '...' : '')
  }
}

async function getAlphaBalance(wallet: string): Promise<number> {
  const publicKey = new PublicKey(wallet)
  const alphaTokenMint = new PublicKey(ALPHA_TOKEN_MINT)
  const tokenAccount = await getAssociatedTokenAddress(alphaTokenMint, publicKey)

  const tokenAccountInfo = await executeWithFallback(
    async (connection) => connection.getTokenAccountBalance(tokenAccount),
    'getTokenAccountBalance',
  )

  if (!tokenAccountInfo?.value) return 0
  return (
    parseFloat(tokenAccountInfo.value.amount) /
    Math.pow(10, tokenAccountInfo.value.decimals)
  )
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI
  const RPC_URL = process.env.RPC_URL
  const FALLBACK_RPC_URLS = process.env.FALLBACK_RPC_URLS?.split(',').filter(Boolean) || []

  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is required')
    process.exit(1)
  }
  if (!RPC_URL) {
    console.error('❌ RPC_URL is required')
    process.exit(1)
  }

  console.log('═'.repeat(70))
  console.log('TELEGRAM BALANCE RPC STRESS TEST')
  console.log('Each user checked 20 times continuously to verify RPC reliability')
  console.log('═'.repeat(70))
  console.log('\n📡 RPC Configuration:')
  console.log(`   Primary:  ${maskRpcUrl(RPC_URL)}`)
  if (FALLBACK_RPC_URLS.length > 0) {
    FALLBACK_RPC_URLS.forEach((url, i) => {
      console.log(`   Fallback ${i + 1}: ${maskRpcUrl(url.trim())}`)
    })
  } else {
    console.log('   Fallbacks: (none configured)')
  }
  console.log('')

  await mongoose.connect(MONGO_URI)
  const User = mongoose.connection.collection('users')

  const users = await User.find({
    telegramChatId: { $exists: true, $ne: null },
    $or: [{ walletAddressOriginal: { $exists: true, $ne: null } }, { walletAddress: { $exists: true, $ne: null } }],
  }).toArray()

  if (users.length === 0) {
    console.log('No users with Telegram + wallet found.')
    await mongoose.disconnect()
    return
  }

  console.log(`\n📊 Found ${users.length} users with Telegram linked. Running ${NUM_CHECKS_PER_USER}x checks per user...\n`)

  let totalChecks = 0
  let totalSuccess = 0
  let totalFail = 0
  const results: Array<{
    userId: string
    wallet: string
    success: number
    fail: number
    balances: number[]
    inconsistent: boolean
    minBalance: number
    maxBalance: number
    errors: string[]
  }> = []

  for (const user of users) {
    const wallet = (user.walletAddressOriginal || user.walletAddress || '').trim()
    if (!wallet) {
      console.log(`⏭️  User ${user._id} - no wallet, skipping`)
      continue
    }

    let publicKeyValid = true
    try {
      new PublicKey(wallet)
    } catch {
      publicKeyValid = false
    }
    if (!publicKeyValid) {
      console.log(`⏭️  User ${user._id} - invalid wallet format, skipping`)
      continue
    }

    const balances: number[] = []
    const errors: string[] = []

    for (let i = 0; i < NUM_CHECKS_PER_USER; i++) {
      totalChecks++
      try {
        const balance = await getAlphaBalance(wallet)
        balances.push(balance)
        totalSuccess++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Attempt ${i + 1}: ${msg}`)
        totalFail++
      }
    }

    const minB = balances.length ? Math.min(...balances) : 0
    const maxB = balances.length ? Math.max(...balances) : 0
    const inconsistent = minB !== maxB && balances.length > 1

    results.push({
      userId: String(user._id),
      wallet: wallet.slice(0, 12) + '...' + wallet.slice(-4),
      success: balances.length,
      fail: errors.length,
      balances,
      inconsistent,
      minBalance: minB,
      maxBalance: maxB,
      errors,
    })

    const status = errors.length === 0 ? '✅' : `❌ ${errors.length} fail`
    const consistency = inconsistent ? ' ⚠️ INCONSISTENT' : ''
    console.log(
      `   ${status} User ${user._id} | Wallet ${wallet.slice(0, 8)}... | ${balances.length}/${NUM_CHECKS_PER_USER} success | balance ~${Math.round(minB).toLocaleString()} ALPHA${consistency}`,
    )
    if (errors.length > 0 && errors.length <= 3) {
      errors.forEach((e) => console.log(`      └ ${e}`))
    } else if (errors.length > 3) {
      errors.slice(0, 2).forEach((e) => console.log(`      └ ${e}`))
      console.log(`      └ ... and ${errors.length - 2} more`)
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70))
  console.log('SUMMARY')
  console.log('═'.repeat(70))
  console.log(`   Total checks:     ${totalChecks}`)
  console.log(`   Successful:       ${totalSuccess} (${((totalSuccess / totalChecks) * 100).toFixed(1)}%)`)
  console.log(`   Failed:           ${totalFail}`)
  const inconsistentCount = results.filter((r) => r.inconsistent).length
  if (inconsistentCount > 0) {
    console.log(`   ⚠️  Inconsistent:   ${inconsistentCount} users had different balance values across checks`)
  }
  console.log('═'.repeat(70))
  console.log(
    totalFail === 0 && inconsistentCount === 0
      ? '\n✅ RPC stress test PASSED - no failures, balances consistent'
      : totalFail > 0
        ? `\n❌ RPC stress test FAILED - ${totalFail} check(s) failed`
        : '\n⚠️  RPC stress test completed with inconsistent balance readings',
  )

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
