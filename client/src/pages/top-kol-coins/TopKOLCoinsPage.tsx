import React, { useState, useCallback, useEffect } from "react"
import { Search, ChevronDown, ArrowRightLeft, CopyIcon } from "lucide-react"
import {
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

import { formatNumber } from "../../utils/FormatNumber"
import Sortingarrow from "../../assets/Sortingarrow.svg"
import DefaultTokenImage from "../../assets/default_token.svg"
import { topCoinsAPI } from "../../lib/api"
import { TopKolCoin, TopKolCoinsParams } from "../../lib/types"
import { useToast } from "../../components/ui/Toast"
import { LastUpdatedTicker } from "../../components/TicketComponent"
import { useSearchHistory } from "../../hooks/useSearchHistory"

function debounce<T extends (...args: TArgs) => void, TArgs extends unknown[]>(
  func: T,
  delay: number
) {
  let timeoutId: ReturnType<typeof setTimeout>

  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

const useWindowWidth = () => {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return width
}

const TopKOLCoinsPage = () => {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"table" | "chart">("table")
  const [flowMode, setFlowMode] = useState<"inflow" | "outflow">("inflow")
  const [marketCapFilter, setMarketCapFilter] = useState<string>("small")
  const [timeframeFilter, setTimeframeFilter] = useState<string>("24H")
  const [marketCapTouched, setMarketCapTouched] = useState(false)

  const [marketCapOpen, setMarketCapOpen] = useState(false)
  const [showCoinSuggestions, setShowCoinSuggestions] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null)
  const { showToast, ToastContainer } = useToast()
  const width = useWindowWidth()
  // Add more space between bars for mobile devices
  const isMobile = width < 600
  // API data state
  const [allMarketCapData, setAllMarketCapData] = useState<{
    smallCaps: TopKolCoin[]
    midCaps: TopKolCoin[]
    largeCaps: TopKolCoin[]
    all: TopKolCoin[]
  }>({
    smallCaps: [],
    midCaps: [],
    largeCaps: [],
    all: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null)

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: "asc" | "desc"
  } | null>(null)

  // Toggle between Market Cap and Price for second last column
  const [showPrice, setShowPrice] = useState(false)

  // State for coin suggestions
  const [coinSuggestions, setCoinSuggestions] = useState<
    Array<{
      symbol: string
      name: string
      rank: number
      imageUrl?: string
    }>
  >([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)

  // Search history hook
  const { history, saveSearch, deleteHistoryItem } = useSearchHistory({
    page: "top-kol-coins",
    enabled: true,
  })

  // Sorting function
  const sortData = (
    data: TopKolCoin[],
    key: string,
    direction: "asc" | "desc"
  ) => {
    return [...data].sort((a, b) => {
      let aValue = a[key as keyof TopKolCoin]
      let bValue = b[key as keyof TopKolCoin]

      // Handle nested properties
      if (key === "marketCap") {
        aValue = a.marketCap
        bValue = b.marketCap
      } else if (key === "price") {
        aValue = a.price
        bValue = b.price
      }

      if (aValue < bValue) return direction === "asc" ? -1 : 1
      if (aValue > bValue) return direction === "asc" ? 1 : -1
      return 0
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomCursor = (props: any) => {
    const { points, height } = props
    if (!points || points.length === 0) return null
    const { x } = points[0]
    return (
      <line
        x1={x}
        y1={height}
        x2={x}
        y2={0}
        stroke="#FFFFFF"
        strokeDasharray="2 2"
        strokeWidth={1}
      />
    )
  }

  // Custom Bar Tooltip (for Net Inflow/Outflow)
  const BarTooltip = ({
    active,
    payload,
    dataUnit,
  }: {
    active: boolean
    payload: Array<{
      dataKey: string
      payload: { [key: string]: string | number }
    }>
    dataUnit: { value: number; unit: string; label: string }
  }) => {
    if (!active || !payload || !payload.length) {
      return null
    }
    const data = payload[0].payload
    const isBar =
      payload[0].dataKey ===
      (flowMode === "inflow" ? "netInflow" : "netOutflow")

    if (!isBar) return null

    return (
      <div className="bg-[#1A1A1E] border border-[#2A2A2D] rounded-lg px-3 py-4 text-white min-w-[120px] flex flex-col items-start justify-start">
        <div className="text-xs md:text-sm xl:text-base text-white flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: flowMode === "inflow" ? "#06DF73" : "#FF6B6B",
            }}
          ></div>
          Net: $
          {formatNumber(
            Number(data[flowMode === "inflow" ? "netInflow" : "netOutflow"])
          )}
          {dataUnit.unit}
        </div>
        <div className="text-xs md:text-sm xl:text-base text-white flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#3C82F6]"></div>
          Whale Count: {data.whaleCount}
        </div>
      </div>
    )
  }

  // Custom Line Tooltip (for Whale Count)
  const LineTooltip = ({
    active,
    payload,
  }: {
    active: boolean
    payload: Array<{
      dataKey: string
      payload: { [key: string]: string | number }
    }>
  }) => {
    if (!active || !payload || !payload.length) return null
    const data = payload[0].payload
    const isLine = payload[0].dataKey === "whaleCount"

    if (!isLine) return null

    return (
      <div
        style={{
          backgroundColor: "#1A1A1E",
          border: "1px solid #2A2A2D",
          borderRadius: "8px",
          padding: "8px",
          color: "#fff",
          minWidth: "100px",
        }}
      >
        <div className="text-xs">Whale Count: {data.whaleCount}</div>
      </div>
    )
  }

  // Custom XAxis Tick Component with Copy Icon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomXAxisTick = ({ x, y, payload }: any) => {
    const coin = getFilteredData().find((c) => c.symbol === payload.value)
    if (!coin) return null

    const handleCopyAddress = async (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(coin.tokenAddress)
        } else {
          const textArea = document.createElement("textarea")
          textArea.value = coin.tokenAddress
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

    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject
          x={-30}
          y={0}
          width={payload.value.length * 8 + 20}
          height={40}
        >
          <div className="flex flex-row items-center justify-center space-x-1">
            <div className="text-white text-xs font-medium text-center">
              {payload.value}
            </div>
            <button
              onClick={handleCopyAddress}
              className="w-3 h-3 text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
              title="Copy address"
            >
              <CopyIcon className="w-3 h-3" />
            </button>
          </div>
        </foreignObject>
      </g>
    )
  }

  // Fetch top coins data
  const fetchTopCoinsData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const params: TopKolCoinsParams = {
          timeframe: timeframeFilter,
          // Don't send marketCap parameter - we get all data and filter on frontend
          // Use flowMode for chart view, always 'inflow' for table view
          flowType: viewMode === "table" ? "inflow" : flowMode,
        }

        const response = await topCoinsAPI.getTopKolCoins(params)

        if (response.data.success) {
          setAllMarketCapData(response.data.data.coins)

          // Update last updated time and reset timer
          setLastUpdatedTime(new Date())
        } else {
          setError("Failed to fetch top coins data")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        if (isRefresh) {
          setIsRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [timeframeFilter, viewMode, flowMode]
  )

  // Fetch data when filters change
  useEffect(() => {
    fetchTopCoinsData()
  }, [fetchTopCoinsData])

  // Auto-refresh every 1 minute
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTopCoinsData(true) // true indicates this is a refresh
    }, 60000) // 60 seconds = 1 minute

    return () => clearInterval(interval)
  }, [fetchTopCoinsData])

  // Get filtered data based on market cap filter
  const getFilteredData = () => {
    let data: TopKolCoin[] = []

    switch (marketCapFilter) {
      case "small":
        data = allMarketCapData.smallCaps
        break
      case "medium":
        data = allMarketCapData.midCaps
        break
      case "large":
        data = allMarketCapData.largeCaps
        break
      default:
        data = allMarketCapData.smallCaps // Default to small caps
    }

    // For table view, always return inflow data (already filtered by API)
    // For chart view, return data based on current flow mode
    return data
  }

  // Helper function to format time display
  const formatTimeSinceUpdate = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`
    } else {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes}m ${remainingSeconds}s`
    }
  }

  // Filtered and sorted data
  let filteredCoins = getFilteredData()

  // Apply search filter only in table view
  if (viewMode === "table" && searchQuery) {
    filteredCoins = filteredCoins.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coin.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }

  // Apply sorting if sortConfig exists
  if (sortConfig) {
    filteredCoins = sortData(
      filteredCoins,
      sortConfig.key,
      sortConfig.direction
    )
  }

  // Function to fetch coin suggestions
  const fetchCoinSuggestions = useCallback(
    async (query: string) => {
      if (query.length < 2) return

      try {
        // Use actual API data for suggestions
        const suggestions = getFilteredData()
          .filter(
            (coin) =>
              coin.symbol.toLowerCase().includes(query.toLowerCase()) ||
              coin.name.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 5)
          .map((coin) => ({
            symbol: coin.symbol,
            name: coin.name,
            rank: coin.rank,
            imageUrl: coin.imageUrl,
          }))

        setCoinSuggestions(suggestions)
      } catch (error) {
        console.error("Error fetching coin suggestions:", error)
      }
    },
    [allMarketCapData, marketCapFilter]
  )

  // Debounced coin suggestions
  const debouncedCoinSuggestions = useCallback(
    debounce<(query: string) => void, [string]>((query: string) => {
      fetchCoinSuggestions(query)
    }, 300),
    [fetchCoinSuggestions]
  )

  // Search and filter functions
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setShowCoinSuggestions(query.length > 0)
    setShowHistory(false) // Hide history when typing
    setSelectedSuggestionIndex(-1) // Reset selection when query changes

    if (query.length >= 2) {
      debouncedCoinSuggestions(query)
    } else {
      setCoinSuggestions([])
    }
  }

  const handleCoinSelect = (coin: {
    symbol: string
    name: string
    rank: number
    imageUrl?: string
  }) => {
    setSearchQuery(coin.symbol)
    setShowCoinSuggestions(false)
    setShowHistory(false)
    setSelectedSuggestionIndex(-1)

    // Save to search history
    const tokenData = [
      {
        value: coin.symbol,
        type: "coin" as const,
        label: coin.symbol,
        symbol: coin.symbol,
        name: coin.name,
        imageUrl: coin.imageUrl,
      },
    ]

    saveSearch(coin.symbol, "coin", tokenData)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showCoinSuggestions || coinSuggestions.length === 0) return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedSuggestionIndex((prev) =>
          prev < coinSuggestions.length - 1 ? prev + 1 : 0
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : coinSuggestions.length - 1
        )
        break
      case "Enter":
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          handleCoinSelect(coinSuggestions[selectedSuggestionIndex])
        }
        break
      case "Escape":
        setShowCoinSuggestions(false)
        setShowHistory(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  // Handle input focus
  const handleInputFocus = () => {
    if (searchQuery.length === 0 && history.length > 0) {
      setShowHistory(true)
    }
  }

  // Handle input blur
  const handleInputBlur = () => {
    // Delay hiding to allow clicks on history items
    setTimeout(() => {
      setShowHistory(false)
    }, 200)
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest(".search-container")) {
        setShowCoinSuggestions(false)
        setShowHistory(false)
        setSelectedSuggestionIndex(-1)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const marketCapOptions = [
    { value: "small", label: "Small Cap" },
    { value: "medium", label: "Medium Cap" },
    { value: "large", label: "Large Cap" },
  ]

  const timeframeOptions = ["4H", "12H", "24H", "1W"]

  // Format numbers with appropriate units (force thousands for net inflow/outflow)
  const formatNumberWithUnit = (value: number) => {
    // Always convert to thousands for net inflow/outflow
    if (value >= 1000) {
      return { value: value / 1000, unit: "K", label: "Thousands USD" }
    } else {
      return { value: value, unit: "", label: "USD" }
    }
  }

  // Get the appropriate unit for the current data
  const getDataUnit = () => {
    const data = getFilteredData()
    if (data.length === 0) return { value: 1, unit: "", label: "USD" }

    const maxValue = Math.max(
      ...data.map((coin) => Math.max(coin.netInflow, coin.netOutflow))
    )
    return formatNumberWithUnit(maxValue)
  }

  const dataUnit = getDataUnit()

  // Convert API data to chart format (always in thousands)
  const chartData = getFilteredData().map((coin) => ({
    symbol: coin.symbol,
    netInflow: coin.netInflow >= 1000 ? coin.netInflow / 1000 : coin.netInflow,
    netOutflow:
      coin.netOutflow >= 1000 ? coin.netOutflow / 1000 : coin.netOutflow,
    whaleCount: coin.whaleCount,
  }))

  // Handle sorting
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc"

    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc"
    }

    setSortConfig({ key, direction })
  }

  // Handle Market Cap/Price toggle
  const handleMarketCapPriceToggle = () => {
    setShowPrice(!showPrice)
  }

  // Copy token address function
  const handleCopyTokenAddress = async (tokenAddress: string) => {
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

  return (
    <>
      <div className="space-y-6">
        {/* Top Section with Search - Only show in table view */}
        {viewMode === "table" && (
          <div className="flex items-center justify-between">
            {/* Search Bar - Wider */}
            <div className="flex-1 w-full shadow-[0_0_10px_2px_rgba(255,255,255,0.4)] rounded-xl search-container">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-6 h-6 text-white" />
                <input
                  type="text"
                  placeholder="Search top KOL coins"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className="w-full bg-[#16171C] border border-[#2A2A2D] rounded-xl pl-12 pr-4 py-3 text-white placeholder-white 
                  focus:outline-none transition-all"
                />

                {/* Search History Dropdown */}
                {showHistory && history.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                    <div className="px-4 py-2 border-b border-[#2B2B2D]">
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>Recent searches</span>
                      </div>
                    </div>
                    {history.slice(0, 10).map((item) => (
                      <button
                        key={item._id}
                        onClick={() => {
                          if (item.tokens && item.tokens.length > 0) {
                            setSearchQuery(item.tokens[0].label)
                          } else {
                            setSearchQuery(item.query)
                          }
                          setShowHistory(false)
                        }}
                        className="w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 hover:bg-[#1A1A1A] text-white cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {item.tokens && item.tokens.length > 0 ? (
                                <img
                                  src={
                                    item.tokens[0].imageUrl || DefaultTokenImage
                                  }
                                  alt={item.tokens[0].label}
                                  className="w-8 h-8 md:w-10 md:h-10 rounded-[5px] border border-[#2B2B2D]"
                                  style={{ objectFit: "cover" }}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.src = DefaultTokenImage
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center">
                                  <span className="text-xs">🪙</span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-white truncate">
                                {item.tokens && item.tokens.length > 0
                                  ? item.tokens
                                      .map((token) => token.label)
                                      .join(", ")
                                  : item.query}
                              </div>
                              <div className="text-gray-400 text-xs">
                                {new Date(item.lastUsed).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteHistoryItem(item._id)
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1"
                            title="Remove from history"
                          >
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Coin Suggestions Dropdown */}
                {showCoinSuggestions && searchQuery.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                    {coinSuggestions.map((coin, index) => (
                      <button
                        key={`${coin.symbol}-${index}`}
                        onClick={() => handleCoinSelect(coin)}
                        className={`w-full px-4 py-3 text-left text-white transition-all border-b border-[#2B2B2D] last:border-b-0 ${
                          index === selectedSuggestionIndex
                            ? "bg-[#1A1A1A] text-white"
                            : "hover:bg-[#1A1A1A]"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          {/* Left: Image */}
                          <div className="flex-shrink-0">
                            {coin.imageUrl ? (
                              <img
                                src={coin.imageUrl}
                                alt={coin.symbol}
                                className="w-8 h-8 rounded-full border border-[#2B2B2D]"
                                style={{ objectFit: "cover" }}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = "none"
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center">
                                <span className="text-xs text-gray-400">
                                  🪙
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Right: Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm text-white truncate">
                                #{coin.rank} {coin.symbol}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 bg-green-500/20 text-green-400 border border-green-500/30">
                                Coin
                              </span>
                            </div>
                            <div className="text-gray-400 text-xs truncate">
                              {coin.name}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Refresh Status Indicator */}
        <div className="flex items-center justify-end">
          {/* <div className="flex items-center space-x-2">
            {isRefreshing && (
              <div className="flex items-center space-x-2 text-sm text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                <span>Refreshing data...</span>
              </div>
            )}
            {lastRefreshTime && !isRefreshing && (
              <div className="text-xs text-gray-500">
                Last updated: {lastRefreshTime.toLocaleTimeString()} • Next
                refresh in {nextRefreshCountdown}s
              </div>
            )}
          </div> */}
          {/* Last updated timer */}
          {lastUpdatedTime && (
            <div className="flex items-center space-x-2 px-3 py-2 text-xs text-gray-400">
              <span className="text-gray-500">Last updated:</span>
              <LastUpdatedTicker
                lastUpdated={lastUpdatedTime}
                format={formatTimeSinceUpdate}
              />
            </div>
          )}
          <button
            onClick={() => fetchTopCoinsData(true)}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-3 py-2 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter Section */}
        <div className={`${viewMode === "table" ? "mt-4 md:mt-6" : "mt-0"}`}>
          <div className="flex flex-col space-y-3 mb-4">
            {/* Mobile & Tablet Layout */}
            <div className="lg:hidden">
              {/* First Row - View Toggles */}
              <div className="flex items-center space-x-2 md:space-x-3 mb-3">
                <div className="top-coins-glass-radio-group">
                  <input
                    type="radio"
                    name="viewModeMobile"
                    id="top-coins-glass-table"
                    checked={viewMode === "table"}
                    onChange={() => setViewMode("table")}
                  />
                  <label htmlFor="top-coins-glass-table">
                    {viewMode === "table" ? "Table View" : "Table"}
                  </label>
                  <input
                    type="radio"
                    name="viewModeMobile"
                    id="top-coins-glass-chart"
                    checked={viewMode === "chart"}
                    onChange={() => setViewMode("chart")}
                  />
                  <label htmlFor="top-coins-glass-chart">
                    {viewMode === "table" ? "Chart View" : "Chart"}
                  </label>
                  <div
                    className="top-coins-glass-glider"
                    style={{
                      transform:
                        viewMode === "table"
                          ? "translateX(0%)"
                          : "translateX(100%)",
                      background: "linear-gradient(135deg, #c0c0c055, #ffffff)",
                      opacity: 0.6,
                    }}
                  ></div>
                </div>

                {/* Inflow/Outflow Toggle - Mobile/Tablet */}
                {viewMode === "chart" && (
                  <div className="top-coins-flow-radio-group">
                    <input
                      type="radio"
                      name="flowModeMobile"
                      id="top-coins-flow-inflow-mobile"
                      checked={flowMode === "inflow"}
                      onChange={() => setFlowMode("inflow")}
                    />
                    <label htmlFor="top-coins-flow-inflow-mobile">Inflow</label>
                    <input
                      type="radio"
                      name="flowModeMobile"
                      id="top-coins-flow-outflow-mobile"
                      checked={flowMode === "outflow"}
                      onChange={() => setFlowMode("outflow")}
                    />
                    <label htmlFor="top-coins-flow-outflow-mobile">
                      Outflow
                    </label>
                    <div
                      className="top-coins-flow-glider"
                      style={{
                        transform:
                          flowMode === "inflow"
                            ? "translateX(0%)"
                            : "translateX(100%)",
                        background:
                          "linear-gradient(135deg, #c0c0c055, #ffffff)",
                        opacity: 0.6,
                      }}
                    ></div>
                  </div>
                )}
              </div>

              {/* Second Row - Filters */}
              <div className="flex items-center justify-between">
                {/* Right Filter Button */}

                <div className="relative flex items-center space-x-2">
                  <div>
                    <button
                      onClick={() => setMarketCapOpen(!marketCapOpen)}
                      className="flex items-center space-x-2 px-4 py-3 text-white border border-[#2B2B2D] rounded-xl transition-all h-12 cursor-pointer"
                    >
                      <span
                        className={`text-[10px] md:text-xs font-medium ${marketCapOpen ? "text-white" : "text-white opacity-70"}`}
                      >
                        {marketCapTouched
                          ? marketCapOptions.find(
                              (opt) => opt.value === marketCapFilter
                            )?.label
                          : "Market Cap"}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${marketCapOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {marketCapOpen && (
                      <div className="absolute top-full left-0 mt-2 w-40 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                        <div className="text-left text-sm md:text-sm px-3 py-2 text-white font-medium">
                          Filter by MC
                        </div>
                        {marketCapOptions.map((option) => (
                          <button
                            key={option.value}
                            className="w-full px-4 py-2 text-left text-sm text-white hover:text-white/70 transition-all cursor-pointer"
                            onClick={() => {
                              setMarketCapOpen(false)
                              setMarketCapFilter(option.value)
                              setMarketCapTouched(true)
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    {timeframeOptions.map((timeframe) => (
                      <button
                        key={timeframe}
                        onClick={() => setTimeframeFilter(timeframe)}
                        className={`w-9 h-6 text:xs md:text-sm font-medium cursor-pointer rounded-[5px] transition-all flex items-center justify-center ${
                          timeframeFilter === timeframe
                            ? "bg-[#616161B2] text-white xl:text-base"
                            : "text-white opacity-70 hover:text-white"
                        }`}
                      >
                        {timeframe}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden lg:flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* View Toggles */}
                <div className="top-coins-glass-radio-group">
                  <input
                    type="radio"
                    name="viewModeDesktop"
                    id="top-coins-glass-table-desktop"
                    checked={viewMode === "table"}
                    onChange={() => setViewMode("table")}
                  />
                  <label
                    htmlFor="top-coins-glass-table-desktop"
                    className="w-24"
                  >
                    Table View
                  </label>
                  <input
                    type="radio"
                    name="viewModeDesktop"
                    id="top-coins-glass-chart-desktop"
                    checked={viewMode === "chart"}
                    onChange={() => setViewMode("chart")}
                  />
                  <label
                    htmlFor="top-coins-glass-chart-desktop"
                    className="w-24"
                  >
                    Chart View
                  </label>
                  <div
                    className="top-coins-glass-glider"
                    style={{
                      transform:
                        viewMode === "table"
                          ? "translateX(0%)"
                          : "translateX(100%)",
                      background: "linear-gradient(135deg, #c0c0c055, #ffffff)",
                      opacity: 0.6,
                    }}
                  ></div>
                </div>

                {/* Inflow/Outflow Toggle - Only show when Chart View is selected */}
                {viewMode === "chart" && (
                  <div className="top-coins-flow-radio-group">
                    <input
                      type="radio"
                      name="flowModeDesktop"
                      id="top-coins-flow-inflow-desktop"
                      checked={flowMode === "inflow"}
                      onChange={() => setFlowMode("inflow")}
                    />
                    <label htmlFor="top-coins-flow-inflow-desktop">
                      Inflow
                    </label>
                    <input
                      type="radio"
                      name="flowModeDesktop"
                      id="top-coins-flow-outflow-desktop"
                      checked={flowMode === "outflow"}
                      onChange={() => setFlowMode("outflow")}
                    />
                    <label htmlFor="top-coins-flow-outflow-desktop">
                      Outflow
                    </label>
                    <div
                      className="top-coins-flow-glider"
                      style={{
                        transform:
                          flowMode === "inflow"
                            ? "translateX(0%)"
                            : "translateX(100%)",
                        background:
                          "linear-gradient(135deg, #c0c0c055, #ffffff)",
                        opacity: 0.6,
                      }}
                    ></div>
                  </div>
                )}
              </div>

              {/* Right Filter Button - Desktop Only */}
              <div className="relative hidden lg:flex items-center space-x-2">
                <div className="relative">
                  <button
                    onClick={() => setMarketCapOpen(!marketCapOpen)}
                    className="flex items-center space-x-2 px-4 py-3 text-white border border-[#2B2B2D] rounded-xl transition-all h-12 cursor-pointer"
                  >
                    <span
                      className={`text-sm font-medium ${marketCapOpen ? "text-white" : marketCapTouched ? "text-white" : "text-gray-400"}`}
                    >
                      {marketCapTouched
                        ? marketCapOptions.find(
                            (opt) => opt.value === marketCapFilter
                          )?.label
                        : "Market Cap"}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${marketCapOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {marketCapOpen && (
                    <div className="absolute top-full left-0 mt-2 w-40 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-10">
                      <div className="text-left text-sm md:text-sm px-3 py-2 text-white font-medium">
                        Filter by MC
                      </div>
                      {marketCapOptions.map((option) => (
                        <button
                          key={option.value}
                          className="w-full px-4 py-2 text-left text-sm text-white hover:text-white/70 transition-all cursor-pointer"
                          onClick={() => {
                            setMarketCapOpen(false)
                            setMarketCapFilter(option.value)
                            setMarketCapTouched(true)
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timeframe Filters - Desktop Only */}
                <div className="flex items-center">
                  {timeframeOptions.map((timeframe) => (
                    <button
                      key={timeframe}
                      onClick={() => setTimeframeFilter(timeframe)}
                      className={`w-10 h-6 text-sm font-medium cursor-pointer rounded-[5px] transition-all flex items-center justify-center ${
                        timeframeFilter === timeframe
                          ? "bg-[#616161B2] text-white xl:text-base"
                          : "text-white opacity-70 hover:text-white"
                      }`}
                    >
                      {timeframe}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="relative space-y-2 md:space-y-3 bg-[#1B1B1D] p-2 md:p-3 rounded-[15px] border-1 border-[#2A2A2D]">
          {/* Subtle refresh overlay */}
          {isRefreshing && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] rounded-[15px] z-10 flex items-center justify-center">
              <div className="flex items-center space-x-2 text-sm text-white/80">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/40 border-t-transparent"></div>
                <span>Updating...</span>
              </div>
            </div>
          )}
          {loading ? (
            viewMode === "table" ? (
              /* Table View Loader */
              <div className="bg-[#1B1B1D] rounded-lg border border-[#2A2A2D] overflow-hidden">
                {/* Table Header Skeleton */}
                <div className="bg-[#272729] p-4">
                  <div className="grid grid-cols-6 gap-2 md:gap-4">
                    <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                  </div>
                </div>

                {/* Table Body Skeleton */}
                <div className="p-4 space-y-4">
                  {[...Array(5)].map((_, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-6 gap-2 md:gap-4 items-center py-4"
                    >
                      {/* Rank */}
                      <div className="h-4 bg-gray-700 rounded animate-pulse w-6 md:w-8"></div>

                      {/* Token Info */}
                      <div className="flex items-center space-x-2 md:space-x-3">
                        <div className="w-6 h-6 md:w-8 md:h-8 bg-gray-700 rounded animate-pulse"></div>
                        <div className="space-y-1 md:space-y-2">
                          <div className="h-3 md:h-4 bg-gray-700 rounded animate-pulse w-12 md:w-16"></div>
                          <div className="h-2 md:h-3 bg-gray-700 rounded animate-pulse w-8 md:w-12"></div>
                        </div>
                      </div>

                      {/* Net Inflow */}
                      <div className="h-3 md:h-4 bg-gray-700 rounded animate-pulse w-16 md:w-20"></div>

                      {/* Whale Count */}
                      <div className="h-3 md:h-4 bg-gray-700 rounded animate-pulse w-8 md:w-12"></div>

                      {/* Market Cap/Price */}
                      <div className="h-3 md:h-4 bg-gray-700 rounded animate-pulse w-20 md:w-24"></div>

                      {/* Expand Button */}
                      <div className="h-3 md:h-4 bg-gray-700 rounded animate-pulse w-4 md:w-6"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Chart View Loader */
              <div className="space-y-4 px-2 md:px-4 py-2 md:py-4">
                {/* Chart Title Skeleton */}
                {/* <div className="text-center">
                  <div className="h-6 bg-gray-700 rounded animate-pulse w-64 mx-auto"></div>
                </div> */}

                {/* Chart Container Skeleton */}
                <div className="bg-[#1B1B1D] py-4 px-4 rounded-lg w-full">
                  <div className="flex items-center justify-center h-96">
                    <div className="text-center">
                      <div className="lds-spinner text-white">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i}></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-white">
                No coins found matching your criteria.
              </div>
            </div>
          ) : filteredCoins.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-white">
                No coins found matching your criteria.
              </div>
            </div>
          ) : viewMode === "table" ? (
            /* Table View */
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className=" bg-[#272729]">
                    <th
                      className="text-left py-4 md:py-3 px-2 md:px-4 text-white opacity-70 text-xs md:text-sm font-medium cursor-pointer hover:opacity-100 transition-opacity rounded-tl-[10px] rounded-bl-[10px]"
                      onClick={() => handleSort("rank")}
                    >
                      <div className="flex items-center space-x-1 xl:text-base font-medium">
                        <span>Rank</span>
                        <img
                          src={Sortingarrow}
                          alt="sorting-arrow"
                          className="w-3 h-3 xl:w-4 xl:h-4 color-white"
                        />
                      </div>
                    </th>
                    <th className="text-left py-4 md:py-3 px-2 md:px-4 text-white opacity-70 text-xs md:text-sm font-medium xl:text-base">
                      Coin
                    </th>
                    <th
                      className="text-left py-4 md:py-3 px-2 md:px-4 text-white opacity-70 text-xs md:text-sm font-medium xl:text-base cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={() => handleSort("netInflow")}
                    >
                      <div className="flex items-center space-x-1 xl:text-base">
                        <span>Net Inflow</span>
                        <img
                          src={Sortingarrow}
                          alt="sorting-arrow"
                          className="w-3 h-3 xl:w-4 xl:h-4 color-white"
                        />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-2 md:px-4 text-white opacity-70 text-xs md:text-sm font-medium xl:text-base cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={() => handleSort("whaleCount")}
                    >
                      <div className="flex items-center space-x-1 xl:text-base">
                        <span>Whale</span>

                        <img
                          src={Sortingarrow}
                          alt="sorting-arrow"
                          className="w-3 h-3 xl:w-4 xl:h-4 color-white"
                        />
                      </div>
                    </th>
                    <th
                      className="text-left py-4 md:py-3 px-2 md:px-4 text-white opacity-70 text-xs md:text-sm font-medium xl:text-base cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={handleMarketCapPriceToggle}
                    >
                      <div className="flex items-center space-x-1 xl:text-base">
                        <span>{showPrice ? "Price" : "Market Cap"}</span>
                        <ArrowRightLeft className="w-3 h-3 xl:w-4 xl:h-4 color-white" />
                      </div>
                    </th>
                    <th className="text-left py-4 md:py-3 px-2 md:px-4 text-white opacity-70 text-xs md:text-sm font-medium rounded-tr-[10px] rounded-br-[10px]">
                      {/* Expansion indicator */}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Spacer row for margin */}
                  <tr>
                    <td colSpan={6} className="h-4"></td>
                  </tr>
                  {filteredCoins.map((coin) => (
                    <React.Fragment key={coin.id}>
                      <tr
                        className={`hover:bg-[#1F2024] transition-colors cursor-pointer ${
                          expandedCoin !== coin.id
                            ? "border-b border-[#2B2B2D]"
                            : ""
                        }`}
                      >
                        <td className="text-left py-5 px-2 md:px-4 text-white text-xs md:text-sm xl:text-base font-medium">
                          #{coin.rank}
                        </td>
                        <td className="text-left py-5 px-2 md:px-4">
                          <div className="flex items-center space-x-2 md:space-x-3">
                            <img
                              src={coin.imageUrl || DefaultTokenImage}
                              alt={coin.symbol}
                              className="w-6 h-6 md:w-8 md:h-8 rounded-[8px] border border-[#2A2A2D]"
                            />
                            <div className="flex items-center space-x-2 relative">
                              <div>
                                <div className="text-white font-medium text-xs md:text-sm xl:text-base font-medium">
                                  {coin.symbol}
                                </div>
                              </div>

                              <button
                                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                                onClick={() =>
                                  handleCopyTokenAddress(coin.tokenAddress)
                                }
                                title="Copy address"
                              >
                                <CopyIcon className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="text-left py-5 px-2 md:px-4">
                          <span className="text-[#06DF73] font-medium text-xs md:text-sm xl:text-base">
                            + ${formatNumber(coin.netInflow)}
                          </span>
                        </td>
                        <td className="text-left py-5 px-2 md:px-4 text-white text-xs md:text-sm xl:text-base font-medium">
                          {coin.whaleCount}
                        </td>
                        <td className="text-left py-5 px-2 md:px-4 text-white text-xs md:text-sm xl:text-base font-medium">
                          {showPrice
                            ? `$${coin.price}`
                            : `$${formatNumber(coin.marketCap)}`}
                        </td>
                        <td className="text-left py-5 px-2 md:px-4">
                          <button
                            className="text-white hover:text-white transition-colors cursor cursor-pointer"
                            onClick={() => {
                              const newExpandedCoin =
                                expandedCoin === coin.id ? null : coin.id
                              setExpandedCoin(newExpandedCoin)
                            }}
                          >
                            {expandedCoin === coin.id ? (
                              <ChevronDown className="w-4 h-4 xl:w-6 xl:h-6 rotate-180" />
                            ) : (
                              <ChevronDown className="w-4 h-4 xl:w-6 xl:h-6" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedCoin === coin.id && (
                        <tr className="border-b border-[#2B2B2D]">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Left Panel - Coin Information */}
                              <div className="flex flex-col justify-center items-start">
                                {/* Token Information Section */}
                                <h4 className="text-white font-semibold text-xs md:text-sm mb-3 xl:text-base">
                                  Kol Activity Last {timeframeFilter}
                                </h4>
                                <div className="flex items-center space-x-3 mb-4">
                                  <img
                                    src={coin.imageUrl || DefaultTokenImage}
                                    alt={coin.symbol}
                                    className="w-12 h-12 xl:w-20 xl:h-20 rounded-[8px] border border-[#2A2A2D]"
                                  />
                                  <div className="flex flex-col justify-start items-start">
                                    <div className="flex items-center space-x-2 relative">
                                      <h3 className="text-white font-semibold text-sm xl:text-base 2xl:text-lg">
                                        ${coin.symbol}
                                      </h3>
                                    </div>
                                    <p className="text-white opacity-70 text-xs xl:text-sm xl:text-base">
                                      {coin.name}
                                    </p>
                                    <div className="flex items-center space-x-2 mt-1 relative">
                                      <p className="text-white opacity-70 text-xs xl:text-sm xl:text-xs">
                                        {coin.tokenAddress.slice(0, 8)}....
                                        {coin.tokenAddress.slice(-8)}
                                      </p>
                                      <button
                                        className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                                        onClick={() =>
                                          handleCopyTokenAddress(
                                            coin.tokenAddress
                                          )
                                        }
                                      >
                                        <CopyIcon className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-4 flex flex-col justify-start items-start">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-white text-xs md:text-sm opacity-70 font-medium">
                                      Total Buys:
                                    </span>
                                    <span className="text-[#06DF73] text-xs md:text-sm font-medium">
                                      +{formatNumber(coin.totalBuys)}
                                      <span className="text-white text-xs md:text-sm font-medium">
                                        ({coin.buyCount})
                                      </span>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 md:gap-2 xl:gap-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-white text-xs md:text-sm opacity-70 font-medium">
                                        Total Sells:
                                      </span>
                                      <span className="text-[#FF6467] text-xs md:text-sm font-medium">
                                        -{formatNumber(coin.totalSells)}
                                        <span className="text-white opacity-70 text-xs md:text-sm font-medium">
                                          ({coin.sellCount})
                                        </span>
                                      </span>
                                    </div>
                                  </div>

                                  <div className="border-b border-[#2B2B2D]"></div>
                                  <div className="flex space-x-2 items-center">
                                    <span className="text-white text-xs md:text-sm font-medium">
                                      Net Inflow:
                                    </span>
                                    <span className="text-[#06DF73] text-xs md:text-sm font-medium">
                                      {formatNumber(coin.netInflow)}
                                      <span className="text-white text-xs md:text-sm font-medium">
                                        ({coin.buyCount - coin.sellCount})
                                      </span>
                                    </span>
                                  </div>
                                  <div className="border-b border-[#2B2B2D]"></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Chart View */
            <div className="space-y-4 px-2 md:px-4 py-2 md:py-4">
              {/* Chart Title */}
              <div className="text-center">
                <h2 className="hidden md:block text-white text-sm md:text-base font-medium">
                  Whale Net {flowMode === "inflow" ? "Inflow" : "Outflow"} with
                  Whale Count
                </h2>
                <h2 className="block md:hidden text-white text-sm md:text-base font-medium">
                  Whale Net {flowMode === "inflow" ? "Inflow" : "Outflow"}
                  with
                  <br />
                  Whale Count
                </h2>
              </div>

              {/* Chart */}
              <div className="bg-[#1B1B1D] py-2 md:py-4 px-2 md:px-4 rounded-lg w-full">
                <div
                  className="overflow-x-auto scrollbar-hide"
                  style={{
                    WebkitOverflowScrolling: "touch",
                    scrollBehavior: "smooth",
                  }}
                >
                  <div className="hidden md:block">
                    <ResponsiveContainer width="100%" height={550}>
                      <ComposedChart
                        barSize={50}
                        data={chartData}
                        margin={{
                          top: 20,
                          left: 60,
                          right: 30,
                          bottom: 20,
                        }}
                      >
                        <XAxis
                          className="text-white font-medium text-xs md:text-sm xl:text-base"
                          dataKey="symbol"
                          stroke="#FFFFFF"
                          tickLine={false}
                          axisLine={true}
                          tick={<CustomXAxisTick />}
                          height={60}
                        />
                        <YAxis
                          yAxisId="left"
                          label={{
                            value: `Net ${flowMode === "inflow" ? "Inflow" : "Outflow"} (${dataUnit.label})`,
                            angle: -90,
                            position: "insideLeft",
                            offset: -50,
                            className:
                              " font-medium text-xs md:text-sm xl:text-base",
                            style: {
                              textAnchor: "middle",
                              fill:
                                flowMode === "inflow" ? "#06DF73" : "#FF6B6B",
                            },
                          }}
                          stroke="#FFFFFF"
                          className="text-xs md:text-sm xl:text-base"
                          tickLine={false}
                          axisLine={true}
                          tickFormatter={(value) => `${value}K($)`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          label={{
                            value: "Whale Count",
                            angle: 90,
                            position: "insideRight",
                            offset: -20,
                            className:
                              "font-medium text-xs md:text-sm xl:text-base",
                            style: {
                              textAnchor: "middle",
                              fill: "#FFFFFF",
                            },
                          }}
                          stroke="#FFFFFF"
                          className="text-xs md:text-sm xl:text-base"
                          tickLine={false}
                          axisLine={true}
                        />
                        <Tooltip
                          cursor={<CustomCursor />}
                          contentStyle={{
                            backgroundColor: "#1A1A1E",
                            border: "1px solid #4D4D4D",
                            borderRadius: "5px",
                          }}
                          labelStyle={{ color: "#6B7280" }}
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length)
                              return null
                            const dataKey = payload[0].dataKey

                            if (
                              dataKey ===
                              (flowMode === "inflow"
                                ? "netInflow"
                                : "netOutflow")
                            ) {
                              return (
                                <BarTooltip
                                  active={active}
                                  payload={payload}
                                  dataUnit={dataUnit}
                                />
                              )
                            } else if (dataKey === "whaleCount") {
                              return (
                                <LineTooltip
                                  active={active}
                                  payload={payload}
                                />
                              )
                            }

                            return null
                          }}
                        />

                        <Bar
                          yAxisId="left"
                          dataKey={
                            flowMode === "inflow" ? "netInflow" : "netOutflow"
                          }
                          fill={flowMode === "inflow" ? "#06DF73" : "#FF6B6B"}
                        />
                        <Line
                          yAxisId="right"
                          type="linear"
                          dataKey="whaleCount"
                          stroke="#3C82F6"
                          strokeWidth={2}
                          dot={{ fill: "#3C82F6", strokeWidth: 2, r: 4 }}
                          activeDot={{
                            r: 6,
                            stroke: "#3C82F6",
                            strokeWidth: 2,
                          }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="block md:hidden min-w-[1200px]">
                    <ResponsiveContainer width="100%" height={550}>
                      <ComposedChart
                        barSize={50}
                        barGap={isMobile ? 16 : 0}
                        barCategoryGap={isMobile ? "40%" : "0%"}
                        data={chartData}
                        margin={{
                          top: 20,
                          left: 30,
                          right: 30,
                          bottom: 20,
                        }}
                        syncId="chart"
                      >
                        <XAxis
                          className="text-white font-medium text-xs md:text-sm xl:text-base"
                          dataKey="symbol"
                          stroke="#FFFFFF"
                          tickLine={false}
                          axisLine={true}
                          tick={<CustomXAxisTick />}
                          height={60}
                        />
                        <YAxis
                          yAxisId="left"
                          label={{
                            value: `Net ${flowMode === "inflow" ? "Inflow" : "Outflow"} (${dataUnit.label})`,
                            angle: -90,
                            position: "insideLeft",
                            offset: -20,
                            className:
                              " font-medium text-xs md:text-sm xl:text-base",
                            style: {
                              textAnchor: "middle",
                              fill:
                                flowMode === "inflow" ? "#06DF73" : "#FF6B6B",
                            },
                          }}
                          stroke="#FFFFFF"
                          className="text-xs md:text-sm xl:text-base"
                          tickLine={false}
                          axisLine={true}
                          tickFormatter={(value) => `${value}K($)`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          label={{
                            value: "Whale Count",
                            angle: 90,
                            position: "insideRight",
                            offset: -20,
                            className:
                              "font-medium text-xs md:text-sm xl:text-base",
                            style: {
                              textAnchor: "middle",
                              fill: "#FFFFFF",
                            },
                          }}
                          stroke="#FFFFFF"
                          className="text-xs md:text-sm xl:text-base"
                          tickLine={false}
                          axisLine={true}
                        />
                        <Tooltip
                          cursor={<CustomCursor />}
                          contentStyle={{
                            backgroundColor: "#1A1A1E",
                            border: "1px solid #4D4D4D",
                            borderRadius: "5px",
                          }}
                          labelStyle={{ color: "#6B7280" }}
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length)
                              return null
                            const dataKey = payload[0].dataKey

                            if (
                              dataKey ===
                              (flowMode === "inflow"
                                ? "netInflow"
                                : "netOutflow")
                            ) {
                              return (
                                <BarTooltip
                                  active={active}
                                  payload={payload}
                                  dataUnit={dataUnit}
                                />
                              )
                            } else if (dataKey === "whaleCount") {
                              return (
                                <LineTooltip
                                  active={active}
                                  payload={payload}
                                />
                              )
                            }

                            return null
                          }}
                        />

                        <Bar
                          yAxisId="left"
                          dataKey={
                            flowMode === "inflow" ? "netInflow" : "netOutflow"
                          }
                          fill={flowMode === "inflow" ? "#06DF73" : "#FF6B6B"}
                        />
                        <Line
                          yAxisId="right"
                          type="linear"
                          dataKey="whaleCount"
                          stroke="#3C82F6"
                          strokeWidth={2}
                          dot={{ fill: "#3C82F6", strokeWidth: 2, r: 4 }}
                          activeDot={{
                            r: 6,
                            stroke: "#3C82F6",
                            strokeWidth: 2,
                          }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center space-x-6 mt-4">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{
                        backgroundColor:
                          flowMode === "inflow" ? "#06DF73" : "#FF6B6B",
                      }}
                    ></div>
                    <span className="text-white text-xs md:text-sm">
                      Net {flowMode === "inflow" ? "Inflow" : "Outflow"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-[#3C82F6]"></div>
                    <span className="text-white text-xs md:text-sm">
                      Whale Count
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ToastContainer />
    </>
  )
}

export default TopKOLCoinsPage

const style = document.createElement("style")
style.textContent = `
  /* Top Coins Glass Radio Group Styles */
  .top-coins-glass-radio-group {
    position: relative;
    display: flex;
    background: rgba(26, 26, 30, 0.8);
    border: 1px solid #2A2A2D;
    border-radius: 10px;
    height: 48px;
    align-items: center;
    box-shadow: -1px -1px 6px 0px #0000004D inset, 1px 1px 4px 0px #FFFFFF33 inset;
  }

  /* Top Coins Flow Radio Group Styles */
  .top-coins-flow-radio-group {
    position: relative;
    display: flex;
    background: rgba(26, 26, 30, 0.8);
    border: 1px solid #2A2A2D;
    border-radius: 12px;
    height: 48px;
    align-items: center;
    box-shadow: -1px -1px 6px 0px #0000004D inset, 1px 1px 4px 0px #FFFFFF33 inset;
  }

  .top-coins-glass-radio-group input[type="radio"] {
    display: none;
  }

  .top-coins-glass-radio-group label {
    position: relative;
    z-index: 2;
    padding: 8px 16px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    white-space: nowrap;  
    min-width: 80px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .top-coins-glass-radio-group input[type="radio"]:checked + label {
    color: #ffffff;
    font-weight: 600;
  }

  .top-coins-glass-glider {
    position: absolute;
    top: 0;
    left: 0;
    width: 50%;
    height: 100%;
    border-radius: 12px;
    transition:
    transform 0.5s cubic-bezier(0.37, 1.95, 0.66, 0.56),
    background 0.4s ease-in-out,
    box-shadow 0.4s ease-in-out;
    z-index: 1;
  }

  .top-coins-flow-radio-group input[type="radio"] {
    display: none;
  }

  .top-coins-flow-radio-group label {
    position: relative;
    z-index: 2;
    padding: 8px 16px;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    white-space: nowrap;
    min-width: 80px;
    text-align: center;
  }

  .top-coins-flow-radio-group input[type="radio"]:checked + label {
    color: #ffffff;
    font-weight: 600;
  }

  .top-coins-flow-glider {
    position: absolute;
    top: 0;
    left: 0;
    width: 50%;
    height: 100%;
    border-radius: 12px;
    transition:
    transform 0.5s cubic-bezier(0.37, 1.95, 0.66, 0.56),
    background 0.4s ease-in-out,
    box-shadow 0.4s ease-in-out;
    z-index: 1;
  }

  /* Hide scrollbars but keep functionality */
  .scrollbar-hide {
    -ms-overflow-style: none;  /* Internet Explorer 10+ */
    scrollbar-width: none;  /* Firefox */
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;  /* Safari and Chrome */
  }

  /* Custom scrollbar styling for mobile table */
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
    height: 6px;
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

  /* Remove focus outline from charts */
  .recharts-wrapper:focus,
  .recharts-wrapper:focus-visible,
  .recharts-wrapper:focus-within {
    outline: none !important;
    border: none !important;
  }

  /* Remove focus outline from chart elements */
  .recharts-surface:focus,
  .recharts-surface:focus-visible {
    outline: none !important;
    border: none !important;
  }

  /* Remove focus outline from SVG elements */
  .recharts-wrapper svg:focus,
  .recharts-wrapper svg:focus-visible {
    outline: none !important;
    border: none !important;
  }



  /* Ensure proper spacing for X-axis labels */
  .recharts-cartesian-axis-tick {
    transform-origin: center !important;
  }

 
`
document.head.appendChild(style)
