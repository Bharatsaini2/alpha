
import React, { useState, useEffect, useCallback, useRef } from "react"
import { Filter, ChevronDown, X, Copy, ExternalLink } from "lucide-react"
import { io } from "socket.io-client"
import { useNavigate } from "react-router-dom"
import GridLoader from "../../utils/GridLoader"
import { formatNumber } from "../../utils/FormatNumber"
import { formatAge } from "../../utils/formatAge"
import { useToast } from "../../contexts/ToastContext"

import DefaultTokenImage from "../../assets/default_token.svg"
import axios from "axios"
import WhaleFilterModal from "../../components/WhaleFilterModel"
import { ReactFlowProvider } from "@xyflow/react"
import TokenizedSearchInput from "../../components/TokenizedSearchInput"
import RightSidebar from "../../components/right-sidebar/RightSidebar"
import { validateQuickBuyAmount, saveQuickBuyAmount, loadQuickBuyAmount } from "../../utils/quickBuyValidation"
import SwapModal from "../../components/swap/SwapModal"
import { useWalletConnection } from "../../hooks/useWalletConnection"


const socket = io(import.meta.env.VITE_BASE_URL || "http://localhost:9090", {
  transports: ["websocket"],
  reconnection: true,
})
const BASE_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

const getTimeAgo = (timestamp: string) => {
  const now = new Date()
  const past = new Date(timestamp)
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return "Just now"
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} min ago`
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} hours ago`
  } else {
    return `${Math.floor(diffInSeconds / 86400)} days ago`
  }
}

const TimeAgo = ({ timestamp }: { timestamp: string }) => {
  const [timeAgo, setTimeAgo] = useState(getTimeAgo(timestamp))

  useEffect(() => {
    setTimeAgo(getTimeAgo(timestamp))

    const interval = setInterval(() => {
      setTimeAgo(getTimeAgo(timestamp))
    }, 60000) // Updates every 1 minute

    return () => clearInterval(interval)
  }, [timestamp])

  return <span className="text-[#06DF73]">{timeAgo}</span>
}

// Updated fetch function to use your actual API with server-side filtering
const fetchPaginatedWhaleTransactions = async (
  page: number,
  limit: number,
  filters: {
    searchQuery?: string
    searchType?: "coin" | "all" // Home page only needs coin search (no KOLs)
    hotness?: string | null
    transactionType?: string | null
    tags?: string[]
    amount?: string | null
    ageMin?: string | null
    ageMax?: string | null
    marketCapMin?: string | null
    marketCapMax?: string | null
  } = {}
) => {
  try {
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    })

    // Add filters to query params for server-side filtering
    if (filters.searchQuery && filters.searchQuery.trim()) {
      queryParams.append("search", filters.searchQuery.trim())

      // Send search type if specified
      if (filters.searchType) {
        queryParams.append("searchType", filters.searchType)
      }
    }
    if (filters.hotness) {
      queryParams.append("hotness", filters.hotness)
    }
    if (filters.transactionType) {
      queryParams.append("type", filters.transactionType)
    }
    if (filters.amount) {
      queryParams.append("amount", filters.amount)
    }
    if (filters.tags && filters.tags.length > 0) {
      queryParams.append("tags", filters.tags.join(","))
    }

    // NEW FILTERS - Age and Market Cap
    if (filters.ageMin) {
      queryParams.append("ageMin", filters.ageMin)
    }
    if (filters.ageMax) {
      queryParams.append("ageMax", filters.ageMax)
    }
    if (filters.marketCapMin) {
      queryParams.append("marketCapMin", filters.marketCapMin)
    }
    if (filters.marketCapMax) {
      queryParams.append("marketCapMax", filters.marketCapMax)
    }

    const response = await axios.get(
      `${BASE_URL}/whale/whale-transactions?${queryParams}`
    )
    if (response.status !== 200) {
      throw new Error("Failed to fetch paginated transactions")
    }

    const data = response.data

    // Transform the response to match expected format
    const transformedData = {
      transactions: expandTransactions(data.transactions || [], "200"),
      totalCount: data.total || 0,
      totalPages: data.totalPages || 0,
      currentPage: data.page || page,
      hasNextPage: data.page < data.totalPages,
      hasPrevPage: data.page > 1,
      queryTime: data.queryTime || 0, // Add query time for monitoring
    }

    return transformedData
  } catch (error) {
    console.error("❌ Error fetching paginated whale transactions:", error)
    return {
      transactions: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
      hasNextPage: false,
      hasPrevPage: false,
      queryTime: 0,
    }
  }
}

// Function to expand "both" transactions into separate buy/sell transactions
const expandTransactions = (
  transactions: any[],
  amountThreshold?: string | null
) => {
  const expandedTransactions: any[] = []

  transactions.forEach((tx) => {
    // Calculate correct token age based on transaction type
    const getCorrectTokenAge = (transaction: any) => {
      // For buy transactions, use tokenOutAge (token being bought)
      // For sell transactions, use tokenInAge (token being sold)
      // For both transactions, we'll use tokenOutAge for buy and tokenInAge for sell
      if (transaction.type === "buy") {
        return formatAge(transaction.tokenOutAge)
      } else if (transaction.type === "sell") {
        return formatAge(transaction.tokenInAge)
      } else {
        return formatAge(transaction.age)
      }
    }

    const age = getCorrectTokenAge(tx)
    const timestamp = tx.timestamp ? tx.timestamp : Date.now()

    if (tx.type === "both" && tx.bothType?.[0]) {
      const bothType = tx.bothType[0]

      // Add buy transaction if it exists and meets amount threshold
      if (bothType.buyType) {
        const buyAmount = parseFloat(tx.amount?.buyAmount || "0")
        const threshold = amountThreshold ? parseFloat(amountThreshold) : 0

        // Only add if no threshold is set or amount meets threshold
        if (!amountThreshold || buyAmount >= threshold) {
          // For buy part of "both" transaction, use tokenOutAge
          const buyAge = formatAge(tx.tokenOutAge)

          expandedTransactions.push({
            ...tx,
            type: "buy",
            _id: `${tx._id}_buy`, // Unique ID for buy transaction
            age: buyAge, // Use correct token age for buy
            timestamp,
          })
        }
      }

      // Add sell transaction if it exists and meets amount threshold
      if (bothType.sellType) {
        const sellAmount = parseFloat(tx.amount?.sellAmount || "0")
        const threshold = amountThreshold ? parseFloat(amountThreshold) : 0

        // Only add if no threshold is set or amount meets threshold
        if (!amountThreshold || sellAmount >= threshold) {
          // For sell part of "both" transaction, use tokenInAge
          const sellAge = formatAge(tx.tokenInAge)

          expandedTransactions.push({
            ...tx,
            type: "sell",
            _id: `${tx._id}_sell`, // Unique ID for sell transaction
            age: sellAge, // Use correct token age for sell
            timestamp,
          })
        }
      }
    } else {
      // Regular buy or sell transaction
      expandedTransactions.push({
        ...tx,
        age, // Add calculated age
        timestamp,
      })
    }
  })

  return expandedTransactions
}

