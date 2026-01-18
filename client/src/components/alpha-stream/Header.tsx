import { useState, useEffect, useRef } from "react"
import { IoMdTrendingUp, IoMdTrendingDown } from "react-icons/io"
import { HiChevronUpDown } from "react-icons/hi2"
import { User, LogOut } from "lucide-react"
import axios from "axios"
import { useAuth } from "../../contexts/AuthContext"
import {
  faChevronDown,
  faChevronUp,
  faClose,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { PiPlugsConnected } from "react-icons/pi"
import { FaRegUserCircle } from "react-icons/fa"
import { RiTelegram2Fill } from "react-icons/ri"
import { Link } from "react-router-dom"
import { FaBars } from "react-icons/fa"

const BASE_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

interface TrendingToken {
  address: string
  rank: number
  name: string
  symbol: string
  logoURI: string
  volume24hChangePercent: number
  price: number
  price24hChangePercent: number
  volume24hUSD: number
  marketcap: number
}

function Header({ setMobileSidebar }) {
  const [trendingTokens, setTrendingTokens] = useState<TrendingToken[]>([])
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { user, isAuthenticated, logout, openLoginModal } = useAuth()
  const { wallet, disconnect } = useWalletConnection()
  const { showToast } = useToast()

  useEffect(() => {
    fetchTrendingTokens()
    const interval = setInterval(fetchTrendingTokens, 5 * 60 * 1000) // Refresh every 5 mins
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchTrendingTokens = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/trending-tokens?limit=20`)
      const data = response.data
      if (data.success && data.data.tokens) {
        setTrendingTokens(data.data.tokens)
      }
    } catch (error) {
      console.error("Error fetching trending tokens:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number) => {
    if (price >= 1000000000) return `$${(price / 1000000000).toFixed(1)}B`
    if (price >= 1000000) return `$${(price / 1000000).toFixed(1)}M`
    if (price >= 1000) return `$${(price / 1000).toFixed(1)}K`
    if (price >= 1) return `$${price.toFixed(2)}`
    if (price >= 0.01) return `$${price.toFixed(3)}`
    return `$${price.toFixed(6)}`
  }

  const formatChange = (change: number) => {
    const sign = change >= 0 ? "+" : ""
    return `${sign}${change.toFixed(1)}%`
  }

  const getDisplayName = () => {
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split("@")[0]
    if (user?.walletAddress)
      return `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`
    return "User"
  }

  const TokenCard = ({ token }: { token: TrendingToken }) => (
    <div
      className="file-icon-bx"
      onClick={() =>
        window.open(`https://dexscreener.com/solana/${token.address}`, "_blank")
      }
      style={{ cursor: "pointer" }}
    >
      <div className="file-pic">
        <span className="file-item-first">#{token.rank}</span>
        {token.logoURI ? (
          <img
            src={token.logoURI}
            alt={token.symbol}
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
            style={{ width: "24px", height: "24px", borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f97316, #ea580c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "10px",
              fontWeight: "bold",
            }}
          >
            {token.symbol.charAt(0)}
          </div>
        )}
        <h6 className="header-cell-title">{token.symbol}</h6>
        <h4 className="cell-amount-title">{formatPrice(token.marketcap)}</h4>
        <span
          className={`trade-bazar ${token.volume24hChangePercent >= 0 ? "" : "negative"}`}
        >
          {token.volume24hChangePercent >= 0 ? (
            <IoMdTrendingUp />
          ) : (
            <IoMdTrendingDown />
          )}
          {formatChange(token.volume24hChangePercent)}
        </span>
      </div>
    </div>
  )

  const [showMore, setShowMore] = useState(false)
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <style>{`
                .marquee-container {
                    overflow: hidden;
                    flex: 1;
                    mask-image: linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent);
                    -webkit-mask-image: linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent);
                }
                .marquee-track {
                    display: flex;
                    width: max-content;
                    animation: scroll-marquee 30s linear infinite;
                    gap : 8px;
                }
                .marquee-track:hover {
                    animation-play-state: paused;
                }
                @keyframes scroll-marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .trade-bazar.negative {
                    color: #f87171 !important;
                }
                .user-dropdown {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 4px;
                    background: #0a0a0a;
                    border: 1px solid #3D3D3D;
                    border-radius: 0px;
                    min-width: 180px;
                    z-index: 1000;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }
                .user-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    color: #EBEBEB;
                    font-size: 12px;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .user-dropdown-item:hover {
                    background: #2B2B2D;
                }
                .user-dropdown-divider {
                    height: 1px;
                    background: #3D3D3D;
                    margin: 0px;
                }
            `}</style>

      <header className="header">
        <div className="coins" style={{ flex: 1, overflow: "hidden" }}>
          <span className="trading-icon-title">TRENDING COINS:</span>

          {loading ? (
            <span style={{ color: "#8F8F8F", marginLeft: "12px" }}>
              Loading...
            </span>
          ) : trendingTokens.length > 0 ? (
            <div className="marquee-container">
              <div className="marquee-track">
                {/* First set */}
                {trendingTokens.map((token, index) => (
                  <TokenCard
                    key={`first-${token.address}-${index}`}
                    token={token}
                  />
                ))}
                {/* Duplicate for seamless loop */}
                {trendingTokens.map((token, index) => (
                  <TokenCard
                    key={`second-${token.address}-${index}`}
                    token={token}
                  />
                ))}
              </div>
            </div>
          ) : (
            <span style={{ color: "#8F8F8F", marginLeft: "12px" }}>
              No trending coins
            </span>
          )}
        </div>
        <div className="tp-header-bx" style={{ flexShrink: 0 }}>
          {/* <button className="connect-btn " onClick={() => setShowModal(true)}>Connect</button> */}

          {isAuthenticated && user ? (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                className="nw-connected-btn"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt="User"
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                    }}
                  />
                ) : (
                  <span
                    className="change-color"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "20px",
                      height: "20px",
                    }}
                  >
                    <User size={14} />
                  </span>
                )}
                {getDisplayName()} <HiChevronUpDown />
              </button>

              {showDropdown && (
                <div className="user-dropdown">
                  {user.email && (
                    <div
                      className="user-dropdown-item"
                      style={{ color: "#8F8F8F", cursor: "default" }}
                    >
                      {user.email}
                    </div>
                  )}
                  {user.walletAddress && (
                    <div
                      className="user-dropdown-item"
                      style={{ color: "#8F8F8F", cursor: "default" }}
                    >
                      {`${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`}
                    </div>
                  )}
                  <div className="user-dropdown-divider" />

                  <div className="user-dropdown-item">
                    <Link to="/profile-page" className="profile-navlink">
                      {" "}
                      <FaRegUserCircle size={14} />
                      Profile{" "}
                    </Link>
                  </div>
                  <div className="user-dropdown-divider" />

                  <div className="user-dropdown-item">
                    <Link
                      to="/telegram-subscription"
                      className="profile-navlink"
                    >
                      {" "}
                      <RiTelegram2Fill size={14} />
                      Telegram Subscription{" "}
                    </Link>
                  </div>
                  <div className="user-dropdown-divider" />

                  {/* Only show Connect option if wallet is NOT connected but user IS logged in (e.g. email) */}
                  {!wallet.connected && (
                    <>
                      <div
                        className="user-dropdown-item"
                        onClick={() => openLoginModal()}
                      >
                        <PiPlugsConnected size={14} />
                        Connect Wallet
                      </div>
                      <div className="user-dropdown-divider" />
                    </>
                  )}

                  <div className="user-dropdown-divider" />
                  <div
                    className="user-dropdown-item"
                    onClick={() => {
                      setShowDropdown(false)
                      logout()
                    }}
                  >
                    <LogOut size={14} />
                    Logout
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button className="connect-btn" onClick={() => openLoginModal()}>
              CONNECT
            </button>
          )}
        </div>

        <button
          className="mobile-sidebar-btn text-white"
          onClick={() => {
            setMobileSidebar(true)
          }}
        >
          <FaBars />
        </button>
      </header>

      {showModal && (
        <div className="modal fade show d-block" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content nw-sign-frm p-0">
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowModal(false)}
              >
                <FontAwesomeIcon icon={faClose} />
              </button>

              <div className="modal-body">
                <div className="row">
                  <div className="col-lg-12">
                    <div className="login-frm-bx">
                      <div className="text-center d-flex flex-column justify-content-center align-items-center">
                        <img src="/logos.png" alt="" />
                        <h6>Connect your wallet</h6>
                      </div>
                      <div className="mb-2">
                        <button className="nw-connect-wallet-btn">
                          <img src="/phantom.svg" alt="" /> Phantom
                          <span className="nw-corner nw-top-right"></span>
                          <span className="nw-corner nw-bottom-left"></span>
                        </button>
                      </div>

                      <div className="mt-3">
                        <div className="mb-3 text-center">
                          <a
                            className="see-more-btn"
                            onClick={() => setShowMore(!showMore)}
                          >
                            {showMore ? (
                              <>
                                See less wallets{" "}
                                <FontAwesomeIcon icon={faChevronUp} />
                              </>
                            ) : (
                              <>
                                See more wallets{" "}
                                <FontAwesomeIcon icon={faChevronDown} />
                              </>
                            )}
                          </a>
                        </div>

                        {showMore && (
                          <>
                            <div className="mb-2">
                              <button className="nw-connect-wallet-btn">
                                <img src="/phantom.svg" alt="" /> Phantom
                                <span className="nw-corner nw-top-right"></span>
                                <span className="nw-corner nw-bottom-left"></span>
                              </button>
                            </div>

                            <div className="mb-2">
                              <button className="nw-connect-wallet-btn">
                                <img src="/Solflare.svg" alt="" /> Solflare
                                <span className="nw-corner nw-top-right"></span>
                                <span className="nw-corner nw-bottom-left"></span>
                              </button>
                            </div>

                            <div className="mb-2">
                              <button className="nw-connect-wallet-btn">
                                <img src="/coinbase.svg" alt="" /> Coinbase
                                Wallet
                                <span className="nw-corner nw-top-right"></span>
                                <span className="nw-corner nw-bottom-left"></span>
                              </button>
                            </div>

                            <div className="mb-2">
                              <button className="nw-connect-wallet-btn">
                                <img src="/magic.svg" alt="" /> Magic Eden
                                Wallet
                                <span className="nw-corner nw-top-right"></span>
                                <span className="nw-corner nw-bottom-left"></span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && <div className="modal-backdrop fade show"></div>}
    </>
  )
}

export default Header
