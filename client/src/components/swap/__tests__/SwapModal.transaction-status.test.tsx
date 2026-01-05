import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwapModal } from '../SwapModal'
import { useWalletConnection } from '../../../hooks/useWalletConnection'
import { useSwapApi } from '../../../hooks/useSwapApi'
import { useToast } from '../../ui/Toast'

// Mock dependencies
vi.mock('../../../hooks/useWalletConnection')
vi.mock('../../../hooks/useSwapApi')
vi.mock('../../ui/Toast')

describe('SwapModal - Transaction Status Feedback', () => {
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
    publicKey: { toBase58: () => 'mockPublicKey123' },
    address: 'mockPublicKey123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
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

  it('should display "Please sign the transaction in your wallet" during signing (Requirement 15.1)', async () => {
    const user = userEvent.setup()
    
    // Mock quote response
    mockGetQuote.mockResolvedValue({
      outAmount: '1000000000',
      priceImpactPct: '0.5',
      platformFee: { amount: '7500000' },
    })

    // Mock swap transaction response
    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from('mock-transaction').toString('base64'),
    })

    // Mock sendTransaction to simulate signing delay
    mockSendTransaction.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve('mockSignature123'), 100)
      })
    })

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          image: '',
        }}
        initialOutputToken={{
          address: 'mockTokenAddress',
          symbol: 'MOCK',
          name: 'Mock Token',
          decimals: 9,
          image: '',
        }}
        initialAmount="1"
      />
    )

    // Wait for quote to load
    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    // Click confirm button
    const confirmButton = screen.getByText('Confirm')
    await user.click(confirmButton)

    // Verify "Please sign the transaction in your wallet" message is shown
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Please sign the transaction in your wallet',
        'info'
      )
    })
  })

  it('should display "Transaction submitted" with signature after submission (Requirement 15.2)', async () => {
    const user = userEvent.setup()
    const mockSignature = 'abc12345xyz67890'
    
    mockGetQuote.mockResolvedValue({
      outAmount: '1000000000',
      priceImpactPct: '0.5',
      platformFee: { amount: '7500000' },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from('mock-transaction').toString('base64'),
    })

    mockSendTransaction.mockResolvedValue(mockSignature)

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          image: '',
        }}
        initialOutputToken={{
          address: 'mockTokenAddress',
          symbol: 'MOCK',
          name: 'Mock Token',
          decimals: 9,
          image: '',
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText('Confirm')
    await user.click(confirmButton)

    // Verify "Transaction submitted" message with signature is shown
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Transaction submitted'),
        'success'
      )
    })
  })

  it('should display "Transaction successful!" on success (Requirement 15.3)', async () => {
    const user = userEvent.setup()
    
    mockGetQuote.mockResolvedValue({
      outAmount: '1000000000',
      priceImpactPct: '0.5',
      platformFee: { amount: '7500000' },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from('mock-transaction').toString('base64'),
    })

    mockSendTransaction.mockResolvedValue('mockSignature123')

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          image: '',
        }}
        initialOutputToken={{
          address: 'mockTokenAddress',
          symbol: 'MOCK',
          name: 'Mock Token',
          decimals: 9,
          image: '',
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText('Confirm')
    await user.click(confirmButton)

    // Verify "Transaction successful!" message is shown
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Transaction successful'),
        'success'
      )
    })
  })

  it('should display error message with failure reason on error (Requirement 15.4)', async () => {
    const user = userEvent.setup()
    const errorMessage = 'Insufficient funds for transaction'
    
    mockGetQuote.mockResolvedValue({
      outAmount: '1000000000',
      priceImpactPct: '0.5',
      platformFee: { amount: '7500000' },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from('mock-transaction').toString('base64'),
    })

    mockSendTransaction.mockRejectedValue(new Error(errorMessage))

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          image: '',
        }}
        initialOutputToken={{
          address: 'mockTokenAddress',
          symbol: 'MOCK',
          name: 'Mock Token',
          decimals: 9,
          image: '',
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText('Confirm')
    await user.click(confirmButton)

    // Verify error message is shown
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        errorMessage,
        'error'
      )
    })
  })

  it('should display "Transaction cancelled" as info message when user cancels (Requirement 15.5)', async () => {
    const user = userEvent.setup()
    
    mockGetQuote.mockResolvedValue({
      outAmount: '1000000000',
      priceImpactPct: '0.5',
      platformFee: { amount: '7500000' },
    })

    mockGetSwapTransaction.mockResolvedValue({
      swapTransaction: Buffer.from('mock-transaction').toString('base64'),
    })

    // Simulate user rejection
    const userRejectionError = new Error('User rejected the request')
    userRejectionError.code = 4001
    mockSendTransaction.mockRejectedValue(userRejectionError)

    render(
      <SwapModal
        isOpen={true}
        onClose={mockOnClose}
        mode="quickBuy"
        initialInputToken={{
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          image: '',
        }}
        initialOutputToken={{
          address: 'mockTokenAddress',
          symbol: 'MOCK',
          name: 'Mock Token',
          decimals: 9,
          image: '',
        }}
        initialAmount="1"
      />
    )

    await waitFor(() => {
      expect(mockGetQuote).toHaveBeenCalled()
    })

    const confirmButton = screen.getByText('Confirm')
    await user.click(confirmButton)

    // Verify "Transaction cancelled" is shown as info (not error)
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Transaction cancelled',
        'info'
      )
    })
  })
})
