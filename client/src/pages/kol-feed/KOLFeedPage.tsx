
import React, { useState, useEffect, useCallback, useRef } from "react"
import { io } from "socket.io-client"
import { useNavigate } from "react-router-dom"
import TransactionListSkeleton from "../../components/skeletons/TransactionListSkeleton"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { IoMdTrendingUp } from "react-icons/io"
import { HiChevronUpDown } from "react-icons/hi2"
import { faArrowRight, faArrowTrendDown, faClose, faFilter, faSearch } from "@fortawesome/free-solid-svg-icons"
import { PiMagicWand } from "react-icons/pi"
import { FaXTwitter } from "react-icons/fa6"
import { formatNumber } from "../../utils/FormatNumber"
import { formatAge } from "../../utils/formatAge"
import { useToast } from "../../contexts/ToastContext"
import DefaultTokenImage from "../../assets/default_token.svg"
import TwitterVerified from "../../assets/twitter_verified.svg"
import axios from "axios"
import WhaleFilterModal from "../../components/WhaleFilterModel"
import { ReactFlowProvider } from "@xyflow/react"
import RightSidebarNew from "../home/RightSidebarNew"
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { RiFileCopyLine } from "react-icons/ri";

import SwapModal from "../../components/swap/SwapModal"
import { validateQuickBuyAmount, saveQuickBuyAmount, loadQuickBuyAmount } from "../../utils/quickBuyValidation"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { useAuth } from "../../contexts/AuthContext"
import { usePremiumAccess } from "../../contexts/PremiumAccessContext"
import KOLAlertPopup from "./KOLAlertPopup";

const hotnessOptions = [
  { label: "All", value: null },
  { label: "High (8-10)", value: "high" },
  { label: "Medium (5-7)", value: "medium" },
  { label: "Low (1-4)", value: "low" }
]

const amountOptions = [
  { label: "All", value: null },
  { label: ">$1,000", value: "1000" },
  { label: ">$2,500", value: "2500" },
  { label: ">$5,000", value: "5000" },
  { label: ">$10,000", value: "10000" }
]



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

