import { useState, useEffect } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import axios from "axios"
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { useToast } from "../../components/ui/Toast"
import TransactionDetailView from "../../components/transaction/TransactionDetailView"
import SwapModal from "../../components/swap/SwapModal"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { validateQuickBuyAmount, loadQuickBuyAmount } from "../../utils/quickBuyValidation"
import { searchJupiterUltra, fetchJupiterTokens } from "../../lib/jupiterTokens"

const COMMON_TOKENS: Record<string, { symbol: string; name: string; image: string; decimals: number; marketCap?: string }> = {
  "So11111111111111111111111111111111111111112": {
    symbol: "SOL",
    name: "Solana",
    image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
    decimals: 9,
    marketCap: "100000000000" // Fallback approx
  },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    symbol: "USDC",
    name: "USDC",
    image: "https://assets.coingecko.com/coins/images/6319/large/usdc.png?1696506694",
    decimals: 6,
    marketCap: "35000000000"
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
    symbol: "USDT",
    name: "Tether USD",
    image: "https://assets.coingecko.com/coins/images/325/large/Tether.png?1696501661",
    decimals: 6,
    marketCap: "100000000000"
  },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {
    symbol: "JUP",
    name: "Jupiter",
    image: "https://static.jup.ag/jup/icon.png",
    decimals: 6
  }
}

const TransactionDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [transactionData, setTransactionData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useToast()
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
        console.error("Transaction not found in backend, trying RPC fallback...", err)

        try {
          // RPC Fallback
          const connection = new Connection(
            import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
          )

          const tx = await connection.getParsedTransaction(id, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
          })

          if (!tx) {
            throw new Error("Transaction not found on chain")
          }

          // Basic parsing logic to find what happened
          // reliable detection of swaps is complex, this is a best-effort for user's own txs
          const meta = tx.meta
          if (!meta) throw new Error("No meta available")

          const preBalances = meta.preTokenBalances || []
          const postBalances = meta.postTokenBalances || []
          const accountKeys = tx.transaction.message.accountKeys

          // Identify signer (usually index 0)
          const signer = accountKeys[0].pubkey.toBase58()

          // Find token changes for the signer
          let tokenIn: any = null // Sold
          let tokenOut: any = null // Bought

          // Check SOL change
          const preSol = meta.preBalances[0]
          const postSol = meta.postBalances[0]
          const solDiff = (postSol - preSol) / LAMPORTS_PER_SOL

          // Check Token changes
          // We look for balances associated with the signer's wallet (owner)
          const relevantPre = preBalances.filter(b => b.owner === signer)
          const relevantPost = postBalances.filter(b => b.owner === signer)

          // Map mint to changes
          const changes = new Map<string, { diff: number, decimals: number, mint: string }>()

          // Initialize with SOL if meaningful change (ignoring small gas fees e.g. < 0.01)
          if (Math.abs(solDiff) > 0.005) { // Threshold to filter out just gas
            changes.set("So11111111111111111111111111111111111111112", {
              diff: solDiff,
              decimals: 9,
              mint: "So11111111111111111111111111111111111111112"
            })
          }

          // Process all tokens involved
          // Union of all mints in pre and post
          const allMints = new Set([
            ...relevantPre.map(b => b.mint),
            ...relevantPost.map(b => b.mint)
          ])

          allMints.forEach(mint => {
            const pre = relevantPre.find(b => b.mint === mint)
            const post = relevantPost.find(b => b.mint === mint)

            const preAmount = pre?.uiTokenAmount?.uiAmount || 0
            const postAmount = post?.uiTokenAmount?.uiAmount || 0
            const decimals = pre?.uiTokenAmount?.decimals || post?.uiTokenAmount?.decimals || 0
            const diff = postAmount - preAmount

            if (diff !== 0) {
              changes.set(mint, { diff, decimals, mint })
            }
          })

          // Identify In/Out based on diff
          // specific logic: largest negative is sold (In), largest positive is bought (Out)
          let maxNegative = 0
          let maxPositive = 0

          changes.forEach((val) => {
            if (val.diff < 0 && val.diff < maxNegative) {
              maxNegative = val.diff
              tokenIn = val // Sold
            }
            if (val.diff > 0 && val.diff > maxPositive) {
              maxPositive = val.diff
              tokenOut = val // Bought
            }
          })

          // Build fallback data object
          let fallbackData: any = {
            _id: id,
            signature: id,
            transaction: {
              tokenIn: {
                symbol: tokenIn ? (tokenIn.mint === "So11111111111111111111111111111111111111112" ? "SOL" : "Unknown") : "Unknown",
                name: tokenIn ? (tokenIn.mint === "So11111111111111111111111111111111111111112" ? "Solana" : "Unknown Token") : "Unknown",
                address: tokenIn?.mint || "",
                amount: tokenIn ? Math.abs(tokenIn.diff).toString() : "0",
                usdAmount: "0",
                marketCap: "0",
                imageUrl: ""
              },
              tokenOut: {
                symbol: tokenOut ? (tokenOut.mint === "So11111111111111111111111111111111111111112" ? "SOL" : "Unknown") : "Unknown",
                name: tokenOut ? (tokenOut.mint === "So11111111111111111111111111111111111111112" ? "Solana" : "Unknown Token") : "Unknown",
                address: tokenOut?.mint || "",
                amount: tokenOut ? Math.abs(tokenOut.diff).toString() : "0",
                usdAmount: "0",
                marketCap: "0",
                imageUrl: ""
              },
              gasFee: (meta.fee / LAMPORTS_PER_SOL).toString(),
              platform: "Unknown",
              timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString(),
            },
            whaleAddress: signer,
            tokenInSymbol: "UNK",
            tokenOutSymbol: "UNK",
            hotnessScore: 0,
            type: "swapped",
            timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString(),
            solAmount: {
              buySolAmount: (tokenOut?.mint === "So11111111111111111111111111111111111111112") ? Math.abs(tokenOut.diff).toString() : "0",
              sellSolAmount: (tokenIn?.mint === "So11111111111111111111111111111111111111112") ? Math.abs(tokenIn.diff).toString() : "0"
            },
            tokenPrice: {
              sellTokenPrice: "0",
              buyTokenPrice: "0"
            }
          }

          // Fetch Metadata
          try {
            const fetchMeta = async (mint: string) => {
              if (!mint) return null;
              if (mint === "So11111111111111111111111111111111111111112") {
                // Basic SOL info is already set, but could fetch price if needed. 
                // Jupiter Ultra often handles SOL too.
              }
              const results = await searchJupiterUltra(mint);
              // Precise match
              return results.find(t => t.address === mint) || results[0];
            }

            const [inMeta, outMeta] = await Promise.all([
              tokenIn?.mint ? fetchMeta(tokenIn.mint) : null,
              tokenOut?.mint ? fetchMeta(tokenOut.mint) : null
            ]);

            // Update Input Token Data
            if (inMeta) {
              fallbackData.transaction.tokenIn.symbol = inMeta.symbol;
              fallbackData.transaction.tokenIn.name = inMeta.name;
              fallbackData.transaction.tokenIn.imageUrl = inMeta.image;
              fallbackData.tokenInSymbol = inMeta.symbol;
              if (inMeta.mcap) fallbackData.transaction.tokenIn.marketCap = inMeta.mcap.toString();

              // Calculate USD Amount if price exists
              if (inMeta.usdPrice && tokenIn) {
                const amt = Math.abs(tokenIn.diff);
                fallbackData.transaction.tokenIn.usdAmount = (amt * inMeta.usdPrice).toString();
                fallbackData.tokenPrice.sellTokenPrice = inMeta.usdPrice.toString();
              }
            }

            // Update Output Token Data
            if (outMeta) {
              fallbackData.transaction.tokenOut.symbol = outMeta.symbol;
              fallbackData.transaction.tokenOut.name = outMeta.name;
              fallbackData.transaction.tokenOut.imageUrl = outMeta.image;
              fallbackData.tokenOutSymbol = outMeta.symbol;
              if (outMeta.mcap) fallbackData.transaction.tokenOut.marketCap = outMeta.mcap.toString();

              // Calculate USD Amount if price exists
              if (outMeta.usdPrice && tokenOut) {
                const amt = Math.abs(tokenOut.diff);
                fallbackData.transaction.tokenOut.usdAmount = (amt * outMeta.usdPrice).toString();
                fallbackData.tokenPrice.buyTokenPrice = outMeta.usdPrice.toString();
              }
            }

          } catch (metaErr) {
            console.warn("Failed to fetch metadata from Jupiter", metaErr)
          }

          setTransactionData(fallbackData)
          setTransactionType("swapped")

          // Initialize displays 
          setTokenInPriceDisplay({
            value: fallbackData.transaction.tokenIn.marketCap !== "0" ? formatMarketCap(fallbackData.transaction.tokenIn.marketCap) : "-",
            unit: "USD",
            label: "Market Cap"
          })
          setTokenOutPriceDisplay({
            value: fallbackData.transaction.tokenOut.marketCap !== "0" ? formatMarketCap(fallbackData.transaction.tokenOut.marketCap) : "-",
            unit: "USD",
            label: "Market Cap"
          })
          setTokenInAmountDisplay({
            value: parseFloat(fallbackData.transaction.tokenIn.amount || "0").toFixed(4),
            currency: fallbackData.transaction.tokenIn.symbol || "UNK",
            symbol: ""
          })
          setTokenOutAmountDisplay({
            value: parseFloat(fallbackData.transaction.tokenOut.amount || "0").toFixed(4),
            currency: fallbackData.transaction.tokenOut.symbol || "UNK",
            symbol: ""
          })
          setDetailsAmountDisplay({
            value: parseFloat(fallbackData.transaction.tokenOut.amount || "0").toFixed(4),
            currency: fallbackData.transaction.tokenOut.symbol || "UNK",
            symbol: ""
          })

        } catch (rpcErr) {
          console.error("RPC Fallback failed", rpcErr)
        }
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
        symbol: isUSD ? "" : "$",
      })
    } else {
      const isUSD = tokenOutAmountDisplay.currency === "USD"
      setTokenOutAmountDisplay({
        value: isUSD ? parseFloat(transactionData.solAmount.buySolAmount).toFixed(4) : parseFloat(transactionData.transaction.tokenOut.usdAmount).toLocaleString(),
        currency: isUSD ? "SOL" : "USD",
        symbol: isUSD ? "" : "$",
      })
    }
  }

  const handleToggleDetailsAmount = () => {
    if (!transactionData) return
    const isUSD = detailsAmountDisplay.currency === "USD"
    setDetailsAmountDisplay({
      value: isUSD ? parseFloat(transactionData.solAmount.buySolAmount).toFixed(4) : parseFloat(transactionData.transaction.tokenOut.usdAmount).toLocaleString(),
      currency: isUSD ? "SOL" : "USD",
      symbol: isUSD ? "" : "$",
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


    </div>
  )
}

export default TransactionDetail
