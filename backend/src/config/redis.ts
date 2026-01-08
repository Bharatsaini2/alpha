import Redis from 'ioredis'

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  enableReadyCheck: false,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.max(Math.min(Math.exp(times), 20000), 1000)
    console.log(`BullMQ Redis retry ${times}, waiting ${delay}ms`)
    return delay
  },
})

export const TOKEN_MARKET_KEY = (address: string) =>
  `token:market:${String(address).toLowerCase()}`