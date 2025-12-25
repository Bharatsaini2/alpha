import axios from 'axios';

export async function getTokenLaunchTime(tokenMint: string, heliusApiKey: string) {
  const url = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}`;
  
  try {
    // Get all transactions for the token mint
    const response = await axios.post(url, {
      limit: 1000, // Get maximum possible transactions
      type: "token" // Filter for token transactions only
    });

    const transactions = response.data;
    
    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions found for this token');
    }

    // Sort transactions by timestamp to find the earliest one
    const sortedTransactions = transactions.sort((a: any, b: any) => a.timestamp - b.timestamp);
    const firstTransaction = sortedTransactions[0];

    return {
      launchTimestamp: new Date(firstTransaction.timestamp * 1000), // Convert to milliseconds
      firstTransactionSignature: firstTransaction.signature,
      success: true
    };

  } catch (error: any) {
    console.error('Error fetching token launch time:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
} 