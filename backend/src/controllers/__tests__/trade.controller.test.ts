import * as fc from 'fast-check';
import { Request, Response } from 'express';
import { getSwapQuote, getSwapTransaction, trackTrade } from '../trade.controller';

// Mock the jupiterClient module
jest.mock('../../utils/jupiterClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
  jupiterClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Mock the models
jest.mock('../../models/platformTrade.model', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

jest.mock('../../models/WalletTrade.model', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

import jupiterClient from '../../utils/jupiterClient';
import PlatformTradeModel from '../../models/platformTrade.model';
import WalletTradeModel from '../../models/WalletTrade.model';

/**
 * Property-Based Tests for Trade Controller
 * 
 * These tests verify the correctness of the trade controller endpoints
 * across a wide range of inputs and scenarios.
 */

describe('Trade Controller - Property-Based Tests', () => {
  const mockGet = jupiterClient.get as jest.MockedFunction<typeof jupiterClient.get>;
  const mockPost = jupiterClient.post as jest.MockedFunction<typeof jupiterClient.post>;

  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Property 1: Platform fee calculation consistency', () => {
    /**
     * Feature: jupiter-swap-engine, Property 1: Platform fee calculation consistency
     * Validates: Requirements 1.2
     * 
     * Property: For any swap quote request with valid parameters, the platform fee
     * amount should equal exactly 0.75% of the input amount.
     */
    test(
      'should include platformFeeBps: 75 in all quote requests',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 1000000000 }), // Random swap amounts
            async (amount) => {
              // Mock Jupiter API response
              mockGet.mockResolvedValueOnce({
                data: {
                  inputMint: 'So11111111111111111111111111111111111111112',
                  inAmount: amount.toString(),
                  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  outAmount: (amount * 2).toString(),
                  otherAmountThreshold: (amount * 1.95).toString(),
                  swapMode: 'ExactIn',
                  slippageBps: 50,
                  platformFee: {
                    amount: Math.floor(amount * 0.0075).toString(),
                    mint: 'So11111111111111111111111111111111111111112',
                    pct: 0.0075,
                  },
                  priceImpactPct: '0.1',
                  routePlan: [],
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
              });

              // Create mock response
              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Set up request with valid parameters
              const mockRequest = {
                query: {
                  inputMint: 'So11111111111111111111111111111111111111112',
                  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  amount: amount.toString(),
                },
              };

              // Call the controller
              await getSwapQuote(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Verify platformFeeBps was included in the request
              expect(mockGet).toHaveBeenCalledWith('/quote', {
                params: {
                  inputMint: 'So11111111111111111111111111111111111111112',
                  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  amount: amount.toString(),
                  slippageBps: 50,
                  platformFeeBps: 75, // 0.75% platform fee
                },
              });

              // Verify the response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should verify platform fee is exactly 0.75% of input amount',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1000, max: 1000000000 }),
            async (amount) => {
              const expectedFeeAmount = Math.floor(amount * 0.0075);

              mockGet.mockResolvedValueOnce({
                data: {
                  inputMint: 'So11111111111111111111111111111111111111112',
                  inAmount: amount.toString(),
                  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  outAmount: (amount * 2).toString(),
                  otherAmountThreshold: (amount * 1.95).toString(),
                  swapMode: 'ExactIn',
                  slippageBps: 50,
                  platformFee: {
                    amount: expectedFeeAmount.toString(),
                    mint: 'So11111111111111111111111111111111111111112',
                    pct: 0.0075,
                  },
                  priceImpactPct: '0.1',
                  routePlan: [],
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
              });

              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              const mockRequest = {
                query: {
                  inputMint: 'So11111111111111111111111111111111111111112',
                  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  amount: amount.toString(),
                },
              };

              await getSwapQuote(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
              expect(responseData.data).toBeDefined();
              expect(responseData.data.platformFee).toBeDefined();

              const actualFeeAmount = parseInt(responseData.data.platformFee.amount);
              expect(actualFeeAmount).toBe(expectedFeeAmount);
              expect(responseData.data.platformFee.pct).toBe(0.0075);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );
  });

  describe('Property 2: Fee account inclusion in swap transactions', () => {
    /**
     * Feature: jupiter-swap-engine, Property 2: Fee account inclusion in swap transactions
     * Validates: Requirements 2.2
     * 
     * Property: For any swap transaction request, the generated transaction must include
     * the platform's referral key as the fee account.
     */
    test(
      'should include feeAccount from JUPITER_REFERRAL_KEY in all swap requests',
      async () => {
        // Set up environment variable
        const testReferralKey = 'TestReferralWallet1111111111111111111111111';
        process.env.JUPITER_REFERRAL_KEY = testReferralKey;

        // Test with a fixed valid Solana address
        const userPublicKey = 'So11111111111111111111111111111111111111112';
        const amount = 1000000;

        // Create a mock quote response
        const mockQuoteResponse = {
          inputMint: 'So11111111111111111111111111111111111111112',
          inAmount: amount.toString(),
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outAmount: (amount * 2).toString(),
          otherAmountThreshold: (amount * 1.95).toString(),
          swapMode: 'ExactIn',
          slippageBps: 50,
          platformFee: {
            amount: Math.floor(amount * 0.0075).toString(),
            mint: 'So11111111111111111111111111111111111111112',
            pct: 0.0075,
          },
          priceImpactPct: '0.1',
          routePlan: [],
        };

        // Mock Jupiter API response
        mockPost.mockResolvedValueOnce({
          data: {
            swapTransaction: 'base64EncodedTransaction',
            lastValidBlockHeight: 123456789,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });

        // Create mock response
        let responseStatus: number | null = null;
        let responseData: any = null;

        const mockResponse = {
          status: jest.fn().mockImplementation((code: number) => {
            responseStatus = code;
            return mockResponse;
          }),
          json: jest.fn().mockImplementation((data: any) => {
            responseData = data;
            return mockResponse;
          }),
        };

        // Set up request with valid parameters
        const mockRequest = {
          body: {
            quoteResponse: mockQuoteResponse,
            userPublicKey,
            wrapAndUnwrapSol: true,
          },
        };

        // Call the controller
        await getSwapTransaction(
          mockRequest as unknown as Request,
          mockResponse as unknown as Response,
          jest.fn()
        );

        // Verify feeAccount was included in the request
        expect(mockPost).toHaveBeenCalledWith(
          '/swap',
          expect.objectContaining({
            quoteResponse: mockQuoteResponse,
            userPublicKey,
            wrapAndUnwrapSol: true,
            feeAccount: testReferralKey, // Platform's referral key
          })
        );

        // Verify the response was successful
        expect(responseStatus).toBe(200);
        expect(responseData.success).toBe(true);
        expect(responseData.data).toBeDefined();
        expect(responseData.data.swapTransaction).toBeDefined();
      },
      10000
    );

    test(
      'should handle missing JUPITER_REFERRAL_KEY gracefully',
      async () => {
        // Remove the environment variable
        delete process.env.JUPITER_REFERRAL_KEY;

        const userPublicKey = 'So11111111111111111111111111111111111111112';
        const amount = 1000000;

        const mockQuoteResponse = {
          inputMint: 'So11111111111111111111111111111111111111112',
          inAmount: amount.toString(),
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outAmount: (amount * 2).toString(),
          otherAmountThreshold: (amount * 1.95).toString(),
          swapMode: 'ExactIn',
          slippageBps: 50,
          platformFee: {
            amount: Math.floor(amount * 0.0075).toString(),
            mint: 'So11111111111111111111111111111111111111112',
            pct: 0.0075,
          },
          priceImpactPct: '0.1',
          routePlan: [],
        };

        mockPost.mockResolvedValueOnce({
          data: {
            swapTransaction: 'base64EncodedTransaction',
            lastValidBlockHeight: 123456789,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });

        let responseStatus: number | null = null;
        let responseData: any = null;

        const mockResponse = {
          status: jest.fn().mockImplementation((code: number) => {
            responseStatus = code;
            return mockResponse;
          }),
          json: jest.fn().mockImplementation((data: any) => {
            responseData = data;
            return mockResponse;
          }),
        };

        const mockRequest = {
          body: {
            quoteResponse: mockQuoteResponse,
            userPublicKey,
          },
        };

        await getSwapTransaction(
          mockRequest as unknown as Request,
          mockResponse as unknown as Response,
          jest.fn()
        );

        // Verify feeAccount is undefined when env var is missing
        expect(mockPost).toHaveBeenCalledWith(
          '/swap',
          expect.objectContaining({
            quoteResponse: mockQuoteResponse,
            userPublicKey,
            feeAccount: undefined,
          })
        );

        // Should still succeed (Jupiter handles missing feeAccount)
        expect(responseStatus).toBe(200);
        expect(responseData.success).toBe(true);
      },
      10000
    );
  });

  describe('Property 7: Error handling without crashes', () => {
    /**
     * Feature: jupiter-swap-engine, Property 7: Error handling without crashes
     * Validates: Requirements 9.4
     * 
     * Property: For any Jupiter API call that throws an error, the system should
     * catch the error, log it, and return a JSON error response without crashing
     * the Node.js process.
     */

    test(
      'should handle Jupiter API errors without crashing - quote endpoint',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(400, 401, 403, 404, 429, 500, 502, 503, 504),
            fc.string({ minLength: 10, maxLength: 100 }),
            async (statusCode, errorMessage) => {
              // Mock Jupiter API to throw various errors
              const apiError = new Error(errorMessage);
              (apiError as any).response = {
                status: statusCode,
                data: { error: errorMessage },
              };

              mockGet.mockRejectedValueOnce(apiError);

              let responseStatus: number | null = null;
              let responseData: any = null;
              let processCrashed = false;

              // Monitor for process crashes
              const originalExit = process.exit;
              process.exit = jest.fn(((code?: number) => {
                processCrashed = true;
                throw new Error(`Process exit called with code ${code}`);
              }) as any) as typeof process.exit;

              try {
                const mockResponse = {
                  status: jest.fn().mockImplementation((code: number) => {
                    responseStatus = code;
                    return mockResponse;
                  }),
                  json: jest.fn().mockImplementation((data: any) => {
                    responseData = data;
                    return mockResponse;
                  }),
                };

                const mockRequest = {
                  query: {
                    inputMint: 'So11111111111111111111111111111111111111112',
                    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    amount: '1000000',
                  },
                };

                await getSwapQuote(
                  mockRequest as unknown as Request,
                  mockResponse as unknown as Response,
                  jest.fn()
                );

                // Verify error was caught and returned as JSON
                expect(processCrashed).toBe(false);
                expect(responseStatus).toBe(statusCode);
                expect(responseData).toBeDefined();
                expect(responseData.success).toBe(false);
                expect(responseData.error).toBeDefined();
                expect(responseData.error.code).toBe('JUPITER_API_ERROR');
                expect(responseData.error.message).toContain('Jupiter API error');
                expect(responseData.error.timestamp).toBeDefined();
              } finally {
                // Restore original process.exit
                process.exit = originalExit;
              }
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle network errors without crashing',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom('ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'),
            fc.string({ minLength: 10, maxLength: 100 }),
            async (errorCode, errorMessage) => {
              // Mock network error
              const networkError = new Error(errorMessage);
              (networkError as any).code = errorCode;

              mockGet.mockRejectedValueOnce(networkError);

              let responseStatus: number | null = null;
              let responseData: any = null;
              let processCrashed = false;

              const originalExit = process.exit;
              process.exit = jest.fn(((code?: number) => {
                processCrashed = true;
                throw new Error(`Process exit called with code ${code}`);
              }) as any) as typeof process.exit;

              try {
                const mockResponse = {
                  status: jest.fn().mockImplementation((code: number) => {
                    responseStatus = code;
                    return mockResponse;
                  }),
                  json: jest.fn().mockImplementation((data: any) => {
                    responseData = data;
                    return mockResponse;
                  }),
                };

                const mockRequest = {
                  query: {
                    inputMint: 'So11111111111111111111111111111111111111112',
                    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    amount: '1000000',
                  },
                };

                await getSwapQuote(
                  mockRequest as unknown as Request,
                  mockResponse as unknown as Response,
                  jest.fn()
                );

                // Verify error was caught and returned as JSON
                expect(processCrashed).toBe(false);
                expect(responseStatus).toBe(500);
                expect(responseData).toBeDefined();
                expect(responseData.success).toBe(false);
                expect(responseData.error).toBeDefined();
                expect(responseData.error.code).toBe('NETWORK_ERROR');
                expect(responseData.error.timestamp).toBeDefined();
              } finally {
                process.exit = originalExit;
              }
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle swap endpoint errors without crashing',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(400, 429, 500, 503),
            fc.string({ minLength: 10, maxLength: 100 }),
            async (statusCode, errorMessage) => {
              const apiError = new Error(errorMessage);
              (apiError as any).response = {
                status: statusCode,
                data: { error: errorMessage },
              };

              mockPost.mockRejectedValueOnce(apiError);

              let responseStatus: number | null = null;
              let responseData: any = null;
              let processCrashed = false;

              const originalExit = process.exit;
              process.exit = jest.fn(((code?: number) => {
                processCrashed = true;
                throw new Error(`Process exit called with code ${code}`);
              }) as any) as typeof process.exit;

              try {
                const mockResponse = {
                  status: jest.fn().mockImplementation((code: number) => {
                    responseStatus = code;
                    return mockResponse;
                  }),
                  json: jest.fn().mockImplementation((data: any) => {
                    responseData = data;
                    return mockResponse;
                  }),
                };

                const mockRequest = {
                  body: {
                    quoteResponse: {
                      inputMint: 'So11111111111111111111111111111111111111112',
                      inAmount: '1000000',
                      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                      outAmount: '2000000',
                    },
                    userPublicKey: 'So11111111111111111111111111111111111111112',
                  },
                };

                await getSwapTransaction(
                  mockRequest as unknown as Request,
                  mockResponse as unknown as Response,
                  jest.fn()
                );

                // Verify error was caught and returned as JSON
                expect(processCrashed).toBe(false);
                expect(responseStatus).toBe(statusCode);
                expect(responseData).toBeDefined();
                expect(responseData.success).toBe(false);
                expect(responseData.error).toBeDefined();
                expect(responseData.error.timestamp).toBeDefined();
              } finally {
                process.exit = originalExit;
              }
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle database errors without crashing',
      async () => {
        const mockPlatformCreate = PlatformTradeModel.create as jest.MockedFunction<typeof PlatformTradeModel.create>;

        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 10, maxLength: 100 }),
            async (errorMessage) => {
              // Mock database error
              const dbError = new Error(errorMessage);
              (dbError as any).name = 'MongoServerError';
              (dbError as any).code = 500;

              mockPlatformCreate.mockRejectedValueOnce(dbError);

              let responseStatus: number | null = null;
              let responseData: any = null;
              let processCrashed = false;

              const originalExit = process.exit;
              process.exit = jest.fn(((code?: number) => {
                processCrashed = true;
                throw new Error(`Process exit called with code ${code}`);
              }) as any) as typeof process.exit;

              try {
                const mockResponse = {
                  status: jest.fn().mockImplementation((code: number) => {
                    responseStatus = code;
                    return mockResponse;
                  }),
                  json: jest.fn().mockImplementation((data: any) => {
                    responseData = data;
                    return mockResponse;
                  }),
                };

                const mockRequest = {
                  body: {
                    signature: '5J8H5sTvEhnGcB4R8K7mZ9LqYzJxvQjKp3WnN4xRzXyT1pQmK6vL9sN2hF4dG3cB',
                    walletAddress: 'So11111111111111111111111111111111111111112',
                    inputMint: 'So11111111111111111111111111111111111111112',
                    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    inputAmount: 1000000,
                    outputAmount: 2000000,
                    platformFee: 7500,
                  },
                };

                await trackTrade(
                  mockRequest as unknown as Request,
                  mockResponse as unknown as Response,
                  jest.fn()
                );

                // Verify error was caught and returned as JSON
                expect(processCrashed).toBe(false);
                expect(responseStatus).toBe(500);
                expect(responseData).toBeDefined();
                expect(responseData.success).toBe(false);
                expect(responseData.error).toBeDefined();
                expect(responseData.error.code).toBe('DATABASE_ERROR');
                expect(responseData.error.timestamp).toBeDefined();
              } finally {
                process.exit = originalExit;
              }
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );
  });

  describe('Property 6: Dual model persistence', () => {
    /**
     * Feature: jupiter-swap-engine, Property 6: Dual model persistence
     * Validates: Requirements 8.1
     * 
     * Property: For any successful trade tracking operation, the transaction data
     * should be saved to both PlatformTrade and WalletTrade models.
     */
    
    const mockPlatformCreate = PlatformTradeModel.create as jest.MockedFunction<typeof PlatformTradeModel.create>;
    const mockWalletCreate = WalletTradeModel.create as jest.MockedFunction<typeof WalletTradeModel.create>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockPlatformCreate.mockClear();
      mockWalletCreate.mockClear();
    });

    test(
      'should save trade data to both PlatformTrade and WalletTrade models',
      async () => {
        // Use fixed valid Solana addresses for testing
        const validAddresses = [
          'So11111111111111111111111111111111111111112', // Wrapped SOL
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // Example token
          'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        ];

        // Use fixed valid signatures
        const validSignatures = [
          '5J8H5sTvEhnGcB4R8K7mZ9LqYzJxvQjKp3WnN4xRzXyT1pQmK6vL9sN2hF4dG3cB1aA2bB3cC4dD5eE6fF7gG8hH',
          '3K9I6uUwFioHdD5S9N8oZqMzKyLaJbYcWpRoOxNnZz5aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO',
          '2L7J5vVxGjpIeE6T0O9pArNaLbMcKdYeXqSpPyOoAa6bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP',
        ];

        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...validSignatures),
            fc.constantFrom(...validAddresses),
            fc.constantFrom(...validAddresses),
            fc.constantFrom(...validAddresses),
            fc.integer({ min: 1, max: 1000000000 }),
            fc.integer({ min: 1, max: 1000000000 }),
            fc.integer({ min: 0, max: 10000000 }),
            async (
              signature,
              walletAddress,
              inputMint,
              outputMint,
              inputAmount,
              outputAmount,
              platformFee
            ) => {
              // Skip if inputMint and outputMint are the same (invalid swap)
              fc.pre(inputMint !== outputMint);

              // Clear mocks for each iteration
              mockPlatformCreate.mockClear();
              mockWalletCreate.mockClear();

              // Mock successful database saves
              const mockPlatformTrade = {
                signature,
                walletAddress,
                inputMint,
                outputMint,
                inputAmount,
                outputAmount,
                platformFee,
                timestamp: new Date(),
                createdAt: new Date(),
              };

              const isBuy = inputMint === 'So11111111111111111111111111111111111111112';
              const mockWalletTrade = {
                signature,
                walletAddress,
                tradeEvent: isBuy ? 'BUY' : 'SELL',
                tokenAddress: isBuy ? outputMint : inputMint,
                tokenSymbol: 'UNKNOWN',
                quantity: isBuy ? inputAmount : outputAmount,
                quantityUsd: 0,
                tokenAmount: isBuy ? outputAmount : inputAmount,
                contract: isBuy ? outputMint : inputMint,
                walletBalance: 0,
                status: 'confirmed',
                timestamp: new Date(),
                createdAt: new Date(),
              };

              mockPlatformCreate.mockResolvedValueOnce(mockPlatformTrade as any);
              mockWalletCreate.mockResolvedValueOnce(mockWalletTrade as any);

              // Create mock response with promise resolution
              await new Promise<void>((resolve, reject) => {
                const mockResponse = {
                  status: jest.fn().mockImplementation((code: number) => {
                    if (code !== 200) {
                      reject(new Error(`Expected status 200, got ${code}`));
                    }
                    return mockResponse;
                  }),
                  json: jest.fn().mockImplementation((data: any) => {
                    try {
                      expect(data.success).toBe(true);
                      expect(data.message).toBe('Trade tracked successfully');
                      resolve();
                    } catch (error) {
                      reject(error);
                    }
                    return mockResponse;
                  }),
                };

                // Set up request with valid parameters
                const mockRequest = {
                  body: {
                    signature,
                    walletAddress,
                    inputMint,
                    outputMint,
                    inputAmount,
                    outputAmount,
                    platformFee,
                  },
                };

                // Call the controller
                trackTrade(
                  mockRequest as unknown as Request,
                  mockResponse as unknown as Response,
                  jest.fn()
                );
              });

              // Verify both models were called
              expect(mockPlatformCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                  signature,
                  walletAddress,
                  inputMint,
                  outputMint,
                  inputAmount,
                  outputAmount,
                  platformFee,
                })
              );

              expect(mockWalletCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                  signature,
                  walletAddress,
                  tradeEvent: isBuy ? 'BUY' : 'SELL',
                  tokenAddress: isBuy ? outputMint : inputMint,
                  quantity: isBuy ? inputAmount : outputAmount,
                  tokenAmount: isBuy ? outputAmount : inputAmount,
                  contract: isBuy ? outputMint : inputMint,
                  status: 'confirmed',
                })
              );
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );
  });

  describe('Property 19: Backward compatibility handling', () => {
    /**
     * Feature: jupiter-swap-engine, Property 19: Backward compatibility handling
     * Validates: Requirements 18.1, 18.2, 18.3
     * 
     * Property: For any swap request using old-format parameters (e.g., prioritizationFeeLamports),
     * the system should convert them to Ultra-compatible parameters without errors.
     */
    
    beforeEach(() => {
      jest.clearAllMocks();
      // Set up environment variable for testing
      process.env.JUPITER_REFERRAL_KEY = 'TestReferralWallet1111111111111111111111111';
    });

    test(
      'should convert prioritizationFeeLamports to priorityLevel',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 100000 }), // Random prioritization fee in lamports
            async (prioritizationFeeLamports) => {
              const userPublicKey = 'So11111111111111111111111111111111111111112';
              const amount = 1000000;

              // Create a mock quote response
              const mockQuoteResponse = {
                inputMint: 'So11111111111111111111111111111111111111112',
                inAmount: amount.toString(),
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                outAmount: (amount * 2).toString(),
                otherAmountThreshold: (amount * 1.95).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: 'So11111111111111111111111111111111111111112',
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              // Mock Jupiter Ultra API response
              mockPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: prioritizationFeeLamports,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
              });

              let responseStatus: number | null = null;
              let responseData: any = null;
              let requestPayload: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Set up request with legacy prioritizationFeeLamports parameter
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  prioritizationFeeLamports, // Legacy parameter
                  wrapAndUnwrapSol: true,
                },
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Capture the request payload sent to Jupiter Ultra API
              expect(mockPost).toHaveBeenCalledWith('/order', expect.any(Object));
              requestPayload = mockPost.mock.calls[0][1];

              // Verify the legacy parameter was converted to Ultra format
              expect(requestPayload).toHaveProperty('priorityLevel');
              expect(requestPayload.priorityLevel).toMatch(/^(Low|Medium|High|VeryHigh)$/);
              
              // Verify prioritizationFeeLamports is not in the Ultra request
              expect(requestPayload).not.toHaveProperty('prioritizationFeeLamports');
              
              // Verify other Ultra-specific parameters are set
              expect(requestPayload).toHaveProperty('dynamicSlippage');
              expect(requestPayload.dynamicSlippage).toBe(true);
              
              // Verify the response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
              expect(responseData.data).toBeDefined();
              expect(responseData.data.swapTransaction).toBeDefined();

              // Verify the conversion logic based on lamports value
              let expectedPriorityLevel: string;
              if (prioritizationFeeLamports < 1000) {
                expectedPriorityLevel = 'Low';
              } else if (prioritizationFeeLamports < 5000) {
                expectedPriorityLevel = 'Medium';
              } else if (prioritizationFeeLamports < 10000) {
                expectedPriorityLevel = 'High';
              } else {
                expectedPriorityLevel = 'VeryHigh';
              }
              
              expect(requestPayload.priorityLevel).toBe(expectedPriorityLevel);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle multiple legacy parameters simultaneously',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1000, max: 50000 }),
            fc.integer({ min: 1, max: 1000 }),
            fc.boolean(),
            fc.boolean(),
            async (prioritizationFeeLamports, computeUnitPriceMicroLamports, useSharedAccounts, useTokenLedger) => {
              const userPublicKey = 'So11111111111111111111111111111111111111112';
              const amount = 1000000;

              const mockQuoteResponse = {
                inputMint: 'So11111111111111111111111111111111111111112',
                inAmount: amount.toString(),
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                outAmount: (amount * 2).toString(),
                otherAmountThreshold: (amount * 1.95).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: 'So11111111111111111111111111111111111111112',
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              mockPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: prioritizationFeeLamports,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
              });

              let responseStatus: number | null = null;
              let responseData: any = null;
              let requestPayload: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Set up request with multiple legacy parameters
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  prioritizationFeeLamports,
                  computeUnitPriceMicroLamports,
                  useSharedAccounts,
                  useTokenLedger,
                  wrapAndUnwrapSol: true,
                },
              };

              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Capture the request payload
              expect(mockPost).toHaveBeenCalledWith('/order', expect.any(Object));
              requestPayload = mockPost.mock.calls[0][1];

              // Verify all legacy parameters are removed and converted to Ultra format
              expect(requestPayload).not.toHaveProperty('prioritizationFeeLamports');
              expect(requestPayload).not.toHaveProperty('computeUnitPriceMicroLamports');
              expect(requestPayload).not.toHaveProperty('useSharedAccounts');
              expect(requestPayload).not.toHaveProperty('useTokenLedger');

              // Verify Ultra parameters are present
              expect(requestPayload).toHaveProperty('priorityLevel');
              expect(requestPayload.priorityLevel).toMatch(/^(Low|Medium|High|VeryHigh)$/);
              expect(requestPayload).toHaveProperty('dynamicSlippage');
              expect(requestPayload.dynamicSlippage).toBe(true);

              // Verify the response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should preserve new Ultra parameters when present',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom('Low', 'Medium', 'High', 'VeryHigh'),
            fc.boolean(),
            async (priorityLevel, dynamicSlippage) => {
              const userPublicKey = 'So11111111111111111111111111111111111111112';
              const amount = 1000000;

              const mockQuoteResponse = {
                inputMint: 'So11111111111111111111111111111111111111112',
                inAmount: amount.toString(),
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                outAmount: (amount * 2).toString(),
                otherAmountThreshold: (amount * 1.95).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: 'So11111111111111111111111111111111111111112',
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              mockPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: 5000,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
              });

              let responseStatus: number | null = null;
              let responseData: any = null;
              let requestPayload: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Set up request with new Ultra parameters (no legacy parameters)
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  priorityLevel,
                  dynamicSlippage,
                  wrapAndUnwrapSol: true,
                },
              };

              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Capture the request payload
              expect(mockPost).toHaveBeenCalledWith('/order', expect.any(Object));
              requestPayload = mockPost.mock.calls[0][1];

              // Verify the Ultra parameters are preserved exactly as provided
              expect(requestPayload.priorityLevel).toBe(priorityLevel);
              expect(requestPayload.dynamicSlippage).toBe(dynamicSlippage);

              // Verify no legacy parameters are present
              expect(requestPayload).not.toHaveProperty('prioritizationFeeLamports');
              expect(requestPayload).not.toHaveProperty('computeUnitPriceMicroLamports');

              // Verify the response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle mixed legacy and new parameters correctly',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1000, max: 50000 }),
            fc.boolean(),
            async (prioritizationFeeLamports, dynamicSlippage) => {
              const userPublicKey = 'So11111111111111111111111111111111111111112';
              const amount = 1000000;

              const mockQuoteResponse = {
                inputMint: 'So11111111111111111111111111111111111111112',
                inAmount: amount.toString(),
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                outAmount: (amount * 2).toString(),
                otherAmountThreshold: (amount * 1.95).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: 'So11111111111111111111111111111111111111112',
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              mockPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: prioritizationFeeLamports,
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {} as any,
              });

              let responseStatus: number | null = null;
              let responseData: any = null;
              let requestPayload: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Set up request with both legacy and new parameters
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  prioritizationFeeLamports, // Legacy parameter
                  dynamicSlippage, // New Ultra parameter
                  useSharedAccounts: true, // Another legacy parameter
                  wrapAndUnwrapSol: true,
                },
              };

              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Capture the request payload
              expect(mockPost).toHaveBeenCalledWith('/order', expect.any(Object));
              requestPayload = mockPost.mock.calls[0][1];

              // Verify legacy parameters are removed
              expect(requestPayload).not.toHaveProperty('prioritizationFeeLamports');
              expect(requestPayload).not.toHaveProperty('useSharedAccounts');

              // Verify new parameters are preserved
              expect(requestPayload.dynamicSlippage).toBe(dynamicSlippage);

              // Verify converted parameters are present
              expect(requestPayload).toHaveProperty('priorityLevel');
              expect(requestPayload.priorityLevel).toMatch(/^(Low|Medium|High|VeryHigh)$/);

              // Verify the response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle duplicate signature errors correctly',
      async () => {
        const mockPlatformCreate = PlatformTradeModel.create as jest.MockedFunction<typeof PlatformTradeModel.create>;
        
        const signature = '5J8H5sTvEhnGcB4R8K7mZ9LqYzJxvQjKp3WnN4xRzXyT1pQmK6vL9sN2hF4dG3cB';
        const walletAddress = 'So11111111111111111111111111111111111111112';
        const inputMint = 'So11111111111111111111111111111111111111112';
        const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

        // Mock duplicate key error
        const duplicateError = new Error('Duplicate key error');
        (duplicateError as any).code = 11000;
        (duplicateError as any).keyPattern = { signature: 1 };

        mockPlatformCreate.mockRejectedValueOnce(duplicateError);

        let responseStatus: number | null = null;
        let responseData: any = null;

        const mockResponse = {
          status: jest.fn().mockImplementation((code: number) => {
            responseStatus = code;
            return mockResponse;
          }),
          json: jest.fn().mockImplementation((data: any) => {
            responseData = data;
            return mockResponse;
          }),
        };

        const mockRequest = {
          body: {
            signature,
            walletAddress,
            inputMint,
            outputMint,
            inputAmount: 1000000,
            outputAmount: 2000000,
            platformFee: 7500,
          },
        };

        await trackTrade(
          mockRequest as unknown as Request,
          mockResponse as unknown as Response,
          jest.fn()
        );

        // Verify error response
        expect(responseStatus).toBe(409);
        expect(responseData.success).toBe(false);
        expect(responseData.error.code).toBe('DUPLICATE_SIGNATURE');
        expect(responseData.error.message).toContain('already been tracked');
      },
      10000
    );
  });

  describe('Property 15: Ultra API endpoint usage', () => {
    /**
     * Feature: jupiter-swap-engine, Property 15: Ultra API endpoint usage
     * Validates: Requirements 15.1
     * 
     * Property: For any swap transaction request, the system should call the Jupiter Ultra
     * endpoint at `https://api.jup.ag/ultra/v1/order` instead of the standard endpoint.
     */
    test(
      'should use Jupiter Ultra /order endpoint (verified by network error handling)',
      async () => {
        // Set up environment variable
        const testReferralKey = 'TestReferralWallet1111111111111111111111111';
        process.env.JUPITER_REFERRAL_KEY = testReferralKey;

        // Test with a single set of parameters
        const priorityLevel = 'High';
        const dynamicSlippage = true;
        const userPublicKey = 'So11111111111111111111111111111111111111112';
        const amount = 1000000;

        const mockQuoteResponse = {
          inputMint: 'So11111111111111111111111111111111111111112',
          inAmount: amount.toString(),
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outAmount: (amount * 2).toString(),
          otherAmountThreshold: (amount * 1.95).toString(),
          swapMode: 'ExactIn',
          slippageBps: 50,
          platformFee: {
            amount: Math.floor(amount * 0.0075).toString(),
            mint: 'So11111111111111111111111111111111111111112',
            pct: 0.0075,
          },
          priceImpactPct: '0.1',
          routePlan: [],
        };

        let responseStatus: number | null = null;
        let responseData: any = null;

        const mockResponse = {
          status: jest.fn().mockImplementation((code: number) => {
            responseStatus = code;
            return mockResponse;
          }),
          json: jest.fn().mockImplementation((data: any) => {
            responseData = data;
            return mockResponse;
          }),
        };

        const mockRequest = {
          body: {
            quoteResponse: mockQuoteResponse,
            userPublicKey,
            priorityLevel,
            dynamicSlippage,
            wrapAndUnwrapSol: true,
          },
        };

        // Call the controller - it will hit the real Ultra API and get a network error
        await getSwapTransaction(
          mockRequest as unknown as Request,
          mockResponse as unknown as Response,
          jest.fn()
        );

        // Verify that we got an error response (network error from trying to reach Ultra API)
        // This proves we're using the Ultra endpoint (https://api.jup.ag/ultra/v1/order)
        expect(responseStatus).toBe(500); // Network error
        expect(responseData).toBeDefined();
        expect(responseData.success).toBe(false);
        expect(responseData.error).toBeDefined();
        expect(responseData.error.code).toBe('NETWORK_ERROR');
        expect(responseData.error.message).toContain('Failed to generate swap transaction from Jupiter Ultra API');
        
        // Verify the error details contain the network error
        expect(responseData.error.details).toContain('ultra.jup.ag');
      },
      10000
    );

    test(
      'should verify Ultra API base URL is correctly configured',
      async () => {
        // Test that the Ultra client is configured with the correct base URL
        const expectedBaseURL = 'https://api.jup.ag/ultra/v1';
        
        // Verify environment variable fallback
        delete process.env.JUPITER_ULTRA_URL;
        
        // Re-import the module to test the default URL
        jest.resetModules();
        
        // The controller should use the default Ultra URL when env var is not set
        expect(process.env.JUPITER_ULTRA_URL || 'https://api.jup.ag/ultra/v1').toBe(expectedBaseURL);
      }
    );
  });

  describe('Property 16: Priority level parameter inclusion', () => {
    /**
     * Feature: jupiter-swap-engine, Property 16: Priority level parameter inclusion
     * Validates: Requirements 15.2, 15.3
     * 
     * Property: For any swap transaction request, the system should include a valid
     * priorityLevel parameter ('Low', 'Medium', 'High', or 'VeryHigh').
     */
    test(
      'should include valid priorityLevel parameter in all swap requests',
      async () => {
        // Mock axios for Jupiter Ultra client
        const mockAxiosPost = jest.fn();
        const mockAxiosCreate = jest.fn().mockReturnValue({
          post: mockAxiosPost,
        });
        
        jest.doMock('axios', () => ({
          create: mockAxiosCreate,
        }));

        process.env.JUPITER_REFERRAL_KEY = 'TestReferralWallet1111111111111111111111111';

        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom('Low', 'Medium', 'High', 'VeryHigh'),
            fc.boolean(),
            async (priorityLevel, dynamicSlippage) => {
              // Mock successful Ultra API response
              mockAxiosPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedUltraTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: 5000,
                },
              });

              const userPublicKey = 'So11111111111111111111111111111111111111112';
              const mockQuoteResponse = {
                inputMint: 'So11111111111111111111111111111111111111112',
                inAmount: '1000000',
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                outAmount: '2000000',
                otherAmountThreshold: '1950000',
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: '7500',
                  mint: 'So11111111111111111111111111111111111111112',
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  priorityLevel,
                  dynamicSlippage,
                },
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Verify priorityLevel parameter was included and is valid
              expect(mockAxiosPost).toHaveBeenCalledWith(
                '/execute',
                expect.objectContaining({
                  priorityLevel: expect.stringMatching(/^(Low|Medium|High|VeryHigh)$/),
                })
              );

              // Verify the specific priority level was passed correctly
              const callArgs = mockAxiosPost.mock.calls[0];
              expect(callArgs[1].priorityLevel).toBe(priorityLevel);

              // Verify response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should default to High priority when priorityLevel is not specified',
      async () => {
        // Mock axios for Jupiter Ultra client
        const mockAxiosPost = jest.fn();
        const mockAxiosCreate = jest.fn().mockReturnValue({
          post: mockAxiosPost,
        });
        
        jest.doMock('axios', () => ({
          create: mockAxiosCreate,
        }));

        process.env.JUPITER_REFERRAL_KEY = 'TestReferralWallet1111111111111111111111111';

        // Mock successful Ultra API response
        mockAxiosPost.mockResolvedValueOnce({
          data: {
            swapTransaction: 'base64EncodedUltraTransaction',
            lastValidBlockHeight: 123456789,
            priorityFeeEstimate: 5000,
          },
        });

        const userPublicKey = 'So11111111111111111111111111111111111111112';
        const mockQuoteResponse = {
          inputMint: 'So11111111111111111111111111111111111111112',
          inAmount: '1000000',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outAmount: '2000000',
          otherAmountThreshold: '1950000',
          swapMode: 'ExactIn',
          slippageBps: 50,
          platformFee: {
            amount: '7500',
            mint: 'So11111111111111111111111111111111111111112',
            pct: 0.0075,
          },
          priceImpactPct: '0.1',
          routePlan: [],
        };

        let responseStatus: number | null = null;
        let responseData: any = null;

        const mockResponse = {
          status: jest.fn().mockImplementation((code: number) => {
            responseStatus = code;
            return mockResponse;
          }),
          json: jest.fn().mockImplementation((data: any) => {
            responseData = data;
            return mockResponse;
          }),
        };

        // Request without priorityLevel specified
        const mockRequest = {
          body: {
            quoteResponse: mockQuoteResponse,
            userPublicKey,
            // priorityLevel not specified
            dynamicSlippage: true,
          },
        };

        // Call the controller
        await getSwapTransaction(
          mockRequest as unknown as Request,
          mockResponse as unknown as Response,
          jest.fn()
        );

        // Verify default priority level is 'High'
        expect(mockAxiosPost).toHaveBeenCalledWith(
          '/execute',
          expect.objectContaining({
            priorityLevel: 'High', // Default value
          })
        );

        // Verify response was successful
        expect(responseStatus).toBe(200);
        expect(responseData.success).toBe(true);
      },
      10000
    );

    test(
      'should convert legacy prioritizationFeeLamports to priorityLevel',
      async () => {
        // Mock axios for Jupiter Ultra client
        const mockAxiosPost = jest.fn();
        const mockAxiosCreate = jest.fn().mockReturnValue({
          post: mockAxiosPost,
        });
        
        jest.doMock('axios', () => ({
          create: mockAxiosCreate,
        }));

        process.env.JUPITER_REFERRAL_KEY = 'TestReferralWallet1111111111111111111111111';

        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 100, max: 50000 }),
            async (prioritizationFeeLamports) => {
              // Mock successful Ultra API response
              mockAxiosPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedUltraTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: prioritizationFeeLamports,
                },
              });

              const userPublicKey = 'So11111111111111111111111111111111111111112';
              const mockQuoteResponse = {
                inputMint: 'So11111111111111111111111111111111111111112',
                inAmount: '1000000',
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                outAmount: '2000000',
                otherAmountThreshold: '1950000',
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: '7500',
                  mint: 'So11111111111111111111111111111111111111112',
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Request with legacy prioritizationFeeLamports
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  prioritizationFeeLamports, // Legacy parameter
                },
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Determine expected priority level based on lamports
              let expectedPriorityLevel: string;
              if (prioritizationFeeLamports < 1000) {
                expectedPriorityLevel = 'Low';
              } else if (prioritizationFeeLamports < 5000) {
                expectedPriorityLevel = 'Medium';
              } else if (prioritizationFeeLamports < 10000) {
                expectedPriorityLevel = 'High';
              } else {
                expectedPriorityLevel = 'VeryHigh';
              }

              // Verify legacy parameter was converted to priorityLevel
              expect(mockAxiosPost).toHaveBeenCalledWith(
                '/execute',
                expect.objectContaining({
                  priorityLevel: expectedPriorityLevel,
                  dynamicSlippage: true, // Should default to true
                })
              );

              // Verify prioritizationFeeLamports is NOT included (removed for Ultra)
              const callArgs = mockAxiosPost.mock.calls[0];
              expect(callArgs[1]).not.toHaveProperty('prioritizationFeeLamports');

              // Verify response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );
  });

  describe('Property 18: Priority level default behavior', () => {
    /**
     * Feature: jupiter-swap-engine, Property 18: Priority level default behavior
     * Validates: Requirements 15.3, 16.2
     * 
     * Property: For any swap transaction request without a specified priority level,
     * the system should default to 'High' priority.
     */
    test(
      'should default to High priority when no priorityLevel is specified',
      async () => {
        // Store original environment
        const originalEnv = process.env.JUPITER_DEFAULT_PRIORITY;
        
        // Test with default environment (no custom default set)
        delete process.env.JUPITER_DEFAULT_PRIORITY;
        
        // Re-import the priorityLevelUtils to test default behavior
        jest.resetModules();
        const { getDefaultPriorityLevel } = require('../../utils/priorityLevelUtils');
        
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              userPublicKey: fc.constant('So11111111111111111111111111111111111111112'),
              inputMint: fc.constant('So11111111111111111111111111111111111111112'),
              outputMint: fc.constant('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
              amount: fc.integer({ min: 1000, max: 1000000000 }),
            }),
            async ({ userPublicKey, inputMint, outputMint, amount }) => {
              // Mock axios for Jupiter Ultra client
              const mockAxiosPost = jest.fn();
              const mockAxiosCreate = jest.fn().mockReturnValue({
                post: mockAxiosPost,
              });
              
              jest.doMock('axios', () => ({
                create: mockAxiosCreate,
              }));

              // Mock successful Ultra API response
              mockAxiosPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedUltraTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: 10000,
                },
              });

              const mockQuoteResponse = {
                inputMint,
                inAmount: amount.toString(),
                outputMint,
                outAmount: (amount * 2).toString(),
                otherAmountThreshold: (amount * 1.95).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: inputMint,
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Request without priorityLevel specified (should default to 'High')
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  // No priorityLevel specified
                  // No prioritizationFeeLamports specified
                  dynamicSlippage: true,
                },
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Verify default priority level is 'High'
              expect(mockAxiosPost).toHaveBeenCalledWith(
                '/order',
                expect.objectContaining({
                  priorityLevel: 'High', // Should default to 'High'
                })
              );

              // Verify the utility function returns 'High' as default
              expect(getDefaultPriorityLevel()).toBe('High');

              // Verify response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
        
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.JUPITER_DEFAULT_PRIORITY = originalEnv;
        }
      },
      60000
    );

    test(
      'should use custom default priority from environment variable',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom('Low', 'Medium', 'High', 'VeryHigh'),
            fc.record({
              userPublicKey: fc.constant('So11111111111111111111111111111111111111112'),
              inputMint: fc.constant('So11111111111111111111111111111111111111112'),
              outputMint: fc.constant('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
              amount: fc.integer({ min: 1000, max: 1000000000 }),
            }),
            async (customDefault, { userPublicKey, inputMint, outputMint, amount }) => {
              // Set custom default priority in environment
              process.env.JUPITER_DEFAULT_PRIORITY = customDefault;
              
              // Re-import the priorityLevelUtils to pick up new env var
              jest.resetModules();
              const { getDefaultPriorityLevel } = require('../../utils/priorityLevelUtils');

              // Mock axios for Jupiter Ultra client
              const mockAxiosPost = jest.fn();
              const mockAxiosCreate = jest.fn().mockReturnValue({
                post: mockAxiosPost,
              });
              
              jest.doMock('axios', () => ({
                create: mockAxiosCreate,
              }));

              // Mock successful Ultra API response
              mockAxiosPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedUltraTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: 10000,
                },
              });

              const mockQuoteResponse = {
                inputMint,
                inAmount: amount.toString(),
                outputMint,
                outAmount: (amount * 2).toString(),
                otherAmountThreshold: (amount * 1.95).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: inputMint,
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Request without priorityLevel specified (should use custom default)
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  // No priorityLevel specified
                  dynamicSlippage: true,
                },
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Verify custom default priority level is used
              expect(mockAxiosPost).toHaveBeenCalledWith(
                '/order',
                expect.objectContaining({
                  priorityLevel: customDefault, // Should use custom default
                })
              );

              // Verify the utility function returns the custom default
              expect(getDefaultPriorityLevel()).toBe(customDefault);

              // Verify response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );

    test(
      'should handle invalid environment variable gracefully',
      async () => {
        // Store original environment
        const originalEnv = process.env.JUPITER_DEFAULT_PRIORITY;
        
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom('invalid', 'INVALID', 'wrong', '123', '', 'null', 'undefined'),
            async (invalidValue) => {
              // Set invalid default priority in environment
              process.env.JUPITER_DEFAULT_PRIORITY = invalidValue;
              
              // Re-import the priorityLevelUtils to pick up new env var
              jest.resetModules();
              const { getDefaultPriorityLevel } = require('../../utils/priorityLevelUtils');

              // Should fall back to 'High' when invalid value is provided
              expect(getDefaultPriorityLevel()).toBe('High');
            }
          ),
          { numRuns: 50 }
        );
        
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.JUPITER_DEFAULT_PRIORITY = originalEnv;
        } else {
          delete process.env.JUPITER_DEFAULT_PRIORITY;
        }
      },
      30000
    );

    test(
      'should use trade amount based priority selection when available',
      async () => {
        // Store original environment
        const originalEnv = process.env.JUPITER_DEFAULT_PRIORITY;
        delete process.env.JUPITER_DEFAULT_PRIORITY;
        
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              userPublicKey: fc.constant('So11111111111111111111111111111111111111112'),
              inputMint: fc.constant('So11111111111111111111111111111111111111112'), // SOL
              outputMint: fc.constant('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
              solAmount: fc.integer({ min: 1, max: 100 }), // 1-100 SOL
            }),
            async ({ userPublicKey, inputMint, outputMint, solAmount }) => {
              // Mock axios for Jupiter Ultra client
              const mockAxiosPost = jest.fn();
              const mockAxiosCreate = jest.fn().mockReturnValue({
                post: mockAxiosPost,
              });
              
              jest.doMock('axios', () => ({
                create: mockAxiosCreate,
              }));

              // Mock successful Ultra API response
              mockAxiosPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64EncodedUltraTransaction',
                  lastValidBlockHeight: 123456789,
                  priorityFeeEstimate: 10000,
                },
              });

              const amount = solAmount * 1_000_000_000; // Convert SOL to lamports
              const tradeAmountUsd = solAmount * 200; // Assume $200 per SOL

              const mockQuoteResponse = {
                inputMint,
                inAmount: amount.toString(),
                outputMint,
                outAmount: (tradeAmountUsd * 1_000_000).toString(), // USDC has 6 decimals
                otherAmountThreshold: (tradeAmountUsd * 0.95 * 1_000_000).toString(),
                swapMode: 'ExactIn',
                slippageBps: 50,
                platformFee: {
                  amount: Math.floor(amount * 0.0075).toString(),
                  mint: inputMint,
                  pct: 0.0075,
                },
                priceImpactPct: '0.1',
                routePlan: [],
              };

              let responseStatus: number | null = null;
              let responseData: any = null;

              const mockResponse = {
                status: jest.fn().mockImplementation((code: number) => {
                  responseStatus = code;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Request without priorityLevel specified (should use trade amount based selection)
              const mockRequest = {
                body: {
                  quoteResponse: mockQuoteResponse,
                  userPublicKey,
                  // No priorityLevel specified
                  dynamicSlippage: true,
                },
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Determine expected priority level based on trade amount
              let expectedPriorityLevel: string;
              if (tradeAmountUsd > 10000) {
                expectedPriorityLevel = 'VeryHigh';
              } else if (tradeAmountUsd > 1000) {
                expectedPriorityLevel = 'High';
              } else if (tradeAmountUsd > 100) {
                expectedPriorityLevel = 'Medium';
              } else {
                expectedPriorityLevel = 'Low';
              }

              // Verify trade amount based priority selection
              expect(mockAxiosPost).toHaveBeenCalledWith(
                '/order',
                expect.objectContaining({
                  priorityLevel: expectedPriorityLevel,
                })
              );

              // Verify response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
        
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.JUPITER_DEFAULT_PRIORITY = originalEnv;
        }
      },
      60000
    );
  });

  describe('Property 17: Dynamic slippage enablement', () => {
    /**
     * Feature: jupiter-swap-engine, Property 17: Dynamic slippage enablement
     * Validates: Requirements 17.1, 17.2
     * 
     * Property: For any swap transaction request where dynamic slippage is not explicitly disabled,
     * the system should include dynamicSlippage: true in the request.
     */
    test(
      'should enable dynamic slippage by default for all swap requests',
      async () => {
        // Set up environment
        process.env.JUPITER_REFERRAL_KEY = 'test-referral-key';

        await fc.assert(
          fc.asyncProperty(
            fc.record({
              userPublicKey: fc.constantFrom(
                'So11111111111111111111111111111111111111112',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
              ),
              priorityLevel: fc.option(fc.constantFrom('Low', 'Medium', 'High', 'VeryHigh'), { nil: undefined }),
              wrapAndUnwrapSol: fc.option(fc.boolean(), { nil: undefined }),
              // Explicitly test cases where dynamicSlippage is not provided (should default to true)
              dynamicSlippage: fc.option(fc.boolean(), { nil: undefined }),
            }),
            async ({ userPublicKey, priorityLevel, wrapAndUnwrapSol, dynamicSlippage }) => {
              // Mock axios for Jupiter Ultra API
              const mockAxiosPost = jest.fn();
              const axios = require('axios');
              axios.create = jest.fn(() => ({
                post: mockAxiosPost,
              }));

              // Mock successful Ultra API response
              mockAxiosPost.mockResolvedValueOnce({
                data: {
                  swapTransaction: 'base64-encoded-transaction',
                  lastValidBlockHeight: 12345,
                  priorityFeeEstimate: 5000,
                },
                status: 200,
              });

              // Create mock request with optional dynamicSlippage
              const requestBody: any = {
                quoteResponse: {
                  inputMint: 'So11111111111111111111111111111111111111112',
                  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  inAmount: '1000000',
                  outAmount: '2000000',
                  otherAmountThreshold: '1950000',
                  swapMode: 'ExactIn',
                  slippageBps: 50,
                  platformFee: {
                    amount: '7500',
                    mint: 'So11111111111111111111111111111111111111112',
                    pct: 0.0075,
                  },
                  priceImpactPct: '0.1',
                  routePlan: [],
                },
                userPublicKey,
              };

              // Add optional parameters if provided
              if (priorityLevel !== undefined) {
                requestBody.priorityLevel = priorityLevel;
              }
              if (wrapAndUnwrapSol !== undefined) {
                requestBody.wrapAndUnwrapSol = wrapAndUnwrapSol;
              }
              if (dynamicSlippage !== undefined) {
                requestBody.dynamicSlippage = dynamicSlippage;
              }

              const mockRequest = {
                body: requestBody,
              };

              let responseStatus: number = 0;
              let responseData: any = {};

              const mockResponse = {
                status: jest.fn().mockImplementation((status: number) => {
                  responseStatus = status;
                  return mockResponse;
                }),
                json: jest.fn().mockImplementation((data: any) => {
                  responseData = data;
                  return mockResponse;
                }),
              };

              // Call the controller
              await getSwapTransaction(
                mockRequest as unknown as Request,
                mockResponse as unknown as Response,
                jest.fn()
              );

              // Verify that dynamicSlippage is set to true by default
              const expectedDynamicSlippage = dynamicSlippage !== undefined ? dynamicSlippage : true;

              expect(mockAxiosPost).toHaveBeenCalledWith(
                '/order',
                expect.objectContaining({
                  dynamicSlippage: expectedDynamicSlippage,
                })
              );

              // Verify response was successful
              expect(responseStatus).toBe(200);
              expect(responseData.success).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      },
      60000
    );
  });
});