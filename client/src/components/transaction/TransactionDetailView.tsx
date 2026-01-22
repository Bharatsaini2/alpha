import React from "react"
import { ArrowLeft, ArrowRightLeft, ExternalLink, Copy, TrendingUp, TrendingDown } from "lucide-react"
import { useNavigate } from "react-router-dom"
import "../../css/TransactionDetail.css"
import solanalogo from "../../assets/solana.svg"
import DefaultTokenImage from "../../assets/default_token.svg"
import { faCircleXmark } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { TfiReload } from "react-icons/tfi"

import { FaArrowRightLong } from "react-icons/fa6"

interface PriceDisplay {
    value: string
    unit: string
    label: string
}

interface AmountDisplay {
    value: string
    currency: string
    symbol: string
}

interface TransactionData {
    _id: string
    signature: string
    transaction: {
        tokenIn: {
            symbol: string
            name: string
            address: string
            amount: string
            usdAmount: string
            marketCap: string
            imageUrl: string
        }
        tokenOut: {
            symbol: string
            name: string
            address: string
            amount: string
            usdAmount: string
            marketCap: string
            imageUrl: string
        }
        gasFee: string
        platform: string
        timestamp: string
        priorityLevel?: 'Low' | 'Medium' | 'High' | 'VeryHigh'
        estimatedPriorityFee?: number
        actualPriorityFee?: number
    }
    whaleAddress: string
    tokenInSymbol: string
    tokenOutSymbol: string
    hotnessScore: number
    type: string
    timestamp: string
    influencerName?: string
    influencerUsername?: string
    influencerImage?: string
}

interface TransactionDetailViewProps {
    data: TransactionData
    transactionType: string
    tokenInPriceDisplay: PriceDisplay
    tokenOutPriceDisplay: PriceDisplay
    tokenInAmountDisplay: AmountDisplay
    tokenOutAmountDisplay: AmountDisplay
    detailsAmountDisplay: AmountDisplay
    onBack: () => void
    onTogglePrice: (type: "in" | "out") => void
    onToggleAmount: (type: "in" | "out") => void
    onToggleDetailsAmount: () => void
    onCopy: (text: string, label: string) => void
    onQuickBuy: () => void
}

