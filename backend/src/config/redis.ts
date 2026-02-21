import Redis from 'ioredis'

const retryStrategy = (times: number) => {
  const delay = Math.max(Math.min(Math.exp(times), 20000), 1000)
  console.log(`[Redis/BullMQ] Retry ${times}, reconnecting in ${delay}ms...`)
  return delay
}

// Support REDIS_URL (e.g. redis://:password@host:6379) or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
const REDIS_URL = process.env.REDIS_URL
export const redisClient = REDIS_URL
  ? new Redis(REDIS_URL, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy,
    })
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy,
    })

redisClient.on('connect', () => {
  console.log('[Redis/BullMQ] Connecting...')
})

redisClient.on('ready', () => {
  console.log('[Redis/BullMQ] Ready - Bull workers can process jobs')
})

redisClient.on('error', (err: any) => {
  console.error('[Redis/BullMQ] Connection error:', err?.message || err)
  if (err?.message?.includes('NOAUTH') || err?.message?.includes('Authentication required')) {
    console.error(
      '[Redis/BullMQ] Redis requires a password. Set REDIS_PASSWORD in .env or use REDIS_URL=redis://:YOUR_PASSWORD@host:6379'
    )
  }
})

redisClient.on('close', () => {
  console.warn('[Redis/BullMQ] Connection closed')
})

redisClient.on('reconnecting', () => {
  console.log('[Redis/BullMQ] Reconnecting...')
})

export const TOKEN_MARKET_KEY = (address: string) =>
  `token:market:${String(address).toLowerCase()}`