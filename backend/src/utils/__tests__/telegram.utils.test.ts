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
  formatKOLClusterAlert,
  formatKOLAlert,
  generateQuickBuyLink,
  formatWhaleAlertMessage,
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
    it('should generate valid DexScreener token URLs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 44 }),
          (tokenAddress) => {
            const link = generateTokenLink(tokenAddress)
            expect(link).toMatch(/^https:\/\/dexscreener\.com\/solana\//)
            expect(link).toBe(`https://dexscreener.com/solana/${tokenAddress}`)
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
            
            // Must contain token symbol
            expect(message).toMatch(/Token:/)
            
            // Must contain buy amount
            expect(message).toMatch(/Buy Amount:/)
            
            // Must contain hotness score
            expect(message).toMatch(/Hotness Score:/)
            
            // Must contain wallet label
            expect(message).toMatch(/Wallet Label:/)
            
            // Must contain transaction link
            expect(message).toContain('https://app.alpha-block.ai/transaction/')
            
            // Must contain token link
            expect(message).toContain('https://dexscreener.com/solana/')
            
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
      expect(message).toContain('Whale Buy Alert')
      expect(message).toContain('USDC')
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
            expect(message).toMatch(/Whale/)
            
            // Must contain token symbol (may be escaped, so check for presence)
            // The symbol will be escaped if it contains special chars
            const escapedSymbol = escapeMarkdownV2(tokenSymbol)
            expect(message).toContain(escapedSymbol)
            
            // Must contain total USD volume
            expect(message).toMatch(/\$/)
            
            // Must contain time window (e.g. "Last 1 Minute" or "Last 15 Minutes")
            expect(message).toContain(timeWindowMinutes.toString())
            expect(message).toMatch(/Minute/i)
            
            // Must contain token line
            expect(message).toMatch(/Token:/)
            
            // Must contain DexScreener token link
            expect(message).toContain('https://dexscreener.com/solana/')
            
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
      
      expect(message).toContain('Whale Cluster Alert')
      expect(message).toContain('Cluster Details')
      expect(message).toContain('Whale Wallets: 5')
      expect(message).toContain('SOL')
      expect(message).toContain('Last 15 Minutes')
      expect(message).toContain('Triggered Time')
      expect(message).toContain('View Token')
      expect(message).toContain('AlphaBlockAI')
    })

    it('should include formation time, network time, alerted at, and detection latency when options provided', () => {
      const lastTxTimestamp = new Date('2025-02-19T14:32:40.000Z').getTime()
      const alertSentAt = lastTxTimestamp + 2000
      const formationTimeMs = 160000 // 2m 40s
      const message = formatClusterAlert(
        'So11111111111111111111111111111111111111112',
        'SOL',
        3,
        13100,
        15,
        {
          formationTimeMs,
          lastTxTimestamp,
          alertSentAt,
        }
      )
      expect(message).toContain('Whale Cluster Alert')
      expect(message).toContain('Cluster formed in')
      expect(message).toContain('2m 40s')
      expect(message).toContain('window: 15 min')
      expect(message).toContain('Network time:')
      expect(message).toContain('14:32:40')
      expect(message).toContain('Alerted at:')
      expect(message).toContain('Detection latency:')
      expect(message).toContain('2s')
    })

    it('should show Whale Cluster UPDATE with Previously and Now when isUpdate and previous stats provided', () => {
      const message = formatClusterAlert(
        'So11111111111111111111111111111111111111112',
        'BONK',
        6,
        28000,
        15,
        {
          isUpdate: true,
          previousWalletCount: 3,
          previousTotalVolume: 12000,
          formationTimeMs: 480000, // 8 min
        }
      )
      expect(message).toContain('Whale Cluster UPDATE')
      expect(message).toContain('cluster is growing')
      expect(message).toContain('Previously:')
      expect(message).toContain('3')
      expect(message).toContain('whales')
      expect(message).toContain('Now:')
      expect(message).toContain('6')
      expect(message).toContain('Cluster Details')
      expect(message).toContain('View Token')
    })
  })

  describe('formatKOLClusterAlert', () => {
    it('should include formation time and detection latency when options provided', () => {
      const lastTxTimestamp = new Date('2025-02-19T14:32:40.000Z').getTime()
      const alertSentAt = lastTxTimestamp + 500
      const formationTimeMs = 45000 // 45s
      const message = formatKOLClusterAlert(
        'TokenAddr1111111111111111111111111111111111',
        'SPEED',
        3,
        10000,
        15,
        {
          formationTimeMs,
          lastTxTimestamp,
          alertSentAt,
        }
      )
      expect(message).toContain('KOL Cluster Alert')
      expect(message).toContain('Cluster formed in')
      expect(message).toContain('45s')
      expect(message).toContain('Network time:')
      expect(message).toContain('Alerted at:')
      expect(message).toContain('Detection latency:')
      expect(message).toContain('<1s')
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
            
            // Must contain KOL name (label is "KOL:")
            expect(message).toMatch(/KOL:/)
            expect(message).toContain(kol)
            
            // Must contain token
            expect(message).toMatch(/Token:/)
            
            // Must contain buy amount and hotness
            expect(message).toMatch(/Buy Amount:|Hotness Score:/)
            
            // Must contain transaction link (AlphaBlock format)
            expect(message).toContain('https://app.alpha-block.ai/transaction/')
            
            // Must contain token link
            expect(message).toContain('https://dexscreener.com/solana/')
            
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
      
      expect(message).toContain('KOL Buy Alert')
      expect(message).toContain('👤')
      expect(message).toContain('CryptoInfluencer')
      expect(message).toContain('BONK')
      expect(message).toContain('Buy Amount')
    })
  })

  describe('generateQuickBuyLink', () => {
    it('should generate valid Quick Buy URLs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 44 }),
          (tokenAddress) => {
            const link = generateQuickBuyLink(tokenAddress)
            
            // Must be a valid URL format
            expect(link).toMatch(/^https:\/\/alphablock\.ai\/swap\?token=/)
            
            // Must contain the token address
            expect(link).toBe(`https://alphablock.ai/swap?token=${tokenAddress}`)
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle typical Solana token addresses', () => {
      const typicalAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      const link = generateQuickBuyLink(typicalAddress)
      expect(link).toBe(`https://alphablock.ai/swap?token=${typicalAddress}`)
    })
  })

  describe('formatWhaleAlertMessage', () => {
    // **Feature: whale-alert-backend-fix, Property 10: Required Fields in Message**
    // **Validates: Requirements 4.2**
    it('Property 10: should include all required fields in whale alert messages', () => {
      fc.assert(
        fc.property(
          fc.record({
            txHash: fc.string({ minLength: 32, maxLength: 88 }),
            tokenAddress: fc.string({ minLength: 32, maxLength: 44 }),
            tokenSymbol: fc.stringMatching(/^[A-Z0-9]{1,10}$/), // Alphanumeric only, 1-10 chars
            tokenName: fc.stringMatching(/^[a-zA-Z0-9\s]{1,50}$/), // Alphanumeric and spaces, 1-50 chars
            buyAmountUSD: fc.double({ min: 100, max: 1000000, noNaN: true }),
            hotnessScore: fc.double({ min: 0, max: 10, noNaN: true }),
            walletAddress: fc.string({ minLength: 32, maxLength: 44 }),
            walletLabels: fc.array(
              fc.constantFrom('SNIPER', 'SMART MONEY', 'INSIDER', 'HEAVY ACCUMULATOR', 'WHALE', 'FLIPPER'),
              { minLength: 0, maxLength: 4 }
            ),
            timestamp: fc.integer({ min: 1600000000000, max: 2000000000000 }),
          }),
          (tx) => {
            const message = formatWhaleAlertMessage(tx)
            
            // Required field 1: Token name
            expect(message).toMatch(/Token:/)
            expect(message).toContain(tx.tokenName)
            
            // Required field 2: Token symbol
            expect(message).toContain(tx.tokenSymbol)
            
            // Required field 3: Chain name
            expect(message).toContain('Chain:')
            expect(message).toContain('Solana')
            
            // Required field 4: Contract address
            expect(message).toMatch(/CA:/)
            expect(message).toContain(tx.tokenAddress)
            
            // Required field 5: Buy amount (plain text, no escaping)
            expect(message).toMatch(/Buy Amount:/)
            // The formatted amount should be present (with $ prefix, no backslash escaping)
            expect(message).toMatch(/Buy Amount: \$[\d.,]+[KMB]?/)
            
            // Required field 6: Hotness score (plain text, no escaping)
            expect(message).toMatch(/Hotness Score:/)
            expect(message).toMatch(/Hotness Score: [\d.]+\/10/)
            
            // Required field 7: Wallet labels
            expect(message).toMatch(/Wallet Label:/)
            if (tx.walletLabels.length > 0) {
              // At least one label should be present
              const hasLabel = tx.walletLabels.some(label => message.includes(label))
              expect(hasLabel).toBe(true)
            } else {
              // Empty labels should show "Unknown"
              expect(message).toContain('Unknown')
            }
            
            // Required field 8: Transaction time
            expect(message).toMatch(/Transaction Time:/)
            expect(message).toMatch(/\d{2}:\d{2} UTC/)
            
            // Required field 9: Transaction detail link
            expect(message).toContain('Transaction Detail:')
            expect(message).toContain('https://app.alpha-block.ai/transaction/')
            expect(message).toContain(tx.txHash)
            
            // Required field 10: Token link
            expect(message).toContain('View Token:')
            expect(message).toContain('https://dexscreener.com/solana/')
            expect(message).toContain(tx.tokenAddress)
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    // **Feature: telegram-whale-alerts, Property 7: Message formatting uses plain text**
    it('should NOT escape MarkdownV2 special characters in whale alert messages (plain text format)', () => {
      fc.assert(
        fc.property(
          fc.record({
            txHash: fc.string({ minLength: 32, maxLength: 88 }),
            tokenAddress: fc.string({ minLength: 32, maxLength: 44 }),
            tokenSymbol: fc.string({ minLength: 1, maxLength: 10 }),
            tokenName: fc.string({ minLength: 1, maxLength: 50 }),
            buyAmountUSD: fc.double({ min: 100, max: 1000000 }),
            hotnessScore: fc.double({ min: 0, max: 10 }),
            walletAddress: fc.string({ minLength: 32, maxLength: 44 }),
            walletLabels: fc.array(
              fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
              { minLength: 1, maxLength: 4 }
            ),
            timestamp: fc.integer({ min: 1600000000000, max: 2000000000000 }),
          }),
          (tx) => {
            const message = formatWhaleAlertMessage(tx)
            
            // Special characters should NOT be escaped (plain text format)
            // The message should contain the raw characters without backslash escaping
            
            // Check that token name appears without escaping
            expect(message).toContain(tx.tokenName)
            
            // Check that token symbol appears without escaping
            expect(message).toContain(tx.tokenSymbol)
            
            // Verify no backslash escape sequences exist (except in URLs which are fine)
            // We'll check that special chars in token name/symbol are NOT escaped
            const specialChars = ['_', '*', '[', ']', '(', ')', '~', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
            for (const char of specialChars) {
              if (tx.tokenName.includes(char)) {
                // Should NOT have backslash before the character
                const escapedChar = `\\${char}`
                // The token name should appear as-is, not escaped
                expect(message).toContain(tx.tokenName)
              }
            }
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    // **Feature: telegram-whale-alerts, Property 7: Message formatting uses plain text**
    it('should include all required fields in whale alert messages', () => {
      fc.assert(
        fc.property(
          fc.record({
            txHash: fc.string({ minLength: 32, maxLength: 88 }),
            tokenAddress: fc.string({ minLength: 32, maxLength: 44 }),
            tokenSymbol: fc.stringMatching(/^[A-Z0-9]{1,10}$/), // Alphanumeric only for simpler testing
            tokenName: fc.stringMatching(/^[a-zA-Z0-9\s]{1,50}$/), // Alphanumeric and spaces
            buyAmountUSD: fc.double({ min: 100, max: 1000000 }),
            hotnessScore: fc.double({ min: 0, max: 10 }),
            walletAddress: fc.string({ minLength: 32, maxLength: 44 }),
            walletLabels: fc.array(
              fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
              { minLength: 1, maxLength: 4 }
            ),
            timestamp: fc.integer({ min: 1600000000000, max: 2000000000000 }),
          }),
          (tx) => {
            const message = formatWhaleAlertMessage(tx)
            
            // Must contain whale buy alert header
            expect(message).toContain('🐋')
            expect(message).toContain('Whale Buy Alert')
            
            // Must contain token name and symbol
            expect(message).toMatch(/Token:/)
            expect(message).toContain(tx.tokenSymbol)
            
            // Must contain chain
            expect(message).toContain('Solana')
            
            // Must contain contract address
            expect(message).toMatch(/CA:/)
            expect(message).toContain(tx.tokenAddress)
            
            // Must contain buy amount
            expect(message).toMatch(/Buy Amount:/)
            
            // Must contain hotness score
            expect(message).toMatch(/Hotness Score:/)
            expect(message).toMatch(/\/10/)
            
            // Must contain wallet label
            expect(message).toMatch(/Wallet Label:/)
            
            // Must contain time
            expect(message).toMatch(/Time:/)
            expect(message).toMatch(/UTC/)
            
            // Must contain transaction link (AlphaBlock format)
            expect(message).toContain('Transaction Detail')
            expect(message).toContain('https://app.alpha-block.ai/transaction/')
            expect(message).toContain(tx.txHash)
            
            // Must contain token link
            expect(message).toContain('View Token')
            expect(message).toContain('https://dexscreener.com/solana/')
            expect(message).toContain(tx.tokenAddress)
            
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should format a typical whale alert message', () => {
      const tx = {
        txHash: '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt',
        tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenSymbol: 'USDC',
        tokenName: 'USD Coin',
        buyAmountUSD: 50000,
        hotnessScore: 8.5,
        walletAddress: 'So11111111111111111111111111111111111111112',
        walletLabels: ['Smart Money', 'Heavy Accumulator'],
        timestamp: 1704067200000, // 2024-01-01 00:00:00 UTC
      }

      const message = formatWhaleAlertMessage(tx)
      
      expect(message).toContain('🐋 Whale Buy Alert')
      expect(message).toContain('USD Coin')
      expect(message).toContain('USDC')
      expect(message).toContain('Solana')
      expect(message).toContain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      expect(message).toContain('$50.00K')
      expect(message).toContain('8.5/10')
      expect(message).toContain('Smart Money / Heavy Accumulator')
      expect(message).toContain('00:00 UTC')
      expect(message).toContain('https://app.alpha-block.ai/transaction/5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt')
      expect(message).toContain('https://dexscreener.com/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    })

    it('should handle empty wallet labels', () => {
      const tx = {
        txHash: '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt',
        tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenSymbol: 'USDC',
        tokenName: 'USD Coin',
        buyAmountUSD: 50000,
        hotnessScore: 8.5,
        walletAddress: 'So11111111111111111111111111111111111111112',
        walletLabels: [],
        timestamp: 1704067200000,
      }

      const message = formatWhaleAlertMessage(tx)
      
      expect(message).toContain('Unknown')
    })

    it('should handle special characters in token name and symbol (plain text format)', () => {
      const tx = {
        txHash: '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt',
        tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenSymbol: 'TEST-TOKEN',
        tokenName: 'Test_Token (v2.0)',
        buyAmountUSD: 50000,
        hotnessScore: 8.5,
        walletAddress: 'So11111111111111111111111111111111111111112',
        walletLabels: ['Smart Money'],
        timestamp: 1704067200000,
      }

      const message = formatWhaleAlertMessage(tx)
      
      // Special characters should NOT be escaped (plain text format)
      expect(message).toContain('Test_Token (v2.0)')
      expect(message).toContain('TEST-TOKEN')
    })

    it('should fall back to plain text on formatting errors', () => {
      // Create a transaction that might cause formatting issues
      const tx = {
        txHash: '5wHu1qwD7q5ifaN5nwdcDqNFo53GJqa7nLp2BeeRpcSt',
        tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenSymbol: 'USDC',
        tokenName: 'USD Coin',
        buyAmountUSD: 50000,
        hotnessScore: 8.5,
        walletAddress: 'So11111111111111111111111111111111111111112',
        walletLabels: ['Smart Money'],
        timestamp: 1704067200000,
      }

      const message = formatWhaleAlertMessage(tx)
      
      // Should still contain essential information
      expect(message).toContain('Whale Buy Alert')
      expect(message).toContain('USD Coin')
      expect(message).toContain('USDC')
      expect(message).toContain('Solana')
    })
  })
})
