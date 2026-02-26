import React, { useState, useEffect, useCallback } from "react"
import { ExternalLink, Clock, TrendingUp, TrendingDown, Zap } from "lucide-react"
import { useAuth } from "../../contexts/AuthContext"
import axios from "axios"

const BASE_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

export interface SwapTransaction {
  _id: string
  signature: string
  walletAddress: string
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  platformFee: number
  priorityLevel?: 'Low' | 'Medium' | 'High' | 'VeryHigh'
  timestamp: string
  createdAt: string
  // Additional fields for display
  inputSymbol?: string
  outputSymbol?: string
  inputDecimals?: number
  outputDecimals?: number
  estimatedPriorityFee?: number
  actualPriorityFee?: number
}

interface TransactionHistoryProps {
  walletAddress?: string
  limit?: number
  className?: string
}

const PRIORITY_LEVEL_COLORS = {
  Low: 'text-green-400 bg-green-400/10',
  Medium: 'text-yellow-400 bg-yellow-400/10',
  High: 'text-orange-400 bg-orange-400/10',
  VeryHigh: 'text-red-400 bg-red-400/10',
}

const PRIORITY_LEVEL_ICONS = {
  Low: '🐌',
  Medium: '🚶',
  High: '🏃',
  VeryHigh: '⚡',
}

/**
 * Transaction History Component
 * 
 * Displays user's swap transaction history with priority level information,
 * estimated vs actual priority fees, and transaction analytics.
 * 
 * Requirements: 16.5 - Display priority level used in transaction history
 */
