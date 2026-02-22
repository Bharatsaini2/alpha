import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  EdgeTypes,
  Position,
  Handle,
  NodeProps,
  EdgeProps,
  addEdge,
  Panel,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  useUpdateNodeInternals,
  Background,
  MiniMap,
  BackgroundVariant,
  NodeToolbar,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { motion } from "framer-motion"
import { toPng, toSvg } from "html-to-image"
import { CheckIcon, ChevronDown, X, RefreshCw, Save, Maximize2 } from "lucide-react"
import axios from "axios"
import CopyIcon from "../assets/Copy.svg"
import ExternalLinkIcon from "../assets/ExternalLink.svg"
import DefaultTokenImage from "../assets/default_token.svg"
import solanalogo from "../assets/solana.svg"
import { applyForceLayout } from "../utils/ForceLayout"
import { useNavigate } from "react-router-dom"
import { useToast } from "../contexts/ToastContext"
import { useAuth } from "../contexts/AuthContext"
import { usePremiumAccess } from "../contexts/PremiumAccessContext"
import api from "../lib/api"
import { LastUpdatedTicker } from "./TicketComponent"
import { useRandomBubbleAnimation } from "../hooks/useBubbleAnimation"
import { SiTelegram } from "react-icons/si"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPaperPlane, faCheck, faClose } from "@fortawesome/free-solid-svg-icons"
import MarketCapRangeSlider from "./MarketCapRangeSlider"

interface Whale {
  id: string
  address: string
  buyVolume: number
  // Optional influencer fields if API returns them, otherwise unused
  sellVolume: number
  lastAction: string
  trades: { type: string; amount: number; timestamp: string | number }[]
  influencerName?: string
  influencerUsername?: string
  influencerProfileImageUrl?: string
  influencerFollowerCount?: number
  whaleLabel?: string[]
}

interface Coin {
  id: string
  symbol: string
  name: string
  imageUrl: string
  totalBuyInflow: number
}

interface CoinWithWhales {
  coin: Coin
  whales: Whale[]
}

const BASE_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9090"

const makeEdgeId = (
  coinId: string,
  whaleNodeId: string,
  type: string,
  ts: number,
  amt: number
) => `edge_${coinId}_${whaleNodeId}_${type}_${ts}_${Math.round(amt * 1000)}`

