import { useState, useEffect, useCallback, useMemo } from "react"
import { X, ArrowDownUp, Settings } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Transaction, VersionedTransaction } from "@solana/web3.js"
import DefaultTokenImage from "../../assets/default_token.svg"
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
  const { wallet, connect, sendTransaction, getBalance } = useWalletConnection()
  const { getQuote, getSwapTransaction, trackTrade, isLoadingQuote, isLoadingSwap, clearErrors } = useSwapApi()
  const { showToast } = useToast()

  const [inputToken, setInputToken] = useState<TokenInfo>(initialInputToken || DEFAULT_INPUT_TOKEN)
  const [outputToken, setOutputToken] = useState<TokenInfo>(initialOutputToken || DEFAULT_OUTPUT_TOKEN)
  const [inputAmount, setInputAmount] = useState<string>(initialAmount || "")
  const [outputAmount, setOutputAmount] = useState<string>("")
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [slippage, setSlippage] = useState<number>(500) // Fixed 5% slippage (500 BPS) - NOT dynamic
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false)
  const [inputBalance, setInputBalance] = useState<number>(0)
  const [isSwapping, setIsSwapping] = useState(false)
  const [swapStatus, setSwapStatus] = useState<string>("")
  const [lastTxSignature, setLastTxSignature] = useState<string>("")

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
      setSwapStatus("Getting fresh quote...")
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

      setSwapStatus("Generating transaction...")
      const swapResponse = await getSwapTransaction({
        quoteResponse: freshQuote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicSlippage: false, // Fixed slippage at 5%
      })

      setSwapStatus("Please sign the transaction...")
      const transactionBuffer = Buffer.from(swapResponse.swapTransaction, "base64")

      // Try to deserialize as versioned transaction first (Jupiter uses versioned transactions)
      let transaction: Transaction | VersionedTransaction
      try {
        transaction = VersionedTransaction.deserialize(transactionBuffer)
      } catch (e) {
        // Fallback to legacy transaction if versioned deserialization fails
        transaction = Transaction.from(transactionBuffer)
      }

      setSwapStatus("Submitting transaction...")
      const signature = await sendTransaction(transaction)

      setSwapStatus("Transaction confirmed!")
      setLastTxSignature(signature)
      showToast("Swap completed successfully!", "success")

      // Track trade
      const inputAmountNum = parseFloat(inputAmount) * Math.pow(10, inputToken.decimals)
      const outputAmountNum = parseFloat(freshQuote.outAmount)

      // Calculate platform fee with fallback
      // Jupiter Ultra v1 doesn't return platformFee.amount, so calculate it manually
      let platformFee = 0
      if (freshQuote.platformFee?.amount && !isNaN(Number(freshQuote.platformFee.amount))) {
        platformFee = parseFloat(freshQuote.platformFee.amount)
      } else {
        // Fallback: Calculate 0.75% of output amount
        platformFee = outputAmountNum * 0.0075
      }

      try {
        await trackTrade({
          signature,
          walletAddress: wallet.publicKey.toBase58(),
          inputMint: inputToken.address,
          outputMint: outputToken.address,
          inputAmount: inputAmountNum,
          outputAmount: outputAmountNum,
          platformFee,
        })
      } catch (trackError) {
        console.error("Failed to track trade:", trackError)
      }

      // Reset and close after success
      setTimeout(() => {
        setInputAmount("")
        setOutputAmount("")
        setQuote(null)
        setSwapStatus("")
        setLastTxSignature("")
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
        errorMessage = "Transaction simulation failed. Try increasing slippage or reducing amount."
      } else if (errorMsg) {
        errorMessage = errorMsg
      }

      showToast(errorMessage, "error")
      setSwapStatus(errorMessage)
      setTimeout(() => setSwapStatus(""), 5000)
    } finally {
      setIsSwapping(false)
    }
  }, [wallet, inputAmount, inputToken, outputToken, slippage, getQuote, getSwapTransaction, sendTransaction, trackTrade, clearErrors, showToast, onClose])

  const handleSwapTokens = () => {
    const temp = inputToken
    setInputToken(outputToken)
    setOutputToken(temp)
    setInputAmount("")
    setOutputAmount("")
    setQuote(null)
  }

  const exchangeRate = useMemo(() => {
    if (!quote || !inputAmount || parseFloat(inputAmount) === 0) return null
    const inAmount = parseFloat(inputAmount)
    const outAmount = parseFloat(outputAmount)
    if (inAmount > 0 && outAmount > 0) {
      const rate = outAmount / inAmount
      return `1 ${inputToken.symbol} ≈ ${rate.toFixed(6)} ${outputToken.symbol}`
    }
    return null
  }, [quote, inputAmount, outputAmount, inputToken.symbol, outputToken.symbol])

  const platformFeeDisplay = useMemo(() => {
    console.log('[Platform Fee Debug]', {
      hasQuote: !!quote,
      hasPlatformFee: !!quote?.platformFee,
      platformFeeAmount: quote?.platformFee?.amount,
      platformFeeObject: quote?.platformFee,
      outputAmount,
      outputAmountParsed: parseFloat(outputAmount || '0'),
      outputTokenDecimals: outputToken.decimals,
      outputTokenSymbol: outputToken.symbol
    });

    if (!quote) return null

    // Try to use platform fee from quote response first
    if (quote.platformFee?.amount && !isNaN(Number(quote.platformFee.amount))) {
      const feeAmountRaw = quote.platformFee.amount
      console.log('[Platform Fee] Using quote.platformFee.amount:', feeAmountRaw);
      const feeAmount = parseFloat(feeAmountRaw) / Math.pow(10, outputToken.decimals)
      if (!isNaN(feeAmount) && isFinite(feeAmount)) {
        console.log('[Platform Fee] Calculated from quote:', feeAmount);
        return `${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      }
    }

    // Fallback: Calculate platform fee manually (0.75% of output amount)
    // Jupiter Ultra v1 doesn't return platformFee.amount, but fee is still collected
    console.log('[Platform Fee] Using fallback calculation...');
    if (outputAmount && !isNaN(parseFloat(outputAmount)) && parseFloat(outputAmount) > 0) {
      const outAmount = parseFloat(outputAmount)
      const feeAmount = outAmount * 0.0075 // 0.75% = 0.0075

      console.log('[Platform Fee] Fallback result:', {
        outputAmount,
        outAmount,
        feeAmount,
        formatted: `~${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      });

      if (!isNaN(feeAmount) && isFinite(feeAmount) && feeAmount > 0) {
        return `~${feeAmount.toFixed(6)} ${outputToken.symbol} (0.75%)`
      }
    }

    console.log('[Platform Fee] No valid calculation possible');
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

      {/* <AnimatePresence>
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
              className="relative w-full max-w-md bg-[#0A0A0A] border border-[#292929] rounded-xl shadow-2xl"
            >
       
              <div className="flex items-center justify-between p-4 border-b border-[#292929]">
                <h2 className="text-lg font-semibold text-white">Swap Tokenss</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>

          
              <div className="p-4 space-y-4">
              
                {!wallet.connected ? (
                  <button
                    onClick={connect}
                    className="w-full py-3 bg-[#2B6AD1] hover:bg-[#2B6AD1]/90 text-white font-semibold rounded-lg transition-colors"
                  >
                    Connect Wallet to Swap
                  </button>
                ) : (
                  <>
                
                    {swapStatus && (
                      <div className={`p-3 rounded-lg text-sm ${
                        swapStatus.includes("confirmed") || swapStatus.includes("success")
                          ? "bg-green-900/20 border border-green-500/50 text-green-400"
                          : swapStatus.includes("failed") || swapStatus.includes("error")
                          ? "bg-red-900/20 border border-red-500/50 text-red-400"
                          : "bg-blue-900/20 border border-blue-500/50 text-blue-400"
                      }`}>
                        {swapStatus}
                        {lastTxSignature && (
                          <a
                            href={`https://solscan.io/tx/${lastTxSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-1 underline hover:text-white"
                          >
                            View on Solscan →
                          </a>
                        )}
                      </div>
                    )}

            
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">You Pay</span>
                        {wallet.connected && (
                          <span className="text-gray-400">
                            Balance: {inputBalance.toFixed(4)} {inputToken.symbol}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-[#141414] border border-[#292929] rounded-lg p-3">
                        <button
                          onClick={() => setIsInputModalOpen(true)}
                          className="flex items-center gap-2 px-3 py-2 bg-[#1A1A1A] hover:bg-[#222] rounded-lg transition-colors"
                        >
                          <img
                            src={inputToken.image || DefaultTokenImage}
                            alt={inputToken.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                          />
                          <span className="text-white font-medium">{inputToken.symbol}</span>
                        </button>
                        <input
                          type="number"
                          value={inputAmount}
                          onChange={(e) => setInputAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-white text-xl font-bold text-right focus:outline-none"
                          disabled={!wallet.connected}
                        />
                      </div>
                    </div>

                   
                    <div className="flex justify-center">
                      <button
                        onClick={handleSwapTokens}
                        className="p-2 bg-[#1A1A1A] hover:bg-[#222] rounded-full transition-all hover:rotate-180"
                        disabled={!wallet.connected}
                      >
                        <ArrowDownUp size={20} className="text-gray-400" />
                      </button>
                    </div>

              
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">You Receive</span>
                        {isLoadingQuote && <span className="text-gray-400">Loading...</span>}
                      </div>
                      <div className="flex items-center gap-2 bg-[#141414] border border-[#292929] rounded-lg p-3">
                        <button
                          onClick={() => setIsOutputModalOpen(true)}
                          className="flex items-center gap-2 px-3 py-2 bg-[#1A1A1A] hover:bg-[#222] rounded-lg transition-colors"
                        >
                          <img
                            src={outputToken.image || DefaultTokenImage}
                            alt={outputToken.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                          />
                          <span className="text-white font-medium">{outputToken.symbol}</span>
                        </button>
                        <div className="flex-1 text-white text-xl font-bold text-right">
                          {outputAmount || "0"}
                        </div>
                      </div>
                    </div>

              
                    {quote && (
                      <div className="space-y-2 p-3 bg-[#141414] rounded-lg text-sm">
                        {exchangeRate && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Rate</span>
                            <span className="text-white">{exchangeRate}</span>
                          </div>
                        )}
                        {platformFeeDisplay && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Platform Fee</span>
                            <span className="text-white">{platformFeeDisplay}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Slippage</span>
                          <button
                            onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                            className="flex items-center gap-1 text-white hover:text-blue-400 transition-colors"
                          >
                            <span>{(slippage / 100).toFixed(2)}%</span>
                            <Settings size={14} />
                          </button>
                        </div>
                        
                    
                        {showSlippageSettings && (
                          <div className="pt-2 border-t border-[#292929]">
                            <div className="flex gap-2 mb-2">
                              {[50, 100, 300, 500].map((bps) => (
                                <button
                                  key={bps}
                                  onClick={() => setSlippage(bps)}
                                  className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                                    slippage === bps
                                      ? "bg-[#2B6AD1] text-white"
                                      : "bg-[#1A1A1A] text-gray-400 hover:bg-[#222]"
                                  }`}
                                >
                                  {(bps / 100).toFixed(2)}%
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={slippage / 100}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value)
                                  if (!isNaN(value) && value >= 0 && value <= 50) {
                                    setSlippage(Math.round(value * 100))
                                  }
                                }}
                                step="0.1"
                                min="0"
                                max="50"
                                className="flex-1 bg-[#1A1A1A] border border-[#292929] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#2B6AD1]"
                                placeholder="Custom %"
                              />
                              <span className="text-xs text-gray-400">Custom</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Higher slippage = higher chance of success, but worse price
                            </p>
                          </div>
                        )}
                      </div>
                    )}

              
                    <button
                      onClick={handleSwap}
                      disabled={isSwapDisabled}
                      className="w-full py-3 bg-[#2B6AD1] hover:bg-[#2B6AD1]/90 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                    >
                      {isSwapping ? "Swapping..." : isLoadingQuote ? "Loading Quote..." : "Swap"}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence> */}



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
                  <h4 className="">Quick By Confirmation</h4>
                  <p className="">Review Details before siging</p>
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
                <div className="solana-bx">
                  <div className="solana-parent-bx">
                    <div className="solana-content-bx">
                      <img src="/solana-icon.png" alt="" />
                      <div>
                        <h4>Solana</h4>
                        <p>Sol</p>
                      </div>
                    </div>

                    <div className="solana-cp-bx">
                      <h6>9xQZ...pump</h6> <span><a href="javascript:void(0)" className="solana-cp-btn"><FontAwesomeIcon icon={faCopy} /></a></span>
                    </div>
                  </div>
                </div>

                <div className="buy-detail-bx">
                  <h4>Buy Details</h4>
                  <div className="solana-your-pay">
                    <div className="solana-you-pay">
                      <h6>You Pay</h6>
                      <h5>0.5 Sal</h5>
                    </div>
                    <div className="solana-receive-bx">
                      <h6>You Receive</h6>
                      <h5>1,243,333 Token</h5>
                    </div>
                  </div>
                </div>
                <div className="slippage-bx">
                  <div>
                    <h6>Slippage : 5 percent</h6>
                  </div>
                  <div>
                    <h6>price impact : <span className="impact-percent">2.8 percent</span></h6>
                  </div>
                </div>

                <div className="solana-breakdown">
                  <h5>Fee BreakDown</h5>
                  <ul className="break-down-list">
                    <li className="break-down-item">Platform fee (0.75 percent)<span className="break-down-title"> 0.00375 SOL </span></li>
                    <li className="break-down-item">Network fee <span className="break-down-title"> ~ 0.00375 SOL </span></li>
                    <li className="break-down-item">Priority fee
                         <div className="switch-wrapper">
                        <div className="switch">
                          <input type="checkbox" id="toggle7" />
                          <label htmlFor="toggle7"></label>
                        </div>

                        <span className="switch-title">Off</span>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="solana-total-bx">
                  <div>
                    <h6>Total cost</h6>
                  </div>
                  <div>
                    <h5>~ 0.00375 SOL</h5>
                  </div>
                </div>

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

                <div className="salana-btn-bx">
                  <button className="salana-btn">Cancel

                    <span className="corner top-right"></span>
                                        <span className="corner bottom-left"></span>
                  </button>
                  <button className="salana-btn">Confirm 

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
