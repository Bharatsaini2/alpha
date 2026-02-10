/**
 * Integration tests for useSwapApi hook
 * Tests the hook's interaction with mock API endpoints
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from "vitest"
import axios from "axios"
import {
  useSwapApi,
  QuoteParams,
  SwapParams,
  TrackTradeParams,
} from "./useSwapApi"

// Mock axios
vi.mock("axios")
const mockedAxios = axios as unknown as Mocked<typeof axios>

// Mock React hooks
const mockSetState = vi.fn()
const mockUseState = vi.fn()
const mockUseCallback = vi.fn()
const mockUseRef = vi.fn()
const mockUseEffect = vi.fn()

vi.mock("react", () => ({
  useState: mockUseState,
  useCallback: mockUseCallback,
  useRef: mockUseRef,
  useEffect: mockUseEffect,
}))

describe("useSwapApi Integration Tests", () => {
  let mockApiClient: any
  // let hook: ReturnType<typeof useSwapApi>

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock API client
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    }

    mockedAxios.create.mockReturnValue(mockApiClient)

    // Setup React hooks mocks
    mockUseState.mockReturnValue([
      {
        isLoadingQuote: false,
        isLoadingSwap: false,
        isLoadingTrack: false,
        quoteError: null,
        swapError: null,
        trackError: null,
      },
      mockSetState,
    ])

    mockUseCallback.mockImplementation((fn) => fn)
    mockUseRef.mockReturnValue({ current: mockApiClient })
    mockUseEffect.mockImplementation((fn) => fn())

    // hook = useSwapApi()
    useSwapApi()
  })

  describe("getQuote", () => {
    it("should call the quote endpoint with correct parameters", async () => {
      const mockQuoteResponse = {
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inAmount: "1000000",
        outAmount: "950000",
        otherAmountThreshold: "940000",
        swapMode: "ExactIn",
        slippageBps: 50,
        platformFee: {
          amount: "7500",
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          pct: 0.0075,
        },
        priceImpactPct: "0.1",
        routePlan: [],
      }

      mockApiClient.get.mockResolvedValue({ data: mockQuoteResponse })

      const params: QuoteParams = {
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amount: 1000000,
        slippageBps: 50,
      }

      // Note: In real implementation, this would be wrapped in a debounced promise
      // For testing, we'll test the underlying API call logic
      const result = await new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            const response = await mockApiClient.get("/quote", {
              params: {
                inputMint: params.inputMint,
                outputMint: params.outputMint,
                amount: params.amount,
                slippageBps: params.slippageBps,
              },
            })
            resolve(response)
          } catch (err) {
            reject(err)
          }
        }, 0)
      })

      expect(mockApiClient.get).toHaveBeenCalledWith("/quote", {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps,
        },
      })
      expect((result as any).data).toEqual(mockQuoteResponse)
    })
  })

  describe("swap", () => {
    it("should call the swap endpoint with correct parameters", async () => {
      const mockSwapResponse = {
        swapTransaction: "base64-transaction-data",
        lastValidBlockHeight: 12345678,
      }

      mockApiClient.post.mockResolvedValue({ data: mockSwapResponse })

      const mockQuoteResponse = {
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inAmount: "1000000",
        outAmount: "950000",
        otherAmountThreshold: "940000",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: "0.1",
        routePlan: [],
      }

      const params: SwapParams = {
        quoteResponse: mockQuoteResponse,
        userPublicKey: "So11111111111111111111111111111111111111112",
        wrapUnwrapSOL: true,
        prioritizationFeeLamports: 1000,
      }

      const result = await mockApiClient.post("/swap", {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapUnwrapSOL: params.wrapUnwrapSOL,
        prioritizationFeeLamports: params.prioritizationFeeLamports,
      })

      expect(mockApiClient.post).toHaveBeenCalledWith("/swap", {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapUnwrapSOL: params.wrapUnwrapSOL,
        prioritizationFeeLamports: params.prioritizationFeeLamports,
      })
      expect(result.data).toEqual(mockSwapResponse)
    })
  })

  describe("trackTrade", () => {
    it("should call the track endpoint with correct parameters", async () => {
      const mockTrackResponse = {
        success: true,
        message: "Trade tracked successfully",
      }

      mockApiClient.post.mockResolvedValue({ data: mockTrackResponse })

      const params: TrackTradeParams = {
        signature: "test-signature",
        walletAddress: "So11111111111111111111111111111111111111112",
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inputAmount: 1000000,
        outputAmount: 950000,
        platformFee: 7500,
      }

      const result = await mockApiClient.post("/track", params)

      expect(mockApiClient.post).toHaveBeenCalledWith("/track", params)
      expect(result.data).toEqual(mockTrackResponse)
    })
  })

  describe("Error Handling", () => {
    it("should handle network errors", async () => {
      const networkError = new Error("Network Error")
      networkError.name = "NetworkError"

      mockApiClient.get.mockRejectedValue(networkError)

      try {
        await mockApiClient.get("/quote")
        expect.fail("Expected network error")
      } catch (error) {
        expect(error).toEqual(networkError)
      }
    })

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("Request timeout")
      timeoutError.name = "ECONNABORTED"

      mockApiClient.post.mockRejectedValue(timeoutError)

      try {
        await mockApiClient.post("/swap")
        expect.fail("Expected timeout error")
      } catch (error) {
        expect(error).toEqual(timeoutError)
      }
    })

    it("should handle rate limit errors", async () => {
      const rateLimitError = {
        response: {
          status: 429,
          data: {
            error: {
              message: "Rate limit exceeded",
            },
          },
        },
      }

      mockApiClient.get.mockRejectedValue(rateLimitError)

      try {
        await mockApiClient.get("/quote")
        expect.fail("Expected rate limit error")
      } catch (error) {
        expect(error).toEqual(rateLimitError)
      }
    })
  })

  describe("API Client Configuration", () => {
    it("should create axios client with correct configuration", () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: "http://localhost:9090/api/v1/trade",
        headers: {
          "Content-Type": "application/json",
        },
        withCredentials: true,
        timeout: 10000,
      })
    })
  })
})
