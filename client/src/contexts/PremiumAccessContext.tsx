import { createContext, useContext } from 'react';

export const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump';
export const PREMIUM_BALANCE_THRESHOLD = 1000;

interface PremiumAccessContextType {
    validateAccess: (onSuccess: () => void) => Promise<void>;
}

export const PremiumAccessContext = createContext<PremiumAccessContextType | undefined>(undefined);

export const usePremiumAccess = () => {
    const context = useContext(PremiumAccessContext);
    if (!context) {
        throw new Error('usePremiumAccess must be used within a PremiumAccessProvider');
    }
    return context;
};
