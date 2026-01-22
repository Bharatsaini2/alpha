import React, { useEffect, useState, useCallback } from "react"

import { motion, AnimatePresence } from "framer-motion"
import { XIcon } from "lucide-react"
import { createPortal } from "react-dom"
import { FaRegCheckSquare } from "react-icons/fa";
import { ImSpinner4 } from "react-icons/im";
import { MdOutlineCheckBox } from "react-icons/md";

export interface ToastProps {
    id: string
    message: string
    title?: string
    icon?: string
    type?: "success" | "error" | "info"
    variant?: "standard" | "processing" | "transaction" | "wallet"
    txSignature?: string
    duration?: number
    onClose: (id: string) => void
}

const Toast: React.FC<ToastProps> = ({
    id,
    message,
    title,
    icon,
    type = "success",
    variant = "standard",
    txSignature,
    duration = 3000,
    onClose,
}) => {
    // Single timer: after duration, ask manager to remove this toast.
    useEffect(() => {
        if (duration > 0) {
            const t = setTimeout(() => onClose(id), duration)
            return () => clearTimeout(t)
        }
    }, [id, duration, onClose])

    // Processing state
    if (variant === "processing") {
        return (
            <div className="coppied-address connecting-bx">
                <div className="coppied-content">
                    <span className="coppied-icon text-white spinner-rotate"><ImSpinner4 /></span>
                    <p>{message}</p>
                    <div className="three-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        )
    }

    // Wallet state
    if (variant === "wallet") {
        return (
            <div className="coppied-address">
                <div className="coppied-content">
                    <span className="coppied-icon">
                        {icon ? (
                            <img src={icon} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                        ) : type === 'info' ? (
                            <ImSpinner4 className="spinner-rotate" />
                        ) : (
                            <MdOutlineCheckBox />
                        )}
                    </span>
                    <p>{message}</p>
                    <button
                        onClick={() => onClose(id)}
                        className="coppied-btn"
                    >
                        Close
                    </button>
                </div>
            </div>
        )
    }

    // Transaction state
    if (variant === "transaction") {
        return (
            <div className="nw-sign-frm " style={{ background: '#0a0a0a', border: '1px solid #292929', padding: '12px', borderRadius: '8px' }}>
                <div className="swap-transition-bx">
                    <span className="swap-check"><MdOutlineCheckBox /></span>
                    <div>
                        <h5>Transaction confirmed</h5>
                        <p>{message}</p>
                        <div className="d-flex align-items-center gap-2 mt-2">
                            {txSignature && (
                                <a
                                    href={`https://solscan.io/tx/${txSignature}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="coppied-btn"
                                    style={{ textDecoration: 'none' }}
                                >
                                    view tx
                                </a>
                            )}
                            <button className="coppied-btn" onClick={() => onClose(id)}>close</button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Standard state (default)
    return (
        <div className="coppied-address">
            <div className="coppied-content">
                <span className={`coppied-icon ${type === 'error' ? 'text-red-500' : ''}`}>
                    {type === 'error' ? <XIcon size={21} /> : <FaRegCheckSquare />}
                </span>
                <p>{message}</p>
                <button
                    onClick={() => onClose(id)}
                    className="coppied-btn text-[10px] px-2 py-1"
                >
                    Close
                </button>
            </div>
        </div>
    )
}

// Toast Context
interface ToastContextType {
    showToast: (
        message: string,
        type?: ToastProps["type"],
        variant?: ToastProps["variant"],
        options?: { duration?: number, txSignature?: string, title?: string, icon?: string }
    ) => string | null
    removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
    const context = React.useContext(ToastContext)
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider")
    }
    return context
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastProps[]>([])
    const [isDebouncing, setIsDebouncing] = useState(false)

    // Set to track animated toasts to prevent re-animation
    const [animatedOnce] = useState(() => new Set<string>())

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const showToast = useCallback((
        message: string,
        type: ToastProps["type"] = "success",
        variant: ToastProps["variant"] = "standard",
        options?: { duration?: number, txSignature?: string, title?: string, icon?: string }
    ) => {
        // Only debounce standard messages to prevent spam, allow important updates
        if (isDebouncing && variant === "standard") return null
        if (variant === "standard") {
            setIsDebouncing(true)
            setTimeout(() => setIsDebouncing(false), 1000)
        }

        const id =
            globalThis.crypto?.randomUUID?.() ??
            Math.random().toString(36).slice(2, 11)

        // Default duration depends on variant
        let duration = options?.duration ?? 3000
        if (variant === "processing") duration = 0 // Don't auto-close processing toasts

        setToasts((prev) => [
            ...prev,
            {
                id,
                message,
                type,
                variant,
                txSignature: options?.txSignature,
                title: options?.title,
                icon: options?.icon,
                duration,
                onClose: removeToast
            },
        ])

        return id
    }, [isDebouncing, removeToast])

    return (
        <ToastContext.Provider value={{ showToast, removeToast }}>
            {children}
            {createPortal(
                <div
                    className="
            fixed bottom-3 right-3 lg:bottom-5 lg:right-5 z-[10000]
            flex flex-col items-end space-y-2
            pointer-events-none
            max-w-[calc(100vw-24px)] lg:max-w-md
          "
                >
                    <AnimatePresence>
                        {toasts.map((toast) => {
                            const hasAnimated = animatedOnce.has(toast.id)
                            return (
                                <motion.div
                                    key={toast.id}
                                    initial={hasAnimated ? false : { opacity: 0, x: 50, scale: 0.98 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: 50, scale: 0.98 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 24,
                                        duration: 0.25,
                                    }}
                                    onAnimationComplete={() => animatedOnce.add(toast.id)}
                                    className="pointer-events-auto"
                                >
                                    <Toast {...toast} />
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    )
}
