import Redis from 'ioredis'

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  enableReadyCheck: true,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.max(Math.min(Math.exp(times), 20000), 1000)
    console.log(`[Redis/BullMQ] Retry ${times}, reconnecting in ${delay}ms...`)
    return delay
  },
})

redisClient.on('connect', () => {
  console.log('[Redis/BullMQ] Connecting...')
})

redisClient.on('ready', () => {
  console.log('[Redis/BullMQ] Ready - Bull workers can process jobs')
})

redisClient.on('error', (err) => {
  console.error('[Redis/BullMQ] Connection error:', err.message)
})

redisClient.on('close', () => {
  console.warn('[Redis/BullMQ] Connection closed')
})

redisClient.on('reconnecting', () => {
  console.log('[Redis/BullMQ] Reconnecting...')
})

export const TOKEN_MARKET_KEY = (address: string) =>
  `token:market:${String(address).toLowerCase()}`