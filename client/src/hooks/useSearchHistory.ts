import { useState, useEffect, useCallback } from "react"
import axios from "axios"
import { useAuth } from "../contexts/AuthContext"

const BASE_URL =
  import.meta.env.VITE_SERVER_URL || "https://api.alpha-block.ai/api/v1"

export interface SearchHistoryItem {
  _id: string
  query: string
  searchType: "coin" | "kol" | "whale" | "all"
  tokens: Array<{
    value: string
    type: "coin" | "kol" | "whale" | "mixed"
    label: string
    imageUrl?: string
    symbol?: string
    name?: string
    address?: string
    username?: string // For KOL tokens
  }>
  timestamp: string
  frequency: number
  lastUsed: string
  page: string
}

interface UseSearchHistoryOptions {
  page: string
  enabled?: boolean
}

export const useSearchHistory = ({
  page,
  enabled = true,
}: UseSearchHistoryOptions) => {
  const [history, setHistory] = useState<SearchHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, isAuthenticated } = useAuth()

  // Generate session ID for anonymous users
  const getSessionId = useCallback(() => {
    // Try to get from localStorage
    let storedSessionId = localStorage.getItem("searchHistorySessionId")
    if (!storedSessionId) {
      storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem("searchHistorySessionId", storedSessionId)
    }
    return storedSessionId
  }, [])

  // Fetch search history
  const fetchHistory = useCallback(async () => {
    if (!enabled) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page,
        limit: "20",
      })

      if (isAuthenticated && user?.id) {
        params.append("userId", user.id)
      } else {
        params.append("sessionId", getSessionId())
      }

      const response = await axios.get(
        `${BASE_URL}/search-history?${params}`
      )

      if (response.data.success) {
        setHistory(response.data.data)
      } else {
        setError("Failed to fetch search history")
      }
    } catch (err: any) {
      console.error("Error fetching search history:", err)
      setError(err.response?.data?.message || "Failed to fetch search history")
    } finally {
      setLoading(false)
    }
  }, [page, user?.id, isAuthenticated, getSessionId, enabled])

  // Save search query to history
  const saveSearch = useCallback(
    async (
      query: string,
      searchType: "coin" | "kol" | "whale" | "all",
      tokens?: Array<{
        value: string
        type: "coin" | "kol" | "whale" | "mixed"
        label: string
        imageUrl?: string
        symbol?: string
        name?: string
        address?: string
        username?: string
      }>
    ) => {
      if (!enabled || !query.trim()) return

      try {
        const payload: any = {
          query: query.trim(),
          searchType,
          page,
          tokens: tokens || [],
        }

        if (isAuthenticated && user?.id) {
          payload.userId = user.id
        } else {
          payload.sessionId = getSessionId()
        }

        await axios.post(`${BASE_URL}/search-history`, payload)

        // Refresh history after saving
        fetchHistory()
      } catch (err: any) {
        console.error("Error saving search history:", err)
        // Don't show error to user for save operations
      }
    },
    [page, user?.id, isAuthenticated, getSessionId, enabled, fetchHistory]
  )

  // Delete specific history item
  const deleteHistoryItem = useCallback(
    async (id: string) => {
      try {
        const params = new URLSearchParams()
        if (isAuthenticated && user?.id) {
          params.append("userId", user.id)
        } else {
          params.append("sessionId", getSessionId())
        }

        await axios.delete(`${BASE_URL}/search-history/${id}?${params}`)

        // Remove from local state
        setHistory((prev) => prev.filter((item) => item._id !== id))
      } catch (err: any) {
        console.error("Error deleting search history item:", err)
        setError(
          err.response?.data?.message || "Failed to delete search history item"
        )
      }
    },
    [user?.id, isAuthenticated, getSessionId]
  )

  // Clear all search history
  const clearHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page })
      if (isAuthenticated && user?.id) {
        params.append("userId", user.id)
      } else {
        params.append("sessionId", getSessionId())
      }

      await axios.delete(`${BASE_URL}/search-history?${params}`)

      // Clear local state
      setHistory([])
    } catch (err: any) {
      console.error("Error clearing search history:", err)
      setError(err.response?.data?.message || "Failed to clear search history")
    }
  }, [page, user?.id, isAuthenticated, getSessionId])

  // Get search suggestions based on history
  const getSuggestions = useCallback(
    async (query: string, searchType?: "coin" | "kol" | "whale" | "all") => {
      if (!enabled || !query.trim()) return []

      try {
        const params = new URLSearchParams({
          q: query.trim(),
          page,
          limit: "10",
        })

        if (isAuthenticated && user?.id) {
          params.append("userId", user.id)
        } else {
          params.append("sessionId", getSessionId())
        }

        if (searchType) {
          params.append("searchType", searchType)
        }

        const response = await axios.get(
          `${BASE_URL}/search-history/suggestions?${params}`
        )

        if (response.data.success) {
          return response.data.suggestions
        }
        return []
      } catch (err: any) {
        console.error("Error fetching search suggestions:", err)
        return []
      }
    },
    [page, user?.id, isAuthenticated, getSessionId, enabled]
  )

  // Load history on mount
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return {
    history,
    loading,
    error,
    saveSearch,
    deleteHistoryItem,
    clearHistory,
    getSuggestions,
    refreshHistory: fetchHistory,
  }
}
