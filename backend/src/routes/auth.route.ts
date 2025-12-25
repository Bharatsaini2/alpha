import express from 'express'
import {
  requestOTP,
  verifyOTPAndLogin,
  requestPhantomNonce,
  verifyPhantomSignature,
  refreshToken,
  logout,
  getCurrentUser,
  getUserById,
} from '../controllers/auth.controller'
import {
  googleAuth,
  googleCallback,
  twitterAuth,
  twitterCallback,
} from '../controllers/oauth.controller'

const router = express.Router()

// Email + OTP routes
router.post('/request-otp', requestOTP)
router.post('/verify-otp', verifyOTPAndLogin)

// Phantom Wallet routes
router.post('/phantom/nonce', requestPhantomNonce)
router.post('/phantom/verify', verifyPhantomSignature)

// OAuth routes
router.get('/google', googleAuth)
router.get('/google/callback', googleCallback)
router.get('/twitter', twitterAuth)
router.get('/twitter/callback', twitterCallback)

// Token management routes
router.post('/refresh', refreshToken)
router.post('/logout', logout)
router.get('/me', getCurrentUser)
router.get('/user/:userId', getUserById)

export default router
