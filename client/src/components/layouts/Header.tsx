import { useState, useEffect, useRef } from "react"
import { Menu, TrendingUp, TrendingDown } from "lucide-react"
import axios from "axios"
import FlashImg from "../../assets/Vector.svg"

const BASE_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

interface HeaderProps {
  onMenuToggle: () => void
}

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
  marketcapChange5m: number
  lastMarketcapUpdate: string
  isLiveData: boolean
}

// Token card component for reuse
const TokenCard = ({ token, formatPrice, formatChange }: {
  token: TrendingToken
  formatPrice: (price: number) => string
  formatChange: (change: number) => string
}) => (
  <div
    className="trending-token-card"
    onClick={() => {
      window.open(
        `https://dexscreener.com/solana/${token.address}`,
        "_blank"
      )
    }}
  >
    <span className="token-rank">#{token.rank}</span>
    <div className="token-logo-container">
      {token.logoURI ? (
        <img
          src={token.logoURI}
          alt={token.symbol}
          className="token-logo"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = "none"
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = "flex"
            }
          }}
        />
      ) : null}
      <div className="token-logo-fallback" style={{ display: token.logoURI ? 'none' : 'flex' }}>
        {token.symbol.charAt(0)}
      </div>
    </div>
    <span className="token-symbol">{token.symbol}</span>
    <span className="token-price">{formatPrice(token.marketcap)}</span>
    <div className={`token-change ${token.volume24hChangePercent >= 0 ? 'positive' : 'negative'}`}>
      {token.volume24hChangePercent > 0 ? (
        <TrendingUp className="change-icon" />
      ) : (
        <TrendingDown className="change-icon" />
      )}
      <span>{formatChange(token.volume24hChangePercent)}</span>
    </div>
  </div>
)

const Header = ({ onMenuToggle }: HeaderProps) => {
  const [trendingTokens, setTrendingTokens] = useState<TrendingToken[]>([])
  const [loading, setLoading] = useState(true)
  const marqueeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchTrendingTokens()
    const interval = setInterval(fetchTrendingTokens, 6 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchTrendingTokens = async () => {
    try {
      setLoading(true)
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
    return `$${price.toFixed(2)}`
  }

  const formatChange = (change: number) => {
    const sign = change >= 0 ? "+" : ""
    return `${sign}${change.toFixed(1)}%`
  }

  return (
    <>
      <style>{`
        .trending-marquee-container {
          position: relative;
          overflow: hidden;
          flex-grow: 1;
          mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
        }

        .trending-marquee-track {
          display: flex;
          width: max-content;
          animation: scroll-marquee 40s linear infinite;
        }

        .trending-marquee-track:hover {
          animation-play-state: paused;
        }

        @keyframes scroll-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .trending-token-card {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin: 0 6px;
          background: #1a1a1c;
          border: 1px solid #3B3B3B;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .trending-token-card:hover {
          background: #2B2B2D;
          border-color: #4B4B4D;
        }

        .token-rank {
          color: rgba(255, 255, 255, 0.6);
          font-size: 12px;
          font-weight: 600;
          min-width: 24px;
        }

        .token-logo-container {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .token-logo {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          object-fit: cover;
        }

        .token-logo-fallback {
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #f97316, #ea580c);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 10px;
          font-weight: bold;
        }

        .token-symbol {
          color: rgba(255, 255, 255, 0.9);
          font-size: 13px;
          font-weight: 500;
        }

        .token-price {
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
        }

        .token-change {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .token-change.positive {
          color: #4ade80;
        }

        .token-change.negative {
          color: #f87171;
        }

        .token-change .change-icon {
          width: 14px;
          height: 14px;
        }

        .trending-label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 500;
          margin-right: 16px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .trending-label img {
          width: 18px;
          height: 18px;
        }

        @media (max-width: 640px) {
          .trending-label span {
            display: none;
          }
        }
      `}</style>

      <header className="bg-red-500 border-b border-[#2B2B2D] px-4 py-3 lg:px-6 overflow-hidden">
        <div className="flex items-center">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg bg-[#2B2B2D] hover:bg-[#1B1B1D] transition-colors mr-3 flex-shrink-0"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>

          {/* Trending Label */}
          <div className="trending-label">
            <img src={FlashImg} alt="Flash" />
            <span>{loading ? "Loading..." : "Trending Coins:"}</span>
          </div>

          {/* Marquee Container */}
          <div className="trending-marquee-container">
            {!loading && trendingTokens.length > 0 && (
              <div className="trending-marquee-track" ref={marqueeRef}>
                {/* First set of tokens */}
                {trendingTokens.map((token, index) => (
                  <TokenCard
                    key={`first-${token.address}-${index}`}
                    token={token}
                    formatPrice={formatPrice}
                    formatChange={formatChange}
                  />
                ))}
                {/* Duplicate set for seamless loop */}
                {trendingTokens.map((token, index) => (
                  <TokenCard
                    key={`second-${token.address}-${index}`}
                    token={token}
                    formatPrice={formatPrice}
                    formatChange={formatChange}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  )
}

export default Header