const TransactionDetailView: React.FC<TransactionDetailViewProps> = ({
    data,
    transactionType,
    tokenInPriceDisplay,
    tokenOutPriceDisplay,
    tokenInAmountDisplay,
    tokenOutAmountDisplay,
    detailsAmountDisplay,
    onBack,
    onTogglePrice,
    onToggleAmount,
    onToggleDetailsAmount,
    onCopy,
    onQuickBuy,
}) => {
    const isBuy = transactionType === "buy"

    const formatMarketCap = (marketCap: string) => {
        const num = parseFloat(marketCap)
        if (num >= 1e9) return (num / 1e9).toFixed(1) + "B"
        if (num >= 1e6) return (num / 1e6).toFixed(1) + "M"
        if (num >= 1e3) return (num / 1e3).toFixed(1) + "K"
        return num.toFixed(0)
    }

    const getTimeAgo = (timestamp: string) => {
        const now = new Date()
        const past = new Date(timestamp)
        const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

        if (diffInSeconds < 60) return "Just now"
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
        return `${Math.floor(diffInSeconds / 86400)}d ago`
    }

    // ✅ NEW: Priority level display helpers
    const PRIORITY_LEVEL_COLORS: Record<string, string> = {
        Low: 'text-green-400 bg-green-400/10',
        Medium: 'text-yellow-400 bg-yellow-400/10',
        High: 'text-orange-400 bg-orange-400/10',
        VeryHigh: 'text-red-400 bg-red-400/10',
    }

    const PRIORITY_LEVEL_ICONS: Record<string, string> = {
        Low: '🐌',
        Medium: '🚶',
        High: '🏃',
        VeryHigh: '⚡',
    }

    // ✅ NEW: Calculate priority fee difference
    const getPriorityFeeDifference = () => {
        if (!data.transaction.estimatedPriorityFee || !data.transaction.actualPriorityFee) {
            return null
        }

        const estimated = data.transaction.estimatedPriorityFee
        const actual = data.transaction.actualPriorityFee
        const difference = actual - estimated
        const percentDiff = Math.abs((difference / estimated) * 100)

        return {
            estimated: (estimated / 1_000_000_000).toFixed(6),
            actual: (actual / 1_000_000_000).toFixed(6),
            difference: (Math.abs(difference) / 1_000_000_000).toFixed(6),
            isHigher: difference > 0,
            percentDiff: percentDiff.toFixed(1),
        }
    }

    const priorityFeeDiff = getPriorityFeeDifference()

    return (

        <>
            <div className="tx-detail-container">
                {/* Back Link */}
                <div className="back-link clickable" onClick={onBack}>
                    <ArrowLeft size={16} /> BACK /  <span>TRANSACTION DETAILS</span>
                </div>


                {/* Whale Address / Influencer Section */}
                <div className="whale-address-section">
                    <div className="address-label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {data.influencerImage && (
                            <img
                                src={data.influencerImage}
                                alt="influencer"
                                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none'; // Fallback to just text if image fails
                                }}
                            />
                        )}
                        <div>
                            {data.influencerName && (
                                <div style={{ fontWeight: 'bold', fontSize: '1.2em' }}>
                                    {data.influencerName}
                                    {data.influencerUsername && (
                                        <a
                                            href={`https://x.com/${data.influencerUsername.replace(/^@/, '')}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ fontSize: '0.8em', color: '#888', marginLeft: '5px', textDecoration: 'none', cursor: 'pointer' }}
                                        >
                                            @{data.influencerUsername.replace(/^@/, '')}
                                        </a>
                                    )}
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ opacity: 0.7 }}>ADDRESS:</span>
                                <span className="address-value">
                                    {data.whaleAddress.slice(0, 9)}...{data.whaleAddress.slice(-9)}
                                </span>
                                <Copy
                                    className="trans-copy-btn"
                                    onClick={() => onCopy(data.whaleAddress, "Address")}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="header-right-actions">
                        <span className="time-ago-label">{getTimeAgo(data.timestamp)}</span>
                        {/* ✅ NEW: Priority Level Badge */}
                        {data.transaction.priorityLevel && (
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium mr-2 ${PRIORITY_LEVEL_COLORS[data.transaction.priorityLevel]
                                }`}>
                                <span>{PRIORITY_LEVEL_ICONS[data.transaction.priorityLevel]}</span>
                                <span>{data.transaction.priorityLevel}</span>
                            </div>
                        )}
                        <button className="quick-buy-btn" onClick={onQuickBuy}>QUICK BUY</button>
                        {/* <button className="quick-buy-btn" data-bs-toggle="modal" data-bs-target="#quickConfirmation">QUICK BUY</button> */}
                    </div>
                </div>

                {/* Flow Visual Section */}
                <div className="tx-flow-visual">
                    {/* <div className="flow-side left">
                    <span className="side-label">IN</span>
                    <div className="token-info-wrapper">
                        <div className="token-text">
                            <h3>{data.transaction.tokenIn.symbol}</h3>
                            <span className="token-name">{data.transaction.tokenIn.name}</span>
                            <div className="mc-toggle">
                                {tokenInPriceDisplay.label}: <span>${tokenInPriceDisplay.value}</span>
                                <ArrowRightLeft
                                    size={12}
                                    className="clickable"
                                    onClick={() => onTogglePrice("in")}
                                />
                            </div>
                        </div>
                        <img
                            src={data.transaction.tokenIn.symbol.toUpperCase().includes("SOL") ? solanalogo : (data.transaction.tokenIn.imageUrl || DefaultTokenImage)}
                            alt="token in"
                            className="token-image"
                        />
                    </div>
                </div> */}

                    {/* <div className="trans-detail-in">
                        <h6>in</h6>
                    </div>

                    <div className="trans-data-in">
                         <div className="right-info market-cap-box  text-end">
                          <div className="market-decription">
                            <h5>mert</h5>
                            <p>may i mert you</p>
                            <div className="pt-3">
                                <small className="market-cap-title">market cap: $58.0m</small> <a href="javaript:void(0)" className="trans-reload"><TfiReload /></a>
                            </div>
                          </div>
                          <div className="right-img">
                            <img src="/mert-pic.png" alt="coin" />
                          </div>
                        </div>
                    </div> */}



                    <div className="flow-side left">
                        <div className="trans-detail-in">
                            <span className="side-label">IN</span>
                        </div>
                        <div className="token-info-wrapper">
                            <div className="token-text">
                                <h3>{data.transaction.tokenIn.symbol}</h3>
                                <span className="token-name">{data.transaction.tokenIn.name}</span>
                                <div className="mc-toggle">
                                    {tokenInPriceDisplay.label}: <span>${tokenInPriceDisplay.value}</span>
                                    <TfiReload
                                        size={12}
                                        className="clickable"
                                        onClick={() => onTogglePrice("in")}
                                        style={{ cursor: "pointer" }}

                                    />


                                </div>
                            </div>
                            <img
                                src={data.transaction.tokenIn.symbol.toUpperCase().includes("SOL") ? solanalogo : (data.transaction.tokenIn.imageUrl || DefaultTokenImage)}
                                alt="token in"
                                className="token-image"
                                onClick={() => onCopy(data.transaction.tokenIn.address, "Token Address")}
                                style={{ cursor: "pointer" }}
                            />
                        </div>
                    </div>

                    {/* <div className="flow-center-badge">
                    <div className={`status-badge ${isBuy ? "bought" : "sold"}`}>
                        {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {isBuy ? "BOUGHT" : "SOLD"}
                    </div>
                    <div className="center-usd-toggle" onClick={() => onToggleAmount(isBuy ? "out" : "in")}>
                        {isBuy ? tokenOutAmountDisplay.currency : tokenInAmountDisplay.currency} <ArrowRightLeft size={10} />
                    </div>
                    <div className={`center-amount ${isBuy ? "bought" : "sold"}`}>
                        ${isBuy ? tokenOutAmountDisplay.value : tokenInAmountDisplay.value}
                    </div>
                </div> */}


                    <div className="trans-total-value">
                        <div className="flow-center-badge">
                            <div className={`status-badge ${isBuy ? "bought" : "sold"}`}>
                                {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {isBuy ? "BOUGHT" : "SOLD"}
                            </div>
                            <div className="center-usd-toggle" onClick={() => onToggleAmount(isBuy ? "out" : "in")}>
                                {isBuy ? tokenOutAmountDisplay.currency : tokenInAmountDisplay.currency} <TfiReload size={10} />
                            </div>
                            <div className={`center-amount ${isBuy ? "bought" : "sold"}`}>
                                {isBuy ? tokenOutAmountDisplay.symbol : tokenInAmountDisplay.symbol}{isBuy ? tokenOutAmountDisplay.value : tokenInAmountDisplay.value}
                            </div>
                        </div>
                    </div>





                    {/* <div className="flow-side right">
                    <span className="side-label">OUT</span>
                    <div className="token-info-wrapper">
                        <img
                            src={data.transaction.tokenOut.symbol.toUpperCase().includes("SOL") ? solanalogo : (data.transaction.tokenOut.imageUrl || DefaultTokenImage)}
                            alt="token out"
                            className="token-image"
                        />
                        <div className="token-text">
                            <h3>{data.transaction.tokenOut.symbol}</h3>
                            <span className="token-name">{data.transaction.tokenOut.name}</span>
                            <div className="mc-toggle">
                                {tokenOutPriceDisplay.label}: <span>${tokenOutPriceDisplay.value}</span>
                                <ArrowRightLeft
                                    size={12}
                                    className="clickable"
                                    onClick={() => onTogglePrice("out")}
                                />
                            </div>
                        </div>
                    </div>
                </div> */}



                    <div className="flow-side right">
                        <div className="trans-detail-in">
                            <span className="side-label">OUT</span>
                        </div>

                        <div className="token-info-wrapper">
                            <img
                                src={data.transaction.tokenOut.symbol.toUpperCase().includes("SOL") ? solanalogo : (data.transaction.tokenOut.imageUrl || DefaultTokenImage)}
                                alt="token out"
                                className="token-image"
                                onClick={() => onCopy(data.transaction.tokenOut.address, "Token Address")}
                                style={{ cursor: "pointer" }}
                            />
                            <div className="token-text">
                                <h3>{data.transaction.tokenOut.symbol}</h3>
                                <span className="token-name">{data.transaction.tokenOut.name}</span>
                                <div className="mc-toggle">
                                    <span className="mc-toggle-title">{tokenOutPriceDisplay.label}:</span> <span>${tokenOutPriceDisplay.value}</span>
                                    <TfiReload

                                        size={12}
                                        className="clickable "
                                        onClick={() => onTogglePrice("out")}
                                        style={{ cursor: "pointer" }}


                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Details Table */}
                <div className="tx-details-table">
                    <div className="table-row">
                        <span className="row-label">TRANSACTION HASH:</span>
                        <div className="row-value mono">
                            {data.signature.slice(0, 9)}...{data.signature.slice(-9)}
                            <Copy
                                className="clickable-icon trans-copy-btn"
                                onClick={() => onCopy(data.signature, "Transaction Hash")}
                            />
                            {/* <a href={`https://solscan.io/tx/${data.signature}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="clickable-icon" />
                            </a> */}
                        </div>
                    </div>

                    <div className="table-row">
                        <span className="row-label">TIMESTAMP</span>
                        <span className="row-value">
                            {new Date(data.timestamp).toLocaleString()}
                        </span>
                    </div>

                    <div className="table-row">
                        <span className="row-label">AMOUNT</span>
                        <div className="row-value">
                            {detailsAmountDisplay.symbol}{detailsAmountDisplay.value}
                            <span className="amount-unit nw-usd-btn">
                                {detailsAmountDisplay.currency}
                                <TfiReload
                                    className="clickable-icon"
                                    onClick={onToggleDetailsAmount}
                                />
                            </span>

                        </div>
                    </div>

                    <div className="table-row">
                        <span className="row-label">GAS FEE</span>
                        <span className="row-value">
                            ${parseFloat(data.transaction.gasFee).toFixed(6)}
                        </span>
                    </div>

                    {/* ✅ NEW: Priority Fee Information */}
                    {data.transaction.priorityLevel && (
                        <div className="table-row">
                            <span className="row-label">PRIORITY LEVEL</span>
                            <div className="row-value">
                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${PRIORITY_LEVEL_COLORS[data.transaction.priorityLevel]
                                    }`}>
                                    <span>{PRIORITY_LEVEL_ICONS[data.transaction.priorityLevel]}</span>
                                    <span>{data.transaction.priorityLevel}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ✅ NEW: Priority Fee Comparison */}
                    {priorityFeeDiff && (
                        <>
                            <div className="table-row">
                                <span className="row-label">ESTIMATED PRIORITY FEE</span>
                                <span className="row-value">
                                    {priorityFeeDiff.estimated} SOL
                                </span>
                            </div>

                            <div className="table-row">
                                <span className="row-label">ACTUAL PRIORITY FEE</span>
                                <div className="row-value">
                                    {priorityFeeDiff.actual} SOL
                                    <span className={`ml-2 text-xs ${priorityFeeDiff.isHigher ? 'text-red-400' : 'text-green-400'
                                        }`}>
                                        ({priorityFeeDiff.isHigher ? '+' : '-'}{priorityFeeDiff.difference} SOL, {priorityFeeDiff.percentDiff}%)
                                    </span>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="table-row">
                        <span className="row-label">PLATFORM</span>
                        <div className="row-value">
                            {data.transaction.platform}
                            {/* <ExternalLink className="clickable-icon" /> */}

                            <span
                                className="nws-arrow-tp"
                                style={{ cursor: 'pointer' }}
                                onClick={() => window.open(`https://solscan.io/tx/${data.signature}`, '_blank', 'noopener,noreferrer')}
                            >
                                <FaArrowRightLong className="nw-icon-tp" />
                            </span>

                        </div>

                    </div>
                </div>
            </div>





        </>





    )
}

export default TransactionDetailView
