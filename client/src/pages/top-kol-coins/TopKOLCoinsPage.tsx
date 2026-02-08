"use client"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { LuCopy } from "react-icons/lu"
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
import "../../css/mobile_cards.css"

const SOL_TOKEN: TokenInfo = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
}

function TopKOLCoinsPage() {
  // Existing Logic States
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  const toggleRow = (rowId: string | number) => {
    const key = String(rowId)
    setOpenRows((prev) => ({
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
  const [, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null)
  const [filteringLoading, setFilteringLoading] = useState(false) // Local loading state for filter change

  // Filter State
  const [searchQuery, setSearchQuery] = useState("")
  const [marketCapFilter, setMarketCapFilter] = useState<string>("small")
  const [timeframeFilter, setTimeframeFilter] = useState<string>("24H")
  const [marketCapOpen, setMarketCapOpen] = useState(false)

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TopKolCoin | "marketCap" | "price"
    direction: "asc" | "desc"
  } | null>(null)

  // Swap/Quick Buy State
  const { wallet } = useWalletConnection()
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
  const [swapTokenInfo, setSwapTokenInfo] = useState<TokenInfo | null>(null)

  // Handlers
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

  const fetchTopCoinsData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true)
      else setLoading(true)
      setError(null)

      try {
        const params: TopKolCoinsParams = {
          timeframe: timeframeFilter,
          flowType: activeChartTab as "inflow" | "outflow",
        }
        // MODIFICATION: Using getTopKolCoins instead of getTopCoins
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
        if (isRefresh) setIsRefreshing(false)
        else setLoading(false)
      }
    },
    [timeframeFilter, activeChartTab]
  )

  useEffect(() => {
    fetchTopCoinsData()
  }, [fetchTopCoinsData])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTopCoinsData(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [fetchTopCoinsData])

  const getFilteredData = useCallback(() => {
    let data: TopKolCoin[] = []
    switch (marketCapFilter) {
      case "small": data = allMarketCapData.smallCaps || []; break
      case "medium": data = allMarketCapData.midCaps || []; break
      case "large": data = allMarketCapData.largeCaps || []; break
      default: data = allMarketCapData.smallCaps || []
    }

    if (searchQuery) {
      data = data.filter(
        (coin) =>
          coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          coin.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

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
  const chartCategories = filteredCoins.slice(0, 10).map(c => c.symbol)
  const chartValues = filteredCoins.slice(0, 10).map(c =>
    activeChartTab === "inflow"
      ? (c.netInflow >= 1000 ? c.netInflow / 1000 : c.netInflow)
      : (c.netOutflow >= 1000 ? c.netOutflow / 1000 : c.netOutflow)
  )
  const chartWhaleData = filteredCoins.slice(0, 10).map(c => c.whaleCount)

  const series: ApexOptions["series"] = [
    {
      name: activeChartTab === "inflow" ? "Net Inflow" : "Net Outflow",
      type: "column",
      data: chartValues,
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
      colors: activeChartTab === "inflow" ? ["#00fa9a"] : ["#FF0000"],
      strokeColors: "#ffffff",
      hover: { size: 7 },
    },
    colors: activeChartTab === "inflow" ? ["#00fa9a", "#ffffff"] : ["#FF0000", "#ffffff"],
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
          style: {
            color: activeChartTab === "inflow" ? "#00fa9a" : "#FF0000",
            fontWeight: 500,
            fontSize: "12px",
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
            color: "#ffffff",
            fontWeight: 500,
            fontSize: "12px",
            fontFamily: "Geist Mono, monospace",
          },
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

  const getCoinTrades = (coin: TopKolCoin): Trade[] => {
    if (!coin.chartData || coin.chartData.length === 0) {
      return []
    }

    // Get all trades from all chart data points
    const allTrades = coin.chartData.flatMap(point => point.trades || [])

    // Filter out invalid trades and sort by timestamp (newest first)
    const validTrades = allTrades
      .filter(trade => trade && trade.timestamp && trade.type && trade.amount)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10) // Show only the 10 most recent trades

    return validTrades
  }

  // Mobile View State

  const [mobilePage, setMobilePage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // Mobile Pagination Data
  const mobileStartIndex = (mobilePage - 1) * ITEMS_PER_PAGE
  const mobileEndIndex = mobileStartIndex + ITEMS_PER_PAGE
  const mobilePaginatedCoins = filteredCoins.slice(mobileStartIndex, mobileEndIndex)
  const totalMobilePages = Math.ceil(filteredCoins.length / ITEMS_PER_PAGE)

  const handleMobilePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalMobilePages) {
      setMobilePage(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Reset page when filters change
  useEffect(() => {
    setMobilePage(1)
  }, [marketCapFilter, timeframeFilter, searchQuery])



  return (
    <>
      <section className="">
        <div className="row">
          <div className="col-lg-12 new-mobile-spacing">
            <div className="last-refreshed-bx mb-2">
              <h6>
                Last refreshed: <span className="refresh-title">
                  {lastUpdatedTime ? <LastUpdatedTicker lastUpdated={lastUpdatedTime} format={formatTimeSinceUpdate} /> : "..."}
                </span>
              </h6>
              <button
                onClick={() => {
                  setFilteringLoading(true);
                  fetchTopCoinsData(true);
                  // Keep skeleton for minimum time to show loading state
                  setTimeout(() => setFilteringLoading(false), 1000);
                }}
                className="refresh-btn"
                disabled={isRefreshing || filteringLoading}
              >
                <TfiReload className={`reload-btn ${(isRefreshing || filteringLoading) ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>


            {/* Desktop/Mobile Header - Unified View */}
            <div className="d-flex align-items-center justify-content-between gap-2 coin-mb-container">
              <div className="d-flex align-items-center gap-3 new-mobile-tabing-bx">
                {/* Mobile & Desktop: Unified 2-Way Toggle (Card/Table vs Chart) */}
                <div className="mobile-view-toggle">
                  <button
                    className={`mobile-toggle-btn ${activeView === 'table' ? 'active' : ''}`}
                    onClick={() => setActiveView('table')}
                  >
                    TABLE VIEW
                  </button>
                  <button
                    className={`mobile-toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveView('chart');
                      setActiveChartTab('inflow');
                    }}
                  >
                    CHART VIEW
                  </button>
                </div>

                {/* Sub-tabs for Chart View */}
                {activeView === "chart" && (
                  <ul className="nav nav-tabs custom-tabs chart-sub-tabs">
                    <li className="nav-item">
                      <a
                        className={`nav-link ${activeChartTab === "inflow" ? "active" : ""}`}
                        onClick={() => {
                          if (activeChartTab !== "inflow") {
                            setFilteringLoading(true);
                            setActiveChartTab("inflow");
                            setTimeout(() => setFilteringLoading(false), 600);
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        Inflow
                      </a>
                    </li>

                    <li className="nav-item">
                      <a
                        className={`nav-link ${activeChartTab === "outflow" ? "active" : ""}`}
                        onClick={() => {
                          if (activeChartTab !== "outflow") {
                            setFilteringLoading(true);
                            setActiveChartTab("outflow");
                            setTimeout(() => setFilteringLoading(false), 600);
                          }
                        }}
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

                <div className="d-flex align-items-center gap-3 market-container mob-market-box">
                  <div className="relative">
                    <a
                      href="javascript:void(0)"
                      className={`plan-btn ${marketCapOpen ? 'active' : ''}`}
                      onClick={() => setMarketCapOpen(!marketCapOpen)}
                      style={{ cursor: 'pointer', textDecoration: 'none' }}
                    >
                      {marketCapFilter === 'small' ? 'Small Cap' : marketCapFilter === 'medium' ? 'Medium Cap' : 'Large Cap'} <HiChevronDown />
                    </a>
                    {marketCapOpen && (
                      <div className="subscription-dropdown-menu show" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                        <div className={`nw-subs-items ${marketCapFilter === 'small' ? 'active' : ''}`} onClick={() => {
                          setMarketCapOpen(false);
                          if (marketCapFilter !== 'small') {
                            setFilteringLoading(true);
                            setMarketCapFilter('small');
                            setTimeout(() => setFilteringLoading(false), 1000);
                          }
                        }}>
                          Small Cap
                        </div>
                        <div className={`nw-subs-items ${marketCapFilter === 'medium' ? 'active' : ''}`} onClick={() => {
                          setMarketCapOpen(false);
                          if (marketCapFilter !== 'medium') {
                            setFilteringLoading(true);
                            setMarketCapFilter('medium');
                            setTimeout(() => setFilteringLoading(false), 1000);
                          }
                        }}>
                          Medium Cap
                        </div>
                        <div className={`nw-subs-items ${marketCapFilter === 'large' ? 'active' : ''}`} onClick={() => {
                          setMarketCapOpen(false);
                          if (marketCapFilter !== 'large') {
                            setFilteringLoading(true);
                            setMarketCapFilter('large');
                            setTimeout(() => setFilteringLoading(false), 1000);
                          }
                        }}>
                          Large Cap
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="time-filter">
                    {['4H', '12H', '24H', '1W'].map((time) => (
                      <>
                        <a
                          href="#"
                          className={`time-item ${timeframeFilter === time ? 'active' : ''}`}
                          onClick={(e) => {
                            e.preventDefault();
                            if (timeframeFilter !== time) {
                              setFilteringLoading(true);
                              setTimeframeFilter(time);
                              // Keep skeleton for minimum time to show loading state
                              setTimeout(() => setFilteringLoading(false), 1000);
                            }
                          }}
                        >
                          {time}
                        </a>
                        {time !== '1W' && <span className="divider">|</span>}
                      </>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="tab-content custom-tab-content">
              {activeView === "table" ? (
                <>
                  <div className={`table-responsive crypto-table-responsive crypto-sub-table-responsive desktop-coin-table d-none d-lg-block`}>
                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                      <thead>
                        <tr>
                          <th className="expand-col" style={{ width: '4%' }}></th>
                          <th style={{ width: '8%' }}>
                            <div className="coin-th-title cursor-pointer" onClick={() => handleSort('rank')}>
                              RANK
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th style={{ width: '38%' }}>
                            <div className="coin-th-title cursor-pointer" onClick={() => handleSort('symbol')}>
                              COIN
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th style={{ width: '15%' }}>
                            <div className="coin-th-title cursor-pointer" onClick={() => handleSort('netInflow')}>
                              NET INFLOW
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th style={{ width: '15%' }}>
                            <div className="coin-th-title cursor-pointer" onClick={() => handleSort('whaleCount')}>
                              WHALE
                              <span>
                                <HiChevronUpDown />
                              </span>
                            </div>
                          </th>
                          <th style={{ width: '20%' }}>
                            <div className="coin-th-title cursor-pointer" onClick={() => handleSort('marketCap')}>MARKET CAP </div>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(loading || filteringLoading) ? (
                          // Loading Skeleton
                          Array.from({ length: 5 }).map((_, i) => (
                            <tr key={`skeleton-${i}`} className="main-row">
                              <td className="expand-col">
                                <div className="w-4 h-4 bg-[#1a1a1a] animate-pulse"></div>
                              </td>
                              <td><div className="w-5 h-4 bg-[#1a1a1a] animate-pulse"></div></td>
                              <td>
                                <div className="coin-cell">
                                  <span className="coin-icon">
                                    <div className="w-6 h-6 bg-[#1a1a1a] animate-pulse" style={{ flexShrink: 0 }}></div>
                                  </span>
                                  <div className="w-20 h-4 bg-[#1a1a1a] animate-pulse"></div>
                                </div>
                              </td>
                              <td>
                                <div className="w-16 h-4 bg-[#1a1a1a] animate-pulse"></div>
                              </td>
                              <td>
                                <div className="w-10 h-4 bg-[#1a1a1a] animate-pulse"></div>
                              </td>
                              <td>
                                <div className="w-18 h-4 bg-[#1a1a1a] animate-pulse"></div>
                              </td>
                            </tr>
                          ))
                        ) : filteredCoins.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-4">No coins found</td></tr>
                        ) : (
                          filteredCoins.map((coin) => (
                            <>
                              <tr
                                className={`main-row ${openRows[coin.id] ? 'active' : ''}`}
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
                                      <img src={coin.imageUrl || DefaultTokenImage} alt={coin.symbol} />
                                    </span>
                                    {coin.name}
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
                                  <span className={`sold-title ${coin.netInflow >= 0 ? 'green-text' : 'red-text'}`}>
                                    {coin.netInflow >= 0 ? '+' : ''} ${formatNumber(coin.netInflow)}
                                  </span>
                                </td>
                                <td>{coin.whaleCount}</td>
                                <td>${formatNumber(coin.marketCap)}</td>
                              </tr>

                              {openRows[coin.id] && (
                                <tr className="expand-row">
                                  <td colSpan={6} className="p-0">
                                    <div className="nw-expand-table-data">
                                      <div className="expand-empty-box"></div>
                                      <div className="flex-grow-1">
                                        <div className="expand-tp-title">
                                          <p>whale ACTIVITY last {timeframeFilter}</p>
                                        </div>

                                        <div className="nw-whale-parent-bx">
                                          <div className="whale-card-wrap">
                                            <div className="whale-card-header">
                                              <div className="whale-card-icon">
                                                <img
                                                  src={coin.imageUrl || DefaultTokenImage}
                                                  alt={coin.symbol}
                                                />
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
                                                    {coin.tokenAddress.slice(0, 8)}...{coin.tokenAddress.slice(-4)}
                                                  </span>
                                                  <button className="whale-copy-btn" onClick={() => handleCopyTokenAddress(coin.tokenAddress)}>
                                                    <FaRegCopy />
                                                  </button>
                                                </div>
                                              </div>
                                            </div>

                                            <div className="whale-quick-buy" onClick={() => handleQuickBuy(coin)} style={{ cursor: 'pointer' }}>
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
                                                <p className={`whale-stat-value ${coin.netInflow >= 0 ? 'green' : 'red'}`}>
                                                  {coin.netInflow >= 0 ? '+' : ''}{formatNumber(coin.netInflow)}
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
                                                    maker
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
                                                <tr><td colSpan={4} className="text-center">No recent transactions</td></tr>
                                              ) : (
                                                getCoinTrades(coin).map((trade, idx) => (
                                                  <tr key={idx}>
                                                    <td>
                                                      <div className="d-flex align-items-center gap-1">
                                                        <span className={trade.type === 'buy' ? "buy-bazar" : "sell-bazar"}>
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
                                                      <span className={trade.type === 'buy' ? "sold-title" : "sold-out-title"}>
                                                        ${formatNumber(trade.amount)}
                                                      </span>
                                                    </td>
                                                    <td>{new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
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

                  {/* Mobile Card View (Unified) - Visible on MOBILE Screens if mode is TABLE (which maps to CARD on mobile) */}
                  <div className={`mobile-coin-view d-lg-none ${activeView === 'table' ? 'd-flex' : 'd-none'}`}>

                    {(loading || filteringLoading) ? (
                      // Mobile Skeleton
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={`mobile-skeleton-${i}`} className="mobile-coin-card">
                          <div className="card-row">
                            <span className="card-label">RANK:</span>
                            <div className="w-8 h-4 bg-[#1a1a1a] animate-pulse"></div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">COIN:</span>
                            <div className="d-flex align-items-center gap-2">
                              <div className="w-6 h-6 bg-[#1a1a1a] animate-pulse"></div>
                              <div className="w-16 h-4 bg-[#1a1a1a] animate-pulse"></div>
                            </div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">NET INFLOW:</span>
                            <div className="w-12 h-4 bg-[#1a1a1a] animate-pulse"></div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">WHALE:</span>
                            <div className="w-10 h-4 bg-[#1a1a1a] animate-pulse"></div>
                          </div>
                          <div className="card-row">
                            <span className="card-label">MARKET CAP:</span>
                            <div className="w-16 h-4 bg-[#1a1a1a] animate-pulse"></div>
                          </div>
                        </div>
                      ))
                    ) : filteredCoins.length === 0 ? (
                      <div className="text-center py-4" style={{ color: '#8F8F8F' }}>No coins found</div>
                    ) : (
                      <>
                        {mobilePaginatedCoins.map((coin) => (
                          // CARD VIEW
                          <div key={coin.id} className="mobile-coin-card" onClick={() => toggleRow(coin.id)}>
                            <div className="card-row">
                              <span className="card-label">RANK:</span>
                              <span className="card-value">#{coin.rank}</span>
                            </div>
                            <div className="card-row">
                              <span className="card-label">COIN:</span>
                              <span className="card-value">
                                <span className="coin-icon">
                                  <img src={coin.imageUrl || DefaultTokenImage} alt={coin.symbol} style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
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
                              <span className={`card-value ${coin.netInflow >= 0 ? 'green-text' : 'red-text'}`}>
                                {coin.netInflow >= 0 ? '+' : ''} ${formatNumber(coin.netInflow)}
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
                              <>
                                <div className="mt-3 pt-3 border-top border-secondary" style={{ margin: '0 -16px', padding: '0 16px' }}>
                                  <div className="expand-tp-title mb-2">
                                    <div className="">
                                      <div className="text-center mb-3">
                                        <p className="text-uppercase mb-0" style={{ color: '#8F8F8F', fontSize: '11px', letterSpacing: '1px' }}>
                                          KOL ACTIVITY LAST {timeframeFilter}
                                        </p>
                                      </div>

                                      {/* Coin Info Box - NO BORDER RADIUS */}
                                      <div className="p-3 mb-3" style={{ backgroundColor: '#111', borderRadius: '0px', border: '1px solid #222' }}>
                                        <div className="d-flex align-items-center gap-3 mb-3">
                                          <img
                                            src={coin.imageUrl || DefaultTokenImage}
                                            alt={coin.symbol}
                                            style={{ width: '48px', height: '48px', borderRadius: '0px' }}
                                          />
                                          <div>
                                            <h5 className="mb-0 fw-bold text-white" style={{ fontSize: '16px' }}>{coin.name}</h5>
                                            <div className="d-flex align-items-center gap-2 mt-1">
                                              <span style={{ color: '#8F8F8F', fontSize: '12px' }}>${coin.symbol}</span>
                                            </div>
                                            <div className="d-flex align-items-center gap-1 mt-1">
                                              <span style={{ color: '#8F8F8F', fontSize: '12px', fontFamily: 'monospace' }}>
                                                {coin.tokenAddress.slice(0, 4)}...{coin.tokenAddress.slice(-4)}
                                              </span>
                                              <button
                                                className="p-0 border-0 bg-transparent"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCopyTokenAddress(coin.tokenAddress);
                                                }}
                                                style={{ color: '#8F8F8F' }}
                                              >
                                                <LuCopy size={12} />
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        <button
                                          className="w-100 py-2 fw-bold text-white text-uppercase"
                                          onClick={(e) => { e.stopPropagation(); handleQuickBuy(coin); }}
                                          style={{
                                            backgroundColor: 'transparent',
                                            border: '1px solid #333',
                                            borderRadius: '0px',
                                            fontSize: '13px',
                                            letterSpacing: '0.5px'
                                          }}
                                        >
                                          Quick Buy
                                        </button>
                                      </div>
                                    </div>
                                  </div>


                                </div>

                                {/* Stats Section */}
                                <div className="mb-4 d-flex flex-column gap-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <span style={{ color: '#8F8F8F', fontSize: '11px', textTransform: 'uppercase' }}>TOTAL BUYS:</span>
                                    <div className="text-end">
                                      <span className="fw-medium font-monospace" style={{ color: '#00fa9a', fontSize: '12px' }}>
                                        +{formatNumber(coin.totalBuys)}
                                      </span>
                                      <span style={{ color: '#8F8F8F', fontSize: '12px', marginLeft: '6px' }}>({coin.buyCount})</span>
                                    </div>
                                  </div>
                                  <div className="d-flex justify-content-between align-items-center">
                                    <span style={{ color: '#8F8F8F', fontSize: '11px', textTransform: 'uppercase' }}>TOTAL SELLS:</span>
                                    <div className="text-end">
                                      <span className="fw-medium font-monospace" style={{ color: '#FF0000', fontSize: '12px' }}>
                                        -{formatNumber(coin.totalSells)}
                                      </span>
                                      <span style={{ color: '#8F8F8F', fontSize: '12px', marginLeft: '6px' }}>({coin.sellCount})</span>
                                    </div>
                                  </div>
                                  <div className="d-flex justify-content-between align-items-center pt-2 border-top border-secondary mt-1">
                                    <span style={{ color: '#8F8F8F', fontSize: '11px', textTransform: 'uppercase' }}>NET INFLOW:</span>
                                    <div className="text-end">
                                      <span className="fw-medium font-monospace" style={{ color: coin.netInflow >= 0 ? '#00fa9a' : '#FF0000', fontSize: '12px' }}>
                                        {formatNumber(coin.netInflow)}
                                      </span>
                                      <span style={{ color: '#8F8F8F', fontSize: '12px', marginLeft: '6px' }}>({coin.buyCount + coin.sellCount})</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Transaction List Header */}
                                <div className="d-flex text-uppercase mb-2 px-2 py-1" style={{ color: '#8F8F8F', fontSize: '10px', fontWeight: 600 }}>
                                  <div style={{ width: '15%' }}>TYPE</div>
                                  <div style={{ width: '35%' }}>MAKER</div>
                                  <div style={{ width: '25%', textAlign: 'right' }}>USD</div>
                                  <div style={{ width: '25%', textAlign: 'right' }}>MC</div>
                                </div>

                                <div className="d-flex flex-column gap-1">
                                  {getCoinTrades(coin).length === 0 ? (
                                    <div className="text-center py-3" style={{ color: '#8F8F8F', fontSize: '12px' }}>No recent transactions</div>
                                  ) : (
                                    getCoinTrades(coin).map((trade, idx) => (
                                      <div key={idx} className="d-flex align-items-center px-2 py-2" style={{ backgroundColor: '#0A0A0A', borderRadius: '0px' }}>
                                        {/* Type Column: Badge Left, Time Right */}
                                        <div style={{ width: '15%' }} className="d-flex align-items-center gap-2">
                                          <div
                                            className="d-flex align-items-center justify-content-center fw-bold text-white"
                                            style={{
                                              minWidth: '20px',
                                              width: '20px',
                                              height: '20px',
                                              backgroundColor: trade.type === 'buy' ? '#00fa9a' : '#FF0000',
                                              borderRadius: '0px',
                                              fontSize: '11px',
                                              lineHeight: 1
                                            }}
                                          >
                                            {trade.type === 'buy' ? 'B' : 'S'}
                                          </div>
                                          <div style={{ color: trade.type === 'buy' ? '#00fa9a' : '#FF0000', fontSize: '11px', fontWeight: 'bold' }}>
                                            {(() => {
                                              const diff = new Date().getTime() - new Date(trade.timestamp).getTime();
                                              const seconds = Math.floor(diff / 1000);
                                              if (seconds < 60) return `${seconds}S`;
                                              return `${Math.floor(seconds / 60)}M`;
                                            })()}
                                          </div>
                                        </div>

                                        {/* Maker Column */}
                                        <div style={{ width: '35%', paddingLeft: '4px' }} className="d-flex flex-column">
                                          <div className="text-white text-truncate fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                                            {trade.whaleAddress.slice(0, 8)}...
                                          </div>
                                          <div style={{ color: '#666', fontSize: '10px' }}>
                                            ({trade.whaleAddress.slice(-4)})
                                          </div>
                                        </div>

                                        {/* USD Column: Green/Red */}
                                        <div style={{ width: '25%', textAlign: 'right' }}>
                                          <div className="fw-bold" style={{ color: trade.type === 'buy' ? '#00fa9a' : '#FF0000', fontSize: '11px' }}>
                                            ${formatNumber(trade.amount)}
                                          </div>
                                        </div>

                                        {/* MC Column */}
                                        <div style={{ width: '25%', textAlign: 'right' }}>
                                          <div className="text-white fw-bold" style={{ fontSize: '11px' }}>
                                            {formatNumber(coin.marketCap)}
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}


                        {/* Pagination Footer */}
                        <div className="mobile-pagination">
                          <button
                            className="pagination-btn"
                            disabled={mobilePage === 1}
                            onClick={() => handleMobilePageChange(mobilePage - 1)}
                          >
                            &lt; PREVIOUS
                          </button>

                          <span>SHOWING {mobileStartIndex + 1}-{Math.min(mobileEndIndex, filteredCoins.length)} OUT OF {filteredCoins.length}</span>

                          <button
                            className="pagination-btn"
                            disabled={mobilePage === totalMobilePages}
                            onClick={() => handleMobilePageChange(mobilePage + 1)}
                          >
                            NEXT &gt;
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Desktop Chart - ApexCharts line graph - Show on Desktop if activeView is chart */}
                  <div className={`chart-view-container d-none d-lg-block`}>
                    <ReactApexChart options={options} series={series} type="line" height={420} />
                  </div>

                  {/* Mobile Chart - Horizontal bar chart - Show on Mobile if activeView is chart */}
                  <div className={`mobile-chart-view d-lg-none`}>
                    <div className="mobile-chart-header">
                      <h4>WHALE NET {activeChartTab === 'inflow' ? 'INFLOW' : 'OUTFLOW'} WITH WHALE COUNT</h4>
                      <div className="mobile-chart-legend">
                        <span className={`legend-bar ${activeChartTab === 'inflow' ? 'green' : 'red'}`}></span>
                        <span>NET {activeChartTab === 'inflow' ? 'INFLOW' : 'OUTFLOW'}</span>
                        <span className="legend-dot"></span>
                        <span>WHALE COUNT</span>
                      </div>
                    </div>

                    <div className="mobile-chart-list">
                      {filteredCoins.slice(0, 10).map((coin) => {
                        // Use netInflow directly. If > 0 Green, < 0 Red.
                        // Width is based on absolute value relative to max absolute value.
                        const value = coin.netInflow;
                        const absValue = Math.abs(value);

                        // Calculate max absolute value in the current list for relative sizing
                        const maxAbsValue = Math.max(...filteredCoins.slice(0, 10).map(c => Math.abs(c.netInflow)));

                        const barWidth = maxAbsValue > 0 ? (absValue / maxAbsValue) * 100 : 0;
                        const maxWhales = Math.max(...filteredCoins.slice(0, 10).map(c => c.whaleCount));
                        const dotPosition = maxWhales > 0 ? (coin.whaleCount / maxWhales) * 100 : 0;

                        // Determine color based on value sign
                        const isPositive = value >= 0;

                        return (
                          <div key={coin.id} className="mobile-chart-coin">
                            <div className="chart-coin-name">
                              <span>{coin.symbol}</span>
                              <button className="tb-cpy-btn" onClick={() => navigator.clipboard.writeText(coin.tokenAddress)}>
                                <LuCopy />
                              </button>
                            </div>
                            <div className="chart-bar-container">
                              {/* Track Line - spans from 0 to whale dot */}
                              <div className="chart-whale-line" style={{ width: `${dotPosition}%` }}></div>

                              {/* Colored Bar - Net Inflow/Outflow */}
                              {/* Use min-width: 4px to ensure even tiny/0/negative values are visible */}
                              <div
                                className={`chart-bar ${isPositive ? 'green' : 'red'}`}
                                style={{ width: `${Math.min(barWidth, 100)}%`, minWidth: '4px' }}
                              ></div>

                              {/* Whale Dot */}
                              <div className="chart-whale-dot" style={{ left: `${dotPosition}%` }}></div>
                            </div>
                            <div className="chart-values">
                              <div className="chart-value-row">
                                <span className="chart-label">NET {activeChartTab === 'inflow' ? 'INFLOW' : 'OUTFLOW'}</span>
                                <span className={`chart-amount ${isPositive ? 'green' : 'red'}`}>
                                  {isPositive ? '+' : ''}${formatNumber(value)}
                                </span>
                              </div>
                              <div className="chart-value-row">
                                <span className="chart-label">WHALE COUNT</span>
                                <span className="chart-whale-count">{coin.whaleCount}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div >
        </div >
      </section >

      {isSwapModalOpen && swapTokenInfo && (
        <SwapModal
          isOpen={isSwapModalOpen}
          onClose={() => setIsSwapModalOpen(false)}
          initialInputToken={SOL_TOKEN}
          initialOutputToken={swapTokenInfo}
        />
      )
      }
    </>
  )
}

export default TopKOLCoinsPage
