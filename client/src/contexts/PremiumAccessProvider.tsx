import React, { useState, useCallback, ReactNode } from "react"
import { useWalletConnection } from "../hooks/useWalletConnection"
import { useToast } from "../contexts/ToastContext"
import { SwapModal } from "../components/swap/SwapModal"
import { loadQuickBuyAmount } from "../utils/quickBuyValidation"
import {
    PremiumAccessContext,
    ALPHA_TOKEN_MINT,
    PREMIUM_BALANCE_THRESHOLD,
} from "./PremiumAccessContext"

interface PremiumAccessProviderProps {
    children: ReactNode
}

export const PremiumAccessProvider: React.FC<PremiumAccessProviderProps> = ({
    children,
}) => {
    const { getBalance, wallet } = useWalletConnection()
    const { showToast } = useToast()
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
    const [quickBuyAmount, setQuickBuyAmount] = useState<string>("")

    const openQuickBuy = useCallback(() => {
        const amount = loadQuickBuyAmount()
        setQuickBuyAmount(amount || "0.1")
        setIsSwapModalOpen(true)
    }, [])

    const validateAccess = useCallback(
        async (onSuccess: () => void) => {
            if (!wallet.connected) {
                showToast("Please connect your wallet to access premium features", "error")
                return
            }

            try {
                // Check ALPHA balance
                const balance = await getBalance(ALPHA_TOKEN_MINT)
                console.log(`[PremiumAccess] ALPHA Balance: ${balance}`)

                if (balance >= PREMIUM_BALANCE_THRESHOLD) {
                    onSuccess()
                } else {
                    showToast(`You need ${PREMIUM_BALANCE_THRESHOLD} $ALPHA tokens to access this feature`, "error", "standard", {
                        actionLabel: "BUY NOW",
                        onAction: openQuickBuy
                    })
                }
            } catch (error) {
                console.error("[PremiumAccess] Error checking access:", error)
                showToast("Failed to verify premium access", "error")
            }
        },
        [getBalance, wallet.connected, showToast]
    )

    return (
        <PremiumAccessContext.Provider value={{ validateAccess }}>
            {children}
            <SwapModal
                isOpen={isSwapModalOpen}
                onClose={() => setIsSwapModalOpen(false)}
                mode="quickBuy"
                initialInputToken={{
                    address: "So11111111111111111111111111111111111111112",
                    symbol: "SOL",
                    name: "Solana",
                    decimals: 9,
                    image:
                        "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504",
                }}
                initialOutputToken={{
                    symbol: "ALPHA",
                    name: "Alpha Token",
                    address: ALPHA_TOKEN_MINT,
                    decimals: 6,
                    image:
                        "https://dd.dexscreener.com/ds-data/tokens/solana/3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump.png",
                }}
                initialAmount={quickBuyAmount}
            />
        </PremiumAccessContext.Provider>
    )
}
