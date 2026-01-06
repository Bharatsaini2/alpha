import { useState, useCallback } from "react"
import { AxiosResponse, AxiosError } from "axios"

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: (...args: any[]) => Promise<void>
  reset: () => void
}

export function useApi<T = any>(
  apiCall: (...args: any[]) => Promise<AxiosResponse<T>>
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const execute = useCallback(
    async (...args: any[]) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        const response = await apiCall(...args)
        setState({
          data: response.data,
          loading: false,
          error: null,
        })
      } catch (error) {
        const axiosError = error as AxiosError
        const errorMessage =
          (axiosError.response?.data as any)?.message ||
          axiosError.message ||
          "An error occurred"

        setState({
          data: null,
          loading: false,
          error: errorMessage,
        })
      }
    },
    [apiCall]
  )

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
    })
  }, [])

  return {
    ...state,
    execute,
    reset,
  }
}

// Specific hook for trending tokens
export function useTrendingTokens() {
  const { execute, ...state } = useApi(async (limit: number = 50) => {
    const { trendingTokensAPI } = await import("./api")
    return trendingTokensAPI.getTrendingTokens(limit)
  })

  const fetchTrendingTokens = useCallback(
    (limit: number = 50) => {
      return execute(limit)
    },
    [execute]
  )

  return {
    ...state,
    fetchTrendingTokens,
  }
}

// Specific hook for whale data
export function useWhales() {
  const { execute, ...state } = useApi(async (params?: any) => {
    const { whaleAPI } = await import("./api")
    return whaleAPI.getWhales(params)
  })

  const fetchWhales = useCallback(
    (params?: any) => {
      return execute(params)
    },
    [execute]
  )

  return {
    ...state,
    fetchWhales,
  }
}
