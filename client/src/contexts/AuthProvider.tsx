import React, { useState, useEffect, ReactNode, useRef } from "react"
import axios from "axios"
import { AuthContext, User, API_BASE } from "./AuthContext"
import { useAppKit, useAppKitAccount } from "@reown/appkit/react"

interface AuthProviderProps {
    children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [isAuthFlowActive, setIsAuthFlowActive] = useState(false)

    const { open } = useAppKit()
    const { address, isConnected } = useAppKitAccount()

    const loginInProgressRef = useRef(false)
    const processedAddressRef = useRef<string | null>(null)

    const isAuthenticated = !!user

    const attemptTokenRefresh = async () => {
        try {
            const refreshToken = localStorage.getItem("refreshToken")
            if (!refreshToken) {
                logout()
                return
            }

            // Send refresh request with credentials to include cookies
            const response = await axios.post(
                `${API_BASE}/auth/refresh`,
                {},
                {
                    withCredentials: true,
                }
            )

            if (response.data.success) {
                const {
                    accessToken,
                    refreshToken: newRefreshToken,
                    user,
                } = response.data.data
                setUser(user)
                localStorage.setItem("user", JSON.stringify(user))
                localStorage.setItem("accessToken", accessToken)
                if (newRefreshToken) {
                    localStorage.setItem("refreshToken", newRefreshToken)
                }
            } else {
                logout()
            }
        } catch (error) {
            console.error("Token refresh error:", error)
            logout()
        }
    }

    // Initialize auth state from localStorage
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const storedUser = localStorage.getItem("user")
                const accessToken = localStorage.getItem("accessToken")
                const refreshToken = localStorage.getItem("refreshToken")

                if (storedUser && accessToken) {
                    const userData = JSON.parse(storedUser)
                    setUser(userData)

                    // Verify token is still valid by fetching current user
                    try {
                        const response = await axios.get(`${API_BASE}/auth/me`, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                            },
                            withCredentials: true,
                        })

                        if (response.data.success) {
                            setUser(response.data.data.user)
                            localStorage.setItem(
                                "user",
                                JSON.stringify(response.data.data.user)
                            )
                        } else {
                            // Token is invalid, try to refresh
                            if (refreshToken) {
                                await attemptTokenRefresh()
                            } else {
                                logout()
                            }
                        }
                    } catch {
                        // Token is invalid, try to refresh
                        if (refreshToken) {
                            await attemptTokenRefresh()
                        } else {
                            logout()
                        }
                    }
                } else if (refreshToken) {
                    // Only refresh token available, try to refresh
                    await attemptTokenRefresh()
                }
            } catch (error) {
                console.error("Auth initialization error:", error)
                logout()
            } finally {
                setIsLoading(false)
            }
        }

        initializeAuth()
    }, [])

    const handleWalletLogin = async (walletAddress: string) => {
        // Prevent duplicate login attempts
        if (loginInProgressRef.current || processedAddressRef.current === walletAddress) {
            return
        }

        try {
            loginInProgressRef.current = true
            processedAddressRef.current = walletAddress

            // Request nonce from backend
            const nonceResponse = await axios.post(`${API_BASE}/auth/phantom/nonce`, {
                walletAddress,
            })

            if (nonceResponse.data.success) {
                const { message } = nonceResponse.data.data

                // Verify with backend
                const verifyResponse = await axios.post(
                    `${API_BASE}/auth/phantom/verify`,
                    {
                        walletAddress,
                        signature: [], // Empty signature for now (auto-verify on backend)
                        message,
                    }
                )

                if (verifyResponse.data.success) {
                    // Store tokens
                    login(
                        verifyResponse.data.data.user,
                        verifyResponse.data.data.accessToken,
                        verifyResponse.data.data.refreshToken
                    )

                    // Refresh user data to get latest status
                    await refreshUser()
                }
            }
        } catch (error) {
            console.error("Wallet login error in provider:", error)
        } finally {
            loginInProgressRef.current = false
        }
    }

    // Handle wallet connection from AppKit
    useEffect(() => {
        if (isConnected && address && !isAuthenticated && !loginInProgressRef.current) {
            handleWalletLogin(address)
        }
    }, [isConnected, address, isAuthenticated])

    const login = (
        userData: User,
        accessToken: string,
        refreshToken?: string
    ) => {
        setUser(userData)
        localStorage.setItem("user", JSON.stringify(userData))
        localStorage.setItem("accessToken", accessToken)
        if (refreshToken) {
            localStorage.setItem("refreshToken", refreshToken)
        }
    }

    const logout = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken")
            if (accessToken) {
                // Call logout endpoint to invalidate server-side session
                await axios.post(
                    `${API_BASE}/auth/logout`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                )
            }
        } catch (error) {
            console.error("Logout error:", error)
        } finally {
            // Clear local state regardless of server response
            setUser(null)
            localStorage.removeItem("user")
            localStorage.removeItem("accessToken")
            localStorage.removeItem("refreshToken")
        }
    }

    const updateUser = (userData: Partial<User>) => {
        if (user) {
            const updatedUser = { ...user, ...userData }
            setUser(updatedUser)
            localStorage.setItem("user", JSON.stringify(updatedUser))
        }
    }

    const refreshUser = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken")
            if (accessToken) {
                const response = await axios.get(`${API_BASE}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                })

                if (response.data.success) {
                    setUser(response.data.data.user)
                    localStorage.setItem("user", JSON.stringify(response.data.data.user))
                }
            }
        } catch (error) {
            console.error("Refresh user error:", error)
            // Try to refresh token if access token is invalid
            await attemptTokenRefresh()
        }
    }

    const openLoginModal = () => {
        // Directly open AppKit wallet selection
        open({ view: "Connect" })
        setIsAuthFlowActive(true)
    }

    const openOTPModal = (_email: string) => {
        setShowLoginModal(false)
        // OTP modal will be handled by the AuthManager component
    }

    const closeAuthModals = () => {
        setShowLoginModal(false)
        setIsAuthFlowActive(false)
    }

    const value = {
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        updateUser,
        refreshUser,
        showLoginModal,
        isAuthFlowActive,
        openLoginModal,
        openOTPModal,
        closeAuthModals,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