// -----------------------------
// Custom Coin Node – same design as Whale visualize, label on hover
// -----------------------------
const CoinNode: React.FC<NodeProps> = ({ data, id }) => {
  const bubbleAnimation = useRandomBubbleAnimation()
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    const timeoutId = setTimeout(() => updateNodeInternals(id), 100)
    return () => clearTimeout(timeoutId)
  }, [
    Math.round(bubbleAnimation.x / 5) * 5,
    Math.round(bubbleAnimation.y / 5) * 5,
    Math.round(bubbleAnimation.scale * 20) / 20,
    updateNodeInternals,
    id,
  ])

  const symbol = ((data.symbol as string) || "Token").toUpperCase()
  const buy = (data.totalBuyAmount as number) ?? 0
  const sell = (data.totalSellAmount as number) ?? 0
  const borderColor = buy >= sell ? "#06DF73" : "#df2a4e"

  return (
    <div className="relative flex flex-col items-center w-[80px] min-h-[100px]">
      <Handle
        type="source"
        position={Position.Left}
        style={{
          top: "50%",
          left: "50%",
          background: "transparent",
          border: "none",
          width: 0,
          height: 0,
          minWidth: 0,
          minHeight: 0,
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative w-[72px] h-[72px] flex items-center justify-center shrink-0">
        <div
          className="relative w-16 h-16 rounded-full bg-black flex items-center justify-center p-[3px] shrink-0"
          style={{
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 6px ${borderColor}dd, 0 0 12px ${borderColor}99`,
          }}
        >
          <div
            className="w-full h-full rounded-full flex items-center justify-center p-[3px] shrink-0 bg-[#2d2d2d]"
            style={{ borderColor: "#2d2d2d", borderWidth: 2, borderStyle: "solid" }}
          >
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center p-[2px] shrink-0 overflow-hidden">
              <img
                src={
                  symbol === "SOL" || symbol === "WSOL"
                    ? solanalogo
                    : (data.imageUrl as string) || DefaultTokenImage
                }
                alt={symbol}
                className="w-10 h-10 object-cover rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
      <div
        className="mt-0.5 rounded-none border px-0.5 py-px max-w-[60px] overflow-hidden antialiased"
        style={{ fontFamily: "Inter, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif", borderWidth: 1, borderColor: "#1f1f1f", backgroundColor: "#161414", WebkitFontSmoothing: "antialiased" as any }}
      >
        <span className="block text-[8px] font-medium tracking-tight uppercase whitespace-nowrap text-ellipsis overflow-hidden text-[#8f8f8f]" title={symbol}>
          {symbol}
        </span>
      </div>
    </div>
  )
}

// -----------------------------
// Custom Whale Node (KOL) – same design as Whale visualize
// -----------------------------
const WhaleNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const [imageError, setImageError] = useState(false)
  const bubbleAnimation = useRandomBubbleAnimation()
  const updateNodeInternals = useUpdateNodeInternals()
  const { showToast } = useToast()
  const { setNodes } = useReactFlow()

  useEffect(() => {
    const timeoutId = setTimeout(() => updateNodeInternals(id), 100)
    return () => clearTimeout(timeoutId)
  }, [
    Math.round(bubbleAnimation.x / 5) * 5,
    Math.round(bubbleAnimation.y / 5) * 5,
    Math.round(bubbleAnimation.scale * 20) / 20,
    updateNodeInternals,
    id,
  ])

  const address = (data.address as string) || ""
  const whaleLabels = (data.whaleLabel as string[] | undefined) || []
  const groupName = whaleLabels.length > 0 ? whaleLabels[0] : null
  const displayName = (data.influencerName as string) || groupName || (address.length > 12 ? `${address.slice(0, 5)}...${address.slice(-6)}` : address || "KOL")
  const shortLabel = displayName.length > 14 ? `${displayName.slice(0, 10)}...` : displayName
  const initial = ((data.influencerName as string)?.trim().slice(0, 1) || (address ? address.slice(0, 1) : "")).toUpperCase() || "K"
  const buy = (data.totalBuyAmount as number) ?? 0
  const sell = (data.totalSellAmount as number) ?? 0
  const borderColor = buy >= sell ? "#06DF73" : "#df2a4e"
  const imageUrl = (data.influencerProfileImageUrl as string) || (data.imageUrl as string)

  const handleClose = () => {
    setNodes((nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, selected: false } : n))
    )
  }

  return (
    <>
      <NodeToolbar
        isVisible={!!selected}
        position={Position.Right}
        align="center"
        offset={16}
        className="!bg-[#0a0a0a] !border-2 !border-[#1a1a1a] !shadow-xl !rounded-none !min-w-0 !max-w-[200px] !p-0 !z-[9999] pointer-events-auto"
      >
        <div className="p-2 font-sans antialiased text-[11px] rounded-none" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[#666]">KOL Address</span>
            <button onClick={(e) => { e.stopPropagation(); handleClose() }} className="text-[#555] hover:text-white p-0.5" aria-label="Close">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 mb-2">
            <code className="text-white text-[10px] font-medium tracking-tight flex-1 min-w-0" title={address || undefined}>
              {address ? (address.length > 12 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address) : "—"}
            </code>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={() => { if (address) { navigator.clipboard.writeText(address); showToast("Copied!", "success") } }} className="p-1 rounded text-[#666] hover:text-[#06DF73]" aria-label="Copy">
                <img src={CopyIcon} alt="" className="w-3 h-3" />
              </button>
              <a href={`https://solscan.io/address/${address}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-[#666] hover:text-[#06DF73]" aria-label="Solscan">
                <img src={ExternalLinkIcon} alt="" className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#222]">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-[#06DF73]">Buy</div>
              <div className="text-white text-[10px] font-semibold">
                {(Array.isArray(data.trades) ? data.trades.filter((t: any) => (t.type as string)?.toLowerCase() === "buy") : []).length}
                <span className="text-[#666] font-normal ml-0.5">${Math.round(Number(data.totalBuyAmount) || 0).toLocaleString()}</span>
              </div>
            </div>
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-[#df2a4e]">Sell</div>
              <div className="text-white text-[10px] font-semibold">
                {(Array.isArray(data.trades) ? data.trades.filter((t: any) => (t.type as string)?.toLowerCase() === "sell") : []).length}
                <span className="text-[#666] font-normal ml-0.5">${Math.round(Number(data.totalSellAmount) || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </NodeToolbar>

      <div className="relative flex flex-col items-center cursor-pointer w-[70px] min-h-[90px]">
        <Handle type="target" position={Position.Right} style={{ top: "50%", left: "50%", background: "transparent", border: "none", width: 0, height: 0, minWidth: 0, minHeight: 0, transform: "translate(-50%, -50%)" }} />
        <div className="relative w-[72px] h-[72px] flex items-center justify-center shrink-0">
          <div className="relative w-16 h-16 rounded-full bg-black flex items-center justify-center p-[3px] shrink-0" style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 6px ${borderColor}dd, 0 0 12px ${borderColor}99` }}>
            <div className="w-full h-full rounded-full flex items-center justify-center p-[3px] shrink-0 bg-[#484848]" style={{ borderColor: "#484848", borderWidth: 2, borderStyle: "solid" }}>
              <div className="w-full h-full rounded-full bg-black flex items-center justify-center p-[2px] shrink-0 overflow-hidden">
                {imageUrl && !imageError ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[#484848]">
                    <img src={imageUrl} alt={shortLabel} className="w-full h-full object-cover object-center" onError={() => setImageError(true)} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-[#484848]">
                    <span className="text-white font-bold text-base leading-none flex items-center justify-center w-full h-full select-none" style={{ fontSize: "1.25rem" }}>
                      {initial}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div
          className="mt-0.5 rounded-none border px-0.5 py-px max-w-[60px] overflow-hidden antialiased"
          style={{ fontFamily: "Inter, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif", borderWidth: 1, borderColor: "#1f1f1f", backgroundColor: "#161414", WebkitFontSmoothing: "antialiased" as any }}
        >
          <span className="block text-[8px] font-medium tracking-tight uppercase whitespace-nowrap text-ellipsis overflow-hidden text-[#8f8f8f]" title={displayName}>
            {shortLabel}
          </span>
        </div>
      </div>
    </>
  )
}

// -----------------------------
// Custom Edge – same as Whale visualize (straight line, buy/sell colors)
// -----------------------------
// Custom Edge – one per (token, whale), draws buy and/or sell line(s)
// -----------------------------
const CustomEdge = React.memo<EdgeProps>(function CustomEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const [isHovered, setIsHovered] = useState(false)
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const spreadMult = 1.2
  const step = 1.5

  const isMixed = (data?.type as string) === "mixed"
  const hasBuy = isMixed ? !!(data?.hasBuy) : (data?.type as string)?.toLowerCase() === "buy"
  const hasSell = isMixed ? !!(data?.hasSell) : (data?.type as string)?.toLowerCase() === "sell"

  const paths: { d: string; stroke: string; strokeWidth: number }[] = []
  if (isMixed) {
    if (hasBuy) {
      const spread = -step * spreadMult
      paths.push({
        d: `M ${sourceX + nx * spread} ${sourceY + ny * spread} L ${targetX - nx * spread} ${targetY - ny * spread}`,
        stroke: "#06DF73",
        strokeWidth: isHovered ? 1.25 : 1,
      })
    }
    if (hasSell) {
      const spread = step * spreadMult
      paths.push({
        d: `M ${sourceX + nx * spread} ${sourceY + ny * spread} L ${targetX - nx * spread} ${targetY - ny * spread}`,
        stroke: "#df2a4e",
        strokeWidth: isHovered ? 2 : 1.5,
      })
    }
  } else {
    const edgeOffset = (data?.edgeOffset as number) ?? 0
    const spread = edgeOffset * spreadMult
    const startX = sourceX + nx * spread
    const startY = sourceY + ny * spread
    const endX = targetX - nx * spread
    const endY = targetY - ny * spread
    const stroke = hasBuy ? "#06DF73" : "#df2a4e"
    const strokeWidth = hasSell ? (isHovered ? 2 : 1.5) : (isHovered ? 1.25 : 1)
    paths.push({ d: `M ${startX} ${startY} L ${endX} ${endY}`, stroke, strokeWidth })
  }

  return (
    <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {paths.map((p, i) => (
        <path key={i} id={i === 0 ? id : undefined} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeOpacity={1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </g>
  )
})


// Download Button Logic
const isIOS = () => {
  const ua = navigator.userAgent || ""
  const isTouchMac = ua.includes("Mac") && "ontouchend" in document
  return /iPad|iPhone|iPod/.test(ua) || isTouchMac
}

const drawSvgToPng = async (
  svgMarkup: string,
  width: number,
  height: number,
  pixelRatio = 2
) => {
  const img = new Image()
  img.decoding = "async"
  const svgDataUrl =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgMarkup)
  img.src = svgDataUrl
  await img.decode()

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/png")
}

const toPngWithRetry = async (el: HTMLElement, opts: any, attempts = 3) => {
  let last = ""
  for (let i = 0; i < attempts; i++) {
    const url = await toPng(el, opts)
    if (url.length > last.length) return url
    last = url
    await new Promise((r) => setTimeout(r, 150))
  }
  return last
}

const CONTROL_BTN =
  "inline-flex items-center gap-2 !p-[6px_10px] !text-[10px] !text-[#8f8f8f] !bg-[#0a0a0a] border border-[#1f1f1f] !rounded-none uppercase tracking-wider font-bold whitespace-nowrap hover:!text-[#06DF73] hover:!border-[#06DF73] transition-colors disabled:!opacity-50 disabled:cursor-not-allowed"

const DownloadButton: React.FC<{
  onDownloadReady?: (trigger: () => Promise<void>) => void
  onScreenshotError?: () => void
  filename?: string
}> = ({ onDownloadReady, onScreenshotError, filename = "kol-network-graph" }) => {
  const { getNodes } = useReactFlow()

  const downloadImage = (dataUrl: string, asJpg = true): Promise<void> => {
    return new Promise((resolve) => {
      if (asJpg) {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          const c = document.createElement("canvas")
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext("2d")
          if (!ctx) {
            const a = document.createElement("a")
            a.setAttribute("download", `${filename}.png`)
            a.setAttribute("href", dataUrl)
            a.click()
            resolve()
            return
          }
          ctx.fillStyle = "#000000"
          ctx.fillRect(0, 0, c.width, c.height)
          ctx.drawImage(img, 0, 0)
          const jpgUrl = c.toDataURL("image/jpeg", 0.92)
          const a = document.createElement("a")
          a.setAttribute("download", `${filename}.jpg`)
          a.setAttribute("href", jpgUrl)
          a.click()
          resolve()
        }
        img.onerror = () => {
          const a = document.createElement("a")
          a.setAttribute("download", `${filename}.png`)
          a.setAttribute("href", dataUrl)
          a.click()
          resolve()
        }
        img.src = dataUrl
      } else {
        const a = document.createElement("a")
        a.setAttribute("download", `${filename}.png`)
        a.setAttribute("href", dataUrl)
        a.click()
        resolve()
      }
    })
  }

  const imageWidth = 1920
  const imageHeight = 1080

  const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(`${BASE_URL}/proxy-image?url=${url}`, {
        mode: "cors",
      })
      const blob = await response.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
    } catch (err) {
      console.error("⚠️ Failed to fetch image:", url, err)
      return null
    }
  }

  const prepareImagesForScreenshot = async () => {
    const images = document.querySelectorAll(".react-flow__viewport img")
    const originalSources: Array<{
      element: HTMLImageElement
      originalSrc: string
    }> = []

    images.forEach(async (img) => {
      const imgElement = img as HTMLImageElement
      const originalSrc = imgElement.src
      if (originalSrc && originalSrc.startsWith("http")) {
        originalSources.push({ element: imgElement, originalSrc })
        const dataUrl = await fetchImageAsDataUrl(originalSrc)
        if (dataUrl) {
          imgElement.src = dataUrl
        } else {
          imgElement.src = DefaultTokenImage
        }
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 300))
    return originalSources
  }

  const restoreOriginalImages = (
    originalSources: Array<{ element: HTMLImageElement; originalSrc: string }>
  ) => {
    originalSources.forEach(({ element, originalSrc }) => {
      element.src = originalSrc
    })
  }

  const onClickRef = useRef<() => Promise<void>>(() => Promise.resolve())
  useEffect(() => {
    onDownloadReady?.(() => onClickRef.current())
    return () => onDownloadReady?.(() => Promise.resolve())
  }, [onDownloadReady])

  const onClick = async () => {
    let originalSources: Array<{
      element: HTMLImageElement
      originalSrc: string
    }> = []
    const targetEl = document.querySelector(
      ".react-flow__viewport"
    ) as HTMLElement | null
    if (!targetEl) return

    const root = document.querySelector(".react-flow") || document.body
    const nodesBounds = getNodesBounds(getNodes())
    const viewport = getViewportForBounds(
      nodesBounds,
      imageWidth,
      imageHeight,
      0.5,
      2,
      0.5
    )

    try {
      originalSources = await prepareImagesForScreenshot()
      root.classList.add("snapshot-mode")

      let dataUrl = ""

      if (isIOS()) {
        const svgMarkup = await toSvg(targetEl, {
          backgroundColor: "#000000",
          width: imageWidth,
          height: imageHeight,
          style: {
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          },
          skipFonts: true,
          skipAutoScale: true,
          preferredFontFormat: "woff2",
        })
        dataUrl = await drawSvgToPng(svgMarkup, imageWidth, imageHeight, 2)
      } else {
        dataUrl = await toPngWithRetry(
          targetEl,
          {
            backgroundColor: "#000000",
            width: imageWidth,
            height: imageHeight,
            style: {
              width: `${imageWidth}px`,
              height: `${imageHeight}px`,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            },
            pixelRatio: 2,
            skipFonts: true,
            skipAutoScale: true,
            preferredFontFormat: "woff2",
          },
          2
        )
      }

      await downloadImage(dataUrl, true)
    } catch (error) {
      console.error("Error downloading image:", error)
      try {
        const dataUrl = await toPng(targetEl, {
          backgroundColor: "#000000",
          width: imageWidth,
          height: imageHeight,
          style: {
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          },
          pixelRatio: 1,
          skipFonts: true,
          skipAutoScale: true,
        })
        await downloadImage(dataUrl, true)
      } catch (fallbackError) {
        console.error("Fallback download also failed:", fallbackError)
        onScreenshotError?.()
      }
    } finally {
      root.classList.remove("snapshot-mode")
      if (originalSources.length > 0) {
        setTimeout(() => {
          restoreOriginalImages(originalSources)
        }, 100)
      }
    }
  }
  onClickRef.current = onClick

  return (
    <>
      <Panel
        position="bottom-left"
        className="m-2 pointer-events-none select-none"
      >
        <div className="flex items-center gap-2 opacity-60">
          <img
            src="/logo.png"
            alt="AlphaBlock"
            className="w-3 h-3 md:w-4 md:h-4 opacity-80"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <span className="text-[10px] md:text-[11px] text-white font-medium tracking-widest uppercase font-mono">
            POWERED BY ALPHABLOCK AI
          </span>
        </div>
      </Panel>
    </>
  )
}



const KolNetworkGraph: React.FC<{
  isOpen: boolean
  onClose: () => void
}> = ({ isOpen, onClose }) => {
  const [apiData, setApiData] = useState<CoinWithWhales[]>([])
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()
  const { user } = useAuth()
  const { validateAccess } = usePremiumAccess()
  const navigate = useNavigate()
  // NOTE: useViewport might throw if not wrapped in ReactFlowProvider, but keeping existing code safe
  // const { x: vpX, y: vpY, zoom } = useViewport()

  const [rfInstance, setRfInstance] = useState<any>(null)

  const [filters, setFilters] = useState({
    timeframe: "15m",
    whales: "20", // Used as KOL count limit
    volume: "0",
  })

  // Removed touched state to always show active filter values

  const [dropdown, setDropdown] = useState<string | null>(null)
  const [customWhales, setCustomWhales] = useState("")
  const [customVolume, setCustomVolume] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null)

  const [mergedData, setMergedData] = useState<CoinWithWhales[]>([])
  const positionsRef = React.useRef<Record<string, { x: number; y: number }>>(
    {}
  )
  const layoutAppliedRef = React.useRef(false)

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      coin: CoinNode,
      whale: WhaleNode,
    }),
    []
  )

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      custom: CustomEdge,
    }),
    []
  )

  const [isSaved, setIsSaved] = useState(false)
  const [isActivatingAlert, setIsActivatingAlert] = useState(false)
  const [triggerDownload, setTriggerDownload] = useState<(() => Promise<void>) | null>(null)
  const [minMarketCap, setMinMarketCap] = useState(1000)
  const [maxMarketCap, setMaxMarketCap] = useState(50000000)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [whalesOpen, setWhalesOpen] = useState(false)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [mcapOpen, setMcapOpen] = useState(false)
  const [customVolumeInput, setCustomVolumeInput] = useState("")

  const updateDataDirectly = useCallback((newData: CoinWithWhales[]) => {
    setMergedData(newData)
  }, [])

  // Fetch data
  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        // const whaleCount = customWhales || filters.whales
        const volumeValue = customVolume || filters.volume

        const numericVolume = volumeValue.toString().includes("K")
          ? parseInt(volumeValue.replace("K", ""), 10) * 1000
          : parseInt(volumeValue, 10) || 0

        // Use correct endpoint for KOLs
        // Using minKols=1 to fetch all and then filter by top N on client side (similar to whale graph)
        // If specific param needed by backend, adjust here. Assuming params mirror whale one for now as per instructions.
        const res = await axios.get(
          `${BASE_URL}/influencer/visualize-kols?timeframe=${filters.timeframe}&minKols=1&minInflow=${numericVolume}`
        )

        const newData = res.data.data || []
        setApiData(newData)
        updateDataDirectly(newData)
        setLastUpdatedTime(new Date())
      } catch (err) {
        console.error("❌ Error fetching visualize KOLs:", err)
        setApiData([])
      } finally {
        if (isRefresh) {
          setIsRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [filters, customWhales, customVolume, updateDataDirectly]
  )

  // KOL Feed Visualise: activates KOL Cluster alert (multiple KOLs, same token, timeframe + min volume)
  const handleActivateKolClusterAlert = useCallback(() => {
    const token = localStorage.getItem("accessToken")
    if (!token) {
      showToast("Please log in to activate KOL Cluster alerts", "error")
      return
    }
    if (!user?.telegramChatId) {
      showToast(
        "Please connect your Telegram account first from the Telegram Subscription page",
        "error"
      )
      return
    }
    validateAccess(async () => {
      setIsActivatingAlert(true)
      try {
        const timeWindowMinutes =
          parseInt((filters.timeframe || "15m").replace("m", ""), 10) || 15
        const minClusterSize = parseInt(filters.whales, 10) || 1
        const volStr = customVolume || filters.volume || "0"
        const minInflowUSD =
          volStr === "0" || !volStr
            ? 0
            : parseFloat(volStr.replace(/[Kk]/g, "")) *
              (volStr.toLowerCase().includes("k") ? 1000 : 1)
        const response = await api.post("/alerts/kol-cluster", {
          timeWindowMinutes,
          minClusterSize,
          minInflowUSD: Math.round(minInflowUSD),
          minMarketCapUSD: minMarketCap,
          maxMarketCapUSD: maxMarketCap >= 50000000 ? 50000000 : maxMarketCap,
        })
        if (response.data?.success) {
          setIsSaved(true)
          setDropdown(null)
          showToast("KOL Cluster alert activated", "success")
        } else {
          showToast(
            response.data?.message || "Failed to activate alert",
            "error"
          )
        }
      } catch (err: any) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          "Failed to activate KOL Cluster alert"
        showToast(msg, "error")
      } finally {
        setIsActivatingAlert(false)
      }
    })
  }, [
    filters.timeframe,
    filters.whales,
    filters.volume,
    customVolume,
    minMarketCap,
    maxMarketCap,
    user?.telegramChatId,
    showToast,
    validateAccess,
  ])

  // Process data for React Flow
  const { nodes, edges } = useMemo(() => {
    let flowNodes: Node[] = []
    const flowEdges: Edge[] = []
    const dataToProcess = mergedData.length > 0 ? mergedData : apiData

    if (!dataToProcess || dataToProcess.length === 0) {
      return { nodes: flowNodes, edges: flowEdges }
    }

    const allTrades = dataToProcess.flatMap((coinData) =>
      coinData.whales.flatMap((whale) =>
        whale.trades.map((trade) => ({
          ...trade,
          coinId: coinData.coin.id,
          coinSymbol: coinData.coin.symbol,
          whaleId: whale.id,
          whaleAddress: whale.address,
          influencerName: whale.influencerName,
          influencerProfileImageUrl: whale.influencerProfileImageUrl,
          whaleLabel: whale.whaleLabel,
          amount:
            typeof trade.amount === "string"
              ? parseFloat(trade.amount)
              : trade.amount,
          timestamp:
            typeof trade.timestamp === "string"
              ? new Date(trade.timestamp).getTime()
              : Number(trade.timestamp),
        }))
      )
    )

    const filteredTrades = allTrades

    // Client-side Limit Logic: Filter for Top N KOLs Global by Volume
    const limitCount = parseInt(filters.whales, 10) || 100

    // 1. Group trades by Whale(KOL) Address to calculate total volume
    const whaleVolumes: Record<string, number> = {}
    allTrades.forEach((trade) => {
      const vol =
        typeof trade.amount === "string"
          ? parseFloat(trade.amount)
          : trade.amount
      whaleVolumes[trade.whaleAddress] =
        (whaleVolumes[trade.whaleAddress] || 0) + vol
    })

    // 2. Sort KOLs by volume desc and take top N
    const topWhaleAddresses = new Set(
      Object.entries(whaleVolumes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limitCount)
        .map(([addr]) => addr)
    )

    // 3. Filter trades to only include these top KOLs
    const tradesByCoin = filteredTrades
      .filter((t) => topWhaleAddresses.has(t.whaleAddress))
      .reduce(
        (acc, trade) => {
          if (!acc[trade.coinId]) {
            acc[trade.coinId] = {
              coin: dataToProcess.find((d) => d.coin.id === trade.coinId)?.coin,
              trades: [],
            }
          }
          acc[trade.coinId].trades.push(trade)
          return acc
        },
        {} as Record<string, { coin: any; trades: any[] }>
      )

    // Global KOL lookup from API (any coin) for image/profile
    const apiWhaleByAddress = new Map<string, any>()
    dataToProcess.forEach((d: any) => {
      (d.whales ?? []).forEach((w: any) => {
        const addr = w.address ?? w.id
        if (addr && !apiWhaleByAddress.has(addr)) apiWhaleByAddress.set(addr, w)
      })
    })

    // Original: one coin node per token, one whale node per (token, whale) pair
    Object.values(tradesByCoin).forEach((coinData, coinIndex) => {
      const coinId = `coin_${coinData.coin.id}`
      const totalTrades = coinData.trades.length
      const totalBuyAmount = coinData.trades
        .filter((t: any) => (t.type as string)?.toLowerCase() === "buy")
        .reduce((sum: number, t: any) => sum + t.amount, 0)
      const totalSellAmount = coinData.trades
        .filter((t: any) => (t.type as string)?.toLowerCase() === "sell")
        .reduce((sum: number, t: any) => sum + t.amount, 0)

      flowNodes.push({
        id: coinId,
        type: "coin",
        position: { x: 100 + coinIndex * 200, y: 100 },
        data: {
          ...coinData.coin,
          imageUrl: coinData.coin.imageUrl,
          nodeType: "coin",
          totalTrades,
          totalBuyAmount,
          totalSellAmount,
        },
      })

      const tradesByWhale = coinData.trades.reduce(
        (
          acc: Record<
            string,
            {
              whaleAddress: string
              trades: any[]
              influencerName?: string
              influencerProfileImageUrl?: string
              whaleLabel?: string[]
            }
          >,
          trade: any
        ) => {
          if (!acc[trade.whaleId]) {
            acc[trade.whaleId] = {
              whaleAddress: trade.whaleAddress,
              trades: [],
              influencerName: trade.influencerName,
              influencerProfileImageUrl: trade.influencerProfileImageUrl,
              whaleLabel: trade.whaleLabel,
            }
          }
          acc[trade.whaleId].trades.push(trade)
          return acc
        },
        {}
      )

      Object.entries(tradesByWhale).forEach(([whaleId, whaleData], whaleIndex) => {
        const whaleNodeId = `whale_${coinData.coin.id}_${whaleId}`
        const allTradesForWhale = filteredTrades.filter(
          (t: any) => t.whaleAddress === whaleData.whaleAddress
        )
        const totalBuyAmount = allTradesForWhale
          .filter((t: any) => (t.type as string)?.toLowerCase() === "buy")
          .reduce((sum: number, t: any) => sum + t.amount, 0)
        const totalSellAmount = allTradesForWhale
          .filter((t: any) => (t.type as string)?.toLowerCase() === "sell")
          .reduce((sum: number, t: any) => sum + t.amount, 0)
        const firstTrade = allTradesForWhale[0]
        const apiWhale = apiWhaleByAddress.get(whaleData.whaleAddress)
        const whaleImageUrl =
          apiWhale?.imageUrl ??
          (firstTrade as any)?.influencerProfileImageUrl ??
          (apiWhale as any)?.influencerProfileImageUrl

        flowNodes.push({
          id: whaleNodeId,
          type: "whale",
          position: {
            x: 100 + coinIndex * 200 + (whaleIndex - 1) * 80,
            y: 250 + whaleIndex * 60,
          },
          data: {
            address: whaleData.whaleAddress,
            trades: allTradesForWhale,
            totalBuyAmount,
            totalSellAmount,
            nodeType: "whale",
            influencerName: firstTrade?.influencerName,
            influencerProfileImageUrl: (firstTrade as any)?.influencerProfileImageUrl ?? (apiWhale as any)?.influencerProfileImageUrl,
            imageUrl: whaleImageUrl,
            whaleLabel: firstTrade?.whaleLabel ?? whaleData.whaleLabel ?? (apiWhale as any)?.whaleLabel,
          },
        })

        const step = 1.5
        const buyTrades = whaleData.trades.filter((t: any) => (t.type as string)?.toLowerCase() === "buy")
        const sellTrades = whaleData.trades.filter((t: any) => (t.type as string)?.toLowerCase() === "sell")
        const orderedTrades = [...buyTrades, ...sellTrades]

        orderedTrades.forEach((trade: any, tradeIndex: number) => {
          const edgeId = makeEdgeId(
            coinId,
            whaleNodeId,
            trade.type,
            trade.timestamp,
            trade.amount
          )
          const edgeOffset =
            tradeIndex * step - ((orderedTrades.length - 1) * step) / 2
          flowEdges.push({
            id: edgeId,
            source: coinId,
            target: whaleNodeId,
            type: "custom",
            data: {
              type: trade.type,
              amount: trade.amount,
              timestamp: trade.timestamp,
              tradeIndex: tradeIndex,
              edgeOffset: edgeOffset,
            },
            animated: false,
          })
        })
      })
    })

    if (!layoutAppliedRef.current) {
      flowNodes = applyForceLayout(flowNodes, flowEdges, 1200, 800)
      layoutAppliedRef.current = true
    } else {
      flowNodes = flowNodes.map((n) => ({
        ...n,
        position: positionsRef.current[n.id] ?? n.position,
      }))
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [mergedData, apiData, filters, customVolume])

  const [nodesState, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edgesState, setEdges, onEdgesChange] = useEdgesState([] as Edge[])

  const prevOpenRef = React.useRef(false)
  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current
    prevOpenRef.current = isOpen
    if (rfInstance && nodesState.length > 0 && isOpen) {
      const delay = justOpened ? 900 : 500
      const timer = setTimeout(() => {
        rfInstance.fitView({ padding: 0.25, duration: 600 })
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [rfInstance, nodesState.length, isOpen])

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds) as any),
    [setEdges]
  )

  useEffect(() => {
    setNodes((prev: Node[]) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]))
      return (nodes as Node[]).map((n) => {
        const old = prevMap.get(n.id)
        if (old) {
          positionsRef.current[old.id] = old.position
        }
        return old ? { ...old, data: n.data, style: n.style, type: n.type } : n
      })
    })
    setEdges((prev: Edge[]) => {
      const prevMap = new Map(prev.map((e) => [e.id, e]))
      return (edges as Edge[]).map((e) => {
        const old = prevMap.get(e.id)
        return old
          ? { ...old, data: e.data, animated: e.animated, type: e.type }
          : e
      })
    })
  }, [nodes, edges, setNodes, setEdges])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent<Element, MouseEvent>, node: Node) => {
      if (node.type === "coin") {
        const tokenAddress = (node.data?.id || node.id) as string
        if (tokenAddress && typeof tokenAddress === "string") {
          navigator.clipboard
            .writeText(tokenAddress)
            .then(() => showToast("Address copied!", "success"))
            .catch(() => showToast("Failed to copy", "error"))
        }
      }
    },
    [showToast]
  )

  const onPaneClick = useCallback(() => {
    //
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true)
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  const timeframeOptions = ["1m", "3m", "5m", "7m", "10m", "15m"]
  const whaleOptions = ["1", "2", "3", "4", "5", "7", "10"]
  const volumeOptions = ["0", "1K", "3K", "5K", "10K", "15K", "25K"]

  const formatMarketCap = (value: number): string => {
    if (value >= 50000000) return "50M+"
    if (value >= 1000000) {
      const millions = value / 1000000
      return millions >= 10 ? `${millions.toFixed(0)}M` : `${millions.toFixed(1)}M`
    }
    if (value >= 1000) {
      const thousands = value / 1000
      return thousands >= 100 ? `${thousands.toFixed(0)}K` : `${thousands.toFixed(1)}K`
    }
    return `${value}`
  }
  const sliderToMarketCap = (sliderValue: number): number => {
    if (sliderValue === 100) return 50000000
    if (sliderValue === 0) return 1000
    const minLog = Math.log10(1000)
    const maxLog = Math.log10(50000000)
    const logValue = minLog + (sliderValue / 100) * (maxLog - minLog)
    return Math.pow(10, logValue)
  }
  const marketCapToSlider = (mcap: number): number => {
    if (mcap >= 50000000) return 100
    if (mcap <= 1000) return 0
    const minLog = Math.log10(1000)
    const maxLog = Math.log10(50000000)
    const logValue = Math.log10(mcap)
    return ((logValue - minLog) / (maxLog - minLog)) * 100
  }

  const formatTimeSinceUpdate = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const closeAll = () => {
    setDropdown(null)
  }

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdown && !(event.target as Element).closest(".relative")) {
        setDropdown(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [dropdown])

  if (!isOpen) return null

  return createPortal(
    <motion.div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[999999] px-3 nw-visual-modal isolate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-7xl mx-auto bg-[#000000] shadow-xl rounded-none h-[50vh] min-h-[400px] md:h-[700px] overflow-hidden"
        initial={{ opacity: 0, scale: 0.9, y: 100 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 100 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Graph Container (Background Layer) */}
        <div className="absolute inset-0 z-0 w-full h-full bg-black">
          {isRefreshing && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] z-[20] flex items-center justify-center">
              <div className="flex items-center space-x-2 text-sm text-white/80">
                <div className="animate-spin rounded-none h-5 w-5 border-2 border-white/40 border-t-transparent"></div>
                <span>Updating...</span>
              </div>
            </div>
          )}

          {/* Vignette Overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                "radial-gradient(circle at center, transparent 30%, black 100%)",
              opacity: 0.8,
            }}
          />

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-none h-12 w-12 border-2 border-[#000000] border-t-transparent" />
            </div>
          ) : nodesState.length === 0 ? (
            <div
              className="flex items-center justify-center h-full text-white text-xl antialiased"
              style={{ fontFamily: "Inter, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif" }}
            >
              Not enough KOL transactions for the selected filters.
            </div>
          ) : (
            <ReactFlow
              nodes={nodesState}
              edges={edgesState}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              onInit={setRfInstance}
              className="bg-black"
              style={{ width: "100%", height: "100%" }}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              onConnect={onConnect}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#333" gap={10} size={1.5} variant={BackgroundVariant.Dots} />
              <MiniMap
                pannable
                zoomable
                style={{
                  background: "#111",
                  border: "1px solid #333",
                  width: window.innerWidth < 768 ? 100 : 200,
                  height: window.innerWidth < 768 ? 75 : 150,
                  bottom: window.innerWidth < 768 ? 35 : 15,
                }}
                nodeColor={() => "#333"}
                maskColor="rgba(0,0,0,0.5)"
                className="!overflow-hidden"
              />
              <DownloadButton
                onDownloadReady={(trigger) => setTriggerDownload(() => trigger)}
                onScreenshotError={() => showToast("Screenshot failed. Try again or refresh.", "error")}
                filename="kol-network-graph"
              />
            </ReactFlow>
          )}
        </div>

        {/* 2. UI Controls Overlay (Foreground Layer) */}
        <div className="relative z-10 pointer-events-none w-full h-full flex flex-col justify-start p-3 md:p-6 lg:p-8 gap-4">

          {/* Header - Row 1: Controls (Save, Last Refreshed, Refresh, Close) */}
          <div className="w-full flex justify-end items-center gap-2 md:gap-4 pointer-events-auto">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={async () => {
                  if (!triggerDownload) {
                    showToast("Please wait for the graph to load.", "error")
                    return
                  }
                  try {
                    await triggerDownload()
                    showToast("Visualize network image saved", "success")
                  } catch (_) { /* toast shows on error */ }
                }}
                className={CONTROL_BTN}
                title="Save graph as JPG"
              >
                <Save className="w-3 h-3 shrink-0" />
                <span>Save</span>
              </button>

              {lastUpdatedTime && (
                <div className="flex items-center space-x-2 text-[10px] text-[#8f8f8f] uppercase tracking-wider font-bold whitespace-nowrap">
                  <span>Last updated:</span>
                  <LastUpdatedTicker
                    lastUpdated={lastUpdatedTime}
                    format={formatTimeSinceUpdate}
                  />
                </div>
              )}
              <button
                onClick={() => fetchData(true)}
                disabled={isRefreshing}
                className={CONTROL_BTN}
                title="Refresh data"
              >
                <RefreshCw
                  className={`w-3 h-3 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => rfInstance?.fitView({ padding: 0.25, duration: 400 })}
                className={CONTROL_BTN}
                title="Center / fit graph in view"
              >
                <Maximize2 className="w-3 h-3 shrink-0" />
                <span>Center</span>
              </button>
            </div>

            <button
              className={`${CONTROL_BTN} !p-1.5`}
              onClick={onClose}
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Header - Row 2: Filters */}
          <div className="w-full pointer-events-auto">
            <ul className="plan-btn-list w-full flex flex-wrap justify-end gap-2">
              {/* 1. Subscribe */}
            <li
              className="relative w-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href="javascript:void(0)"
                className={`plan-btn inline-flex items-center gap-2 !p-[6px_8px] !text-[12px] !text-[#8f8f8f] !bg-[#0a0a0a] !border-[#3d3d3d] !rounded-none ${dropdown === "telegram" ? "active" : ""}`}
                onClick={() =>
                  setDropdown(dropdown === "telegram" ? null : "telegram")
                }
              >
                <span className="flex items-center gap-1">
                  <SiTelegram className="me-1" />
                  Subscribe
                </span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${dropdown === "telegram" ? "rotate-180" : ""}`}
                />
              </a>
              {dropdown === "telegram" && (
                <div
                  className="filter-dropdown-menu w-sm filter-mobile-subscription"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: 320 }}
                >
                  {!isSaved && (
                    <div className="parent-dropdown-content">
                      <div className="sub-drop-header">
                        <div className="sub-drop-content">
                          <h6>System Config</h6>
                          <h4>KOL Cluster Alert</h4>
                        </div>
                        <button
                          className="popup-close-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDropdown(null)
                          }}
                        >
                          <FontAwesomeIcon icon={faClose} />
                        </button>
                        <div>
                          <button
                            className="paper-plan-connect-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!user?.telegramChatId) {
                                validateAccess(() => navigate("/telegram-subscription"))
                                setDropdown(null)
                              } else {
                                handleActivateKolClusterAlert()
                              }
                            }}
                            disabled={isActivatingAlert}
                          >
                            <FontAwesomeIcon icon={faPaperPlane} />{" "}
                            {user?.telegramChatId ? "Connected" : "Connect"}
                          </button>
                        </div>
                      </div>

                      <div className="custom-frm-bx position-relative">
                        <label className="nw-label">Timeframe</label>
                        <div
                          className="form-select cursor-pointer text-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!triggerOpen) {
                              setWhalesOpen(false)
                              setVolumeOpen(false)
                              setMcapOpen(false)
                            }
                            setTriggerOpen(!triggerOpen)
                          }}
                        >
                          {filters.timeframe}
                        </div>
                        {triggerOpen && (
                          <div
                            className="subscription-dropdown-menu show w-100"
                            onClick={(e) => e.stopPropagation()}
                            style={{ padding: "8px 12px" }}
                          >
                            {timeframeOptions.map((opt) => (
                              <div
                                key={opt}
                                className={`subs-items ${filters.timeframe === opt ? "active" : ""}`}
                                onClick={() => {
                                  setFilters((prev) => ({ ...prev, timeframe: opt }))
                                  setTriggerOpen(false)
                                }}
                              >
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="custom-frm-bx position-relative">
                        <label className="nw-label">Min KOL wallets</label>
                        <div
                          className="form-select cursor-pointer text-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!whalesOpen) {
                              setTriggerOpen(false)
                              setVolumeOpen(false)
                              setMcapOpen(false)
                            }
                            setWhalesOpen(!whalesOpen)
                          }}
                        >
                          {filters.whales}
                        </div>
                        {whalesOpen && (
                          <div
                            className="subscription-dropdown-menu show w-100 p-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {whaleOptions.map((opt) => (
                              <div
                                key={opt}
                                className={`subs-items ${filters.whales === opt ? "active" : ""}`}
                                onClick={() => {
                                  setFilters((prev) => ({ ...prev, whales: opt }))
                                  setCustomWhales("")
                                  setWhalesOpen(false)
                                }}
                              >
                                {opt}
                              </div>
                            ))}
                            <div className="position-relative mt-2">
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Custom"
                                value={customWhales}
                                onChange={(e) => {
                                  setCustomWhales(e.target.value)
                                  const v = e.target.value
                                  if (v) setFilters((prev) => ({ ...prev, whales: v }))
                                }}
                                style={{ paddingRight: "30px" }}
                              />
                              {customWhales && (
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="position-absolute"
                                  style={{
                                    right: "10px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "#28a745",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="custom-frm-bx position-relative">
                        <label className="nw-label">Min total buying volume</label>
                        <div
                          className="form-select cursor-pointer text-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!volumeOpen) {
                              setTriggerOpen(false)
                              setWhalesOpen(false)
                              setMcapOpen(false)
                            }
                            setVolumeOpen(!volumeOpen)
                          }}
                        >
                          {filters.volume === "0" ? "Any" : filters.volume}
                        </div>
                        {volumeOpen && (
                          <div
                            className="subscription-dropdown-menu show w-100 p-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {volumeOptions.map((opt) => (
                              <div
                                key={opt}
                                className={`subs-items ${filters.volume === opt ? "active" : ""}`}
                                onClick={() => {
                                  setFilters((prev) => ({ ...prev, volume: opt }))
                                  setCustomVolume("")
                                  setCustomVolumeInput("")
                                  setVolumeOpen(false)
                                }}
                              >
                                {opt === "0" ? "Any" : opt}
                              </div>
                            ))}
                            <div className="position-relative mt-2">
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Custom (e.g. 20K)"
                                value={customVolumeInput}
                                onChange={(e) => {
                                  setCustomVolumeInput(e.target.value)
                                  setCustomVolume(e.target.value)
                                  if (e.target.value) {
                                    setFilters((prev) => ({
                                      ...prev,
                                      volume: e.target.value.includes("K") ? e.target.value : `${e.target.value}K`,
                                    }))
                                  }
                                }}
                                style={{ paddingRight: "30px" }}
                              />
                              {customVolumeInput && (
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="position-absolute"
                                  style={{
                                    right: "10px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "#28a745",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="custom-frm-bx position-relative">
                        <label className="nw-label">Market Cap</label>
                        <div
                          className="form-select cursor-pointer text-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!mcapOpen) {
                              setTriggerOpen(false)
                              setWhalesOpen(false)
                              setVolumeOpen(false)
                            }
                            setMcapOpen(!mcapOpen)
                          }}
                        >
                          {formatMarketCap(minMarketCap)} - {formatMarketCap(maxMarketCap)}
                        </div>
                        {mcapOpen && (
                          <div
                            className="subscription-dropdown-menu show w-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MarketCapRangeSlider
                              minValue={minMarketCap}
                              maxValue={maxMarketCap}
                              onChange={(min, max) => {
                                setMinMarketCap(min)
                                setMaxMarketCap(max)
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <button
                        className="connect-wallet-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!user?.telegramChatId) {
                            validateAccess(() => navigate("/telegram-subscription"))
                            setDropdown(null)
                          } else {
                            handleActivateKolClusterAlert()
                          }
                        }}
                        disabled={isActivatingAlert}
                        style={{ marginTop: "12px", backgroundColor: "#162ECD", padding: "8px 12px", fontSize: "12px" }}
                      >
                        {user?.telegramChatId ? (
                          <>
                            <FontAwesomeIcon icon={faPaperPlane} /> {isActivatingAlert ? "Activating…" : "Activate"}
                          </>
                        ) : (
                          "Connect"
                        )}
                        <span className="corner top-right"></span>
                        <span className="corner bottom-left"></span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isSaved && (
                <div className="config-overlay">
                  <div className="config-modal">
                    <h3 className="config-title">CONFIGURATION SAVED</h3>
                    <div className="config-box">
                      <div className="config-row">
                        <span>Feed Type</span>
                        <span>KOL Feed</span>
                      </div>
                      <div className="config-row">
                        <span>Timeframe</span>
                        <span className="green">{filters.timeframe}</span>
                      </div>
                      <div className="config-row">
                        <span>Min Wallets</span>
                        <span>{filters.whales}</span>
                      </div>
                      <div className="config-row">
                        <span>Min Volume</span>
                        <span>{filters.volume === "0" ? "Any" : filters.volume}</span>
                      </div>
                      <div className="config-row">
                        <span>Market Cap</span>
                        <span>{formatMarketCap(minMarketCap)} - {formatMarketCap(maxMarketCap)}</span>
                      </div>
                      <div className="config-row">
                        <span>Status</span>
                        <span className="green-dot">
                          Active <i></i>
                        </span>
                      </div>
                    </div>
                    <button
                      className="close-btn"
                      onClick={() => {
                        setIsSaved(false)
                        setDropdown(null)
                      }}
                    >
                      CLOSE
                    </button>
                  </div>
                </div>
              )}
            </li>

            {/* 2. Timeframe */}
            <li
              className="relative w-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href="javascript:void(0)"
                className={`plan-btn inline-flex items-center gap-2 !p-[6px_8px] !text-[12px] !text-[#8f8f8f] !bg-[#0a0a0a] !border-[#3d3d3d] !rounded-none ${dropdown === "timeframe" ? "active" : ""}`}
                onClick={() =>
                  setDropdown(dropdown === "timeframe" ? null : "timeframe")
                }
              >
                <span>Time: {filters.timeframe}</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${dropdown === "timeframe" ? "rotate-180" : ""}`}
                />
              </a>
              {dropdown === "timeframe" && (
                <div className="filter-dropdown-menu w-full">
                  <div className="filter-dropdown-header">Timeframe</div>
                  {timeframeOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`filter-dropdown-item ${filters.timeframe === opt ? "active" : ""}`}
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, timeframe: opt }))
                        setDropdown(null)
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </li>

            {/* 3. KOLs */}
            <li
              className="relative w-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href="javascript:void(0)"
                className={`plan-btn inline-flex items-center gap-2 !p-[6px_8px] !text-[12px] !text-[#8f8f8f] !bg-[#0a0a0a] !border-[#3d3d3d] !rounded-none ${dropdown === "whales" ? "active" : ""}`}
                onClick={() =>
                  setDropdown(dropdown === "whales" ? null : "whales")
                }
              >
                <span>Kols: {filters.whales}</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${dropdown === "whales" ? "rotate-180" : ""}`}
                />
              </a>
              {dropdown === "whales" && (
                <div className="filter-dropdown-menu w-full">
                  <div className="filter-dropdown-header">Kols</div>
                  {whaleOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`filter-dropdown-item ${filters.whales === opt ? "active" : ""}`}
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, whales: opt }))
                        setCustomWhales("")
                        setDropdown(null)
                      }}
                    >
                      • {opt}
                    </button>
                  ))}
                  <div className="p-2">
                    <input
                      type="number"
                      placeholder="Custom"
                      value={customWhales}
                      onChange={(e) => setCustomWhales(e.target.value)}
                      className="custom-amount-frm"
                    />
                    <button
                      onClick={() => {
                        if (customWhales) {
                          setFilters((prev) => ({
                            ...prev,
                            whales: customWhales,
                          }))
                          setCustomWhales("")
                          setDropdown(null)
                        }
                      }}
                      className="plan-btn w-full justify-center mt-2 px-3 py-2 text-[13px]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </li>

            {/* 4. Volume */}
            <li
              className="relative w-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href="javascript:void(0)"
                className={`plan-btn inline-flex items-center gap-2 !p-[6px_8px] !text-[12px] !text-[#8f8f8f] !bg-[#0a0a0a] !border-[#3d3d3d] !rounded-none ${dropdown === "volume" ? "active" : ""}`}
                onClick={() =>
                  setDropdown(dropdown === "volume" ? null : "volume")
                }
              >
                <span>Vol: {filters.volume}</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${dropdown === "volume" ? "rotate-180" : ""}`}
                />
              </a>
              {dropdown === "volume" && (
                <div className="filter-dropdown-menu w-full">
                  <div className="filter-dropdown-header">Volume</div>
                  {volumeOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`filter-dropdown-item ${filters.volume === opt ? "active" : ""}`}
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, volume: opt }))
                        setCustomVolume("")
                        setDropdown(null)
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                  <div className="p-2">
                    <input
                      type="number"
                      placeholder="Custom"
                      value={customVolume}
                      onChange={(e) => setCustomVolume(e.target.value)}
                      className="custom-amount-frm"
                    />
                    <button
                      onClick={() => {
                        if (customVolume) {
                          setFilters((prev) => ({
                            ...prev,
                            volume: `${customVolume}K`,
                          }))
                          setCustomVolume("")
                          setDropdown(null)
                        }
                      }}
                      className="plan-btn w-full justify-center mt-2 px-3 py-2 text-[13px]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

export default KolNetworkGraph
