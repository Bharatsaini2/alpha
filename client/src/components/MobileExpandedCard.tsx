import React from "react"
import { TopCoin, TopKolCoin, Trade } from "../lib/types"
import { formatNumber } from "../utils/FormatNumber"
import { FaRegCopy } from "react-icons/fa6"
import DefaultTokenImage from "../assets/default_token.svg"
import { HiChevronUpDown } from "react-icons/hi2"

export interface ExtendedTrade extends Trade {
  marketCap?: number
}

interface MobileExpandedCardProps {
  coin: TopCoin | TopKolCoin
  timeframe: string
  trades: ExtendedTrade[]
  onCopyAddress: (address: string) => void
  onQuickBuy: (coin: TopCoin | TopKolCoin) => void
  title?: string
}

const MobileExpandedCard: React.FC<MobileExpandedCardProps> = ({
  coin,
  timeframe,
  trades,
  onCopyAddress,
  onQuickBuy,
  title = "ACTIVITY",
}) => {
  const formatTimeAgo = (timestamp: string) => {
    const diff = new Date().getTime() - new Date(timestamp).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}S`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}M`
    return `${Math.floor(seconds / 3600)}H`
  }

  return (
    <div
      className="mobile-expanded-card"
      style={{
        backgroundColor: "#000000",
        color: "#ffffff",
        fontFamily: "'IBM Plex Mono', monospace",
        marginTop: "0",
        paddingTop: "0",
      }}
    >
      {/* Section Header */}
      <div
        className="d-flex align-items-center mb-3"
        style={{
          borderTop: "1px solid #333",
          padding: "16px 16px 8px",
        }}
      >
        <span
          style={{
            color: "#8F8F8F",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {title} LAST {timeframe}
        </span>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        {/* Token Info Section */}
        <div className="d-flex mb-4" style={{ gap: "12px" }}>
          {/* Token Image - Large Square */}
          <div
            style={{
              width: "110px",
              height: "110px",
              minWidth: "110px",
              backgroundColor: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #222",
            }}
          >
            <img
              src={coin.imageUrl || DefaultTokenImage}
              alt={coin.symbol}
              style={{
                width: "55px",
                height: "55px",
                objectFit: "contain",
              }}
            />
          </div>

          {/* Token Details */}
          <div
            className="d-flex flex-column justify-content-center align-items-start flex-grow-1"
            style={{ height: "110px", gap: "6px" }}
          >
            <div
              className="fw-bold text-white text-truncate"
              style={{
                fontSize: "16px",
                letterSpacing: "0.5px",
                maxWidth: "180px",
                lineHeight: "1.2",
                marginBottom: "0",
                textAlign: "left",
              }}
            >
              {coin.name.toUpperCase()}
            </div>
            <div
              className="text-truncate"
              style={{
                color: "#8F8F8F",
                fontSize: "13px",
                lineHeight: "1.2",
                maxWidth: "180px",
                marginBottom: "0",
                textAlign: "left",
              }}
            >
              ${coin.symbol}
            </div>
            <div
              className="d-flex align-items-center gap-2"
              style={{
                color: "#8F8F8F",
                fontSize: "12px",
                fontFamily: "monospace",
                lineHeight: "1.2",
                marginBottom: "0",
              }}
            >
              <span>
                {coin.tokenAddress.slice(0, 8)}...
                {coin.tokenAddress.slice(-4)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCopyAddress(coin.tokenAddress)
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#8F8F8F",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <FaRegCopy size={12} />
              </button>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                onQuickBuy(coin)
              }}
              style={{
                background: "transparent",
                border: "1px solid #666",
                color: "#fff",
                fontSize: "12px",
                padding: "6px 12px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                width: "fit-content",
                marginBottom: "0",
              }}
            >
              QUICK BUY
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="mb-4 d-flex flex-column gap-2">
          {/* Total Buys */}
          <div className="d-flex justify-content-between align-items-center">
            <span
              style={{
                color: "#8F8F8F",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              TOTAL BUYS:
            </span>
            <div className="d-flex align-items-center gap-2">
              <span
                style={{
                  color: "#13904E",
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              >
                +{formatNumber(coin.totalBuys)}
              </span>
              <span style={{ color: "#fff", fontSize: "13px" }}>
                ({coin.buyCount})
              </span>
            </div>
          </div>

          {/* Total Sells */}
          <div className="d-flex justify-content-between align-items-center">
            <span
              style={{
                color: "#8F8F8F",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              TOTAL SELLS:
            </span>
            <div className="d-flex align-items-center gap-2">
              <span
                style={{
                  color: "#DF2A4E",
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              >
                -{formatNumber(coin.totalSells)}
              </span>
              <span style={{ color: "#fff", fontSize: "13px" }}>
                ({coin.sellCount})
              </span>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: "1px",
              backgroundColor: "#333",
              margin: "4px 0",
            }}
          />

          {/* Net Inflow */}
          <div className="d-flex justify-content-between align-items-center">
            <span
              style={{
                color: "#fff", // White/Bright based on image
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontWeight: "500",
              }}
            >
              NET INFLOW:
            </span>
            <div className="d-flex align-items-center gap-2">
              <span
                style={{
                  color: coin.netInflow >= 0 ? "#13904E" : "#DF2A4E",
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              >
                {coin.netInflow >= 0 ? "" : ""}
                {formatNumber(coin.netInflow)}
              </span>
              <span style={{ color: "#fff", fontSize: "13px" }}>
                ({coin.buyCount + coin.sellCount})
              </span>
            </div>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="transaction-list">
          {/* Header */}
          <div
            className="d-flex align-items-center mb-2 pb-2"
            style={{
              borderBottom: "1px solid #333",
              color: "#8F8F8F",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            <div
              style={{ width: "20%", cursor: "pointer" }}
              className="d-flex align-items-center gap-1"
            >
              TYPE <HiChevronUpDown size={10} />
            </div>
            <div
              style={{ width: "35%", cursor: "pointer" }}
              className="d-flex align-items-center gap-1"
            >
              MAKER <HiChevronUpDown size={10} />
            </div>
            <div
              style={{ width: "25%", textAlign: "right", cursor: "pointer" }}
              className="d-flex align-items-center justify-content-end gap-1"
            >
              USD <HiChevronUpDown size={10} />
            </div>
            <div
              style={{ width: "20%", textAlign: "right", cursor: "pointer" }}
              className="d-flex align-items-center justify-content-end gap-1"
            >
              MC <HiChevronUpDown size={10} />
            </div>
          </div>

          {/* Rows */}
          {trades.length === 0 ? (
            <div
              className="text-center py-4"
              style={{ color: "#8F8F8F", fontSize: "12px" }}
            >
              No recent transactions
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {trades.map((trade, idx) => (
                <div key={idx} className="d-flex align-items-start">
                  {/* TYPE */}
                  <div
                    style={{ width: "20%" }}
                    className="d-flex align-items-center gap-2"
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "transparent",
                        border: `1px solid ${trade.type === "buy" ? "#13904E" : "#DF2A4E"}`,
                        color: trade.type === "buy" ? "#13904E" : "#DF2A4E",
                        fontSize: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {trade.type === "buy" ? "B" : "S"}
                    </div>
                    <span
                      style={{
                        color: trade.type === "buy" ? "#13904E" : "#DF2A4E",
                        fontSize: "11px",
                        fontFamily: "monospace",
                      }}
                    >
                      {formatTimeAgo(trade.timestamp)}
                    </span>
                  </div>

                  {/* MAKER */}
                  <div style={{ width: "35%" }} className="d-flex flex-column">
                    <span
                      className="text-white text-truncate"
                      style={{ fontSize: "11px", letterSpacing: "0.5px" }}
                    >
                      {/* Using a placeholder name logic or truncated address if name not avail */}
                      {trade.whaleAddress ? "Whale" : "Unknown"}
                    </span>
                    <span
                      style={{
                        color: "#666",
                        fontSize: "10px",
                        fontFamily: "monospace",
                      }}
                    >
                      ({trade.whaleAddress.slice(0, 3)}...
                      {/* trade.whaleAddress.slice(-3) */})
                    </span>
                  </div>

                  {/* USD */}
                  <div style={{ width: "25%", textAlign: "right" }}>
                    <span
                      style={{
                        color: trade.type === "buy" ? "#13904E" : "#DF2A4E",
                        fontSize: "11px",
                        fontFamily: "monospace",
                      }}
                    >
                      ${formatNumber(trade.amount)}
                    </span>
                  </div>

                  {/* MC */}
                  <div style={{ width: "20%", textAlign: "right" }}>
                    <span
                      style={{
                        color: "#fff",
                        fontSize: "11px",
                        fontFamily: "monospace",
                      }}
                    >
                      {trade.marketCap
                        ? formatNumber(trade.marketCap)
                        : formatNumber(coin.marketCap)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MobileExpandedCard
