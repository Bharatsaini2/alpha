import crypto from 'crypto'
import { OTPSession } from '../models/otpSession.model'
import { sendOTPEmail } from '../config/email'

export interface OTPResult {
  success: boolean
  message: string
  otpId?: string
}

export interface OTPVerificationResult {
  success: boolean
  message: string
  isValid: boolean
}

// Generate 6-digit OTP
const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString()
}

// Check rate limiting for OTP requests
const checkRateLimit = async (email: string): Promise<boolean> => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  const recentOTPs = await OTPSession.countDocuments({
    email,
    createdAt: { $gte: fiveMinutesAgo },
  })

  // Allow max 3 OTP requests per email per 5 minutes
  return recentOTPs < 3
}

// Send OTP via email
export const sendOTP = async (email: string): Promise<OTPResult> => {
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return {
        success: false,
        message: 'Invalid email format',
      }
    }

    // Check rate limiting
    const isWithinRateLimit = await checkRateLimit(email)
    if (!isWithinRateLimit) {
      return {
        success: false,
        message:
          'Too many OTP requests. Please wait 5 minutes before requesting again.',
      }
    }

    // Generate OTP
    const otpCode = generateOTP()

    // Set expiration time (5 minutes from now)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    // Save OTP session to database
    const otpSession = new OTPSession({
      email,
      otpCode,
      expiresAt,
    })

    await otpSession.save()

    // Send email
    const emailSent = await sendOTPEmail(email, otpCode)

    if (!emailSent) {
      // If email fails, remove the OTP session
      await OTPSession.findByIdAndDelete(otpSession._id)
      return {
        success: false,
        message: 'Failed to send OTP email. Please try again.',
      }
    }

    return {
      success: true,
      message: 'OTP sent successfully to your email',
      otpId: otpSession._id.toString(),
    }
  } catch (error) {
    console.error('❌ Error sending OTP:', error)
    return {
      success: false,
      message: 'Internal server error. Please try again.',
    }
  }
}

// Verify OTP
export const verifyOTP = async (
  email: string,
  otpCode: string,
): Promise<OTPVerificationResult> => {
  try {
    // Find the OTP session
    const otpSession = await OTPSession.findOne({
      email,
      otpCode,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (!otpSession) {
      return {
        success: false,
        message: 'Invalid or expired OTP code',
        isValid: false,
      }
    }

    // Check attempt limit
    if (otpSession.attempts >= 3) {
      await OTPSession.findByIdAndUpdate(otpSession._id, { isUsed: true })
      return {
        success: false,
        message: 'Too many failed attempts. Please request a new OTP.',
        isValid: false,
      }
    }

    // Increment attempts
    await OTPSession.findByIdAndUpdate(otpSession._id, {
      $inc: { attempts: 1 },
      isUsed: true,
    })

    return {
      success: true,
      message: 'OTP verified successfully',
      isValid: true,
    }
  } catch (error) {
    console.error('❌ Error verifying OTP:', error)
    return {
      success: false,
      message: 'Internal server error. Please try again.',
      isValid: false,
    }
  }
}

// Clean up expired OTP sessions (can be called periodically)
export const cleanupExpiredOTPs = async (): Promise<void> => {
  try {
    const result = await OTPSession.deleteMany({
      $or: [{ expiresAt: { $lt: new Date() } }, { isUsed: true }],
    })
    console.log(`🧹 Cleaned up ${result.deletedCount} expired OTP sessions`)
  } catch (error) {
    console.error('❌ Error cleaning up expired OTPs:', error)
  }
}

export default {
  sendOTP,
  verifyOTP,
  cleanupExpiredOTPs,
}
