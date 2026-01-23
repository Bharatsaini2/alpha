"use client"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { HiChevronDown, HiChevronUp, HiChevronUpDown } from "react-icons/hi2"
import { faSearch } from "@fortawesome/free-solid-svg-icons"
import { useState, useEffect, useCallback } from "react"
import { FaRegCopy } from "react-icons/fa6"
import { TfiReload } from "react-icons/tfi"
import ReactApexChart from "react-apexcharts"
import { AlertCircle } from "lucide-react"
import { ApexOptions } from "apexcharts"
import { useToast } from "../../contexts/ToastContext"
import { topCoinsAPI } from "../../lib/api"
import { TopCoin, TopCoinsParams, Trade } from "../../lib/types"
import SwapModal from "../../components/swap/SwapModal"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { validateQuickBuyAmount, loadQuickBuyAmount } from "../../utils/quickBuyValidation"
import { formatNumber } from "../../utils/FormatNumber"
import DefaultTokenImage from "../../assets/default_token.svg"
import { LastUpdatedTicker } from "../../components/TicketComponent"
import { TokenInfo } from "../../components/swap/TokenSelectionModal"

const SOL_TOKEN: TokenInfo = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
}
function TopCoinsPage() {
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  const toggleRow = (rowId: string | number) => {
    const key = String(rowId)

    setOpenRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }
  const [activeView, setActiveView] = useState("table")
  const [activeChartTab, setActiveChartTab] = useState("inflow")

  const { showToast } = useToast()

  // Data State
  const [allMarketCapData, setAllMarketCapData] = useState<{
    smallCaps: TopCoin[]
    midCaps: TopCoin[]
    largeCaps: TopCoin[]
    all: TopCoin[]
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

  // Filter State
  const [searchQuery, setSearchQuery] = useState("")
  const [marketCapFilter, setMarketCapFilter] = useState<string>("small")
  const [timeframeFilter, setTimeframeFilter] = useState<string>("24H")
  const [marketCapOpen, setMarketCapOpen] = useState(false)
  const [marketCapTouched, setMarketCapTouched] = useState(false)

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TopCoin | "marketCap" | "price"
    direction: "asc" | "desc"
  } | null>(null)

  // Swap/Quick Buy State
  const { wallet } = useWalletConnection()
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const [swapTokenInfo, setSwapTokenInfo] = useState<TokenInfo | null>(null)

  const handleCopyTokenAddress = async (tokenAddress: string) => {
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
        const params: TopCoinsParams = {
          timeframe: timeframeFilter,
          flowType: activeChartTab,
        }

        const response = await topCoinsAPI.getTopCoins(params)

        if (response.data.success) {
          setAllMarketCapData(response.data.data.coins)
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
    [timeframeFilter, activeChartTab]
  )

  // Fetch data when filters change
  useEffect(() => {
    fetchTopCoinsData()
  }, [fetchTopCoinsData])

  // Auto-refresh every 1 minute
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTopCoinsData(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [fetchTopCoinsData])

  // Get Filtered Data
  const getFilteredData = useCallback(() => {
    let data: TopCoin[] = []
    switch (marketCapFilter) {
      case "small":
        data = allMarketCapData.smallCaps || []
        break
      case "medium":
        data = allMarketCapData.midCaps || []
        break
      case "large":
        data = allMarketCapData.largeCaps || []
        break
      default:
        data = allMarketCapData.smallCaps || []
    }

    // Apply Search
    if (searchQuery) {
      data = data.filter(
        (coin) =>
          coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          coin.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Apply Sorting
    if (sortConfig) {
      data = [...data].sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      })
    }

    return data
  }, [allMarketCapData, marketCapFilter, searchQuery, sortConfig])

  const filteredCoins = getFilteredData()

  // Prepare Chart Data
  const chartCategories = filteredCoins.slice(0, 20).map(c => c.symbol) // Limit to top 20 for chart clarity
  const chartInflowData = filteredCoins.slice(0, 20).map(c => c.netInflow >= 1000 ? c.netInflow / 1000 : c.netInflow)
  const chartOutflowData = filteredCoins.slice(0, 20).map(c => c.netOutflow >= 1000 ? c.netOutflow / 1000 : c.netOutflow)
  const chartWhaleData = filteredCoins.slice(0, 20).map(c => c.whaleCount)

  const series: ApexOptions["series"] = [
    {
      name: activeChartTab === "inflow" ? "Net Inflow" : "Net Outflow",
      type: "column",
      data: activeChartTab === "inflow" ? chartInflowData : chartOutflowData,
    },
    {
      name: "Whale Count",
      type: "line",
      data: chartWhaleData,
    },
  ]

  const options: ApexOptions = {
    chart: {
      height: 420,
      type: "line",
      background: "transparent",
      toolbar: { show: false },
    },
    theme: { mode: "dark" },
    stroke: { width: [0, 2], curve: "straight" },
    plotOptions: {
      bar: { columnWidth: "40%", borderRadius: 0 },
    },
    markers: {
      size: 6,
      colors: activeChartTab === "inflow" ? ["#14904D"] : ["#DF2A4E"],
      strokeColors: "#ffffff",
      hover: { size: 7 },
    },
    colors: activeChartTab === "inflow" ? ["#14904D", "#ffffff"] : ["#DF2A4E", "#ffffff"],
    dataLabels: { enabled: false },
    xaxis: {
      categories: chartCategories,
      labels: {
        style: { colors: "#FBFAF9", fontSize: "12px", fontWeight: 300 },
      },
      axisBorder: { color: "#333" },
      axisTicks: { color: "#333" },
    },
    yaxis: [
      {
        title: {
          text: `NET ${activeChartTab.toUpperCase()} (THOUSANDS USD)`,
          style: { color: activeChartTab === "inflow" ? "#14904D" : "#DF2A4E", fontWeight: 500 },
        },
        labels: {
          formatter: (val: number) => `${val.toFixed(1)}K ($)`,
          style: { colors: "#cbd5e1" },
        },
      },
      {
        opposite: true,
        title: {
          text: "WHALE COUNT",
          style: { color: "#ffffff", fontWeight: 500 },
        },
        labels: { style: { colors: "#cbd5e1" } },
      },
    ],
    grid: { borderColor: "#333", strokeDashArray: 4 },
    legend: {
      position: "top",
      horizontalAlign: "center",
      labels: { colors: "#e5e7eb" },
    },
    tooltip: { theme: "dark" },
  }

  // Handle Quick Buy
  const handleQuickBuy = (coin: TopCoin) => {
    const quickBuyAmount = loadQuickBuyAmount() || "100"
    const validation = validateQuickBuyAmount(quickBuyAmount)
    if (!validation.isValid) {
      showToast(validation.error || "Please enter a valid SOL amount for quick buy", "error")
      return
    }

    if (!wallet.connected) {
      showToast("Please connect your wallet to continue", "error")
      return
    }

    const tokenInfo = {
      symbol: coin.symbol,
      name: coin.name,
      address: coin.tokenAddress,
      image: coin.imageUrl,
      decimals: 9,
    }

    setSwapTokenInfo(tokenInfo)
    setIsSwapModalOpen(true)
  }

  const handleSort = (key: any) => {
    let direction: "asc" | "desc" = "asc"
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc"
    }
    setSortConfig({ key, direction })
  }

  const formatTimeSinceUpdate = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  // Helper to extract trades from a coin
  const getCoinTrades = (coin: TopCoin): Trade[] => {
    if (!coin.chartData) return []
    return coin.chartData.flatMap(point => point.trades).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10)
  }

  return (
    <>
      <section className="">
        <div className="row">
          <div className="col-lg-12 new-mobile-spacing">
            {/* Header Section */}
            <div className="last-refreshed-bx mb-2 flex justify-between items-center">
              <div>
                {lastUpdatedTime && (
                  <h6 className="flex items-center gap-1 text-gray-400 text-xs">
                    Last refreshed: <span className="refresh-title text-white">
                      <LastUpdatedTicker lastUpdated={lastUpdatedTime} format={formatTimeSinceUpdate} />
                    </span>
                  </h6>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg mb-4 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <button
                onClick={() => fetchTopCoinsData(true)}
                disabled={isRefreshing}
                className="refresh-btn flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
              >
                <TfiReload className={`reload-btn ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-2 coin-mb-container flex-wrap md:flex-nowrap">
              <div className="d-flex align-items-center gap-3 new-mobile-tabing-bx">
                <ul className="nav nav-tabs custom-tabs flex gap-2" role="tablist">
                  <li className="nav-item">
                    <a
                      className={`nav-link px-4 py-2 rounded-lg ${activeView === "table" ? "bg-[#333] text-white" : "text-gray-400 hover:text-white"}`}
                      onClick={() => setActiveView("table")}
                      style={{ cursor: "pointer" }}
                    >
                      Table View
                    </a>
                  </li>

                  <li className="nav-item">
                    <a
                      className={`nav-link px-4 py-2 rounded-lg ${activeView === "chart" ? "bg-[#333] text-white" : "text-gray-400 hover:text-white"}`}
                      onClick={() => {
                        setActiveView("chart")
                        setActiveChartTab("inflow")
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      Chart View
                    </a>
                  </li>
                </ul>

                {activeView === "chart" && (
                  <ul className="nav nav-tabs custom-tabs chart-sub-tabs flex gap-2 ml-4">
                    <li className="nav-item">
                      <a
                        className={`nav-link px-3 py-1 rounded-md text-sm ${activeChartTab === "inflow" ? "bg-green-600/20 text-green-500 border border-green-500/50" : "text-gray-400"}`}
                        onClick={() => setActiveChartTab("inflow")}
                        style={{ cursor: "pointer" }}
                      >
                        Inflow
                      </a>
                    </li>

                    <li className="nav-item">
                      <a
                        className={`nav-link px-3 py-1 rounded-md text-sm ${activeChartTab === "outflow" ? "bg-red-600/20 text-red-500 border border-red-500/50" : "text-gray-400"}`}
                        onClick={() => setActiveChartTab("outflow")}
                        style={{ cursor: "pointer" }}
                      >
                        Outflow
                      </a>
                    </li>
                  </ul>
                )}
              </div>

              {/* Filters */}
              <div className="d-flex align-items-center gap-2 mob-search-bx w-full md:w-auto">
                <div className="custom-frm-bx mb-0 relative flex-1 md:flex-none">
                  <input
                    type="text"
                    className="form-control pe-5 bg-[#16171C] border border-[#2A2A2D] rounded-xl pl-4 pr-10 py-2 text-white w-full placeholder-gray-500 focus:outline-none"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="searching-bx absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <FontAwesomeIcon icon={faSearch} />
                  </div>
                </div>

                <div className="d-flex align-items-center gap-3 market-container mob-market-box relative">
                  <div className="relative">
                    <button
                      onClick={() => setMarketCapOpen(!marketCapOpen)}
                      className="plan-btn flex items-center gap-2 bg-[#1B1B1D] border border-[#2A2A2D] text-white px-3 py-2 rounded-xl text-sm"
                    >
                      {marketCapTouched
                        ? (marketCapFilter === 'small' ? 'Small Cap' : marketCapFilter === 'medium' ? 'Medium Cap' : 'Large Cap')
                        : 'Market Cap'}
                      <HiChevronUpDown />
                    </button>
                    {marketCapOpen && (
                      <div className="absolute top-full left-0 mt-2 w-40 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-50">
                        <button className="w-full text-left px-4 py-2 text-white hover:bg-gray-800 rounded-t-xl" onClick={() => { setMarketCapFilter('small'); setMarketCapTouched(true); setMarketCapOpen(false); }}>Small Cap</button>
                        <button className="w-full text-left px-4 py-2 text-white hover:bg-gray-800" onClick={() => { setMarketCapFilter('medium'); setMarketCapTouched(true); setMarketCapOpen(false); }}>Medium Cap</button>
                        <button className="w-full text-left px-4 py-2 text-white hover:bg-gray-800 rounded-b-xl" onClick={() => { setMarketCapFilter('large'); setMarketCapTouched(true); setMarketCapOpen(false); }}>Large Cap</button>
                      </div>
                    )}
                  </div>

                  <div className="time-filter bg-[#1B1B1D] border border-[#2A2A2D] rounded-xl flex items-center p-1">
                    {['4H', '12H', '24H', '1W'].map((time) => (
                      <a
                        key={time}
                        href="#"
                        className={`time-item px-2 py-1 text-xs rounded-lg ${timeframeFilter === time ? 'bg-[#333] text-white' : 'text-gray-400 hover:text-white'}`}
                        onClick={(e) => { e.preventDefault(); setTimeframeFilter(time); }}
                      >
                        {time}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="tab-content custom-tab-content mt-4">
              {activeView === "table" ? (
                <>
                  <div className="table-responsive crypto-table-responsive crypto-sub-table-responsive desktop-tab-panel overflow-x-auto">
                    <table className="table crypto-table align-middle mb-0 crypto-sub-table w-full text-left">
                      <thead>
                        <tr className="text-gray-400 border-b border-[#2A2A2D]">
                          <th className="expand-col w-10 p-4"></th>
                          <th className="p-4 cursor-pointer" onClick={() => handleSort('rank')}>
                            <div className="coin-th-title flex items-center gap-1">
                              RANK <span><HiChevronUpDown /></span>
                            </div>
                          </th>
                          <th className="p-4 cursor-pointer" onClick={() => handleSort('symbol')}>
                            <div className="coin-th-title flex items-center gap-1">
                              COIN <span><HiChevronUpDown /></span>
                            </div>
                          </th>
                          <th className="p-4 cursor-pointer" onClick={() => handleSort('netInflow')}>
                            <div className="coin-th-title flex items-center gap-1">
                              NET INFLOW <span><HiChevronUpDown /></span>
                            </div>
                          </th>
                          <th className="p-4 cursor-pointer" onClick={() => handleSort('whaleCount')}>
                            <div className="coin-th-title flex items-center gap-1">
                              WHALE <span><HiChevronUpDown /></span>
                            </div>
                          </th>
                          <th className="p-4 cursor-pointer" onClick={() => handleSort('marketCap')}>
                            <div className="coin-th-title flex items-center gap-1">MARKET CAP </div>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredCoins.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center text-gray-500 py-8">
                              {loading ? "Loading..." : "No coins found."}
                            </td>
                          </tr>
                        ) : (
                          filteredCoins.map((coin) => (
                            <>
                              <tr
                                key={coin.id}
                                className={`main-row hover:bg-[#1f2024] cursor-pointer border-b border-[#2A2A2D] transition-colors ${openRows[coin.id] ? "bg-[#1f2024]" : ""}`}
                                onClick={() => toggleRow(coin.id)}
                              >
                                <td className="expand-col p-4 text-center">
                                  {openRows[coin.id] ? <HiChevronUp /> : <HiChevronDown />}
                                </td>
                                <td className="p-4 text-white font-medium">#{coin.rank}</td>
                                <td className="p-4">
                                  <div className="coin-cell flex items-center gap-2">
                                    <span className="coin-icon w-8 h-8 rounded-full overflow-hidden border border-[#2A2A2D]">
                                      <img src={coin.imageUrl || DefaultTokenImage} alt="" className="w-full h-full object-cover" />
                                    </span>
                                    <span className="text-white font-medium">{coin.symbol}</span>
                                    <span className="">
                                      <button
                                        className="tb-cpy-btn text-gray-400 hover:text-white"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleCopyTokenAddress(coin.tokenAddress)
                                        }}
                                      >
                                        <FaRegCopy />
                                      </button>
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className={`sold-title font-medium ${coin.netInflow >= 0 ? 'text-[#06DF73]' : 'text-[#FF6467]'}`}>
                                    {coin.netInflow >= 0 ? '+' : ''} ${formatNumber(coin.netInflow)}
                                  </span>
                                </td>
                                <td className="p-4 text-white font-medium">{coin.whaleCount}</td>
                                <td className="p-4 text-white font-medium">${formatNumber(coin.marketCap)}</td>
                              </tr>

                              {openRows[coin.id] && (
                                <tr className="expand-row bg-[#16171C]">
                                  <td colSpan={6} className="p-0">
                                    <div className="nw-expand-table-data p-4">
                                      <div className="expand-tp-title mb-4">
                                        <p className="text-gray-400 text-sm uppercase">whale ACTIVITY last {timeframeFilter}</p>
                                      </div>

                                      <div className="nw-whale-parent-bx flex flex-col lg:flex-row gap-6">
                                        {/* Whale Card */}
                                        <div className="whale-card-wrap bg-[#1B1B1D] border border-[#2A2A2D] rounded-xl p-4 min-w-[300px]">
                                          <div className="whale-card-header flex items-center gap-3 mb-4">
                                            <div className="whale-card-icon w-12 h-12 rounded-lg border border-[#2A2A2D] overflow-hidden">
                                              <img
                                                src={coin.imageUrl || DefaultTokenImage}
                                                alt={coin.symbol}
                                                className="w-full h-full object-cover"
                                              />
                                            </div>

                                            <div className="whale-card-info flex-1">
                                              <h4 className="whale-card-title text-white font-bold text-lg">
                                                {coin.name}
                                              </h4>
                                              <p className="whale-card-symbol text-gray-400 text-sm">
                                                ${coin.symbol}
                                              </p>

                                              <div className="whale-card-address flex items-center gap-2 mt-1">
                                                <span className="whale-crd-title text-gray-500 text-xs">
                                                  {coin.tokenAddress.slice(0, 8)}...{coin.tokenAddress.slice(-4)}
                                                </span>
                                                <button className="whale-copy-btn text-gray-500 hover:text-white" onClick={() => handleCopyTokenAddress(coin.tokenAddress)}>
                                                  <FaRegCopy size={12} />
                                                </button>
                                              </div>
                                            </div>
                                          </div>

                                          <div
                                            className="whale-quick-buy bg-[#3C82F6] hover:bg-[#2563EB] text-white text-center py-2 rounded-lg font-bold cursor-pointer transition-colors mb-4"
                                            onClick={() => handleQuickBuy(coin)}
                                          >
                                            QUICK BUY
                                          </div>

                                          <div className="whale-stats-box space-y-2">
                                            <div className="whale-stat-row flex justify-between items-center text-sm">
                                              <span className="whale-stat-label text-gray-400">
                                                TOTAL BUYS:
                                              </span>
                                              <p className="whale-stat-value text-[#06DF73] font-medium">
                                                +{formatNumber(coin.totalBuys)}
                                                <span className="whale-stat-title text-gray-500 ml-1">
                                                  ({coin.buyCount})
                                                </span>
                                              </p>
                                            </div>

                                            <div className="whale-stat-row flex justify-between items-center text-sm">
                                              <span className="whale-stat-label text-gray-400">
                                                TOTAL SELLS:
                                              </span>
                                              <p className="whale-stat-value text-[#FF6467] font-medium">
                                                -{formatNumber(coin.totalSells)}
                                                <span className="whale-stat-title text-gray-500 ml-1">
                                                  ({coin.sellCount})
                                                </span>
                                              </p>
                                            </div>

                                            <div className="whale-stat-divider border-t border-[#2A2A2D] my-2"></div>

                                            <div className="whale-stat-row flex justify-between items-center text-sm">
                                              <span className="whale-stat-net text-white font-medium">
                                                NET INFLOW:
                                              </span>
                                              <p className={`whale-stat-value font-medium ${coin.netInflow >= 0 ? 'text-[#06DF73]' : 'text-[#FF6467]'}`}>
                                                {coin.netInflow >= 0 ? '+' : ''}{formatNumber(coin.netInflow)}
                                                <span className="whale-stat-title text-gray-500 ml-1">
                                                  ({coin.buyCount - coin.sellCount})
                                                </span>
                                              </p>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Sub Table for Transactions */}
                                        <div className="flex-grow overflow-x-auto">
                                          <table className="table crypto-table align-middle crypto-sub-table mb-0 w-full text-left">
                                            <thead>
                                              <tr className="border-b border-[#2A2A2D] text-gray-400">
                                                <th className="p-3">Type</th>
                                                <th className="p-3">Maker</th>
                                                <th className="p-3">Amount</th>
                                                <th className="p-3">Time</th>
                                              </tr>
                                            </thead>

                                            <tbody>
                                              {getCoinTrades(coin).length === 0 ? (
                                                <tr><td colSpan={4} className="text-center text-gray-600 py-4">No recent whale transactions</td></tr>
                                              ) : (
                                                getCoinTrades(coin).map((trade, idx) => (
                                                  <tr key={idx} className="border-b border-[#2A2A2D] hover:bg-[#1a1b1e]">
                                                    <td className="p-3">
                                                      <div className="d-flex align-items-center gap-1">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${trade.type === 'buy' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                                          {trade.type}
                                                        </span>
                                                      </div>
                                                    </td>
                                                    <td className="p-3 text-white text-sm">
                                                      Whale
                                                      <span className="whale-marker-title text-gray-500 ml-1 text-xs">
                                                        ({trade.whaleAddress.slice(0, 4)}...{trade.whaleAddress.slice(-4)})
                                                      </span>
                                                    </td>
                                                    <td className="p-3">
                                                      <span className="sold-title text-white text-sm font-medium">
                                                        ${formatNumber(trade.amount)}
                                                      </span>
                                                    </td>
                                                    <td className="p-3 text-gray-500 text-sm">
                                                      {new Date(trade.timestamp).toLocaleTimeString()}
                                                    </td>
                                                  </tr>
                                                ))
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="chart-view-container bg-[#1B1B1D] p-4 rounded-xl border border-[#2A2A2D]">
                  {loading ? (
                    <div className="flex items-center justify-center h-[420px]">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                    </div>
                  ) : (
                    <ReactApexChart options={options} series={series} type="line" height={420} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <SwapModal
        isOpen={isSwapModalOpen}
        onClose={() => setIsSwapModalOpen(false)}
        initialInputToken={SOL_TOKEN}
        initialOutputToken={swapTokenInfo || undefined}
        mode="quickBuy"
      />
    </>
  )
}

export default TopCoinsPage
