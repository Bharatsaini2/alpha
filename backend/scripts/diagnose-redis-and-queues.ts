/**
 * Redis & BullMQ queue diagnostic script
 *
 * Use this to find why prod writes fewer records: Redis connectivity,
 * queue backlogs, failed jobs, and signature set sizes.
 *
 * Run from backend: npx ts-node scripts/diagnose-redis-and-queues.ts
 * Or: npm run diagnose:redis
 */

import dotenv from 'dotenv'
import path from 'path'
import Redis from 'ioredis'
import { Queue } from 'bullmq'

dotenv.config({ path: path.join(__dirname, '../.env') })

const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

function red(s: string) {
  return `\x1b[31m${s}\x1b[0m`
}
function green(s: string) {
  return `\x1b[32m${s}\x1b[0m`
}
function yellow(s: string) {
  return `\x1b[33m${s}\x1b[0m`
}
function cyan(s: string) {
  return `\x1b[36m${s}\x1b[0m`
}

async function main() {
  console.log(cyan('\n=== Redis & BullMQ diagnostic ===\n'))
  console.log('Config:', {
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD: REDIS_PASSWORD ? '***set***' : '(not set)',
  })

  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 500, 3000),
  })

  try {
    // 1. Ping
    const pong = await redis.ping()
    console.log(green('✓ Redis PING:'), pong)
  } catch (e: any) {
    console.error(red('✗ Redis PING failed:'), e?.message || e)
    console.error(
      yellow(
        '  → Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD. If Redis is on another host, ensure firewall allows port and password is correct.',
      ),
    )
    await redis.quit()
    process.exit(1)
  }

  // 2. Signature set sizes (dedup sets)
  try {
    const whaleCount = await redis.scard('whale_signatures')
    const kolCount = await redis.scard('influencer_whale_signatures')
    const walletCount = await redis.scard('wallet_signatures')
    console.log(green('✓ Signature sets (SCARD):'))
    console.log('   whale_signatures:', whaleCount)
    console.log('   influencer_whale_signatures:', kolCount)
    console.log('   wallet_signatures:', walletCount)
  } catch (e: any) {
    console.error(red('✗ SCARD failed:'), e?.message)
  }

  // 3. BullMQ queue stats (same queue names as whale/influencer controllers)
  const whaleQueue = new Queue('signature-processing', { connection: redis })
  const kolQueue = new Queue('signature-processing-kol', { connection: redis })

  for (const [name, queue] of [
    ['Whale (signature-processing)', whaleQueue],
    ['KOL (signature-processing-kol)', kolQueue],
  ] as const) {
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      )
      console.log(green(`✓ Queue ${name}:`))
      console.log('   waiting:', counts.waiting)
      console.log('   active:', counts.active)
      console.log('   completed:', counts.completed)
      console.log('   failed:', counts.failed)
      console.log('   delayed:', counts.delayed)

      if (counts.waiting > 500) {
        console.log(yellow(`   ⚠ Large backlog (${counts.waiting}) — workers may be slow or stuck. Consider increasing WORKER_CONCURRENCY_WHALE / WORKER_CONCURRENCY_KOL or NUM_WORKERS_* .`))
      }
      if (counts.failed > 0) {
        const failed = await queue.getFailed(0, 4)
        console.log(yellow('   Sample failed jobs:'))
        for (const job of failed) {
          console.log('     ', job.id, job.failedReason?.slice(0, 80))
        }
      }
    } catch (e: any) {
      console.error(red(`✗ Queue ${name} failed:`), e?.message)
    }
  }

  // 4. Processing locks (stuck keys can block re-processing)
  try {
    const lockKeys = await redis.keys('processing_signature:*')
    console.log(green('✓ Processing locks (processing_signature:*):'), lockKeys.length)
    if (lockKeys.length > 200) {
      console.log(yellow('   ⚠ Many lock keys — normal under load. They expire in 300s (5 min).'))
    }
  } catch (e: any) {
    console.error(red('✗ KEYS processing_signature failed:'), e?.message)
  }

  // 5. Bull queue key presence (sanity)
  try {
    const bullKeys = await redis.keys('bull:signature-processing*')
    console.log(green('✓ Bull queue keys (bull:signature-processing*):'), bullKeys.length)
  } catch (e: any) {
    console.log(red('✗ KEYS bull:* failed:'), e?.message)
  }

  await redis.quit()
  console.log(cyan('\n=== Recommendations ==='))
  console.log('1. If PING failed: fix REDIS_HOST / REDIS_PORT / REDIS_PASSWORD in .env and ensure Redis is running (e.g. redis-cli -h HOST -p PORT -a PASSWORD ping).')
  console.log('2. If queues show high "waiting": workers may be slow; set NUM_WORKERS_WHALE, WORKER_CONCURRENCY_WHALE (and _KOL) in env; restart PM2.')
  console.log('3. If "failed" is high: check PM2 logs for worker errors (getParsedTransactions, parser, or DB).')
  console.log('4. Ensure PM2 process has same .env (e.g. pm2 start dist/app.js --env production or use ecosystem file with env).')
  console.log('5. After code deploy: pm2 restart whale-tracker; wait for "[Bootstrap] Whale WebSocket" and "KOL WebSocket" in logs.\n')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
