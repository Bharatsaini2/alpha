import { useState, useEffect, useCallback, useMemo } from "react"
import { X, Settings } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Transaction, VersionedTransaction } from "@solana/web3.js"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { useSwapApi, QuoteResponse } from "../../hooks/useSwapApi"
import { TokenSelectionModal, TokenInfo } from "./TokenSelectionModal"
import { useToast } from "../ui/Toast"
import "./swap.css"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCopy } from "@fortawesome/free-solid-svg-icons"


interface SwapModalProps {
  isOpen: boolean
  onClose: () => void
  initialInputToken?: TokenInfo
  initialOutputToken?: TokenInfo
  initialAmount?: string
}

// Default tokens
const DEFAULT_INPUT_TOKEN: TokenInfo = {
  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  image: "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1547042389",
}

const DEFAULT_OUTPUT_TOKEN: TokenInfo = {
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  image: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
}

export const SwapModal: React.FC<SwapModalProps> = ({
  isOpen,
  onClose,
  initialInputToken,
  initialOutputToken,
  initialAmount,
}) => {
  const { wallet, sendTransaction, getBalance } = useWalletConnection()
  const { getQuote, getSwapTransaction, isLoadingQuote, isLoadingSwap, clearErrors } = useSwapApi()
  const { showToast } = useToast()

  const [inputToken, setInputToken] = useState<TokenInfo>(initialInputToken || DEFAULT_INPUT_TOKEN)
  const [outputToken, setOutputToken] = useState<TokenInfo>(initialOutputToken || DEFAULT_OUTPUT_TOKEN)
  const [inputAmount, setInputAmount] = useState<string>(initialAmount || "")
  const [outputAmount, setOutputAmount] = useState<string>("")
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [slippage, setSlippage] = useState<number>(500) // Default 5% slippage (500 BPS) - user can manually change
  const [customSlippage, setCustomSlippage] = useState<string>("")
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false)
  const [inputBalance, setInputBalance] = useState<number>(0)
  const [isSwapping, setIsSwapping] = useState(false)

  // Update initial values when props change
  useEffect(() => {
    if (initialInputToken) setInputToken(initialInputToken)
    if (initialOutputToken) setOutputToken(initialOutputToken)
    if (initialAmount) setInputAmount(initialAmount)
  }, [initialInputToken, initialOutputToken, initialAmount])

  // Fetch balance when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchInputBalance()
    }
  }, [wallet.connected, wallet.publicKey, inputToken.address])

  // Fetch quote when amount or tokens change
  useEffect(() => {
    if (inputAmount && parseFloat(inputAmount) > 0) {
      fetchQuote()
    } else {
      setQuote(null)
      setOutputAmount("")
    }
  }, [inputAmount, inputToken.address, outputToken.address, slippage])

  const fetchInputBalance = useCallback(async () => {
    try {
      const balance = await getBalance(
        inputToken.address === "So11111111111111111111111111111111111111112"
          ? undefined
          : inputToken.address
      )
      setInputBalance(balance)
    } catch (error) {
      console.error("Failed to fetch balance:", error)
      setInputBalance(0)
    }
  }, [getBalance, inputToken.address])

  const fetchQuote = useCallback(async () => {
    try {
      const amount = parseFloat(inputAmount)
      if (isNaN(amount) || amount <= 0) return

      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputToken.decimals))

      const quoteResponse = await getQuote({
        inputMint: inputToken.address,
        outputMint: outputToken.address,
        amount: amountInSmallestUnit,
        slippageBps: slippage,
      })

      setQuote(quoteResponse)

      // Calculate output amount with validation
      const outAmountRaw = quoteResponse.outAmount

      // Validate outAmount is a valid number string
      if (!outAmountRaw || isNaN(Number(outAmountRaw))) {
        console.error("Invalid outAmount in quote response:", outAmountRaw)
        setOutputAmount("0.00")
        showToast("Invalid quote response. Please try again.", "error")
        return
      }

      const outAmount = parseFloat(outAmountRaw) / Math.pow(10, outputToken.decimals)

      // Validate calculated amount
      if (isNaN(outAmount) || !isFinite(outAmount)) {
        console.error("Invalid calculated output amount:", outAmount)
        setOutputAmount("0.00")
        showToast("Invalid quote calculation. Please try again.", "error")
        return
      }

      setOutputAmount(outAmount.toFixed(6))
    } catch (error: any) {
      console.error("Failed to fetch quote:", error)
      setQuote(null)
      setOutputAmount("")
      showToast(error.message || "Failed to fetch quote", "error")
    }
  }, [inputAmount, inputToken, outputToken, slippage, getQuote, showToast])

  const handleSwap = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey || !inputAmount) return

    try {
      setIsSwapping(true)
      clearErrors()

      // Get a FRESH quote right before swap to avoid stale route errors
      showToast("Getting fresh quote...", "info")
      const amount = parseFloat(inputAmount)
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount")
      }

      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputToken.decimals))

      const freshQuote = await getQuote({
        inputMint: inputToken.address,
        outputMint: outputToken.address,
        amount: amountInSmallestUnit,
        slippageBps: slippage,
      })

      // Update displayed quote
      setQuote(freshQuote)
      const outAmount = parseFloat(freshQuote.outAmount) / Math.pow(10, outputToken.decimals)
      setOutputAmount(outAmount.toFixed(6))

      showToast("Generating transaction...", "info")
      const swapResponse = await getSwapTransaction({
        quoteResponse: freshQuote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicSlippage: false, // Fixed slippage at 5%
      })

      showToast("Please sign the transaction in your wallet...", "info")
      const transactionBuffer = Buffer.from(swapResponse.swapTransaction, "base64")

      // Try to deserialize as versioned transaction first (Jupiter uses versioned transactions)
      let transaction: Transaction | VersionedTransaction
      try {
        transaction = VersionedTransaction.deserialize(transactionBuffer)
      } catch (e) {
        // Fallback to legacy transaction if versioned deserialization fails
        transaction = Transaction.from(transactionBuffer)
      }

      showToast("Submitting transaction to Solana network...", "info")
      const signature = await sendTransaction(transaction)

      // Show success message
      showToast("Swap completed successfully!", "success")

      // Reset and close after success
      setTimeout(() => {
        setInputAmount("")
        setOutputAmount("")
        setQuote(null)
        onClose()
      }, 3000)
    } catch (error: any) {
      console.error("Swap failed:", error)
      let errorMessage = "Swap failed. Please try again."

      // Safely extract error message
      const errorMsg = typeof error.message === 'string' ? error.message : String(error.message || '')

      // Parse specific error messages
      if (errorMsg && typeof errorMsg === 'string' && errorMsg.toLowerCase().includes("invalidaccountdata")) {
        errorMessage = "Route expired. Please try again with higher slippage."
      } else if (errorMsg && typeof errorMsg === 'string' && errorMsg.toLowerCase().includes("simulation failed")) {
        // Handle Jupiter simulation errors (error 0x9, etc.)
        if (errorMsg.includes("0x9") || errorMsg.includes("custom program error")) {
          errorMessage = "Swap route expired. Price may have changed. Please try again."
        } else {
          errorMessage = "Transaction simulation failed. Try increasing slippage or reducing amount."
        }
      } else if (errorMsg) {
        errorMessage = errorMsg
      }

      showToast(errorMessage, "error")
    } finally {
      setIsSwapping(false)
    }
  }, [wallet, inputAmount, inputToken, outputToken, slippage, getQuote, getSwapTransaction, sendTransaction, clearErrors, showToast, onClose])

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage)
    setCustomSlippage("") // Clear custom input when preset is selected
  }

  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value)
    
    // Validate and set slippage
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 50) {
      // Convert percentage to BPS (basis points)
      setSlippage(Math.floor(numValue * 100))
    }
  }

  const presetSlippages = [
    { label: "0.5%", value: 50 },
    { label: "1%", value: 100 },
    { label: "3%", value: 300 },
    { label: "5%", value: 500 },
  ]

  const platformFeeDisplay = useMemo(() => {
    if (!quote) return null

    // Try to use platform fee from quote response first
    if (quote.platformFee?.amount && !isNaN(Number(quote.platformFee.amount))) {
      const feeAmountRaw = quote.platformFee.amount
      const feeAmount = parseFloat(feeAmountRaw) / Math.pow(10, outputToken.decimals)
      if (!isNaN(feeAmount) && isFinite(feeAmount)) {
        return `${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      }
    }

    // Fallback: Calculate platform fee manually
    if (outputAmount && !isNaN(parseFloat(outputAmount)) && parseFloat(outputAmount) > 0) {
      const outAmount = parseFloat(outputAmount)
      const grossAmount = outAmount / 0.9925
      const feeAmount = grossAmount * 0.0075

      if (!isNaN(feeAmount) && isFinite(feeAmount) && feeAmount > 0) {
        return `~${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      }
    }

    return null
  }, [quote, outputAmount, outputToken])

  const isSwapDisabled = useMemo(() => {
    if (!wallet.connected) return true
    if (isSwapping || isLoadingQuote || isLoadingSwap) return true
    if (!inputAmount || parseFloat(inputAmount) <= 0) return true
    if (!quote) return true
    if (parseFloat(inputAmount) > inputBalance) return true
    return false
  }, [wallet.connected, isSwapping, isLoadingQuote, isLoadingSwap, inputAmount, quote, inputBalance])

  return (
    <>
      <TokenSelectionModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onTokenSelect={(token) => {
          setInputToken(token)
          setIsInputModalOpen(false)
        }}
        excludeToken={outputToken.address}
        userWallet={wallet.address || undefined}
        title="Select Input Token"
      />

      <TokenSelectionModal
        isOpen={isOutputModalOpen}
        onClose={() => setIsOutputModalOpen(false)}
        onTokenSelect={(token) => {
          setOutputToken(token)
          setIsOutputModalOpen(false)
        }}
        excludeToken={inputToken.address}
        userWallet={wallet.address || undefined}
        title="Select Output Token"
      />

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg trans-swap-modal"
            >

              <div className="flex items-start justify-between p-3 border-b border-[#292929]">
                <div className="confirm-title-bx">
                  <h4 className="">Quick Buy Confirmation</h4>
                  <p className="">Review Details before signing</p>
                </div>

                <div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>


              <div className="p-3 space-y-3">
                {/* Token Info */}
                <div className="solana-bx">
                  <div className="solana-parent-bx">
                    <div className="solana-content-bx">
                      <img 
                        src={outputToken.image || "/solana-icon.png"} 
                        alt={outputToken.symbol}
                        onError={(e) => { e.currentTarget.src = "/solana-icon.png" }}
                      />
                      <div>
                        <h4>{outputToken.name}</h4>
                        <p>{outputToken.symbol}</p>
                      </div>
                    </div>

                    <div className="solana-cp-bx">
                      <h6>{outputToken.address.slice(0, 4)}...{outputToken.address.slice(-4)}</h6> 
                      <span>
                        <button
                          type="button"
                          className="solana-cp-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(outputToken.address)
                            showToast("Address copied!", "success")
                          }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <FontAwesomeIcon icon={faCopy} />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Buy Details */}
                <div className="buy-detail-bx">
                  <h4>Buy Details</h4>
                  <div className="solana-your-pay">
                    <div className="solana-you-pay">
                      <h6>You Pay</h6>
                      <h5>{inputAmount || "0"} {inputToken.symbol}</h5>
                    </div>
                    <div className="solana-receive-bx">
                      <h6>You Receive</h6>
                      <h5>{outputAmount || "0"} {outputToken.symbol}</h5>
                    </div>
                  </div>
                </div>

                {/* Slippage and Price Impact */}
                <div className="slippage-bx">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h6>Slippage : {(slippage / 100).toFixed(2)}%</h6>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setShowSlippageSettings(!showSlippageSettings)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#8f8f8f',
                        transition: 'color 0.2s ease',
                        zIndex: 10
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#8f8f8f'}
                      title="Slippage Settings"
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                  <div>
                    <h6>price impact : <span className="impact-percent">{quote?.priceImpactPct || "0"}%</span></h6>
                  </div>
                </div>

                {/* Slippage Settings Panel */}
                {showSlippageSettings && (
                  <div className="slippage-settings-panel">
                    <h6 style={{ marginBottom: '12px', color: '#ebebeb', fontSize: '14px' }}>Slippage Tolerance</h6>
                    
                    {/* Preset Slippage Buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      {presetSlippages.map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => handleSlippageChange(preset.value)}
                          className={`slippage-preset-btn ${slippage === preset.value && !customSlippage ? 'active' : ''}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom Slippage Input */}
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#8f8f8f', fontSize: '12px' }}>
                        Custom Slippage (0-50%)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number"
                          value={customSlippage}
                          onChange={(e) => handleCustomSlippageChange(e.target.value)}
                          placeholder="Enter custom %"
                          min="0"
                          max="50"
                          step="0.1"
                          className="custom-slippage-input"
                        />
                        <span style={{ 
                          position: 'absolute', 
                          right: '12px', 
                          top: '50%', 
                          transform: 'translateY(-50%)',
                          color: '#8f8f8f',
                          fontSize: '12px',
                          pointerEvents: 'none'
                        }}>
                          %
                        </span>
                      </div>
                    </div>

                    {/* Slippage Warning */}
                    {slippage > 500 && (
                      <div style={{ 
                        padding: '8px 12px', 
                        background: 'rgba(251, 191, 36, 0.1)', 
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#fbbf24',
                        marginTop: '8px'
                      }}>
                        ⚠️ High slippage may result in unfavorable rates
                      </div>
                    )}

                    {slippage < 50 && (
                      <div style={{ 
                        padding: '8px 12px', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#ef4444',
                        marginTop: '8px'
                      }}>
                        ⚠️ Low slippage may cause transaction failures
                      </div>
                    )}

                    <div style={{ 
                      marginTop: '12px', 
                      padding: '8px 12px', 
                      background: 'rgba(43, 106, 209, 0.1)', 
                      border: '1px solid rgba(43, 106, 209, 0.3)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#2b6ad1'
                    }}>
                      💡 Default is 5%. Lower slippage (0.5-1%) for stable pairs, keep 3-5% for volatile tokens
                    </div>
                  </div>
                )}

                {/* Fee Breakdown */}
                <div className="solana-breakdown">
                  <h5>Fee BreakDown</h5>
                  <ul className="break-down-list">
                    <li className="break-down-item">
                      Platform fee (0.75 percent)
                      <span className="break-down-title"> {platformFeeDisplay || "Calculating..."} </span>
                    </li>
                    <li className="break-down-item">
                      Network fee 
                      <span className="break-down-title"> ~ 0.00001 SOL </span>
                    </li>
                    <li className="break-down-item">
                      Priority fee
                      <div className="switch-wrapper">
                        <div className="switch">
                          <input type="checkbox" id="toggle7" disabled />
                          <label htmlFor="toggle7"></label>
                        </div>
                        <span className="switch-title">Auto</span>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Total Cost */}
                <div className="solana-total-bx">
                  <div>
                    <h6>Total cost</h6>
                  </div>
                  <div>
                    <h5>~ {inputAmount || "0"} {inputToken.symbol}</h5>
                  </div>
                </div>

                {/* Activity Status */}
                <div className="salana-activity-bx">
                  <ul className="salana-activity-list">
                    <li>
                      <div> <span className="salana-atv-bx"> Liquidity: <h6>Healthy</h6> </span> </div>
                    </li>
                    <li>
                      <div> <span className="salana-atv-bx"> Trading: <h6>Active</h6> </span> </div>
                    </li>
                    <li>
                      <div> <span className="salana-atv-bx"> Honeypot: <h6>Passed</h6> </span> </div>
                    </li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="salana-btn-bx">
                  <button 
                    className="salana-btn"
                    onClick={onClose}
                    disabled={isSwapping}
                  >
                    Cancel
                    <span className="corner top-right"></span>
                    <span className="corner bottom-left"></span>
                  </button>
                  <button 
                    className="salana-btn"
                    onClick={handleSwap}
                    disabled={isSwapDisabled || !wallet.connected}
                  >
                    {!wallet.connected ? "Connect Wallet" : isSwapping ? "Swapping..." : "Confirm"}
                    <span className="corner top-right"></span>
                    <span className="corner bottom-left"></span>
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>




    </>
  )
}

export default SwapModal
