/**
 * Integration Example: How to use useWalletConnection in RightSidebarNew
 * 
 * This file shows how the useWalletConnection hook would be integrated
 * into the existing RightSidebarNew component for Jupiter swap functionality.
 * 
 * This is an EXAMPLE ONLY - not meant to be used directly.
 */

import React, { useState, useEffect } from 'react'
import { useWalletConnection } from './useWalletConnection'

// Example of how to integrate the wallet connection hook
// into the RightSidebarNew component for swap functionality
export const SwapIntegrationExample: React.FC = () => {
  const {
    wallet,
    connect,
    disconnect,
    getBalance,
    // getTokenBalance,
    isLoading,
    error,
    clearError
  } = useWalletConnection()

  // Swap-related state
  const [inputToken, setInputToken] = useState('SOL')
  const [outputToken, setOutputToken] = useState('USDC')
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [solBalance, setSolBalance] = useState(0)
  const [quote, setQuote] = useState(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)

  // Fetch SOL balance when wallet connects
  useEffect(() => {
    if (wallet.connected) {
      getBalance().then(setSolBalance).catch(console.error)
    } else {
      setSolBalance(0)
    }
  }, [wallet.connected, getBalance])

  // Mock function to fetch quote from backend
  const fetchQuote = async (amount: string) => {
    if (!amount || !wallet.connected) return

    setIsLoadingQuote(true)
    try {
      // This would call your backend API: GET /api/v1/trade/quote
      const response = await fetch(`/api/v1/trade/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${parseFloat(amount) * 1e9}`)
      const data = await response.json()

      if (data.success) {
        setQuote(data.quote)
        setOutputAmount((parseFloat(data.quote.outAmount) / 1e6).toFixed(6)) // USDC has 6 decimals
      }
    } catch (err) {
      console.error('Failed to fetch quote:', err)
    } finally {
      setIsLoadingQuote(false)
    }
  }

  // Debounced quote fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputAmount && parseFloat(inputAmount) > 0) {
        fetchQuote(inputAmount)
      }
    }, 500) // 500ms debounce as per requirements

    return () => clearTimeout(timer)
  }, [inputAmount, wallet.connected])

  const handleMaxClick = () => {
    if (solBalance > 0) {
      // Leave some SOL for transaction fees
      const maxAmount = Math.max(0, solBalance - 0.01)
      setInputAmount(maxAmount.toString())
    }
  }

  const handleSwap = async () => {
    if (!wallet.connected) {
      await connect()
      return
    }

    if (!quote) {
      alert('Please wait for quote to load')
      return
    }

    try {
      // Step 1: Generate swap transaction from backend
      const swapResponse = await fetch('/api/v1/trade/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.address
        })
      })

      const swapData = await swapResponse.json()

      if (!swapData.success) {
        throw new Error(swapData.message)
      }

      // Step 2: Deserialize and sign transaction
      // This would use the sendTransaction function from the hook
      // const transaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'))
      // const signature = await sendTransaction(transaction)

      // Step 3: Track the trade
      // await fetch('/api/v1/trade/track', { ... })

      alert('Swap successful! (This is a demo)')

    } catch (err: any) {
      console.error('Swap failed:', err)
      alert(`Swap failed: ${err.message}`)
    }
  }

  return (
    <div className="swap-interface p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Jupiter Swap</h3>

      {/* Wallet Connection Status */}
      <div className="mb-4">
        {!wallet.connected ? (
          <button
            onClick={connect}
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        ) : (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {wallet.address?.substring(0, 8)}...
            </span>
            <button
              onClick={disconnect}
              disabled={isLoading}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700">
          <p className="text-sm">{error.message}</p>
          <button
            onClick={clearError}
            className="text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Swap Interface - Only show when wallet is connected */}
      {wallet.connected && (
        <>
          {/* Input Token */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">From</label>
            <div className="flex items-center space-x-2">
              <select
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                className="flex-1 p-2 border rounded"
              >
                <option value="SOL">SOL</option>
                <option value="USDC">USDC</option>
              </select>
              <div className="flex-2">
                <input
                  type="number"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  placeholder="0.0"
                  className="w-full p-2 border rounded"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Balance: {solBalance.toFixed(4)} SOL</span>
                  <button
                    onClick={handleMaxClick}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    Max
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Output Token */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">To</label>
            <div className="flex items-center space-x-2">
              <select
                value={outputToken}
                onChange={(e) => setOutputToken(e.target.value)}
                className="flex-1 p-2 border rounded"
              >
                <option value="USDC">USDC</option>
                <option value="SOL">SOL</option>
              </select>
              <input
                type="text"
                value={outputAmount}
                readOnly
                placeholder="0.0"
                className="flex-2 p-2 border rounded bg-gray-50"
              />
            </div>
            {isLoadingQuote && (
              <p className="text-xs text-gray-500 mt-1">Fetching quote...</p>
            )}
          </div>

          {/* Quote Information */}
          {quote && (
            <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
              <div className="flex justify-between">
                <span>Exchange Rate:</span>
                <span>1 SOL ≈ {(parseFloat(outputAmount) / parseFloat(inputAmount)).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee (0.75%):</span>
                <span>{(parseFloat(inputAmount) * 0.0075).toFixed(6)} SOL</span>
              </div>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={!inputAmount || !outputAmount || isLoading || isLoadingQuote}
            className="w-full bg-green-500 text-white py-3 px-4 rounded font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Swap'}
          </button>
        </>
      )}

      {/* Hook Features Demonstration */}
      <div className="mt-6 pt-4 border-t text-xs text-gray-500">
        <p className="font-medium mb-2">Hook Features Demonstrated:</p>
        <ul className="space-y-1">
          <li>✅ Wallet connection state management</li>
          <li>✅ Connect/disconnect functionality</li>
          <li>✅ SOL balance fetching</li>
          <li>✅ Real-time quote updates (500ms debounce)</li>
          <li>✅ Error handling and user feedback</li>
          <li>✅ Loading state management</li>
        </ul>
      </div>
    </div>
  )
}

/**
 * How to integrate this into RightSidebarNew.tsx:
 * 
 * 1. Import the hook:
 *    import { useWalletConnection } from '../../hooks/useWalletConnection'
 * 
 * 2. Use the hook in your component:
 *    const { wallet, connect, disconnect, getBalance, ... } = useWalletConnection()
 * 
 * 3. Replace existing wallet logic with hook functions
 * 
 * 4. Add swap interface similar to the example above
 * 
 * 5. Integrate with Jupiter API endpoints:
 *    - GET /api/v1/trade/quote for real-time quotes
 *    - POST /api/v1/trade/swap for transaction generation
 *    - POST /api/v1/trade/track for trade tracking
 */