import * as fc from 'fast-check';
import {
  validateSolanaAddress,
  validatePositiveAmount,
  validateRequiredParams,
  validateSwapQuoteParams,
  validateSwapTransactionParams,
  validateTrackTradeParams,
  ValidationError,
} from '../validation';

/**
 * Property-Based Tests for Input Validation Utilities
 * 
 * These tests verify that the validation functions correctly reject invalid inputs
 * and accept valid inputs across a wide range of test cases.
 */

describe('Input Validation - Property-Based Tests', () => {
  describe('Property 5: Input validation rejection', () => {
    /**
     * Feature: jupiter-swap-engine, Property 5: Input validation rejection
     * Validates: Requirements 7.4
     * 
     * Property: For any request with invalid input parameters (negative amounts,
     * malformed addresses), the system should return a 400 error without making
     * external API calls.
     */

    describe('validatePositiveAmount', () => {
      test(
        'should reject negative amounts',
        () => {
          fc.assert(
            fc.property(
              fc.integer({ max: -1 }), // Generate negative integers
              (amount) => {
                expect(() => validatePositiveAmount(amount)).toThrow(
                  ValidationError
                );
                expect(() => validatePositiveAmount(amount)).toThrow(
                  /must be greater than 0/
                );
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject zero amounts',
        () => {
          expect(() => validatePositiveAmount(0)).toThrow(ValidationError);
          expect(() => validatePositiveAmount(0)).toThrow(
            /must be greater than 0/
          );
        }
      );

      test(
        'should reject non-numeric values',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.string().filter((s) => isNaN(Number(s))),
                fc.constant(null),
                fc.constant(undefined),
                fc.constant({}),
                fc.constant([]),
                fc.constant(NaN)
              ),
              (invalidValue) => {
                expect(() => validatePositiveAmount(invalidValue)).toThrow(
                  ValidationError
                );
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject infinite values',
        () => {
          expect(() => validatePositiveAmount(Infinity)).toThrow(
            ValidationError
          );
          expect(() => validatePositiveAmount(-Infinity)).toThrow(
            ValidationError
          );
        }
      );

      test(
        'should accept positive numbers',
        () => {
          fc.assert(
            fc.property(
              fc.integer({ min: 1, max: 1000000000 }),
              (amount) => {
                expect(validatePositiveAmount(amount)).toBe(true);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should accept positive decimal numbers',
        () => {
          fc.assert(
            fc.property(
              fc.double({ min: 0.000001, max: 1000000, noNaN: true }),
              (amount) => {
                expect(validatePositiveAmount(amount)).toBe(true);
              }
            ),
            { numRuns: 100 }
          );
        }
      );
    });

    describe('validateSolanaAddress', () => {
      test(
        'should reject malformed addresses',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.string({ maxLength: 20 }), // Too short
                fc.string({ minLength: 100 }), // Too long
                fc.constant(''), // Empty
                fc.constant('invalid-address-123'), // Invalid characters
                fc.constant('0'.repeat(44)), // Invalid base58
                fc.constant('O'.repeat(44)), // Invalid base58 (O not allowed)
                fc.constant('I'.repeat(44)), // Invalid base58 (I not allowed)
                fc.constant('l'.repeat(44)) // Invalid base58 (l not allowed)
              ),
              (address) => {
                expect(() => validateSolanaAddress(address)).toThrow(
                  ValidationError
                );
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject null and undefined',
        () => {
          expect(() => validateSolanaAddress(null as any)).toThrow(
            ValidationError
          );
          expect(() => validateSolanaAddress(undefined as any)).toThrow(
            ValidationError
          );
        }
      );

      test(
        'should reject non-string values',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.integer(),
                fc.constant({}),
                fc.constant([]),
                fc.boolean()
              ),
              (invalidValue) => {
                expect(() => validateSolanaAddress(invalidValue as any)).toThrow(
                  ValidationError
                );
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should accept valid Solana addresses',
        () => {
          // Known valid Solana addresses
          const validAddresses = [
            'So11111111111111111111111111111111111111112', // Wrapped SOL
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
            '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // Example address
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // Example address
          ];

          validAddresses.forEach((address) => {
            expect(validateSolanaAddress(address)).toBe(true);
          });
        }
      );
    });

    describe('validateRequiredParams', () => {
      test(
        'should reject when required fields are missing',
        () => {
          fc.assert(
            fc.property(
              fc.array(
                fc.string({ minLength: 1 }).filter(
                  (s) => !['toString', 'valueOf', 'constructor', '__proto__'].includes(s)
                ),
                { minLength: 2, maxLength: 5 }
              ),
              (requiredFields) => {
                // Create params object missing the first field
                const params: Record<string, any> = Object.create(null);
                requiredFields.slice(1).forEach((field) => {
                  params[field] = 'value';
                });

                expect(() =>
                  validateRequiredParams(params, requiredFields)
                ).toThrow(ValidationError);
                expect(() =>
                  validateRequiredParams(params, requiredFields)
                ).toThrow(/Missing required parameters/);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject when fields are null, undefined, or empty string',
        () => {
          fc.assert(
            fc.property(
              fc.constantFrom(null, undefined, ''),
              (invalidValue) => {
                const params = { field1: invalidValue, field2: 'valid' };
                expect(() =>
                  validateRequiredParams(params, ['field1', 'field2'])
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should accept when all required fields are present',
        () => {
          fc.assert(
            fc.property(
              fc.array(
                fc.string({ minLength: 1 }).filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
                { minLength: 1, maxLength: 5 }
              ),
              fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
              (requiredFields, values) => {
                const params: Record<string, any> = {};
                requiredFields.forEach((field, index) => {
                  params[field] = values[index % values.length] || 'value';
                });

                expect(validateRequiredParams(params, requiredFields)).toBe(
                  true
                );
              }
            ),
            { numRuns: 100 }
          );
        }
      );
    });

    describe('validateSwapQuoteParams', () => {
      test(
        'should reject invalid swap quote parameters',
        () => {
          fc.assert(
            fc.property(
              fc.record({
                inputMint: fc.oneof(
                  fc.constant('invalid'),
                  fc.constant(''),
                  fc.string({ maxLength: 10 })
                ),
                outputMint: fc.oneof(
                  fc.constant('invalid'),
                  fc.constant(''),
                  fc.string({ maxLength: 10 })
                ),
                amount: fc.oneof(
                  fc.integer({ max: 0 }),
                  fc.constant(-1),
                  fc.constant(null),
                  fc.constant('invalid')
                ),
              }),
              (params) => {
                expect(() =>
                  validateSwapQuoteParams(
                    params.inputMint,
                    params.outputMint,
                    params.amount
                  )
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should accept valid swap quote parameters',
        () => {
          const validParams = {
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            amount: 1000000,
          };

          expect(
            validateSwapQuoteParams(
              validParams.inputMint,
              validParams.outputMint,
              validParams.amount
            )
          ).toBe(true);
        }
      );
    });

    describe('validateSwapTransactionParams', () => {
      test(
        'should reject invalid user public key',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.constant('invalid'),
                fc.constant(''),
                fc.string({ maxLength: 10 })
              ),
              (invalidKey) => {
                const quoteResponse = { valid: 'object' };
                expect(() =>
                  validateSwapTransactionParams(invalidKey, quoteResponse)
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject invalid quote response',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.constant(null),
                fc.constant(undefined),
                fc.constant('string'),
                fc.constant(123),
                fc.constant([])
              ),
              (invalidQuote) => {
                const validKey = 'So11111111111111111111111111111111111111112';
                expect(() =>
                  validateSwapTransactionParams(validKey, invalidQuote)
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should accept valid swap transaction parameters',
        () => {
          const validParams = {
            userPublicKey: 'So11111111111111111111111111111111111111112',
            quoteResponse: { inputMint: 'test', outputMint: 'test' },
          };

          expect(
            validateSwapTransactionParams(
              validParams.userPublicKey,
              validParams.quoteResponse
            )
          ).toBe(true);
        }
      );
    });

    describe('validateTrackTradeParams', () => {
      test(
        'should reject invalid signature',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.constant(''),
                fc.string({ maxLength: 10 }),
                fc.constant(null),
                fc.constant(undefined)
              ),
              (invalidSignature) => {
                expect(() =>
                  validateTrackTradeParams(
                    invalidSignature as any,
                    'So11111111111111111111111111111111111111112',
                    'So11111111111111111111111111111111111111112',
                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    1000,
                    2000,
                    15
                  )
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject negative amounts',
        () => {
          fc.assert(
            fc.property(
              fc.integer({ max: -1 }),
              (negativeAmount) => {
                expect(() =>
                  validateTrackTradeParams(
                    '5' + 'a'.repeat(87), // Valid signature format
                    'So11111111111111111111111111111111111111112',
                    'So11111111111111111111111111111111111111112',
                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    negativeAmount,
                    2000,
                    15
                  )
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should reject invalid wallet addresses',
        () => {
          fc.assert(
            fc.property(
              fc.oneof(
                fc.constant('invalid'),
                fc.constant(''),
                fc.string({ maxLength: 10 })
              ),
              (invalidAddress) => {
                expect(() =>
                  validateTrackTradeParams(
                    '5' + 'a'.repeat(87),
                    invalidAddress,
                    'So11111111111111111111111111111111111111112',
                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    1000,
                    2000,
                    15
                  )
                ).toThrow(ValidationError);
              }
            ),
            { numRuns: 100 }
          );
        }
      );

      test(
        'should accept valid track trade parameters',
        () => {
          const validParams = {
            signature: '5' + 'a'.repeat(87), // Valid signature format
            walletAddress: 'So11111111111111111111111111111111111111112',
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            inputAmount: 1000000,
            outputAmount: 2000000,
            platformFee: 7500,
          };

          expect(
            validateTrackTradeParams(
              validParams.signature,
              validParams.walletAddress,
              validParams.inputMint,
              validParams.outputMint,
              validParams.inputAmount,
              validParams.outputAmount,
              validParams.platformFee
            )
          ).toBe(true);
        }
      );

      test(
        'should accept zero platform fee',
        () => {
          expect(
            validateTrackTradeParams(
              '5' + 'a'.repeat(87),
              'So11111111111111111111111111111111111111112',
              'So11111111111111111111111111111111111111112',
              'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              1000000,
              2000000,
              0
            )
          ).toBe(true);
        }
      );
    });

    describe('Comprehensive invalid input scenarios', () => {
      test(
        'should reject all types of invalid inputs without making API calls',
        () => {
          fc.assert(
            fc.property(
              fc.record({
                scenario: fc.constantFrom(
                  'negative-amount',
                  'malformed-address',
                  'missing-params',
                  'null-values',
                  'empty-strings',
                  'invalid-types'
                ),
              }),
              (testCase) => {
                let threwError = false;

                try {
                  switch (testCase.scenario) {
                    case 'negative-amount':
                      validatePositiveAmount(-100);
                      break;
                    case 'malformed-address':
                      validateSolanaAddress('invalid-address');
                      break;
                    case 'missing-params':
                      validateRequiredParams({}, ['required']);
                      break;
                    case 'null-values':
                      validatePositiveAmount(null);
                      break;
                    case 'empty-strings':
                      validateSolanaAddress('');
                      break;
                    case 'invalid-types':
                      validatePositiveAmount({} as any);
                      break;
                  }
                } catch (error) {
                  threwError = true;
                  expect(error).toBeInstanceOf(ValidationError);
                }

                // All scenarios should throw ValidationError
                expect(threwError).toBe(true);
              }
            ),
            { numRuns: 100 }
          );
        }
      );
    });
  });
});
