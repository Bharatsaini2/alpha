import { useState, useEffect } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import axios from "axios"
import { useToast } from "../../components/ui/Toast"
import TransactionDetailView from "../../components/transaction/TransactionDetailView"
import SwapModal from "../../components/swap/SwapModal"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { validateQuickBuyAmount, loadQuickBuyAmount } from "../../utils/quickBuyValidation"

const TransactionDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [transactionData, setTransactionData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { showToast, ToastContainer } = useToast()
  const { wallet } = useWalletConnection()
  const [transactionType, setTransactionType] = useState<string>("")
  const BASE_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9090"
  const type: string | null = searchParams.get("type")
  const transactionQuery: string | null = searchParams.get("transaction")
  const navigate = useNavigate()

  // State for price display toggles
  const [tokenInPriceDisplay, setTokenInPriceDisplay] = useState({
    value: "0",
    unit: "USD",
    label: "Market Cap",
  })

  const [tokenOutPriceDisplay, setTokenOutPriceDisplay] = useState({
    value: "0",
    unit: "USD",
    label: "Market Cap",
  })

  // State for amount display toggles
  const [tokenInAmountDisplay, setTokenInAmountDisplay] = useState({
    value: "0",
    currency: "USD",
    symbol: "$",
  })

  const [tokenOutAmountDisplay, setTokenOutAmountDisplay] = useState({
    value: "0",
    currency: "USD",
    symbol: "$",
  })

  // State for transaction details amount display (separate from flow)
  const [detailsAmountDisplay, setDetailsAmountDisplay] = useState({
    value: "0",
    currency: "USD",
    symbol: "$",
  })

  // Swap modal state
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const [swapTokenInfo, setSwapTokenInfo] = useState<any>(null)

  const formatMarketCap = (marketCap: string) => {
    const num = parseFloat(marketCap)
    if (num >= 1e9) return (num / 1e9).toFixed(1) + "B"
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M"
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K"
    return num.toFixed(0)
  }

  const initializeDisplayStates = (data: any) => {
    setTokenInPriceDisplay({
      value: formatMarketCap(data.transaction.tokenIn.marketCap),
      unit: "USD",
      label: "Market Cap",
    })
    setTokenOutPriceDisplay({
      value: formatMarketCap(data.transaction.tokenOut.marketCap),
      unit: "USD",
      label: "Market Cap",
    })
    setTokenInAmountDisplay({
      value: parseFloat(data.transaction.tokenIn.usdAmount).toLocaleString(),
      currency: "USD",
      symbol: "$",
    })
    setTokenOutAmountDisplay({
      value: parseFloat(data.transaction.tokenOut.usdAmount).toLocaleString(),
      currency: "USD",
      symbol: "$",
    })
    setDetailsAmountDisplay({
      value: parseFloat(data.transaction.tokenOut.usdAmount).toLocaleString(),
      currency: "USD",
      symbol: "$",
    })
  }

  useEffect(() => {
    if (!id) return

    const fetchTransaction = async () => {
      try {
        setIsLoading(true)
        const endpoint =
          type === "whale"
            ? `${BASE_URL}/transactions/all-transaction/${id}`
            : `${BASE_URL}/transactions/influencer-all-transaction/${id}`

        const { data } = await axios.get(endpoint)

        if (data.success && data.data) {
          setTransactionData(data.data)
          setTransactionType(transactionQuery || data.data.type)
          initializeDisplayStates(data.data)
        }
      } catch (err) {
        console.error("Transaction not found", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTransaction()
  }, [id, type, BASE_URL, transactionQuery])

  const handleTogglePrice = (tokenType: "in" | "out") => {
    if (!transactionData) return

    if (tokenType === "in") {
      const isMC = tokenInPriceDisplay.label === "Market Cap"
      setTokenInPriceDisplay({
        value: isMC ? transactionData.tokenPrice.sellTokenPrice : formatMarketCap(transactionData.transaction.tokenIn.marketCap),
        unit: isMC ? transactionData.transaction.tokenIn.symbol : "USD",
        label: isMC ? "Price" : "Market Cap",
      })
    } else {
      const isMC = tokenOutPriceDisplay.label === "Market Cap"
      setTokenOutPriceDisplay({
        value: isMC ? transactionData.tokenPrice.buyTokenPrice : formatMarketCap(transactionData.transaction.tokenOut.marketCap),
        unit: isMC ? transactionData.transaction.tokenOut.symbol : "USD",
        label: isMC ? "Price" : "Market Cap",
      })
    }
  }

  const handleToggleAmount = (tokenType: "in" | "out") => {
    if (!transactionData) return

    if (tokenType === "in") {
      const isUSD = tokenInAmountDisplay.currency === "USD"
      setTokenInAmountDisplay({
        value: isUSD ? parseFloat(transactionData.solAmount.sellSolAmount).toFixed(4) : parseFloat(transactionData.transaction.tokenIn.usdAmount).toLocaleString(),
        currency: isUSD ? "SOL" : "USD",
        symbol: isUSD ? "SOL" : "$",
      })
    } else {
      const isUSD = tokenOutAmountDisplay.currency === "USD"
      setTokenOutAmountDisplay({
        value: isUSD ? parseFloat(transactionData.solAmount.buySolAmount).toFixed(4) : parseFloat(transactionData.transaction.tokenOut.usdAmount).toLocaleString(),
        currency: isUSD ? "SOL" : "USD",
        symbol: isUSD ? "SOL" : "$",
      })
    }
  }

  const handleToggleDetailsAmount = () => {
    if (!transactionData) return
    const isUSD = detailsAmountDisplay.currency === "USD"
    setDetailsAmountDisplay({
      value: isUSD ? parseFloat(transactionData.solAmount.buySolAmount).toFixed(4) : parseFloat(transactionData.transaction.tokenOut.usdAmount).toLocaleString(),
      currency: isUSD ? "SOL" : "USD",
      symbol: isUSD ? "SOL" : "$",
    })
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    showToast(`${label} copied to clipboard!`, "success")
  }

  const handleQuickBuy = () => {
    if (!transactionData) return
    
    // Load quick buy amount from storage
    const quickBuyAmount = loadQuickBuyAmount() || "100"
    
    // Validate quick buy amount
    const validation = validateQuickBuyAmount(quickBuyAmount)
    if (!validation.isValid) {
      showToast(validation.error || "Please enter a valid SOL amount for quick buy", "error")
      return
    }

    // Validate wallet connection
    if (!wallet.connected) {
      showToast("Please connect your wallet to continue", "error")
      return
    }
    
    // Extract token info from transaction data
    const isBuy = transactionType === "buy"
    const tokenInfo = {
      symbol: isBuy ? transactionData.transaction.tokenOut.symbol : transactionData.transaction.tokenIn.symbol,
      name: isBuy ? transactionData.transaction.tokenOut.name : transactionData.transaction.tokenIn.name,
      address: isBuy ? transactionData.transaction.tokenOut.address : transactionData.transaction.tokenIn.address,
      image: isBuy ? transactionData.transaction.tokenOut.imageUrl : transactionData.transaction.tokenIn.imageUrl,
      decimals: 9, // Default for most Solana tokens
    }
    
    // Open SwapModal in 'quickBuy' mode with SOL as input token
    setSwapTokenInfo(tokenInfo)
    setIsSwapModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="bg-[#000] text-white p-6 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  if (!transactionData) {
    return (
      <div className="bg-[#000] text-white p-6 min-h-screen flex items-center justify-center">
        <p className="opacity-70">Transaction not found</p>
      </div>
    )
  }

  return (
    <div className="text-white  bg-[#000] min-h-screen">
      <TransactionDetailView
        data={transactionData}
        transactionType={transactionType}
        tokenInPriceDisplay={tokenInPriceDisplay}
        tokenOutPriceDisplay={tokenOutPriceDisplay}
        tokenInAmountDisplay={tokenInAmountDisplay}
        tokenOutAmountDisplay={tokenOutAmountDisplay}
        detailsAmountDisplay={detailsAmountDisplay}
        onBack={() => navigate(-1)}
        onTogglePrice={handleTogglePrice}
        onToggleAmount={handleToggleAmount}
        onToggleDetailsAmount={handleToggleDetailsAmount}
        onCopy={handleCopy}
        onQuickBuy={handleQuickBuy}
      />
      
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
        initialAmount={loadQuickBuyAmount() || "100"}
      />
      
      <ToastContainer />
    </div>
  )
}

export default TransactionDetail
