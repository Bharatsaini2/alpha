import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createServer } from 'http'
import process from 'process'
import { createClient } from 'redis'
import { Server } from 'socket.io'
const session = require('express-session')
import passport from './config/passport'
import { connectDB } from './config/connectDb'
import insightRouter from './routes/insight.route'
import tokenRouter from './routes/token.route'
import transactionRouter from './routes/transaction.route'
import whaleRouter from './routes/whale.route'
import influencerWhaleRouter from './routes/influencer.route'
import trendingTokensRouter from './routes/trendingTokens.route'
import topCoinsRouter from './routes/topCoins.route'
import topCoinsKolRouter from './routes/topCoinsKol.route'
import authRouter from './routes/auth.route'
import searchHistoryRouter from './routes/searchHistory.route'
import walletRouter from './routes/wallet.route'
import tradeRouter from './routes/trade.route'
import adminRouter from './routes/admin.route'
import alertRouter from './routes/alert.route'
import { processManager, registerServer } from './config/processManager'
import { telegramService } from './services/telegram.service'
import { alertMatcherService } from './services/alertMatcher.service'
import { balanceValidatorService } from './services/balanceValidator.service'
import { validateAndLogEnv } from './config/envValidation'
import { scheduleWhaleMonitorBootstrap } from './config/whaleMonitorBootstrap'
import './cron/topTokenWhaleMarketcapAlertJob'
import './cron/smartMoney'
import './cron/heavy-accumulator-label'
import './cron/snipperAndFlipperLabelJob'
import './cron/coordinatedGrroupLabel'
import './cron/dailyVolumeTokenJob'
import './cron/weeklyPredictionJob'
import './cron/weeklyPredictionScoreJob'
import './cron/weeklyPredictionTokenPostJob'
import './cron/trendingTokensJob'
import './cron/topMarketDataCacheJob'
import './cron/kolProfileUpdateJob'
import './cron/labelLockCleanupJob'
import './cron/dormantWhaleCleanupJob'
import { updateKolProfileInfo } from './cron/kolProfileUpdateJob'
import { findWhaleTokens, getTokenData } from './config/solana-tokens-config'
import { TwitterApi } from 'twitter-api-v2'
import { processWalletSignature } from './controllers/wallet.controller'

dotenv.config()
validateAndLogEnv()

// Memory management configuration
const PORT: number = Number(process.env.PORT) || 9090


// Enable garbage collection if available
if (global.gc) {
  console.log('✅ Garbage collection enabled')
  // Run GC every 30 seconds
  setInterval(() => {
    if (global.gc) global.gc()
  }, 30000)
}

const app = express()
const wss = createServer(app)
// const io = new Server(wss, {
//   cors: {
//     origin: "*",
//     // origin: process.env.ORIGIN,
//   },
// };
const io = new Server(wss, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'https://app.alpha-block.ai',
      'https://alpha-block.ai',
      'http://app.alpha-block.ai',
      'http://alpha-block.ai',
      'http://localhost:4173',
      'http://139.59.61.252:9090',
      'http://139.59.61.252:3000',
      'http://139.59.61.252:3001',
      'http://139.59.61.252:8080',
      // Allow all Cloudflare tunnel URLs
      /^https:\/\/.*\.trycloudflare\.com$/,
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
})

// CORS configuration - MUST be before other middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4173',
      'http://localhost:8080',
      'https://app.alpha-block.ai',
      'https://alpha-block.ai',
      'http://app.alpha-block.ai',
      'http://alpha-block.ai',
      'http://139.59.61.252:9090',
      'http://139.59.61.252:3000',
      'http://139.59.61.252:3001',
      'http://139.59.61.252:8080',
      // Allow all Cloudflare tunnel URLs
      /^https:\/\/.*\.trycloudflare\.com$/,
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
)

// Handle preflight requests
app.options('*', cors())

// Middleware
app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())

// Session middleware for OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
)

// Passport middleware
app.use(passport.initialize())
app.use(passport.session())
app.use(express.json())

// WebSocket Connection Handling
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id)

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id)
  })
})

// Function to broadcast whale transactions
export const broadcastTransaction = (data: any) => {
  console.log('📡 Broadcasting Transaction:', data)

  // Broadcast event based on transaction type
  if (data.type === 'bigWhaleTransaction') {
    io.emit('newBigWhaleTransaction', data)
  } else if (data.type === 'allWhaleTransactions') {
    io.emit('newTransaction', data)
  } else if (data.type === 'allInfluencerWhaleTransactions') {
    io.emit('newInfluencerWhaleTransaction', data)
  }
}
// export const broadcastTransaction = (data: any) => {
//   console.log("📡 Broadcasting Transaction:", data);
//   io.emit("newTransaction", { type: "allWhaleTransactions", data });
// };

let requestTokenSecret: string | null = null

if (
  !process.env.ALPHA_WHALES_X_API_KEY ||
  !process.env.ALPHA_WHALES_X_API_KEY_SECRET
) {
  throw new Error('Missing Twitter API credentials in environment variables')
}

