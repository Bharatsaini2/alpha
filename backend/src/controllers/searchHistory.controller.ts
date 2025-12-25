import { Request, Response } from 'express'
import { searchHistoryModel } from '../models/searchHistory.model'

// Get user's search history
export const getSearchHistory = async (req: Request, res: Response) => {
  try {
    const { userId, sessionId, page, limit = 20 } = req.query

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Either userId or sessionId is required',
      })
    }

    const query: any = {}
    if (userId) query.userId = userId
    if (sessionId) query.sessionId = sessionId
    if (page) query.page = page

    const history = await searchHistoryModel
      .find(query)
      .sort({ lastUsed: -1, frequency: -1 })
      .limit(parseInt(limit as string) || 20)
      .lean()

    res.json({
      success: true,
      data: history,
    })
  } catch (error) {
    console.error('❌ Error fetching search history:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch search history',
    })
  }
}

// Save search query to history
export const saveSearchHistory = async (req: Request, res: Response) => {
  try {
    const { userId, sessionId, query, searchType, page, tokens } = req.body

    if (!query || !searchType || !page) {
      return res.status(400).json({
        success: false,
        message: 'query, searchType, and page are required',
      })
    }

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Either userId or sessionId is required',
      })
    }

    // Check if this exact search already exists
    const existingQuery: any = { query, searchType, page }
    if (userId) existingQuery.userId = userId
    if (sessionId) existingQuery.sessionId = sessionId

    const existing = await searchHistoryModel.findOne(existingQuery)

    if (existing) {
      // Update frequency and lastUsed
      await searchHistoryModel.updateOne(
        { _id: existing._id },
        {
          $inc: { frequency: 1 },
          $set: { lastUsed: new Date() },
        },
      )
    } else {
      // Create new history entry
      await searchHistoryModel.create({
        userId,
        sessionId,
        query: query.trim(),
        searchType,
        tokens: tokens || [], // Store token array if provided
        page,
        frequency: 1,
        lastUsed: new Date(),
      })
    }

    res.json({
      success: true,
      message: 'Search history saved successfully',
    })
  } catch (error) {
    console.error('❌ Error saving search history:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to save search history',
    })
  }
}

// Delete specific search history item
export const deleteSearchHistoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { userId, sessionId } = req.query

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Either userId or sessionId is required',
      })
    }

    const query: any = { _id: id }
    if (userId) query.userId = userId
    if (sessionId) query.sessionId = sessionId

    const result = await searchHistoryModel.deleteOne(query)

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Search history item not found',
      })
    }

    res.json({
      success: true,
      message: 'Search history item deleted successfully',
    })
  } catch (error) {
    console.error('❌ Error deleting search history item:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete search history item',
    })
  }
}

// Clear all search history for user
export const clearSearchHistory = async (req: Request, res: Response) => {
  try {
    const { userId, sessionId, page } = req.query

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Either userId or sessionId is required',
      })
    }

    const query: any = {}
    if (userId) query.userId = userId
    if (sessionId) query.sessionId = sessionId
    if (page) query.page = page

    const result = await searchHistoryModel.deleteMany(query)

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} search history items`,
    })
  } catch (error) {
    console.error('❌ Error clearing search history:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to clear search history',
    })
  }
}

// Get search suggestions based on history and current query
export const getSearchSuggestions = async (req: Request, res: Response) => {
  try {
    const { q, userId, sessionId, page, searchType, limit = 10 } = req.query

    if (!q || typeof q !== 'string' || q.trim().length < 1) {
      return res.json({ suggestions: [] })
    }

    const searchQuery = q.trim().toLowerCase()
    const queryLimit = Math.min(parseInt(limit as string) || 10, 20)

    // Build query for search history
    const historyQuery: any = {
      $or: [{ query: { $regex: searchQuery, $options: 'i' } }],
    }

    if (userId) historyQuery.userId = userId
    if (sessionId) historyQuery.sessionId = sessionId
    if (page) historyQuery.page = page
    if (searchType) historyQuery.searchType = searchType

    // Get matching history items
    const historyItems = await searchHistoryModel
      .find(historyQuery)
      .sort({ frequency: -1, lastUsed: -1 })
      .limit(queryLimit)
      .lean()

    // Format suggestions
    const suggestions = historyItems.map((item) => ({
      type: 'history',
      label: item.query,
      searchType: item.searchType,
      frequency: item.frequency,
      lastUsed: item.lastUsed,
      page: item.page,
    }))

    res.json({
      success: true,
      suggestions,
    })
  } catch (error) {
    console.error('❌ Error fetching search suggestions:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch search suggestions',
    })
  }
}
