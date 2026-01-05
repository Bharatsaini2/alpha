import { useEffect, useRef } from "react"
import { useAppKitAccount } from "@reown/appkit/react"
import { useToast } from "../ui/Toast"

export const WalletToastManager = () => {
    const { isConnected } = useAppKitAccount()
    const { showToast } = useToast()
    const hasShownToast = useRef(false)

    useEffect(() => {
        // If connected and haven't shown toast yet
        if (isConnected && !hasShownToast.current) {
            showToast("Wallet Connected Successfully", "success")
            hasShownToast.current = true
        }

        // Reset if disconnected so it can show again on reconnect
        if (!isConnected) {
            hasShownToast.current = false
        }
    }, [isConnected, showToast])

    return null
}