app.get('/auth/twitter', async (req, res) => {
  try {
    const client = new TwitterApi({
      appKey: 'bfKo3LwTMuAVKSA2B2nlHfK8w',
      appSecret: 'rRndGon9PYslNBqVAuF8FY9Ux35boaTdkD7edrupy3XBAOkxeZ',
    })
    // "oob" enables PIN-based OAuth
    const authLink = await client.generateAuthLink('oob')

    requestTokenSecret = authLink.oauth_token_secret

    res.json({
      authorize_url: authLink.url,
      message:
        'Give this URL to CandyBot account. Login → Authorize → Get PIN.',
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed generating auth link' })
  }
})

app.post('/auth/twitter/pin', async (req: any, res: any) => {
  const { oauth_token, pin } = req.body

  if (!oauth_token || !pin) {
    return res.status(400).json({ error: 'oauth_token and pin required' })
  }

  if (!requestTokenSecret) {
    return res.status(400).json({
      error: 'No request token secret found. Please generate auth link first.',
    })
  }

  try {
    const client = new TwitterApi({
      appKey: 'bfKo3LwTMuAVKSA2B2nlHfK8w',
      appSecret: 'rRndGon9PYslNBqVAuF8FY9Ux35boaTdkD7edrupy3XBAOkxeZ',
      accessToken: oauth_token,
      accessSecret: requestTokenSecret,
    })

    const loginResult = await client.login(pin)

    res.json({
      message: 'Access Token for CandyBot generated successfully!',
      access_token: loginResult.accessToken,
      access_secret: loginResult.accessSecret,
      client: loginResult.client,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to exchange PIN for token' })
  }
})

app.get('/api/v1/proxy-image', async (req, res) => {
  const { url } = req.query
  try {
    const response = await fetch(url as string)
    const buffer = await response.arrayBuffer()

    res.set('Content-Type', response.headers.get('content-type') || 'image/png')
    res.set('Cache-Control', 'public, max-age=86400') // cache 1 day
    res.send(Buffer.from(buffer))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch image' })
  }
})

app.get('/trigger-kol-update', async (req, res) => {
  try {
    await updateKolProfileInfo()
    res.send('✅ KOL profile update triggered manually.')
  } catch (err) {
    res.status(500).send('❌ Error triggering update: ' + err)
  }
})

// Process status endpoint
app.get('/api/v1/processes/status', (req, res) => {
  try {
    const status = processManager.getStatus()
    const processes = processManager.getAllProcesses()

    res.status(200).json({
      message: 'Server process status retrieved successfully',
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      },
      backgroundProcesses: status,
      processes: processes.map((p) => ({
        id: p.id,
        type: p.type,
        description: p.description,
      })),
    })
  } catch (error) {
    console.error('❌ Error getting server process status:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

// Routes
app.get('/findWhaleTokens/:whaleAddress', async (req, res) => {
  try {
    const whaleAddress = req.params.whaleAddress
    const result = await findWhaleTokens(whaleAddress)
    if (result) {
      res.status(200).json(result)
    } else {
      res
        .status(404)
        .json({ message: 'No tokens found for the given whale address' })
    }
  } catch (error) {
    console.error('Error fetching whale tokens:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})
app.get('/getTokenData/:tokenAddress', async (req, res) => {
  try {
    const tokenAddress = req.params.tokenAddress
    // Assuming getTokenData is a function that fetches token data
    const result = await getTokenData(tokenAddress)
    if (result) {
      res.status(200).json(result)
    } else {
      res
        .status(404)
        .json({ message: 'Token data not found for the given address' })
    }
  } catch (error) {
    console.error('Error fetching token data:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

app.get("/parseWalletData", async (req: any, res: any) => {
  const { signature, walletAddress } = req.query;

  if (!signature || !walletAddress) {
    return res.status(400).json({ error: 'Missing signature or walletAddress' });
  }

  try {
    const signatureData = JSON.stringify({ signature, walletAddress });
    const result = await processWalletSignature(signatureData);
    res.status(200).json({ message: 'Wallet data processed successfully', result });
  } catch (error) {
    console.error('Error processing wallet data:', error);
    res.status(500).json({ error: 'Failed to process wallet data' });
  }
});
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/token', tokenRouter)
app.use('/api/v1/insight', insightRouter)
app.use('/api/v1/whale', whaleRouter)
app.use('/api/v1/influencer', influencerWhaleRouter)
app.use('/api/v1/transactions', transactionRouter)
app.use('/api/v1/trending-tokens', trendingTokensRouter)
app.use('/api/v1/top-coins', topCoinsRouter)
app.use('/api/v1/top-coins-kol', topCoinsKolRouter)
app.use('/api/v1/search-history', searchHistoryRouter)
app.use('/api/v1/wallet', walletRouter)
app.use('/api/v1/trade', tradeRouter)
app.use('/api/v1/admin', adminRouter)
app.use('/api/v1/alerts', alertRouter)

// Global error handler - catches any unhandled errors from routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🚨 Global Error Handler:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
});

const redisClient = createClient({
  socket: { 
    host: process.env.REDIS_HOST || 'localhost', 
    port: parseInt(process.env.REDIS_PORT || '6379') 
  },
})

let server: any

redisClient
  .connect()

  .then(() => console.log('🔵 Redis connected'))

  .catch((err: any) => console.error('❌ Redis connection error:', err))

redisClient.on('ready', async () => {
  console.log('✅ Redis is ready, starting server...')

  // server = app.listen(PORT, async () => {
  server = wss.listen(PORT, async () => {
    console.log(`🚀 Server is running on port ${PORT}`)

    try {
      await connectDB() // Connect to MongoDB

      // Initialize Telegram service
      try {
        await telegramService.initialize()
        console.log('✅ Telegram service initialized')
      } catch (error) {
        console.error('⚠️ Telegram service initialization failed:', error)
        // Continue server startup even if Telegram fails
      }

      // Initialize Alert Matcher service
      try {
        await alertMatcherService.initialize()
        console.log('✅ Alert Matcher service initialized')
      } catch (error) {
        console.error('⚠️ Alert Matcher service initialization failed:', error)
        // Continue server startup even if Alert Matcher fails
      }

      // Initialize Balance Validator service
      try {
        await balanceValidatorService.start()
        console.log('✅ Balance Validator service started (hourly checks enabled)')
      } catch (error) {
        console.error('⚠️ Balance Validator service initialization failed:', error)
        // Continue server startup even if Balance Validator fails
      }

      // Register the server with process manager
      registerServer('http-server', 'HTTP/WebSocket server', server)
      console.log('✅ Server registered with process manager')

      // Auto-start whale & KOL monitors (fixes prod showing fewer txns after restarts)
      scheduleWhaleMonitorBootstrap(PORT)
    } catch (error: any) {
      console.error('❌ Error initializing services:', error)
    }
  })
})

// Graceful shutdown and memory cleanup
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...')
  await performShutdown('SIGTERM')
})

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully...')
  await performShutdown('SIGINT')
})

// Additional shutdown signals
process.on('SIGQUIT', async () => {
  console.log('🔄 SIGQUIT received, shutting down gracefully...')
  await performShutdown('SIGQUIT')
})

process.on('SIGHUP', async () => {
  console.log('🔄 SIGHUP received, shutting down gracefully...')
  await performShutdown('SIGHUP')
})

// ==================================================
// 🧟 ZOMBIE MODE: Log errors but NEVER STOP
// ==================================================
process.on('uncaughtException', (error) => {
  console.error('⚠️ [IGNORED] Uncaught Exception:', error)
  // Intentional: We are NOT calling performShutdown() to keep the server alive
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [IGNORED] Unhandled Rejection:', reason)
  // Intentional: We are NOT calling performShutdown() to keep the server alive
})

// Shutdown function
async function performShutdown(signal: string) {
  try {
    console.log(`🔄 Starting shutdown process for ${signal}...`)

    // Set a timeout for the entire shutdown process
    const shutdownTimeout = setTimeout(() => {
      console.log('⏰ Shutdown timeout reached, forcing exit...')
      process.exit(1)
    }, 15000) // 15 seconds total timeout

    // Clean up all background processes
    await processManager.cleanupAll()

    // Shutdown Telegram service
    try {
      await telegramService.shutdown()
      console.log('✅ Telegram service shutdown completed')
    } catch (error) {
      console.error('⚠️ Error shutting down Telegram service:', error)
    }

    // Shutdown Alert Matcher service
    try {
      await alertMatcherService.shutdown()
      console.log('✅ Alert Matcher service shutdown completed')
    } catch (error) {
      console.error('⚠️ Error shutting down Alert Matcher service:', error)
    }

    // Shutdown Balance Validator service
    try {
      await balanceValidatorService.stop()
      console.log('✅ Balance Validator service shutdown completed')
    } catch (error) {
      console.error('⚠️ Error shutting down Balance Validator service:', error)
    }

    // Force garbage collection
    if (global.gc) {
      global.gc()
      console.log('🧹 Garbage collection completed')
    }

    // Close server with timeout
    if (server) {
      const serverClosePromise = new Promise<void>((resolve) => {
        server.close(() => {
          console.log('✅ Server closed successfully')
          resolve()
        })
      })

      // Wait for server to close with timeout
      await Promise.race([
        serverClosePromise,
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])
    }

    // Clear the shutdown timeout
    clearTimeout(shutdownTimeout)

    console.log('✅ Shutdown completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)

    // Emergency cleanup as last resort
    try {
      processManager.emergencyCleanup()
    } catch (emergencyError) {
      console.error('💥 Emergency cleanup also failed:', emergencyError)
    }

    // Force exit
    process.exit(1)
  }
}
