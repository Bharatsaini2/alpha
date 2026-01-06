import { useEffect, useRef } from "react"
import { useAppKitAccount, useWalletInfo } from "@reown/appkit/react"
import { useToast } from "../ui/Toast"
import PhantomLogo from "../../assets/phantom.svg"

export const WalletToastManager = () => {
    const { isConnected } = useAppKitAccount()
    const { walletInfo } = useWalletInfo()
    const { showToast } = useToast()
    const hasShownToast = useRef(false)

    useEffect(() => {
        // If connected and haven't shown toast yet
        if (isConnected && !hasShownToast.current) {
            let displayName = walletInfo?.name || "Wallet"
            let displayIcon = walletInfo?.icon

            // Use local Phantom logo if Phantom wallet is connected
            if (displayName.toLowerCase().includes("phantom")) {
                displayIcon = PhantomLogo
            }

            if (displayName !== "Wallet" && !displayName.toLowerCase().includes("wallet")) {
                displayName = `${displayName} Wallet`
            }

            // Use specific wallet name and icon if available
            showToast(
                `${displayName} Successfully Connected`,
                "success",
                "wallet",
                {
                    title: `${displayName} Connected`,
                    icon: displayIcon,
                    duration: 3000
                }
            )
            hasShownToast.current = true
        }

        // Reset if disconnected so it can show again on reconnect
        if (!isConnected) {
            hasShownToast.current = false
        }
    }, [isConnected, walletInfo, showToast])

    return null
}
