import express from 'express'
import { getTrendingTokens } from '../controllers/trendingTokens.controller'

const router = express.Router()

router.get('/', getTrendingTokens)

export default router
