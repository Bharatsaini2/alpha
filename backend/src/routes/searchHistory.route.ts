import express from 'express'
import {
  getSearchHistory,
  saveSearchHistory,
  deleteSearchHistoryItem,
  clearSearchHistory,
  getSearchSuggestions,
} from '../controllers/searchHistory.controller'

const searchHistoryRouter = express.Router()

// Get user's search history
searchHistoryRouter.get('/', getSearchHistory as any)

// Save search query to history
searchHistoryRouter.post('/', saveSearchHistory as any)

// Get search suggestions based on history
searchHistoryRouter.get('/suggestions', getSearchSuggestions as any)

// Delete specific search history item
searchHistoryRouter.delete('/:id', deleteSearchHistoryItem as any)

// Clear all search history
searchHistoryRouter.delete('/', clearSearchHistory as any)

export default searchHistoryRouter
