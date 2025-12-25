import express from 'express'
import {
  getAllInfluencerWhaleTransactions,
  getInfluencerSignatureDetails,
  getInfluencerWhaleLatestTransactions,
  getQueueStats,
  visualizeKols,
  visualizeKolsV2,
} from '../controllers/influencer.controller'
import { registerInterval, processManager } from '../config/processManager'

const PROCESSING_INTERVAL_MS = 10000
let isInfluencerCronJobStarted = false

const influencerWhaleRouter = express.Router()

influencerWhaleRouter.get(
  '/influencer-latest-transactions',
  getInfluencerWhaleLatestTransactions,
)

// Parse signatures and tweet
influencerWhaleRouter.get(
  '/parse-influencer-signatures',
  (req: any, res: any) => {
    if (isInfluencerCronJobStarted) {
      console.log('✅ Signature parsing cron job is already active.')
      return res.status(200).json({
        status: 'active',
        message: 'Signature parsing cron job is already running.',
      })
    }

    // Set flag and respond immediately
    isInfluencerCronJobStarted = true
    console.log('🚀 Initializing signature parsing cron job...')
    res.status(202).json({
      status: 'initializing',
      message:
        'Request accepted. Starting signature parsing job in the background.',
    })
    ;(async () => {
      try {
        console.log('Immediately executing getSignatureDetails...')
        await getInfluencerSignatureDetails()

        const interval = setInterval(async () => {
          if (processManager.isServerShuttingDown()) {
            console.log(
              '🛑 Server shutting down, stopping signature processing',
            )
            clearInterval(interval)
            return
          }
          console.log('[Background] Running scheduled signature parse...')
          await getInfluencerSignatureDetails()
        }, PROCESSING_INTERVAL_MS) // 10 seconds in milliseconds (10000s)

        // Register the interval with the process manager
        registerInterval(
          'signature-processing-interval-kol',
          'Signature processing interval (10 seconds) kol',
          interval,
        )
      } catch (error) {
        console.error('Error in /parse-signatures endpoint:', error)
        isInfluencerCronJobStarted = true
      }
    })()
  },
)

influencerWhaleRouter.get('/queue-stats', async (req: any, res: any) => {
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

influencerWhaleRouter.get(
  '/influencer-whale-transactions',
  async (req, res) => {
    try {
      console.log('✅ GET /influencer-whale-transactions hit')

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 50

      // Extract filter parameters
      const filters = {
        searchQuery: (req.query.search as string) || undefined,
        searchType:
          (req.query.searchType as 'kol' | 'coin' | 'all') || undefined,
        hotness: (req.query.hotness as string) || null,
        transactionType: (req.query.type as string) || null,
        amount: (req.query.amount as string) || null,
        // NEW FILTERS
        ageMin: (req.query.ageMin as string) || null,
        ageMax: (req.query.ageMax as string) || null,
        marketCapMin: (req.query.marketCapMin as string) || null,
        marketCapMax: (req.query.marketCapMax as string) || null,
      }

      console.log('🔍 Filters received:', filters)

      const result = await getAllInfluencerWhaleTransactions(
        page,
        limit,
        filters,
      )

      console.log(
        `📦 Page ${result.page} | Found: ${result.transactions.length} / ${result.total}`,
      )

      res.status(200).json(result)
    } catch (error) {
      console.error('❌ Error fetching whale transactions:', error)
      res.status(500).json({ message: 'Internal Server Error' })
    }
  },
)

influencerWhaleRouter.get('/visualize-kols', visualizeKolsV2)

export default influencerWhaleRouter
