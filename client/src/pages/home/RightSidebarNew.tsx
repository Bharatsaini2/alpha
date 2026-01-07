import { useState, useEffect, useCallback, useMemo } from "react"
import { IoSparklesOutline } from "react-icons/io5"
import { HiChevronUpDown } from "react-icons/hi2"
import { RiLoader2Fill } from "react-icons/ri"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowTrendDown,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons"
import { Transaction, VersionedTransaction } from "@solana/web3.js"
import DefaultTokenImage from "../../assets/default_token.svg"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { useSwapApi, QuoteResponse } from "../../hooks/useSwapApi"
import {
  TokenSelectionModal,
  TokenInfo,
} from "../../components/swap/TokenSelectionModal"
import { useToast } from "../../components/ui/Toast"
import { useAuth } from "../../contexts/AuthContext"
import "../../components/swap/swap.css"
import { IoMdTrendingUp } from "react-icons/io"
import { RiArrowUpDownFill } from "react-icons/ri"
import { IoWalletOutline } from "react-icons/io5"

// import { MdOutlineCheckBox } from "react-icons/md";

interface RightSidebarNewProps {
  selectedToken?: any
  quickBuyAmount?: string
}

// Default tokens for swap
const DEFAULT_INPUT_TOKEN: TokenInfo = {
  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  image:
    "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1547042389",
}

const DEFAULT_OUTPUT_TOKEN: TokenInfo = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  image:
    "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
}

