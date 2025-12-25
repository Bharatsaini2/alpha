import express from 'express'
import {
  getAllWhaleTransactions,
  getLatestWhaleAlert,
  getSignatureDetails,
  getWhaleAddressesCount,
  getWhaleLabels,
  getWhaleLatestTransactions,
  visualizeWhales,
  getCoinSuggestions,
  getQueueStats,
} from '../controllers/whale.controller'
import whaleAllTransactionModel from '../models/whale-all-transactions.model'
import { registerInterval, processManager } from '../config/processManager'

const PROCESSING_INTERVAL_MS = 10000
let isCronJobStarted = false

const whaleRouter = express.Router()

//get large transactions from redis
whaleRouter.get('/count-total-whale-addresses', getWhaleAddressesCount)
whaleRouter.get('/large-transactions', getWhaleLatestTransactions)

// Parse signatures and tweet
whaleRouter.get('/parse-signatures', (req: any, res: any) => {
  if (isCronJobStarted) {
    console.log('✅ Signature parsing cron job is already active.')
    return res.status(200).json({
      status: 'active',
      message: 'Signature parsing cron job is already running.',
    })
  }

  // Set flag and respond immediately
  isCronJobStarted = true
  console.log('🚀 Initializing signature parsing cron job...')
  res.status(202).json({
    status: 'initializing',
    message:
      'Request accepted. Starting signature parsing job in the background.',
  })
  ;(async () => {
    try {
      console.log('Immediately executing getSignatureDetails...')
      await getSignatureDetails()

      console.log('Starting interval to run every 10 seconds...')
      const interval = setInterval(async () => {
        if (processManager.isServerShuttingDown()) {
          console.log('🛑 Server shutting down, stopping signature processing')
          clearInterval(interval)
          return
        }
        console.log('[Background] Running scheduled signature parse...')
        await getSignatureDetails()
      }, PROCESSING_INTERVAL_MS) // 10 seconds in milliseconds (10000s)

      // Register the interval with the process manager
      registerInterval(
        'signature-processing-interval',
        'Signature processing interval (15 seconds)',
        interval,
      )

      console.log('✅ [Background] Signature parsing cron job is now active.')
    } catch (error) {
      console.error('Error in /parse-signatures endpoint:', error)
      isCronJobStarted = false
    }
  })()
})

whaleRouter.get('/queue-stats', async (req: any, res: any) => {
  try {
    const stats = await getQueueStats()

    res.json({
      status: 'success',
      data: {
        queue: stats,
        processing_info: {
          total_waiting: stats.waiting,
          total_active: stats.active,
          total_completed: stats.completed,
          total_failed: stats.failed,
        },
      },
    })
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message })
  }
})

// GET all whale transactions
// whaleRouter.get('/whale-transactions', async (req, res) => {
//   try {
//     console.log('✅ GET /whale-transactions hit')
//     const transactions = await getAllWhaleTransactions()
//     console.log('📦 Transactions found:', transactions?.length)

//     res.status(200).json(transactions)
//   } catch (error) {
//     console.error('❌ Error fetching whale transactions:', error)
//     res.status(500).json({ message: 'Internal Server Error' })
//   }
// })

// GET /whale-transactions?page=1&limit=50&search=...&hotness=...&type=...&tags=...&amount=...
whaleRouter.get('/whale-transactions', async (req, res) => {
  try {
    console.log('✅ GET /whale-transactions hit')

    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50

    // Extract filter parameters
    const filters = {
      searchQuery: (req.query.search as string) || undefined,
      searchType:
        (req.query.searchType as 'coin' | 'whale' | 'all') || undefined,
      hotness: (req.query.hotness as string) || null,
      transactionType: (req.query.type as string) || null,
      tags: req.query.tags
        ? (req.query.tags as string).split(',').filter((tag) => tag.trim())
        : [],
      amount: (req.query.amount as string) || null,
      // NEW FILTERS
      ageMin: (req.query.ageMin as string) || null,
      ageMax: (req.query.ageMax as string) || null,
      marketCapMin: (req.query.marketCapMin as string) || null,
      marketCapMax: (req.query.marketCapMax as string) || null,
    }

    console.log('🔍 Filters received:', filters)

    const result = await getAllWhaleTransactions(page, limit, filters)

    console.log(
      `📦 Page ${result.page} | Found: ${result.transactions.length} / ${result.total}`,
    )

    res.status(200).json(result)
  } catch (error) {
    console.error('❌ Error fetching whale transactions:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

// Latest Whale Alert
whaleRouter.get('/latest-whale-transactions', async (req, res) => {
  try {
    console.log('✅ GET /latest-whale-transactions hit')
    const transactions = await getLatestWhaleAlert()

    res.status(200).json(transactions)
  } catch (error) {
    console.error('❌ Error in /latest-whale-transactions:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

// Process status endpoint
whaleRouter.get('/process-status', async (req, res) => {
  try {
    const status = processManager.getStatus()
    const processes = processManager.getAllProcesses()

    res.status(200).json({
      message: 'Process status retrieved successfully',
      status,
      processes: processes.map((p) => ({
        id: p.id,
        type: p.type,
        description: p.description,
      })),
    })
  } catch (error) {
    console.error('❌ Error getting process status:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

whaleRouter.post('/api/whale-transaction', async (req, res) => {
  try {
    const transaction = await whaleAllTransactionModel.create(req.body)
    res.status(201).json(transaction)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

//get the whale Labels
whaleRouter.get('/whale-labels/:address', getWhaleLabels)
whaleRouter.get('/visualize-whales', visualizeWhales)

// Coin suggestions endpoint
whaleRouter.get('/coin-suggestions', getCoinSuggestions as any)

export default whaleRouter
