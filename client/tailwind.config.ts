import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"
import plugin from "tailwindcss/plugin"

const config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },

    extend: {
      borderImage: {
        gradient:
          "linear-gradient(139.37deg, rgba(237,237,229,0.45) 3.33%, rgba(82,78,70,0.66) 99.12%) 1",
      },
      screens: {
        "xl-1280": "1280px",
        "2xl": "1536px",
        "3xl": "1440px",
        "4xl": "1920px",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#3b82f6", // blue-500
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#1e40af", // blue-800
          foreground: "#ffffff",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Custom colors for dark blockchain theme
        dark: {
          100: "#1a1a2e",
          200: "#16213e",
          300: "#0f3460",
          400: "#0a2342",
          500: "#061b33",
        },
        neon: {
          blue: "#00f2ff",
          purple: "#8a2be2",
          pink: "#ff00ff",
          green: "#00ff9d",
          yellow: "#ffff00",
          orange: "#ff7700",
        },
      },
      fontFamily: {
        "ibm-mono": ["IBM Plex Mono", "Courier New", "monospace"],
        sans: [
          "IBM Plex Mono",
          "Courier New",
          "monospace",
          "system-ui",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "Courier New", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-neon": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glow: {
          "0%, 100%": {
            boxShadow:
              "0 0 5px rgba(0, 242, 255, 0.5), 0 0 10px rgba(0, 242, 255, 0.3)",
          },
          "50%": {
            boxShadow:
              "0 0 20px rgba(0, 242, 255, 0.8), 0 0 30px rgba(0, 242, 255, 0.5)",
          },
        },
        "data-flow": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "text-shimmer": {
          "0%": { backgroundPosition: "100%" },
          "100%": { backgroundPosition: "0%" },
        },
        "rotate-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "bounce-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        ripple: {
          "0%": { transform: "scale(0.8)", opacity: "1" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-left": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-right": {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "particles-float": {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "25%": { transform: "translateY(-10px) translateX(10px)" },
          "50%": { transform: "translateY(0) translateX(20px)" },
          "75%": { transform: "translateY(10px) translateX(10px)" },
        },
        "float-out": {
          to: {
            transform: "rotate(360deg)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-neon": "pulse-neon 2s infinite",
        float: "float 6s ease-in-out infinite",
        glow: "glow 2s infinite",
        "data-flow": "data-flow 10s linear infinite",
        "text-shimmer": "text-shimmer 3s ease-in-out infinite",
        "rotate-slow": "rotate-slow 20s linear infinite",
        "spin-slow": "spin-slow 12s linear infinite",
        "bounce-slow": "bounce-slow 6s ease-in-out infinite",
        ripple: "ripple 2s cubic-bezier(0, 0.2, 0.8, 1) infinite",
        "slide-up": "slide-up 0.6s ease-out",
        "slide-down": "slide-down 0.6s ease-out",
        "slide-left": "slide-left 0.6s ease-out",
        "slide-right": "slide-right 0.6s ease-out",
        "particles-float": "particles-float 8s ease-in-out infinite",
        "spin-slow1": "spin 3s linear infinite",
        "float-out": "float-out var(--duration) var(--delay) infinite linear",
      },
      backgroundImage: {
        "cyber-grid":
          "linear-gradient(rgba(0, 242, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 242, 255, 0.1) 1px, transparent 1px)",
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "text-gradient":
          "linear-gradient(to right, #00f2ff, #8a2be2, #ff00ff, #00ff9d)",
        "hexagon-pattern": 'url("/hexagon-pattern.svg")',
        "conic-gradient":
          "conic-gradient(from 0deg, transparent 0deg, white 360deg)",
      },
      backgroundSize: {
        "text-gradient-size": "200% auto",
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    plugin(function ({ addUtilities }) {
      const newUtilities = {
        ".border-gradient": {
          borderImageSource:
            "linear-gradient(139.37deg, rgba(237,237,229,0.45) 3.33%, rgba(82,78,70,0.66) 99.12%)",
          borderImageSlice: "1",
        },
      }
      addUtilities(newUtilities, ["responsive"])
    }),
  ],
} satisfies Config

export default config
