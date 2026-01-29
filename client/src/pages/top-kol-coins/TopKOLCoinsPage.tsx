"use client"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { HiChevronDown, HiChevronUp, HiChevronUpDown } from "react-icons/hi2"
import { faSearch } from "@fortawesome/free-solid-svg-icons"
import { useState, useEffect, useCallback } from "react"
import { FaRegCopy } from "react-icons/fa6"
import { TfiReload } from "react-icons/tfi"
import ReactApexChart from "react-apexcharts"
import { ApexOptions } from "apexcharts"
import { useToast } from "../../contexts/ToastContext"
import { topCoinsAPI } from "../../lib/api"
import { TopKolCoin, TopKolCoinsParams, Trade } from "../../lib/types"
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

function TopKOLCoinsPage() {
  // State from Reference + Existing Logic
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
  const [filteringLoading, setFilteringLoading] = useState(false) // Local loading state for filter change

  // Filter State
  const [searchQuery, setSearchQuery] = useState("")
  const [marketCapFilter, setMarketCapFilter] = useState<string>("small")
  const [timeframeFilter, setTimeframeFilter] = useState<string>("24H")
  const [marketCapOpen, setMarketCapOpen] = useState(false)
  const [marketCapTouched, setMarketCapTouched] = useState(false)

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TopKolCoin | "marketCap" | "price"
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
        const params: TopKolCoinsParams = {
          timeframe: timeframeFilter,
          flowType: activeChartTab,
        }

        const response = await topCoinsAPI.getTopKolCoins(params)

        if (response.data.success) {
          setAllMarketCapData(response.data.data.coins)
          setLastUpdatedTime(new Date())
        } else {
          setError("Failed to fetch top kol coins data")
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
    let data: TopKolCoin[] = []
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

  // Handle Quick Buy
  const handleQuickBuy = (coin: TopKolCoin) => {
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
  const getCoinTrades = (coin: TopKolCoin): Trade[] => {
    if (!coin.chartData) return []
    return coin.chartData.flatMap(point => point.trades).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10)
  }

  // Chart Logic
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
      colors: ["#ffffff"],
      strokeColors: "#ffffff",
      hover: { size: 7 },
    },
    colors: ["#14904D", "#ffffff"],
    dataLabels: { enabled: false },
    xaxis: {
      categories: chartCategories,
      labels: {
        style: { colors: "#FBFAF9", fontSize: "14px", fontWeight: 300 },
      },
      axisBorder: { color: "#333" },
      axisTicks: { color: "#333" },
    },
    yaxis: [
      {
        title: {
          text: `NET ${activeChartTab.toUpperCase()} (THOUSANDS USD)`,
          style: { color: "#cbd5e1", fontWeight: 500 },
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
          style: { color: "#cbd5e1", fontWeight: 500 },
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

  const newOptions: ApexOptions = {
    ...options,
    colors: ["#DF2A4E", "#ffffff"],
    yaxis: [
      {
        title: {
          text: "NET OUTFLOW (THOUSANDS USD)",
          style: {
            fontSize: "12px",
            color: "#DF2A4E",
            fontWeight: 500,
            fontFamily: "Geist Mono, monospace",
          },
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
          style: {
            fontSize: "12px",
            color: "#FFFFFF",
            fontWeight: 500,
            fontFamily: "Geist Mono, monospace",
          },
        },
        labels: { style: { colors: "#cbd5e1" } },
      },
    ],
  }

  // Set colors based on active tab for chart
  const currentOptions = activeChartTab === "inflow" ? options : newOptions
  // Fix colors in options to match new UI ref
  if (activeChartTab === "inflow") {
    currentOptions.colors = ["#14904D", "#ffffff"]
  }

  return (
    <>
      <section className="">
        <div className="row">
          <div className="col-lg-12 new-mobile-spacing">
            <div className="last-refreshed-bx mb-2 d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2">
                <h6>
                  Last refreshed: <span className="refresh-title">
                    {lastUpdatedTime ? <LastUpdatedTicker lastUpdated={lastUpdatedTime} format={formatTimeSinceUpdate} /> : "..."}
                  </span>
                </h6>
              </div>
              <a href="javascript:void(0)" className="refresh-btn" onClick={() => fetchTopCoinsData(true)}>
                <TfiReload className={`reload-btn ${isRefreshing ? "spin-animation" : ""}`} /> Refresh
              </a>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-2 coin-mb-container">
              <div className="d-flex align-items-center gap-3 new-mobile-tabing-bx">
                <ul className="nav nav-tabs custom-tabs" role="tablist">
                  <li className="nav-item">
                    <a
                      className={`nav-link ${activeView === "table" ? "active" : ""}`}
                      onClick={() => setActiveView("table")}
                      style={{ cursor: "pointer" }}
                    >
                      Table View
                    </a>
                  </li>

                  <li className="nav-item">
                    <a
                      className={`nav-link ${activeView === "chart" ? "active" : ""}`}
                      onClick={() => {
                        setActiveView("chart")
                        setActiveChartTab("inflow") // 🔥 auto active
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      Chart View
                    </a>
                  </li>
                </ul>

                {activeView === "chart" && (
                  <ul className="nav nav-tabs custom-tabs chart-sub-tabs">
                    <li className="nav-item">
                      <a
                        className={`nav-link ${activeChartTab === "inflow" ? "active" : ""}`}
                        onClick={() => setActiveChartTab("inflow")}
                        style={{ cursor: "pointer" }}
                      >
                        Inflow
                      </a>
                    </li>

                    <li className="nav-item">
                      <a
                        className={`nav-link ${activeChartTab === "outflow" ? "active" : ""}`}
                        onClick={() => setActiveChartTab("outflow")}
                        style={{ cursor: "pointer" }}
                      >
                        Outflow
                      </a>
                    </li>
                  </ul>
                )}
              </div>

              <div className="d-flex align-items-center gap-2 mob-search-bx">
                <div className="custom-frm-bx mb-0">
                  <input
                    type="text"
                    className="form-control pe-5"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="searching-bx">
                    <button className="search-btn">
                      <FontAwesomeIcon icon={faSearch} />
                    </button>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-3 market-container mob-market-box position-relative">
                  <div className="position-relative">
                    <a
                      href="javascript:void(0)"
                      className="plan-btn"
                      onClick={() => setMarketCapOpen(!marketCapOpen)}
                      style={{ cursor: 'pointer', textDecoration: 'none' }}
                    >
                      {marketCapTouched
                        ? (marketCapFilter === "small" ? "Small Cap" : marketCapFilter === "medium" ? "Medium Cap" : "Large Cap")
                        : "Market Cap"}
                      <HiChevronDown />
                    </a>
                    {marketCapOpen && (
                      <div className="subscription-dropdown-menu show" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                        <div className={`nw-subs-items ${marketCapFilter === "small" ? "active" : ""}`} onClick={() => {
                          setMarketCapOpen(false);
                          setMarketCapTouched(true);
                          setFilteringLoading(true);
                          setMarketCapFilter("small");
                          setTimeout(() => setFilteringLoading(false), 500);
                        }}>
                          Small Cap
                        </div>
                        <div className={`nw-subs-items ${marketCapFilter === "medium" ? "active" : ""}`} onClick={() => {
                          setMarketCapOpen(false);
                          setMarketCapTouched(true);
                          setFilteringLoading(true);
                          setMarketCapFilter("medium");
                          setTimeout(() => setFilteringLoading(false), 500);
                        }}>
                          Medium Cap
                        </div>
                        <div className={`nw-subs-items ${marketCapFilter === "large" ? "active" : ""}`} onClick={() => {
                          setMarketCapOpen(false);
                          setMarketCapTouched(true);
                          setFilteringLoading(true);
                          setMarketCapFilter("large");
                          setTimeout(() => setFilteringLoading(false), 500);
                        }}>
                          Large Cap
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="time-filter">
                    {["4H", "12H", "24H", "1W"].map((time) => (
                      <a
                        key={time}
                        href="#"
                        className={`time-item ${timeframeFilter === time ? "active" : ""}`}
                        onClick={(e) => { e.preventDefault(); setTimeframeFilter(time); }}
                      >
                        {time}
                      </a>
                    ))}
                    {/* Add dividers if needed like in reference, but CSS might handle it */}
                  </div>
                </div>
              </div>
            </div>

            <div className="tab-content custom-tab-content">
              {activeView === "table" && (
                <>
                  <div className="table-responsive crypto-table-responsive crypto-sub-table-responsive desktop-coin-table">
                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                      <thead>
                        <tr>
                          <th className="expand-col" style={{ width: '4%' }}></th>
                          <th onClick={() => handleSort("rank")} style={{ cursor: "pointer", width: '8%' }}>
                            <div className="coin-th-title">
                              RANK
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th onClick={() => handleSort("symbol")} style={{ cursor: "pointer", width: '38%' }}>
                            <div className="coin-th-title">
                              COIN
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th onClick={() => handleSort("netInflow")} style={{ cursor: "pointer", width: '15%' }}>
                            <div className="coin-th-title">
                              NET INFLOW
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th onClick={() => handleSort("whaleCount")} style={{ cursor: "pointer", width: '15%' }}>
                            <div className="coin-th-title">
                              WHALE
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th onClick={() => handleSort("marketCap")} style={{ cursor: "pointer", width: '20%' }}>
                            <div className="coin-th-title">MARKET CAP </div>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(loading || filteringLoading) && filteredCoins.length === 0 ? (
                          // Loading Skeleton
                          Array.from({ length: 5 }).map((_, i) => (
                            <tr key={`skeleton-${i}`} className="main-row">
                              <td className="expand-col">
                                <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                              </td>
                              <td><div style={{ width: "20px", height: "14px", borderRadius: "3px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div></td>
                              <td>
                                <div className="coin-cell">
                                  <span className="coin-icon">
                                    <div style={{ width: "24px", height: "24px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)", flexShrink: 0 }}></div>
                                  </span>
                                  <div style={{ width: "80px", height: "16px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                                </div>
                              </td>
                              <td>
                                <div style={{ width: "60px", height: "16px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                              </td>
                              <td>
                                <div style={{ width: "40px", height: "16px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                              </td>
                              <td>
                                <div style={{ width: "70px", height: "16px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                              </td>
                            </tr>
                          ))
                        ) : filteredCoins.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-4">No coins found</td></tr>
                        ) : (
                          filteredCoins.map((coin) => (
                            <>
                              <tr
                                className={`main-row ${openRows[coin.id] ? "bg-active" : ""}`} // Add active class if needed like in Ref
                                onClick={() => toggleRow(coin.id)}
                                key={coin.id}
                              >
                                <td className="expand-col">
                                  {openRows[coin.id] ? (
                                    <HiChevronUp />
                                  ) : (
                                    <HiChevronDown />
                                  )}
                                </td>
                                <td>#{coin.rank}</td>
                                <td>
                                  <div className="coin-cell">
                                    <span className="coin-icon">
                                      <img src={coin.imageUrl || DefaultTokenImage} alt="" />
                                    </span>
                                    {coin.symbol}
                                    <span className="">
                                      <button
                                        className="tb-cpy-btn"
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
                                <td>
                                  <span className={`sold-title ${coin.netInflow >= 0 ? "green-text" : "red-text"}`}>
                                    {coin.netInflow >= 0 ? "+" : ""} ${formatNumber(coin.netInflow)}
                                  </span>
                                </td>
                                <td>{coin.whaleCount}</td>
                                <td>${formatNumber(coin.marketCap)}</td>
                              </tr>

                              {openRows[coin.id] && (
                                <tr className="expand-row">
                                  <td colSpan={6} className="p-0">
                                    <div className="nw-expand-table-data">
                                      <div className='expand-empty-box'></div>
                                      <div className="flex-grow-1">
                                        <div className="expand-tp-title">
                                          <p>whale ACTIVITY last 4h</p>
                                        </div>

                                        <div className="nw-whale-parent-bx">
                                          <div className="whale-card-wrap">
                                            <div className="whale-card-header">
                                              <div className="whale-card-icon">
                                                <img src={coin.imageUrl || DefaultTokenImage} alt="" />
                                              </div>

                                              <div className="whale-card-info">
                                                <h4 className="whale-card-title">
                                                  {coin.name}
                                                </h4>
                                                <p className="whale-card-symbol">
                                                  ${coin.symbol}
                                                </p>

                                                <div className="whale-card-address">
                                                  <span className="whale-crd-title">
                                                    {coin.tokenAddress}
                                                  </span>
                                                  <button className="whale-copy-btn" onClick={() => handleCopyTokenAddress(coin.tokenAddress)}>
                                                    <FaRegCopy />
                                                  </button>
                                                </div>
                                              </div>
                                            </div>

                                            <div className="whale-quick-buy" onClick={() => handleQuickBuy(coin)} style={{ cursor: "pointer" }}>
                                              QUICK BUY
                                            </div>

                                            <div className="whale-stats-box">
                                              <div className="whale-stat-row">
                                                <span className="whale-stat-label">
                                                  TOTAL BUYS:
                                                </span>
                                                <p className="whale-stat-value green">
                                                  +{formatNumber(coin.totalBuys)}
                                                  <span className="whale-stat-title">
                                                    ({coin.buyCount})
                                                  </span>
                                                </p>
                                              </div>

                                              <div className="whale-stat-row">
                                                <span className="whale-stat-label">
                                                  TOTAL SELLS:
                                                </span>
                                                <p className="whale-stat-value red">
                                                  -{formatNumber(coin.totalSells)}
                                                  <span className="whale-stat-title">
                                                    ({coin.sellCount})
                                                  </span>
                                                </p>
                                              </div>

                                              <div className="whale-stat-divider"></div>

                                              <div className="whale-stat-row">
                                                <span className="whale-stat-net">
                                                  NET INFLOW:
                                                </span>
                                                <p className={`whale-stat-value ${coin.netInflow >= 0 ? "green" : "red"}`}>
                                                  {coin.netInflow >= 0 ? "+" : ""}{formatNumber(coin.netInflow)}
                                                  <span className="whale-stat-title">
                                                    ({coin.buyCount - coin.sellCount})
                                                  </span>
                                                </p>
                                              </div>
                                            </div>
                                          </div>

                                          <table className="table crypto-table align-middle crypto-sub-table mb-0">
                                            <thead>
                                              <tr>
                                                <th>
                                                  <div className="coin-th-title">
                                                    Type
                                                    <span>
                                                      <HiChevronUpDown />
                                                    </span>
                                                  </div>
                                                </th>
                                                <th>
                                                  <div className="coin-th-title">
                                                    Whale
                                                    <span>
                                                      <HiChevronUpDown />
                                                    </span>
                                                  </div>
                                                </th>
                                                <th>
                                                  <div className="coin-th-title">
                                                    usd
                                                    <span>
                                                      <HiChevronUpDown />
                                                    </span>
                                                  </div>
                                                </th>
                                                <th>
                                                  <div className="coin-th-title">
                                                    Time
                                                    <span>
                                                      <HiChevronUpDown />
                                                    </span>
                                                  </div>
                                                </th>
                                              </tr>
                                            </thead>

                                            <tbody>
                                              {getCoinTrades(coin).length === 0 ? (
                                                <tr><td colSpan={4} className="text-center p-3">No recent transactions</td></tr>
                                              ) : (
                                                getCoinTrades(coin).map((trade, idx) => (
                                                  <tr key={idx}>
                                                    <td>
                                                      <div className="d-flex align-items-center gap-1">
                                                        <span className={trade.type === "buy" ? "buy-bazar" : "sell-bazar"}>
                                                          {trade.type.toUpperCase()}
                                                        </span>
                                                      </div>
                                                    </td>
                                                    <td>
                                                      Whale
                                                      <span className="whale-marker-title">
                                                        ({trade.whaleAddress.slice(0, 4)}...{trade.whaleAddress.slice(-4)})
                                                      </span>
                                                    </td>
                                                    <td>
                                                      <span className={trade.type === "buy" ? "sold-title" : "sold-out-title"}>
                                                        ${formatNumber(trade.amount)}
                                                      </span>
                                                    </td>
                                                    <td>{new Date(trade.timestamp).toLocaleTimeString()}</td>
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

                  {/* Mobile Card View */}
                  <div className="mobile-coin-view">
                    {(loading || filteringLoading) && filteredCoins.length === 0 ? (
                      // Mobile Skeleton
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={`mobile-skeleton-${i}`} className="mobile-coin-card">
                          <div className="card-row">
                            <span className="card-label">RANK:</span>
                            <div style={{ width: "30px", height: "14px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">COIN:</span>
                            <div className="d-flex align-items-center gap-2">
                              <div style={{ width: "24px", height: "24px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                              <div style={{ width: "60px", height: "14px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                            </div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">NET INFLOW:</span>
                            <div style={{ width: "50px", height: "14px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">WHALE:</span>
                            <div style={{ width: "40px", height: "14px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">MARKET CAP:</span>
                            <div style={{ width: "60px", height: "14px", borderRadius: "4px", background: "#1a1a1a", animation: "shimmer 3s infinite linear", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)" }}></div>
                          </div>
                        </div>
                      ))
                    ) : (
                      filteredCoins.map((coin) => (
                        <div key={coin.id} className="mobile-coin-card" onClick={() => toggleRow(coin.id)}>
                          <div className="card-row">
                            <span className="card-label">RANK:</span>
                            <span className="card-value">#{coin.rank}</span>
                          </div>
                          <div className="card-row">
                            <span className="card-label">COIN:</span>
                            <span className="card-value">
                              <span className="coin-icon">
                                <img src={coin.imageUrl || DefaultTokenImage} alt={coin.symbol} style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
                              </span>
                              {coin.symbol}
                              <button
                                className="tb-cpy-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyTokenAddress(coin.tokenAddress)
                                }}
                              >
                                <FaRegCopy />
                              </button>
                            </span>
                          </div>
                          <div className="card-row">
                            <span className="card-label">NET INFLOW:</span>
                            <span className={`card-value ${coin.netInflow >= 0 ? "green-text" : "red-text"}`}>
                              {coin.netInflow >= 0 ? "+" : ""}${formatNumber(coin.netInflow)}
                            </span>
                          </div>
                          <div className="card-row">
                            <span className="card-label">WHALE:</span>
                            <span className="card-value">{coin.whaleCount}</span>
                          </div>
                          <div className="card-row">
                            <span className="card-label">MARKET CAP:</span>
                            <span className="card-value">${formatNumber(coin.marketCap)}</span>
                          </div>
                          {/* Expandable content for mobile */}
                          {openRows[coin.id] && (
                            <div className="mt-3 pt-3 border-top border-secondary">
                              <div className="expand-tp-title mb-2">
                                <p>whale ACTIVITY last 4h</p>
                              </div>
                              <div className="whale-quick-buy mb-3" onClick={(e) => { e.stopPropagation(); handleQuickBuy(coin); }} style={{ cursor: 'pointer' }}>
                                QUICK BUY
                              </div>
                              {/* Simplified Stats for Mobile */}
                              <div className="whale-stats-box">
                                <div className="whale-stat-row">
                                  <span className="whale-stat-label">BUYS:</span>
                                  <p className="whale-stat-value green">+{formatNumber(coin.totalBuys)} ({coin.buyCount})</p>
                                </div>
                                <div className="whale-stat-row">
                                  <span className="whale-stat-label">SELLS:</span>
                                  <p className="whale-stat-value red">-{formatNumber(coin.totalSells)} ({coin.sellCount})</p>
                                </div>
                                <div className="whale-stat-row">
                                  <span className="whale-stat-net">NET:</span>
                                  <p className={`whale-stat-value ${coin.netInflow >= 0 ? 'green' : 'red'}`}>
                                    {coin.netInflow >= 0 ? '+' : ''}{formatNumber(coin.netInflow)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {activeView === "chart" && (
                <div className="chart-view-container">
                  <ReactApexChart
                    options={currentOptions}
                    series={series}
                    type="line"
                    height={420}
                  />
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

export default TopKOLCoinsPage
