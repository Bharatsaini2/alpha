/**
 * Unit tests for swapApi utilities
 */

import { describe, it, expect } from "vitest"
import {
  formatNumber,
  formatCompactNumber,
  formatTokenAmount,
  formatPrice,
  formatPercentage,
  parseNumberInput,
  validateNumberInput,
} from "../swapApi"

describe("swapApi - Number Formatting", () => {
  describe("formatNumber", () => {
    it("should format numbers with default 2 decimals", () => {
      expect(formatNumber(1234.5678)).toBe("1,234.57")
      expect(formatNumber(0.123456)).toBe("0.12")
    })

    it("should format numbers with custom decimals", () => {
      expect(formatNumber(1234.5678, 4)).toBe("1,234.5678")
      expect(formatNumber(0.123456, 6)).toBe("0.123456")
    })

    it("should handle edge cases", () => {
      expect(formatNumber(0)).toBe("0")
      expect(formatNumber(NaN)).toBe("0")
      expect(formatNumber(Infinity)).toBe("0")
    })
  })

  describe("formatCompactNumber", () => {
    it("should format billions", () => {
      expect(formatCompactNumber(1_500_000_000)).toBe("1.50B")
      expect(formatCompactNumber(12_345_678_900)).toBe("12.35B")
    })

    it("should format millions", () => {
      expect(formatCompactNumber(1_500_000)).toBe("1.50M")
      expect(formatCompactNumber(12_345_678)).toBe("12.35M")
    })

    it("should format thousands", () => {
      expect(formatCompactNumber(1_500)).toBe("1.50K")
      expect(formatCompactNumber(12_345)).toBe("12.35K")
    })

    it("should format small numbers", () => {
      expect(formatCompactNumber(123.45)).toBe("123.45")
      expect(formatCompactNumber(0.12)).toBe("0.12")
    })

    it("should handle negative numbers", () => {
      expect(formatCompactNumber(-1_500_000)).toBe("-1.50M")
    })
  })

  describe("formatTokenAmount", () => {
    it("should format with symbol", () => {
      expect(formatTokenAmount(1234.567, "SOL", 2)).toBe("1,234.57 SOL")
      expect(formatTokenAmount(0.123456, "USDC", 4)).toBe("0.1235 USDC")
    })

    it("should format without symbol", () => {
      expect(formatTokenAmount(1234.567, undefined, 2)).toBe("1,234.57")
    })

    it("should use compact notation", () => {
      expect(formatTokenAmount(1_500_000, "SOL", 2, true)).toBe("1.50M SOL")
    })
  })

  describe("formatPrice", () => {
    it("should format standard prices", () => {
      expect(formatPrice(123.45)).toBe("$123.45")
      expect(formatPrice(0.5)).toBe("$0.5000")
    })

    it("should format small prices with more decimals", () => {
      expect(formatPrice(0.005)).toBe("$0.005000")
      expect(formatPrice(0.000123)).toBe("$0.000123")
    })

    it("should handle custom currency", () => {
      expect(formatPrice(123.45, "€")).toBe("€123.45")
    })

    it("should handle edge cases", () => {
      expect(formatPrice(0)).toBe("$0")
      expect(formatPrice(NaN)).toBe("$0")
    })
  })

  describe("formatPercentage", () => {
    it("should format percentages", () => {
      expect(formatPercentage(0.05)).toBe("5.00%")
      expect(formatPercentage(0.1234)).toBe("12.34%")
      expect(formatPercentage(-0.05)).toBe("-5.00%")
    })

    it("should include sign for positive values", () => {
      expect(formatPercentage(0.05, 2, true)).toBe("+5.00%")
      expect(formatPercentage(-0.05, 2, true)).toBe("-5.00%")
    })

    it("should use custom decimals", () => {
      expect(formatPercentage(0.12345, 4)).toBe("12.3450%")
    })
  })

  describe("parseNumberInput", () => {
    it("should parse valid numbers", () => {
      expect(parseNumberInput("123.45")).toBe(123.45)
      expect(parseNumberInput("1,234.56")).toBe(1234.56)
      expect(parseNumberInput("  789  ")).toBe(789)
    })

    it("should return null for invalid input", () => {
      expect(parseNumberInput("")).toBeNull()
      expect(parseNumberInput("abc")).toBeNull()
      expect(parseNumberInput("12.34.56")).toBeNull()
    })
  })

  describe("validateNumberInput", () => {
    it("should validate positive numbers", () => {
      const result = validateNumberInput("123.45")
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("should reject invalid numbers", () => {
      const result = validateNumberInput("abc")
      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Invalid number")
    })

    it("should reject zero and negative numbers", () => {
      const result1 = validateNumberInput("0")
      expect(result1.isValid).toBe(false)
      expect(result1.error).toBe("Amount must be greater than 0")

      const result2 = validateNumberInput("-5")
      expect(result2.isValid).toBe(false)
      expect(result2.error).toBe("Amount must be greater than 0")
    })

    it("should validate min/max constraints", () => {
      const result1 = validateNumberInput("5", 10, 100)
      expect(result1.isValid).toBe(false)
      expect(result1.error).toBe("Amount must be at least 10")

      const result2 = validateNumberInput("150", 10, 100)
      expect(result2.isValid).toBe(false)
      expect(result2.error).toBe("Amount must be at most 100")

      const result3 = validateNumberInput("50", 10, 100)
      expect(result3.isValid).toBe(true)
    })
  })
})
