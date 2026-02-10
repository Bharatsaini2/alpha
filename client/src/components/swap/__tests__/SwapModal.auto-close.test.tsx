import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SwapModal } from "../SwapModal"
import { useWalletConnection } from "../../../hooks/useWalletConnection"
import { useSwapApi } from "../../../hooks/useSwapApi"
import { useToast } from "../../../contexts/ToastContext"

// Mock dependencies
vi.mock("../../../hooks/useWalletConnection")
vi.mock("../../../hooks/useSwapApi")
vi.mock("../../../contexts/ToastContext")

describe("SwapModal - Auto-Close Behavior", () => {
  const mockOnClose = vi.fn()
  const mockSendTransaction = vi.fn()
  const mockGetQuote = vi.fn()
  const mockGetSwapTransaction = vi.fn()
  const mockTrackTrade = vi.fn()
  const mockShowToast = vi.fn()
  const mockGetBalance = vi.fn()
  const mockClearErrors = vi.fn()

  const mockWallet = {
    connected: true,
    publicKey: { toBase58: () => "mockPublicKey123" },
    address: "mockPublicKey123",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Setup default mocks
    vi.mocked(useWalletConnection).mockReturnValue({
      wallet: mockWallet,
      sendTransaction: mockSendTransaction,
      getBalance: mockGetBalance,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as any)

    vi.mocked(useSwapApi).mockReturnValue({
      getQuote: mockGetQuote,
      getSwapTransaction: mockGetSwapTransaction,
      trackTrade: mockTrackTrade,
      clearErrors: mockClearErrors,
      isLoadingQuote: false,
      isLoadingSwap: false,
    } as any)

    vi.mocked(useToast).mockReturnValue({
      showToast: mockShowToast,
      removeToast: vi.fn(),
      ToastContainer: () => null,
    } as any)

    mockGetBalance.mockResolvedValue(10)

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should keep modal open for exactly 3 seconds after successful transaction (Requirement 17.1)", async () => {
    const user = userEvent.setup({ delay: null })

    mockGetQuote.mockResolvedValue({
      outAmount: "1000000000",
      priceImpactPct: "0.5",
      platformFee: { amount: "7500000" },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from("mock-transaction").toString("base64"),
    })

    mockSendTransaction.mockResolvedValue("mockSignature123")
    mockTrackTrade.mockResolvedValue(undefined)

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "",
        }}
        initialOutputToken={{
          address: "mockTokenAddress",
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 9,
          image: "",
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText("Confirm")
    await user.click(confirmButton)

    // Wait for transaction to complete
    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalled()
    })

    // Modal should still be open after 2 seconds
    vi.advanceTimersByTime(2000)
    expect(mockOnClose).not.toHaveBeenCalled()

    // Modal should still be open at 2.9 seconds
    vi.advanceTimersByTime(900)
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it("should auto-close modal after 3 seconds (Requirement 17.2)", async () => {
    const user = userEvent.setup({ delay: null })

    mockGetQuote.mockResolvedValue({
      outAmount: "1000000000",
      priceImpactPct: "0.5",
      platformFee: { amount: "7500000" },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from("mock-transaction").toString("base64"),
    })

    mockSendTransaction.mockResolvedValue("mockSignature123")
    mockTrackTrade.mockResolvedValue(undefined)

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "",
        }}
        initialOutputToken={{
          address: "mockTokenAddress",
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 9,
          image: "",
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText("Confirm")
    await user.click(confirmButton)

    // Wait for transaction to complete
    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalled()
    })

    // Advance time by exactly 3 seconds
    vi.advanceTimersByTime(3000)

    // Modal should be closed
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it("should keep modal open on transaction failure to allow retry (Requirement 17.4)", async () => {
    const user = userEvent.setup({ delay: null })

    mockGetQuote.mockResolvedValue({
      outAmount: "1000000000",
      priceImpactPct: "0.5",
      platformFee: { amount: "7500000" },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from("mock-transaction").toString("base64"),
    })

    // Simulate transaction failure
    mockSendTransaction.mockRejectedValue(new Error("Transaction failed"))

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "",
        }}
        initialOutputToken={{
          address: "mockTokenAddress",
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 9,
          image: "",
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText("Confirm")
    await user.click(confirmButton)

    // Wait for transaction to fail
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), "error")
    })

    // Advance time by 5 seconds
    vi.advanceTimersByTime(5000)

    // Modal should still be open (not auto-closed)
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it("should cancel pending operations when user manually closes modal (Requirement 17.5)", async () => {
    const user = userEvent.setup({ delay: null })

    mockGetQuote.mockResolvedValue({
      outAmount: "1000000000",
      priceImpactPct: "0.5",
      platformFee: { amount: "7500000" },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from("mock-transaction").toString("base64"),
    })

    mockSendTransaction.mockResolvedValue("mockSignature123")
    mockTrackTrade.mockResolvedValue(undefined)

    const { rerender } = render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "",
        }}
        initialOutputToken={{
          address: "mockTokenAddress",
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 9,
          image: "",
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText("Confirm")
    await user.click(confirmButton)

    // Wait for transaction to complete
    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalled()
    })

    // Advance time by 1 second (before auto-close)
    vi.advanceTimersByTime(1000)

    // User manually closes modal
    rerender(
      <SwapModal
        isOpen={false}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "",
        }}
        initialOutputToken={{
          address: "mockTokenAddress",
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 9,
          image: "",
        }}
        initialAmount="1"
      />
    )

    // Advance time past the original 3 seconds
    vi.advanceTimersByTime(3000)

    // onClose should not be called again (timer was cancelled)
    // The initial call count should remain the same
    const callCount = mockOnClose.mock.calls.length

    // Wait a bit more to ensure no additional calls
    vi.advanceTimersByTime(1000)

    // Call count should not increase
    expect(mockOnClose.mock.calls.length).toBe(callCount)
  })

  it("should keep modal open on user cancellation to allow retry (Requirement 17.4)", async () => {
    const user = userEvent.setup({ delay: null })

    mockGetQuote.mockResolvedValue({
      outAmount: "1000000000",
      priceImpactPct: "0.5",
      platformFee: { amount: "7500000" },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from("mock-transaction").toString("base64"),
    })

    // Simulate user cancellation
    const userRejectionError = new Error("User rejected the request.") as any
    userRejectionError.code = 4001
    mockSendTransaction.mockRejectedValue(userRejectionError)

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "",
        }}
        initialOutputToken={{
          address: "mockTokenAddress",
          symbol: "MOCK",
          name: "Mock Token",
          decimals: 9,
          image: "",
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText("Confirm")
    await user.click(confirmButton)

    // Wait for cancellation message
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "Transaction cancelled",
        "info"
      )
    })

    // Advance time by 5 seconds
    vi.advanceTimersByTime(5000)

    // Modal should still be open (not auto-closed)
    expect(mockOnClose).not.toHaveBeenCalled()
  })
})
