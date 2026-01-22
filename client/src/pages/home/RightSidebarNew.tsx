import { useState, useEffect, useCallback, useMemo } from "react"
import { IoSparklesOutline } from "react-icons/io5"
import { RiLoader2Fill } from "react-icons/ri"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
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
import { IoWalletOutline } from "react-icons/io5"
import { SwapModal } from "../../components/swap/SwapModal"


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
  usdPrice: 1,
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
  // Auth hook for login modal
  const { openLoginModal } = useAuth()

  // Wallet connection hook
  const {
    wallet,
    sendTransaction,
    getBalance,
    isLoading: isWalletLoading,
  } = useWalletConnection()

  // Swap API hook
  const {
    getQuote,
    getSwapTransaction,
    trackTrade,
    isLoadingQuote,
    isLoadingSwap,
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

  // Auto-reset form after success (robust reset logic)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    if (swapButtonStatus === 'success') {
      timeoutId = setTimeout(() => {
        // Reset ALL states as requested by user
        setInputAmount("")
        setOutputAmount("")
        setQuote(null)


        // Reset UI states
        setSwapButtonStatus('idle')
        setSwapProgress(0)
        setIsSwapping(false)
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

  // Listen for 'open-quick-buy' event
  useEffect(() => {
    const handleOpenQuickBuy = (event: any) => { // Type as any to avoid CustomEvent compilation issues if strict
      console.log('Received open-quick-buy event', event.detail);
      const token = event.detail;

      if (token) {
        console.log('Setting swap token info:', token);
        setSwapTokenInfo(token);
        setIsSwapModalOpen(true);
      }
    };

    window.addEventListener('open-quick-buy', handleOpenQuickBuy);
    return () => {
      window.removeEventListener('open-quick-buy', handleOpenQuickBuy);
    };
  }, []); // Empty dependency array to ensure listener is always active and not re-bound unnecessarily

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
      setIsLoading(false)
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

  // Fetch live prices for tokens if missing (Robust version)
  useEffect(() => {
    let isMounted = true

    const fetchLivePrices = async () => {
      const mintsToFetch = new Set<string>()

      // Always fetch if price is missing OR zero
      if ((!inputToken.usdPrice || inputToken.usdPrice === 0) && inputToken.address) {
        mintsToFetch.add(inputToken.address)
      }
      if ((!outputToken.usdPrice || outputToken.usdPrice === 0) && outputToken.address) {
        mintsToFetch.add(outputToken.address)
      }

      const addresses = Array.from(mintsToFetch)
      if (addresses.length === 0) return

      try {
        const prices: Record<string, number> = {}

        // 1. Try Jupiter Price API v2
        try {
          const ids = addresses.join(',')
          const response = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`)

          if (response.ok) {
            const data = await response.json()
            if (data.data) {
              Object.keys(data.data).forEach(mint => {
                if (data.data[mint]?.price) {
                  prices[mint] = parseFloat(data.data[mint].price)
                }
              })
            }
          }
        } catch (jupError) {
          console.error("Jupiter Price API failed:", jupError)
        }

        // 2. Fallback to CoinGecko if missing prices
        const missingMints = addresses.filter(addr => !prices[addr])
        if (missingMints.length > 0) {
          try {
            const ids = missingMints.join(',')
            const cgResponse = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${ids}&vs_currencies=usd`)
            if (cgResponse.ok) {
              const cgData = await cgResponse.json()
              Object.keys(cgData).forEach(mint => {
                if (cgData[mint]?.usd) {
                  prices[mint] = cgData[mint].usd
                }
              })
            }
          } catch (cgError) {
            console.warn("CoinGecko fallback failed:", cgError)
          }
        }

        if (!isMounted) return

        // Update state safely
        if (prices[inputToken.address]) {
          setInputToken(prev => {
            // Only update if address matches (prevent race condition)
            if (prev.address === inputToken.address) {
              return { ...prev, usdPrice: prices[inputToken.address] }
            }
            return prev
          })
        }
        if (prices[outputToken.address]) {
          setOutputToken(prev => {
            if (prev.address === outputToken.address) {
              return { ...prev, usdPrice: prices[outputToken.address] }
            }
            return prev
          })
        }

      } catch (e) {
        console.error("Failed to fetch prices", e)
      }
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





  const [showRateDetails, setShowRateDetails] = useState(false)

  const handleToggleSwap = () => {
    handleSwapTokens()
  }

  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const [swapTokenInfo, setSwapTokenInfo] = useState<any>(null)

  // Calculate USD values with robust fallbacks
  const { inputUsdValue, outputUsdValue } = useMemo(() => {
    const getPrice = (token: TokenInfo) => {
      // Validate price - if it's suspiciously high (>$100k), it's probably wrong
      if (token.usdPrice && token.usdPrice > 0 && token.usdPrice < 100000) {
        return token.usdPrice
      }

      // Log suspicious prices for debugging
      if (token.usdPrice && token.usdPrice >= 100000) {
        console.warn(`⚠️ Suspicious price for ${token.symbol}: $${token.usdPrice.toLocaleString()} - ignoring`)
      }

      // Fallback for stablecoins
      if (['USDC', 'USDT', 'USDH', 'USDS', 'DAI'].includes(token.symbol.toUpperCase())) return 1
      return 0
    }

    const inPrice = getPrice(inputToken)
    const outPrice = getPrice(outputToken)

    const inAmt = parseFloat(inputAmount) || 0
    const outAmt = parseFloat(outputAmount) || 0

    let inVal = inAmt * inPrice
    let outVal = outAmt * outPrice

    // IMPROVED: Better fallback logic for swaps
    if (quote && inAmt > 0 && outAmt > 0) {
      // If input has price but output doesn't, derive output value from input
      if (inVal > 0 && outVal === 0) {
        outVal = inVal * 0.9925 // Account for ~0.75% fee
        console.log(`💡 Derived output value from input: $${outVal.toFixed(2)}`)
      }
      // If output has price but input doesn't, derive input value from output
      else if (outVal > 0 && inVal === 0) {
        inVal = outVal / 0.9925 // Account for ~0.75% fee
        console.log(`💡 Derived input value from output: $${inVal.toFixed(2)}`)
      }
      // If both have prices but values are way off (>10% difference), something is wrong
      else if (inVal > 0 && outVal > 0) {
        const ratio = Math.abs(inVal - outVal) / Math.max(inVal, outVal)
        if (ratio > 0.10) {
          console.warn(`⚠️ USD values differ by ${(ratio * 100).toFixed(1)}%:`, {
            input: `${inputToken.symbol} = $${inVal.toFixed(2)}`,
            output: `${outputToken.symbol} = $${outVal.toFixed(2)}`
          })
          // Use the input value as source of truth and derive output
          outVal = inVal * 0.9925
          console.log(`✅ Fixed: Using input value, output now = $${outVal.toFixed(2)}`)
        }
      }
    }
    // Original fallback logic for when no quote exists
    else {
      if (inVal === 0 && outVal > 0) inVal = outVal
      if (outVal === 0 && inVal > 0) outVal = inVal
    }

    return { inputUsdValue: inVal, outputUsdValue: outVal }
  }, [inputAmount, outputAmount, inputToken, outputToken, quote])

  // Calculate hot coins based on new requirements
  const hotCoins = useMemo(() => {
    console.log('Hot Coins Calculation - Total transactions:', transactions?.length)

    if (!transactions || transactions.length === 0) {
      console.log('No transactions available')
      return []
    }

    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000) // 1 hour
    const thirtyMinutesAgo = now - (30 * 60 * 1000) // 30 minutes

    // Group transactions by token address
    const coinData = new Map<string, {
      symbol: string
      address: string
      image: string
      name: string
      marketCap: number
      uniqueWhales: Set<string>
      totalBuyAmount: number
      transactions: any[]
      lastHotBuyTime: number
    }>()

    // Process all transactions
    transactions.forEach((tx: any) => {
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

      const marketCap = parseFloat(tx.transaction?.tokenOut?.marketCap ||
        tx.outTokenMarketCap ||
        tx.token_out_market_cap ||
        '0')

      const whaleAddress = tx.whaleAddress || tx.whale_address
      const buyAmount = parseFloat(tx.transaction?.amountInUSD || tx.amount_in_usd || '0')
      const hotnessScore = tx.hotnessScore || tx.hotness_score || 0
      const txTimestamp = new Date(tx.timestamp || tx.createdAt).getTime()

      if (!coinSymbol || !coinAddress) return

      if (!coinData.has(coinAddress)) {
        coinData.set(coinAddress, {
          symbol: coinSymbol,
          address: coinAddress,
          image: coinImage,
          name: coinName,
          marketCap: marketCap,
          uniqueWhales: new Set(),
          totalBuyAmount: 0,
          transactions: [],
          lastHotBuyTime: 0
        })
      }

      const coin = coinData.get(coinAddress)!
      coin.transactions.push(tx)

      // Track whale buys with hotness > 7
      if (hotnessScore > 7 && whaleAddress) {
        coin.uniqueWhales.add(whaleAddress)
        coin.totalBuyAmount += buyAmount
        coin.lastHotBuyTime = Math.max(coin.lastHotBuyTime, txTimestamp)
      }
    })

    // Filter coins based on entry criteria
    const eligibleCoins = Array.from(coinData.values())
      .filter(coin => {
        // Entry criteria (last 1 hour)
        const recentHotBuys = coin.transactions.filter(tx => {
          const txTime = new Date(tx.timestamp || tx.createdAt).getTime()
          const hotnessScore = tx.hotnessScore || tx.hotness_score || 0
          return txTime >= oneHourAgo && hotnessScore > 7
        })

        // Check all entry conditions
        const hasMarketCap = coin.marketCap >= 100000
        const hasMinWhales = coin.uniqueWhales.size >= 2
        const hasMinBuyAmount = coin.totalBuyAmount >= 3000
        const hasRecentActivity = recentHotBuys.length > 0

        // Removal criteria (last 30 minutes)
        const hasRecentHotBuy = coin.lastHotBuyTime >= thirtyMinutesAgo

        console.log(`Coin ${coin.symbol}:`, {
          marketCap: coin.marketCap,
          uniqueWhales: coin.uniqueWhales.size,
          totalBuyAmount: coin.totalBuyAmount,
          hasRecentHotBuy,
          meetsEntry: hasMarketCap && hasMinWhales && hasMinBuyAmount && hasRecentActivity
        })

        // Entry: All conditions must be met
        const meetsEntry = hasMarketCap && hasMinWhales && hasMinBuyAmount && hasRecentActivity

        // Stay: Must have recent hot buy in last 30 minutes
        const shouldStay = hasRecentHotBuy

        return meetsEntry && shouldStay
      })
      .sort((a, b) => {
        // Sort by total buy amount (descending)
        return b.totalBuyAmount - a.totalBuyAmount
      })
      .slice(0, 5) // Show top 5
      .map(coin => ({
        symbol: coin.symbol,
        address: coin.address,
        image: coin.image,
        name: coin.name,
        marketCap: coin.marketCap.toString(),
        hotnessScore: Math.max(...coin.transactions.map(tx => tx.hotnessScore || tx.hotness_score || 0)),
        count: coin.uniqueWhales.size,
        totalBuyAmount: coin.totalBuyAmount
      }))

    console.log('Final hot coins:', eligibleCoins)
    return eligibleCoins
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
                ultra v3
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
                            {inputUsdValue > 0
                              ? `~$${inputUsdValue.toFixed(2)}`
                              : "$0.00"}
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
                              {outputUsdValue > 0
                                ? `~$${outputUsdValue.toFixed(2)}`
                                : "$0.00"}
                            </span>
                          </>
                        )}
                      </div>



                    </div>
                  </div>
                </>
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


            <div className="">
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
            </div>






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
