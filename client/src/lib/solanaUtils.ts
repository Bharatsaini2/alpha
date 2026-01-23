/**
 * Solana-specific utility functions
 * Provides address validation, transaction handling, and blockchain utilities
 */

import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js"
import type { ValidationResult } from "../types/swap.types"

// ============================================================================
// Address Validation
// ============================================================================

/**
 * Validates if a string is a valid Solana public key address
 * @param address - The address string to validate
 * @returns ValidationResult with isValid flag and optional error message
 */
export const isValidSolanaAddress = (address: string): ValidationResult => {
  if (!address || typeof address !== "string") {
    return {
      isValid: false,
      error: "Address is required",
    }
  }

  // Trim whitespace
  const trimmedAddress = address.trim()

  // Check length (Solana addresses are typically 32-44 characters)
  if (trimmedAddress.length < 32 || trimmedAddress.length > 44) {
    return {
      isValid: false,
      error: "Invalid address length",
    }
  }

  try {
    // Attempt to create a PublicKey instance
    new PublicKey(trimmedAddress)
    return {
      isValid: true,
    }
  } catch {
    return {
      isValid: false,
      error: "Invalid Solana address format",
    }
  }
}

/**
 * Validates if a string is a valid Solana public key (throws on invalid)
 * @param address - The address string to validate
 * @returns true if valid, throws error if invalid
 */
export const validateSolanaAddress = (address: string): boolean => {
  const result = isValidSolanaAddress(address)
  if (!result.isValid) {
    throw new Error(result.error || "Invalid Solana address")
  }
  return true
}

/**
 * Checks if two Solana addresses are equal
 * @param address1 - First address
 * @param address2 - Second address
 * @returns true if addresses are equal
 */
export const areAddressesEqual = (
  address1: string,
  address2: string
): boolean => {
  try {
    const pubkey1 = new PublicKey(address1)
    const pubkey2 = new PublicKey(address2)
    return pubkey1.equals(pubkey2)
  } catch {
    return false
  }
}

// ============================================================================
// Transaction Utilities
// ============================================================================

/**
 * Deserializes a base64-encoded transaction string
 * @param transactionBase64 - Base64 encoded transaction
 * @returns Deserialized Transaction or VersionedTransaction
 */
