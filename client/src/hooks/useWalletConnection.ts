import { useState, useCallback, useEffect } from "react"
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  Connection
} from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError
} from "@solana/spl-token"

export interface TokenBalance {
  mint: string
  balance: number
  decimals: number
  uiAmount: number
}

export interface WalletConnectionState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  publicKey: PublicKey | null
  address: string | null
}

export interface WalletConnectionError {
  code: string
  message: string
  details?: any
}

export interface UseWalletConnection {
  wallet: WalletConnectionState
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sendTransaction: (transaction: Transaction | VersionedTransaction) => Promise<string>
  getBalance: (tokenMint?: string) => Promise<number>
  getTokenBalance: (tokenMint: string) => Promise<TokenBalance | null>
  getAllTokenBalances: () => Promise<TokenBalance[]>
  isLoading: boolean
  error: WalletConnectionError | null
  clearError: () => void
}

/**
 * Custom hook for managing Solana wallet connections using Reown AppKit
 * Provides wallet state management, transaction signing, and token balance fetching
 */
export const useWalletConnection = (): UseWalletConnection => {
  const { open } = useAppKit()
  const { address, isConnected, status } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<any>("solana")

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<WalletConnectionError | null>(null)

  // Get RPC connection
  const connection = new Connection(
    import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
  )

  // Convert address to PublicKey
  const publicKey = address ? new PublicKey(address) : null

  // Clear error when wallet state changes
  useEffect(() => {
    if (isConnected) {
      setError(null)
    }
  }, [isConnected])

  /**
   * Clear any existing error
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Handle wallet connection with error handling
   */
  const connect = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      await open()
    } catch (err: any) {
      console.error("Wallet connection error:", err)

      let errorMessage = "Failed to connect wallet"
      let errorCode = "CONNECTION_FAILED"

      if (err.name === "WalletNotReadyError") {
        errorMessage = "Wallet is not ready. Please install or unlock your wallet."
        errorCode = "WALLET_NOT_READY"
      } else if (err.name === "WalletConnectionError") {
        errorMessage = "Failed to connect to wallet. Please try again."
        errorCode = "CONNECTION_ERROR"
      } else if (err.name === "WalletNotFoundError") {
        errorMessage = "Wallet not found. Please install the wallet extension."
        errorCode = "WALLET_NOT_FOUND"
      } else if (err.message?.includes("User rejected")) {
        errorMessage = "Connection cancelled by user"
        errorCode = "USER_REJECTED"
      }

      setError({
        code: errorCode,
        message: errorMessage,
        details: err
      })

      throw err
    } finally {
      setIsLoading(false)
    }
  }, [open])

  /**
   * Handle wallet disconnection with error handling
   */
  const disconnect = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      await open({ view: "Account" })
    } catch (err: any) {
      console.error("Wallet disconnection error:", err)

      setError({
        code: "DISCONNECTION_FAILED",
        message: "Failed to disconnect wallet",
        details: err
      })

      throw err
    } finally {
      setIsLoading(false)
    }
  }, [open])

  /**
   * Send and confirm a transaction (supports both legacy and versioned transactions)
   */
  const sendTransaction = useCallback(async (transaction: Transaction | VersionedTransaction): Promise<string> => {
    try {
      setIsLoading(true)
      setError(null)

      if (!publicKey || !isConnected) {
        throw new Error("Wallet not connected")
      }

      if (!walletProvider) {
        throw new Error("Wallet provider not available")
      }

      // Handle legacy transactions (need to set blockhash and feePayer)
      if (transaction instanceof Transaction) {
        const { blockhash } = await connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = publicKey
      }
      // Versioned transactions come pre-configured from Jupiter

      // Sign transaction
      const signedTransaction = await walletProvider.signTransaction(transaction)

      // Send transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize())

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, "confirmed")

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`)
      }

      return signature
    } catch (err: any) {
      console.error("Transaction error:", err)

      let errorMessage = "Transaction failed"
      let errorCode = "TRANSACTION_FAILED"

      if (err.message?.includes("User rejected")) {
        errorMessage = "Transaction cancelled by user"
        errorCode = "USER_REJECTED"
      } else if (err.message?.includes("insufficient funds")) {
        errorMessage = "Insufficient funds for transaction"
        errorCode = "INSUFFICIENT_FUNDS"
      } else if (err.message?.includes("blockhash not found")) {
        errorMessage = "Transaction expired. Please try again."
        errorCode = "TRANSACTION_EXPIRED"
      }

      setError({
        code: errorCode,
        message: errorMessage,
        details: err
      })

      throw err
    } finally {
      setIsLoading(false)
    }
  }, [publicKey, isConnected, walletProvider, connection])

  /**
   * Get SOL balance or token balance for connected wallet
   */
  const getBalance = useCallback(async (tokenMint?: string): Promise<number> => {
    try {
      if (!publicKey || !isConnected) {
        throw new Error("Wallet not connected")
      }

      if (!tokenMint) {
        // Get SOL balance
        const balance = await connection.getBalance(publicKey)
        return balance / LAMPORTS_PER_SOL
      } else {
        // Get token balance - inline logic to avoid circular dependency
        try {
          const mintPublicKey = new PublicKey(tokenMint)

          // Get associated token account address
          const associatedTokenAddress = await getAssociatedTokenAddress(
            mintPublicKey,
            publicKey
          )

          try {
            // Get token account info
            const tokenAccount = await getAccount(connection, associatedTokenAddress)

            // Get mint info to determine decimals
            const mintInfo = await connection.getParsedAccountInfo(mintPublicKey)
            const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 0

            const balance = Number(tokenAccount.amount)
            const uiAmount = balance / Math.pow(10, decimals)

            return uiAmount
          } catch (err: any) {
            if (err instanceof TokenAccountNotFoundError ||
              err instanceof TokenInvalidAccountOwnerError) {
              // Token account doesn't exist, balance is 0
              return 0
            }
            throw err
          }
        } catch (err: any) {
          console.error("Error fetching token balance:", err)
          return 0
        }
      }
    } catch (err: any) {
      console.error("Error fetching balance:", err)

      setError({
        code: "BALANCE_FETCH_FAILED",
        message: "Failed to fetch wallet balance",
        details: err
      })

      return 0
    }
  }, [publicKey, isConnected, connection])

  /**
   * Get specific token balance for connected wallet
   */
  const getTokenBalance = useCallback(async (tokenMint: string): Promise<TokenBalance | null> => {
    try {
      if (!publicKey || !isConnected) {
        throw new Error("Wallet not connected")
      }

      const mintPublicKey = new PublicKey(tokenMint)

      // Get associated token account address
      const associatedTokenAddress = await getAssociatedTokenAddress(
        mintPublicKey,
        publicKey
      )

      try {
        // Get token account info
        const tokenAccount = await getAccount(connection, associatedTokenAddress)

        // Get mint info to determine decimals
        const mintInfo = await connection.getParsedAccountInfo(mintPublicKey)
        const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 0

        const balance = Number(tokenAccount.amount)
        const uiAmount = balance / Math.pow(10, decimals)

        return {
          mint: tokenMint,
          balance,
          decimals,
          uiAmount
        }
      } catch (err: any) {
        if (err instanceof TokenAccountNotFoundError ||
          err instanceof TokenInvalidAccountOwnerError) {
          // Token account doesn't exist, balance is 0
          return {
            mint: tokenMint,
            balance: 0,
            decimals: 0,
            uiAmount: 0
          }
        }
        throw err
      }
    } catch (err: any) {
      console.error("Error fetching token balance:", err)

      setError({
        code: "TOKEN_BALANCE_FETCH_FAILED",
        message: `Failed to fetch balance for token ${tokenMint}`,
        details: err
      })

      return null
    }
  }, [publicKey, isConnected, connection])

  /**
   * Get all token balances for connected wallet
   */
  const getAllTokenBalances = useCallback(async (): Promise<TokenBalance[]> => {
    try {
      if (!publicKey || !isConnected) {
        throw new Error("Wallet not connected")
      }

      // Get all token accounts for the wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        }
      )

      const balances: TokenBalance[] = []

      for (const tokenAccount of tokenAccounts.value) {
        const accountData = tokenAccount.account.data.parsed.info
        const balance = Number(accountData.tokenAmount.amount)
        const decimals = accountData.tokenAmount.decimals
        const uiAmount = Number(accountData.tokenAmount.uiAmount)
        const mint = accountData.mint

        // Only include accounts with non-zero balance
        if (balance > 0) {
          balances.push({
            mint,
            balance,
            decimals,
            uiAmount
          })
        }
      }

      return balances
    } catch (err: any) {
      console.error("Error fetching all token balances:", err)

      setError({
        code: "ALL_BALANCES_FETCH_FAILED",
        message: "Failed to fetch wallet token balances",
        details: err
      })

      return []
    }
  }, [publicKey, isConnected, connection])

  // Wallet state object
  const walletState: WalletConnectionState = {
    connected: isConnected,
    connecting: status === "connecting",
    disconnecting: status === "disconnecting",
    publicKey,
    address: address || null
  }

  return {
    wallet: walletState,
    connect,
    disconnect,
    sendTransaction,
    getBalance,
    getTokenBalance,
    getAllTokenBalances,
    isLoading: isLoading || status === "connecting" || status === "disconnecting",
    error,
    clearError
  }
}