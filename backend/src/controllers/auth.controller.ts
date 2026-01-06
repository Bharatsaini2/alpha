import crypto from 'crypto'
import { Request, Response } from 'express'
import { User } from '../models/user.model'
import { UserAuthMethod } from '../models/userAuthMethod.model'
import { UserSession } from '../models/userSession.model'
import {
  generateTokenPair,
  hashRefreshToken,
  extractTokenFromHeader,
  verifyRefreshToken,
  verifyAccessToken,
} from '../utils/jwt'
import { sendOTP, verifyOTP } from '../services/otpService'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import dotenv from 'dotenv'
dotenv.config()

// Email + OTP Authentication
export const requestOTP = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      })
    }

    const result = await sendOTP(email)

    if (!result.success) {
      return res.status(400).json(result)
    }

    res.status(200).json({
      success: true,
      message: result.message,
    })
  },
)

export const verifyOTPAndLogin = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { email, otpCode } = req.body

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP code are required',
      })
    }

    // Verify OTP
    const otpResult = await verifyOTP(email, otpCode)

    if (!otpResult.success || !otpResult.isValid) {
      return res.status(400).json({
        success: false,
        message: otpResult.message,
      })
    }

    // Find or create user
    let user = await User.findOne({ email })

    if (!user) {
      user = new User({
        email,
        emailVerified: true,
      })
      await user.save()
    } else {
      // Update last login
      user.lastLogin = new Date()
      user.emailVerified = true
      await user.save()
    }

    // Create or update auth method
    await UserAuthMethod.findOneAndUpdate(
      { userId: user._id, authType: 'email', providerId: email },
      {
        userId: user._id,
        authType: 'email',
        providerId: email,
        isPrimary: true,
      },
      { upsert: true, new: true },
    )

    // Generate tokens
    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      authType: 'email' as const,
    }

    const { accessToken, refreshToken } = generateTokenPair(tokenPayload)

    // Hash and store refresh token
    const refreshTokenHash = await hashRefreshToken(refreshToken)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await UserSession.create({
      userId: user._id,
      refreshTokenHash,
      deviceInfo: {
        userAgent: req.get('User-Agent'),
      },
      ipAddress: req.ip,
      expiresAt,
    })

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          avatar: user.avatar,
        },
        accessToken,
        refreshToken,
      },
    })
  },
)

// Phantom Wallet Authentication
export const requestPhantomNonce = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { walletAddress } = req.body

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address is required',
      })
    }

    // Validate Solana wallet address format (basic validation)
    if (walletAddress.length < 32 || walletAddress.length > 44) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format',
      })
    }

    // Generate nonce for signature
    const nonce = crypto.randomBytes(32).toString('base64')
    const message = `Sign this message to authenticate with Alpha AI.\n\nNonce: ${nonce}\nWallet: ${walletAddress}`

    // Store nonce temporarily (you might want to use Redis for this)
    // For now, we'll include it in the response
    res.status(200).json({
      success: true,
      data: {
        nonce,
        message,
      },
    })
  },
)

export const verifyPhantomSignature = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { walletAddress, signature, message } = req.body

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address, signature, and message are required',
      })
    }

    // TODO: Implement actual signature verification using @solana/web3.js
    // For now, we'll assume the signature is valid if provided

    // Find or create user
    let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() })

    if (!user) {
      user = new User({
        walletAddress: walletAddress.toLowerCase(), // Lowercase for lookups
        walletAddressOriginal: walletAddress, // Original case for Solana operations
      })
      await user.save()
    } else {
      // Update last login and save original wallet address if not already saved
      user.lastLogin = new Date()
      if (!user.walletAddressOriginal) {
        user.walletAddressOriginal = walletAddress
      }
      await user.save()
    }

    // Create or update auth method
    await UserAuthMethod.findOneAndUpdate(
      { userId: user._id, authType: 'phantom', providerId: walletAddress },
      {
        userId: user._id,
        authType: 'phantom',
        providerId: walletAddress,
        providerData: {
          walletAddress,
          publicKey: walletAddress,
        },
        isPrimary: true,
      },
      { upsert: true, new: true },
    )

    // Generate tokens
    const tokenPayload = {
      userId: user._id.toString(),
      walletAddress: user.walletAddress,
      authType: 'phantom' as const,
    }

    const { accessToken, refreshToken } = generateTokenPair(tokenPayload)

    // Hash and store refresh token
    const refreshTokenHash = await hashRefreshToken(refreshToken)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await UserSession.create({
      userId: user._id,
      refreshTokenHash,
      deviceInfo: {
        userAgent: req.get('User-Agent'),
      },
      ipAddress: req.ip,
      expiresAt,
    })

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          avatar: user.avatar,
        },
        accessToken,
        refreshToken,
      },
    })
  },
)

// Token refresh
export const refreshToken = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found',
      })
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken)
    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      })
    }

    // Find user session
    const refreshTokenHash = await hashRefreshToken(refreshToken)
    const session = await UserSession.findOne({
      userId: payload.userId,
      refreshTokenHash,
      expiresAt: { $gt: new Date() },
    })

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      })
    }

    // Find user
    const user = await User.findById(payload.userId)
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive',
      })
    }

    // Generate new tokens
    const newTokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      walletAddress: user.walletAddress,
      authType: payload.authType,
    }

    const { accessToken, refreshToken: newRefreshToken } =
      generateTokenPair(newTokenPayload)

    // Update session with new refresh token
    const newRefreshTokenHash = await hashRefreshToken(newRefreshToken)
    session.refreshTokenHash = newRefreshTokenHash
    session.lastUsed = new Date()
    await session.save()

    // Set new refresh token as httpOnly cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    })
  },
)

// Logout
export const logout = catchAsyncErrors(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken

  if (refreshToken) {
    // Find and delete session
    const refreshTokenHash = await hashRefreshToken(refreshToken)
    await UserSession.findOneAndDelete({ refreshTokenHash })
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken')

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  })
})

// Get current user
export const getCurrentUser = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      })
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
      })
    }

    const user = await User.findById(payload.userId)
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive',
      })
    }

    // Get user auth methods
    const authMethods = await UserAuthMethod.find({ userId: user._id })

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          avatar: user.avatar,
          lastLogin: user.lastLogin,
          telegramChatId: user.telegramChatId,
        },
        authMethods: authMethods.map((method) => ({
          type: method.authType,
          providerId: method.providerId,
          isPrimary: method.isPrimary,
          connectedAt: method.createdAt,
        })),
      },
    })
  },
)

// Get user by ID (for OAuth callback)
export const getUserById = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const token = extractTokenFromHeader(req.headers.authorization)
    const { userId } = req.params

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      })
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
      })
    }

    // Verify the token belongs to the requested user
    if (payload.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      })
    }

    const user = await User.findById(userId)
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive',
      })
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          avatar: user.avatar,
          lastLogin: user.lastLogin,
        },
      },
    })
  },
)
