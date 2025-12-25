import { PublicKey } from '@solana/web3.js';

/**
 * Validation error class for descriptive error messages
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates if a string is a valid Solana public key address
 * @param address - The address string to validate
 * @param fieldName - Optional field name for error messages
 * @returns true if valid
 * @throws ValidationError if invalid
 */
export function validateSolanaAddress(
  address: string,
  fieldName: string = 'address'
): boolean {
  if (!address || typeof address !== 'string') {
    throw new ValidationError(
      `${fieldName} is required and must be a string`
    );
  }

  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    throw new ValidationError(
      `${fieldName} is not a valid Solana public key address`
    );
  }
}

/**
 * Validates if a value is a positive number
 * @param amount - The amount to validate
 * @param fieldName - Optional field name for error messages
 * @returns true if valid
 * @throws ValidationError if invalid
 */
export function validatePositiveAmount(
  amount: any,
  fieldName: string = 'amount'
): boolean {
  if (amount === null || amount === undefined) {
    throw new ValidationError(`${fieldName} is required`);
  }

  const numAmount = Number(amount);

  if (isNaN(numAmount)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (numAmount <= 0) {
    throw new ValidationError(`${fieldName} must be greater than 0`);
  }

  if (!isFinite(numAmount)) {
    throw new ValidationError(`${fieldName} must be a finite number`);
  }

  return true;
}

/**
 * Validates that required parameters are present
 * @param params - Object containing parameters to validate
 * @param requiredFields - Array of required field names
 * @throws ValidationError if any required field is missing
 */
export function validateRequiredParams(
  params: Record<string, any>,
  requiredFields: string[]
): boolean {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (
      !Object.prototype.hasOwnProperty.call(params, field) ||
      params[field] === null ||
      params[field] === undefined ||
      params[field] === ''
    ) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required parameters: ${missingFields.join(', ')}`
    );
  }

  return true;
}

/**
 * Validates swap quote request parameters
 * @param inputMint - Input token mint address
 * @param outputMint - Output token mint address
 * @param amount - Swap amount
 * @throws ValidationError if any parameter is invalid
 */
export function validateSwapQuoteParams(
  inputMint: string,
  outputMint: string,
  amount: any
): boolean {
  validateRequiredParams(
    { inputMint, outputMint, amount },
    ['inputMint', 'outputMint', 'amount']
  );

  validateSolanaAddress(inputMint, 'inputMint');
  validateSolanaAddress(outputMint, 'outputMint');
  validatePositiveAmount(amount, 'amount');

  return true;
}

/**
 * Validates swap transaction request parameters
 * @param userPublicKey - User's wallet public key
 * @param quoteResponse - Quote response object from Jupiter
 * @throws ValidationError if any parameter is invalid
 */
export function validateSwapTransactionParams(
  userPublicKey: string,
  quoteResponse: any
): boolean {
  validateRequiredParams(
    { userPublicKey, quoteResponse },
    ['userPublicKey', 'quoteResponse']
  );

  validateSolanaAddress(userPublicKey, 'userPublicKey');

  if (
    typeof quoteResponse !== 'object' ||
    quoteResponse === null ||
    Array.isArray(quoteResponse)
  ) {
    throw new ValidationError('quoteResponse must be a valid object');
  }

  return true;
}

/**
 * Validates track trade request parameters
 * @param signature - Transaction signature
 * @param walletAddress - User's wallet address
 * @param inputMint - Input token mint address
 * @param outputMint - Output token mint address
 * @param inputAmount - Input token amount
 * @param outputAmount - Output token amount
 * @param platformFee - Platform fee amount
 * @throws ValidationError if any parameter is invalid
 */
export function validateTrackTradeParams(
  signature: string,
  walletAddress: string,
  inputMint: string,
  outputMint: string,
  inputAmount: any,
  outputAmount: any,
  platformFee: any
): boolean {
  validateRequiredParams(
    {
      signature,
      walletAddress,
      inputMint,
      outputMint,
      inputAmount,
      outputAmount,
      platformFee,
    },
    [
      'signature',
      'walletAddress',
      'inputMint',
      'outputMint',
      'inputAmount',
      'outputAmount',
      'platformFee',
    ]
  );

  // Validate signature format (base58 string, typically 88 characters)
  if (typeof signature !== 'string' || signature.length < 32) {
    throw new ValidationError(
      'signature must be a valid transaction signature'
    );
  }

  validateSolanaAddress(walletAddress, 'walletAddress');
  validateSolanaAddress(inputMint, 'inputMint');
  validateSolanaAddress(outputMint, 'outputMint');
  validatePositiveAmount(inputAmount, 'inputAmount');
  validatePositiveAmount(outputAmount, 'outputAmount');

  // Platform fee can be 0 or positive
  const numPlatformFee = Number(platformFee);
  if (isNaN(numPlatformFee) || numPlatformFee < 0) {
    throw new ValidationError('platformFee must be a non-negative number');
  }

  return true;
}
