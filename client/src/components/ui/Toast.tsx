import React, { useEffect, useState, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"
import { FaRegCheckSquare } from "react-icons/fa"
import { ToastContext } from "../../contexts/ToastContext"

export interface ToastOptions {
    duration?: number
    txSignature?: string
    title?: string
    icon?: string
    actionLabel?: string
    onAction?: () => void
}

export interface ToastProps {
    id: string
    message: string
    type?: "success" | "error" | "info" | "warning"
    variant?: "default" | "wallet" | "simple"
    options?: ToastOptions
    onClose: (id: string) => void
}

const Toast: React.FC<ToastProps> = ({
    id,
    message,
    type,
    variant,
    options,
    onClose,
}) => {
    const duration = options?.duration ?? 3000

    useEffect(() => {
        if (duration > 0) {
            const t = setTimeout(() => onClose(id), duration)
            return () => clearTimeout(t)
        }
    }, [id, duration, onClose])

    // Custom rendering for "wallet" variant or others if needed
    if (variant === "wallet") {
        return (
            <div className="coppied-address" style={{ minWidth: '300px' }}>
                <div className="coppied-content">
                    {options?.icon && (
                        <img src={options.icon} alt="icon" className="w-6 h-6 rounded-full" />
                    )}
                    {!options?.icon && <span className="coppied-icon"><FaRegCheckSquare /></span>}
                    <div>
                        {options?.title && <h4 className="font-bold text-sm text-white">{options.title}</h4>}
                        <p className="text-gray-300 text-xs">{message}</p>
                    </div>

                    <button onClick={() => onClose(id)} className="coppied-btn ml-auto">
                        Close
                    </button>
                </div>
            </div>
        )
    }

    // Default implementation (from previous step)
    return (
        <div className="coppied-address">
            <div className="coppied-content">
                <span className="coppied-icon"><FaRegCheckSquare /></span>
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

const animatedOnce = new Set<string>()

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastProps[]>([])

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const showToast = useCallback((
        message: string,
        type: ToastProps["type"] = "success",
        variant: ToastProps["variant"] = "default",
        options: ToastOptions = {}
    ) => {
        // rudimentary deduping or limiting could go here if needed
        const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11)

        setToasts((prev) => [
            ...prev,
            { id, message, type, variant, options, onClose: removeToast }
        ])

        return id
    }, [removeToast])

    const contextValue = useMemo(() => ({ showToast, removeToast }), [showToast, removeToast])

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            {createPortal(
                <div
                    className="
            fixed bottom-5 right-5 z-[10000]
            flex flex-col items-end space-y-2
            pointer-events-none
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

// Re-export useToast from context to maintain compatibility if anyone imports it from here
// although typically they should import from context. 
// But just in case, let's allow it if it doesn't conflict. 
// Actually, `ToastContext.tsx` imports `ToastProps` from here. 
// If we import `useToast` from `ToastContext`, we create a cycle?
// ToastContext imports ToastProps (Type) -> Safe.
// Toast.tsx imports ToastContext (Value) -> Safe.
// We can re-export useToast.
export { useToast } from '../../contexts/ToastContext';