const HomePage = () => {
  const [activeFilter, setActiveFilter] = useState("all")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [hotnessOpen, setHotnessOpen] = useState(false)
  const [amountOpen, setAmountOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState("")
  const [showCustomAmountInput, setShowCustomAmountInput] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [filtersPopupOpen, setFiltersPopupOpen] = useState(false)
  const [newTxIds, setNewTxIds] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [quickBuyAmount, setQuickBuyAmount] = useState(() => loadQuickBuyAmount() || "100")
  const [quickBuyAmountError, setQuickBuyAmountError] = useState<string>("")
  const [selectedToken, setSelectedToken] = useState<any>(null)
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const { showToast } = useToast()
  const { wallet } = useWalletConnection()
  const [clearSearchTrigger, setClearSearchTrigger] = useState(0)
  const navigate = useNavigate()
  const filters = [
    { id: "all", label: "All" },
    { id: "buy", label: "Buy" },
    { id: "sell", label: "Sell" },
  ]

  const hotnessOptions = ["High (8-10)", "Medium (5-7)", "Low (1-4)"]

  const amountOptions = [">$1,000", ">$2,500", ">$5,000", ">$10,000"]

  const tagOptions = [
    "SMART MONEY",
    "HEAVY ACCUMULATOR",
    "SNIPER",
    "FLIPPER",
    "COORDINATED GROUP",
    "DORMANT WHALE",
    "KOL",
  ]

  const handleTransactionInfoAll = (
    signature: string,
    transactiontype: string
  ) => {
    navigate(
      `/transaction/${signature}?type=whale&transaction=${transactiontype}`
    )
  }

  const handleTransactionInfoNewTab = (
    signature: string,
    transactiontype: string
  ) => {
    const url = `/transaction/${signature}?type=whale&transaction=${transactiontype}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleCopyTokenAddress = async (
    tokenAddress: string,
    _transactionId: string
  ) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tokenAddress)
      } else {
        // Fallback for older browsers or mobile devices
        const textArea = document.createElement("textarea")
        textArea.value = tokenAddress
        textArea.style.position = "fixed"
        textArea.style.left = "-999999px"
        textArea.style.top = "-999999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
      }

      showToast("Address copied to clipboard!", "success")
    } catch (error) {
      console.error("Failed to copy token address:", error)
      showToast("Failed to copy address", "error")
    }
  }

  const [transactions, setTransactions] = useState<any[]>([])
  const [isAllTxLoading, setIsAllTxLoading] = useState(false)

  // Infinite scroll state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // WebSocket state
  const [newTransactionsCount, setNewTransactionsCount] = useState(0)
  const [hasNewTransactions, setHasNewTransactions] = useState(false)

  // Separate state for live transactions that don't match current filters
  const [pendingLiveTransactions, setPendingLiveTransactions] = useState<any[]>(
    []
  )

  // Load filters from localStorage on mount
  const [activeFilters, setActiveFilters] = useState(() => {
    const savedFilters = localStorage.getItem("whaleHomePageFilters")
    if (savedFilters) {
      try {
        return JSON.parse(savedFilters)
      } catch {
        return {
          searchQuery: "",
          searchType: null as "coin" | "whale" | "all" | null,
          hotness: null as string | null,
          transactionType: null as string | null,
          tags: [] as string[],
          amount: null as string | null,
          ageMin: null as string | null,
          ageMax: null as string | null,
          marketCapMin: null as string | null,
          marketCapMax: null as string | null,
        }
      }
    }
    return {
      searchQuery: "",
      searchType: null as "coin" | "whale" | "all" | null,
      hotness: null as string | null,
      transactionType: null as string | null,
      tags: [] as string[],
      amount: null as string | null,
      ageMin: null as string | null,
      ageMax: null as string | null,
      marketCapMin: null as string | null,
      marketCapMax: null as string | null,
    }
  })

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("whaleHomePageFilters", JSON.stringify(activeFilters))
  }, [activeFilters])

  // Use ref to track latest filters for API calls
  const activeFiltersRef = useRef(activeFilters)
  activeFiltersRef.current = activeFilters

  // Client-side filter matching function that mirrors backend logic
  const doesTransactionMatchFilters = useCallback(
    (transaction: any, filters: any) => {
      // Search query filter
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const searchQuery = filters.searchQuery.trim().toLowerCase()
        const tokenInSymbol = transaction.tokenInSymbol?.toLowerCase() || ""
        const tokenOutSymbol = transaction.tokenOutSymbol?.toLowerCase() || ""
        const tokenInAddress = transaction.tokenInAddress?.toLowerCase() || ""
        const tokenOutAddress = transaction.tokenOutAddress?.toLowerCase() || ""

        if (
          !tokenInSymbol.includes(searchQuery) &&
          !tokenOutSymbol.includes(searchQuery) &&
          !tokenInAddress.includes(searchQuery) &&
          !tokenOutAddress.includes(searchQuery)
        ) {
          return false
        }
      }

      // Transaction type filter
      if (filters.transactionType && filters.transactionType !== "all") {
        if (transaction.type !== filters.transactionType) {
          return false
        }
      }

      // Hotness score filter
      if (filters.hotness) {
        const hotnessScore = transaction.hotnessScore || 0
        switch (filters.hotness) {
          case "High (8-10)":
            if (hotnessScore < 8 || hotnessScore > 10) return false
            break
          case "Medium (5-7)":
            if (hotnessScore < 5 || hotnessScore > 7) return false
            break
          case "Low (1-4)":
            if (hotnessScore < 1 || hotnessScore > 4) return false
            break
        }
      }

      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const transactionTags = transaction.whaleLabel || []
        const hasMatchingTag = filters.tags.some((tag: string) =>
          transactionTags.some((transactionTag: string) =>
            transactionTag.toLowerCase().includes(tag.toLowerCase())
          )
        )
        if (!hasMatchingTag) return false
      }

      // Amount filter
      if (filters.amount) {
        const amount = parseFloat(filters.amount.replace(/[>$,\s]/g, ""))
        const transactionAmount = getTransactionAmount(transaction)
        if (transactionAmount < amount) return false
      }

      // Age filter
      if (filters.ageMin || filters.ageMax) {
        const now = new Date()
        const transactionTime = new Date(transaction.timestamp)
        const ageInMinutes =
          (now.getTime() - transactionTime.getTime()) / (1000 * 60)

        if (filters.ageMin && ageInMinutes < parseFloat(filters.ageMin))
          return false
        if (filters.ageMax && ageInMinutes > parseFloat(filters.ageMax))
          return false
      }

      // Market cap filter
      if (filters.marketCapMin || filters.marketCapMax) {
        const marketCap = getMarketCap(transaction)
        const marketCapInK = marketCap / 1000

        if (
          filters.marketCapMin &&
          marketCapInK < parseFloat(filters.marketCapMin)
        )
          return false
        if (
          filters.marketCapMax &&
          marketCapInK > parseFloat(filters.marketCapMax)
        )
          return false
      }

      return true
    },
    []
  )

  // Reset notification state when filters change
  useEffect(() => {
    setNewTransactionsCount(0)
    setHasNewTransactions(false)

    // Check if any pending live transactions now match the new filters
    if (pendingLiveTransactions.length > 0) {
      const matchingTransactions = pendingLiveTransactions.filter((tx) =>
        doesTransactionMatchFilters(tx, activeFilters)
      )

      if (matchingTransactions.length > 0) {
        // Add matching transactions to the current list if on page 1
        if (currentPage === 1) {
          const expandedTransactions = expandTransactions(
            matchingTransactions,
            "200"
          )
          setTransactions((prev: any[]) => {
            const updated = [...expandedTransactions, ...prev]
            return updated.slice(0, itemsPerPage)
          })
          setNewTxIds((prev) => {
            const updated = new Set(prev)
            expandedTransactions.forEach((tx: any) => updated.add(tx.id))
            return updated
          })
        }

        // Remove matched transactions from pending list
        setPendingLiveTransactions((prev) =>
          prev.filter((tx) => !doesTransactionMatchFilters(tx, activeFilters))
        )
      }
      setNewTransactionsCount((prev) => prev + pendingLiveTransactions.length)
      setHasNewTransactions(true)
    }
  }, [
    activeFilters,
    pendingLiveTransactions,
    currentPage,
    itemsPerPage,
    doesTransactionMatchFilters,
  ])

  // Fetch transactions for infinite scroll
  const fetchTransactions = useCallback(
    async (
      page: number,
      limit: number,
      filters: any,
      isLoadMore: boolean = false
    ) => {
      if (isLoadMore) {
        setIsLoadingMore(true)
      } else {
        setIsAllTxLoading(true)
      }

      try {
        const data = await fetchPaginatedWhaleTransactions(page, limit, filters)

        if (isLoadMore) {
          // Append new transactions for infinite scroll
          setTransactions((prev) => [...prev, ...(data.transactions || [])])
        } else {
          // Replace transactions for new filters or first load
          setTransactions(data.transactions || [])
        }

        // Calculate hasMore based on total count and current page
        const hasMoreData = page * limit < data.totalCount
        setHasMore(hasMoreData)
        setCurrentPage(page)
      } catch (error) {
        console.error("Error fetching transactions:", error)
        if (!isLoadMore) {
          setTransactions([])
        }
        setHasMore(false)
      } finally {
        if (isLoadMore) {
          setIsLoadingMore(false)
        } else {
          setIsAllTxLoading(false)
        }
      }
    },
    []
  )

  // Initial load of transactions (only on mount)
  useEffect(() => {
    fetchTransactions(1, itemsPerPage, activeFilters, false)
  }, []) // Only run once on mount

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observer.current) {
        observer.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    // Reset infinite scroll state for new filters
    setCurrentPage(1)
    setHasMore(true)
    // Clear existing transactions to show loading state
    setTransactions([])
    // Use a small delay to ensure state updates are processed
    const timer = setTimeout(() => {
      fetchTransactions(1, itemsPerPage, activeFiltersRef.current, false)
    }, 100)

    return () => clearTimeout(timer)
  }, [activeFilters, fetchTransactions, itemsPerPage]) // Add dependencies back

  // Memoize the filter change handler
  const handleFilterChange = useCallback(
    (filters: {
      searchQuery: string
      searchType: "coin" | "whale" | "all" | null
      hotness: string | null
      transactionType: string | null
      tags: string[]
      amount: string | null
      // NEW FILTERS
      ageMin: string | null
      ageMax: string | null
      marketCapMin: string | null
      marketCapMax: string | null
    }) => {
      setActiveFilters(filters)
      // The useEffect will handle resetting state and fetching new data
    },
    []
  )

  // Infinite scroll observer
  const observer = useRef<IntersectionObserver | null>(null)
  const lastTransactionRef = useCallback(
    (node: HTMLDivElement) => {
      if (isLoadingMore) return
      if (observer.current) observer.current.disconnect()

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !isAllTxLoading) {
          const nextPage = currentPage + 1
          fetchTransactions(
            nextPage,
            itemsPerPage,
            activeFiltersRef.current,
            true
          )
        }
      })

      if (node) observer.current.observe(node)
    },
    [
      isLoadingMore,
      hasMore,
      currentPage,
      itemsPerPage,
      fetchTransactions,
      isAllTxLoading,
    ]
  )

  // WebSocket event handlers
  useEffect(() => {
    const handleNewTransaction = async (eventData: any) => {
      if (eventData.type === "allWhaleTransactions") {
        const transaction = eventData.data
        if (!transaction) return

        // Check if the transaction matches current filters
        const matchesFilters = doesTransactionMatchFilters(
          transaction,
          activeFilters
        )

        if (matchesFilters) {
          // Transaction matches current filters
          if (currentPage === 1) {
            // Add to filtered list if on page 1
            const expandedTransactions = expandTransactions(
              [transaction],
              "200"
            )

            setTransactions((prev: any[]) => {
              const updated = [...expandedTransactions, ...prev]
              // Keep only the number of items per page
              return updated.slice(0, itemsPerPage)
            })
            setNewTxIds((prev) => {
              const updated = new Set(prev)
              expandedTransactions.forEach((tx: any) => updated.add(tx.id))
              return updated
            })
          } else {
            // Show notification if on other pages
            setNewTransactionsCount((prev) => prev + 1)
            setHasNewTransactions(true)
          }
        } else {
          // Transaction doesn't match current filters
          // Add to pending live transactions for potential future matching
          setPendingLiveTransactions((prev) => {
            // Avoid duplicates
            const exists = prev.some(
              (tx) => tx.signature === transaction.signature
            )
            if (exists) return prev
            return [transaction, ...prev].slice(0, 50) // Keep last 50 pending transactions
          })
          // Show notification that new transactions are available
          setNewTransactionsCount((prev) => prev + 1)
          setHasNewTransactions(true)
        }
      }
    }

    // Setup WebSocket listeners
    socket.on("newTransaction", handleNewTransaction)

    return () => {
      socket.off("newTransaction", handleNewTransaction)
    }
  }, [currentPage, itemsPerPage, activeFilters, doesTransactionMatchFilters])



  // Get hotness badge


  // Add function to handle "Go to latest" button
  const goToLatestTransactions = () => {
    setCurrentPage(1)
    setNewTransactionsCount(0)
    setHasNewTransactions(false)

    // Clear pending live transactions since we're going to show all transactions
    setPendingLiveTransactions([])

    const clearedFilters = {
      searchQuery: "",
      searchType: null,
      hotness: null,
      transactionType: null,
      tags: [],
      amount: null,
      ageMin: null,
      ageMax: null,
      marketCapMin: null,
      marketCapMax: null,
    }
    handleFilterChange(clearedFilters)
    setActiveFilter("all")
    setShowAdvancedFilters(false)
    setHotnessOpen(false)
    setAmountOpen(false)
    setTagsOpen(false)
    setFiltersPopupOpen(false)
    // Clear the TokenizedSearchInput by triggering re-render
    setClearSearchTrigger((prev) => prev + 1)
  }

  // Helper function to get transaction amount
  const getTransactionAmount = (tx: any) => {
    if (tx.type === "buy" && tx.amount?.buyAmount) {
      return tx.amount.buyAmount
    } else if (tx.type === "sell" && tx.amount?.sellAmount) {
      return tx.amount.sellAmount
    }
    return 0
  }

  // Helper function to get market cap
  const getMarketCap = (tx: any) => {
    if (tx.type === "buy" && tx.marketCap?.buyMarketCap) {
      return tx.marketCap.buyMarketCap
    } else if (tx.type === "sell" && tx.marketCap?.sellMarketCap) {
      return tx.marketCap.sellMarketCap
    } else if (typeof tx.marketCap === "number") {
      return tx.marketCap
    }
    return 0
  }

  const handleUnifiedSearch = (searchData: {
    searchQuery: string
    searchType: "coin" | "whale" | "all" | null
    tokens: Array<{ value: string; type: string }>
    displayQuery?: string
  }) => {
    // If searchQuery is empty, clear the search filters
    const newFilters = {
      ...activeFilters,
      searchQuery: searchData.searchQuery || "", // Use address for backend search
      searchType: searchData.searchQuery ? ("coin" as const) : null, // Clear searchType if no query
      displayQuery: searchData.displayQuery || searchData.searchQuery || "", // Use symbol/name for display
    }

    setActiveFilters(newFilters)

    // Reset pagination and fetch new data
    setCurrentPage(1)
    setTransactions([])
    fetchTransactions(1, itemsPerPage, newFilters, false)
  }

  const handleQuickBuy = (tx: any) => {
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

    // Extract token info from clicked item
    const tokenInfo = {
      symbol: tx.type === 'sell' ? tx.transaction.tokenIn.symbol : tx.transaction.tokenOut.symbol,
      name: tx.type === 'sell' ? tx.transaction.tokenIn.name : tx.transaction.tokenOut.name,
      address: tx.type === 'sell' ? tx.tokenInAddress : tx.tokenOutAddress,
      image: tx.type === 'sell' ? tx.inTokenURL : tx.outTokenURL,
      decimals: 9, // Default for most Solana tokens
    }

    // Open SwapModal in 'quickBuy' mode with SOL as input token
    setSelectedToken(tokenInfo)
    setIsSwapModalOpen(true)
  }

  const handleQuickBuyAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuickBuyAmount(value)

    // Validate and show error if invalid
    const validation = validateQuickBuyAmount(value)
    if (!validation.isValid && value !== '') {
      setQuickBuyAmountError(validation.error || '')
    } else {
      setQuickBuyAmountError('')
    }

    // Save to session storage if valid
    if (validation.isValid) {
      saveQuickBuyAmount(value)
    }
  }

  return (
    <>
      <div className="h-full flex flex-col p-4 lg:p-6">
        <div className="flex gap-4 lg:gap-6 flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Row 1: Title and Visualize Button */}
            <div className="flex items-center justify-between">
              <h2 className="text-gray-400 text-xs font-medium tracking-wider uppercase">Recent Transactions</h2>

              {/* Visualize Button */}
              <div className="sparkle-button">
                <button
                  className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-sm md:text-base"
                  onClick={() => setIsOpen(true)}
                >
                  <span className="spark"></span>
                  <span className="backdrop"></span>
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6"
                    viewBox="0 0 19 19"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    xmlnsXlink="http://www.w3.org/1999/xlink"
                  >
                    <rect
                      width="19"
                      height="19"
                      fill="url(#pattern0_210_2073)"
                      fillOpacity="0.7"
                    />
                    <defs>
                      <pattern
                        id="pattern0_210_2073"
                        patternContentUnits="objectBoundingBox"
                        width="1"
                        height="1"
                      >
                        <use xlinkHref="#image0_210_2073" transform="scale(0.02)" />
                      </pattern>
                      <image
                        id="image0_210_2073"
                        width="50"
                        height="50"
                        preserveAspectRatio="none"
                        xlinkHref="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAEtElEQVR4nNWZa4xdUxTHr6lXRpC2iMcN86EJQqP0A200IUqGSEqEIimTlqEznY5WU/GqR/hG+CCEhKQhCBOhDVNBxKvqA9WkKZpiPCIe4QsqM8z8ZHX+Zyx7zp577p1zzp1Zyc29d++1917/s557nUplChBweWW6E3AI8CswqzKdCehglDoq05mAdwXk1cpUI+BoYP8MfHOAEQEZBGZWphIBxwOfAddOBAi4j/9TR419DwauA44rRPDIoc9IuN3AMmBGMN8CfCuepyYyL+BI4C7gJ+D10kDo8NOc2SANXWUANH+BAzobGArNCzgJeBzY6/Y5q1QgEmQL42mn5Q3gef2/TbyvJeYFnANsBoaDtc0JCMB5EuBn4Ebgq0Cwf4BqEIb/cvP2+2X9Nu3ObwoQCfixBDEnPUDfAxrb4vhmyrSMfgDukG88qLGXmgZCAl7pfCTxjwOloYsC3oeAa2xe/4+Vf5iJzW0WhkS4GcAegVlS59pHte654iTMDuJcYKsEer+OtW3O1M4sVtK48Obkjynue/ocOAa4GHgb+ALYmDi8J+Bht26v+BZViiQ5seWFJ4BfUsLt3cCp4r2f8fQbsDBlz0st5Cq64XxtHXBU3iBOAbanCGdjp0dKkr+BTuBE4BWN/WG1V+SMKrDBRTtkdi8CF4ZVw2TAWLlxvjllkAfsST9igIB7NGZPd2lgik9rbmNkfzPHlcBbwcOyaPYecFkuQIJDZwE9wKcpWjIQV0e0arTDjZ0ArLEAEWR40+abQJeF59wBREDNB750T29ZhO9W8WxyY4mWkJY3KfvPLkX4QMA7HYjUEl0mMyKeRW58ntYOlVq2pwh4uwOxIsLTJRAjAtQSzCc+saY0wSOmYgJ2Rni6AxBHqKhcBRwkHss3Rl9nuXHmDWKtA9Ed4el0IPbxyLETskR6C9AK7NJYeS0jJSokYE+Ep8dduLa7cUucRt+MwYHvgQ/0e2vZmjD6MLR38ax2mhjSt93vF2rdd2ZClhcsFDOeFhQN4gZ3WJIQn/RgAhDmE33iW+vu7Pc6/v1Uovh89EKRIJYrMpmAvcDZwO8ejMbHQGjdUvHsUHlie7Sl7G+ALgE+UTJsKwLECgdipRv3YLaFIFyr9E/3tMdui5GzDNASu3iVAiIAk5hZjMeKvoTKb2TXAiGe3olAiMe6KUlzYt/1tjRS86AWiKTsiIZh8bXKPx4oVOgcQNyUxhPwW3/r5EpZBFxfJ4jejPvOqTFfTbsK5+ET3RmApoIADgWuqPPsDVZFNyp7rC6alCbE91EdZ7foejuQVikUCWL1BHstUBcFrWnNcH67C8/tTQWhyPRsSt1kpfm8GjL0Of6+RmunkTxCbKMa4b8G3bA+g3WVJ0GIzeLYUXOK3Ai31fCJxVYcui6jvW7od82LN5RI4xctNZbr0cSqrCC09jBramfsWw0LwBn69AfdlAGtqZYKogbAfIAw2qutB0SqyeUAqEWRqs+ZVr8zrUHNtaeGY/eue12zQOTi7IxWn0aH1wDRVaTwkw6/7v3F+qkCoqGEqAZ0IvB6vc+7uZbfFE00UqK4/OEp1+jUCNFI0ajo9Q7wo7rgiwuTMLtM1dzK+OlA/wKR9JJKpURKbAAAAABJRU5ErkJggg=="
                      />
                    </defs>
                  </svg>
                  <span className="text">Visualize</span>
                </button>
                <span aria-hidden="true" className="particle-pen">
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="particle"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.937 3.846L6.937 3.846Z"
                      fill="black"
                      stroke="black"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </div>

            {/* Row 2: Search Bar and Quick Buy Amount */}
            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="flex-1">
                <TokenizedSearchInput
                  key={clearSearchTrigger}
                  onSearch={handleUnifiedSearch}
                  placeholder="SEARCH"
                  className="w-full"
                  coinOnly={true}
                  page="home"
                />
              </div>

              {/* Quick Buy Amount */}
              <div className="flex items-center gap-2 bg-[#161618] border border-[#2A2A2D] rounded-lg px-3 py-2.5">
                <span className="text-gray-400 text-xs font-medium tracking-wider uppercase whitespace-nowrap">Quick Buy Amount</span>
                <input
                  type="number"
                  value={quickBuyAmount}
                  onChange={handleQuickBuyAmountChange}
                  className={`bg-transparent text-white text-sm focus:outline-none w-16 text-right ${quickBuyAmountError ? 'border border-red-500 rounded px-1' : ''}`}
                  placeholder="100"
                  min="0"
                  step="0.1"
                  title={quickBuyAmountError || ''}
                />
                <span className="text-gray-400 text-xs">SOL</span>
              </div>
              {quickBuyAmountError && (
                <div className="text-red-500 text-xs mt-1">
                  {quickBuyAmountError}
                </div>
              )}
            </div>

            {hasNewTransactions && (
              <div className="bg-[#16171C] border border-white/70 rounded-lg p-3 flex items-center justify-between">
                <span className="text-white/70 text-sm">
                  {newTransactionsCount} new transaction
                  {newTransactionsCount !== 1 ? "s" : ""} available
                </span>
                <button
                  onClick={goToLatestTransactions}
                  className="px-3 py-1 bg-white/70 text-black rounded text-sm hover:bg-white/60 transition-colors cursor-pointer"
                >
                  View Latest
                </button>
              </div>
            )}

            {/* Row 3: Filters - Unified Single Row Layout */}
            <div className="flex items-center gap-3">
              {/* Transaction Type Filters (ALL, BUY, SELL) */}
              <div className="glass-radio-group">
                {filters.map((filter) => (
                  <React.Fragment key={filter.id}>
                    <input
                      type="radio"
                      name="transactionType"
                      id={`glass-unified-${filter.id}`}
                      checked={activeFilter === filter.id}
                      onChange={() => {
                        setActiveFilter(filter.id)
                        const newFilters = { ...activeFilters }
                        if (filter.id === "all") {
                          newFilters.transactionType = null
                        } else {
                          newFilters.transactionType = filter.id
                        }
                        handleFilterChange(newFilters)
                        setCurrentPage(1)
                        setTransactions([])
                        setHasMore(true)
                      }}
                    />
                    <label
                      htmlFor={`glass-unified-${filter.id}`}
                      className="font-semibold"
                    >
                      {filter.label}
                    </label>
                  </React.Fragment>
                ))}
                <div
                  className="glass-glider"
                  style={{
                    transform:
                      activeFilter === "all"
                        ? "translateX(0%)"
                        : activeFilter === "buy"
                          ? "translateX(100%)"
                          : activeFilter === "sell"
                            ? "translateX(200%)"
                            : "translateX(0%)",
                    background:
                      activeFilter === "all"
                        ? "#ffffff"
                        : activeFilter === "buy"
                          ? "#22c55e"
                          : activeFilter === "sell"
                            ? "#ef4444"
                            : "#ffffff",
                  }}
                ></div>
              </div>

              {/* Hotness Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setHotnessOpen(!hotnessOpen)}
                  className="flex items-center space-x-2 px-4 py-2.5 text-white cursor-pointer border border-[#2B2B2D] rounded-xl transition-all text-xs font-medium tracking-wider uppercase"
                >
                  <span>Hotness</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${hotnessOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Amount Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setAmountOpen(!amountOpen)}
                  className="flex items-center space-x-2 px-4 py-2.5 text-white cursor-pointer border border-[#2B2B2D] rounded-xl transition-all text-xs font-medium tracking-wider uppercase"
                >
                  <span>Amount</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${amountOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Tags Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setTagsOpen(!tagsOpen)}
                  className="flex items-center space-x-2 px-4 py-2.5 text-white cursor-pointer border border-[#2B2B2D] rounded-xl transition-all text-xs font-medium tracking-wider uppercase"
                >
                  <span>Tags</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${tagsOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Subscription Dropdown (Placeholder) */}
              <div className="relative">
                <button
                  className="flex items-center space-x-2 px-4 py-2.5 text-white cursor-pointer border border-[#2B2B2D] rounded-xl transition-all text-xs font-medium tracking-wider uppercase"
                >
                  <span>Subscription</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Filter Icon */}
              <button
                onClick={() => setFiltersPopupOpen(!filtersPopupOpen)}
                className="p-2.5 bg-transparent border border-[#2B2B2D] rounded-xl transition-all cursor-pointer"
              >
                <Filter className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Hide old filter layouts */}
            <div className="hidden">
              {/* Mobile & Tablet Layout */}
              <div className="lg:hidden">
                {/* First Row - Main Filters (All, Buy, Sell) */}
                <div className="flex items-center space-x-2 md:space-x-3 mb-3">
                  <div className="glass-radio-group">
                    {filters.map((filter) => (
                      <React.Fragment key={filter.id}>
                        <input
                          type="radio"
                          name="transactionTypeMobile"
                          id={`glass-${filter.id}`}
                          checked={activeFilter === filter.id}
                          onChange={() => {
                            setActiveFilter(filter.id)
                            const newFilters = { ...activeFilters }
                            if (filter.id === "all") {
                              newFilters.transactionType = null
                            } else {
                              newFilters.transactionType = filter.id
                            }
                            handleFilterChange(newFilters)
                            setCurrentPage(1)
                            setTransactions([])
                            setHasMore(true)
                          }}
                        />
                        <label
                          htmlFor={`glass-${filter.id}`}
                          className="font-semibold"
                        >
                          {filter.label}
                        </label>
                      </React.Fragment>
                    ))}
                    <div
                      className="glass-glider"
                      style={{
                        transform:
                          activeFilter === "all"
                            ? "translateX(0%)"
                            : activeFilter === "buy"
                              ? "translateX(100%)"
                              : activeFilter === "sell"
                                ? "translateX(200%)"
                                : "translateX(0%)",
                        background:
                          activeFilter === "all"
                            ? "white opacity-60"
                            : activeFilter === "buy"
                              ? "#22c55e"
                              : activeFilter === "sell"
                                ? "#ef4444"
                                : "white opacity-60",
                      }}
                    ></div>
                  </div>
                  <div className="sparkle-button ml-3 md:ml-4 lg:ml-6">
                    <button
                      className="px-3 md:px-4 lg:px-6 py-2 md:py-3 text-sm md:text-base"
                      onClick={() => setIsOpen(true)}
                    >
                      <span className="spark"></span>
                      <span className="backdrop"></span>
                      <svg
                        className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6"
                        viewBox="0 0 19 19"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                      >
                        <rect
                          width="19"
                          height="19"
                          fill="url(#pattern0_210_2073_mobile)"
                          fillOpacity="0.7"
                        />
                        <defs>
                          <pattern
                            id="pattern0_210_2073_mobile"
                            patternContentUnits="objectBoundingBox"
                            width="1"
                            height="1"
                          >
                            <use
                              xlinkHref="#image0_210_2073_mobile"
                              transform="scale(0.02)"
                            />
                          </pattern>
                          <image
                            id="image0_210_2073_mobile"
                            width="50"
                            height="50"
                            preserveAspectRatio="none"
                            xlinkHref="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAEtElEQVR4nNWZa4xdUxTHr6lXRpC2iMcN86EJQqP0A200IUqGSEqEIimTlqEznY5WU/GqR/hG+CCEhKQhCBOhDVNBxKvqA9WkKZpiPCIe4QsqM8z8ZHX+Zyx7zp577p1zzp1Zyc29d++1917/s557nUplChBweWW6E3AI8CswqzKdCehglDoq05mAdwXk1cpUI+BoYP8MfHOAEQEZBGZWphIBxwOfAddOBAi4j/9TR419DwauA44rRPDIoc9IuN3AMmBGMN8CfCuepyYyL+BI4C7gJ+D10kDo8NOc2SANXWUANH+BAzobGArNCzgJeBzY6/Y5q1QgEmQL42mn5Q3gef2/TbyvJeYFnANsBoaDtc0JCMB5EuBn4Ebgq0Cwf4BqEIb/cvP2+2X9Nu3ObwoQCfixBDEnPUDfAxrb4vhmyrSMfgDukG88qLGXmgZCAl7pfCTxjwOloYsC3oeAa2xe/4+Vf5iJzW0WhkS4GcAegVlS59pHte654iTMDuJcYKsEer+OtW3O1M4sVtK48Obkjynue/ocOAa4GHgb+ALYmDi8J+Bht26v+BZViiQ5seWFJ4BfUsLt3cCp4r2f8fQbsDBlz0st5Cq64XxtHXBU3iBOAbanCGdjp0dKkr+BTuBE4BWN/WG1V+SMKrDBRTtkdi8CF4ZVw2TAWLlxvjllkAfsST9igIB7NGZPd2lgik9rbmNkfzPHlcBbwcOyaPYecFkuQIJDZwE9wKcpWjIQV0e0arTDjZ0ArLEAEWR40+abQJeF59wBREDNB750T29ZhO9W8WxyY4mWkJY3KfvPLkX4QMA7HYjUEl0mMyKeRW58ntYOlVq2pwh4uwOxIsLTJRAjAtQSzCc+saY0wSOmYgJ2Rni6AxBHqKhcBRwkHss3Rl9nuXHmDWKtA9Ed4el0IPbxyLETskR6C9AK7NJYeS0jJSokYE+Ep8dduLa7cUucRt+MwYHvgQ/0e2vZmjD6MLR38ax2mhjSt93vF2rdd2ZClhcsFDOeFhQN4gZ3WJIQn/RgAhDmE33iW+vu7Pc6/v1Uovh89EKRIJYrMpmAvcDZwO8ejMbHQGjdUvHsUHlie7Sl7G+ALgE+UTJsKwLECgdipRv3YLaFIFyr9E/3tMdui5GzDNASu3iVAiIAk5hZjMeKvoTKb2TXAiGe3olAiMe6KUlzYt/1tjRS86AWiKTsiIZh8bXKPx4oVOgcQNyUxhPwW3/r5EpZBFxfJ4jejPvOqTFfTbsK5+ET3RmApoIADgWuqPPsDVZFNyp7rC6alCbE91EdZ7foejuQVikUCWL1BHstUBcFrWnNcH67C8/tTQWhyPRsSt1kpfm8GjL0Of6+RmunkTxCbKMa4b8G3bA+g3WVJ0GIzeLYUXOK3Ai31fCJxVYcui6jvW7od82LN5RI4xctNZbr0cSqrCC09jBramfsWw0LwBn69AfdlAGtqZYKogbAfIAw2qutB0SqyeUAqEWRqs+ZVr8zrUHNtaeGY/eue12zQOTi7IxWn0aH1wDRVaTwkw6/7v3F+qkCoqGEqAZ0IvB6vc+7uZbfFE00UqK4/OEp1+jUCNFI0ajo9Q7wo7rgiwuTMLtM1dzK+OlA/wKR9JJKpURKbAAAAABJRU5ErkJggg=="
                          />
                        </defs>
                      </svg>
                      <span className="text">Visualize</span>
                    </button>
                    <span aria-hidden="true" className="particle-pen">
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L7.75 1L8.563 3.846C8.77313 4.58114 9.1671 5.25062 9.70774 5.79126C10.2484 6.3319 10.9179 6.72587 11.653 6.936L14.5 7.75L11.654 8.563C10.9189 8.77313 10.2494 9.1671 9.70874 9.70774C9.1681 10.2484 8.77413 10.9179 8.564 11.653L7.75 14.5L6.937 11.654C6.72687 10.9189 6.3329 10.2494 5.79226 9.70874C5.25162 9.1681 4.58214 8.77413 3.847 8.564L1 7.75L3.846 6.937C4.58114 6.72687 5.25062 6.3329 5.79126 5.79226C6.3319 5.25162 6.72587 4.58214 6.936 3.847L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <svg
                        className="particle"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.937 3.846L6.937 3.846Z"
                          fill="black"
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Second Row - Dropdown Filters + Filter Icon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    {/* Hotness Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setHotnessOpen(!hotnessOpen)}
                        className="flex items-center space-x-2 px-3 md:px-5 py-3 md:py-4 text-white cursor-pointer border border-[#2B2B2D]  rounded-xl transition-all h-12"
                      >
                        <span
                          className={`text-xs md:text-sm font-medium ${hotnessOpen ? "text-white" : "text-gray-400"
                            } ${hotnessOpen ? "font-bold" : "font-normal"}`}
                        >
                          Hotness
                        </span>
                        <ChevronDown
                          className={`w-3 h-3 md:w-4 md:h-4 transition-transform ${hotnessOpen ? "rotate-180" : ""} ${hotnessOpen ? "text-white" : "text-gray-400"
                            } ${hotnessOpen ? "font-bold" : "font-normal"}`}
                        />
                      </button>

                      {hotnessOpen && (
                        <div className="absolute top-full left-0 mt-2 w-32 md:w-40 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                          <div className="text-left text-sm md:text-sm px-3 py-2 text-white">
                            Filter by Score
                          </div>
                          {hotnessOptions.map((option) => (
                            <button
                              key={option}
                              className="w-full px-3 md:px-4 py-2 text-left text-sm md:text-sm text-white hover:text-white/70  transition-all cursor-pointer"
                              onClick={() => {
                                setHotnessOpen(false)
                                const hotnessValue = option.includes("High")
                                  ? "high"
                                  : option.includes("Medium")
                                    ? "medium"
                                    : "low"
                                const newFilters = {
                                  ...activeFilters,
                                  hotness: hotnessValue,
                                }
                                handleFilterChange(newFilters)
                              }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Amount Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setAmountOpen(!amountOpen)}
                        className="flex items-center space-x-2 px-3 md:px-5 py-3 md:py-4 text-white cursor-pointer border border-[#2B2B2D]  rounded-xl transition-all h-12"
                      >
                        <span
                          className={`text-xs md:text-sm font-medium ${amountOpen ? "text-white" : "text-gray-400"
                            } ${amountOpen ? "font-bold" : "font-normal"}`}
                        >
                          Amount
                        </span>
                        <ChevronDown
                          className={`w-3 h-3 md:w-4 md:h-4 transition-transform ${amountOpen ? "rotate-180" : ""} ${amountOpen ? "text-white" : "text-gray-400"
                            } ${amountOpen ? "font-bold" : "font-normal"}`}
                        />
                      </button>

                      {amountOpen && (
                        <div className="absolute top-full left-0 mt-2 w-36 md:w-44 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                          <div className="text-left text-sm md:text-sm px-3 py-2 text-white">
                            Filter by Amount
                          </div>
                          {amountOptions.map((option) => (
                            <button
                              key={option}
                              className="w-full px-3 md:px-4 py-2 text-left text-sm md:text-sm text-white hover:text-white/70  transition-all cursor-pointer"
                              onClick={() => {
                                setAmountOpen(false)
                                const amountValue = option
                                  .replace(">", "")
                                  .replace("$", "")
                                  .replace(",", "")
                                const newFilters = {
                                  ...activeFilters,
                                  amount: amountValue,
                                }
                                handleFilterChange(newFilters)
                              }}
                            >
                              {option}
                            </button>
                          ))}
                          <div className="border-t border-[#2B2B2D]">
                            <button
                              className="w-full px-3 md:px-4 py-2 text-left text-sm md:text-sm text-white hover:text-white/70 transition-all cursor-pointer"
                              onClick={() => {
                                setShowCustomAmountInput(!showCustomAmountInput)
                              }}
                            >
                              Custom Amount
                            </button>
                            {showCustomAmountInput && (
                              <div className="px-3 py-2">
                                <input
                                  type="number"
                                  placeholder="Enter amount"
                                  value={customAmount}
                                  onChange={(e) =>
                                    setCustomAmount(e.target.value)
                                  }
                                  className="w-full px-2 py-1 bg-[#16171C] border border-[#2B2B2D] rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && customAmount) {
                                      const newFilters = {
                                        ...activeFilters,
                                        amount: customAmount,
                                      }
                                      handleFilterChange(newFilters)
                                      setAmountOpen(false)
                                      setShowCustomAmountInput(false)
                                      setCustomAmount("")
                                    }
                                  }}
                                />
                                <button
                                  className="w-full mt-2 px-2 py-1 bg-white/10 text-white text-xs rounded hover:bg-white/20 transition-all"
                                  onClick={() => {
                                    if (customAmount) {
                                      const newFilters = {
                                        ...activeFilters,
                                        amount: customAmount,
                                      }
                                      handleFilterChange(newFilters)
                                      setAmountOpen(false)
                                      setShowCustomAmountInput(false)
                                      setCustomAmount("")
                                    }
                                  }}
                                >
                                  Apply
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tags Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setTagsOpen(!tagsOpen)}
                        className="flex items-center space-x-2 px-3 md:px-5 py-3 md:py-4 text-white cursor-pointer border border-[#2B2B2D]  rounded-xl transition-all h-12"
                      >
                        <span
                          className={`text-xs md:text-sm font-medium ${tagsOpen ? "text-white" : "text-gray-400"
                            } ${tagsOpen ? "font-bold" : "font-normal"}`}
                        >
                          Tags
                        </span>
                        <ChevronDown
                          className={`w-3 h-3 md:w-4 md:h-4 transition-transform ${tagsOpen ? "rotate-180" : ""} ${tagsOpen ? "text-white" : "text-gray-400"
                            } ${tagsOpen ? "font-bold" : "font-normal"}`}
                        />
                      </button>

                      {tagsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-40 md:w-60 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                          <div className="text-left text-sm md:text-sm px-3 py-2 text-white font-medium">
                            Filter by Tags
                          </div>
                          {tagOptions.map((option) => {
                            const isSelected = (
                              activeFilters.tags || []
                            ).includes(option)
                            return (
                              <button
                                key={option}
                                className="w-full px-3 md:px-4 py-2 text-left text-sm md:text-sm text-white hover:text-white/70  transition-all flex items-center space-x-2 cursor-pointer"
                                onClick={() => {
                                  const currentTags = activeFilters.tags || []
                                  const newTags = isSelected
                                    ? currentTags.filter(
                                      (tag: any) => tag !== option
                                    )
                                    : [...currentTags, option]
                                  const newFilters = {
                                    ...activeFilters,
                                    tags: newTags,
                                  }
                                  handleFilterChange(newFilters)
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => { }}
                                  className="
                                  w-4 h-4 
                                  appearance-none 
                                  border-1 
                                  border-[#888888] 
                                  rounded 
                                  bg-transparent
                                  checked:bg-white 
                                  checked:border-black 
                                  checked:[&::before]:content-['✔'] 
                                  checked:[&::before]:text-black 
                                  checked:[&::before]:text-xs 
                                  checked:[&::before]:flex 
                                  checked:[&::before]:items-center 
                                  checked:[&::before]:justify-center 
                                  checked:[&::before]:h-full 
                                  checked:[&::before]:w-full
                                "
                                />
                                <span>
                                  {option
                                    .toLowerCase()
                                    .split(" ")
                                    .map(
                                      (word) =>
                                        word.charAt(0).toUpperCase() +
                                        word.slice(1)
                                    )
                                    .join(" ")}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Filter Button */}
                  <div className="relative">
                    <button
                      onClick={() => setFiltersPopupOpen(!filtersPopupOpen)}
                      className="p-3 md:p-4 bg-[#1A1A1E] border border-[#3B3B3D] rounded-xl transition-all cursor-pointer"
                    >
                      <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-400 hover:text-white" />
                    </button>

                    {filtersPopupOpen && (
                      <div className="absolute top-full right-0 mt-2 w-80 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10 p-4">
                        <div className="space-y-4">
                          {/* Age Filter */}
                          <div>
                            <label className="block text-white text-xs font-medium mb-2">
                              Age (minutes)
                            </label>
                            <div className="flex space-x-2">
                              <div className="flex-1 relative">
                                <input
                                  type="number"
                                  placeholder="Min"
                                  value={activeFilters.ageMin || ""}
                                  onChange={(e) => {
                                    const newFilters = {
                                      ...activeFilters,
                                      ageMin: e.target.value,
                                    }
                                    handleFilterChange(newFilters)
                                  }}
                                  className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400  text-xs"
                                />
                                <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                  (m)
                                </span>
                              </div>
                              <div className="flex-1 relative">
                                <input
                                  type="number"
                                  placeholder="Max"
                                  value={activeFilters.ageMax || ""}
                                  onChange={(e) => {
                                    const newFilters = {
                                      ...activeFilters,
                                      ageMax: e.target.value,
                                    }
                                    handleFilterChange(newFilters)
                                  }}
                                  className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                                />
                                <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                  (m)
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Market Cap Filter */}
                          <div>
                            <label className="block text-white text-xs font-medium mb-2">
                              Market Cap (K)
                            </label>
                            <div className="flex space-x-2">
                              <div className="flex-1 relative">
                                <input
                                  type="number"
                                  placeholder="Min"
                                  value={activeFilters.marketCapMin || ""}
                                  onChange={(e) => {
                                    const newFilters = {
                                      ...activeFilters,
                                      marketCapMin: e.target.value,
                                    }
                                    handleFilterChange(newFilters)
                                  }}
                                  className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                                />
                                <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                  (k)
                                </span>
                              </div>
                              <div className="flex-1 relative">
                                <input
                                  type="number"
                                  placeholder="Max"
                                  value={activeFilters.marketCapMax || ""}
                                  onChange={(e) => {
                                    const newFilters = {
                                      ...activeFilters,
                                      marketCapMax: e.target.value,
                                    }
                                    handleFilterChange(newFilters)
                                  }}
                                  className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                                />
                                <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                  (k)
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop Layout - All Filters in One Row */}
              <div className="hidden lg:flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {/* Transaction Type Filters */}
                  <div className="glass-radio-group">
                    {filters.map((filter) => (
                      <React.Fragment key={filter.id}>
                        <input
                          type="radio"
                          name="transactionTypeDesktop"
                          id={`glass-desktop-${filter.id}`}
                          checked={activeFilter === filter.id}
                          onChange={() => {
                            setActiveFilter(filter.id)
                            const newFilters = { ...activeFilters }
                            if (filter.id === "all") {
                              newFilters.transactionType = null
                            } else {
                              newFilters.transactionType = filter.id
                            }
                            handleFilterChange(newFilters)
                            setCurrentPage(1)
                            setTransactions([])
                            setHasMore(true)
                          }}
                        />
                        <label
                          htmlFor={`glass-desktop-${filter.id}`}
                          className="font-semibold"
                        >
                          {filter.label}
                        </label>
                      </React.Fragment>
                    ))}
                    <div
                      className="glass-glider"
                      style={{
                        transform:
                          activeFilter === "all"
                            ? "translateX(0%)"
                            : activeFilter === "buy"
                              ? "translateX(100%)"
                              : activeFilter === "sell"
                                ? "translateX(200%)"
                                : "translateX(0%)",
                        background:
                          activeFilter === "all"
                            ? "#ffffff opacity-60"
                            : activeFilter === "buy"
                              ? "#22c55e opacity-60"
                              : activeFilter === "sell"
                                ? "#ef4444"
                                : "#ffffff opacity-60",
                      }}
                    ></div>
                  </div>
                  {/* Hotness Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setHotnessOpen(!hotnessOpen)}
                      className="flex items-center space-x-2 px-4 py-3 text-white cursor-pointer border border-[#2B2B2D]  rounded-xl transition-all h-12"
                    >
                      <span
                        className={`text-sm font-medium ${hotnessOpen ? "text-white" : "text-gray-400"
                          } ${hotnessOpen ? "font-bold" : "font-normal"}`}
                      >
                        Hotness
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${hotnessOpen ? "rotate-180" : ""} ${hotnessOpen ? "text-white" : "text-gray-400"
                          } ${hotnessOpen ? "font-bold" : "font-normal"}`}
                      />
                    </button>

                    {hotnessOpen && (
                      <div className="absolute top-full left-0 mt-2 w-40 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                        <div className="text-left text-sm md:text-sm px-3 py-2">
                          Filter by Score
                        </div>
                        {hotnessOptions.map((option) => (
                          <button
                            key={option}
                            className="w-full px-4 py-2 text-left text-sm text-white hover:text-white/70  transition-all cursor-pointer"
                            onClick={() => {
                              setHotnessOpen(false)
                              const hotnessValue = option.includes("High")
                                ? "high"
                                : option.includes("Medium")
                                  ? "medium"
                                  : "low"
                              const newFilters = {
                                ...activeFilters,
                                hotness: hotnessValue,
                              }
                              handleFilterChange(newFilters)
                            }}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Amount Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setAmountOpen(!amountOpen)}
                      className="flex items-center space-x-2 px-4 py-3 text-white cursor-pointer border border-[#2B2B2D]  rounded-xl transition-all h-12"
                    >
                      <span
                        className={`text-sm font-medium ${amountOpen ? "text-white" : "text-gray-400"
                          } ${amountOpen ? "font-bold" : "font-normal"}`}
                      >
                        Amount
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${amountOpen ? "rotate-180" : ""} ${amountOpen ? "text-white" : "text-gray-400"
                          } ${amountOpen ? "font-bold" : "font-normal"}`}
                      />
                    </button>

                    {amountOpen && (
                      <div className="absolute top-full left-0 mt-2 w-44 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                        <div className="text-left text-sm md:text-sm px-3 py-2">
                          Filter by Amount
                        </div>
                        {amountOptions.map((option) => (
                          <button
                            key={option}
                            className="w-full px-4 py-2 text-left text-sm text-white hover:text-white/70 transition-all cursor-pointer"
                            onClick={() => {
                              setAmountOpen(false)
                              const amountValue = option
                                .replace(">", "")
                                .replace("$", "")
                                .replace(",", "")
                              const newFilters = {
                                ...activeFilters,
                                amount: amountValue,
                              }
                              handleFilterChange(newFilters)
                            }}
                          >
                            {option}
                          </button>
                        ))}
                        <div className="border-t border-[#2B2B2D]">
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-white hover:text-white/70 transition-all cursor-pointer"
                            onClick={() => {
                              setShowCustomAmountInput(!showCustomAmountInput)
                            }}
                          >
                            Custom Amount
                          </button>
                          {showCustomAmountInput && (
                            <div className="px-3 py-2">
                              <input
                                type="number"
                                placeholder="Enter amount"
                                value={customAmount}
                                onChange={(e) => setCustomAmount(e.target.value)}
                                className="w-full px-2 py-1 bg-[#16171C] border border-[#2B2B2D] rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && customAmount) {
                                    const newFilters = {
                                      ...activeFilters,
                                      amount: customAmount,
                                    }
                                    handleFilterChange(newFilters)
                                    setAmountOpen(false)
                                    setShowCustomAmountInput(false)
                                    setCustomAmount("")
                                  }
                                }}
                              />
                              <button
                                className="w-full mt-2 px-2 py-1 bg-white/10 text-white text-xs rounded hover:bg-white/20 transition-all"
                                onClick={() => {
                                  if (customAmount) {
                                    const newFilters = {
                                      ...activeFilters,
                                      amount: customAmount,
                                    }
                                    handleFilterChange(newFilters)
                                    setAmountOpen(false)
                                    setShowCustomAmountInput(false)
                                    setCustomAmount("")
                                  }
                                }}
                              >
                                Apply
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tags Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setTagsOpen(!tagsOpen)}
                      className="flex items-center space-x-2 px-4 py-3 text-white cursor-pointer border border-[#2B2B2D]  rounded-xl transition-all h-12"
                    >
                      <span
                        className={`text-sm font-medium ${tagsOpen ? "text-white" : "text-gray-400"
                          } ${tagsOpen ? "font-bold" : "font-normal"}`}
                      >
                        Tags
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${tagsOpen ? "rotate-180" : ""} ${tagsOpen ? "text-white" : "text-gray-400"
                          } ${tagsOpen ? "font-bold" : "font-normal"}`}
                      />
                    </button>

                    {tagsOpen && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                        <div className="text-left text-sm md:text-sm px-3 py-2 text-white">
                          Filter by Tags
                        </div>
                        {tagOptions.map((option) => {
                          const isSelected = (activeFilters.tags || []).includes(
                            option
                          )
                          return (
                            <button
                              key={option}
                              className="w-full px-4 py-2 text-left text-sm text-white hover:text-white/70  transition-all flex items-center space-x-2 cursor-pointer"
                              onClick={() => {
                                const currentTags = activeFilters.tags || []
                                const newTags = isSelected
                                  ? currentTags.filter(
                                    (tag: any) => tag !== option
                                  )
                                  : [...currentTags, option]
                                const newFilters = {
                                  ...activeFilters,
                                  tags: newTags,
                                }
                                handleFilterChange(newFilters)
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => { }}
                                className="
                                  w-4 h-4 
                                  appearance-none 
                                  border-1 
                                  border-[#888888] 
                                  rounded 
                                  bg-transparent
                                  checked:bg-white 
                                  checked:border-black 
                                  checked:[&::before]:content-['✔'] 
                                  checked:[&::before]:text-black 
                                  checked:[&::before]:text-xs 
                                  checked:[&::before]:flex 
                                  checked:[&::before]:items-center 
                                  checked:[&::before]:justify-center 
                                  checked:[&::before]:h-full 
                                  checked:[&::before]:w-full
                                "
                              />
                              <span>
                                {option
                                  .toLowerCase()
                                  .split(" ")
                                  .map(
                                    (word) =>
                                      word.charAt(0).toUpperCase() + word.slice(1)
                                  )
                                  .join(" ")}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Filter Button - Desktop Advanced Filters Popup */}
                <div className="relative">
                  <button
                    onClick={() => setFiltersPopupOpen(!filtersPopupOpen)}
                    className="p-3 bg-[#1A1A1E] border border-[#3B3B3D] rounded-xl transition-all cursor-pointer"
                  >
                    <Filter className="w-10 h-6 text-gray-400 hover:text-white" />
                  </button>

                  {filtersPopupOpen && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10 p-4">
                      <div className="space-y-4">
                        {/* Age Filter */}
                        <div>
                          <label className="block text-gray-400 text-xs font-medium mb-2">
                            Age (minutes)
                          </label>
                          <div className="flex space-x-2">
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                placeholder="Min"
                                value={activeFilters.ageMin || ""}
                                onChange={(e) => {
                                  const newFilters = {
                                    ...activeFilters,
                                    ageMin: e.target.value,
                                  }
                                  handleFilterChange(newFilters)
                                }}
                                className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                              />
                              <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                (m)
                              </span>
                            </div>
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                placeholder="Max"
                                value={activeFilters.ageMax || ""}
                                onChange={(e) => {
                                  const newFilters = {
                                    ...activeFilters,
                                    ageMax: e.target.value,
                                  }
                                  handleFilterChange(newFilters)
                                }}
                                className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                              />
                              <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                (m)
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Market Cap Filter */}
                        <div>
                          <label className="block text-gray-400 text-xs font-medium mb-2">
                            Market Cap (K)
                          </label>
                          <div className="flex space-x-2">
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                placeholder="Min"
                                value={activeFilters.marketCapMin || ""}
                                onChange={(e) => {
                                  const newFilters = {
                                    ...activeFilters,
                                    marketCapMin: e.target.value,
                                  }
                                  handleFilterChange(newFilters)
                                }}
                                className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                              />
                              <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                (k)
                              </span>
                            </div>
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                placeholder="Max"
                                value={activeFilters.marketCapMax || ""}
                                onChange={(e) => {
                                  const newFilters = {
                                    ...activeFilters,
                                    marketCapMax: e.target.value,
                                  }
                                  handleFilterChange(newFilters)
                                }}
                                className="w-full bg-[#1F2024]  rounded-lg px-3 py-2 text-white placeholder-gray-400   text-xs"
                              />
                              <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                                (k)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="mt-3 md:mt-4 p-3 md:p-4 lg:p-5 bg-[#101014] border border-gray-700 rounded-xl">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <button
                    onClick={() => setShowAdvancedFilters(false)}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 lg:gap-6">
                  {/* Age Filter */}
                  <div>
                    <label className="block text-gray-400 text-xs md:text-sm font-medium mb-1.5 md:mb-2">
                      Age (in minutes)
                    </label>
                    <div className="flex space-x-1.5 md:space-x-2">
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="Min"
                          value={activeFilters.ageMin || ""}
                          onChange={(e) => {
                            const newFilters = {
                              ...activeFilters,
                              ageMin: e.target.value,
                            }
                            handleFilterChange(newFilters)
                          }}
                          className="w-full bg-[#1A1A1E] border border-gray-700 rounded-lg px-2 md:px-3 py-2 md:py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm pr-8"
                        />
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                          (m)
                        </span>
                      </div>
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="Max"
                          value={activeFilters.ageMax || ""}
                          onChange={(e) => {
                            const newFilters = {
                              ...activeFilters,
                              ageMax: e.target.value,
                            }
                            handleFilterChange(newFilters)
                          }}
                          className="w-full bg-[#1A1A1E] border border-gray-700 rounded-lg px-2 md:px-3 py-2 md:py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm pr-8"
                        />
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                          (m)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Market Cap Filter */}
                  <div>
                    <label className="block text-gray-400 text-xs md:text-sm font-medium mb-1.5 md:mb-2">
                      Market Cap (in K)
                    </label>
                    <div className="flex space-x-1.5 md:space-x-2">
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="Min"
                          value={activeFilters.marketCapMin || ""}
                          onChange={(e) => {
                            const newFilters = {
                              ...activeFilters,
                              marketCapMin: e.target.value,
                            }
                            handleFilterChange(newFilters)
                          }}
                          className="w-full bg-[#1A1A1E] border border-gray-700 rounded-lg px-2 md:px-3 py-2 md:py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm pr-8"
                        />
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                          (k)
                        </span>
                      </div>
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="Max"
                          value={activeFilters.marketCapMax || ""}
                          onChange={(e) => {
                            const newFilters = {
                              ...activeFilters,
                              marketCapMax: e.target.value,
                            }
                            handleFilterChange(newFilters)
                          }}
                          className="w-full bg-[#1A1A1E] border border-gray-700 rounded-lg px-2 md:px-3 py-2 md:py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs md:text-sm pr-8"
                        />
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
                          (k)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Applied Filters Display */}

            {Object.keys(activeFilters).some(
              (key) =>
                activeFilters[key as keyof typeof activeFilters] !== null &&
                activeFilters[key as keyof typeof activeFilters] !== "" &&
                !(
                  Array.isArray(
                    activeFilters[key as keyof typeof activeFilters]
                  ) &&
                  (activeFilters[key as keyof typeof activeFilters] as any[])
                    .length === 0
                )
            ) && (
                <div className="flex items-center gap-2 flex-wrap mb-4 mt-4">
                  <span className="text-gray-400 text-sm">Applied filters:</span>

                  {activeFilters.searchQuery && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-[#2A2A2D] text-white">
                      Search:{" "}
                      {(activeFilters as any).displayQuery ||
                        activeFilters.searchQuery}
                      <button
                        onClick={() => {
                          const newFilters = {
                            ...activeFilters,
                            searchQuery: "",
                            displayQuery: "",
                          }
                          handleFilterChange(newFilters)
                        }}
                        className="ml-2 hover:bg-[#2A2A2D] rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {activeFilters.transactionType && (
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs ${activeFilters.transactionType === "sell" ? "bg-[#ef4444]" : "bg-[#22c55e]"} text-white`}
                    >
                      Type: {activeFilters.transactionType}
                      <button
                        onClick={() => {
                          const newFilters = {
                            ...activeFilters,
                            transactionType: null,
                          }
                          handleFilterChange(newFilters)
                          setActiveFilter("all")
                        }}
                        className="ml-2 hover:bg-[#2A2A2D] rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {activeFilters.hotness && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-[#2A2A2D] text-white">
                      Hotness: {activeFilters.hotness}
                      <button
                        onClick={() => {
                          const newFilters = { ...activeFilters, hotness: null }
                          handleFilterChange(newFilters)
                        }}
                        className="ml-2 hover:bg-[#2A2A2D] rounded-full w-4 h-4 flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {activeFilters.amount && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-[#2A2A2D] text-white">
                      Amount: ${activeFilters.amount}
                      <button
                        onClick={() => {
                          const newFilters = { ...activeFilters, amount: null }
                          handleFilterChange(newFilters)
                        }}
                        className="ml-2 hover:bg-[#2A2A2D] rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {activeFilters.tags &&
                    activeFilters.tags.length > 0 &&
                    activeFilters.tags.map((tag: any, index: number) => (
                      <span
                        key={`tag-${tag}-${index}`}
                        className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-[#2A2A2D] text-white"
                      >
                        Tag: {tag}
                        <button
                          onClick={() => {
                            const newFilters = { ...activeFilters }
                            newFilters.tags = newFilters.tags.filter(
                              (t: any) => t !== tag
                            )
                            handleFilterChange(newFilters)
                          }}
                          className="ml-2 hover:bg-orange-700 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                  {(activeFilters.ageMin || activeFilters.ageMax) && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-[#2A2A2D] text-white">
                      Age: {activeFilters.ageMin || "0"}-
                      {activeFilters.ageMax || "∞"}m
                      <button
                        onClick={() => {
                          const newFilters = {
                            ...activeFilters,
                            ageMin: null,
                            ageMax: null,
                          }
                          handleFilterChange(newFilters)
                        }}
                        className="ml-2 hover:bg-indigo-700 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {(activeFilters.marketCapMin || activeFilters.marketCapMax) && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-[#2A2A2D] text-white">
                      MC: {activeFilters.marketCapMin || "0"}-
                      {activeFilters.marketCapMax || "∞"}k
                      <button
                        onClick={() => {
                          const newFilters = {
                            ...activeFilters,
                            marketCapMin: null,
                            marketCapMax: null,
                          }
                          handleFilterChange(newFilters)
                        }}
                        className="ml-2 hover:bg-pink-700 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  <button
                    onClick={() => {
                      const clearedFilters = {
                        searchQuery: "",
                        searchType: null,
                        hotness: null,
                        transactionType: null,
                        tags: [],
                        amount: null,
                        ageMin: null,
                        ageMax: null,
                        marketCapMin: null,
                        marketCapMax: null,
                      }
                      handleFilterChange(clearedFilters)
                      setActiveFilter("all")
                      setShowAdvancedFilters(false)
                      setHotnessOpen(false)
                      setAmountOpen(false)
                      setTagsOpen(false)
                      setFiltersPopupOpen(false)
                      // Clear the TokenizedSearchInput by triggering re-render
                      setClearSearchTrigger((prev) => prev + 1)
                    }}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-white/70 text-black cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              )}

            {/* Transactions List */}

            <div className="flex flex-col bg-[#1B1B1D] pt-2 pl-2 pb-2 pr-1 md:pt-3 md:pl-3 md:pb-3 md:pr-1 rounded-lg border-1 border-[#2A2A2D] flex-1 min-h-0">
              <div className="overflow-y-auto pr-1 custom-scrollbar flex-1">
                {isAllTxLoading ? (
                  <div className="flex items-center justify-center h-[500px]">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex justify-center items-center z-20">
                        <div className="lds-spinner text-white">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i}></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="flex items-center justify-center h-[500px]">
                    <p className="text-white opacity-70 text-sm">
                      No transactions available at the moment. Please check back
                      later or try adjusting your filters.
                    </p>
                  </div>
                ) : (
                  transactions.map((tx: any, index: number) => (
                    <div
                      key={`${tx.id}-${index}`}
                      ref={
                        index === transactions.length - 1
                          ? lastTransactionRef
                          : null
                      }
                      onClick={() =>
                        handleTransactionInfoAll(tx.signature, tx.type)
                      }
                      className={`bg-[#111113] border border-[#2A2A2D] rounded-lg p-4 transition-colors mb-3 cursor-pointer ${newTxIds.has(tx.id) ? "animate-slide-up" : ""} hover:bg-[#1A1A1E] hover:border-[#3A3A3D]`}
                      style={{
                        animationDelay: newTxIds.has(tx.id)
                          ? `${index * 100}ms`
                          : "0ms",
                      }}
                      onAnimationEnd={() =>
                        setNewTxIds((prev) => {
                          const updated = new Set(prev)
                          updated.delete(tx.id)
                          return updated
                        })
                      }
                    >
                      {/* Card Header Row */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                          <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">
                            <TimeAgo timestamp={tx.timestamp} />
                          </span>
                          {tx.hotnessScore > 0 && (
                            <span className="text-[11px] text-gray-400 uppercase tracking-wider">
                              HOTNESS SCORE: <span className="text-white font-semibold">{tx.hotnessScore}/10</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="px-4 py-1.5 bg-transparent hover:bg-[#00D9AC]/10 border border-[#00D9AC] text-[11px] text-[#00D9AC] rounded font-semibold transition-colors uppercase tracking-wider"
                            onClick={(e) => { e.stopPropagation(); handleQuickBuy(tx) }}
                            aria-label={`Quick buy ${tx.type === "sell" ? tx.tokenInSymbol : tx.tokenOutSymbol} token`}
                            title="Quick buy this token"
                          >
                            QUICK BUY
                          </button>
                          <button
                            className="p-1.5 text-gray-500 hover:text-white transition-colors bg-transparent border border-[#2A2A2D] rounded hover:border-gray-500"
                            onClick={(e) => { e.stopPropagation(); handleCopyTokenAddress(tx.type === "sell" ? tx.tokenInAddress : tx.tokenOutAddress, tx.signature) }}
                            aria-label="Copy token address to clipboard"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 text-gray-500 hover:text-white transition-colors bg-transparent border border-[#2A2A2D] rounded hover:border-gray-500"
                            onClick={(e) => { e.stopPropagation(); handleTransactionInfoNewTab(tx.signature, tx.type) }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Body - Two Column Layout */}
                      <div className="flex items-center justify-between">
                        {/* Left Column - Whale Info */}
                        <div className="flex items-center gap-4 flex-1">
                          <img
                            src={tx.whaleTokenURL || DefaultTokenImage}
                            alt={tx.whaleTokenSymbol}
                            className="w-14 h-14 rounded-full flex-shrink-0 border-2 border-[#2A2A2D]"
                            onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                          />
                          <div className="flex flex-col gap-1.5">
                            {/* Whale Name in Cyan */}
                            <h4 className="text-[#00D9AC] font-bold text-sm uppercase tracking-wide">
                              {tx.whaleTokenSymbol}
                            </h4>

                            {/* Tags Row */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(tx.whaleLabel || []).slice(0, 2).map((tag: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 bg-[#2A2A2D] text-[9px] text-gray-300 rounded uppercase tracking-wide font-medium">
                                  {tag}
                                </span>
                              ))}
                              {(tx.whaleLabel || []).length > 2 && (
                                <span className="px-2 py-0.5 bg-[#2A2A2D] text-[9px] text-gray-400 rounded font-medium">
                                  +{(tx.whaleLabel || []).length - 2}
                                </span>
                              )}
                            </div>

                            {/* BUY/SELL Button with Arrow */}
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold uppercase tracking-wide ${tx.type === "sell"
                                  ? "bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30"
                                  : "bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30"
                                  }`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-lg leading-none">{tx.type === "sell" ? "→" : "→"}</span>
                                {tx.type.toUpperCase()}
                              </button>
                            </div>

                            {/* Transaction Amount */}
                            <span className={`text-sm font-bold uppercase ${tx.type === "sell" ? "text-[#EF4444]" : "text-[#22C55E]"}`}>
                              {tx.type === "sell" ? "SOLD" : "BOUGHT"} ${Number(getTransactionAmount(tx)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>

                        {/* Right Column - Token Info */}
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            {/* Token Name */}
                            <h4 className="text-white font-bold text-sm uppercase mb-0.5">
                              {tx.type === 'sell' ? tx.transaction.tokenIn.symbol : tx.transaction.tokenOut.symbol}
                            </h4>
                            {/* Token Description/Tagline */}
                            <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">
                              {tx.type === 'sell'
                                ? (tx.transaction.tokenIn.name || 'NA').substring(0, 20)
                                : (tx.transaction.tokenOut.name || 'NA').substring(0, 20)}
                            </p>
                            {/* MC / Age Stats */}
                            <div className="text-[10px] text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              MC: <span className="text-gray-300">${formatNumber(getMarketCap(tx))}</span> / AGE: <span className="text-gray-300">{tx.age}</span>
                            </div>
                          </div>
                          {/* Token Avatar */}
                          <div
                            className="relative w-14 h-14 flex-shrink-0 cursor-pointer group"
                            onClick={(e) => {
                              e.stopPropagation()
                              const tokenAddress = tx.type === "sell" ? tx.tokenInAddress : tx.tokenOutAddress
                              handleCopyTokenAddress(tokenAddress, tx.signature)
                            }}
                          >
                            <img
                              src={tx.type === "sell" ? (tx.inTokenURL || DefaultTokenImage) : (tx.outTokenURL || DefaultTokenImage)}
                              alt="Token"
                              className="w-14 h-14 rounded-full transition-transform duration-200 group-hover:scale-105 border-2 border-[#2A2A2D]"
                              onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {/* Infinite Scroll Loading Indicator */}
                {isLoadingMore && (
                  <div className="flex items-center justify-center py-4">
                    <div className="flex flex-col items-center gap-2">
                      <GridLoader />
                      <span className="text-gray-400 text-sm">
                        Loading more transactions...
                      </span>
                    </div>
                  </div>
                )}

                {/* Load More Button (Alternative to auto-scroll) */}
                {!isAllTxLoading && !isLoadingMore && hasMore && (
                  <div className="flex items-center justify-center py-4">
                    <button
                      onClick={() => {
                        const nextPage = currentPage + 1
                        fetchTransactions(
                          nextPage,
                          itemsPerPage,
                          activeFilters,
                          true
                        )
                      }}
                      className="px-6 py-3 bg-[#1A1A1E] hover:bg-[#2A2A2E] text-white rounded-xl transition-all border border-gray-700"
                    >
                      Load More Transactions
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Right Sidebar - sibling of main content inside flex container */}
          <div className="hidden xl:block w-[350px] shrink-0 sticky top-4 h-[calc(100vh-2rem)]">
            <RightSidebar selectedToken={selectedToken} quickBuyAmount={quickBuyAmount} />
          </div>
        </div>
      </div>
      <ReactFlowProvider>
        <WhaleFilterModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </ReactFlowProvider>

      <SwapModal
        isOpen={isSwapModalOpen}
        onClose={() => {
          setIsSwapModalOpen(false)
          setSelectedToken(null)
        }}
        mode="quickBuy"
        initialInputToken={{
          address: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          name: "Solana",
          decimals: 9,
          image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
        }}
        initialOutputToken={selectedToken}
        initialAmount={quickBuyAmount}
      />


    </>
  )
}

export default HomePage

const style = document.createElement("style")
style.textContent = `
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(100px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.animate-slide-up {
  animation: slide-up 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  transform-origin: center;
}

/* Enhanced new transaction highlight effect */
.animate-slide-up::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(6, 223, 115, 0.1), transparent);
  border-radius: 8px;
  opacity: 0;
  animation: highlight-pulse 0.6s ease-out;
  pointer-events: none;
}

@keyframes highlight-pulse {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  50% {
    opacity: 1;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1);
  }
}

/* Custom scrollbar styling */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #161618;
  border-radius: 10px;
  margin: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #374151;
}

/* Sparkle Button Styles */
:root {
  --transition: 0.25s;
  --spark: 1.8s;
}

.sparkle-button button {
  --cut: 0.1em;
  --active: 0;
  --bg: hsl(260 calc(var(--active) * 97%) calc((var(--active) * 44%) + 12%));
  background: var(--bg);
  font-size: 1rem;
  font-weight: 500;
  border: 0;
  cursor: pointer;
  padding: 0.9em 1.3em;
  display: flex;
  align-items: center;
  gap: 0.25em;
  white-space: nowrap;
  border-radius: 100px;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 0.05em 0 0 hsl(260 calc(var(--active) * 97%) calc((var(--active) * 50%) + 30%)) inset,
    0 -0.05em 0 0 hsl(260 calc(var(--active) * 97%) calc(var(--active) * 60%)) inset;
  transition: box-shadow var(--transition), scale var(--transition), background var(--transition);
  scale: calc(1 + (var(--active) * 0.05));
}

.sparkle-button button:active {
  scale: 1;
}

.sparkle-button svg {
  overflow: visible !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.sparkle-button .sparkle path {
  color: hsl(0 0% calc((var(--active, 0) * 70%) + var(--base)));
  transform-box: fill-box;
  transform-origin: center;
  fill: currentColor;
  stroke: currentColor;
  animation-delay: calc((var(--transition) * 1.5) + (var(--delay) * 1s));
  animation-duration: 0.6s;
  transition: color var(--transition);
}

.sparkle-button button:is(:hover, :focus-visible) path {
  animation-name: bounce;
}

@keyframes bounce {
  35%, 65% {
    scale: var(--scale);
  }
}

.sparkle-button .sparkle path:nth-of-type(1) {
  --scale: 0.5;
  --delay: 0.1;
  --base: 40%;
}

.sparkle-button .sparkle path:nth-of-type(2) {
  --scale: 1.5;
  --delay: 0.2;
  --base: 20%;
}

.sparkle-button .sparkle path:nth-of-type(3) {
  --scale: 2.5;
  --delay: 0.35;
  --base: 30%;
}

.sparkle-button button:before {
  content: "";
  position: absolute;
  inset: -0.25em;
  z-index: -1;
  border: 0.25em solid hsl(260 97% 50% / 0.5);
  border-radius: 100px;
  opacity: var(--active, 0);
  transition: opacity var(--transition);
}

.sparkle-button .spark {
  position: absolute;
  inset: 0;
  border-radius: 100px;
  rotate: 0deg;
  overflow: hidden;
  mask: linear-gradient(white, transparent 50%);
  animation: flip calc(var(--spark) * 2) infinite steps(2, end);
}

@keyframes flip {
  to {
    rotate: 360deg;
  }
}

.sparkle-button .spark:before {
  content: "";
  position: absolute;
  width: 200%;
  aspect-ratio: 1;
  top: 0%;
  left: 50%;
  z-index: -1;
  transform: translate(-50%, -15%) rotate(-90deg);
  opacity: calc((var(--active)) + 0.4);
  background: conic-gradient(
    from 0deg,
    transparent 0 340deg,
    white 360deg
  );
  transition: opacity var(--transition);
  animation: rotate var(--spark) linear infinite both;
}

.sparkle-button .spark:after {
  content: "";
  position: absolute;
  inset: var(--cut);
  border-radius: 100px;
}

.sparkle-button .backdrop {
  position: absolute;
  inset: var(--cut);
  background: var(--bg);
  border-radius: 100px;
  transition: background var(--transition);
}

@keyframes rotate {
  to {
    transform: rotate(90deg);
  }
}

.sparkle-button button:is(:hover, :focus-visible) {
  --active: 1;
  --play-state: running;
}

.sparkle-button .text {
  transform: translate(2%, -6%);
  letter-spacing: 0.01ch;
  background: linear-gradient(90deg, hsl(0 0% calc((var(--active) * 100%) + 65%)), hsl(0 0% calc((var(--active) * 97%) + 26%)));
  -webkit-background-clip: text;
  color: transparent;
  transition: background var(--transition);
}

.sparkle-button button svg {
  inline-size: 1.25em;
  transform: translate(-25%, -5%);
  transition: filter var(--transition), transform var(--transition);
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* Mobile-specific sparkle button styles */
@media (max-width: 768px) {
  .sparkle-button button svg {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    width: 1rem !important;
    height: 1rem !important;
  }

  .sparkle-button svg {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
}

.sparkle-button button:is(:hover, :focus-visible) svg {
  filter: brightness(0) invert(1);
  transform: translate(-25%, -5%) scale(1.1);
}

.sparkle-button .particle-pen {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  -webkit-mask: radial-gradient(white, transparent 65%);
  z-index: -1;
  opacity: var(--active, 0);
  transition: opacity var(--transition);
  overflow: hidden;
}

.sparkle-button .particle {
  fill: white;
  width: calc(var(--size, 0.25) * 1rem);
  aspect-ratio: 1;
  position: absolute;
  top: calc(var(--y) * 1%);
  left: calc(var(--x) * 1%);
  opacity: var(--alpha, 1);
  animation: float-out calc(var(--duration, 1) * 1s) calc(var(--delay) * -1s) infinite linear;
  transform-origin: center;
  z-index: -1;
  animation-play-state: var(--play-state, paused);
}

.sparkle-button .particle path {
  fill: hsl(0 0% 90%);
  stroke: none;
}

.sparkle-button .particle:nth-of-type(even) {
  animation-direction: reverse;
}

@keyframes float-out {
  to {
    rotate: 360deg;
  }
}

.sparkle-button button:is(:hover, :focus-visible) ~ .particle-pen {
  --active: 1;
  --play-state: running;
}
`
document.head.appendChild(style)

// This is a new comment