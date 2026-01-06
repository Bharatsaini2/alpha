/**
 * Test component for useSwapApi hook
 * This component can be used to manually test the hook functionality
 */

import React, { useState } from 'react'
import { useSwapApi } from './useSwapApi'

const SwapApiTestComponent: React.FC = () => {
  const {
    getQuote,
    getSwapTransaction,
    trackTrade,
    clearErrors,
    isLoading,
    error,
    isLoadingQuote,
    isLoadingSwap,
    isLoadingTrack,
    quoteError,
    swapError,
    trackError,
  } = useSwapApi()

  const [quoteResult, setQuoteResult] = useState<any>(null)
  const [swapResult, setSwapResult] = useState<any>(null)
  const [trackResult, setTrackResult] = useState<any>(null)

  // Test quote functionality
  const testQuote = async () => {
    try {
      const result = await getQuote({
        inputMint: 'So11111111111111111111111111111111111111112', // SOL
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amount: 1000000, // 0.001 SOL (in lamports)
        slippageBps: 50, // 0.5% slippage
      })
      setQuoteResult(result)
    } catch (err) {
      console.error('Quote error:', err)
    }
  }

  // Test swap transaction generation
  const testSwap = async () => {
    if (!quoteResult) {
      alert('Please get a quote first')
      return
    }

    try {
      const result = await getSwapTransaction({
        quoteResponse: quoteResult,
        userPublicKey: 'So11111111111111111111111111111111111111112', // Test public key
        wrapUnwrapSOL: true,
      })
      setSwapResult(result)
    } catch (err) {
      console.error('Swap error:', err)
    }
  }

  // Test trade tracking
  const testTrack = async () => {
    try {
      const result = await trackTrade({
        signature: 'test-signature-' + Date.now(),
        walletAddress: 'So11111111111111111111111111111111111111112',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inputAmount: 1000000,
        outputAmount: 950000,
        platformFee: 7500,
      })
      setTrackResult(result)
    } catch (err) {
      console.error('Track error:', err)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Swap API Hook Test</h1>
      
      {/* Status Display */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Status</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Loading States:</strong>
            <ul className="ml-4">
              <li>Overall Loading: {isLoading ? '✅' : '❌'}</li>
              <li>Quote Loading: {isLoadingQuote ? '✅' : '❌'}</li>
              <li>Swap Loading: {isLoadingSwap ? '✅' : '❌'}</li>
              <li>Track Loading: {isLoadingTrack ? '✅' : '❌'}</li>
            </ul>
          </div>
          <div>
            <strong>Errors:</strong>
            <ul className="ml-4">
              <li>General Error: {error ? '❌' : '✅'}</li>
              <li>Quote Error: {quoteError ? '❌' : '✅'}</li>
              <li>Swap Error: {swapError ? '❌' : '✅'}</li>
              <li>Track Error: {trackError ? '❌' : '✅'}</li>
            </ul>
          </div>
        </div>
        
        {error && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
            <strong>Error:</strong> {error.message} (Code: {error.code})
          </div>
        )}
      </div>

      {/* Test Controls */}
      <div className="mb-6 space-y-4">
        <h2 className="text-lg font-semibold">Test Controls</h2>
        
        <div className="flex space-x-4">
          <button
            onClick={testQuote}
            disabled={isLoadingQuote}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoadingQuote ? 'Getting Quote...' : 'Test Quote (SOL → USDC)'}
          </button>
          
          <button
            onClick={testSwap}
            disabled={isLoadingSwap || !quoteResult}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {isLoadingSwap ? 'Generating Swap...' : 'Test Swap Transaction'}
          </button>
          
          <button
            onClick={testTrack}
            disabled={isLoadingTrack}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            {isLoadingTrack ? 'Tracking...' : 'Test Track Trade'}
          </button>
          
          <button
            onClick={clearErrors}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Clear Errors
          </button>
        </div>
      </div>

      {/* Results Display */}
      <div className="space-y-6">
        {/* Quote Result */}
        {quoteResult && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Quote Result</h3>
            <pre className="text-sm overflow-x-auto">
              {JSON.stringify(quoteResult, null, 2)}
            </pre>
          </div>
        )}

        {/* Swap Result */}
        {swapResult && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Swap Transaction Result</h3>
            <pre className="text-sm overflow-x-auto">
              {JSON.stringify(swapResult, null, 2)}
            </pre>
          </div>
        )}

        {/* Track Result */}
        {trackResult && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Track Trade Result</h3>
            <pre className="text-sm overflow-x-auto">
              {JSON.stringify(trackResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Usage Instructions</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click "Test Quote" to fetch a quote for 0.001 SOL → USDC</li>
          <li>Once quote is loaded, click "Test Swap Transaction" to generate a swap transaction</li>
          <li>Click "Test Track Trade" to test the trade tracking functionality</li>
          <li>Use "Clear Errors" to reset any error states</li>
        </ol>
        <p className="mt-2 text-sm text-gray-600">
          Note: This component tests the hook's API integration. Make sure the backend server is running
          and the trade endpoints are available at /api/v1/trade/*
        </p>
      </div>
    </div>
  )
}

export default SwapApiTestComponent