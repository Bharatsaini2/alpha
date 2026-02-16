import React, { useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faPaperPlane,
  faCheck,
  faClose,
} from "@fortawesome/free-solid-svg-icons"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import MarketCapRangeSlider from "../../components/MarketCapRangeSlider"

interface KOLAlertPopupProps {
  hotness: number
  setHotness: (value: number) => void
  amount: string
  setAmount: (value: string) => void
  onActivate: () => void
  isSaved: boolean
  setIsSaved: (value: boolean) => void
  user: any
  onClose: () => void
  minMarketCap: number
  setMinMarketCap: (value: number) => void
  maxMarketCap: number
  setMaxMarketCap: (value: number) => void
  formatMarketCap: (value: number) => string
  sliderToMarketCap: (value: number) => number
  marketCapToSlider: (value: number) => number
}

const KOLAlertPopup: React.FC<KOLAlertPopupProps> = ({
  hotness,
  setHotness,
  amount,
  setAmount,
  onActivate,
  isSaved,
  setIsSaved,
  user,
  onClose,
  minMarketCap,
  setMinMarketCap,
  maxMarketCap,
  setMaxMarketCap,
  formatMarketCap,
}) => {
  const { wallet, connect } = useWalletConnection()
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [amountOpen, setAmountOpen] = useState(false)
  const [mcapOpen, setMcapOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState("")

  return (
    <div
      className="filter-dropdown-menu w-sm filter-mobile-subscription"
      onClick={(e) => e.stopPropagation()}
    >
      {!isSaved && (
        <div className="parent-dropdown-content">
          <div className="sub-drop-header">
            <div className="sub-drop-content">
              <h6>System Config</h6>
              <h4>KOL Feed Alerts</h4>
            </div>

            <div>
              <button
                className="paper-plan-connect-btn"
                disabled // purely visual in the reference, but we can make it clickable if needed. Reference had it mostly static/status indicator
              >
                <FontAwesomeIcon icon={faPaperPlane} />{" "}
                {user?.telegramChatId ? "Connected" : "Connect"}
              </button>
            </div>
            <button
              className="popup-close-btn"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
            >
              <FontAwesomeIcon icon={faClose} />
            </button>
          </div>

          <div className="custom-frm-bx position-relative">
            <label className="nw-label">Trigger Condition</label>
            <div
              className="form-select cursor-pointer text-start"
              onClick={(e) => {
                e.stopPropagation()
                if (!triggerOpen) {
                  setAmountOpen(false)
                  setMcapOpen(false)
                }
                setTriggerOpen(!triggerOpen)
              }}
            >
              Hotness Score ({hotness})
            </div>

            {triggerOpen && (
              <div
                className="subscription-dropdown-menu show w-100"
                onClick={(e) => e.stopPropagation()}
                style={{ padding: "8px 12px" }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    className="range-value-mcap"
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  >
                    {hotness}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#8f8f8f",
                      marginBottom: "8px",
                    }}
                  >
                    Sensitivity Threshold
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={hotness}
                    onChange={(e) => setHotness(Number(e.target.value))}
                    className="hotness-range hotness-range-mcap"
                    style={
                      {
                        width: "100%",
                        "--range-progress": `${(hotness / 10) * 100}%`,
                      } as React.CSSProperties
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="custom-frm-bx position-relative">
            <label className="nw-label">Wallet Amount</label>
            <div
              className="form-select cursor-pointer text-start"
              onClick={(e) => {
                e.stopPropagation()
                if (!amountOpen) {
                  setTriggerOpen(false)
                  setMcapOpen(false)
                }
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
                {["$1K", "$2K", "$3K", "$4K", "$5K"].map((val) => (
                  <div
                    key={val}
                    className="subs-items"
                    onClick={() => {
                      setAmount(val)
                      setAmountOpen(false)
                    }}
                  >
                    {val}
                  </div>
                ))}

                <div className="position-relative mt-2">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Custom amount"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value)
                      setAmount(e.target.value)
                    }}
                    style={{ paddingRight: "30px" }}
                  />
                  {customAmount && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="position-absolute"
                      style={{
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#28a745", // Green color
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="custom-frm-bx position-relative">
            <label className="nw-label">Market Cap</label>
            <div
              className="form-select cursor-pointer text-start"
              onClick={(e) => {
                e.stopPropagation()
                if (!mcapOpen) {
                  setTriggerOpen(false)
                  setAmountOpen(false)
                }
                setMcapOpen(!mcapOpen)
              }}
            >
              {formatMarketCap(minMarketCap)} - {formatMarketCap(maxMarketCap)}
            </div>

            {mcapOpen && (
              <div
                className="subscription-dropdown-menu show w-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MarketCapRangeSlider
                  minValue={minMarketCap}
                  maxValue={maxMarketCap}
                  onChange={(min, max) => {
                    setMinMarketCap(min)
                    setMaxMarketCap(max)
                  }}
                />
              </div>
            )}
          </div>

          <button
            className="connect-wallet-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (!wallet?.connected) {
                connect()
              } else {
                onActivate()
              }
            }}
            style={{ marginTop: "16px", backgroundColor: "#162ECD" }}
          >
            {!wallet?.connected
              ? "Connect"
              : user?.telegramChatId
                ? "Activate"
                : "Connect"}
            <span className="corner top-right"></span>
            <span className="corner bottom-left"></span>
          </button>
        </div>
      )}

      {isSaved && (
        <div className="config-overlay">
          <div className="config-modal">
            <h3 className="config-title">CONFIGURATION SAVED</h3>

            <div className="config-box">
              <div className="config-row">
                <span>Feed Type</span>
                <span>Kol Feed</span>
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
                <span>Market Cap</span>
                <span>{formatMarketCap(minMarketCap)} - {formatMarketCap(maxMarketCap)}</span>
              </div>

              <div className="config-row">
                <span>Status</span>
                <span className="green-dot">
                  Active <i></i>
                </span>
              </div>
            </div>

            <button
              className="close-btn"
              onClick={() => {
                setIsSaved(false)
                onClose()
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default KOLAlertPopup
