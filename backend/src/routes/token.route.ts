import express from 'express'

import {
  addInfluencerList,
  addTokenList,
} from '../controllers/token.controller'
import { getKolProfileFollower } from '../services/KolProfileFollower'

const tokenRouter = express.Router()

// tokenRouter.get('/all-whale-addresses', getTokensHolders)

tokenRouter.get('/add-token-whales', addTokenList)
tokenRouter.get('/add-influencer-whales', addInfluencerList)
tokenRouter.get('/get-kol-profile-follower', getKolProfileFollower)

export default tokenRouter