export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  walletAddress,
  limit = 10,
  className = "",
}) => {
  const [transactions, setTransactions] = useState<SwapTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isAuthenticated } = useAuth()

  // Fetch transaction history
  const fetchTransactions = useCallback(async () => {
    if (!walletAddress && !isAuthenticated) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
      })

      if (walletAddress) {
        params.append('walletAddress', walletAddress)
      }

      const response = await axios.get(
        `${BASE_URL}/trade/history?${params}`,
        {
          withCredentials: true,
        }
      )

      if (response.data.success) {
        setTransactions(response.data.data)
      } else {
        setError('Failed to fetch transaction history')
      }
    } catch (err: any) {
      console.error('Error fetching transaction history:', err)
      setError(err.response?.data?.message || 'Failed to fetch transaction history')
    } finally {
      setLoading(false)
    }
  }, [walletAddress, isAuthenticated, limit])

  // Load transactions on mount
  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Format token amount for display
  const formatTokenAmount = useCallback((amount: number, decimals: number = 9, symbol: string = '') => {
    const formatted = (amount / Math.pow(10, decimals)).toFixed(6)
    return `${parseFloat(formatted).toLocaleString()} ${symbol}`
  }, [])

  // Format USD amount
  const formatUSDAmount = useCallback((amount: number, decimals: number = 9) => {
    // This is a simplified calculation - in production, you'd use real-time prices
    const tokenAmount = amount / Math.pow(10, decimals)
    const estimatedUSD = tokenAmount * 200 // Rough SOL price estimate
    return `$${estimatedUSD.toFixed(2)}`
  }, [])

  // Get time ago string
  const getTimeAgo = useCallback((timestamp: string) => {
    const now = new Date()
    const past = new Date(timestamp)
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return `${Math.floor(diffInSeconds / 86400)}d ago`
  }, [])

  // Calculate priority fee savings/cost
  const getPriorityFeeInfo = useCallback((transaction: SwapTransaction) => {
    if (!transaction.estimatedPriorityFee || !transaction.actualPriorityFee) {
      return null
    }

    const difference = transaction.actualPriorityFee - transaction.estimatedPriorityFee
    const isHigher = difference > 0
    const percentDiff = Math.abs((difference / transaction.estimatedPriorityFee) * 100)

    return {
      difference: Math.abs(difference),
      isHigher,
      percentDiff,
      estimated: transaction.estimatedPriorityFee,
      actual: transaction.actualPriorityFee,
    }
  }, [])

  if (loading) {
    return (
      <div className={`transaction-history ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-gray-400">Loading transaction history...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`transaction-history ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="text-red-400 text-center">
            <p className="mb-2">Failed to load transaction history</p>
            <button
              onClick={fetchTransactions}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className={`transaction-history ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400 text-center">
            <p className="mb-2">No swap transactions found</p>
            <p className="text-sm">Your transaction history will appear here after you make swaps</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`transaction-history ${className}`}>
      <div className="space-y-3">
        {transactions.map((transaction) => {
          const priorityFeeInfo = getPriorityFeeInfo(transaction)
          const isSOLInput = transaction.inputMint === 'So11111111111111111111111111111111111111112'
          const isBuy = isSOLInput

          return (
            <div
              key={transaction._id}
              className="bg-[#1A1A1A] border border-[#2a2a2a] rounded-lg p-4 hover:bg-[#222] transition-colors"
            >
              {/* Transaction Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {/* Transaction Type Badge */}
                  <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${isBuy
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                    }`}>
                    {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isBuy ? 'BUY' : 'SELL'}
                  </div>

                  {/* Priority Level Badge */}
                  {transaction.priorityLevel && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${PRIORITY_LEVEL_COLORS[transaction.priorityLevel]
                      }`}>
                      <Zap size={10} />
                      <span>{PRIORITY_LEVEL_ICONS[transaction.priorityLevel]}</span>
                      <span>{transaction.priorityLevel}</span>
                    </div>
                  )}
                </div>

                {/* Time and External Link */}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock size={12} />
                  <span>{getTimeAgo(transaction.timestamp)}</span>
                  <a
                    href={`https://solscan.io/tx/${transaction.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 ml-2"
                    title="View on Solscan"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Transaction Details */}
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Input</div>
                  <div className="text-sm text-white">
                    {formatTokenAmount(
                      transaction.inputAmount,
                      transaction.inputDecimals || 9,
                      transaction.inputSymbol || 'TOKEN'
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatUSDAmount(transaction.inputAmount, transaction.inputDecimals || 9)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-400 mb-1">Output</div>
                  <div className="text-sm text-white">
                    {formatTokenAmount(
                      transaction.outputAmount,
                      transaction.outputDecimals || 9,
                      transaction.outputSymbol || 'TOKEN'
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatUSDAmount(transaction.outputAmount, transaction.outputDecimals || 9)}
                  </div>
                </div>
              </div>

              {/* Priority Fee Information */}
              {priorityFeeInfo && (
                <div className="border-t border-[#2a2a2a] pt-3 mt-3">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-gray-400 mb-1">Estimated Fee</div>
                      <div className="text-white">
                        {(priorityFeeInfo.estimated / 1_000_000_000).toFixed(6)} SOL
                      </div>
                    </div>

                    <div>
                      <div className="text-gray-400 mb-1">Actual Fee</div>
                      <div className="text-white">
                        {(priorityFeeInfo.actual / 1_000_000_000).toFixed(6)} SOL
                      </div>
                    </div>

                    <div>
                      <div className="text-gray-400 mb-1">Difference</div>
                      <div className={`${priorityFeeInfo.isHigher ? 'text-red-400' : 'text-green-400'
                        }`}>
                        {priorityFeeInfo.isHigher ? '+' : '-'}
                        {(priorityFeeInfo.difference / 1_000_000_000).toFixed(6)} SOL
                        <span className="ml-1">
                          ({priorityFeeInfo.percentDiff.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Platform Fee */}
              <div className="border-t border-[#2a2a2a] pt-3 mt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Platform Fee (0.75%)</span>
                  <span className="text-white">
                    {formatTokenAmount(
                      transaction.platformFee,
                      transaction.outputDecimals || 9,
                      transaction.outputSymbol || 'TOKEN'
                    )}
                  </span>
                </div>
              </div>

              {/* Transaction Hash */}
              <div className="border-t border-[#2a2a2a] pt-3 mt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Transaction</span>
                  <span className="text-white font-mono">
                    {transaction.signature.slice(0, 8)}...{transaction.signature.slice(-8)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Load More Button */}
      {transactions.length >= limit && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => {
              // In a real implementation, you'd implement pagination
            }}
            className="px-4 py-2 bg-[#2B6AD1] text-white rounded text-sm font-medium hover:bg-[#2B6AD1]/80 transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}

export default TransactionHistory