import { Request, Response, NextFunction } from 'express'
import { AlertType, Priority } from '../types/alert.types'

/**
 * Validation middleware for alert upsert endpoint
 */
export const validateAlertUpsert = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { type, priority, config } = req.body

  // Validate type
  if (!type) {
    res.status(400).json({
      success: false,
      message: 'Alert type is required',
      field: 'type',
    })
    return
  }

  if (!Object.values(AlertType).includes(type)) {
    res.status(400).json({
      success: false,
      message: `Invalid alert type. Must be one of: ${Object.values(AlertType).join(', ')}`,
      field: 'type',
    })
    return
  }

  // Validate priority if provided
  if (priority && !Object.values(Priority).includes(priority)) {
    res.status(400).json({
      success: false,
      message: `Invalid priority. Must be one of: ${Object.values(Priority).join(', ')}`,
      field: 'priority',
    })
    return
  }

  // Validate config structure if provided
  if (config) {
    if (typeof config !== 'object' || Array.isArray(config)) {
      res.status(400).json({
        success: false,
        message: 'Config must be an object',
        field: 'config',
      })
      return
    }

    // Validate type-specific config
    switch (type) {
      case AlertType.ALPHA_STREAM:
        if (config.minAmount !== undefined && typeof config.minAmount !== 'number') {
          res.status(400).json({
            success: false,
            message: 'minAmount must be a number',
            field: 'config.minAmount',
          })
          return
        }
        if (config.tokens !== undefined && !Array.isArray(config.tokens)) {
          res.status(400).json({
            success: false,
            message: 'tokens must be an array',
            field: 'config.tokens',
          })
          return
        }
        if (config.wallets !== undefined && !Array.isArray(config.wallets)) {
          res.status(400).json({
            success: false,
            message: 'wallets must be an array',
            field: 'config.wallets',
          })
          return
        }
        break

      case AlertType.WHALE_CLUSTER:
        if (config.minClusterSize !== undefined && typeof config.minClusterSize !== 'number') {
          res.status(400).json({
            success: false,
            message: 'minClusterSize must be a number',
            field: 'config.minClusterSize',
          })
          return
        }
        if (config.tokens !== undefined && !Array.isArray(config.tokens)) {
          res.status(400).json({
            success: false,
            message: 'tokens must be an array',
            field: 'config.tokens',
          })
          return
        }
        break

      case AlertType.KOL_ACTIVITY:
        if (config.kolIds !== undefined && !Array.isArray(config.kolIds)) {
          res.status(400).json({
            success: false,
            message: 'kolIds must be an array',
            field: 'config.kolIds',
          })
          return
        }
        if (config.tokens !== undefined && !Array.isArray(config.tokens)) {
          res.status(400).json({
            success: false,
            message: 'tokens must be an array',
            field: 'config.tokens',
          })
          return
        }
        break
    }
  }

  next()
}

/**
 * Validation middleware for alert ID parameter
 */
export const validateAlertId = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { alertId } = req.params

  if (!alertId) {
    res.status(400).json({
      success: false,
      message: 'Alert ID is required',
      field: 'alertId',
    })
    return
  }

  // Basic MongoDB ObjectId validation (24 hex characters)
  if (!/^[0-9a-fA-F]{24}$/.test(alertId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid alert ID format',
      field: 'alertId',
    })
    return
  }

  next()
}
