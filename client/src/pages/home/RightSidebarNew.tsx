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
import "../../components/swap/swap.css"
import { IoMdTrendingUp } from "react-icons/io"
import { RiArrowUpDownFill } from "react-icons/ri"
import { IoWalletOutline } from "react-icons/io5"
import SwapModal from "../../components/swap/SwapModal"

// import { MdOutlineCheckBox } from "react-icons/md";

interface RightSidebarNewProps {
  selectedToken?: any

  pageType?: 'alpha' | 'kol' // Determine which page we're on (alpha streams or kol feed)
  transactions?: any[] // Whale transactions for calculating hot coins
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

  pageType = 'alpha', // Default to 'alpha' for Alpha Streams page
  transactions = [] // Default to empty array
}: RightSidebarNewProps) => {
  // Wallet connection hook
  const {
    wallet,
    connect,
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
  const { showToast } = useToast()

  // State management
  const [inputToken, setInputToken] = useState<TokenInfo>(DEFAULT_INPUT_TOKEN)
  const [outputToken, setOutputToken] =
    useState<TokenInfo>(DEFAULT_OUTPUT_TOKEN)
  const [isLoading, setIsLoading] = useState(false)
  const [inputAmount, setInputAmount] = useState<string>("") // Empty by default - user must enter amount
  const [outputAmount, setOutputAmount] = useState<string>("")
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [slippage] = useState<number>(500) // Fixed 5% slippage (500 BPS) - NOT dynamic
  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false)
  const [inputBalance, setInputBalance] = useState<number>(0)
  const [outputBalance, setOutputBalance] = useState<number>(0)
  const [isSwapping, setIsSwapping] = useState(false)
  const [swapProgress, setSwapProgress] = useState<number>(0) // Progress bar percentage (0-100)
  const [swapButtonStatus, setSwapButtonStatus] = useState<'idle' | 'executing' | 'success'>('idle') // Button animation status
  const [isConnect, setISConnect] = useState(false)
  const [swapStatus, setSwapStatus] = useState<string>("")
  const [lastTxSignature, setLastTxSignature] = useState<string>("")
  const [retryCount, setRetryCount] = useState<number>(0)

  // Auto-reset form after success (robust reset logic)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    if (swapButtonStatus === 'success') {
      timeoutId = setTimeout(() => {
        // Reset ALL states as requested by user
        setInputAmount("")
        setOutputAmount("")
        setQuote(null)
        setRetryCount(0)

        // Reset UI states
        setSwapButtonStatus('idle')
        setSwapProgress(0)
        setIsSwapping(false)
        setLastTxSignature("") // Clear signature as well if desired, or keep separate
        clearErrors()
      }, 2000)
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [swapButtonStatus, clearErrors])

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



  // Fetch input token balance when wallet connects or token changes
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      // Fetch immediately when wallet connects or tokens change
      // Fetch input balance
      getBalance(
        inputToken.address === "So11111111111111111111111111111111111111112"
          ? undefined
          : inputToken.address
      )
        .then((balance) => setInputBalance(balance))
        .catch(() => setInputBalance(0))

      // Fetch output balance
      getBalance(
        outputToken.address === "So11111111111111111111111111111111111111112"
          ? undefined
          : outputToken.address
      )
        .then((balance) => setOutputBalance(balance))
        .catch(() => setOutputBalance(0))
    } else {
      setInputBalance(0)
      setOutputBalance(0)
    }
  }, [wallet.connected, wallet.publicKey, inputToken.address, outputToken.address, getBalance])

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
      setInputBalance(0)
      showToast("Failed to fetch token balance", "error")
    }
  }, [getBalance, inputToken.address, showToast])

  // Fetch output token balance
  const fetchOutputBalance = useCallback(async () => {
    try {
      const balance = await getBalance(
        outputToken.address === "So11111111111111111111111111111111111111112"
          ? undefined
          : outputToken.address
      )
      setOutputBalance(balance)
    } catch (error) {
      setOutputBalance(0)
      // Don't show toast for output balance fetch failure to avoid spam
    }
  }, [getBalance, outputToken.address])

  // Listen for global balance change events
  useEffect(() => {
    const handleBalanceChange = () => {
      fetchInputBalance()
      fetchOutputBalance()
    }

    window.addEventListener('wallet-balance-changed', handleBalanceChange)

    return () => {
      window.removeEventListener('wallet-balance-changed', handleBalanceChange)
    }
  }, [fetchInputBalance, fetchOutputBalance])

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
        setOutputAmount("0.00")
        showToast("Invalid quote response. Please try again.", "error")
        return
      }

      const outAmount =
        parseFloat(outAmountRaw) / Math.pow(10, outputToken.decimals)

      // Validate calculated amount
      if (isNaN(outAmount) || !isFinite(outAmount)) {
        setOutputAmount("0.00")
        showToast("Invalid quote calculation. Please try again.", "error")
        return
      }

      setOutputAmount(outAmount.toFixed(6))
      setIsLoading(false)
      setRetryCount(0) // Reset retry count on success
    } catch (error: any) {
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

  // Handle wallet connection - opens standard wallet modal
  const handleConnectWallet = useCallback(async () => {
    // Open the standard wallet modal
    await connect()
  }, [connect])

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
    const tempBalance = inputBalance
    setInputToken(outputToken)
    setOutputToken(tempToken)
    setInputBalance(outputBalance)
    setOutputBalance(tempBalance)
    setInputAmount("")
    setOutputAmount("")
    setQuote(null)
  }, [inputToken, outputToken, inputBalance, outputBalance])

  // Handle half button
  const handleHalfClick = useCallback(() => {
    if (inputBalance > 0) {
      // Calculate half of the balance
      let halfAmount = inputBalance / 2

      // Reserve some SOL for transaction fees if input is SOL
      if (inputToken.address === "So11111111111111111111111111111111111111112") {
        const maxAmount = Math.max(0, inputBalance - 0.01) // Reserve 0.01 SOL for fees
        halfAmount = maxAmount / 2
      }

      // Validate half amount is positive
      if (halfAmount <= 0) {
        showToast("Insufficient balance", "error")
        return
      }

      setInputAmount(halfAmount.toFixed(inputToken.decimals))
    }
  }, [inputBalance, inputToken.address, inputToken.decimals, showToast])

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
      setSwapButtonStatus('executing') // Start animation
      setSwapProgress(0) // Reset progress
      clearErrors()

      // Simulate smooth progress animation
      const progressInterval = setInterval(() => {
        setSwapProgress(prev => {
          if (prev >= 90) return prev // Cap at 90% until transaction completes
          return prev + Math.random() * 15 // Random increments for smooth animation
        })
      }, 200)

      // Get a FRESH quote right before swap to avoid stale route errors
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

      // Get swap transaction with Jupiter Ultra (priority level handled automatically)
      const swapResponse = await getSwapTransaction({
        quoteResponse: freshQuote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicSlippage: false, // Fixed slippage at 5%
      })

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

      // Show wallet signing prompt BEFORE sending with a small delay to ensure it renders
      showToast("Please sign the transaction in your wallet", "info")

      // Small delay to ensure toast renders before wallet popup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Send transaction (this will block until user signs or cancels)
      let signature: string
      try {
        signature = await sendTransaction(transaction)
      } catch (txError: any) {
        // Clear progress interval and re-throw
        clearInterval(progressInterval)
        throw txError
      }

      // Transaction successful - complete progress and show success
      clearInterval(progressInterval)
      setSwapProgress(100)
      setSwapButtonStatus('success')

      // Only show success and copy if we get here (user signed)
      setLastTxSignature(signature)

      // Copy transaction signature to clipboard
      await navigator.clipboard.writeText(signature)
      // Show transaction success toast with "View Tx" button
      showToast("Transaction successful!", "success", "transaction", { txSignature: signature })

      // Dispatch global event to update balances everywhere
      window.dispatchEvent(new CustomEvent('wallet-balance-changed'))

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

      // Track trade
      try {
        await trackTrade({
          signature,
          walletAddress: wallet.publicKey.toBase58(),
          inputMint: inputToken.address,
          outputMint: outputToken.address,
          inputAmount: inputAmountNum,
          outputAmount: outputAmountNum,
          platformFee,
        })
      } catch (trackError) {
        // Silently ignore - non-critical
      }

      // Reset form logic moved to useEffect watching swapButtonStatus

      // Refresh balances after successful transaction
      await fetchInputBalance()
      await fetchOutputBalance()

      setTimeout(() => {
        setLastTxSignature("")
      }, 5000)
    } catch (error: any) {
      // Show user-friendly error messages
      let errorMessage = "Swap failed. Please try again."
      let toastType: "error" | "info" = "error"

      // Safely extract error message and code
      const errorMsg =
        typeof error?.message === "string"
          ? error.message
          : String(error?.message || "")
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
      } else if (errorCode === "INSUFFICIENT_FUNDS" || errorMsg.toLowerCase().includes("insufficient")) {
        errorMessage = `Insufficient ${inputToken.symbol} balance`
      } else if (errorCode === "TRANSACTION_EXPIRED" || errorMsg.toLowerCase().includes("expired")) {
        errorMessage = "Transaction expired. Please try again."
      } else if (errorCode === "NETWORK_ERROR" || errorMsg.toLowerCase().includes("network")) {
        errorMessage = "Network error. Please check your connection."
      } else if (errorCode === "RATE_LIMIT_EXCEEDED" || errorMsg.toLowerCase().includes("rate limit")) {
        errorMessage = "Too many requests. Please wait a moment."
      } else if (
        errorMsg &&
        typeof errorMsg === "string" &&
        (errorMsg.toLowerCase().includes("simulation failed") ||
          errorMsg.toLowerCase().includes("custom program error") ||
          errorMsg.toLowerCase().includes("0x1"))
      ) {
        errorMessage = "Transaction simulation failed. Try increasing slippage or reducing amount."
      } else if (
        errorMsg &&
        typeof errorMsg === "string" &&
        errorMsg.toLowerCase().includes("slippage")
      ) {
        errorMessage = "Price changed too much. Please try again."
      } else if (errorMsg) {
        errorMessage = errorMsg
      }

      // Show the toast with appropriate type
      showToast(errorMessage, toastType)

      // Reset button animation states on error
      setSwapButtonStatus('idle')
      setSwapProgress(0)
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
    fetchOutputBalance,
    clearErrors,
    inputBalance,
    showToast,
    slippage,
  ])

  // Handle Quick Buy - opens SwapModal popup like HomePageNew
  const handleQuickBuy = useCallback(
    async (token: any) => {
      console.log('Quick Buy clicked:', token)

      if (!wallet.connected) {
        showToast("Please connect your wallet first", "error")
        return
      }

      // Extract token info for SwapModal
      const tokenInfo = {
        symbol: token.symbol,
        name: token.name || token.symbol,
        address: token.address || token.mint,
        image: token.image || token.logoURI,
        decimals: token.decimals || 9,
      }

      console.log('Opening SwapModal with token:', tokenInfo)

      // Open SwapModal in 'quickBuy' mode with SOL as input token
      setSwapTokenInfo(tokenInfo)
      setIsSwapModalOpen(true)
    },
    [wallet.connected, showToast]
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
    handleSwapTokens()
  }

  const [showMainButton, setShowMainButton] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const [swapTokenInfo, setSwapTokenInfo] = useState<any>(null)

  // Calculate hot coins based on transactions with new logic
  const hotCoins = useMemo(() => {
    console.log('Hot Coins Calculation - Total transactions:', transactions?.length)

    if (!transactions || transactions.length === 0) {
      console.log('No transactions available')
      return []
    }

    // New logic: Start with threshold 7, cascade down to 6, 5, 4 if no coins meet criteria
    const thresholds = [7, 6, 5, 4]
    let finalCoins: any[] = []

    for (const threshold of thresholds) {
      // Filter transactions with current hotness threshold
      const hotTransactions = transactions.filter((tx: any) => {
        const score = tx.hotnessScore || tx.hotness_score || 0
        return score >= threshold
      })

      console.log(`Threshold ${threshold}: ${hotTransactions.length} hot transactions`)

      // Count occurrences of each coin (using tokenOut for buy transactions)
      const coinFrequency = new Map<string, { count: number; data: any; maxScore: number }>()

      hotTransactions.forEach((tx: any) => {
        // Try multiple possible data structures
        const coinSymbol = tx.tokenOutSymbol ||
          tx.transaction?.tokenOut?.symbol ||
          tx.outTokenSymbol ||
          tx.token_out_symbol

        const coinAddress = tx.transaction?.tokenOut?.address ||
          tx.outTokenAddress ||
          tx.token_out_address

        const coinImage = tx.transaction?.tokenOut?.imageUrl ||
          tx.outTokenURL ||
          tx.token_out_image

        const coinName = tx.transaction?.tokenOut?.name ||
          tx.outTokenName ||
          tx.token_out_name ||
          coinSymbol

        const marketCap = tx.transaction?.tokenOut?.marketCap ||
          tx.outTokenMarketCap ||
          tx.token_out_market_cap ||
          '0'

        const currentScore = tx.hotnessScore || tx.hotness_score || 0

        if (coinSymbol && coinAddress) {
          const existing = coinFrequency.get(coinAddress)
          if (existing) {
            existing.count++
            // Track the highest hotness score for this coin
            existing.maxScore = Math.max(existing.maxScore, currentScore)
          } else {
            coinFrequency.set(coinAddress, {
              count: 1,
              maxScore: currentScore,
              data: {
                symbol: coinSymbol,
                address: coinAddress,
                image: coinImage,
                name: coinName,
                marketCap: marketCap,
                hotnessScore: currentScore
              }
            })
          }
        }
      })

      console.log(`Threshold ${threshold}: ${coinFrequency.size} unique coins`)

      // NEW LOGIC: Only show coins appearing 2+ times
      const eligibleCoins = Array.from(coinFrequency.values())
        .filter(coin => coin.count >= 2)
        .sort((a, b) => {
          // Primary sort: by hotness score (descending)
          if (b.maxScore !== a.maxScore) {
            return b.maxScore - a.maxScore
          }
          // Secondary sort: by frequency (descending)
          return b.count - a.count
        })
        .map(coin => ({
          ...coin.data,
          hotnessScore: coin.maxScore, // Use the highest score
          count: coin.count
        }))

      console.log(`Threshold ${threshold}: ${eligibleCoins.length} eligible coins (appearing 2+ times)`)

      // If we have any coins at this threshold, use them
      if (eligibleCoins.length > 0) {
        finalCoins = eligibleCoins.slice(0, 5) // Show top 5
        console.log(`Using threshold ${threshold} - found ${eligibleCoins.length} coins, showing top ${finalCoins.length}`)
        break
      }

      // Continue to next threshold if no coins found
      console.log(`No coins found at threshold ${threshold}, trying next threshold...`)
    }

    console.log('Final hot coins:', finalCoins)
    return finalCoins
  }, [transactions])

  return (
    <>
      {/* Toast Container */}


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

              {isLoading && <a href="javascript:void(0)" style={{ color: "#EBEBEB" }}>
                <span>
                  <RiLoader2Fill
                    className={isLoadingQuote ? "animate-spin" : ""}
                  />
                </span>
              </a>}
            </div>
          </div>
          <div className="market-card">
            {/* Input Token Section */}

            {/* All errors shown via toast popups - no UI box warnings */}

            {/* All status messages removed - using toast popups only */}

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
                    <button onClick={handleHalfClick} className="halft-max-btn" type="button">Half</button>
                    <button onClick={handleMaxClick} className="halft-max-btn" type="button">Max</button>
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

                  <IoWalletOutline /> {wallet.connected ? outputBalance.toFixed(4) : '0.00'} {outputToken.symbol}
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
              <div className="trade-interface-wrapper">
                {isSwapped ? (
                  <>
                    <div className="trade-box trade-new-bx">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="trade-label">buying</span>
                        <span className="trade-label d-flex align-items-center gap-1">

                          <IoWalletOutline /> {wallet.connected ? outputBalance.toFixed(4) : '0.00'} {outputToken.symbol}
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

                    <div className="swap-toggle-bx">
                      <button
                        type="button"
                        className="swap-icon"
                        onClick={handleToggleSwap}
                      >
                        ⇅
                      </button>
                    </div>

                    <div className="trade-box">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="trade-label">SELLING</span>
                        <div className="d-flex align-items-center gap-1">
                          <span className="trade-label d-flex align-items-center gap-1"> <IoWalletOutline /> {wallet.connected ? inputBalance.toFixed(4) : '0.00'} {inputToken.symbol}</span>
                          <div className="d-flex align-items-center gap-1">
                            <button onClick={handleHalfClick} className="halft-max-btn" type="button">Half</button>
                            <button onClick={handleMaxClick} className="halft-max-btn" type="button">Max</button>
                          </div>
                        </div>

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

                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="trade-box ">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="trade-label">SELLING</span>
                        <div className="d-flex align-items-center gap-1">
                          <span className="trade-label d-flex align-items-center gap-1"> <IoWalletOutline /> {wallet.connected ? inputBalance.toFixed(4) : '0.00'} {inputToken.symbol}</span>
                          <div className="d-flex align-items-center gap-1">
                            <button onClick={handleHalfClick} className="halft-max-btn" type="button">Half</button>
                            <button onClick={handleMaxClick} className="halft-max-btn" type="button">Max</button>
                          </div>
                        </div>


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

                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="swap-toggle-bx">
                      <button
                        type="button"
                        className="swap-icon"
                        onClick={handleToggleSwap}
                      >
                        ⇅
                      </button>
                    </div>

                    <div className="trade-box trade-new-bx">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="trade-label">buying</span>
                        <span className="trade-label d-flex align-items-center gap-1">

                          <IoWalletOutline /> {wallet.connected ? outputBalance.toFixed(4) : '0.00'} {outputToken.symbol}
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
                  </>
                )}
              </div>

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
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: swapButtonStatus === 'executing' ? '#050508' : '#162ECD',
                    transition: 'background-color 0.3s ease'
                  }}
                  disabled={isSwapDisabled || swapButtonStatus !== 'idle'}
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
                  {/* Progress Bar Background */}
                  {swapButtonStatus !== 'idle' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: `${swapProgress}%`,
                        background: 'linear-gradient(90deg, #162ECD 0%, #162ECD 80%, transparent 100%)',
                        boxShadow: '0 0 10px rgba(22, 46, 205, 0.4)',
                        transition: 'width 0.3s ease',
                        zIndex: 0
                      }}
                    />
                  )}

                  {/* Button Text */}
                  <span style={{ position: 'relative', zIndex: 1, fontWeight: 600, letterSpacing: '1px' }}>
                    {swapButtonStatus === 'executing' ? (
                      "EXECUTING TRANSACTION ..."
                    ) : swapButtonStatus === 'success' ? (
                      "TRANSACTION SUCCESSFUL"
                    ) : isLoadingQuote ? (
                      <span className="flex items-center justify-center">
                        <RiLoader2Fill className="animate-spin mr-2" />
                        LOADING...
                      </span>
                    ) : (
                      "SWAP"
                    )}
                  </span>

                  <span className="corner top-right"></span>
                  <span className="corner bottom-left"></span>
                </button>
              )}
            </div>}


            {/* Execute Btn */}
            {isConnect && <button className="execute-btn loading mt-2">
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
          <span className="trading-icon-title">{pageType === 'kol' ? 'HOT KOL COINS' : 'HOT COINS'}</span>
        </div>
        <div className="hot-coins-card">
          {hotCoins.length > 0 ? (
            hotCoins.map((coin, index) => (
              <div className="coin-row" key={coin.address || index}>
                <div className="coin-left">
                  <span className="rank">#{index + 1}</span>
                  {coin.image ? (
                    <img
                      src={coin.image}
                      className="coin-img"
                      alt={coin.symbol}
                      onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                        e.currentTarget.src = DefaultTokenImage
                      }}
                    />
                  ) : (
                    <div className="coin-circle">
                      <span>{coin.symbol?.charAt(0) || '?'}</span>
                    </div>
                  )}
                  <div className="coin-info">
                    <div className="coin-title">
                      <span className="coin-name">{coin.symbol || 'Unknown'}</span>
                      <span className="coin-sub">{coin.name || coin.symbol}</span>
                      <span className="nw-coin-badge">
                        <IoMdTrendingUp /> {coin.hotnessScore || 0}
                      </span>
                    </div>
                    <div className="coin-meta">
                      MC: ${coin.marketCap ? (parseFloat(coin.marketCap) / 1000000).toFixed(2) : '0'}M
                    </div>
                  </div>
                </div>
                <button
                  className="quick-buy-btn"
                  onClick={() =>
                    handleQuickBuy({
                      address: coin.address,
                      symbol: coin.symbol,
                      name: coin.name,
                      decimals: 9, // Default decimals for Solana tokens
                    })
                  }
                  aria-label={`Quick buy ${coin.symbol} token`}
                  title={`Quick buy this token with SOL`}
                  disabled={!wallet.connected}
                >
                  QUICK BUY
                </button>
              </div>
            ))
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              No hot coins available
            </div>
          )}
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

      {/* SwapModal for Quick Buy */}
      <SwapModal
        isOpen={isSwapModalOpen}
        onClose={() => {
          setIsSwapModalOpen(false)
          setSwapTokenInfo(null)
        }}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
        }}
        initialOutputToken={swapTokenInfo}

      />
    </>
  )
}

export default RightSidebarNew
