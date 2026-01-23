import React, { useState, useCallback, ReactNode } from "react"
import { useWalletConnection } from "../hooks/useWalletConnection"
import { PremiumAccessModal } from "../components/modals/PremiumAccessModal"
import { SwapModal } from "../components/swap/SwapModal"
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
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
    const { getBalance, wallet } = useWalletConnection()

    const openQuickBuy = useCallback(() => {
        setIsModalOpen(false)
        setIsSwapModalOpen(true)
    }, [])

    const validateAccess = useCallback(
        async (onSuccess: () => void) => {
            if (!wallet.connected) {
                // If wallet not connected, maybe we should let them connect?
                // User requirement assumes they check balance. If not connected, balance is 0.
                setIsModalOpen(true)
                return
            }

            try {
                // Check ALPHA balance
                const balance = await getBalance(ALPHA_TOKEN_MINT)
                console.log(`[PremiumAccess] ALPHA Balance: ${balance}`)

                if (balance >= PREMIUM_BALANCE_THRESHOLD) {
                    onSuccess()
                } else {
                    setIsModalOpen(true)
                }
            } catch (error) {
                console.error("[PremiumAccess] Error checking access:", error)
                setIsModalOpen(true) // Fail safe to blocking if check fails, or could be open (user preference: strict)
            }
        },
        [getBalance, wallet.connected]
    )

    return (
        <PremiumAccessContext.Provider value={{ validateAccess }}>
            {children}
            <PremiumAccessModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onBuyNow={openQuickBuy}
            />
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
            />
        </PremiumAccessContext.Provider>
    )
}
