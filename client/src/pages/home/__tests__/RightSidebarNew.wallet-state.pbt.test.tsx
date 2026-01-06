/**
 * Property-Based Test for Wallet Connection State Management
 * **Feature: jupiter-swap-engine, Property 12: Wallet connection state management**
 * **Validates: Requirements 12.5**
 * 
 * This test verifies that wallet connection and disconnection events
 * properly update UI state and enable/disable swap functionality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { act } from "react"
import * as fc from "fast-check"
import RightSidebarNew from "../RightSidebarNew"

// Mock the wallet adapter hooks
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockSendTransaction = vi.fn()
const mockGetBalance = vi.fn()

vi.mock("../../../hooks/useWalletConnection", () => ({
  useWalletConnection: () => ({
    wallet: {
      connected: false,
      connecting: false,
      disconnecting: false,
      publicKey: null,
      address: null,
    },
    connect: mockConnect,
    disconnect: mockDisconnect,
    sendTransaction: mockSendTransaction,
    getBalance: mockGetBalance,
    getTokenBalance: vi.fn(),
    getAllTokenBalances: vi.fn(),
    isLoading: false,
    error: null,
    clearError: vi.fn(),
  }),
}))

vi.mock("../../../hooks/useSwapApi", () => ({
  useSwapApi: () => ({
    getQuote: vi.fn(),
    getSwapTransaction: vi.fn(),
    trackTrade: vi.fn(),
    isLoadingQuote: false,
    isLoadingSwap: false,
    isLoadingTrack: false,
    quoteError: null,
    swapError: null,
    trackError: null,
    clearErrors: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

vi.mock("../../../components/swap/TokenSelectionModal", () => ({
  TokenSelectionModal: () => null,
}))

describe("Property 12: Wallet connection state management", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should display connect button when wallet is not connected", async () => {
    /**
     * Property: For any component state where wallet is not connected,
     * the UI should display a "Connect Wallet" button
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate random component props
        fc.record({
          selectedToken: fc.option(
            fc.record({
              address: fc.string({ minLength: 32, maxLength: 44 }),
              symbol: fc.string({ minLength: 2, maxLength: 10 }),
              name: fc.string({ minLength: 3, maxLength: 30 }),
            }),
            { nil: undefined }
          ),
          quickBuyAmount: fc.option(fc.double({ min: 0, max: 1000 }).map(String), { nil: undefined }),
        }),
        async (props) => {
          const { container } = render(<RightSidebarNew {...props} />)

          // Wait for component to render
          await waitFor(() => {
            const connectButton = screen.queryByText(/CONNECT WALLET/i)
            expect(connectButton).toBeTruthy()
          })

          // Verify swap button is not present when wallet is disconnected
          const swapButton = screen.queryByText(/^SWAP$/i)
          expect(swapButton).toBeFalsy()

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should enable swap functionality when wallet connects", async () => {
    /**
     * Property: For any wallet connection event,
     * the UI should transition from showing "Connect Wallet" to showing "Swap" button
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate random wallet addresses
        fc.string({ minLength: 32, maxLength: 44 }),
        async (walletAddress) => {
          // Mock wallet as connected
          const mockWalletConnected = {
            wallet: {
              connected: true,
              connecting: false,
              disconnecting: false,
              publicKey: { toBase58: () => walletAddress },
              address: walletAddress,
            },
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendTransaction: mockSendTransaction,
            getBalance: mockGetBalance.mockResolvedValue(10),
            getTokenBalance: vi.fn(),
            getAllTokenBalances: vi.fn(),
            isLoading: false,
            error: null,
            clearError: vi.fn(),
          }

          // Re-mock with connected state
          vi.mocked(require("../../../hooks/useWalletConnection").useWalletConnection).mockReturnValue(
            mockWalletConnected
          )

          const { container } = render(<RightSidebarNew />)

          await waitFor(() => {
            // Verify wallet address is displayed
            const addressDisplay = container.textContent
            expect(addressDisplay).toContain(walletAddress.slice(0, 4))
            expect(addressDisplay).toContain(walletAddress.slice(-4))

            // Verify swap button is present
            const swapButton = screen.queryByText(/SWAP/i)
            expect(swapButton).toBeTruthy()

            // Verify connect button is not present
            const connectButton = screen.queryByText(/CONNECT WALLET/i)
            expect(connectButton).toBeFalsy()
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should disable swap button when wallet is disconnected", async () => {
    /**
     * Property: For any wallet disconnection event,
     * the swap button should be replaced with connect button
     */
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // Random initial connection state
        async (initiallyConnected) => {
          // Start with wallet connected or disconnected
          const mockWallet = {
            wallet: {
              connected: initiallyConnected,
              connecting: false,
              disconnecting: false,
              publicKey: initiallyConnected ? { toBase58: () => "test-address" } : null,
              address: initiallyConnected ? "test-address" : null,
            },
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendTransaction: mockSendTransaction,
            getBalance: mockGetBalance,
            getTokenBalance: vi.fn(),
            getAllTokenBalances: vi.fn(),
            isLoading: false,
            error: null,
            clearError: vi.fn(),
          }

          vi.mocked(require("../../../hooks/useWalletConnection").useWalletConnection).mockReturnValue(
            mockWallet
          )

          const { rerender } = render(<RightSidebarNew />)

          // Simulate disconnection
          mockWallet.wallet.connected = false
          mockWallet.wallet.publicKey = null
          mockWallet.wallet.address = null

          rerender(<RightSidebarNew />)

          await waitFor(() => {
            // After disconnection, connect button should be visible
            const connectButton = screen.queryByText(/CONNECT WALLET/i)
            expect(connectButton).toBeTruthy()

            // Swap button should not be visible
            const swapButton = screen.queryByText(/^SWAP$/i)
            expect(swapButton).toBeFalsy()
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should show loading state during wallet connection", async () => {
    /**
     * Property: For any wallet connection attempt,
     * the UI should show a loading state
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true), // Always test loading state
        async () => {
          const mockWalletConnecting = {
            wallet: {
              connected: false,
              connecting: true,
              disconnecting: false,
              publicKey: null,
              address: null,
            },
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendTransaction: mockSendTransaction,
            getBalance: mockGetBalance,
            getTokenBalance: vi.fn(),
            getAllTokenBalances: vi.fn(),
            isLoading: true,
            error: null,
            clearError: vi.fn(),
          }

          vi.mocked(require("../../../hooks/useWalletConnection").useWalletConnection).mockReturnValue(
            mockWalletConnecting
          )

          render(<RightSidebarNew />)

          await waitFor(() => {
            // Should show connecting state
            const connectingButton = screen.queryByText(/CONNECTING/i)
            expect(connectingButton).toBeTruthy()
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should update balance display when wallet connects", async () => {
    /**
     * Property: For any wallet connection with a balance,
     * the UI should display the token balance
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate random balance values
        fc.double({ min: 0, max: 1000000, noNaN: true }),
        async (balance) => {
          const mockWalletWithBalance = {
            wallet: {
              connected: true,
              connecting: false,
              disconnecting: false,
              publicKey: { toBase58: () => "test-address" },
              address: "test-address",
            },
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendTransaction: mockSendTransaction,
            getBalance: mockGetBalance.mockResolvedValue(balance),
            getTokenBalance: vi.fn(),
            getAllTokenBalances: vi.fn(),
            isLoading: false,
            error: null,
            clearError: vi.fn(),
          }

          vi.mocked(require("../../../hooks/useWalletConnection").useWalletConnection).mockReturnValue(
            mockWalletWithBalance
          )

          const { container } = render(<RightSidebarNew />)

          await waitFor(() => {
            // Should display balance
            const balanceText = container.textContent
            expect(balanceText).toContain("Balance:")
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should disable swap when wallet is connected but no amount entered", async () => {
    /**
     * Property: For any connected wallet state with no input amount,
     * the swap button should be disabled
     */
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 32, maxLength: 44 }),
        async (walletAddress) => {
          const mockWalletConnected = {
            wallet: {
              connected: true,
              connecting: false,
              disconnecting: false,
              publicKey: { toBase58: () => walletAddress },
              address: walletAddress,
            },
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendTransaction: mockSendTransaction,
            getBalance: mockGetBalance.mockResolvedValue(10),
            getTokenBalance: vi.fn(),
            getAllTokenBalances: vi.fn(),
            isLoading: false,
            error: null,
            clearError: vi.fn(),
          }

          vi.mocked(require("../../../hooks/useWalletConnection").useWalletConnection).mockReturnValue(
            mockWalletConnected
          )

          render(<RightSidebarNew />)

          await waitFor(() => {
            const swapButton = screen.queryByText(/SWAP/i) as HTMLButtonElement
            expect(swapButton).toBeTruthy()
            
            // Button should be disabled when no amount is entered
            if (swapButton) {
              expect(swapButton.disabled).toBe(true)
            }
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should handle wallet connection errors gracefully", async () => {
    /**
     * Property: For any wallet connection error,
     * the UI should display an error message and remain functional
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate random error messages
        fc.string({ minLength: 10, maxLength: 100 }),
        async (errorMessage) => {
          const mockWalletWithError = {
            wallet: {
              connected: false,
              connecting: false,
              disconnecting: false,
              publicKey: null,
              address: null,
            },
            connect: mockConnect,
            disconnect: mockDisconnect,
            sendTransaction: mockSendTransaction,
            getBalance: mockGetBalance,
            getTokenBalance: vi.fn(),
            getAllTokenBalances: vi.fn(),
            isLoading: false,
            error: {
              code: "CONNECTION_FAILED",
              message: errorMessage,
            },
            clearError: vi.fn(),
          }

          vi.mocked(require("../../../hooks/useWalletConnection").useWalletConnection).mockReturnValue(
            mockWalletWithError
          )

          const { container } = render(<RightSidebarNew />)

          await waitFor(() => {
            // Should display error message
            const errorDisplay = container.textContent
            expect(errorDisplay).toContain(errorMessage)

            // Connect button should still be available
            const connectButton = screen.queryByText(/CONNECT WALLET/i)
            expect(connectButton).toBeTruthy()
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