const RightSidebarNew = ({
  selectedToken,
  quickBuyAmount,
}: RightSidebarNewProps) => {
  // Auth hook for login modal
  const { openLoginModal } = useAuth()

  // Wallet connection hook
  const {
    wallet,
    sendTransaction,
    getBalance,
    isLoading: isWalletLoading,
    error: walletError,
  } = useWalletConnection()

  // Swap API hook
  const {
    getQuote,
    getSwapTransaction,
    trackTrade,
    isLoadingQuote,
    isLoadingSwap,
    error: swapError,
    clearErrors,
  } = useSwapApi()

  // Toast notifications
  const { showToast, ToastContainer } = useToast()

  // State management
  const [inputToken, setInputToken] = useState<TokenInfo>(DEFAULT_INPUT_TOKEN)
  const [outputToken, setOutputToken] =
    useState<TokenInfo>(DEFAULT_OUTPUT_TOKEN)
  const [isLoading,setIsLoading]=useState(false)
  const [inputAmount, setInputAmount] = useState<string>("") // Empty by default - user must enter amount
  const [outputAmount, setOutputAmount] = useState<string>("")
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [slippage] = useState<number>(500) // Fixed 5% slippage (500 BPS) - NOT dynamic
  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false)
  const [inputBalance, setInputBalance] = useState<number>(0)
  const [isSwapping, setIsSwapping] = useState(false)
  const [isConnect, setISConnect] = useState(false)
  const [swapStatus, setSwapStatus] = useState<string>("")
  const [lastTxSignature, setLastTxSignature] = useState<string>("")
  const [retryCount, setRetryCount] = useState<number>(0)

  // Update tokens when selectedToken prop changes
  useEffect(() => {
    if (selectedToken) {
      setOutputToken({
        address: selectedToken.address || selectedToken.mint,
        symbol: selectedToken.symbol,
        name: selectedToken.name || selectedToken.symbol,
        decimals: selectedToken.decimals || 9,
        image: selectedToken.image || selectedToken.logoURI,
      })
    }
  }, [selectedToken])

  // Update input amount when quickBuyAmount prop changes
  useEffect(() => {
    if (quickBuyAmount && parseFloat(quickBuyAmount) > 0) {
      setInputAmount(quickBuyAmount)
    }
  }, [quickBuyAmount])

  // Fetch input token balance when wallet connects or token changes
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchInputBalance()
    } else {
      setInputBalance(0)
    }
  }, [wallet.connected, wallet.publicKey, inputToken.address])

  // Fetch quote when input amount or tokens change
  useEffect(() => {
    // Only fetch quote if amount is greater than 0
    if (
      inputAmount &&
      parseFloat(inputAmount) > 0 &&
      inputToken &&
      outputToken
    ) {
      fetchQuote()
    } else {
      setQuote(null)
      setOutputAmount("")
    }
  }, [inputAmount, inputToken.address, outputToken.address, slippage])

  // Fetch input token balance
  const fetchInputBalance = useCallback(async () => {
    try {
      const balance = await getBalance(
        inputToken.address === "So11111111111111111111111111111111111111112"
          ? undefined
          : inputToken.address
      )
      setInputBalance(balance)
    } catch (error) {
      console.error("Failed to fetch balance:", error)
      setInputBalance(0)
      showToast("Failed to fetch token balance", "error")
    }
  }, [getBalance, inputToken.address, showToast])

  // Fetch swap quote with debouncing (handled by useSwapApi)
  const fetchQuote = useCallback(async () => {
    setIsLoading(true)
    try {
      const amount = parseFloat(inputAmount)
      if (isNaN(amount) || amount <= 0) return

      // Convert to smallest unit
      const amountInSmallestUnit = Math.floor(
        amount * Math.pow(10, inputToken.decimals)
      )

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

      const outAmount =
        parseFloat(outAmountRaw) / Math.pow(10, outputToken.decimals)

      // Validate calculated amount
      if (isNaN(outAmount) || !isFinite(outAmount)) {
        console.error("Invalid calculated output amount:", outAmount)
        setOutputAmount("0.00")
        showToast("Invalid quote calculation. Please try again.", "error")
        return
      }

      setOutputAmount(outAmount.toFixed(6))
      setIsLoading(false)
      setRetryCount(0) // Reset retry count on success
    } catch (error: any) {
      console.error("Failed to fetch quote:", error)
      setQuote(null)
      setOutputAmount("")

      // Show user-friendly error message
      if (error.code === "NETWORK_ERROR") {
        showToast("Network error. Please check your connection.", "error")
      } else if (error.code === "RATE_LIMIT_EXCEEDED") {
        showToast("Too many requests. Please wait a moment.", "error")
      } else if (error.code === "TIMEOUT") {
        showToast("Request timed out. Please try again.", "error")
      } else {
        showToast("Failed to fetch quote. Please try again.", "error")
      }
    }
  }, [inputAmount, inputToken, outputToken, slippage, getQuote, showToast])

  // Handle wallet connection
  const handleConnectWallet = useCallback(async () => {
    setISConnect(true)
    try {
      await connect()
      showToast("Wallet connected successfully", "success")
    } catch (error: any) {
      console.error("Failed to connect wallet:", error)

      // Show user-friendly error message
      if (error.code === "USER_REJECTED") {
        showToast("Connection cancelled", "info")
      } else if (error.code === "WALLET_NOT_FOUND") {
        showToast("Wallet not found. Please install a Solana wallet.", "error")
      } else if (error.code === "WALLET_NOT_READY") {
        showToast("Wallet is not ready. Please unlock your wallet.", "error")
      } else {
        showToast("Failed to connect wallet. Please try again.", "error")
      }
    }finally{
setISConnect(false)
    }

    fetchLivePrices()

    return () => { isMounted = false }
  }, [inputToken.address, outputToken.address])

  // Handle wallet connection - opens login modal which handles wallet connection
  const handleConnectWallet = useCallback(() => {
    openLoginModal()
  }, [openLoginModal])

  // Handle token selection
  const handleInputTokenSelect = useCallback(
    (token: TokenInfo) => {
      // Prevent selecting the same token for input and output
      if (token.address === outputToken.address) {
        showToast("Input and output tokens must be different", "error")
        return
      }

      setInputToken(token)
      setIsInputModalOpen(false)
      setInputAmount("")
      setOutputAmount("")
      setQuote(null)
    },
    [outputToken.address, showToast]
  )

  const handleOutputTokenSelect = useCallback(
    (token: TokenInfo) => {
      // Prevent selecting the same token for input and output
      if (token.address === inputToken.address) {
        showToast("Input and output tokens must be different", "error")
        return
      }

      setOutputToken(token)
      setIsOutputModalOpen(false)
      setOutputAmount("")
      setQuote(null)
    },
    [inputToken.address, showToast]
  )

  // Handle input amount change with validation
  const handleInputAmountChange = useCallback(
    (value: string) => {
      // Allow empty string
      if (value === "") {
        setInputAmount("")
        return
      }

      // Allow typing decimal point and partial numbers (like "0.", ".", "0.0")
      // This prevents validation errors while user is still typing
      if (value === "." || value === "0." || /^\d*\.?\d*$/.test(value)) {
        setInputAmount(value)
        return
      }

      // Validate number format only for complete numbers
      const numValue = parseFloat(value)

      // Silently reject invalid numbers without showing toast
      if (isNaN(numValue) || !isFinite(numValue)) {
        return
      }

      // Silently reject negative numbers without showing toast
      if (numValue < 0) {
        return
      }

      // Check for excessive decimal places
      const decimalPlaces = (value.split(".")[1] || "").length
      if (decimalPlaces > inputToken.decimals) {
        return // Silently reject without toast
      }

      setInputAmount(value)
    },
    [inputToken.decimals]
  )

  // Handle swap tokens
  const handleSwapTokens = useCallback(() => {
    const tempToken = inputToken
    setInputToken(outputToken)
    setOutputToken(tempToken)
    setInputAmount("")
    setOutputAmount("")
    setQuote(null)
  }, [inputToken, outputToken])

  // Handle max button
  const handleMaxClick = useCallback(() => {
    if (inputBalance > 0) {
      // Reserve some SOL for transaction fees if input is SOL
      const maxAmount =
        inputToken.address === "So11111111111111111111111111111111111111112"
          ? Math.max(0, inputBalance - 0.01) // Reserve 0.01 SOL for fees
          : inputBalance

      // Validate max amount is positive
      if (maxAmount <= 0) {
        showToast("Insufficient balance for transaction fees", "error")
        return
      }

      setInputAmount(maxAmount.toFixed(inputToken.decimals))
    }
  }, [inputBalance, inputToken.address, inputToken.decimals, showToast])

  // Handle swap execution
  const handleSwap = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey || !quote) {
      return
    }

    // Validate input amount
    const amount = parseFloat(inputAmount)
    if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
      showToast("Please enter a valid amount", "error")
      return
    }

    // Validate sufficient balance
    if (amount > inputBalance) {
      showToast(`Insufficient ${inputToken.symbol} balance`, "error")
      return
    }

    // Validate different tokens
    if (inputToken.address === outputToken.address) {
      showToast("Input and output tokens must be different", "error")
      return
    }

    try {
      setIsSwapping(true)
      clearErrors()

      // Get a FRESH quote right before swap to avoid stale route errors
      setSwapStatus("Getting fresh quote...")
      const amountInSmallestUnit = Math.floor(
        amount * Math.pow(10, inputToken.decimals)
      )
      const freshQuote = await getQuote({
        inputMint: inputToken.address,
        outputMint: outputToken.address,
        amount: amountInSmallestUnit,
        slippageBps: slippage,
      })

      // Update displayed quote
      setQuote(freshQuote)
      const outAmount =
        parseFloat(freshQuote.outAmount) / Math.pow(10, outputToken.decimals)
      setOutputAmount(outAmount.toFixed(6))

      setSwapStatus("Generating transaction...")

      // Get swap transaction with Jupiter Ultra (priority level handled automatically)
      const swapResponse = await getSwapTransaction({
        quoteResponse: freshQuote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicSlippage: false, // Fixed slippage at 5%
      })

      setSwapStatus("Please sign the transaction in your wallet...")

      // Deserialize transaction (handle both legacy and versioned transactions)
      const transactionBuffer = Buffer.from(
        swapResponse.swapTransaction,
        "base64"
      )

      // Try to deserialize as versioned transaction first (Jupiter uses versioned transactions)
      let transaction: Transaction | VersionedTransaction
      try {
        transaction = VersionedTransaction.deserialize(transactionBuffer)
      } catch (e) {
        // Fallback to legacy transaction if versioned deserialization fails
        transaction = Transaction.from(transactionBuffer)
      }

      setSwapStatus("Submitting transaction to Solana network...")

      // Send transaction
      const signature = await sendTransaction(transaction)

      setSwapStatus("Transaction confirmed!")
      setLastTxSignature(signature)

      showToast("Swap completed successfully!", "success")

      // Calculate amounts for tracking
      const inputAmountNum =
        parseFloat(inputAmount) * Math.pow(10, inputToken.decimals)
      const outputAmountNum = parseFloat(freshQuote.outAmount)

      // Calculate platform fee with fallback
      // Jupiter Ultra v1 doesn't return platformFee.amount, so calculate it manually
      let platformFee = 0
      if (
        freshQuote.platformFee?.amount &&
        !isNaN(Number(freshQuote.platformFee.amount))
      ) {
        platformFee = parseFloat(freshQuote.platformFee.amount)
      } else {
        // Fallback: Calculate 0.75% of output amount
        platformFee = outputAmountNum * 0.0075
      }

      // Track trade (priority level will be automatically determined by Jupiter Ultra)
      try {
        await trackTrade({
          signature,
          walletAddress: wallet.publicKey.toBase58(),
          inputMint: inputToken.address,
          outputMint: outputToken.address,
          inputAmount: inputAmountNum,
          outputAmount: outputAmountNum,
          platformFee,
          // ✅ Priority level is handled automatically by Jupiter Ultra
        })
      } catch (trackError) {
        // Don't fail the swap if tracking fails
        console.error("Failed to track trade:", trackError)
      }

      // Reset form
      setInputAmount("")
      setOutputAmount("")
      setQuote(null)
      setRetryCount(0)

      // Refresh balance
      await fetchInputBalance()

      setTimeout(() => {
        setSwapStatus("")
        setLastTxSignature("")
      }, 5000)
    } catch (error: any) {
      console.error("Swap failed:", error)

      // Show user-friendly error messages
      let errorMessage = "Swap failed. Please try again."

      // Safely extract error message
      const errorMsg =
        typeof error.message === "string"
          ? error.message
          : String(error.message || "")
      const errorCode = error.code || ""

      if (errorCode === "USER_REJECTED") {
        errorMessage = "Transaction cancelled"
        showToast(errorMessage, "info")
      } else if (errorCode === "INSUFFICIENT_FUNDS") {
        errorMessage = `Insufficient ${inputToken.symbol} balance`
        showToast(errorMessage, "error")
      } else if (errorCode === "TRANSACTION_EXPIRED") {
        errorMessage = "Transaction expired. Please try again."
        showToast(errorMessage, "error")
      } else if (errorCode === "NETWORK_ERROR") {
        errorMessage = "Network error. Please check your connection."
        showToast(errorMessage, "error")
      } else if (errorCode === "RATE_LIMIT_EXCEEDED") {
        errorMessage = "Too many requests. Please wait a moment."
        showToast(errorMessage, "error")
      } else if (
        errorMsg &&
        typeof errorMsg === "string" &&
        errorMsg.toLowerCase().includes("slippage")
      ) {
        errorMessage = "Price changed too much. Please try again."
        showToast(errorMessage, "error")
      } else if (errorMsg) {
        errorMessage = errorMsg
        showToast(errorMessage, "error")
      } else {
        showToast(errorMessage, "error")
      }

      setSwapStatus(errorMessage)

      setTimeout(() => {
        setSwapStatus("")
      }, 5000)
    } finally {
      setIsSwapping(false)
    }
  }, [
    wallet,
    quote,
    inputAmount,
    inputToken,
    outputToken,
    getSwapTransaction,
    sendTransaction,
    trackTrade,
    fetchInputBalance,
    clearErrors,
    inputBalance,
    showToast,
    slippage,
  ])

  // Handle Quick Buy - simply pre-fills the swap form with the token
  const handleQuickBuy = useCallback(
    async (token: any) => {
      if (!wallet.connected) {
        showToast("Please connect your wallet first", "error")
        return
      }

      if (!inputAmount || parseFloat(inputAmount) <= 0) {
        showToast("Please enter an amount greater than 0", "error")
        return
      }

      // Set the output token to the selected token
      const newOutputToken: TokenInfo = {
        address: token.address || token.mint,
        symbol: token.symbol,
        name: token.name || token.symbol,
        decimals: token.decimals || 9,
        image: token.image || token.logoURI,
      }

      setOutputToken(newOutputToken)
      showToast(
        `Ready to swap ${inputAmount} ${inputToken.symbol} for ${token.symbol}`,
        "success"
      )
    },
    [wallet.connected, inputAmount, inputToken, showToast]
  )

  // Calculate exchange rate
  const exchangeRate = useMemo(() => {
    if (!quote || !inputAmount || parseFloat(inputAmount) === 0) return null

    const inAmount = parseFloat(inputAmount)
    const outAmount = parseFloat(outputAmount)

    if (inAmount > 0 && outAmount > 0) {
      const rate = outAmount / inAmount
      return `1 ${inputToken.symbol} ≈ ${rate.toFixed(6)} ${outputToken.symbol}`
    }

    return null
  }, [quote, inputAmount, outputAmount, inputToken.symbol, outputToken.symbol])

  // Calculate platform fee display
  const platformFeeDisplay = useMemo(() => {
    if (!quote) return null

    // Try to use platform fee from quote response first
    if (quote.platformFee?.amount && !isNaN(Number(quote.platformFee.amount))) {
      const feeAmount =
        parseFloat(quote.platformFee.amount) /
        Math.pow(10, outputToken.decimals)
      if (!isNaN(feeAmount) && isFinite(feeAmount)) {
        return `${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      }
    }

    // Fallback: Calculate platform fee manually (0.75% of output amount)
    // Jupiter Ultra v1 doesn't return platformFee.amount, but fee is still collected
    if (
      outputAmount &&
      !isNaN(parseFloat(outputAmount)) &&
      parseFloat(outputAmount) > 0
    ) {
      const outAmount = parseFloat(outputAmount)
      const feeAmount = outAmount * 0.0075 // 0.75% = 0.0075

      if (!isNaN(feeAmount) && isFinite(feeAmount) && feeAmount > 0) {
        return `~${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      }
    }

    return null
  }, [quote, outputAmount, outputToken])

  // Validate swap button state
  const isSwapDisabled = useMemo(() => {
    if (!wallet.connected) return true
    if (isSwapping || isLoadingQuote || isLoadingSwap) return true
    if (!inputAmount || parseFloat(inputAmount) <= 0) return true
    if (!quote) return true
    if (parseFloat(inputAmount) > inputBalance) return true
    if (inputToken.address === outputToken.address) return true // Same token check

    // Additional validation
    const numValue = parseFloat(inputAmount)
    if (isNaN(numValue) || !isFinite(numValue)) return true

    return false
  }, [
    wallet.connected,
    isSwapping,
    isLoadingQuote,
    isLoadingSwap,
    inputAmount,
    quote,
    inputBalance,
    inputToken.address,
    outputToken.address,
  ])

  // Retry quote fetch
  const handleRetryQuote = useCallback(() => {
    if (retryCount < 3) {
      setRetryCount((prev) => prev + 1)
      fetchQuote()
    } else {
      showToast(
        "Maximum retry attempts reached. Please try again later.",
        "error"
      )
    }
  }, [retryCount, fetchQuote, showToast])

  // Get user-friendly error message
  const getUserFriendlyError = useCallback(
    (error: any): string => {
      if (!error) return ""

      switch (error.code) {
        case "NETWORK_ERROR":
          return "Network error. Please check your connection."
        case "RATE_LIMIT_EXCEEDED":
          return "Too many requests. Please wait a moment."
        case "TIMEOUT":
          return "Request timed out. Please try again."
        case "INSUFFICIENT_FUNDS":
          return `Insufficient ${inputToken.symbol} balance`
        case "USER_REJECTED":
          return "Transaction cancelled by user"
        case "WALLET_NOT_FOUND":
          return "Wallet not found. Please install a Solana wallet."
        case "WALLET_NOT_READY":
          return "Wallet is not ready. Please unlock your wallet."
        case "TRANSACTION_EXPIRED":
          return "Transaction expired. Please try again."
        default:
          return error.message || "An error occurred. Please try again."
      }
    },
    [inputToken.symbol]
  )

  const [showRateDetails, setShowRateDetails] = useState(false)

  const [isSwapped, setIsSwapped] = useState(false)

  const handleToggleSwap = () => {
    setIsSwapped(!isSwapped)
  }

  const [showMainButton, setShowMainButton] = useState(false);

  return (
    <>
      {/* Toast Container */}
      <ToastContainer />

      {/* Token Selection Modals */}
      <TokenSelectionModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onTokenSelect={handleInputTokenSelect}
        excludeToken={outputToken.address}
        userWallet={wallet.address || undefined}
        title="Select Input Token"
      />

      <TokenSelectionModal
        isOpen={isOutputModalOpen}
        onClose={() => setIsOutputModalOpen(false)}
        onTokenSelect={handleOutputTokenSelect}
        excludeToken={inputToken.address}
        userWallet={wallet.address || undefined}
        title="Select Output Token"
      />

      {/* Market Order Widget */}
      <div className="market-bx mb-3">
        <div className="market-title-bx">
          <h6>market order</h6>
        </div>
        <div className="ultra-pro-bx relative">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div>
              <a href="javascript:void(0)" className="plan-btn">
                <IoSparklesOutline
                  style={{ color: "#2B6AD1", marginRight: "5px" }}
                />
                ultra v3 <HiChevronUpDown />
              </a>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="plan-btn flex items-center gap-1">
                Slippage: <span style={{ color: "#EBEBEB" }}>5.00%</span>
              </span>
              {isLoading&& <a href="javascript:void(0)" style={{ color: "#EBEBEB" }}>
                <span>
                  <RiLoader2Fill
                    className={isLoadingQuote ? "animate-spin" : ""}
                  />
                </span>
              </a>}
            </div>
          </div>
          <div className="market-card">
            {/* Wallet Status */}
            {wallet.connected && wallet.address && (
              <div className="mb-2 p-2 bg-[#1A1A1A] rounded text-xs text-gray-400">
                <span className="font-mono">
                  {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
                </span>
              </div>
            )}

            {/* Error Display */}
            {(walletError || swapError) && (
              <div className="mb-2 p-2 bg-red-900/20 border border-red-500/50 rounded text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-red-400">
                    {getUserFriendlyError(walletError || swapError)}
                  </span>
                  {swapError && retryCount < 3 && (
                    <button
                      onClick={handleRetryQuote}
                      className="text-blue-400 hover:text-blue-300 underline ml-2"
                      type="button"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Insufficient Balance Warning */}
            {wallet.connected &&
              inputAmount &&
              parseFloat(inputAmount) > inputBalance && (
                <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-500/50 rounded text-xs text-yellow-400">
                  Insufficient {inputToken.symbol} balance. You have{" "}
                  {inputBalance.toFixed(4)} {inputToken.symbol}
                </div>
              )}

            {/* Same Token Warning */}
            {wallet.connected && inputToken.address === outputToken.address && (
              <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-500/50 rounded text-xs text-yellow-400">
                Input and output tokens must be different
              </div>
            )}

            {/* Swap Status */}
            {swapStatus && (
              <div
                className={`mb-2 p-2 rounded text-xs ${swapStatus.includes("confirmed") ||
                    swapStatus.includes("success")
                    ? "bg-green-900/20 border border-green-500/50 text-green-400"
                    : swapStatus.includes("failed") ||
                      swapStatus.includes("error") ||
                      swapStatus.includes("cancelled")
                      ? "bg-red-900/20 border border-red-500/50 text-red-400"
                      : "bg-blue-900/20 border border-blue-500/50 text-blue-400"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>{swapStatus}</span>
                  {isSwapping && (
                    <RiLoader2Fill className="animate-spin ml-2" />
                  )}
                </div>
                {lastTxSignature && (
                  <a
                    href={`https://solscan.io/tx/${lastTxSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block underline hover:text-white"
                  >
                    View on Solscan →
                  </a>
                )}
              </div>
            )}

            {/* Jupiter Ultra handles priority level automatically - no manual selection needed */}

            {/* <div className="trade-box">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="trade-label">SELLING</span>
                <div className="d-flex align-items-center gap-1">
                  <span className="trade-label d-flex align-items-center gap-1">
                    {" "}
                    <IoWalletOutline /> 0.00 Sol
                  </span>
                  <div className="d-flex align-items-center gap-1">
                    <button className="halft-max-btn">Half</button>
                    <button className="halft-max-btn">Max</button>
                  </div>
                </div>

                {wallet.connected && (
                  <span className="text-xs text-gray-400">
                    Balance: {inputBalance.toFixed(4)} {inputToken.symbol}
                  </span>
                )}
              </div>
              <div className="trade-row">
                <button
                  onClick={() => setIsInputModalOpen(true)}
                  className="plan-btn"
                  type="button"
                >
                  <span className="dollar-pic-bx">
                    <img
                      src={inputToken.image || DefaultTokenImage}
                      alt={inputToken.symbol}
                      onError={(e) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  </span>
                  <span style={{ color: "#EBEBEB", margin: "0px 5px" }}>
                    {inputToken.symbol}
                  </span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>

                <div className="amount-box">
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => handleInputAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="amount-input main-amount"
                    // disabled={!wallet.connected}
                    min="0"
                    step="any"
                  />
                  <div className="d-flex justify-content-end align-items-center">
                    <span className="text-xs text-gray-400">
                      {inputAmount && parseFloat(inputAmount) > 0
                        ? `~$${(parseFloat(inputAmount) * 1).toFixed(2)}`
                        : "$0"}
                    </span>
                    {wallet.connected && inputBalance > 0 && (
                      <button
                        onClick={handleMaxClick}
                        className="text-xs text-blue-400 hover:text-blue-300 ml-2"
                        type="button"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="trade-box trade-new-bx">
              <div className="swap-toggle-bx">
                <button
                  onClick={handleSwapTokens}
                  className="swap-icon"
                  type="button"
                  disabled={!wallet.connected}
                >
                  <RiArrowUpDownFill />
                </button>
              </div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="trade-label">buying</span>
                <span className="trade-label d-flex align-items-center gap-1">

                  <IoWalletOutline /> 0.00 Usdc
                </span>
              </div>
              <div className="trade-row">
                <button
                  onClick={() => setIsOutputModalOpen(true)}
                  className="plan-btn"
                  type="button"
                >
                  <span className="dollar-pic-bx">
                    <img
                      src={outputToken.image || DefaultTokenImage}
                      alt={outputToken.symbol}
                      onError={(e) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  </span>
                  <span style={{ color: "#EBEBEB", margin: "0px 4px" }}>
                    {outputToken.symbol}
                  </span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
                <div className="amount-box">
                  {isLoadingQuote ? (
                    <div className="nw-skeleton">
                      <div className="skeleton-amount mb-1"></div>
                      <div className="skeleton-usd"></div>
                    </div>
                  ) : (
                    <>
                      <h2>{outputAmount || "0.00"}</h2>
                      <span>
                        {outputAmount && parseFloat(outputAmount) > 0
                          ? `~$${(parseFloat(outputAmount) * 1).toFixed(2)}`
                          : "$0"}
                      </span>
                    </>
                  )}
                </div>



              </div>
            </div> */}

           <div>
  {isSwapped ? (
    <div className="trade-box trade-new-bx">
              {/* <div className="swap-toggle-bx">
                <button
                  onClick={handleSwapTokens}
                  className="swap-icon"
                  type="button"
                  disabled={!wallet.connected}
                >
                  <RiArrowUpDownFill />
                </button>
              </div> */}
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="trade-label">buying</span>
                <span className="trade-label d-flex align-items-center gap-1">

                  <IoWalletOutline /> 0.00 Usdc
                </span>
              </div>
              <div className="trade-row">
                <button
                  onClick={() => setIsOutputModalOpen(true)}
                  className="plan-btn"
                  type="button"
                >
                  <span className="dollar-pic-bx">
                    <img
                      src={outputToken.image || DefaultTokenImage}
                      alt={outputToken.symbol}
                      onError={(e) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  </span>
                  <span style={{ color: "#EBEBEB", margin: "0px 4px" }}>
                    {outputToken.symbol}
                  </span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
                <div className="amount-box">
                  {isLoadingQuote ? (
                    <div className="nw-skeleton">
                      <div className="skeleton-amount mb-1"></div>
                      <div className="skeleton-usd"></div>
                    </div>
                  ) : (
                    <>
                      <h2>{outputAmount || "0.00"}</h2>
                      <span>
                        {outputAmount && parseFloat(outputAmount) > 0
                          ? `~$${(parseFloat(outputAmount) * 1).toFixed(2)}`
                          : "$0"}
                      </span>
                    </>
                  )}
                </div>



              </div>
     </div>
  ) : (
  
    <div className="trade-box ">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="trade-label">SELLING</span>
                 <div className="d-flex align-items-center gap-1">
                  <span className="trade-label d-flex align-items-center gap-1"> <IoWalletOutline /> 0.00 Sol</span>
                  <div className="d-flex align-items-center gap-1">
                    <button className="halft-max-btn">Half</button>
                  <button className="halft-max-btn">Max</button>
                  </div>
                </div>

                {wallet.connected && (
                  <span className="text-xs text-gray-400">
                    Balance: {inputBalance.toFixed(4)} {inputToken.symbol}
                  </span>
                )}
              </div>
              <div className="trade-row">
                <button
                  onClick={() => setIsInputModalOpen(true)}
                  className="plan-btn"
                  type="button"
                >
                  <span className="dollar-pic-bx">
                    <img
                      src={inputToken.image || DefaultTokenImage}
                      alt={inputToken.symbol}
                      onError={(e) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  </span>
                  <span style={{ color: "#EBEBEB", margin: "0px 5px" }}>
                    {inputToken.symbol}
                  </span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>

                <div className="amount-box">
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => handleInputAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="amount-input main-amount"
                    // disabled={!wallet.connected}
                    min="0"
                    step="any"
                  />
                  <div className="d-flex justify-content-end align-items-center">
                    <span className="text-xs text-gray-400">
                      {inputAmount && parseFloat(inputAmount) > 0
                        ? `~$${(parseFloat(inputAmount) * 1).toFixed(2)}`
                        : "$0"}
                    </span>
                    {wallet.connected && inputBalance > 0 && (
                      <button
                        onClick={handleMaxClick}
                        className="text-xs text-blue-400 hover:text-blue-300 ml-2"
                        type="button"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
              </div>
     </div>
  )}
  <div className="text-center my-2 swap-toggle-bx">
    <button
      type="button"
      className="swap-icon"
      onClick={handleToggleSwap}
    >
      ⇅
    </button>
  </div>

  {isSwapped ? (
   
    <div className="trade-box">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="trade-label">SELLING</span>
                 <div className="d-flex align-items-center gap-1">
                  <span className="trade-label d-flex align-items-center gap-1"> <IoWalletOutline /> 0.00 Sol</span>
                  <div className="d-flex align-items-center gap-1">
                    <button className="halft-max-btn">Half</button>
                  <button className="halft-max-btn">Max</button>
                  </div>
                </div>
                {wallet.connected && (
                  <span className="text-xs text-gray-400">
                    Balance: {inputBalance.toFixed(4)} {inputToken.symbol}
                  </span>
                )}
              </div>
              <div className="trade-row">
                <button
                  onClick={() => setIsInputModalOpen(true)}
                  className="plan-btn"
                  type="button"
                >
                  <span className="dollar-pic-bx">
                    <img
                      src={inputToken.image || DefaultTokenImage}
                      alt={inputToken.symbol}
                      onError={(e) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  </span>
                  <span style={{ color: "#EBEBEB", margin: "0px 5px" }}>
                    {inputToken.symbol}
                  </span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>

                <div className="amount-box">
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => handleInputAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="amount-input main-amount"
                    // disabled={!wallet.connected}
                    min="0"
                    step="any"
                  />
                  <div className="d-flex justify-content-end align-items-center">
                    <span className="text-xs text-gray-400">
                      {inputAmount && parseFloat(inputAmount) > 0
                        ? `~$${(parseFloat(inputAmount) * 1).toFixed(2)}`
                        : "$0"}
                    </span>
                    {wallet.connected && inputBalance > 0 && (
                      <button
                        onClick={handleMaxClick}
                        className="text-xs text-blue-400 hover:text-blue-300 ml-2"
                        type="button"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
  ) : (
   
    <div className="trade-box trade-new-bx">
              {/* <div className="swap-toggle-bx">
                <button
                  onClick={handleSwapTokens}
                  className="swap-icon"
                  type="button"
                  disabled={!wallet.connected}
                >
                  <RiArrowUpDownFill />
                </button>
              </div> */}
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="trade-label">buying</span>
                <span className="trade-label d-flex align-items-center gap-1">

                  <IoWalletOutline /> 0.00 Usdc
                </span>
              </div>
              <div className="trade-row">
                <button
                  onClick={() => setIsOutputModalOpen(true)}
                  className="plan-btn"
                  type="button"
                >
                  <span className="dollar-pic-bx">
                    <img
                      src={outputToken.image || DefaultTokenImage}
                      alt={outputToken.symbol}
                      onError={(e) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  </span>
                  <span style={{ color: "#EBEBEB", margin: "0px 4px" }}>
                    {outputToken.symbol}
                  </span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
                <div className="amount-box">
                  {isLoadingQuote ? (
                    <div className="nw-skeleton">
                      <div className="skeleton-amount mb-1"></div>
                      <div className="skeleton-usd"></div>
                    </div>
                  ) : (
                    <>
                      <h2>{outputAmount || "0.00"}</h2>
                      <span>
                        {outputAmount && parseFloat(outputAmount) > 0
                          ? `~$${(parseFloat(outputAmount) * 1).toFixed(2)}`
                          : "$0"}
                      </span>
                    </>
                  )}
                </div>



              </div>
     </div>
  )}

        </div>


            {/* <div>
                  {!wallet.connected ? (
                    <button
                      onClick={handleConnectWallet}
                      className="connect-wallet-btn"
                      disabled={isWalletLoading}
                      type="button"
                    >
                      {isWalletLoading ? (
                        <span className="flex items-center justify-center">
                          <RiLoader2Fill className="animate-spin mr-2" />
                          CONNECTING...
                        </span>
                      ) : (
                        "CONNECT WALLET"
                      )}

                      <span className="corner top-right"></span>
                      <span className="corner bottom-left"></span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSwap}
                      className="connect-wallet-btn"
                      disabled={isSwapDisabled}
                      type="button"
                      title={
                        !inputAmount || parseFloat(inputAmount) <= 0
                          ? "Enter an amount"
                          : parseFloat(inputAmount) > inputBalance
                            ? `Insufficient ${inputToken.symbol} balance`
                            : inputToken.address === outputToken.address
                              ? "Input and output tokens must be different"
                              : !quote
                                ? "Fetching quote..."
                                : ""
                      }
                    >
                      {isSwapping ? (
                        <span className="flex items-center justify-center">
                          <RiLoader2Fill className="animate-spin mr-2" />
                          SWAPPING...
                        </span>
                      ) : isLoadingQuote ? (
                        <span className="flex items-center justify-center">
                          <RiLoader2Fill className="animate-spin mr-2" />
                          LOADING...
                        </span>
                      ) : (
                        "SWAP"
                      )}

                      <span className="corner top-right"></span>
                      <span className="corner bottom-left"></span>
                    </button>
                  )}
               
            </div> */}


            {!isConnect && <div className="">
              {!wallet.connected ? (
                <button
                  onClick={handleConnectWallet}
                  className="connect-wallet-btn "
                  disabled={isWalletLoading}
                  type="button"
                >
                  {isWalletLoading ? (
                    <span className="flex items-center justify-center">
                      <RiLoader2Fill className="animate-spin mr-2" />
                      CONNECTING...
                    </span>
                  ) : (
                    "CONNECT WALLET"
                  )}

                  <span className="corner top-right"></span>
                  <span className="corner bottom-left"></span>
                </button>
              ) : (
                <button
                  onClick={handleSwap}
                  className="connect-wallet-btn"
                  disabled={isSwapDisabled}
                  type="button"
                  title={
                    !inputAmount || parseFloat(inputAmount) <= 0
                      ? "Enter an amount"
                      : parseFloat(inputAmount) > inputBalance
                        ? `Insufficient ${inputToken.symbol} balance`
                        : inputToken.address === outputToken.address
                          ? "Input and output tokens must be different"
                          : !quote
                            ? "Fetching quote..."
                            : ""
                  }
                >
                  {isSwapping ? (
                    <span className="flex items-center justify-center">
                      <RiLoader2Fill className="animate-spin mr-2" />
                      SWAPPING...
                    </span>
                  ) : isLoadingQuote ? (
                    <span className="flex items-center justify-center">
                      <RiLoader2Fill className="animate-spin mr-2" />
                      LOADING...
                    </span>
                  ) : (
                    "SWAP"
                  )}
                  <span className="corner top-right"></span>
                  <span className="corner bottom-left"></span>
                </button>
              )}
            </div>}


{/* Execute Btn */}
{ isConnect && <button className="execute-btn loading mt-2">
  <span className="btn-text executing-text">
    EXECUTING TRANSACTION<span className="dots"></span>
  </span>
  <span className="excute-corner top-left"></span>
  <span className="excute-corner top-right"></span>
  <span className="excute-corner bottom-right"></span>
  <span className="excute-corner bottom-left"></span>
</button>}



            {/* <div className="">
                            {!wallet.connected ? (
                                <button
                                    onClick={handleConnectWallet}
                                    className="swap-btn"
                                    disabled={isWalletLoading}
                                    type="button"

                                >
                                    {isWalletLoading ? (
                                        <span className="flex items-center justify-center">
                                            <RiLoader2Fill className="animate-spin mr-2" />
                                            CONNECTING...
                                        </span>
                                    ) : (
                                        "Swap"
                                    )}

                                    <span className="corner top-right"></span>
                                    <span className="corner bottom-left"></span>
                                </button>
                            ) : (

                                <button
                                    onClick={handleSwap}
                                    className="connect-wallet-btn"
                                    disabled={isSwapDisabled}
                                    type="button"
                                    title={
                                        !inputAmount || parseFloat(inputAmount) <= 0
                                            ? "Enter an amount"
                                            : parseFloat(inputAmount) > inputBalance
                                                ? `Insufficient ${inputToken.symbol} balance`
                                                : inputToken.address === outputToken.address
                                                    ? "Input and output tokens must be different"
                                                    : !quote
                                                        ? "Fetching quote..."
                                                        : ""
                                    }
                                >
                                    {isSwapping ? (
                                        <span className="flex items-center justify-center">
                                            <RiLoader2Fill className="animate-spin mr-2" />
                                            SWAPPING...
                                        </span>
                                    ) : isLoadingQuote ? (
                                        <span className="flex items-center justify-center">
                                            <RiLoader2Fill className="animate-spin mr-2" />
                                            LOADING...
                                        </span>
                                    ) : (
                                        "SWAP"
                                    )}
                                    <span className="corner top-right"></span>
                                    <span className="corner bottom-left"></span>
                                </button>
                                
                            )}
             </div> */}

            {/* Exchange Rate and Fee Display */}

            {/* {exchangeRate && (
                                <a href="javascript:void(0)" className="">
                                    <div className="rate-box mt-3">
                                        <div className="d-flex align-items gap-2">
                                            <span>RATE</span>
                                            <h5>{exchangeRate}</h5>
                                        </div>
                                        {platformFeeDisplay && (
                                            <div className="d-flex align-items gap-2 mt-1">
                                                <span className="text-xs text-gray-400">Platform Fee</span>
                                                <span className="text-xs text-gray-300">{platformFeeDisplay}</span>
                                            </div>
                                        )}
                                        {quote && quote.priceImpactPct && (
                                            <div className="d-flex align-items gap-2 mt-1">
                                                <span className="text-xs text-gray-400">Price Impact</span>
                                                <span className="text-xs text-gray-300">{parseFloat(quote.priceImpactPct).toFixed(2)}%</span>
                                            </div>
                                        )}
                                    </div>
                                </a>
                            )} */}

            {exchangeRate && (
              <a
                href="javascript:void(0)"
                onClick={() => setShowRateDetails(!showRateDetails)}
              >
                <div className="rate-box mt-3 ">
                  <div className="d-flex align-items gap-2 justify-content-between">
                    <div className="d-flex align-items gap-2">
                      <span>RATE</span>
                      <h5>{exchangeRate}</h5>
                    </div>

                    <FontAwesomeIcon
                      icon={showRateDetails ? faChevronUp : faChevronDown}
                      className="rate-chevron ms-auto"
                    />
                  </div>

                  {showRateDetails && platformFeeDisplay && (
                    <div className="d-flex align-items gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        Platform Fee
                      </span>
                      <span className="text-xs text-gray-300">
                        {platformFeeDisplay}
                      </span>
                    </div>
                  )}

                  {showRateDetails && quote && quote.priceImpactPct && (
                    <div className="d-flex align-items gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        Price Impact
                      </span>
                      <span className="text-xs text-gray-300">
                        {parseFloat(quote.priceImpactPct).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Hot KOL Coins */}
      <div className="market-bx ultra-pro-bx nw-market-bx">
        <div className="py-2">
          <span className="trading-icon-title">HOT KOL COINS</span>
        </div>
        <div className="hot-coins-card">
          {/* These would be populated from API in production */}
          <div className="coin-row">
            <div className="coin-left">
              <span className="rank">#1</span>
              <img
                src="/hot-coin.png"
                className="coin-img"
                alt="coin"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
              <div className="coin-info">
                <div className="coin-title">
                  <span className="coin-name">TRUMP</span>
                  <span className="coin-sub">OFFICIAL TRUMP</span>
                  <span className="nw-coin-badge">
                    <IoMdTrendingUp /> 2.10%
                  </span>
                </div>
                <div className="coin-meta">MC: $1.40B / AGE: 10M</div>
              </div>
            </div>
            <button
              className="quick-buy-btn"
              onClick={() =>
                handleQuickBuy({
                  // TODO: Replace with real token address from API
                  address: "So11111111111111111111111111111111111111112", // Placeholder - use SOL for testing
                  symbol: "TRUMP",
                  name: "OFFICIAL TRUMP",
                  decimals: 9,
                })
              }
              disabled={
                !wallet.connected ||
                !inputAmount ||
                parseFloat(inputAmount) <= 0
              }
            >
              QUICK BUY
            </button>
          </div>
          <div className="coin-row">
            <div className="coin-left">
              <span className="rank">#2</span>
              <div className="coin-circle">
                <span>S</span>
              </div>
              <div className="coin-info">
                <div className="coin-title">
                  <span className="coin-name">SOLO</span>
                  <span className="coin-sub">SOLOMON</span>
                  <span className=" nw-coin-badge">
                    <IoMdTrendingUp /> 2.10%
                  </span>
                </div>
                <div className="coin-meta">MC: $23.8M / AGE: 19H</div>
              </div>
            </div>
            <button
              className="quick-buy-btn"
              onClick={() =>
                handleQuickBuy({
                  // TODO: Replace with real token address from API
                  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Placeholder - use USDC for testing
                  symbol: "SOLO",
                  name: "SOLOMON",
                  decimals: 6,
                })
              }
              disabled={
                !wallet.connected ||
                !inputAmount ||
                parseFloat(inputAmount) <= 0
              }
            >
              QUICK BUY
            </button>
          </div>
          <div className="coin-row">
            <div className="coin-left">
              <span className="rank">#3</span>
              <div className="coin-circle">
                <span>J</span>
              </div>
              <div className="coin-info">
                <div className="coin-title">
                  <span className="coin-name">JAZZ</span>
                  <span className="coin-sub">JAZZ HANDS</span>
                  <span className="coin-badge down">
                    <FontAwesomeIcon icon={faArrowTrendDown} /> 1.50%
                  </span>
                </div>
                <div className="coin-meta">MC: $5.2M / AGE: 3D</div>
              </div>
            </div>
            <button
              className="quick-buy-btn"
              onClick={() =>
                handleQuickBuy({
                  // TODO: Replace with real token address from API
                  address: "So11111111111111111111111111111111111111112", // Placeholder - use SOL for testing
                  symbol: "JAZZ",
                  name: "JAZZ HANDS",
                  decimals: 9,
                })
              }
              disabled={
                !wallet.connected ||
                !inputAmount ||
                parseFloat(inputAmount) <= 0
              }
            >
              QUICK BUY
            </button>
          </div>
          <div className="coin-row">
            <div className="coin-left">
              <span className="rank">#4</span>
              <div className="coin-circle">
                <span>P</span>
              </div>
              <div className="coin-info">
                <div className="coin-title">
                  <span className="coin-name">PIXEL</span>
                  <span className="coin-sub">PIXEL PALS</span>
                  <span className="nw-coin-badge">
                    <IoMdTrendingUp /> 3.20%
                  </span>
                </div>
                <div className="coin-meta">MC: $12.4M / AGE: 2W</div>
              </div>
            </div>
            <button
              className="quick-buy-btn"
              onClick={() =>
                handleQuickBuy({
                  // TODO: Replace with real token address from API
                  address: "So11111111111111111111111111111111111111112", // Placeholder - use SOL for testing
                  symbol: "PIXEL",
                  name: "PIXEL PALS",
                  decimals: 9,
                })
              }
              disabled={
                !wallet.connected ||
                !inputAmount ||
                parseFloat(inputAmount) <= 0
              }
            >
              QUICK BUY
            </button>
          </div>
          <div className="coin-row">
            <div className="coin-left">
              <span className="rank">#5</span>
              <div className="coin-circle">
                <span>G</span>
              </div>
              <div className="coin-info">
                <div className="coin-title">
                  <span className="coin-name">GXY</span>
                  <span className="coin-sub">GALAXY</span>
                  <span className="nw-coin-badge">
                    <IoMdTrendingUp /> 2.00%
                  </span>
                </div>
                <div className="coin-meta">MC: $8.1M / AGE: 1M</div>
              </div>
            </div>
            <button
              className="quick-buy-btn"
              onClick={() =>
                handleQuickBuy({
                  // TODO: Replace with real token address from API
                  address: "So11111111111111111111111111111111111111112", // Placeholder - use SOL for testing
                  symbol: "GXY",
                  name: "GALAXY",
                  decimals: 9,
                })
              }
              disabled={
                !wallet.connected ||
                !inputAmount ||
                parseFloat(inputAmount) <= 0
              }
            >
              QUICK BUY
            </button>
          </div>
        </div>
      </div>

      {/* data-bs-toggle="modal" data-bs-target="#swapModal" */}
      <div
        className="modal fade"
        id="swapModal"
        tabIndex={-1}
        aria-labelledby="exampleModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered modal-sm">
          <div className="modal-content nw-sign-frm p-0">
            <div className="modal-body">
              <div className="row">
                <div className="col-lg-12">
                  <div className="swap-transition-bx">
                    {/* <span className="swap-check"><MdOutlineCheckBox /></span> */}
                    <div>
                      <h5>Transaction confirmed</h5>
                      <p>swapped 20 sol for 5,809 trump</p>
                      <div className="d-flex align-items-center gap-2">
                        <a href="javscript:void(0)" className="plan-btn">
                          view tx
                        </a>
                        <a href="javscript:void(0)" className="plan-btn">
                          close
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default RightSidebarNew
