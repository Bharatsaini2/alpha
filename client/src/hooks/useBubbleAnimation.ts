import { useEffect, useState } from "react"

interface BubbleAnimationConfig {
  duration?: number
  intensity?: number
  delay?: number
  type?: "float" | "drift" | "pulse" | "rotate"
}

interface BubbleAnimationState {
  x: number
  y: number
  scale: number
  rotate: number
}

export const useBubbleAnimation = (config: BubbleAnimationConfig = {}) => {
  const { duration = 4000, intensity = 0.5, delay = 0, type = "float" } = config

  const [animationState, setAnimationState] = useState<BubbleAnimationState>({
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  })

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    if (prefersReducedMotion) {
      return
    }

    const startTime = Date.now() + delay
    let animationId: number

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = (elapsed % duration) / duration

      // Create smooth, continuous animations
      const t = progress * 2 * Math.PI // Convert to radians

      let newState: BubbleAnimationState = {
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0,
      }

      switch (type) {
        case "float":
          newState.y = Math.sin(t) * intensity * 8 // Vertical floating
          newState.x = Math.cos(t * 0.7) * intensity * 4 // Slight horizontal drift
          break
        case "drift":
          newState.x = Math.sin(t) * intensity * 12 // Horizontal drift
          newState.y = Math.cos(t * 0.5) * intensity * 6 // Vertical drift
          break
        case "pulse":
          newState.scale = 1 + Math.sin(t) * intensity * 0.1 // Scale pulsing
          newState.y = Math.sin(t * 0.8) * intensity * 4 // Slight floating
          break
        case "rotate":
          newState.rotate = t * 30 // Slow rotation
          newState.y = Math.sin(t) * intensity * 6 // Floating with rotation
          break
        default:
          // Combined gentle animation
          newState.y = Math.sin(t) * intensity * 6
          newState.x = Math.cos(t * 0.6) * intensity * 3
          newState.scale = 1 + Math.sin(t * 1.2) * intensity * 0.05
      }

      setAnimationState(newState)
      animationId = requestAnimationFrame(animate)
    }

    // Start animation after delay
    const timeoutId = setTimeout(() => {
      animationId = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [duration, intensity, delay, type])

  return animationState
}

// Hook for generating random animation parameters
export const useRandomBubbleAnimation = () => {
  const [config] = useState<BubbleAnimationConfig>(() => ({
    duration: 4000 + Math.random() * 3000, // 4-7 seconds (reduced range)
    intensity: 0.2 + Math.random() * 0.3, // 0.2-0.5 intensity (reduced)
    delay: Math.random() * 2000,
    type: ["float", "drift", "pulse", "rotate"][
      Math.floor(Math.random() * 4)
    ] as any,
  }))

  return useBubbleAnimation(config)
}
