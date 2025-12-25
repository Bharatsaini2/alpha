import React from "react"
import { useWalletConnection } from "../hooks/useWalletConnection"

/**
 * Test component to verify useWalletConnection hook functionality
 * This component demonstrates all the hook's capabilities
 */
export const WalletTest: React.FC = () => {
  const {
    wallet,
    connect,
    disconnect,
    getBalance,
    getTokenBalance,
    getAllTokenBalances,
    isLoading,
    error,
    clearError
  } = useWalletConnection()

  const [solBalance, setSolBalance] = React.useState<number | null>(null)
  const [tokenBalances, setTokenBalances] = React.useState<any[]>([])
  const [testTokenMint, setTestTokenMint] = React.useState("")

  // Test SOL balance fetching
  const handleGetSolBalance = async () => {
    try {
      const balance = await getBalance()
      setSolBalance(balance)
    } catch (err) {
      console.error("Failed to get SOL balance:", err)
    }
  }

  // Test token balance fetching
  const handleGetTokenBalance = async () => {
    if (!testTokenMint.trim()) {
      alert("Please enter a token mint address")
      return
    }
    
    try {
      const balance = await getTokenBalance(testTokenMint.trim())
      console.log("Token balance:", balance)
      alert(`Token balance: ${balance?.uiAmount || 0}`)
    } catch (err) {
      console.error("Failed to get token balance:", err)
    }
  }

  // Test all token balances fetching
  const handleGetAllTokenBalances = async () => {
    try {
      const balances = await getAllTokenBalances()
      setTokenBalances(balances)
      console.log("All token balances:", balances)
    } catch (err) {
      console.error("Failed to get all token balances:", err)
    }
  }

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", margin: "20px" }}>
      <h3>Wallet Connection Test</h3>
      
      {/* Wallet Status */}
      <div style={{ marginBottom: "20px" }}>
        <h4>Wallet Status:</h4>
        <p>Connected: {wallet.connected ? "Yes" : "No"}</p>
        <p>Connecting: {wallet.connecting ? "Yes" : "No"}</p>
        <p>Address: {wallet.address || "Not connected"}</p>
        <p>Loading: {isLoading ? "Yes" : "No"}</p>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ 
          backgroundColor: "#ffebee", 
          color: "#c62828", 
          padding: "10px", 
          marginBottom: "20px",
          borderRadius: "4px"
        }}>
          <p><strong>Error:</strong> {error.message}</p>
          <p><strong>Code:</strong> {error.code}</p>
          <button onClick={clearError}>Clear Error</button>
        </div>
      )}

      {/* Connection Controls */}
      <div style={{ marginBottom: "20px" }}>
        <h4>Connection Controls:</h4>
        <button 
          onClick={connect} 
          disabled={wallet.connected || isLoading}
          style={{ marginRight: "10px" }}
        >
          Connect Wallet
        </button>
        <button 
          onClick={disconnect} 
          disabled={!wallet.connected || isLoading}
        >
          Disconnect Wallet
        </button>
      </div>

      {/* Balance Testing */}
      {wallet.connected && (
        <div style={{ marginBottom: "20px" }}>
          <h4>Balance Testing:</h4>
          <div style={{ marginBottom: "10px" }}>
            <button onClick={handleGetSolBalance} disabled={isLoading}>
              Get SOL Balance
            </button>
            {solBalance !== null && (
              <span style={{ marginLeft: "10px" }}>
                SOL Balance: {solBalance.toFixed(4)}
              </span>
            )}
          </div>
          
          <div style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="Enter token mint address"
              value={testTokenMint}
              onChange={(e) => setTestTokenMint(e.target.value)}
              style={{ marginRight: "10px", width: "300px" }}
            />
            <button onClick={handleGetTokenBalance} disabled={isLoading}>
              Get Token Balance
            </button>
          </div>
          
          <div>
            <button onClick={handleGetAllTokenBalances} disabled={isLoading}>
              Get All Token Balances
            </button>
            {tokenBalances.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <p>Found {tokenBalances.length} token(s) with balance:</p>
                <ul>
                  {tokenBalances.slice(0, 5).map((balance, index) => (
                    <li key={index}>
                      {balance.mint.substring(0, 8)}...: {balance.uiAmount}
                    </li>
                  ))}
                  {tokenBalances.length > 5 && (
                    <li>... and {tokenBalances.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hook Information */}
      <div style={{ marginTop: "20px", fontSize: "12px", color: "#666" }}>
        <h4>Hook Features Tested:</h4>
        <ul>
          <li>✅ Wallet connection state management</li>
          <li>✅ Connect/disconnect functions</li>
          <li>✅ SOL balance fetching</li>
          <li>✅ Token balance fetching</li>
          <li>✅ All token balances fetching</li>
          <li>✅ Error handling and loading states</li>
          <li>⚠️ Transaction signing (requires actual transaction)</li>
        </ul>
      </div>
    </div>
  )
}