export const deserializeTransaction = (
  transactionBase64: string
): Transaction | VersionedTransaction => {
  try {
    const transactionBuffer = Buffer.from(transactionBase64, "base64")

    // Try to deserialize as VersionedTransaction first (newer format)
    try {
      return VersionedTransaction.deserialize(transactionBuffer)
    } catch {
      // Fall back to legacy Transaction format
      return Transaction.from(transactionBuffer)
    }
  } catch (error) {
    throw new Error(
      `Failed to deserialize transaction: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * Serializes a transaction to base64 string
 * @param transaction - Transaction to serialize
 * @returns Base64 encoded transaction string
 */
export const serializeTransaction = (
  transaction: Transaction | VersionedTransaction
): string => {
  try {
    if (transaction instanceof VersionedTransaction) {
      return Buffer.from(transaction.serialize()).toString("base64")
    } else {
      return transaction.serialize().toString("base64")
    }
  } catch (error) {
    throw new Error(
      `Failed to serialize transaction: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * Extracts signature from a transaction
 * @param transaction - Transaction to extract signature from
 * @returns Transaction signature as base58 string, or null if not signed
 */
export const getTransactionSignature = (
  transaction: Transaction | VersionedTransaction
): string | null => {
  try {
    if (transaction instanceof VersionedTransaction) {
      const signatures = transaction.signatures
      if (signatures && signatures.length > 0) {
        return Buffer.from(signatures[0]).toString("base64")
      }
    } else {
      const signature = transaction.signature
      if (signature) {
        return signature.toString("base64")
      }
    }
    return null
  } catch {
    return null
  }
}

// ============================================================================
// Amount Conversion Utilities
// ============================================================================

/**
 * Converts a UI amount to raw token amount (atomic units)
 * @param uiAmount - Amount in UI units (e.g., 1.5 SOL)
 * @param decimals - Token decimals (e.g., 9 for SOL)
 * @returns Raw amount in atomic units
 */
export const uiAmountToRaw = (uiAmount: number, decimals: number): number => {
  return Math.floor(uiAmount * Math.pow(10, decimals))
}

/**
 * Converts a raw token amount to UI amount
 * @param rawAmount - Amount in atomic units
 * @param decimals - Token decimals
 * @returns Amount in UI units
 */
export const rawAmountToUi = (rawAmount: number, decimals: number): number => {
  return rawAmount / Math.pow(10, decimals)
}

/**
 * Converts a string amount to raw token amount
 * @param amountString - Amount as string
 * @param decimals - Token decimals
 * @returns Raw amount in atomic units
 */
export const stringAmountToRaw = (
  amountString: string,
  decimals: number
): number => {
  const amount = parseFloat(amountString)
  if (isNaN(amount)) {
    throw new Error("Invalid amount string")
  }
  return uiAmountToRaw(amount, decimals)
}

// ============================================================================
// Explorer Utilities
// ============================================================================

/**
 * Generates Solana Explorer URL for a transaction
 * @param signature - Transaction signature
 * @param cluster - Solana cluster (mainnet-beta, devnet, testnet)
 * @returns Explorer URL
 */
export const getExplorerUrl = (
  signature: string,
  cluster: string = "mainnet-beta"
): string => {
  const baseUrl = "https://explorer.solana.com/tx"
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`
  return `${baseUrl}/${signature}${clusterParam}`
}

/**
 * Generates Solana Explorer URL for an address
 * @param address - Solana address
 * @param cluster - Solana cluster
 * @returns Explorer URL
 */
export const getAddressExplorerUrl = (
  address: string,
  cluster: string = "mainnet-beta"
): string => {
  const baseUrl = "https://explorer.solana.com/address"
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`
  return `${baseUrl}/${address}${clusterParam}`
}

/**
 * Generates Solscan URL for a transaction
 * @param signature - Transaction signature
 * @param cluster - Solana cluster
 * @returns Solscan URL
 */
export const getSolscanUrl = (
  signature: string,
  cluster: string = "mainnet-beta"
): string => {
  const baseUrl = "https://solscan.io/tx"
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`
  return `${baseUrl}/${signature}${clusterParam}`
}

// ============================================================================
// Address Formatting
// ============================================================================

/**
 * Shortens a Solana address for display
 * @param address - Full Solana address
 * @param chars - Number of characters to show at start and end (default: 4)
 * @returns Shortened address (e.g., "7xKX...9rZk")
 */
export const shortenAddress = (address: string, chars: number = 4): string => {
  if (!address) return ""
  if (address.length <= chars * 2) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

/**
 * Copies text to clipboard
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export const copyToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand("copy")
    } finally {
      document.body.removeChild(textArea)
    }
  }
}

// ============================================================================
// Common Token Addresses (Mainnet)
// ============================================================================

export const COMMON_TOKENS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
} as const

/**
 * Checks if a token is SOL (native token)
 * @param tokenAddress - Token mint address
 * @returns true if token is SOL
 */
export const isNativeSOL = (tokenAddress: string): boolean => {
  return areAddressesEqual(tokenAddress, COMMON_TOKENS.SOL)
}

/**
 * Gets token symbol from common tokens
 * @param tokenAddress - Token mint address
 * @returns Token symbol or null if not found
 */
export const getCommonTokenSymbol = (tokenAddress: string): string | null => {
  for (const [symbol, address] of Object.entries(COMMON_TOKENS)) {
    if (areAddressesEqual(tokenAddress, address)) {
      return symbol
    }
  }
  return null
}
