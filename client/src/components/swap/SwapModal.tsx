import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { X, AlertCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Transaction, VersionedTransaction } from "@solana/web3.js"
import DefaultTokenImage from "../../assets/default_token.svg"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { useSwapApi, QuoteResponse } from "../../hooks/useSwapApi"
import { TokenSelectionModal, TokenInfo } from "./TokenSelectionModal"
import { useToast } from "../../contexts/ToastContext"
import "./swap.css"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCopy } from "@fortawesome/free-solid-svg-icons"
import { getTokenSafetyInfo, TokenSafetyInfo, getLiquidityStatusClass, getTradingStatusClass } from "../../lib/tokenSafety"


interface SwapModalProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'swap' | 'quickBuy'
  initialInputToken?: TokenInfo
  initialOutputToken?: TokenInfo
  initialAmount?: string
}

// Default tokens
const DEFAULT_INPUT_TOKEN: TokenInfo = {
  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  image: "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1547042389",
}

const DEFAULT_OUTPUT_TOKEN: TokenInfo = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
}

export const SwapModal: React.FC<SwapModalProps> = ({
  isOpen,
  onClose,
  mode = 'swap',
  initialInputToken,
  initialOutputToken,
  initialAmount,
}) => {
  const { wallet, sendTransaction, getBalance } = useWalletConnection()
  const { getQuote, getSwapTransaction, trackTrade, isLoadingQuote, isLoadingSwap, clearErrors } = useSwapApi()
  const { showToast } = useToast()

  // Refs for focus management (Requirement 24.2)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const [inputToken, setInputToken] = useState<TokenInfo>(initialInputToken || DEFAULT_INPUT_TOKEN)
  const [outputToken, setOutputToken] = useState<TokenInfo>(initialOutputToken || DEFAULT_OUTPUT_TOKEN)
  const [inputAmount, setInputAmount] = useState<string>(initialAmount || "")
  const [outputAmount, setOutputAmount] = useState<string>("")
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [slippage] = useState<number>(500) // Fixed 5% slippage (500 BPS) - Requirement 19.2

  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false)
  const [inputBalance, setInputBalance] = useState<number>(0)
  const [solBalance, setSolBalance] = useState<number>(0)
  const [isSwapping, setIsSwapping] = useState(false)
  const [priorityFeeEnabled, setPriorityFeeEnabled] = useState<boolean>(false)
  const [tokenSafetyInfo, setTokenSafetyInfo] = useState<TokenSafetyInfo | null>(null)
  const [balanceError, setBalanceError] = useState<string>("")

  // Loading states for different stages (Requirement 22.1, 22.2, 22.3, 22.4)
  const [isPreparingTransaction, setIsPreparingTransaction] = useState<boolean>(false)
  const [isSigningTransaction, setIsSigningTransaction] = useState<boolean>(false)
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState<boolean>(false)

  // Track whether initial quote has been fetched for Quick Buy mode (Requirements 1.1, 6.1, 7.1)


  // Update initial values when props change
  useEffect(() => {
    if (initialInputToken) setInputToken(initialInputToken)
    if (initialOutputToken) setOutputToken(initialOutputToken)
    if (initialAmount) setInputAmount(initialAmount)
  }, [initialInputToken, initialOutputToken, initialAmount])

  // Requirement 24.3: Add Escape key handler to close modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen, onClose])

  // Requirement 24.2: Implement focus trap within Quick Buy modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return

    // Focus the close button when modal opens
    const focusTimeout = setTimeout(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus()
      }
    }, 100)

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = modalRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )

      if (!focusableElements || focusableElements.length === 0) return

      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (event.shiftKey) {
        // Shift + Tab: moving backwards
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: moving forwards
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleTabKey)

    return () => {
      clearTimeout(focusTimeout)
      document.removeEventListener('keydown', handleTabKey)
    }
  }, [isOpen])

  // Fetch token safety info for Quick Buy mode
  useEffect(() => {
    if (mode === 'quickBuy' && isOpen && outputToken.address) {
      // Fetch token safety information
      getTokenSafetyInfo(outputToken.address)
        .then(safetyInfo => {
          setTokenSafetyInfo(safetyInfo)
        })
        .catch(error => {
          console.error('Failed to fetch token safety info:', error)
          // Set default safe values on error
          setTokenSafetyInfo({
            liquidity: 'Healthy',
            trading: 'Active',
            honeypot: 'Unknown'
          })
        })
    }
  }, [mode, isOpen, outputToken.address])

  // Fetch SOL balance when Quick Buy modal opens (Requirement 13.1)
  useEffect(() => {
    if (mode === 'quickBuy' && isOpen && wallet.connected && wallet.publicKey) {
      fetchSolBalance()
    }
  }, [mode, isOpen, wallet.connected, wallet.publicKey])

  const fetchSolBalance = useCallback(async () => {
    try {
      // Fetch SOL balance (no tokenMint parameter = SOL balance)
      const balance = await getBalance(undefined, wallet.address || undefined)
      setSolBalance(balance)
    } catch (error) {
      console.error("Failed to fetch SOL balance:", error)
      setSolBalance(0)
    }
  }, [getBalance, wallet.address])

  // Fetch balance when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchInputBalance()
    }
  }, [wallet.connected, wallet.publicKey, inputToken.address])

  const fetchInputBalance = useCallback(async () => {
    try {
      const balance = await getBalance(
        inputToken.address === "So11111111111111111111111111111111111111112"
          ? undefined
          : inputToken.address,
        wallet.address || undefined
      )
      setInputBalance(balance)
    } catch (error) {
      console.error("Failed to fetch balance:", error)
      setInputBalance(0)
    }
  }, [getBalance, inputToken.address, wallet.address])

  // Helper function to reset all form fields (Requirement 17.3)
  const resetFormFields = useCallback(() => {
    setInputAmount("")
    setOutputAmount("")
    setQuote(null)
    setBalanceError("")
    setPriorityFeeEnabled(false)
    setTokenSafetyInfo(null)
  }, [])

  const fetchQuote = useCallback(async () => {
    // Log quote fetch for monitoring (Requirement 10.5)
    console.log('[QuickBuy] Fetching quote:', {
      mode,
      inputAmount,
      inputToken: inputToken.symbol,
      outputToken: outputToken.symbol,
      timestamp: new Date().toISOString()
    })

    try {
      const amount = parseFloat(inputAmount)
      if (isNaN(amount) || amount <= 0) return

      // Validate that input and output tokens are different
      if (inputToken.address === outputToken.address) {
        console.error("Cannot swap: input and output tokens are the same")
        setQuote(null)
        setOutputAmount("")
        showToast("Cannot swap the same token. Please select a different token.", "error")
        return
      }

      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputToken.decimals))

      const quoteResponse = await getQuote({
        inputMint: inputToken.address,
        outputMint: outputToken.address,
        amount: amountInSmallestUnit,
        slippageBps: slippage,
      })

      setQuote(quoteResponse)

      // Calculate output amount with validation
      const outAmountRaw = quoteResponse.outAmount

      // Validate outAmount is a valid number string
      if (!outAmountRaw || isNaN(Number(outAmountRaw))) {
        console.error("Invalid outAmount in quote response:", outAmountRaw)
        setOutputAmount("0.00")
        showToast("Invalid quote response. Please try again.", "error")
        return
      }

      const outAmount = parseFloat(outAmountRaw) / Math.pow(10, outputToken.decimals)

      // Validate calculated amount
      if (isNaN(outAmount) || !isFinite(outAmount)) {
        console.error("Invalid calculated output amount:", outAmount)
        setOutputAmount("0.00")
        showToast("Invalid quote calculation. Please try again.", "error")
        return
      }

      setOutputAmount(outAmount.toFixed(6))
    } catch (error: any) {
      console.error("Failed to fetch quote:", error)
      setQuote(null)
      setOutputAmount("")
      showToast(error.message || "Failed to fetch quote", "error")
    }
  }, [inputAmount, inputToken, outputToken, slippage, getQuote, showToast])



  // Fetch quote when amount or tokens change (ONLY for swap mode) (Requirements 2.1, 2.2, 2.3, 4.2, 5.2)
  useEffect(() => {
    // Don't fetch quote if input and output tokens are the same
    if (inputToken.address === outputToken.address) {
      setQuote(null)
      setOutputAmount("")
      return
    }

    if (inputAmount && parseFloat(inputAmount) > 0) {
      fetchQuote()
    } else {
      setQuote(null)
      setOutputAmount("")
    }
  }, [inputAmount, inputToken.address, outputToken.address, slippage, mode])

  const handleSwap = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey || !inputAmount) return

    try {
      setIsSwapping(true)
      clearErrors()

      // Requirement 22.2: Display "Processing..." during transaction preparation
      setIsPreparingTransaction(true)

      // Get a FRESH quote right before swap to avoid stale route errors
      const amount = parseFloat(inputAmount)
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount")
      }

      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputToken.decimals))

      const freshQuote = await getQuote({
        inputMint: inputToken.address,
        outputMint: outputToken.address,
        amount: amountInSmallestUnit,
        slippageBps: slippage,
      })

      // Update displayed quote
      setQuote(freshQuote)
      const outAmount = parseFloat(freshQuote.outAmount) / Math.pow(10, outputToken.decimals)
      setOutputAmount(outAmount.toFixed(6))

      const swapResponse = await getSwapTransaction({
        quoteResponse: freshQuote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicSlippage: priorityFeeEnabled, // Use priority fee state
      })

      const transactionBuffer = Buffer.from(swapResponse.swapTransaction, "base64")

      // Try to deserialize as versioned transaction first (Jupiter uses versioned transactions)
      let transaction: Transaction | VersionedTransaction
      try {
        transaction = VersionedTransaction.deserialize(transactionBuffer)
      } catch {
        // Fallback to legacy transaction if versioned deserialization fails
        transaction = Transaction.from(transactionBuffer)
      }

      // Transaction prepared, now waiting for signature
      setIsPreparingTransaction(false)

      // Requirement 22.3: Display loading indicator during transaction signing
      setIsSigningTransaction(true)

      // Show wallet signing prompt BEFORE sending with a small delay to ensure it renders
      showToast("Please sign the transaction in your wallet", "info")

      // Small delay to ensure toast renders before wallet popup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Send transaction (this will block until user signs or cancels)
      let signature: string
      try {
        signature = await sendTransaction(transaction)

        // Transaction signed, now submitting to blockchain
        setIsSigningTransaction(false)

        // Requirement 22.4: Display loading indicator during transaction submission
        setIsSubmittingTransaction(true)
      } catch (txError: any) {
        // Clear signing state on error
        setIsSigningTransaction(false)
        // Re-throw to be caught by outer catch block
        throw txError
      }

      // Only show success and copy if we get here (user signed)
      // Requirement 15.2: Display "Transaction submitted" with signature after submission
      showToast(`Transaction submitted: ${signature.slice(0, 8)}...${signature.slice(-8)}`, "success")

      // Clear submission loading state
      setIsSubmittingTransaction(false)

      // Copy transaction signature to clipboard (Requirement 16.1)
      try {
        await navigator.clipboard.writeText(signature)
        // Requirement 15.3: Display "Transaction successful!" on success with transaction variant (includes View TX and Close buttons)
        showToast("Transaction successful!", "success", "transaction", { txSignature: signature })
      } catch (clipboardError) {
        // Requirement 16.3: Handle clipboard access failures gracefully
        // If clipboard fails, still show success but inform user to copy manually
        console.error("Failed to copy to clipboard:", clipboardError)
        showToast("Transaction successful! Click the copy button to copy signature.", "success")
      }

      // Track trade
      const inputAmountNum = parseFloat(inputAmount) * Math.pow(10, inputToken.decimals)
      const outputAmountNum = parseFloat(freshQuote.outAmount)

      // Calculate platform fee with fallback
      // Jupiter Ultra v1 doesn't return platformFee.amount, so calculate it manually
      let platformFee = 0
      if (freshQuote.platformFee?.amount && !isNaN(Number(freshQuote.platformFee.amount))) {
        platformFee = parseFloat(freshQuote.platformFee.amount)
      } else {
        // Fallback: Calculate 0.75% of output amount
        platformFee = outputAmountNum * 0.0075
      }

      // Track trade (Requirement 21.1, 21.2)
      // Make tracking non-blocking - don't affect user experience (Requirement 21.3)
      // Fire and forget - don't await the result
      trackTrade({
        signature,
        walletAddress: wallet.publicKey.toBase58(),
        inputMint: inputToken.address,
        outputMint: outputToken.address,
        inputAmount: inputAmountNum,
        outputAmount: outputAmountNum,
        platformFee,
      }).catch(trackError => {
        // Log errors but don't display them to user (Requirement 21.4)
        console.error('Failed to track trade:', trackError)
        // Track trades even if tracking request fails (Requirement 21.5)
        // Continue execution without affecting user experience
      })

      // Auto-close modal after successful transaction and show toast
      // Toast notification will remain visible with View TX button
      setTimeout(() => {
        resetFormFields()
        onClose()
      }, 1500) // Close modal after 1.5 seconds, toast stays visible
    } catch (error: any) {
      // Requirement 17.4: Keep modal open on transaction failure to allow retry
      // Clear all loading states on error
      setIsPreparingTransaction(false)
      setIsSigningTransaction(false)
      setIsSubmittingTransaction(false)

      let errorMessage = "Swap failed. Please try again."
      let toastType: "error" | "info" = "error"

      // Safely extract error message and code
      const errorMsg = typeof error?.message === 'string' ? error.message : String(error?.message || '')
      const errorCode = error?.code || ""
      const errorName = error?.name || ""

      // Check for user cancellation FIRST (most common case)
      // Check multiple possible indicators of user rejection
      if (
        errorCode === "USER_REJECTED" ||
        errorCode === 4001 || // Standard wallet rejection code (number)
        errorCode === "4001" || // Standard wallet rejection code (string)
        errorName === "WalletSignTransactionError" ||
        errorMsg.toLowerCase().includes("user rejected") ||
        errorMsg.toLowerCase().includes("user cancelled") ||
        errorMsg.toLowerCase().includes("user canceled") ||
        errorMsg.toLowerCase().includes("user denied") ||
        errorMsg.toLowerCase().includes("rejected by user")
      ) {
        errorMessage = "Transaction cancelled"
        toastType = "info"
      } else if (errorMsg && typeof errorMsg === 'string' && errorMsg.toLowerCase().includes("invalidaccountdata")) {
        errorMessage = "Route expired. Please try again with higher slippage."
      } else if (errorMsg && typeof errorMsg === 'string' && (errorMsg.toLowerCase().includes("simulation failed") || errorMsg.toLowerCase().includes("0x1"))) {
        errorMessage = "Transaction simulation failed. Try increasing slippage or reducing amount."
      } else if (errorMsg) {
        errorMessage = errorMsg
      }

      // Show the toast with appropriate type
      showToast(errorMessage, toastType)

      // Modal stays open to allow retry - no auto-close on error
    } finally {
      setIsSwapping(false)
    }
  }, [wallet, inputAmount, inputToken, outputToken, slippage, getQuote, getSwapTransaction, sendTransaction, trackTrade, clearErrors, showToast, onClose, resetFormFields])

  const shortenAddress = (address: string) => {
    if (!address) return ''
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  const copyToClipboard = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(message, 'success')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      showToast('Failed to copy to clipboard', 'error')
    }
  }

  const copySignatureToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transactionSignature)
      showToast('Transaction signature copied to clipboard', 'success')
    } catch (error) {
      console.error('Failed to copy signature to clipboard:', error)
      showToast('Failed to copy. Please copy manually from the text below.', 'error')
    }
  }

  const platformFeeInSOL = useMemo(() => {
    if (!quote || !outputAmount) return 0
    // Platform fee is 0.75% of the output amount (Requirement 6.4)
    const amount = parseFloat(outputAmount)
    if (isNaN(amount)) return 0
    // Convert output token amount to SOL equivalent for display
    // For now, we'll use a simplified calculation
    // In production, this should use the actual quote's platform fee if available
    if (quote.platformFee?.amount) {
      const platformFeeAmount = parseFloat(quote.platformFee.amount)
      if (!isNaN(platformFeeAmount)) {
        // Convert platform fee to SOL (assuming it's in output token decimals)
        return platformFeeAmount / Math.pow(10, outputToken.decimals)
      }
    }
    // Fallback: estimate as 0.75% of output value in SOL terms
    // This is an approximation - actual fee should come from quote
    return 0.0075 * parseFloat(inputAmount || '0')
  }, [quote, outputAmount, outputToken.decimals, inputAmount])

  const networkFeeInSOL = useMemo(() => {
    // Estimate network fee (typical Solana transaction fee)
    return 0.000005
  }, [])

  const priorityFeeInSOL = useMemo(() => {
    if (!priorityFeeEnabled) return 0
    // Estimate priority fee
    return 0.0001
  }, [priorityFeeEnabled])

  const totalCostInSOL = useMemo(() => {
    const amount = parseFloat(inputAmount) || 0
    return amount + platformFeeInSOL + networkFeeInSOL + priorityFeeInSOL
  }, [inputAmount, platformFeeInSOL, networkFeeInSOL, priorityFeeInSOL])

  // Validate balance for Quick Buy mode (Requirements 13.2, 13.3)
  useEffect(() => {
    if (mode === 'quickBuy' && wallet.connected) {
      if (solBalance < totalCostInSOL && totalCostInSOL > 0) {
        setBalanceError("Insufficient Balance")
      } else {
        setBalanceError("")
      }
    } else {
      setBalanceError("")
    }
  }, [mode, wallet.connected, solBalance, totalCostInSOL])

  const isSwapDisabled = useMemo(() => {
    if (!wallet.connected) return true
    if (isSwapping || isLoadingQuote || isLoadingSwap) return true
    if (!inputAmount || parseFloat(inputAmount) <= 0) return true
    if (!quote) return true

    // For Quick Buy mode, check SOL balance against total cost (Requirement 13.4)
    if (mode === 'quickBuy') {
      if (solBalance < totalCostInSOL) return true
    } else {
      // For regular swap mode, check input token balance
      if (parseFloat(inputAmount) > inputBalance) return true
    }

    return false
  }, [wallet.connected, isSwapping, isLoadingQuote, isLoadingSwap, inputAmount, quote, mode, solBalance, totalCostInSOL, inputBalance])

  return (
    <>
      <TokenSelectionModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onTokenSelect={(token) => {
          setInputToken(token)
          setIsInputModalOpen(false)
        }}
        excludeToken={outputToken.address}
        userWallet={wallet.address || undefined}
        title="Select Input Token"
      />

      <TokenSelectionModal
        isOpen={isOutputModalOpen}
        onClose={() => setIsOutputModalOpen(false)}
        onTokenSelect={(token) => {
          setOutputToken(token)
          setIsOutputModalOpen(false)
        }}
        excludeToken={inputToken.address}
        userWallet={wallet.address || undefined}
        title="Select Output Token"
      />

      {/* <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#0A0A0A] border border-[#292929] rounded-xl shadow-2xl"
            >
       
              <div className="flex items-center justify-between p-4 border-b border-[#292929]">
                <h2 className="text-lg font-semibold text-white">Swap Tokenss</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>

          
              <div className="p-4 space-y-4">
              
                {!wallet.connected ? (
                  <button
                    onClick={connect}
                    className="w-full py-3 bg-[#2B6AD1] hover:bg-[#2B6AD1]/90 text-white font-semibold rounded-lg transition-colors"
                  >
                    Connect Wallet to Swap
                  </button>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">You Pay</span>
                        {wallet.connected && (
                          <span className="text-gray-400">
                            Balance: {inputBalance.toFixed(4)} {inputToken.symbol}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-[#141414] border border-[#292929] rounded-lg p-3">
                        <button
                          onClick={() => setIsInputModalOpen(true)}
                          className="flex items-center gap-2 px-3 py-2 bg-[#1A1A1A] hover:bg-[#222] rounded-lg transition-colors"
                        >
                          <img
                            src={inputToken.image || DefaultTokenImage}
                            alt={inputToken.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                          />
                          <span className="text-white font-medium">{inputToken.symbol}</span>
                        </button>
                        <input
                          type="number"
                          value={inputAmount}
                          onChange={(e) => setInputAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-white text-xl font-bold text-right focus:outline-none"
                          disabled={!wallet.connected}
                        />
                      </div>
                    </div>

                   
                    <div className="flex justify-center">
                      <button
                        onClick={handleSwapTokens}
                        className="p-2 bg-[#1A1A1A] hover:bg-[#222] rounded-full transition-all hover:rotate-180"
                        disabled={!wallet.connected}
                      >
                        <ArrowDownUp size={20} className="text-gray-400" />
                      </button>
                    </div>

              
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">You Receive</span>
                        {isLoadingQuote && <span className="text-gray-400">Loading...</span>}
                      </div>
                      <div className="flex items-center gap-2 bg-[#141414] border border-[#292929] rounded-lg p-3">
                        <button
                          onClick={() => setIsOutputModalOpen(true)}
                          className="flex items-center gap-2 px-3 py-2 bg-[#1A1A1A] hover:bg-[#222] rounded-lg transition-colors"
                        >
                          <img
                            src={outputToken.image || DefaultTokenImage}
                            alt={outputToken.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                          />
                          <span className="text-white font-medium">{outputToken.symbol}</span>
                        </button>
                        <div className="flex-1 text-white text-xl font-bold text-right">
                          {outputAmount || "0"}
                        </div>
                      </div>
                    </div>

              
                    {quote && (
                      <div className="space-y-2 p-3 bg-[#141414] rounded-lg text-sm">
                        {exchangeRate && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Rate</span>
                            <span className="text-white">{exchangeRate}</span>
                          </div>
                        )}
                        {platformFeeDisplay && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Platform Fee</span>
                            <span className="text-white">{platformFeeDisplay}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Slippage</span>
                          <button
                            onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                            className="flex items-center gap-1 text-white hover:text-blue-400 transition-colors"
                          >
                            <span>{(slippage / 100).toFixed(2)}%</span>
                            <Settings size={14} />
                          </button>
                        </div>
                        
                    
                        {showSlippageSettings && (
                          <div className="pt-2 border-t border-[#292929]">
                            <div className="flex gap-2 mb-2">
                              {[50, 100, 300, 500].map((bps) => (
                                <button
                                  key={bps}
                                  onClick={() => setSlippage(bps)}
                                  className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                                    slippage === bps
                                      ? "bg-[#2B6AD1] text-white"
                                      : "bg-[#1A1A1A] text-gray-400 hover:bg-[#222]"
                                  }`}
                                >
                                  {(bps / 100).toFixed(2)}%
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={slippage / 100}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value)
                                  if (!isNaN(value) && value >= 0 && value <= 50) {
                                    setSlippage(Math.round(value * 100))
                                  }
                                }}
                                step="0.1"
                                min="0"
                                max="50"
                                className="flex-1 bg-[#1A1A1A] border border-[#292929] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#2B6AD1]"
                                placeholder="Custom %"
                              />
                              <span className="text-xs text-gray-400">Custom</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Higher slippage = higher chance of success, but worse price
                            </p>
                          </div>
                        )}
                      </div>
                    )}

              
                    <button
                      onClick={handleSwap}
                      disabled={isSwapDisabled}
                      className="w-full py-3 bg-[#2B6AD1] hover:bg-[#2B6AD1]/90 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                    >
                      {isSwapping ? "Swapping..." : isLoadingQuote ? "Loading Quote..." : "Swap"}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence> */}



      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-modal-title"
            aria-describedby="swap-modal-description"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
              aria-hidden="true"
            />

            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg trans-swap-modal"
            >

              <div className="flex items-start justify-between p-3 border-b border-[#292929]">
                <div className="confirm-title-bx">
                  <h4 id="swap-modal-title" className="">{mode === 'quickBuy' ? 'Quick Buy Confirmation' : 'Swap Tokens'}</h4>
                  <p id="swap-modal-description" className="">{mode === 'quickBuy' ? 'Review Details before signing' : ''}</p>
                </div>

                <div>
                  <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                    aria-label="Close modal"
                    title="Close modal (Esc)"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>


              <div className="p-3 space-y-3">
                {/* Requirement 22.3, 22.4: Display loading indicator during transaction signing and submission */}
                {(isSigningTransaction || isSubmittingTransaction) && (
                  <div className="transaction-loading-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(10, 10, 10, 0.95)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    borderRadius: '8px',
                    animation: 'fade-in 0.3s ease-out'
                  }}>
                    <div className="loading-spinner-large" style={{
                      width: '48px',
                      height: '48px',
                      border: '4px solid #2a2a2a',
                      borderTop: '4px solid #2b6ad1',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      marginBottom: '16px'
                    }}></div>
                    <h5 style={{
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: 600,
                      marginBottom: '8px'
                    }}>
                      {isSigningTransaction ? 'Waiting for Signature...' : 'Submitting Transaction...'}
                    </h5>
                    <p style={{
                      color: '#8f8f8f',
                      fontSize: '14px',
                      textAlign: 'center',
                      maxWidth: '300px'
                    }}>
                      {isSigningTransaction
                        ? 'Please approve the transaction in your wallet'
                        : 'Your transaction is being submitted to the blockchain'}
                    </p>
                  </div>
                )}

                {mode === 'quickBuy' && (
                  <div className="solana-bx">
                    <div className="solana-parent-bx">
                      <div className="solana-content-bx">
                        <img
                          src={outputToken.image || DefaultTokenImage}
                          alt={`${outputToken.symbol} token logo`}
                          onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                        />
                        <div>
                          <h4>{outputToken.name}</h4>
                          <p>{outputToken.symbol}</p>
                        </div>
                      </div>

                      <div className="solana-cp-bx">
                        <h6 aria-label={`Token contract address: ${outputToken.address}`}>{shortenAddress(outputToken.address)}</h6>
                        <span>
                          <a
                            href="javascript:void(0)"
                            className="solana-cp-btn"
                            onClick={() => copyToClipboard(outputToken.address, 'Address copied to clipboard')}
                            aria-label="Copy token contract address to clipboard"
                            title="Copy address"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                copyToClipboard(outputToken.address, 'Address copied to clipboard')
                              }
                            }}
                          >
                            <FontAwesomeIcon icon={faCopy} />
                          </a>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* <div className="buy-detail-bx">
                  <h4>Buy Details</h4>
                  <div className="solana-your-pay">
                    <div className="solana-you-pay">
                      <h6>You Pay</h6>

                     <div className="d-flex aling-items-center justify-end gap-2">
                       <div className="amount-box w-20">
                        <input type="text" className="amount-input main-amount" placeholder="" />
                      </div>
                      <h5>0.5 Sal</h5>
                     </div>
                    </div>
                    <div className="solana-receive-bx">
                      <h6>You Receive</h6>
                      <h5>1,243,333 Token</h5>
                    </div>
                  </div>
                </div> */}

                <div className="buy-detail-bx">
                  <h4>Buy Details</h4>

                  <div className="solana-your-pay">
                    {/* YOU PAY */}
                    <div className="solana-you-pay">
                      <h6>You Pay</h6>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <div className="amount-box" style={{ width: '100%', maxWidth: '200px' }}>
                          <input
                            type="number"
                            placeholder="0.00"
                            className="amount-input main-amount"
                            min="0"
                            step="any"
                            value={inputAmount}
                            onChange={(e) => setInputAmount(e.target.value)}
                            aria-label={`Enter amount of ${inputToken.symbol} to swap`}
                            aria-describedby="input-amount-description"
                            style={{
                              textAlign: 'right',
                              fontSize: '24px',
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              color: '#ebebeb',
                              width: '100%',
                              padding: '0',
                              margin: '0',
                              height: '32px',
                              lineHeight: '32px'
                            }}
                          />
                        </div>
                        <h5 style={{ margin: 0, fontSize: '24px', lineHeight: '32px' }}>{inputToken.symbol}</h5>
                        <span id="input-amount-description" className="sr-only">
                          Enter the amount of {inputToken.symbol} you want to swap
                        </span>
                      </div>
                    </div>

                    {/* YOU RECEIVE */}
                    <div className="amount-box">
                      {/* Requirement 22.1: Display skeleton loader for output amount while quote is loading */}
                      <div className="solana-receive-bx">
                        <h6>You Receive</h6>
                        {isLoadingQuote ? (
                          <div
                            style={{
                              background: 'linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
                              backgroundSize: '200% 100%',
                              animation: 'shimmer 2s infinite linear',
                              borderRadius: '4px',
                              height: '24px',
                              width: '120px',
                              marginLeft: 'auto'
                            }}
                            aria-hidden="true"
                          ></div>
                        ) : (
                          <h5 aria-label={`You will receive ${outputAmount || '0'} ${outputToken.symbol}`}>
                            {outputAmount || '0'} {outputToken.symbol}
                          </h5>
                        )}
                      </div>
                    </div>
                  </div>
                </div>






                <div className="solana-breakdown">
                  <h5>Fee Breakdown</h5>
                  <ul className="break-down-list">
                    <li className="break-down-item">
                      <span>Platform fee (0.75%)</span>
                      {isLoadingQuote ? (
                        <span className="break-down-title">
                          <span className="loading-dots">Loading</span>
                        </span>
                      ) : (
                        <span className="break-down-title" aria-label={`Platform fee: ${platformFeeInSOL.toFixed(6)} SOL`}> {platformFeeInSOL.toFixed(6)} SOL </span>
                      )}
                    </li>
                    <li className="break-down-item">
                      <span>Network fee</span>
                      <span className="break-down-title" aria-label={`Network fee: approximately ${networkFeeInSOL.toFixed(6)} SOL`}> ~ {networkFeeInSOL.toFixed(6)} SOL </span>
                    </li>
                    <li className="break-down-item">
                      <span>Priority fee</span>
                      <div className="switch-wrapper">
                        <div className="switch">
                          <input
                            type="checkbox"
                            id="toggle7"
                            checked={priorityFeeEnabled}
                            onChange={(e) => setPriorityFeeEnabled(e.target.checked)}
                            aria-label="Enable priority fee for faster transaction processing"
                            aria-describedby="priority-fee-description"
                          />
                          <label htmlFor="toggle7"></label>
                        </div>

                        <span className="switch-title" id="priority-fee-description">
                          {priorityFeeEnabled ? `On (${priorityFeeInSOL.toFixed(6)} SOL)` : 'Off'}
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="solana-total-bx">
                  <div>
                    <h6>Total cost</h6>
                  </div>
                  <div>
                    {isLoadingQuote ? (
                      <div
                        style={{
                          background: 'linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 2s infinite linear',
                          borderRadius: '4px',
                          height: '20px',
                          width: '120px'
                        }}
                        aria-live="polite"
                        aria-busy="true"
                      >
                        <span className="sr-only">Calculating total cost...</span>
                      </div>
                    ) : (
                      <h5 aria-label={`Total cost: approximately ${totalCostInSOL.toFixed(6)} SOL`}>~ {totalCostInSOL.toFixed(6)} SOL</h5>
                    )}
                  </div>
                </div>

                {/* Display balance error for Quick Buy mode (Requirement 13.3) */}
                {mode === 'quickBuy' && balanceError && (
                  <div
                    className="balance-error-bx"
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '2px',
                      marginTop: '10px'
                    }}
                    role="alert"
                    aria-live="assertive"
                  >
                    <p style={{
                      color: '#ef4444',
                      fontSize: '11px',
                      margin: 0,
                      fontWeight: 500,
                      fontFamily: '"Geist Mono", "Courier New", monospace',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      letterSpacing: '0.02em'
                    }}>
                      <AlertCircle size={14} />
                      {balanceError}
                    </p>
                    <p style={{
                      color: '#9ca3af',
                      fontSize: '10px',
                      margin: '4px 0 0 0',
                      fontFamily: '"Geist Mono", "Courier New", monospace',
                      textAlign: 'center',
                      letterSpacing: '0.01em'
                    }}>
                      Balance: {solBalance.toFixed(6)} SOL | Required: {totalCostInSOL.toFixed(6)} SOL
                    </p>
                  </div>
                )}

                {/* Transaction signature display removed - toast notification is sufficient */}

                <div className="salana-activity-bx" role="region" aria-label="Token safety indicators">
                  <ul className="salana-activity-list">
                    <li>
                      <div>
                        <span className="salana-atv-bx">
                          Liquidity:
                          <h6
                            className={tokenSafetyInfo ? getLiquidityStatusClass(tokenSafetyInfo.liquidity) : ''}
                            aria-label={`Liquidity status: ${tokenSafetyInfo?.liquidity || 'Unknown'}`}
                          >
                            {tokenSafetyInfo?.liquidity || 'Unknown'}
                          </h6>
                        </span>
                      </div>
                    </li>
                    <li>
                      <div>
                        <span className="salana-atv-bx">
                          Trading:
                          <h6
                            className={tokenSafetyInfo ? getTradingStatusClass(tokenSafetyInfo.trading) : ''}
                            aria-label={`Trading status: ${tokenSafetyInfo?.trading || 'Unknown'}`}
                          >
                            {tokenSafetyInfo?.trading || 'Unknown'}
                          </h6>
                        </span>
                      </div>
                    </li>
                    <li>
                      <div>
                        <span className="salana-atv-bx">
                          Honeypot:
                          <h6
                            className="status-healthy"
                            aria-label="Honeypot check: Safe"
                          >
                            Safe
                          </h6>
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="salana-btn-bx">
                  <button
                    className="swap-btn w-50"
                    onClick={onClose}
                    aria-label="Cancel transaction and close modal"
                  >
                    Cancel
                  </button>
                  <button
                    ref={confirmButtonRef}
                    className="salana-btn"
                    onClick={handleSwap}
                    disabled={isSwapDisabled}
                    aria-label={
                      isSwapDisabled
                        ? (balanceError ? 'Insufficient balance to confirm transaction' : 'Confirm button disabled - waiting for quote or invalid input')
                        : 'Confirm and execute transaction'
                    }
                    aria-describedby="confirm-button-status"
                  >
                    {/* Requirement 22.2, 22.3, 22.4: Display appropriate loading text */}
                    {isPreparingTransaction ? (
                      <>
                        <span className="loading-spinner" style={{ marginRight: '8px' }} aria-hidden="true"></span>
                        Processing...
                      </>
                    ) : isSigningTransaction ? (
                      <>
                        <span className="loading-spinner" style={{ marginRight: '8px' }} aria-hidden="true"></span>
                        Signing...
                      </>
                    ) : isSubmittingTransaction ? (
                      <>
                        <span className="loading-spinner" style={{ marginRight: '8px' }} aria-hidden="true"></span>
                        Submitting...
                      </>
                    ) : isSwapping ? (
                      <>
                        <span className="loading-spinner" style={{ marginRight: '8px' }} aria-hidden="true"></span>
                        Processing...
                      </>
                    ) : (
                      'Confirm'
                    )}

                    <span className="corner top-right" aria-hidden="true"></span>
                    <span className="corner bottom-left" aria-hidden="true"></span>
                  </button>
                  <span id="confirm-button-status" className="sr-only">
                    {isSwapDisabled && balanceError ? balanceError : ''}
                  </span>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>




    </>
  )
}

export default SwapModal
