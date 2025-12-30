import React, { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckIcon, XIcon } from "lucide-react"
import { createPortal } from "react-dom"
import { FaRegCheckSquare } from "react-icons/fa";
import { ImSpinner4 } from "react-icons/im";



export interface ToastProps {
  id: string
  message: string
  type?: "success" | "error" | "info"
  duration?: number
  onClose: (id: string) => void
}

const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = "success",
  duration = 3000,
  onClose,
}) => {
  // Single timer: after duration, ask manager to remove this toast.
  useEffect(() => {
    const t = setTimeout(() => onClose(id), duration)
    return () => clearTimeout(t)
  }, [id, duration, onClose])

  const getToastStyles = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-[#16171C]",
          border: "border-white/70",
          icon: <CheckIcon className="w-5 h-5 text-white" />,
        }
      case "error":
        return {
          bg: "bg-[#16171C]",
          border: "border-white/70",
          icon: <XIcon className="w-4 h-4 text-white" />,
        }
      case "info":
        return {
          bg: "bg-[#16171C]",
          border: "border-white/70",
          icon: <div className="w-4 h-4 rounded-full bg-white/20" />,
        }
      default:
        return {
          bg: "bg-[#16171C]",
          border: "border-white/70",
          icon: <div className="w-4 h-4 rounded-full bg-white/20" />,
        }
    }
  }

  const styles = getToastStyles()

  // Note: no inner AnimatePresence or motion here.
  return (
    <>

      {/* Old Copy Address */}
      {/* <div
      className={`
        ${styles.bg} ${styles.border} border
        rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm
        flex items-center space-x-2 min-w-[300px] max-w-[500px]
      `}
    >
      <div className="flex-shrink-0">{styles.icon}</div>
      <div className="flex-1 text-white text-sm font-medium">
        {message}
      </div>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div> */}


      {/* New Coppied Address */}
      <div className="coppied-address">
        <div className="coppied-content">
          <span className="coppied-icon"><FaRegCheckSquare /></span>
          <p>Address copied to clipboard!</p>
          <button
            onClick={() => onClose(id)}
            className="coppied-btn"
          >
            Close
          </button>
        </div>
      </div>





      {/* New Connecting Modal */}
      {/* <div className="coppied-address connecting-bx">
        <div className="coppied-content">
          <span className="coppied-icon text-white"><ImSpinner4 /></span>
          <p>connecting wallet           
          </p>
          <div className="three-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
        </div>
      </div> */}



{/* Panthom Wallet */}
      {/* <div className="coppied-address connecting-bx">
        <div className="coppied-content">
          <span className="coppied-icon text-white">
            <img src="pantham-logo.png" alt="" style={{width : "16px" , height : "16px"}} />
          </span>
          <p>Phantom wallet connected          
          </p>
          
        </div>
      </div>  */}



    </>
  )
}
const animatedOnce = new Set<string>()

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([])
  const [isDebouncing, setIsDebouncing] = useState(false)

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = (
    message: string,
    type: ToastProps["type"] = "success",
    duration?: number
  ) => {
    if (isDebouncing) return null
    setIsDebouncing(true)

    const id =
      globalThis.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2, 11)
    setToasts((prev) => [
      ...prev,
      { id, message, type, duration, onClose: removeToast },
    ])

    setTimeout(() => setIsDebouncing(false), 1000)
    return id
  }

  const ToastContainer = () =>
    createPortal(
      // Old Coppied Address by Top
      // <div
      //   className="
      //     fixed inset-x-0 top-4 z-[10000]
      //     flex w-screen flex-col items-center space-y-2
      //     pointer-events-none
      //   "
      // >
      //   <AnimatePresence>
      //     {toasts.map((toast) => {
      //       const hasAnimated = animatedOnce.has(toast.id)
      //       return (
      //         <motion.div
      //           key={toast.id}
      //           initial={
      //             hasAnimated ? false : { opacity: 0, y: -50, scale: 0.98 }
      //           }
      //           animate={{ opacity: 1, y: 0, scale: 1 }}
      //           exit={{ opacity: 0, y: -30, scale: 0.98 }}
      //           transition={{
      //             type: "spring",
      //             stiffness: 300,
      //             damping: 24,
      //             duration: 0.25,
      //             repeat: 0,
      //           }}
      //           onAnimationComplete={() => animatedOnce.add(toast.id)}
      //           className="pointer-events-auto"
      //         >
      //           <Toast {...toast} />
      //         </motion.div>
      //       )
      //     })}
      //   </AnimatePresence>
      // </div>,

      // New Coppied Address by Bottom
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
    )

  return { showToast, removeToast, ToastContainer }
}
