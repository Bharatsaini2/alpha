/**
 * Unit tests for solanaUtils
 */

import { describe, it, expect } from "vitest"
import {
  isValidSolanaAddress,
  validateSolanaAddress,
  areAddressesEqual,
  uiAmountToRaw,
  rawAmountToUi,
  stringAmountToRaw,
  getExplorerUrl,
  getAddressExplorerUrl,
  getSolscanUrl,
  shortenAddress,
  isNativeSOL,
  getCommonTokenSymbol,
  COMMON_TOKENS,
} from "../solanaUtils"

describe("solanaUtils - Address Validation", () => {
  const validAddress = "So11111111111111111111111111111111111111112" // SOL
  const invalidAddress = "invalid-address"

  describe("isValidSolanaAddress", () => {
    it("should validate correct Solana addresses", () => {
      const result = isValidSolanaAddress(validAddress)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("should reject invalid addresses", () => {
      const result = isValidSolanaAddress(invalidAddress)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("should reject empty addresses", () => {
      const result = isValidSolanaAddress("")
      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Address is required")
    })

    it("should reject addresses with invalid length", () => {
      const result = isValidSolanaAddress("short")
      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Invalid address length")
    })
  })

  describe("validateSolanaAddress", () => {
    it("should return true for valid addresses", () => {
      expect(validateSolanaAddress(validAddress)).toBe(true)
    })

    it("should throw for invalid addresses", () => {
      expect(() => validateSolanaAddress(invalidAddress)).toThrow()
    })
  })

  describe("areAddressesEqual", () => {
    it("should return true for equal addresses", () => {
      expect(areAddressesEqual(validAddress, validAddress)).toBe(true)
    })

    it("should return false for different addresses", () => {
      const address1 = COMMON_TOKENS.SOL
      const address2 = COMMON_TOKENS.USDC
      expect(areAddressesEqual(address1, address2)).toBe(false)
    })

    it("should return false for invalid addresses", () => {
      expect(areAddressesEqual(invalidAddress, validAddress)).toBe(false)
    })
  })
})

describe("solanaUtils - Amount Conversion", () => {
  describe("uiAmountToRaw", () => {
    it("should convert UI amount to raw amount", () => {
      expect(uiAmountToRaw(1, 9)).toBe(1_000_000_000) // 1 SOL
      expect(uiAmountToRaw(1.5, 9)).toBe(1_500_000_000) // 1.5 SOL
      expect(uiAmountToRaw(0.1, 6)).toBe(100_000) // 0.1 USDC
    })

    it("should handle decimals correctly", () => {
      expect(uiAmountToRaw(1, 0)).toBe(1)
      expect(uiAmountToRaw(1, 2)).toBe(100)
      expect(uiAmountToRaw(1, 18)).toBe(1_000_000_000_000_000_000)
    })
  })

  describe("rawAmountToUi", () => {
    it("should convert raw amount to UI amount", () => {
      expect(rawAmountToUi(1_000_000_000, 9)).toBe(1) // 1 SOL
      expect(rawAmountToUi(1_500_000_000, 9)).toBe(1.5) // 1.5 SOL
      expect(rawAmountToUi(100_000, 6)).toBe(0.1) // 0.1 USDC
    })

    it("should handle decimals correctly", () => {
      expect(rawAmountToUi(1, 0)).toBe(1)
      expect(rawAmountToUi(100, 2)).toBe(1)
      expect(rawAmountToUi(1_000_000_000_000_000_000, 18)).toBe(1)
    })
  })

  describe("stringAmountToRaw", () => {
    it("should convert string amount to raw amount", () => {
      expect(stringAmountToRaw("1", 9)).toBe(1_000_000_000)
      expect(stringAmountToRaw("1.5", 9)).toBe(1_500_000_000)
      expect(stringAmountToRaw("0.1", 6)).toBe(100_000)
    })

    it("should throw for invalid strings", () => {
      expect(() => stringAmountToRaw("abc", 9)).toThrow("Invalid amount string")
      expect(() => stringAmountToRaw("", 9)).toThrow("Invalid amount string")
    })
  })
})

describe("solanaUtils - Explorer URLs", () => {
  const signature = "5j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia7"

  describe("getExplorerUrl", () => {
    it("should generate mainnet explorer URL", () => {
      const url = getExplorerUrl(signature)
      expect(url).toBe(`https://explorer.solana.com/tx/${signature}`)
    })

    it("should generate devnet explorer URL", () => {
      const url = getExplorerUrl(signature, "devnet")
      expect(url).toBe(`https://explorer.solana.com/tx/${signature}?cluster=devnet`)
    })
  })

  describe("getAddressExplorerUrl", () => {
    it("should generate mainnet address URL", () => {
      const url = getAddressExplorerUrl(COMMON_TOKENS.SOL)
      expect(url).toBe(`https://explorer.solana.com/address/${COMMON_TOKENS.SOL}`)
    })

    it("should generate devnet address URL", () => {
      const url = getAddressExplorerUrl(COMMON_TOKENS.SOL, "devnet")
      expect(url).toBe(`https://explorer.solana.com/address/${COMMON_TOKENS.SOL}?cluster=devnet`)
    })
  })

  describe("getSolscanUrl", () => {
    it("should generate mainnet Solscan URL", () => {
      const url = getSolscanUrl(signature)
      expect(url).toBe(`https://solscan.io/tx/${signature}`)
    })

    it("should generate devnet Solscan URL", () => {
      const url = getSolscanUrl(signature, "devnet")
      expect(url).toBe(`https://solscan.io/tx/${signature}?cluster=devnet`)
    })
  })
})

describe("solanaUtils - Address Formatting", () => {
  describe("shortenAddress", () => {
    const address = "So11111111111111111111111111111111111111112"

    it("should shorten address with default chars", () => {
      expect(shortenAddress(address)).toBe("So11...1112")
    })

    it("should shorten address with custom chars", () => {
      expect(shortenAddress(address, 6)).toBe("So1111...111112")
    })

    it("should return full address if too short", () => {
      expect(shortenAddress("short")).toBe("short")
    })

    it("should handle empty address", () => {
      expect(shortenAddress("")).toBe("")
    })
  })
})

describe("solanaUtils - Common Tokens", () => {
  describe("isNativeSOL", () => {
    it("should identify SOL token", () => {
      expect(isNativeSOL(COMMON_TOKENS.SOL)).toBe(true)
    })

    it("should reject non-SOL tokens", () => {
      expect(isNativeSOL(COMMON_TOKENS.USDC)).toBe(false)
      expect(isNativeSOL(COMMON_TOKENS.USDT)).toBe(false)
    })
  })

  describe("getCommonTokenSymbol", () => {
    it("should return symbol for common tokens", () => {
      expect(getCommonTokenSymbol(COMMON_TOKENS.SOL)).toBe("SOL")
      expect(getCommonTokenSymbol(COMMON_TOKENS.USDC)).toBe("USDC")
      expect(getCommonTokenSymbol(COMMON_TOKENS.USDT)).toBe("USDT")
    })

    it("should return null for unknown tokens", () => {
      expect(getCommonTokenSymbol("UnknownTokenAddress123")).toBeNull()
    })
  })
})
