import { RiVerifiedBadgeFill } from "react-icons/ri"
import { FaXTwitter } from "react-icons/fa6"
import { FaRegCopy } from "react-icons/fa6"
import { FaStar } from "react-icons/fa"
import "../../css/KolFeedPortfolio.css"
import { useEffect, useState, useMemo } from "react"
import { HiChevronUpDown } from "react-icons/hi2"
import { TfiReload } from "react-icons/tfi"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPaperPlane, faArrowLeft } from "@fortawesome/free-solid-svg-icons"
import { useParams, useNavigate } from "react-router-dom"
import axios from "axios"
import { formatNumber, formatPrice } from "../../utils/FormatNumber"
import { formatAge } from "../../utils/formatAge"
import DefaultTokenImage from "../../assets/default_token.svg"

function KolFeedProfile() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("portfolio")
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [amountOpen, setAmountOpen] = useState(false)
  const [amount, setAmount] = useState("$1K")
  const [customAmount, setCustomAmount] = useState("")
  const [isSaved, setIsSaved] = useState(false)
  const [hotness, setHotness] = useState<number>(10)

  const closeAll = () => {
    setTriggerOpen(false)
    setAmountOpen(false)
  }

  useEffect(() => {
    document.addEventListener("click", closeAll)
    return () => document.removeEventListener("click", closeAll)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".nav-item.dropdown")) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  const { username } = useParams()
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  const BASE_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

  useEffect(() => {
    const fetchKOLData = async () => {
      try {
        setLoading(true)
        const response = await axios.get(
          `${BASE_URL}/influencer/influencer-whale-transactions?search=${username}&searchType=kol&limit=100`
        )
        const txs = response.data.transactions || []
        setTransactions(txs)

        if (txs.length > 0) {
          const firstTx = txs[0]
          setProfile({
            name: firstTx.influencerName || username,
            username: firstTx.influencerUsername || username,
            avatar: firstTx.influencerProfileImageUrl,
            address: firstTx.kolAddress || firstTx.whaleAddress,
          })
        }
      } catch (err) {
        console.error("Error fetching KOL data:", err)
      } finally {
        setLoading(false)
      }
    }
    if (username) fetchKOLData()
  }, [username])

  const portfolioData = useMemo(() => {
    const assets: Record<string, any> = {}
    transactions.forEach((tx) => {
      const isBuy = tx.type === "buy" || (tx.type === "both" && tx.bothType?.[0]?.buyType)
      const token = isBuy ? tx.transaction?.tokenOut : tx.transaction?.tokenIn
      const symbol = token?.symbol
      if (symbol && !assets[symbol]) {
        assets[symbol] = {
          symbol,
          name: token.name,
          address: token.address,
          image: isBuy ? tx.outTokenURL : tx.inTokenURL,
          price: isBuy ? tx.tokenPrice?.buyTokenPrice : tx.tokenPrice?.sellTokenPrice,
          marketCap: isBuy ? tx.marketCap?.buyMarketCap : tx.marketCap?.sellMarketCap,
          value: isBuy ? tx.amount?.buyAmount : tx.amount?.sellAmount,
          age: tx.age || formatAge(tx.timestamp),
          pnl: tx.hotnessScore > 5 ? "+12%" : "+5%", // Simulated PnL
        }
      }
    })
    return Object.values(assets).slice(0, 10)
  }, [transactions])

  const totalValue = useMemo(() => {
    return portfolioData.reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0)
  }, [portfolioData])

  useEffect(() => {
    if (isSaved) {
      setOpenDropdown(null)
    }
  }, [isSaved])


  return (
    <>
      <section>
        <div className="mb-3 d-flex align-items-center">
          <button
            onClick={() => navigate(-1)}
            className="alpha-edit-btn d-flex align-items-center gap-2"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Back
          </button>
        </div>
        <div className="row">
          <div className="col-lg-5 col-md-5 col-sm-12 new-mobile-spacing">
            <div className="alpha-profile-card nw-portfolio-card mb-3">
              <div className="alpha-profile-title-bx portfolio-tp-bx">
                <div>
                  <h6>Profile</h6>
                </div>
              </div>

              <div className="alpha-profile-content">
                <div className="alpha-profile-user-bx">
                  <div className="alpha-user-details">
                    {loading ? (
                      <div className="w-24 h-24 rounded-full bg-[#1a1a1a] animate-pulse" />
                    ) : (
                      <img src={profile?.avatar || "/pic.png"} alt="" style={{ borderRadius: '50%' }} />
                    )}
                    <div>
                      {loading ? (
                        <>
                          <div className="h-6 w-48 bg-[#1a1a1a] rounded animate-pulse mb-2" />
                          <div className="h-4 w-32 bg-[#1a1a1a] rounded animate-pulse" />
                        </>
                      ) : (
                        <>
                          <h4>
                            {profile?.name || username} <RiVerifiedBadgeFill />
                          </h4>
                          <button className="telegram-share-btn">
                            <FaXTwitter style={{ color: "#EBEBEB" }} /> @{profile?.username || username}
                          </button>
                        </>
                      )}
                      <div className="nw-user-info-bx">
                        <div>
                          <h6 className="">wallet address</h6>
                          <p>
                            {loading ? (
                              <div className="h-4 w-32 bg-[#1a1a1a] rounded animate-pulse" />
                            ) : profile?.address ? (
                              <>
                                {`${profile.address.substring(0, 8)}...${profile.address.substring(profile.address.length - 4)}`}
                                <a
                                  href="javascript:void(0)"
                                  className="kol-copy-btn"
                                  style={{ color: "#8F8F8F" }}
                                  onClick={() => navigator.clipboard.writeText(profile.address)}
                                >
                                  <FaRegCopy />
                                </a>
                              </>
                            ) : (
                              "Not Available"
                            )}
                          </p>
                        </div>
                        <div>
                          <div className="position-relative">

                            <button
                              className="subscribe-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDropdown(openDropdown === "subs" ? null : "subs")
                              }}
                            >
                              subscribed <FaStar />
                            </button>

                            <li onClick={(e) => e.stopPropagation()}>
                              <a
                                href="javascript:void(0)"
                                className="plan-btn d-none"
                              >
                                Subscription
                              </a>

                              {/* DROPDOWN */}
                              {openDropdown === "subs" && (
                                <div className="filter-dropdown-menu w-sm filter-mobile-subscription">
                                  {!isSaved &&
                                    <div className="parent-dropdown-content">
                                      <div className="sub-drop-header">
                                        <div className="sub-drop-content">
                                          <h6>Target Profile</h6>
                                          <h4>@CryptoWhale_0</h4>
                                        </div>

                                        <div>
                                          <button className="paper-plan-connect-btn">
                                            <FontAwesomeIcon icon={faPaperPlane} /> Connect
                                          </button>
                                        </div>
                                      </div>

                                      <div className="custom-frm-bx position-relative pt-2">
                                        <label className="nw-label">Trigger Condition</label>

                                        <div
                                          className="form-select cursor-pointer text-start"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTriggerOpen(!triggerOpen)
                                          }}
                                        >
                                          Hotness Score ({hotness})
                                        </div>

                                        {triggerOpen && (
                                          <div
                                            className="subscription-dropdown-menu show w-100 p-3"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="text-center mt-2">
                                              <span className="range-value">{hotness}</span>

                                              <h6 className="mb-0 text-sm">Sensitivity TheresHold</h6>

                                              <input
                                                type="range"
                                                min="0"
                                                max="10"
                                                value={hotness}
                                                onChange={(e) => setHotness(parseInt(e.target.value))}
                                                className="hotness-range"
                                                style={{
                                                  "--range-progress": `${(hotness / 10) * 100}%`,
                                                } as React.CSSProperties}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>



                                      {/* WALLET AMOUNT */}
                                      <div className="custom-frm-bx position-relative">
                                        <label className="nw-label">Wallet Amount</label>

                                        <div
                                          className="form-select cursor-pointer text-start"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setAmountOpen(!amountOpen)
                                          }}
                                        >
                                          {amount}
                                        </div>

                                        {amountOpen && (
                                          <div
                                            className="subscription-dropdown-menu show w-100 p-2"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div
                                              className="subs-items"
                                              onClick={() => {
                                                setAmount("$1K")
                                                setAmountOpen(false)
                                              }}
                                            >
                                              $1K
                                            </div>

                                            <div
                                              className="subs-items"
                                              onClick={() => {
                                                setAmount("$5K")
                                                setAmountOpen(false)
                                              }}
                                            >
                                              $5K
                                            </div>

                                            <input
                                              type="text"
                                              className="form-control mt-2"
                                              placeholder="Custom amount"
                                              value={customAmount}
                                              onChange={(e) => {
                                                setCustomAmount(e.target.value)
                                                setAmount(e.target.value)
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>

                                      {/* CONNECT BUTTON */}
                                      <button
                                        className="connect-wallet-btn"
                                        onClick={() => setIsSaved(true)}
                                      >
                                        <span className="corner top-right"></span>
                                        <span className="corner bottom-left"></span>
                                        Connect
                                      </button>
                                    </div>
                                  }
                                </div>
                              )}

                              {/* SAVED MODAL */}
                              {isSaved && (
                                <div className="config-overlay">
                                  <div className="config-modal">
                                    <h3 className="config-title">CONFIGURATION SAVED</h3>

                                    <div className="config-box">
                                      <div className="config-row">
                                        <span>Target</span>
                                        <span>@CryptoWhale_0</span>
                                      </div>

                                      <div className="config-row">
                                        <span>Min Score</span>
                                        <span className="green">{hotness}</span>
                                      </div>

                                      <div className="config-row">
                                        <span>Min Volume</span>
                                        <span>{amount}</span>
                                      </div>

                                      <div className="config-row">
                                        <span>Status</span>
                                        <span className="green-dot">
                                          Active <i></i>
                                        </span>
                                      </div>
                                    </div>

                                    <button className="close-btn" onClick={() => setIsSaved(false)}>
                                      CLOSE
                                    </button>
                                  </div>
                                </div>
                              )}
                            </li>
                          </div>


                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-7 col-md-7 col-sm-12 new-mobile-spacing">
            <div className="alpha-total-value-bx nw-portfolio-card mobile-portfolio-tatol-crd">
              <div className="total-value-content">
                <h6>Total Value</h6>

                <h4>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-lg-12 new-mobile-spacing">
            {/* Tabs */}
            <div className="d-flex portfolio-tab-container">
              <ul className="nav nav-tabs custom-tabs">
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "portfolio" ? "active" : ""}`}
                    onClick={() => setActiveTab("portfolio")}
                  >
                    portfolio
                  </button>
                </li>

                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "trades" ? "active" : ""}`}
                    onClick={() => setActiveTab("trades")}
                  >
                    recent trades
                  </button>
                </li>
              </ul>
            </div>

            {/* Content */}
            <div className="tab-content custom-tab-content mt-lg-3 mt-sm-0">
              {activeTab === "portfolio" && (
                <>
                  <div className="tab-pane active desktop-tab-panel d-none d-lg-block">
                    <div className="table-responsive crypto-table-responsive">
                      <table className="table crypto-table align-middle mb-0">
                        <thead>
                          <tr>
                            <th>
                              <span className="kol-feed-table-title">asset <HiChevronUpDown /></span>
                            </th>
                            <th>
                              <span className="kol-feed-table-title"> Price <HiChevronUpDown /></span>
                            </th>
                            <th>
                              <span className="kol-feed-table-title">holding <HiChevronUpDown /></span>
                            </th>
                            <th>
                              <span className="kol-feed-table-title"> Value <HiChevronUpDown /></span>
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                              <tr key={`skeleton-${i}`}>
                                <td>
                                  <div className="coin-cell">
                                    <div className="w-6 h-6 rounded-full bg-[#1a1a1a] animate-pulse" />
                                    <div className="h-4 w-12 bg-[#1a1a1a] rounded animate-pulse" />
                                  </div>
                                </td>
                                <td><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /></td>
                              </tr>
                            ))
                          ) : portfolioData.map((asset, idx) => (
                            <tr key={idx}>
                              <td>
                                <div className="coin-cell">
                                  <span className="coin-icon">
                                    <img src={asset.image || DefaultTokenImage} alt="" />
                                  </span>
                                  {asset.symbol}
                                  <span className="">
                                    <button
                                      className="kol-cp-btn"
                                      onClick={() => asset.address && navigator.clipboard.writeText(asset.address)}
                                    >
                                      <FaRegCopy />
                                    </button>
                                  </span>
                                </div>
                              </td>
                              <td>${formatPrice(asset.price)}</td>
                              <td>{formatNumber(asset.value)}</td>
                              <td className="value-up-title">{asset.pnl}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="alpha-powered-by-table">
                        <p>powered by alpha blocks ai</p>
                      </div>
                    </div>
                  </div>

                  <div className="mobile-new-table-container d-lg-none">
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div className="mobile-new-table" key={`skeleton-m-${i}`}>
                          <div className="crypto-box">
                            <div className="crypto-row"><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /><div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" /></div>
                            <div className="crypto-row"><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /><div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" /></div>
                            <div className="crypto-row"><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /><div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" /></div>
                          </div>
                        </div>
                      ))
                    ) : portfolioData.map((asset, idx) => (
                      <div className="mobile-new-table" key={idx}>
                        <div className="crypto-box">
                          <div className="crypto-row crypto-head">
                            <div className="crypto-left">
                              <span className="crypto-title">ASSET</span>
                            </div>
                            <div className="crypto-right crypto-asset">
                              <img src={asset.image || DefaultTokenImage} className="crypto-logo" alt={asset.symbol} />
                              <span className="crypto-name">{asset.symbol}</span>
                              <span className="crypto-copy">
                                <button
                                  className="kol-cp-btn"
                                  onClick={() => asset.address && navigator.clipboard.writeText(asset.address)}
                                >
                                  <FaRegCopy />
                                </button>
                              </span>
                            </div>
                          </div>
                          <div className="crypto-row">
                            <div className="crypto-left">
                              <span className="crypto-title">PRICE</span>
                            </div>
                            <div className="crypto-right">
                              <span className="crypto-data">${formatPrice(asset.price)}</span>
                            </div>
                          </div>
                          <div className="crypto-row">
                            <div className="crypto-left">
                              <span className="crypto-title">HOLDING</span>
                            </div>
                            <div className="crypto-right">
                              <span className="crypto-data">{formatNumber(asset.value)}</span>
                            </div>
                          </div>
                          <div className="crypto-row">
                            <div className="crypto-left">
                              <span className="crypto-title">VALUE</span>
                            </div>
                            <div className="crypto-right">
                              <span className="crypto-profit">{asset.pnl}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="mobile-block">
                      <p>powered by alpha blocks ai</p>
                    </div>
                  </div>


                </>


              )}

              {activeTab === "trades" && (

                <>
                  <div className="tab-pane active desktop-tab-panel d-none d-lg-block">
                    <div className="table-responsive crypto-table-responsive">
                      <table className="table crypto-table align-middle mb-0">
                        <thead>
                          <tr>

                            <th><span className="kol-feed-table-title">Type <HiChevronUpDown /> </span></th>
                            <th><span className="kol-feed-table-title">Token <HiChevronUpDown /> </span></th>
                            <th><span className="kol-feed-table-title justify-between"><span className="d-flex align-items-center">Market cap <HiChevronUpDown /> </span><a href="javascript:void(0)" className=" usd-reload-btn"><TfiReload /></a>  </span> </th>
                            <th><span className="kol-feed-table-title">amount <HiChevronUpDown /></span> </th>
                            <th><span className="kol-feed-table-title justify-between"><span className="d-flex align-items-center">total <HiChevronUpDown /></span> <a href="javascript:void(0)" className=" usd-reload-btn"> usd <TfiReload /></a> </span></th>
                            <th> <span className="kol-feed-table-title">PnL <HiChevronUpDown /> </span></th>
                            <th><span className="kol-feed-table-title">age <HiChevronUpDown /> </span></th>

                          </tr>
                        </thead>

                        <tbody>
                          {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                              <tr key={`skeleton-tx-${i}`}>
                                <td><div className="h-4 w-12 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td>
                                  <div className="coin-cell">
                                    <div className="w-6 h-6 rounded-full bg-[#1a1a1a] animate-pulse" />
                                    <div className="h-4 w-12 bg-[#1a1a1a] rounded animate-pulse" />
                                  </div>
                                </td>
                                <td><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td><div className="h-4 w-12 bg-[#1a1a1a] rounded animate-pulse" /></td>
                                <td><div className="h-4 w-12 bg-[#1a1a1a] rounded animate-pulse" /></td>
                              </tr>
                            ))
                          ) : transactions.map((tx, idx) => {
                            const isBuy = tx.type === "buy" || (tx.type === "both" && tx.bothType?.[0]?.buyType)
                            const token = isBuy ? tx.transaction?.tokenOut : tx.transaction?.tokenIn
                            return (
                              <tr key={idx}>
                                <td>
                                  <span className={isBuy ? "up-trade" : "down-trade"}>{tx.type.toUpperCase()}</span>
                                </td>
                                <td>
                                  <div className="coin-cell">
                                    <span className="coin-icon">
                                      <img src={(isBuy ? tx.outTokenURL : tx.inTokenURL) || DefaultTokenImage} alt="" />
                                    </span>
                                    {token?.symbol}
                                    <span className="">
                                      <button
                                        className="kol-cp-btn"
                                        onClick={() => token?.address && navigator.clipboard.writeText(token.address)}
                                      >
                                        <FaRegCopy />
                                      </button>
                                    </span>
                                  </div>
                                </td>
                                <td>${formatNumber(isBuy ? tx.marketCap?.buyMarketCap : tx.marketCap?.sellMarketCap)}</td>
                                <td>{formatNumber(isBuy ? tx.tokenAmount?.buyTokenAmount : tx.tokenAmount?.sellTokenAmount)}</td>
                                <td>${formatNumber(isBuy ? tx.amount?.buyAmount : tx.amount?.sellAmount)}</td>
                                <td className={tx.hotnessScore > 5 ? "value-up-title" : "value-down-title"}>
                                  {tx.hotnessScore > 5 ? "+12%" : "+5%"}
                                </td>
                                <td><span className="age-title">{formatAge(tx.timestamp)}</span></td>
                              </tr>
                            )
                          })}




                        </tbody>
                      </table>
                      <div className="alpha-powered-by-table">
                        <p>powered by alpha blocks ai</p>
                      </div>
                    </div>
                  </div>

                  <div className="mobile-new-table-container d-lg-none">
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div className="mobile-new-table" key={`skeleton-tx-m-${i}`}>
                          <div className="crypto-box">
                            <div className="crypto-row"><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /><div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" /></div>
                            <div className="crypto-row"><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /><div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" /></div>
                            <div className="crypto-row"><div className="h-4 w-16 bg-[#1a1a1a] rounded animate-pulse" /><div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" /></div>
                          </div>
                        </div>
                      ))
                    ) : transactions.map((tx, idx) => {
                      const isBuy = tx.type === "buy" || (tx.type === "both" && tx.bothType?.[0]?.buyType)
                      const token = isBuy ? tx.transaction?.tokenOut : tx.transaction?.tokenIn
                      return (
                        <div className="mobile-new-table" key={idx}>
                          <div className="crypto-box">
                            <div className="crypto-row">
                              <div className="crypto-left">
                                <span className="crypto-title">type</span>
                              </div>
                              <div className="crypto-right">
                                <span className={isBuy ? "up-trade" : "down-trade"}>{tx.type.toUpperCase()}</span>
                              </div>
                            </div>
                            <div className="crypto-row crypto-head">
                              <div className="crypto-left">
                                <span className="crypto-title">token</span>
                              </div>
                              <div className="crypto-right crypto-asset">
                                <img src={(isBuy ? tx.outTokenURL : tx.inTokenURL) || DefaultTokenImage} className="crypto-logo" alt={token?.symbol} />
                                <span className="crypto-name">{token?.symbol}</span>
                                <span className="crypto-copy">
                                  <button
                                    className="kol-cp-btn"
                                    onClick={() => token?.address && navigator.clipboard.writeText(token.address)}
                                  >
                                    <FaRegCopy />
                                  </button>
                                </span>
                              </div>
                            </div>
                            <div className="crypto-row">
                              <div className="crypto-left">
                                <span className="crypto-title d-flex gap-1">market cap <a href="javascript:void(0)" className=" usd-reload-btn"><TfiReload /></a></span>
                              </div>
                              <div className="crypto-right">
                                <span className="crypto-data">${formatNumber(isBuy ? tx.marketCap?.buyMarketCap : tx.marketCap?.sellMarketCap)}</span>
                              </div>
                            </div>
                            <div className="crypto-row">
                              <div className="crypto-left">
                                <span className="crypto-title">amount</span>
                              </div>
                              <div className="crypto-right">
                                <span className="crypto-data">{formatNumber(isBuy ? tx.tokenAmount?.buyTokenAmount : tx.tokenAmount?.sellTokenAmount)}</span>
                              </div>
                            </div>
                            <div className="crypto-row">
                              <div className="crypto-left">
                                <span className="crypto-title d-flex gap-1">total  <a href="javascript:void(0)" className=" usd-reload-btn"> usd <TfiReload /></a></span>
                              </div>
                              <div className="crypto-right">
                                <span className="crypto-data">${formatNumber(isBuy ? tx.amount?.buyAmount : tx.amount?.sellAmount)}</span>
                              </div>
                            </div>
                            <div className="crypto-row">
                              <div className="crypto-left">
                                <span className="crypto-title">pnl</span>
                              </div>
                              <div className="crypto-right">
                                <span className={tx.hotnessScore > 5 ? "crypto-profit" : "value-down-title"}>
                                  {tx.hotnessScore > 5 ? "+12%" : "+5%"}
                                </span>
                              </div>
                            </div>
                            <div className="crypto-row">
                              <div className="crypto-left">
                                <span className="crypto-title">age</span>
                              </div>
                              <div className="crypto-right">
                                <span className="age-ago-data">{formatAge(tx.timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div className="mobile-block">
                      <p>powered by alpha blocks ai</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default KolFeedProfile
