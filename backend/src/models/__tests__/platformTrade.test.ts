import * as fc from 'fast-check'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import PlatformTradeModel, {
  IPlatformTrade,
} from '../platformTrade.model'

dotenv.config()

/**
 * Feature: jupiter-swap-engine, Property 3: Signature uniqueness enforcement
 * Validates: Requirements 3.3
 *
 * Property: For any trade tracking request with a signature that already exists
 * in the database, the system should reject the save operation and return an error.
 */

describe('PlatformTrade Model - Property-Based Tests', () => {
  beforeAll(async () => {
    // Connect to MongoDB
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/whale-tracker-test'
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoURI)
    }
  })

  afterAll(async () => {
    // Disconnect from MongoDB
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    // Clear the collection before each test
    await PlatformTradeModel.deleteMany({})
  })

  describe('Property 3: Signature uniqueness enforcement', () => {
    /**
     * Feature: jupiter-swap-engine, Property 3: Signature uniqueness enforcement
     */
    test(
      'should reject duplicate signatures across all trade data',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate random trade data
            fc.record({
              signature: fc.base64String({ minLength: 64, maxLength: 88 }), // Solana signature length
              walletAddress: fc.base64String({ minLength: 32, maxLength: 44 }), // Solana address length
              inputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              outputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              inputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              outputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              platformFee: fc.double({ min: 0, max: 10000 }),
              timestamp: fc.date(),
            }),
            // Generate different trade data but with the same signature
            fc.record({
              walletAddress: fc.base64String({ minLength: 32, maxLength: 44 }),
              inputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              outputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              inputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              outputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              platformFee: fc.double({ min: 0, max: 10000 }),
              timestamp: fc.date(),
            }),
            async (firstTrade, secondTradeData) => {
              try {
                // Save the first trade
                const trade1 = new PlatformTradeModel(firstTrade)
                await trade1.save()

                // Attempt to save a second trade with the same signature
                const trade2 = new PlatformTradeModel({
                  ...secondTradeData,
                  signature: firstTrade.signature, // Use the same signature
                })

                // Verify that the second save attempt is rejected
                await expect(trade2.save()).rejects.toThrow()

                // Verify that only one trade exists in the database
                const count = await PlatformTradeModel.countDocuments({
                  signature: firstTrade.signature,
                })
                expect(count).toBe(1)
              } finally {
                // Clean up for next iteration
                await PlatformTradeModel.deleteMany({
                  signature: firstTrade.signature,
                })
              }
            },
          ),
          { numRuns: 20 }, // Reduced from 100 for faster execution with real DB
        )
      },
      60000,
    ) // 60 second timeout

    test(
      'should allow trades with different signatures',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.uniqueArray(
              fc.record({
                signature: fc.base64String({ minLength: 64, maxLength: 88 }),
                walletAddress: fc.base64String({ minLength: 32, maxLength: 44 }),
                inputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
                outputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
                inputAmount: fc.double({ min: 0.000001, max: 1000000 }),
                outputAmount: fc.double({ min: 0.000001, max: 1000000 }),
                platformFee: fc.double({ min: 0, max: 10000 }),
                timestamp: fc.date(),
              }),
              {
                minLength: 2,
                maxLength: 3, // Reduced from 5 for faster execution
                selector: (trade) => trade.signature,
              },
            ),
            async (trades) => {
              try {
                // Save trades one by one to avoid bulk insert issues
                const savedTrades = [];
                for (const trade of trades) {
                  const savedTrade = await new PlatformTradeModel(trade).save();
                  savedTrades.push(savedTrade);
                }

                // Verify all trades were saved
                expect(savedTrades.length).toBe(trades.length)

                // Verify all trades can be retrieved
                const count = await PlatformTradeModel.countDocuments({
                  signature: { $in: trades.map((t) => t.signature) },
                })
                expect(count).toBe(trades.length)
              } finally {
                // Clean up
                await PlatformTradeModel.deleteMany({
                  signature: { $in: trades.map((t) => t.signature) },
                })
              }
            },
          ),
          { numRuns: 5 }, // Further reduced for faster execution with real DB
        )
      },
      60000,
    ) // 60 second timeout
  })

  describe('Property 20: Priority level tracking persistence', () => {
    /**
     * Feature: jupiter-swap-engine, Property 20: Priority level tracking persistence
     */
    test(
      'should save priority level to PlatformTrade model for all valid priority levels',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate random trade data with priority levels
            fc.record({
              signature: fc.base64String({ minLength: 64, maxLength: 88 }), // Solana signature length
              walletAddress: fc.base64String({ minLength: 32, maxLength: 44 }), // Solana address length
              inputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              outputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              inputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              outputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              platformFee: fc.double({ min: 0, max: 10000 }),
              timestamp: fc.date(),
              priorityLevel: fc.constantFrom('Low', 'Medium', 'High', 'VeryHigh'),
            }),
            async (tradeData) => {
              try {
                // Save the trade with priority level
                const trade = new PlatformTradeModel(tradeData)
                const savedTrade = await trade.save()

                // Verify that the trade was saved successfully
                expect(savedTrade).toBeDefined()
                expect(savedTrade.signature).toBe(tradeData.signature)
                expect(savedTrade.priorityLevel).toBe(tradeData.priorityLevel)

                // Retrieve the trade from database and verify priority level is persisted
                const retrievedTrade = await PlatformTradeModel.findOne({
                  signature: tradeData.signature,
                })

                expect(retrievedTrade).toBeDefined()
                expect(retrievedTrade!.priorityLevel).toBe(tradeData.priorityLevel)

                // Verify the priority level is one of the valid enum values
                expect(['Low', 'Medium', 'High', 'VeryHigh']).toContain(
                  retrievedTrade!.priorityLevel,
                )
              } finally {
                // Clean up for next iteration
                await PlatformTradeModel.deleteMany({
                  signature: tradeData.signature,
                })
              }
            },
          ),
          { numRuns: 5 }, // Reduced to 5 runs for faster execution
        )
      },
      30000,
    ) // Reduced timeout to 30 seconds

    test(
      'should allow trades without priority level (optional field)',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate random trade data without priority level
            fc.record({
              signature: fc.base64String({ minLength: 64, maxLength: 88 }),
              walletAddress: fc.base64String({ minLength: 32, maxLength: 44 }),
              inputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              outputMint: fc.base64String({ minLength: 32, maxLength: 44 }),
              inputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              outputAmount: fc.double({ min: 0.000001, max: 1000000 }),
              platformFee: fc.double({ min: 0, max: 10000 }),
              timestamp: fc.date(),
              // No priorityLevel field
            }),
            async (tradeData) => {
              try {
                // Save the trade without priority level
                const trade = new PlatformTradeModel(tradeData)
                const savedTrade = await trade.save()

                // Verify that the trade was saved successfully
                expect(savedTrade).toBeDefined()
                expect(savedTrade.signature).toBe(tradeData.signature)
                expect(savedTrade.priorityLevel).toBeUndefined()

                // Retrieve the trade from database and verify priority level is undefined
                const retrievedTrade = await PlatformTradeModel.findOne({
                  signature: tradeData.signature,
                })

                expect(retrievedTrade).toBeDefined()
                expect(retrievedTrade!.priorityLevel).toBeUndefined()
              } finally {
                // Clean up for next iteration
                await PlatformTradeModel.deleteMany({
                  signature: tradeData.signature,
                })
              }
            },
          ),
          { numRuns: 5 }, // Reduced to 5 runs for faster execution
        )
      },
      30000,
    ) // Reduced timeout to 30 seconds
  })
})
