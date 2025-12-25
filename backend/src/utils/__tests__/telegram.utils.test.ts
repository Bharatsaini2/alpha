import * as fc from 'fast-check'
import {
  escapeMarkdownV2,
  formatCurrency,
  formatLargeNumber,
  generateTransactionLink,
  generateTokenLink,
  shortenAddress,
  formatWhaleAlert,
  formatClusterAlert,
  formatKOLAlert,
} from '../telegram.utils'
import { IWhaleAllTransactionsV2 } from '../../models/whaleAllTransactionsV2.model'
import { IInfluencerWhaleTransactionsV2 } from '../../models/influencerWhaleTransactionsV2.model'

describe('Telegram Utilities', () => {
  describe('escapeMarkdownV2', () => {
    // **Feature: telegram-alert-system, Property 17: MarkdownV2 special characters are escaped**
    it('should escape all MarkdownV2 special characters', () => {
      fc.assert(
        fc.property(fc.string(), (text) => {
          const escaped = escapeMarkdownV2(text)
          
          // Special characters that must be escaped: _ * [ ] ( ) ~ > # + - = | { } . !
          const specialChars = ['_', '*', '[', ']', '(', ')', '~', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
          
          // Check that each special character in the original text is escaped in the result
          for (let i = 0; i < text.length; i++) {
            const char = text[i]
            if (specialChars.includes(char)) {
              // Find this character in the escaped string
              // It should be preceded by a backslash
              const escapedIndex = escaped.indexOf(char, i)
              if (escapedIndex > 0) {
                expect(escaped[escapedIndex - 1]).toBe('\\')
              }
            }
          }
          
          return true
        }),
        { numRuns: 100 }
      )
    })

    it('should escape specific special characters correctly', () => {
      const testCases = [
        { input: 'Hello_World', expected: 'Hello\\_World' },
        { input: 'Test*Bold*', expected: 'Test\\*Bold\\*' },
        { input: '[Link](url)', expected: '\\[Link\\]\\(url\\)' },
        { input: 'Price: $1.50!', expected: 'Price: $1\\.50\\!' },
        { input: 'Math: 2+2=4', expected: 'Math: 2\\+2\\=4' },
        { input: 'Range: {1-10}', expected: 'Range: \\{1\\-10\\}' },
        { input: 'Pipe | Symbol', expected: 'Pipe \\| Symbol' },
        { input: 'Greater > Less', expected: 'Greater \\> Less' },
        { input: 'Hash #tag', expected: 'Hash \\#tag' },
        { input: 'Tilde ~test', expected: 'Tilde \\~test' },
      ]

      testCases.forEach(({ input, expected }) => {
        expect(escapeMarkdownV2(input)).toBe(expected)
      })
    })

    it('should not modify strings without special characters', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\s]+$/),
          (text) => {
            const escaped = escapeMarkdownV2(text)
            expect(escaped).toBe(text)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle empty strings', () => {
      expect(escapeMarkdownV2('')).toBe('')
    })

    it('should handle strings with only special characters', () => {
      const allSpecialChars = '_*[]()~>#+-=|{}.!'
      const escaped = escapeMarkdownV2(allSpecialChars)
      
      // Each character should be escaped
      for (const char of allSpecialChars) {
        expect(escaped).toContain(`\\${char}`)
      }
    })
  })

  describe('formatCurrency', () => {
    it('should format with minimum 2 decimals', () => {
      expect(formatCurrency(100)).toMatch(/\.\d{2}/)
      expect(formatCurrency(1234.5)).toMatch(/\.\d{2}/)
    })

    it('should format with maximum 6 decimals when specified', () => {
      const result = formatCurrency(1.123456789, 6)
      const decimals = result.split('.')[1]
      expect(decimals?.length).toBeLessThanOrEqual(6)
    })

    it('should use 6 decimals for very small amounts', () => {
      const result = formatCurrency(0.001234)
      const decimals = result.split('.')[1]
      expect(decimals?.length).toBe(6)
    })

    it('should include thousand separators', () => {
      expect(formatCurrency(1000000)).toContain(',')
    })
  })

  describe('formatLargeNumber', () => {
    it('should format billions with B suffix', () => {
      expect(formatLargeNumber(1500000000)).toBe('1.50B')
      expect(formatLargeNumber(2000000000)).toBe('2.00B')
    })

    it('should format millions with M suffix', () => {
      expect(formatLargeNumber(1500000)).toBe('1.50M')
      expect(formatLargeNumber(2000000)).toBe('2.00M')
    })

    it('should format thousands with K suffix', () => {
      expect(formatLargeNumber(1500)).toBe('1.50K')
      expect(formatLargeNumber(2000)).toBe('2.00K')
    })

    it('should format small numbers without suffix', () => {
      expect(formatLargeNumber(100)).toBe('100.00')
      expect(formatLargeNumber(50.5)).toBe('50.50')
    })
  })

  describe('generateTransactionLink', () => {
    // **Feature: telegram-alert-system, Property 28: Transaction links are valid**
    it('should generate valid Solscan transaction URLs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 88 }),
          (txHash) => {
            const link = generateTransactionLink(txHash)
            
            // Must be a valid URL format
            expect(link).toMatch(/^https:\/\/solscan\.io\/tx\//)
            
            // Must contain the transaction hash
            expect(link).toBe(`https://solscan.io/tx/${txHash}`)
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle typical Solana transaction hashes', () => {
      const typicalHash = '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt'
      const link = generateTransactionLink(typicalHash)
      expect(link).toBe(`https://solscan.io/tx/${typicalHash}`)
    })
  })

  describe('generateTokenLink', () => {
    it('should generate valid Solscan token URLs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 44 }),
          (tokenAddress) => {
            const link = generateTokenLink(tokenAddress)
            
            // Must be a valid URL format
            expect(link).toMatch(/^https:\/\/solscan\.io\/token\//)
            
            // Must contain the token address
            expect(link).toBe(`https://solscan.io/token/${tokenAddress}`)
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('shortenAddress', () => {
    it('should shorten long addresses correctly', () => {
      const address = 'So11111111111111111111111111111111111111112'
      const shortened = shortenAddress(address)
      expect(shortened).toBe('So11...1112')
    })

    it('should not shorten addresses that are already short', () => {
      const shortAddress = 'ABC123'
      const result = shortenAddress(shortAddress)
      expect(result).toBe(shortAddress)
    })

    it('should respect custom prefix and suffix lengths', () => {
      const address = 'So11111111111111111111111111111111111111112'
      const shortened = shortenAddress(address, 6, 6)
      expect(shortened).toBe('So1111...111112')
    })
  })

  describe('formatWhaleAlert', () => {
    // **Feature: telegram-alert-system, Property 24: Whale alert message completeness**
    it('should include all required fields for whale alerts', () => {
      fc.assert(
        fc.property(
          fc.record({
            signature: fc.string({ minLength: 32, maxLength: 88 }),
            type: fc.constantFrom('buy', 'sell', 'both'),
            whale: fc.record({
              address: fc.string({ minLength: 32, maxLength: 44 }),
            }),
            transaction: fc.record({
              tokenIn: fc.record({
                symbol: fc.string({ minLength: 1, maxLength: 10 }),
                address: fc.string({ minLength: 32, maxLength: 44 }),
                amount: fc.double({ min: 0, max: 1000000 }).map(String),
                usdAmount: fc.double({ min: 0, max: 1000000 }).map(String),
              }),
              tokenOut: fc.record({
                symbol: fc.string({ minLength: 1, maxLength: 10 }),
                address: fc.string({ minLength: 32, maxLength: 44 }),
                amount: fc.double({ min: 0, max: 1000000 }).map(String),
                usdAmount: fc.double({ min: 0, max: 1000000 }).map(String),
              }),
            }),
          }),
          (txData) => {
            const tx = txData as unknown as IWhaleAllTransactionsV2
            const message = formatWhaleAlert(tx)
            
            // Must contain wallet address (shortened)
            expect(message).toMatch(/Wallet:/)
            
            // Must contain token symbol
            expect(message).toMatch(/Token:/)
            
            // Must contain amount
            expect(message).toMatch(/Amount:/)
            
            // Must contain USD value
            expect(message).toMatch(/USD Value:/)
            
            // Must contain transaction type
            expect(message).toMatch(/Type:/)
            expect(message).toMatch(/BUY|SELL|BOTH/)
            
            // Must contain transaction link
            expect(message).toContain('https://solscan.io/tx/')
            
            // Must contain token link
            expect(message).toContain('https://solscan.io/token/')
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should format a typical buy transaction', () => {
      const tx = {
        signature: '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt',
        type: 'buy',
        whale: {
          address: 'So11111111111111111111111111111111111111112',
        },
        transaction: {
          tokenIn: {
            symbol: 'SOL',
            address: 'So11111111111111111111111111111111111111112',
            amount: '100',
            usdAmount: '10000',
          },
          tokenOut: {
            symbol: 'USDC',
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            amount: '10000',
            usdAmount: '10000',
          },
        },
      } as unknown as IWhaleAllTransactionsV2

      const message = formatWhaleAlert(tx)
      
      expect(message).toContain('🐋')
      expect(message).toContain('Whale Alert')
      expect(message).toContain('USDC')
      expect(message).toContain('BUY')
    })
  })

  describe('formatClusterAlert', () => {
    // **Feature: telegram-alert-system, Property 25: Cluster alert message completeness**
    it('should include all required fields for cluster alerts', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 32, maxLength: 44 }),
          fc.stringMatching(/^[a-zA-Z0-9]+$/), // Alphanumeric only to avoid escaping issues
          fc.integer({ min: 2, max: 100 }),
          fc.double({ min: 1000, max: 10000000 }),
          fc.integer({ min: 1, max: 60 }),
          (token, tokenSymbol, whaleCount, totalVolumeUSD, timeWindowMinutes) => {
            const message = formatClusterAlert(
              token,
              tokenSymbol,
              whaleCount,
              totalVolumeUSD,
              timeWindowMinutes
            )
            
            // Must contain whale count
            expect(message).toContain(whaleCount.toString())
            expect(message).toMatch(/Whales/)
            
            // Must contain token symbol (may be escaped, so check for presence)
            // The symbol will be escaped if it contains special chars
            const escapedSymbol = escapeMarkdownV2(tokenSymbol)
            expect(message).toContain(escapedSymbol)
            
            // Must contain total USD volume
            expect(message).toMatch(/\$/)
            
            // Must contain time window
            expect(message).toContain(timeWindowMinutes.toString())
            expect(message).toMatch(/minutes/)
            
            // Must contain token address (shortened)
            expect(message).toMatch(/Token:/)
            
            // Must contain Solscan link
            expect(message).toContain('https://solscan.io/token/')
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should format a typical cluster alert', () => {
      const message = formatClusterAlert(
        'So11111111111111111111111111111111111111112',
        'SOL',
        5,
        45000,
        15
      )
      
      expect(message).toContain('🚨')
      expect(message).toContain('CLUSTER ALERT')
      expect(message).toContain('5 Whales')
      expect(message).toContain('SOL')
      expect(message).toContain('15 minutes')
    })
  })

  describe('formatKOLAlert', () => {
    // **Feature: telegram-alert-system, Property 26: KOL alert message completeness**
    it('should include all required fields for KOL alerts', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\s]+$/), // Alphanumeric and spaces only
          fc.record({
            signature: fc.string({ minLength: 32, maxLength: 88 }),
            type: fc.constantFrom('buy', 'sell', 'both'),
            transaction: fc.record({
              tokenIn: fc.record({
                symbol: fc.stringMatching(/^[A-Z0-9]+$/), // Alphanumeric only
                address: fc.string({ minLength: 32, maxLength: 44 }),
                amount: fc.double({ min: 0, max: 1000000 }).map(String),
                usdAmount: fc.double({ min: 0, max: 1000000 }).map(String),
              }),
              tokenOut: fc.record({
                symbol: fc.stringMatching(/^[A-Z0-9]+$/), // Alphanumeric only
                address: fc.string({ minLength: 32, maxLength: 44 }),
                amount: fc.double({ min: 0, max: 1000000 }).map(String),
                usdAmount: fc.double({ min: 0, max: 1000000 }).map(String),
              }),
            }),
          }),
          (kol, txData) => {
            const tx = txData as unknown as IInfluencerWhaleTransactionsV2
            const message = formatKOLAlert(kol, tx)
            
            // Must contain influencer name (may be escaped)
            expect(message).toMatch(/Influencer:/)
            const escapedKol = escapeMarkdownV2(kol)
            expect(message).toContain(escapedKol)
            
            // Must contain token symbol
            expect(message).toMatch(/Token:/)
            
            // Must contain transaction type
            expect(message).toMatch(/Type:/)
            expect(message).toMatch(/BUY|SELL|BOTH/)
            
            // Must contain amount
            expect(message).toMatch(/Amount:/)
            
            // Must contain USD value
            expect(message).toMatch(/USD Value:/)
            
            // Must contain transaction link
            expect(message).toContain('https://solscan.io/tx/')
            
            // Must contain token link
            expect(message).toContain('https://solscan.io/token/')
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should format a typical KOL alert', () => {
      const tx = {
        signature: '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt',
        type: 'buy',
        transaction: {
          tokenIn: {
            symbol: 'SOL',
            address: 'So11111111111111111111111111111111111111112',
            amount: '100',
            usdAmount: '10000',
          },
          tokenOut: {
            symbol: 'BONK',
            address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
            amount: '1000000',
            usdAmount: '10000',
          },
        },
      } as unknown as IInfluencerWhaleTransactionsV2

      const message = formatKOLAlert('CryptoInfluencer', tx)
      
      expect(message).toContain('⭐')
      expect(message).toContain('KOL Activity Alert')
      expect(message).toContain('CryptoInfluencer')
      expect(message).toContain('BONK')
      expect(message).toContain('BUY')
    })
  })
})
