import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, extractTokenFromHeader } from '../utils/jwt'
import logger from '../utils/logger'

/**
 * Authentication middleware
 * Verifies JWT access token and attaches userId to request
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token required',
      })
      return
    }

    // Verify token
    const payload = verifyAccessToken(token)

    if (!payload) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired access token',
      })
      return
    }

    // Attach userId to request
    ;(req as any).userId = payload.userId
    ;(req as any).authType = payload.authType

    next()
  } catch (error) {
    logger.error({
      component: 'AuthMiddleware',
      operation: 'authenticate',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    })

    res.status(401).json({
      success: false,
      message: 'Authentication failed',
    })
  }
}
