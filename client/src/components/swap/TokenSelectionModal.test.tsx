import React, { useState } from "react"
import { TokenSelectionModal, TokenInfo } from "./TokenSelectionModal"

/**
 * Test component to demonstrate TokenSelectionModal functionality
 * This component shows how to integrate the modal with a parent component
 */
export const TokenSelectionModalTest: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null)
  const [userWallet] = useState<string>("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") // Mock wallet

  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token)
    console.log("Selected token:", token)
  }

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  return (
    <div className="p-8 bg-black min-h-screen">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Token Selection Modal Test</h1>
        
        {/* Selected Token Display */}
        <div className="mb-6 p-4 bg-[#16171C] border border-[#2A2A2D] rounded-lg">
          <h2 className="text-lg font-semibold text-white mb-2">Selected Token:</h2>
          {selectedToken ? (
            <div className="flex items-center gap-3">
              <img
                src={selectedToken.image || "/src/assets/default_token.svg"}
                alt={selectedToken.symbol}
                className="w-8 h-8 rounded-full"
              />
              <div>
                <div className="text-white font-medium">{selectedToken.symbol}</div>
                <div className="text-gray-400 text-sm">{selectedToken.name}</div>
                <div className="text-gray-500 text-xs font-mono">
                  {selectedToken.address.slice(0, 6)}...{selectedToken.address.slice(-4)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400">No token selected</div>
          )}
        </div>

        {/* Test Buttons */}
        <div className="space-y-4">
          <button
            onClick={handleOpenModal}
            className="w-full bg-white text-black font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Select Token
          </button>

          <button
            onClick={handleOpenModal}
            className="w-full bg-blue-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Select Token (with wallet)
          </button>

          <button
            onClick={() => setSelectedToken(null)}
            className="w-full bg-red-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            Clear Selection
          </button>
        </div>

        {/* Features List */}
        <div className="mt-8 p-4 bg-[#16171C] border border-[#2A2A2D] rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3">Modal Features:</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>✅ Searchable token list with debounced input (300ms)</li>
            <li>✅ Popular tokens (SOL, USDC, USDT, mSOL, ETH, BTC)</li>
            <li>✅ Recent token selections with localStorage</li>
            <li>✅ User token balances display (mocked)</li>
            <li>✅ Token metadata (symbol, name, image, address)</li>
            <li>✅ Keyboard navigation (Arrow keys, Enter, Escape)</li>
            <li>✅ Click outside to close</li>
            <li>✅ Responsive design with animations</li>
            <li>✅ Error handling for missing images</li>
            <li>✅ Exclude currently selected token</li>
          </ul>
        </div>

        {/* Usage Instructions */}
        <div className="mt-6 p-4 bg-[#16171C] border border-[#2A2A2D] rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3">Usage Instructions:</h3>
          <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
            <li>Click "Select Token" to open the modal</li>
            <li>Search for tokens by name, symbol, or address</li>
            <li>Use arrow keys to navigate, Enter to select</li>
            <li>Click on any token to select it</li>
            <li>Recent selections are saved automatically</li>
            <li>Press Escape or click outside to close</li>
          </ol>
        </div>
      </div>

      {/* Token Selection Modal */}
      <TokenSelectionModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onTokenSelect={handleTokenSelect}
        excludeToken={selectedToken?.address}
        userWallet={userWallet}
        title="Select a Token"
      />
    </div>
  )
}

export default TokenSelectionModalTest