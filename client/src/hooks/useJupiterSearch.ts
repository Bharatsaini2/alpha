import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

export interface JupiterTokenResult {
  id: string; // Mint address
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  dev: string | null;
  circSupply: number | null;
  totalSupply: number | null;
  tokenProgram: string;
  launchpad: string | null;
  partnerConfig: string | null;
  graduatedPool: string | null;
  graduatedAt: string | null;
  holderCount: number | null;
  fdv: number | null;
  mcap: number | null;
  usdPrice: number | null;
  priceBlockId: number | null;
  liquidity: number | null;
  stats5m: any | null;
  stats1h: any | null;
  stats6h: any | null;
  stats24h: any | null;
  firstPool: any | null;
  audit: any | null;
  organicScore: number | null;
  organicScoreLabel: 'high' | 'medium' | 'low' | null;
  isVerified: boolean | null;
  cexes: string[] | null;
  tags: string[] | null;
  updatedAt: string;
}

export interface JupiterSearchResponse {
  success: boolean;
  data: {
    query: string;
    tokens: JupiterTokenResult[];
    count: number;
  };
}

export interface UseJupiterSearchReturn {
  searchTokens: (query: string) => Promise<JupiterTokenResult[]>;
  isSearching: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for searching tokens using Jupiter Ultra API
 */
export const useJupiterSearch = (): UseJupiterSearchReturn => {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const searchTokens = useCallback(async (query: string): Promise<JupiterTokenResult[]> => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      setIsSearching(true);
      setError(null);

      // Get Jupiter API key from backend endpoint (secure way)
      const baseURL = import.meta.env.VITE_SERVER_URL || 'http://localhost:9090/api/v1';
      
      // Call backend proxy endpoint which will forward to Jupiter Ultra with API key
      const response = await axios.get<JupiterSearchResponse>(
        `${baseURL}/trade/search`,
        {
          params: { query },
          signal: abortControllerRef.current.signal,
          timeout: 10000, // 10 second timeout
        }
      );

      if (response.data.success) {
        return response.data.data.tokens;
      } else {
        throw new Error('Search failed');
      }
    } catch (err: any) {
      // Don't set error if request was cancelled
      if (axios.isCancel(err)) {
        return [];
      }

      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to search tokens';
      setError(errorMessage);
      console.error('Jupiter search error:', err);
      throw new Error(errorMessage); // Throw error instead of returning empty array
    } finally {
      setIsSearching(false);
    }
  }, []);

  return {
    searchTokens,
    isSearching,
    error,
    clearError,
  };
};