// Updated fetch function to use KOL/Influencer API
const fetchPaginatedWhaleTransactions = async (
  page: number,
  limit: number,
  filters: {
    searchQuery?: string
    searchType?: "kol" | "coin" | "all" | null
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

    if (filters.searchQuery && filters.searchQuery.trim()) {
      queryParams.append("search", filters.searchQuery.trim())
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

    // Updated endpoint for KOL Feed
    const response = await axios.get(
      `${BASE_URL}/influencer/influencer-whale-transactions?${queryParams}`
    )
    if (response.status !== 200) {
      throw new Error("Failed to fetch paginated transactions")
    }

    const data = response.data

    const transformedData = {
      transactions: expandTransactions(data.transactions || [], filters.amount),
      totalCount: data.total || 0,
      totalPages: data.totalPages || 0,
      currentPage: data.page || page,
      hasNextPage: data.page < data.totalPages,
      hasPrevPage: data.page > 1,
      queryTime: data.queryTime || 0,
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
    const getCorrectTokenAge = (transaction: any) => {
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

      if (bothType.buyType) {
        const buyAmount = parseFloat(tx.amount?.buyAmount || "0")
        const threshold = amountThreshold ? parseFloat(amountThreshold) : 0

        if (!amountThreshold || buyAmount >= threshold) {
          const buyAge = formatAge(tx.tokenOutAge)

          expandedTransactions.push({
            ...tx,
            type: "buy",
            _id: `${tx._id}_buy`,
            age: buyAge,
            timestamp,
          })
        }
      }

      if (bothType.sellType) {
        const sellAmount = parseFloat(tx.amount?.sellAmount || "0")
        const threshold = amountThreshold ? parseFloat(amountThreshold) : 0

        if (!amountThreshold || sellAmount >= threshold) {
          const sellAge = formatAge(tx.tokenInAge)

          expandedTransactions.push({
            ...tx,
            type: "sell",
            _id: `${tx._id}_sell`,
            age: sellAge,
            timestamp,
          })
        }
      }
    } else {
      expandedTransactions.push({
        ...tx,
        age,
        timestamp,
      })
    }
  })

  return expandedTransactions
}

const KOLFeedPage = () => {
  const [activeFilter, setActiveFilter] = useState("all")
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [newTxIds, setNewTxIds] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [quickBuyAmount, setQuickBuyAmount] = useState(() => loadQuickBuyAmount() || "0")
  const [quickBuyAmountError, setQuickBuyAmountError] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const [swapTokenInfo, setSwapTokenInfo] = useState<any>(null)
  const { showToast } = useToast()
  const { wallet } = useWalletConnection()
  const { user } = useAuth()
  const { validateAccess } = usePremiumAccess()
  const navigate = useNavigate()

  const [transactions, setTransactions] = useState<any[]>([])
  const [isAllTxLoading, setIsAllTxLoading] = useState(false)

  // Infinite scroll state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // WebSocket state
  const [, setNewTransactionsCount] = useState(0)
  const [, setHasNewTransactions] = useState(false)
  const [, setPendingLiveTransactions] = useState<any[]>([])

  // Filters state - using KOL specific key
  const [activeFilters, setActiveFilters] = useState(() => {
    const savedFilters = localStorage.getItem("kolHomePageFilters")
    if (savedFilters) {
      try {
        return JSON.parse(savedFilters)
      } catch {
        return {
          searchQuery: "",
          searchType: null as "kol" | "coin" | "all" | null,
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
      searchType: null as "kol" | "coin" | "all" | null,
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

  useEffect(() => {
    localStorage.setItem("kolHomePageFilters", JSON.stringify(activeFilters))
  }, [activeFilters])

  const activeFiltersRef = useRef(activeFilters)
  activeFiltersRef.current = activeFilters

  // Client-side filter matching function - Updated for KOL
  const doesTransactionMatchFilters = useCallback(
    (transaction: any, filters: any) => {
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const query = filters.searchQuery.trim().toLowerCase()
        const tokenInSymbol = transaction.tokenInSymbol?.toLowerCase() || ""
        const tokenOutSymbol = transaction.tokenOutSymbol?.toLowerCase() || ""
        const tokenInAddress = transaction.tokenInAddress?.toLowerCase() || ""
        const tokenOutAddress = transaction.tokenOutAddress?.toLowerCase() || ""

        // Added influencer checks
        const influencerName = transaction.influencerName?.toLowerCase() || ""
        const influencerUsername = transaction.influencerUsername?.toLowerCase() || ""

        if (
          !tokenInSymbol.includes(query) &&
          !tokenOutSymbol.includes(query) &&
          !tokenInAddress.includes(query) &&
          !tokenOutAddress.includes(query) &&
          !influencerName.includes(query) &&
          !influencerUsername.includes(query)
        ) {
          return false
        }
      }

      if (filters.transactionType && filters.transactionType !== "all") {
        if (transaction.type !== filters.transactionType) {
          return false
        }
      }

      if (filters.hotness) {
        const hotnessScore = transaction.hotnessScore || 0
        switch (filters.hotness) {
          case "high":
            if (hotnessScore < 8 || hotnessScore > 10) return false
            break
          case "medium":
            if (hotnessScore < 5 || hotnessScore > 7) return false
            break
          case "low":
            if (hotnessScore < 1 || hotnessScore > 4) return false
            break
        }
      }

      if (filters.tags && filters.tags.length > 0) {
        const transactionTags = transaction.whaleLabel || []
        const hasMatchingTag = filters.tags.some((tag: string) =>
          transactionTags.some((transactionTag: string) =>
            transactionTag.toLowerCase().includes(tag.toLowerCase())
          )
        )
        if (!hasMatchingTag) return false
      }

      if (filters.amount) {
        const amount = parseFloat(filters.amount.replace(/[>$,\s]/g, ""))
        const transactionAmount = getTransactionAmount(transaction)
        if (transactionAmount < amount) return false
      }

      return true
    },
    []
  )

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
          setTransactions((prev) => [...prev, ...(data.transactions || [])])
        } else {
          setTransactions(data.transactions || [])
        }

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

  // Initial load
  useEffect(() => {
    fetchTransactions(1, itemsPerPage, activeFilters, false)
  }, [])

  // Re-fetch when filters change
  useEffect(() => {
    setCurrentPage(1)
    setHasMore(true)
    setTransactions([])
    const timer = setTimeout(() => {
      fetchTransactions(1, itemsPerPage, activeFiltersRef.current, false)
    }, 100)

    return () => clearTimeout(timer)
  }, [activeFilters, fetchTransactions, itemsPerPage])

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
    [isLoadingMore, hasMore, currentPage, itemsPerPage, fetchTransactions, isAllTxLoading]
  )

  // WebSocket event handlers - Updated for KOL
  useEffect(() => {
    const handleNewTransaction = async (eventData: any) => {
      if (eventData.type === "allInfluencerWhaleTransactions") {
        const transaction = eventData.data
        if (!transaction) return

        const matchesFilters = doesTransactionMatchFilters(
          transaction,
          activeFilters
        )

        if (matchesFilters) {
          if (currentPage === 1) {
            const expandedTransactions = expandTransactions([transaction], "200")
            setTransactions((prev: any[]) => {
              const updated = [...expandedTransactions, ...prev]
              return updated.slice(0, itemsPerPage)
            })
            setNewTxIds((prev) => {
              const updated = new Set(prev)
              expandedTransactions.forEach((tx: any) => updated.add(tx._id))
              return updated
            })
          } else {
            setNewTransactionsCount((prev) => prev + 1)
            setHasNewTransactions(true)
          }
        } else {
          setPendingLiveTransactions((prev) => {
            const exists = prev.some((tx) => tx.signature === transaction.signature)
            if (exists) return prev
            return [transaction, ...prev].slice(0, 50)
          })
          setNewTransactionsCount((prev) => prev + 1)
          setHasNewTransactions(true)
        }
      }
    }

    socket.on("newInfluencerWhaleTransaction", handleNewTransaction)

    return () => {
      socket.off("newInfluencerWhaleTransaction", handleNewTransaction)
    }
  }, [currentPage, itemsPerPage, activeFilters, doesTransactionMatchFilters])

  // Helper functions
  const getTransactionAmount = (tx: any) => {
    if (tx.type === "buy" && tx.amount?.buyAmount) {
      return tx.amount.buyAmount
    } else if (tx.type === "sell" && tx.amount?.sellAmount) {
      return tx.amount.sellAmount
    }
    return 0
  }

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



  const handleTransactionInfoAll = (signature: string, transactiontype: string) => {
    navigate(`/transaction/${signature}?type=kol&transaction=${transactiontype}`)
  }

  const handleTransactionInfoNewTab = (signature: string, transactiontype: string) => {
    const url = `/transaction/${signature}?type=kol&transaction=${transactiontype}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleCopyTokenAddress = async (tokenAddress: string, _transactionId: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tokenAddress)
      } else {
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
    setSwapTokenInfo(tokenInfo)
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

  const handleFilterTabChange = (filterType: string) => {
    setActiveFilter(filterType)
    const newFilters = {
      ...activeFilters,
      transactionType: filterType === "all" ? null : filterType
    }
    setActiveFilters(newFilters)
  }

  const handleFilterUpdate = (key: string, value: any) => {
    const newFilters = {
      ...activeFilters,
      [key]: value
    }
    setActiveFilters(newFilters)
    setOpenDropdown(null)
  }

  const toggleTag = (tag: string) => {
    const currentTags = activeFilters.tags || []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t: string) => t !== tag)
      : [...currentTags, tag]

    handleFilterUpdate('tags', newTags)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null)
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  const quickBuyInputRef = useRef<HTMLInputElement>(null)

  // Extract unique tokens from transactions for autocomplete
  const uniqueTokenOptions = React.useMemo(() => {
    const uniqueTokens = new Map();

    transactions.forEach(tx => {
      // Check both tokenIn (sell) and tokenOut (buy)
      if (tx.transaction?.tokenIn) {
        const address = tx.tokenInAddress;
        if (address && !uniqueTokens.has(address)) {
          uniqueTokens.set(address, {
            id: address,
            titles: tx.transaction.tokenIn.symbol,
            descriptions: tx.transaction.tokenIn.name || "NA",
            images: tx.inTokenURL || DefaultTokenImage
          });
        }
      }

      if (tx.transaction?.tokenOut) {
        const address = tx.tokenOutAddress;
        if (address && !uniqueTokens.has(address)) {
          uniqueTokens.set(address, {
            id: address,
            titles: tx.transaction.tokenOut.symbol,
            descriptions: tx.transaction.tokenOut.name || "NA",
            images: tx.outTokenURL || DefaultTokenImage
          });
        }
      }
    });

    return Array.from(uniqueTokens.values());
  }, [transactions]);

  const [filteredOptions, setFilteredOptions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    // If there's a search query, apply it as a filter
    if (searchQuery.trim()) {
      // Update active filters with the search query
      setActiveFilters({
        ...activeFilters,
        searchQuery: searchQuery.trim(),
        searchType: 'all'
      });

      // Clear the input field after searching
      setSearchQuery("");

      // Close dropdown
      setShowDropdown(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (value.trim() === "") {
      setFilteredOptions([]);
      setShowDropdown(false);
      return;
    }

    const filtered = uniqueTokenOptions.filter((option) =>
      option.titles?.toLowerCase()?.includes(value?.toLowerCase()) ||
      option.id?.toLowerCase()?.includes(value?.toLowerCase()) ||
      option.descriptions?.toLowerCase()?.includes(value?.toLowerCase())
    ).slice(0, 10); // Limit to 10 results

    setFilteredOptions(filtered);
    setShowDropdown(filtered.length > 0);
  };

  const handleSelect = (option: any) => {
    // Apply the selected option as a search filter
    setActiveFilters({
      ...activeFilters,
      searchQuery: option.titles,
      searchType: 'all'
    });

    // Clear input and close dropdown
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleClearInput = () => {
    setSearchQuery("");
    setShowDropdown(false);
  };






  const [amount, setAmount] = useState("$1K");




  const [isSaved, setIsSaved] = useState(false);


  const [hotness, setHotness] = useState(10);

  // Handle KOL alert subscription
  const handleKOLAlertConnect = async () => {
    try {
      const token = localStorage.getItem("accessToken")
      if (!token) {
        showToast("Please log in to connect Telegram alerts", "error")
        return
      }

      // Check if Telegram is connected
      if (!user?.telegramChatId) {
        showToast("Please connect your Telegram account first from the Telegram Subscription page", "error")
        return
      }

      validateAccess(async () => {
        try {
          // Convert amount string to number
          const minBuyAmount = parseFloat(amount.replace(/[$,K]/g, '')) * (amount.includes('K') ? 1000 : 1)

          // Create KOL alert subscription
          const response = await axios.post(
            `${import.meta.env.VITE_SERVER_URL}/alerts/kol-alert`,
            {
              hotnessScoreThreshold: hotness,
              minBuyAmountUSD: minBuyAmount,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

          if (response.data.success) {
            setIsSaved(true)
            showToast("KOL alert subscription created successfully!", "success")
            setTimeout(() => setIsSaved(false), 3000)
          }
        } catch (error: any) {
          console.error("KOL alert subscription error:", error)
          showToast(
            error.response?.data?.message || "Failed to create KOL alert subscription",
            "error"
          )
        }
      })
    } catch (error: any) {
      console.error("KOL alert subscription error:", error)
      showToast(
        error.response?.data?.message || "Failed to create KOL alert subscription",
        "error"
      )
    }
  }


  return (
    <>
      <section className="">
        <div className="row">
          {/* Right Sidebar - Shows first on mobile, second on desktop */}
          <div className="col-lg-4 order-1 order-lg-2 mb-4 mb-lg-0 right-side-bar">
            <div className="custom-scrollbar" style={{ maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
              <RightSidebarNew
                pageType="kol"
              />
            </div>
          </div>

          {/* Transactions Feed Column - Shows second on mobile, first on desktop */}
          <div className="col-lg-8 order-2 order-lg-1 nw-main-bx">
            <div className="d-flex align-items-center justify-content-between mb-3 ">
              <div>
                <span className="trading-icon-title">Recent transactions</span>
              </div>
              <div>
                <a href="javascript:void(0)" className="visualize-btn" onClick={() => setIsOpen(true)}>
                  VISUALIZE <PiMagicWand />
                </a>
              </div>
            </div>

            {/* Search and Quick Buy */}
            <div className="d-flex align-items-center gap-1 mobile-searching-bx">
              <div className="search-container flex-grow-1" ref={searchRef}>
                <form className="custom-frm-bx mb-3" onSubmit={handleSearch}>
                  <input
                    type="text"
                    className="form-control pe-5"
                    placeholder="Search by token name or address..."
                    value={searchQuery}
                    onChange={handleChange}
                    onFocus={() => setShowDropdown(filteredOptions.length > 0)}
                  />

                  <div className="searching-bx">
                    <button className="search-btn" type="submit">
                      <FontAwesomeIcon icon={faSearch} />
                    </button>
                    {searchQuery && (
                      <button
                        type="button"
                        className="clear-input-btn"
                        onClick={handleClearInput}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </form>

                {showDropdown && (
                  <div className="dropdown-options">
                    <div className="dropdown-header text-end all-data-clear">
                      <button className="quick-nw-btn">Clear All</button>
                    </div>
                    <ul className="dropdown-scroll">
                      {filteredOptions.map((item, index) => (
                        <li
                          key={index}
                          className="dropdown-item d-flex align-items-start"
                          onClick={() => handleSelect(item)}
                        >
                          <img src={item?.images} alt="" className="dropdown-img" />

                          <div className="dropdown-content flex-grow-1">
                            <h6 className="dropdown-title">{item?.titles}</h6>
                            <p className="dropdown-desc">{item?.descriptions}</p>
                            <span className="dropdown-id">
                              <span className="cpy-title">CA:</span>{item?.id}
                              <a href="javascript:void(0)" className="drop-cpy-btn ms-1">
                                <FontAwesomeIcon icon={faCopy} />
                              </a>
                            </span>
                          </div>

                          <button
                            className="dropdown-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(false);
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>

                  </div>

                )}
              </div>

              <div className="custom-frm-bx nw-quick-bx mb-3">
                <button
                  className="quick-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', padding: '4px 8px', height: '32px' }}
                  onClick={() => quickBuyInputRef.current?.focus()}
                >
                  <img src="/quick-btn.png" alt="" /> quick buy amount
                  <input
                    ref={quickBuyInputRef}
                    type="number"
                    value={quickBuyAmount}
                    onChange={handleQuickBuyAmountChange}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="0.5"
                    min="0"
                    step="0.1"
                    style={{
                      background: 'transparent',
                      border: quickBuyAmountError ? '1px solid #ef4444' : 'none',
                      color: '#fff',
                      width: '60px',
                      textAlign: 'right',
                      outline: 'none',
                      fontSize: '14px',
                      borderRadius: '4px',
                      padding: '2px 4px'
                    }}
                    title={quickBuyAmountError || ''}
                  />
                  <span style={{ color: '#fff', fontSize: '14px' }}>SOL</span>
                </button>
                {quickBuyAmountError && (
                  <div style={{
                    color: '#ef4444',
                    fontSize: '11px',
                    marginTop: '4px',
                    paddingLeft: '8px'
                  }}>
                    {quickBuyAmountError}
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div>
              <div className="d-flex align-items-center justify-content-between mobile-tabling-list">
                <div>
                  <ul className="nav nav-tabs custom-tabs" role="tablist">
                    <li className="nav-item" role="presentation">
                      <a
                        className={`nav-link ${activeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => handleFilterTabChange('all')}
                        style={{ cursor: 'pointer' }}
                      >
                        ALL
                      </a>
                    </li>
                    <li className="nav-item" role="presentation">
                      <a
                        className={`nav-link ${activeFilter === 'buy' ? 'active' : ''}`}
                        onClick={() => handleFilterTabChange('buy')}
                        style={{ cursor: 'pointer' }}
                      >
                        BUY
                      </a>
                    </li>
                    <li className="nav-item" role="presentation">
                      <a
                        className={`nav-link ${activeFilter === 'sell' ? 'active' : ''}`}
                        onClick={() => handleFilterTabChange('sell')}
                        style={{ cursor: 'pointer' }}
                      >
                        SELL
                      </a>
                    </li>
                  </ul>
                </div>
                <div>
                  <ul className="plan-btn-list">
                    <li onClick={(e) => e.stopPropagation()}>
                      <a href="javascript:void(0)"
                        className={`plan-btn ${activeFilters.hotness ? 'active' : ''}`}
                        onClick={() => setOpenDropdown(openDropdown === 'hotness' ? null : 'hotness')}>
                        {activeFilters.hotness
                          ? `HOTNESS: ${hotnessOptions.find(o => o.value === activeFilters.hotness)?.label.split(' ')[0]}`
                          : 'hotness'} <HiChevronUpDown />
                      </a>
                      {openDropdown === 'hotness' && (
                        <div className="filter-dropdown-menu">
                          <div className="filter-dropdown-header">Hotness Score</div>
                          {hotnessOptions.map(opt => (
                            <button
                              key={opt.label}
                              className={`filter-dropdown-item ${activeFilters.hotness === opt.value ? 'active' : ''}`}
                              onClick={() => handleFilterUpdate('hotness', opt.value)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                    <li onClick={(e) => e.stopPropagation()}>
                      <a href="javascript:void(0)"
                        className={`plan-btn ${activeFilters.amount ? 'active' : ''}`}
                        onClick={() => setOpenDropdown(openDropdown === 'amount' ? null : 'amount')}>
                        {activeFilters.amount
                          ? `AMOUNT: ${amountOptions.find(o => o.value === activeFilters.amount)?.label}`
                          : 'amount'} <HiChevronUpDown />
                      </a>
                      {openDropdown === 'amount' && (
                        <div className="filter-dropdown-menu">
                          <div className="filter-dropdown-header">Min Amount</div>
                          {amountOptions.map(opt => (
                            <button
                              key={opt.label}
                              className={`filter-dropdown-item ${activeFilters.amount === opt.value ? 'active' : ''}`}
                              onClick={() => handleFilterUpdate('amount', opt.value)}
                            >
                              {opt.label}

                            </button>


                          ))}
                          <div className="custm-input-filed">
                            <input type="text" className="custom-amount-frm" placeholder="Custom..." />
                          </div>

                          <div className="quick-nw-btn">
                            <button>Submit</button>
                          </div>
                        </div>
                      )}
                    </li>


                    <li onClick={(e) => e.stopPropagation()}>
                      <a href="javascript:void(0)"
                        className={`plan-btn ${openDropdown === 'subs' ? 'active' : ''}`}
                        onClick={() => setOpenDropdown(openDropdown === 'subs' ? null : 'subs')}>
                        Subscription <HiChevronUpDown />
                      </a>
                      {openDropdown === 'subs' && (
                        <KOLAlertPopup
                          hotness={hotness}
                          setHotness={setHotness}
                          amount={amount}
                          setAmount={setAmount}
                          onActivate={handleKOLAlertConnect}
                          isSaved={isSaved}
                          setIsSaved={setIsSaved}
                          user={user}
                          onClose={() => setOpenDropdown(null)}
                        />
                      )}
                    </li>

                    <li onClick={(e) => e.stopPropagation()}>
                      <a href="javascript:void(0)"
                        className={`plan-btn d-block ${(activeFilters.ageMin || activeFilters.ageMax || activeFilters.marketCapMin || activeFilters.marketCapMax) ? 'active' : ''}`}
                        onClick={() => setOpenDropdown(openDropdown === 'newFilter' ? null : 'newFilter')}>
                        {[activeFilters.ageMin, activeFilters.ageMax, activeFilters.marketCapMin, activeFilters.marketCapMax].filter(Boolean).length > 0
                          ? `: ${[activeFilters.ageMin, activeFilters.ageMax, activeFilters.marketCapMin, activeFilters.marketCapMax].filter(Boolean).length}`
                          : ''} <FontAwesomeIcon icon={faFilter} />
                      </a>
                      {openDropdown === 'newFilter' && (
                        <div className="filter-dropdown-menu w-xs p-2">
                          <div className="row">

                            <div className="col-lg-6">
                              <div className="custom-frm-bx ">
                                <label htmlFor="">Age (minutes)</label>
                                <input type="text" name="" id="" className="form-control text-end" placeholder="min" value="min" />
                              </div>
                            </div>

                            <div className="col-lg-6">

                              <div className="custom-frm-bx">
                                <label htmlFor=""></label>
                                <input type="text" name="" id="" className="form-control text-end" placeholder="max" value="max" />
                              </div>
                            </div>

                            <div className="col-lg-6">
                              <div className="custom-frm-bx mb-0">
                                <label htmlFor="">Market Cap (K)</label>
                                <input type="text" name="" id="" className="form-control text-end" placeholder="min" value="min" />
                              </div>
                            </div>

                            <div className="col-lg-6">

                              <div className="custom-frm-bx mb-0">
                                <label htmlFor=""></label>
                                <input type="text" name="" id="" className="form-control text-end" placeholder="max" value="max" />
                              </div>
                            </div>

                          </div>



                        </div>
                      )}
                    </li>

                  </ul>
                </div>
              </div>

              {/* Active Filter Indicators - Only show when filters are active */}
              {(activeFilters.hotness || activeFilters.amount || activeFilters.tags.length > 0 || activeFilters.searchQuery) && (
                <div className="category-remove-filting">
                  <ul>
                    {/* Search Filter Indicator */}
                    {activeFilters.searchQuery && (
                      <li>
                        <div className="category-filtering-add">
                          <div className="category-filter-items">
                            <h6>
                              Search: <span>{activeFilters.searchQuery}</span>
                            </h6>
                            <span>
                              <a
                                href="javascript:void(0)"
                                className="filter-remv-btn"
                                onClick={() => handleFilterUpdate('searchQuery', "")}
                              >
                                <FontAwesomeIcon icon={faClose} />
                              </a>
                            </span>
                          </div>
                        </div>
                      </li>
                    )}

                    {/* Hotness Filter Indicator */}
                    {activeFilters.hotness && (
                      <li>
                        <div className="category-filtering-add">
                          <div className="category-filter-items">
                            <h6>
                              Hotness Score: <span>{hotnessOptions.find(o => o.value === activeFilters.hotness)?.label.split(' ')[0]}</span>
                            </h6>
                            <span>
                              <a
                                href="javascript:void(0)"
                                className="filter-remv-btn"
                                onClick={() => handleFilterUpdate('hotness', null)}
                              >
                                <FontAwesomeIcon icon={faClose} />
                              </a>
                            </span>
                          </div>
                        </div>
                      </li>
                    )}

                    {/* Amount Filter Indicator */}
                    {activeFilters.amount && (
                      <li>
                        <div className="category-filtering-add">
                          <div className="category-filter-items">
                            <h6>
                              Amount: <span>{amountOptions.find(o => o.value === activeFilters.amount)?.label}</span>
                            </h6>
                            <span>
                              <a
                                href="javascript:void(0)"
                                className="filter-remv-btn"
                                onClick={() => handleFilterUpdate('amount', null)}
                              >
                                <FontAwesomeIcon icon={faClose} />
                              </a>
                            </span>
                          </div>
                        </div>
                      </li>
                    )}

                    {/* Tags Filter Indicators - One for each active tag */}
                    {activeFilters.tags.map((tag: string, index: number) => (
                      <li key={`tag-${index}`}>
                        <div className="category-filtering-add">
                          <div className="category-filter-items">
                            <h6>
                              Tags: <span>{tag}</span>
                            </h6>
                            <span>
                              <a
                                href="javascript:void(0)"
                                className="filter-remv-btn"
                                onClick={() => toggleTag(tag)}
                              >
                                <FontAwesomeIcon icon={faClose} />
                              </a>
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transactions List */}
              <div className="tab-content custom-tab-content custom-scrollbar" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', flex: 1 }}>
                {isAllTxLoading ? (
                  <TransactionListSkeleton variant="kol" count={12} />
                ) : transactions.length === 0 ? (
                  <div className="d-flex align-items-center justify-content-center flex-grow-1" style={{ minHeight: '300px' }}>
                    <p style={{ color: '#8F8F8F' }}>No transactions available. Try adjusting your filters.</p>
                  </div>
                ) : (
                  <div className="transaction-container">
                    {transactions.map((tx: any, index: number) => (
                      <div
                        key={tx._id}
                        ref={index === transactions.length - 1 ? lastTransactionRef : null}
                        className={`mb-3 nw-custm-trade-bx ${newTxIds.has(tx._id) ? 'animate-slide-up' : ''}`}
                        onClick={() => handleTransactionInfoAll(tx.signature, tx.type)}
                      style={{ cursor: 'pointer' }}
                      onAnimationEnd={() =>
                        setNewTxIds((prev) => {
                          const updated = new Set(prev)
                          updated.delete(tx._id)
                          return updated
                        })
                      }
                    >
                      <div className="d-flex align-items-center justify-content-between nw-btm-brd">
                        <div>
                          <h6 className="nw-trade-title">{getTimeAgo(tx.timestamp)}</h6>
                        </div>
                        <div>
                          <ul className="quick-list">
                            {tx.hotnessScore > 0 && (
                              <li><span className="hotness-title">Hotness score: {tx.hotnessScore}/10</span></li>
                            )}
                            <li className="quick-item">
                              <a
                                href="javascript:void(0)"
                                className="quick-nw-btn"
                                onClick={(e) => { e.stopPropagation(); handleQuickBuy(tx) }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleQuickBuy(tx)
                                  }
                                }}
                                aria-label={`Quick buy ${tx.type === "sell" ? tx.tokenInSymbol : tx.tokenOutSymbol} token`}
                                title="Quick buy this token"
                              >
                                quick buy
                              </a>
                            </li>
                            <li className="quick-item">
                              <a
                                href="javascript:void(0)"
                                className="quick-nw-btn quick-copy-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyTokenAddress(tx.type === "sell" ? tx.tokenInAddress : tx.tokenOutAddress, tx.signature)
                                }}
                              >
                                <RiFileCopyLine />
                              </a>
                            </li>
                            <li className="quick-item">
                              <a
                                href="javascript:void(0)"
                                className="quick-nw-btn quick-arrow-btn"
                                onClick={(e) => { e.stopPropagation(); handleTransactionInfoNewTab(tx.signature, tx.type) }}
                              >
                                <FontAwesomeIcon icon={faArrowRight} className="nw-arrow-tp" />
                              </a>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div className={`custom-card ${tx.type === 'buy' ? 'buy-animate' : 'sell-animate'}`}>
                        <div className="left-item-bx">
                          <img
                            src={tx.influencerProfileImageUrl || DefaultTokenImage}
                            alt="influencer"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/kol-feed-profile/${tx.influencerUsername?.replace(/^@/, '')}`);
                            }}
                            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                              const target = e.currentTarget;
                              if (target.src.indexOf(DefaultTokenImage) === -1) {
                                target.src = DefaultTokenImage;
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <div className="whale-content flex-grow-1" style={{ display: 'flex', flexDirection: 'column', height: '64px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                              <h4 className="username">{tx.influencerName}</h4>
                              <img 
                                src={TwitterVerified} 
                                alt="verified" 
                                style={{ width: '14px', height: '14px', flexShrink: 0 }}
                              />
                            </div>
                            {/* Twitter handle in place of tags */}
                            <div className="tags" style={{ marginBottom: '4px' }}>
                              <a
                                href={`https://x.com/${tx.influencerUsername?.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="tag-title"
                                style={{
                                  textDecoration: 'none',
                                  color: '#8f8f8f'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                @{tx.influencerUsername?.replace(/^@/, '')}
                              </a>
                            </div>
                            <div className={`sold-out-title ${tx.type === 'buy' ? 'buy-transaction' : ''}`} style={{ marginTop: 'auto' }}>
                              {tx.type === 'sell' ? 'SOLD' : 'Bought'} ${Number(getTransactionAmount(tx) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>

                        <div className="sell-trade-bx">
                          {tx.type === 'sell' ? (
                            <span className="sell-title">
                              <FontAwesomeIcon icon={faArrowTrendDown} /> SELL
                            </span>
                          ) : (
                            <span className="buy-trade-title">
                              <IoMdTrendingUp /> BUY
                            </span>
                          )}
                        </div>

                        <div className="right-info text-end">
                          <div className="left-crd-content">
                            <h5>{tx.type === 'sell' ? tx.transaction?.tokenIn?.symbol : tx.transaction?.tokenOut?.symbol}</h5>
                            <p>{tx.type === 'sell' ? tx.transaction?.tokenIn?.name?.substring(0, 20) : tx.transaction?.tokenOut?.name?.substring(0, 20)}</p>
                            <small className="mc-title">MC: ${formatNumber(getMarketCap(tx))} / AGE: {tx.age}</small>
                          </div>
                          <div className="right-img">
                            <img
                              src={tx.type === "sell" ? (tx.inTokenURL || DefaultTokenImage) : (tx.outTokenURL || DefaultTokenImage)}
                              alt="token"
                              onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { e.currentTarget.src = DefaultTokenImage }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                )}
                {/* Loading more indicator */}
                {isLoadingMore && (
                  <div className="d-flex align-items-center justify-content-center py-4">
                    <div className="lds-spinner text-white">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i}></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ReactFlowProvider>
        <WhaleFilterModal isOpen={isOpen} onClose={() => setIsOpen(false)} type="kol" />
      </ReactFlowProvider>

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
        initialAmount={quickBuyAmount}
      />
    </>
  )
}

export default KOLFeedPage