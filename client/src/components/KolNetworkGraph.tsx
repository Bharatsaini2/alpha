/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from "react"
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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { motion } from "framer-motion"
import { toPng, toSvg } from "html-to-image"
import { CheckIcon, ChevronDown, X, RefreshCw, Save } from "lucide-react"
import axios from "axios"
import CopyIcon from "../assets/Copy.svg"
import ExternalLinkIcon from "../assets/ExternalLink.svg"
import DefaultTokenImage from "../assets/default_token.svg"
import solanalogo from "../assets/solana.svg"
import whaleImage from "../assets/whale.png"
import { applyForceLayout } from "../utils/ForceLayout"
import ErrorPopup from "./ui/ErrorPopup"
import { useToast } from "../contexts/ToastContext"
import { LastUpdatedTicker } from "./TicketComponent"
import { useRandomBubbleAnimation } from "../hooks/useBubbleAnimation"
import { SiTelegram } from "react-icons/si";

interface Whale {
  id: string
  address: string
  buyVolume: number
  sellVolume: number
  lastAction: string
  trades: { type: string; amount: number; timestamp: string | number }[]
  // Optional influencer fields if API returns them, otherwise unused
  influencerName?: string
  influencerUsername?: string
  influencerProfileImageUrl?: string
  influencerFollowerCount?: number
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
// Custom Coin Node
// -----------------------------
const CoinNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const [isHovered, setIsHovered] = useState(false)
  const bubbleAnimation = useRandomBubbleAnimation()
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    // Throttle updates to avoid performance issues
    const timeoutId = setTimeout(() => {
      updateNodeInternals(id)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [
    Math.round(bubbleAnimation.x / 5) * 5,
    Math.round(bubbleAnimation.y / 5) * 5,
    Math.round(bubbleAnimation.scale * 20) / 20,
    updateNodeInternals,
    id,
  ])

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      className={`rf-circle-wrap relative ${selected ? "ring-2 ring-[#06DF73]" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ borderRadius: '0px !important' }} /* Force Override */
      animate={{
        scale: isHovered ? 1.05 : 1 + bubbleAnimation.scale - 1,
        opacity: 1,
        borderRadius: "0%",
        x: bubbleAnimation.x,
        y: bubbleAnimation.y,
        boxShadow: isHovered
          ? "0 10px 25px rgba(6, 223, 115, 0.3)"
          : "0 4px 12px rgba(0, 0, 0, 0.2)",
      }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      style={{ willChange: "transform" }}
    >
      <Handle
        type="source"
        position={Position.Left}
        style={{
          top: "50%",
          left: "50%",
          background: "transparent",
          border: "none",
          width: "0px",
          height: "0px",
          minWidth: "0px",
          minHeight: "0px",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative">
        <motion.div
          className="rf-circle-wrap w-16 h-16 rounded-none overflow-hidden border-2 border-white/20 bg-gradient-to-br from-[#1A1A1E] to-[#2A2A2D] flex items-center justify-center !rounded-none"
          style={{ borderRadius: '0px !important' }} /* Force Override */
          animate={{
            borderColor: isHovered
              ? "rgba(6, 223, 115, 0.6)"
              : "rgba(255, 255, 255, 0.2)",
          }}
          transition={{ duration: 0.2 }}
        >
          <img
            src={
              (data.symbol as string) === "SOL" ||
                (data.symbol as string) === "WSOL"
                ? solanalogo
                : (data.imageUrl as string) || DefaultTokenImage
            }
            alt={(data.symbol as string) || "Token"}
            className="w-12 h-12 rounded-none object-cover !rounded-none"
            style={{ borderRadius: '0px !important' }}
          />
        </motion.div>
        <motion.div
          className="absolute inset-0 rounded-none bg-gradient-to-r from-[#06DF73]/20 to-[#05C96A]/20 blur-md -z-10 !rounded-none"
          style={{ borderRadius: '0px !important' }}
          animate={{
            opacity: isHovered ? 1 : 0,
            scale: isHovered ? 1.2 : 1,
          }}
          transition={{ duration: 0.3 }}
        />
        <motion.div
          className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-[#1A1A1E] border border-[#2A2A2D] px-2 py-1 text-xs font-medium text-white whitespace-nowrap font-sans"
          animate={{
            opacity: isHovered ? 1 : 0,
            y: isHovered ? 0 : 10,
          }}
          transition={{ duration: 0.2 }}
        >
          {(data.symbol as string) || "Token"}
        </motion.div>
      </div>
    </motion.div>
  )
}

// -----------------------------
// Custom Whale Node (Adapted for KOLs)
// -----------------------------
const WhaleNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const [isHovered, setIsHovered] = useState(false)
  const bubbleAnimation = useRandomBubbleAnimation()
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateNodeInternals(id)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [
    Math.round(bubbleAnimation.x / 5) * 5,
    Math.round(bubbleAnimation.y / 5) * 5,
    Math.round(bubbleAnimation.scale * 20) / 20,
    updateNodeInternals,
    id,
  ])

  const getWhaleColor = () => {
    const totalBuyAmount = data.totalBuyAmount || 0
    const totalSellAmount = data.totalSellAmount || 0
    if (totalBuyAmount > totalSellAmount) return "#06DF73"
    if (totalSellAmount > totalBuyAmount) return "#FF6467"
    return "#999999"
  }

  // Use KOL image if available, else default whale image
  const displayImage = (data.influencerProfileImageUrl as string) || whaleImage

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      className={`rf-circle-wrap relative ${selected ? "ring-2 ring-[#06DF73]" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{
        scale: isHovered ? 1.1 : 1 + bubbleAnimation.scale - 1,
        opacity: 1,
        borderRadius: "50%",
        x: bubbleAnimation.x,
        y: bubbleAnimation.y,
        boxShadow: isHovered
          ? `0 10px 25px ${getWhaleColor()}40`
          : "0 4px 12px rgba(0, 0, 0, 0.2)",
      }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      style={{ willChange: "transform" }}
    >
      <Handle
        type="target"
        position={Position.Right}
        style={{
          top: "50%",
          left: "50%",
          background: "transparent",
          border: "none",
          width: "0px",
          height: "0px",
          minWidth: "0px",
          minHeight: "0px",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative">
        <motion.div
          className="rf-circle-wrap w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-xs border-2 border-white/20 overflow-hidden"
          style={{ backgroundColor: "#999999" }}
          animate={{
            borderColor: isHovered
              ? `${getWhaleColor()}80`
              : "rgba(255, 255, 255, 0.2)",
          }}
          transition={{ duration: 0.2 }}
        >
          <img
            src={displayImage}
            alt="KOL"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = whaleImage
            }}
          />
        </motion.div>
        <motion.div
          className="absolute inset-0 rounded-full blur-md -z-10"
          style={{ backgroundColor: getWhaleColor() }}
          animate={{
            opacity: isHovered ? 0.4 : 0,
            scale: isHovered ? 1.3 : 1,
          }}
          transition={{ duration: 0.3 }}
        />
        <motion.div
          className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-[#1A1A1E] border border-[#2A2A2D] px-2 py-1 text-xs font-medium text-white whitespace-nowrap font-sans"
          animate={{
            opacity: isHovered ? 1 : 0,
            y: isHovered ? 0 : 10,
          }}
          transition={{ duration: 0.2 }}
        >
          {data.influencerName ? (data.influencerName as string) : (
            <>
              {((data.address as string) || "0x0000").slice(0, 6)}...
              {((data.address as string) || "0000").slice(-4)}
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

// -----------------------------
// Custom Edge for Multiple Trades
// -----------------------------
const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}) => {
  const [isHovered, setIsHovered] = useState(false)

  // 1. Get the offset (e.g. -5, 0, 5) from the data
  const edgeOffset = (data?.edgeOffset as number) ?? 0

  // 2. Calculate Geometry
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.sqrt(dx * dx + dy * dy) || 1

  // 3. Normal Vector (Perpendicular direction)
  const nx = -dy / len
  const ny = dx / len

  // 4. Spread Multiplier
  // Reduced from 4 to 1 to create a much tighter, cable-like bundle
  const spread = edgeOffset * 1

  // 5. CRISS-CROSS LOGIC
  // Start Point: Shift Positive
  const startX = sourceX + nx * spread
  const startY = sourceY + ny * spread

  // End Point: Shift NEGATIVE (Inverted)
  // This causes the line to aim for the "opposite" side, forcing a cross in the center.
  const endX = targetX - nx * spread
  const endY = targetY - ny * spread

  // 6. Draw BEZIER CURVE (Q)
  // Instead of straight lines, we use a quadratic bezier or cubic bezier to "pinch" them.
  // We want them to start at source, curve towards the center pinch point, then curve to target.
  const centerX = (sourceX + targetX) / 2
  const centerY = (sourceY + targetY) / 2

  // Control Point 1: Near Source but shifted
  const cp1X = sourceX + (dx * 0.4) + (nx * spread * 0.5)
  const cp1Y = sourceY + (dy * 0.4) + (ny * spread * 0.5)

  // Control Point 2: Near Target but shifted (inverted)
  const cp2X = targetX - (dx * 0.4) - (nx * spread * 0.5)
  const cp2Y = targetY - (dy * 0.4) - (ny * spread * 0.5)

  // A smooth "S" shape or "Hourglass" with curves
  const edgePath = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`

  return (
    <motion.g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.path
        id={id}
        d={edgePath}
        stroke={data?.type === "buy" ? "#06DF73" : "#FF6467"}
        strokeWidth={isHovered ? 2 : 0.75} // Thinner, crisper lines
        strokeOpacity={1} // Keep fully visible as requested
        fill="none"
        style={{
          strokeDasharray: "none",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{
          pathLength: 1,
          opacity: 1, // Fully opaque
        }}
        transition={{ duration: 0.5 }}
      />
    </motion.g>
  )
}

// Tooltip Component
const Tooltip: React.FC<{
  tooltip: any
  showToast: (message: string, type: "success" | "error") => void
}> = ({ tooltip, showToast }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  if (!tooltip) return null
  const copyToClipboard = (text: string, field: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = text
        textArea.style.position = "fixed"
        textArea.style.left = "-999999px"
        textArea.style.top = "-999999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
      }

      setCopiedField(field)
      showToast("Address copied to clipboard!", "success")
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
      showToast("Failed to copy address", "error")
    }
  }

  return (
    <>
      {tooltip.nodeType === "whale" && (
        <div className="text-white">
          <div className="flex items-center flex-row space-x-3 ">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs">
                {tooltip.influencerName ? (
                  <span className="font-bold">{tooltip.influencerName}</span>
                ) : (
                  tooltip.address && tooltip.address.length > 8
                    ? `${tooltip.address.slice(0, 4)}...${tooltip.address.slice(-4)}`
                    : tooltip.address || "Unknown"
                )}
              </span>
              <div className="flex items-center space-x-1">
                {copiedField === "whaleAddress" ? (
                  <CheckIcon className="w-2 h-2 md:w-3 md:h-3 text-green-500" />
                ) : (
                  <button
                    onClick={() =>
                      copyToClipboard(tooltip.address || "", "whaleAddress")
                    }
                    className=" cursor-pointer transition-colors"
                  >
                    <img
                      src={CopyIcon}
                      alt="Copy"
                      className="w-2 h-2 md:w-3 md:h-3 "
                    />
                  </button>
                )}

                <a
                  href={`https://solscan.io/address/${tooltip.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className=" hover:bg-[#2A2A2D] transition-colors"
                >
                  <img
                    src={ExternalLinkIcon}
                    alt="External Link"
                    className="w-2 h-2 md:w-3 md:h-3 "
                  />
                </a>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] font-medium tracking-wide">
            <span className="text-green-500 uppercase">Buys:</span>
            <span className="text-white font-bold">
              {tooltip.trades?.filter((t: any) => t.type === "buy").length || 0}
              <span className="text-white ml-1 font-normal opacity-80">
                ($
                {Math.round(tooltip.totalBuyAmount || 0).toLocaleString()})
              </span>
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-medium tracking-wide">
            <span className="text-red-500 uppercase">Sell:</span>
            <span className="text-white font-bold">
              {tooltip.trades?.filter((t: any) => t.type === "sell").length || 0}
              <span className="text-white ml-1 font-normal opacity-80">
                ($
                {Math.round(tooltip.totalSellAmount || 0).toLocaleString()})
              </span>
            </span>
          </div>
        </div>
      )}
    </>
  )
}

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

const DownloadButton: React.FC = () => {
  const { getNodes } = useReactFlow()
  const [showErrorPopup, setShowErrorPopup] = useState(false)

  const downloadImage = (dataUrl: string) => {
    const a = document.createElement("a")
    a.setAttribute("download", "kol-network-graph.png")
    a.setAttribute("href", dataUrl)
    a.click()
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

  const handleRetry = () => {
    onClick()
  }

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

      downloadImage(dataUrl)
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
        downloadImage(dataUrl)
      } catch (fallbackError) {
        console.error("Fallback download also failed:", fallbackError)
        setShowErrorPopup(true)
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

  return (
    <>
      <Panel position="bottom-left" className="m-2 pointer-events-none select-none">
        <div className="flex items-center gap-2 opacity-60">
          <img src="/logo.png" alt="AlphaBlock" className="w-3 h-3 md:w-4 md:h-4 opacity-80" onError={(e) => e.currentTarget.style.display = 'none'} />
          <span className="text-[10px] md:text-[11px] text-white font-medium tracking-widest uppercase font-mono">POWERED BY ALPHABLOCK AI</span>
        </div>
      </Panel>
      <ErrorPopup
        isOpen={showErrorPopup}
        onClose={() => setShowErrorPopup(false)}
        title="Screenshot Download Failed"
        message="We encountered an issue while generating your screenshot. This might be due to network issues. Please try again or refresh the page."
        onRetry={handleRetry}
      />
    </>
  )
}

type TooltipAnchor = { type: "whale"; nodeId: string }

const KolNetworkGraph: React.FC<{
  isOpen: boolean
  onClose: () => void
}> = ({ isOpen, onClose }) => {
  const [apiData, setApiData] = useState<CoinWithWhales[]>([])
  const [loading, setLoading] = useState(false)
  const [tooltipAnchor, setTooltipAnchor] = useState<TooltipAnchor | null>(null)
  const [toolbarSide, setToolbarSide] = useState<Position>(Position.Right)
  const { showToast } = useToast()
  // NOTE: useViewport might throw if not wrapped in ReactFlowProvider, but keeping existing code safe
  // const { x: vpX, y: vpY, zoom } = useViewport()

  const [rfInstance, setRfInstance] = useState<any>(null);



  const [filters, setFilters] = useState({
    timeframe: "15m",
    whales: "1", // Used as KOL count limit
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
          influencerProfileImageUrl: whale.influencerProfileImageUrl, // Preserve profile image
          amount: typeof trade.amount === "string" ? parseFloat(trade.amount) : trade.amount,
          timestamp: typeof trade.timestamp === "string" ? new Date(trade.timestamp).getTime() : Number(trade.timestamp),
        }))
      )
    )

    const filteredTrades = allTrades

    // Client-side Limit Logic: Filter for Top N KOLs Global by Volume
    const limitCount = parseInt(filters.whales, 10) || 100

    // 1. Group trades by Whale(KOL) Address to calculate total volume
    const whaleVolumes: Record<string, number> = {}
    allTrades.forEach(trade => {
      const vol = typeof trade.amount === "string" ? parseFloat(trade.amount) : trade.amount
      whaleVolumes[trade.whaleAddress] = (whaleVolumes[trade.whaleAddress] || 0) + vol
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
      .filter(t => topWhaleAddresses.has(t.whaleAddress))
      .reduce(
        (acc, trade) => {
          if (!acc[trade.coinId]) {
            acc[trade.coinId] = {
              coin: dataToProcess.find((d) => d.coin.id === trade.coinId)?.coin,
              trades: []
            }
          }
          acc[trade.coinId].trades.push(trade)
          return acc
        },
        {} as Record<string, { coin: any; trades: any[] }>
      )

    Object.values(tradesByCoin).forEach((coinData, coinIndex) => {
      const coinId = `coin_${coinData.coin.id}`
      const totalTrades = coinData.trades.length

      flowNodes.push({
        id: coinId,
        type: "coin",
        position: { x: 100 + coinIndex * 200, y: 100 },
        data: {
          ...coinData.coin,
          imageUrl: coinData.coin.imageUrl,
          nodeType: "coin",
          totalTrades: totalTrades
        }
      })

      const tradesByWhale = coinData.trades.reduce(
        (acc: Record<string, { whaleAddress: string; trades: any[]; influencerName?: string; influencerProfileImageUrl?: string }>, trade: any) => {
          if (!acc[trade.whaleId]) {
            acc[trade.whaleId] = {
              whaleAddress: trade.whaleAddress,
              trades: [],
              influencerName: trade.influencerName,
              influencerProfileImageUrl: trade.influencerProfileImageUrl
            }
          }
          acc[trade.whaleId].trades.push(trade)
          return acc
        },
        {}
      )

      Object.entries(tradesByWhale).forEach(([whaleId, whaleData], whaleIndex) => {
        const whaleNodeId = `whale_${coinData.coin.id}_${whaleId}`
        const totalBuyAmount = whaleData.trades.filter((t: any) => t.type === 'buy').reduce((sum: number, t: any) => sum + t.amount, 0)
        const totalSellAmount = whaleData.trades.filter((t: any) => t.type === 'sell').reduce((sum: number, t: any) => sum + t.amount, 0)

        flowNodes.push({
          id: whaleNodeId,
          type: "whale",
          position: { x: 100 + coinIndex * 200 + (whaleIndex - 1) * 80, y: 250 + whaleIndex * 60 },
          data: {
            address: whaleData.whaleAddress,
            trades: whaleData.trades,
            totalBuyAmount,
            totalSellAmount,
            nodeType: "whale",
            influencerName: whaleData.influencerName,
            influencerProfileImageUrl: whaleData.influencerProfileImageUrl
          }
        })

        const maxBundleWidth = 15; // increased max width for better visibility
        const step = Math.min(2, maxBundleWidth / Math.max(1, whaleData.trades.length));

        whaleData.trades.forEach((trade: any, tradeIndex: number) => {
          const edgeId = makeEdgeId(coinId, whaleNodeId, trade.type, trade.timestamp, trade.amount)
          const edgeOffset = tradeIndex * step - ((whaleData.trades.length - 1) * step) / 2
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
              edgeOffset: edgeOffset
            },
            animated: trade.type === 'sell'
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
        position: positionsRef.current[n.id] ?? n.position
      }))
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [mergedData, apiData, filters, customVolume])

  const [nodesState, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edgesState, setEdges, onEdgesChange] = useEdgesState([] as Edge[])

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
        return old
          ? { ...old, data: n.data, style: n.style, type: n.type }
          : n
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
      if (node.type === "whale") {
        setTooltipAnchor({ type: "whale", nodeId: node.id })
      } else if (node.type === "coin") {
        const tokenAddress = (node.data?.id || node.id) as string
        if (tokenAddress && typeof tokenAddress === "string") {
          navigator.clipboard.writeText(tokenAddress).then(() => showToast("Address copied!", "success")).catch(() => showToast("Failed to copy", "error"))
        }
      }
    },
    [showToast]
  )

  const onPaneClick = useCallback(() => {
    setTooltipAnchor(null)
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

  const formatTimeSinceUpdate = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  // Tooltip positioning logic
  useEffect(() => {
    if (!tooltipAnchor) return
    const pane = document.querySelector(".react-flow") as HTMLElement | null
    if (!pane) return
    const rect = pane.getBoundingClientRect()
    const node = nodesState.find((n) => n.id === tooltipAnchor.nodeId)
    if (!node) return

    const width = node.width ?? 48
    const height = node.height ?? 48
    const nodeCenterX = 0 + node.position.x * 1 + (width * 1) / 2
    const nodeCenterY = 0 + node.position.y * 1 + (height * 1) / 2
    const estTooltipWidth = 260
    const estTooltipHeight = 140
    const gap = 12

    const availableRight = rect.width - (nodeCenterX + (width * 1) / 2) - gap
    const availableLeft = nodeCenterX - (width * 1) / 2 - gap
    const availableBottom = rect.height - (nodeCenterY + (height * 1) / 2) - gap
    const availableTop = nodeCenterY - (height * 1) / 2 - gap

    const scores = [
      { side: Position.Right, score: availableRight - estTooltipWidth, fits: availableRight >= estTooltipWidth },
      { side: Position.Left, score: availableLeft - estTooltipWidth, fits: availableLeft >= estTooltipWidth },
      { side: Position.Bottom, score: availableBottom - estTooltipHeight, fits: availableBottom >= estTooltipHeight },
      { side: Position.Top, score: availableTop - estTooltipHeight, fits: availableTop >= estTooltipHeight }
    ]

    const fitting = scores.filter((s) => s.fits)
    const chosen = (fitting.length > 0 ? fitting : scores).reduce((best, cur) => (cur.score > best.score ? cur : best))
    setToolbarSide(chosen.side)
  }, [tooltipAnchor, nodesState])




  const closeAll = () => {
    setDropdown(null)
  }

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdown && !(event.target as Element).closest('.relative')) {
        setDropdown(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [dropdown])



  if (!isOpen) return null

  return (
    <motion.div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-3 nw-visual-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-7xl mx-auto bg-[#000000] shadow-xl p-3 md:p-6 lg:p-8 border border-[#333] rounded-none max-h-[90vh] md:max-h-[95vh] overflow-y-auto md:overflow-visible"
        initial={{ opacity: 0, scale: 0.9, y: 100 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 100 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        style={{ border: '1px solid #333' }}
      >

        {/* Header - Row 1: Controls (Save, Last Updated, Refresh, Close) */}
        <div className="w-full flex flex-row items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <button className="flex items-center space-x-1 text-[10px] text-gray-500 hover:text-white transition-colors uppercase tracking-wider font-bold whitespace-nowrap">
              <Save className="w-3 h-3 text-gray-500" />
              <span>SAVE</span>
            </button>

            {lastUpdatedTime && (
              <div className="flex items-center space-x-2 text-[10px] text-gray-500 uppercase tracking-wider font-bold whitespace-nowrap">
                <span>LAST REFRESHED:</span>
                <LastUpdatedTicker lastUpdated={lastUpdatedTime} format={formatTimeSinceUpdate} />
              </div>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="flex items-center space-x-2 text-[10px] text-gray-500 hover:text-white transition-colors disabled:opacity-50 cursor-pointer uppercase tracking-wider font-bold whitespace-nowrap"
            >
              <RefreshCw className={`w-3 h-3 text-gray-500 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>REFRESH</span>
            </button>
          </div>

          <button
            className="text-white p-1.5 cursor-pointer hover:bg-white/10 transition-colors bg-[#1A1A1E] rounded-none"
            style={{ border: '1px solid #333' }}
            onClick={onClose}
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>

        {/* Header - Row 2: Filters (2x2 Grid) */}
        <div className="w-full grid grid-cols-2 gap-2 mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>

          {/* 1. Subscribe */}
          <div className="relative w-full">
            <button
              className="w-full h-10 flex items-center justify-center bg-black text-white text-[12px] uppercase font-bold tracking-wider hover:bg-[#111] transition-colors rounded-none"
              style={{ border: '1px solid #333' }}
              onClick={() => setDropdown(dropdown === "telegram" ? null : "telegram")}
            >
              <SiTelegram className="mr-2 w-3 h-3" /> SUBSCRIBE
            </button>
            {/* Dropdown Content */}
            {dropdown === "telegram" && (
              <div className="absolute top-full left-0 mt-2 z-50 w-full min-w-[200px] bg-black border border-[#2A2A2A] shadow-xl p-4" onClick={closeAll}>
                {!isSaved ? (
                  <div className="flex flex-col gap-3">
                    <div className="text-left">
                      <h6 className="text-[10px] text-gray-500 uppercase">System Config</h6>
                      <h4 className="text-sm font-bold text-white">KOL Feed Alerts</h4>
                    </div>
                    <button
                      className="w-full py-2 bg-white text-black text-xs font-bold uppercase hover:bg-gray-200 transaction-colors"
                      onClick={(e) => { e.stopPropagation(); setIsSaved(true); }}
                    >
                      ACTIVATE ALERT
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-green-500 text-xs font-bold">ALERTS ACTIVE</div>
                )}
              </div>
            )}
            {isSaved && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
                <div className="bg-black border border-[#2A2A2A] p-6 text-center max-w-sm mx-4">
                  <h3 className="text-white font-bold mb-4">CONFIGURATION SAVED</h3>
                  <button className="px-4 py-2 bg-white text-black text-xs font-bold uppercase" onClick={() => setIsSaved(false)}>CLOSE</button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Timeframe */}
          <div className="relative w-full">
            <button
              className="w-full h-10 flex items-center justify-between px-3 bg-black text-white text-[12px] uppercase font-bold tracking-wider hover:bg-[#111] transition-colors rounded-none"
              style={{ border: '1px solid #333' }}
              onClick={() => setDropdown(dropdown === "timeframe" ? null : "timeframe")}
            >
              <span>TIME: {filters.timeframe}</span>
              <ChevronDown className={`w-3 h-3 transition-transform text-white ${dropdown === "timeframe" ? "rotate-180" : ""}`} />
            </button>
            {dropdown === "timeframe" && (
              <div className="absolute top-full right-0 mt-2 w-full min-w-[120px] bg-black border border-[#2A2A2A] shadow-xl z-50 max-h-60 overflow-y-auto">
                {timeframeOptions.map(opt => (
                  <button key={opt} className="w-full px-4 py-2 text-left text-white text-xs hover:bg-[#111] uppercase" onClick={() => {
                    setFilters(prev => ({ ...prev, timeframe: opt })); setDropdown(null);
                  }}>{opt}</button>
                ))}
              </div>
            )}
          </div>

          {/* 3. KOLs */}
          <div className="relative w-full">
            <button
              className="w-full h-10 flex items-center justify-between px-3 bg-black text-white text-[12px] uppercase font-bold tracking-wider hover:bg-[#111] transition-colors rounded-none"
              style={{ border: '1px solid #333' }}
              onClick={() => setDropdown(dropdown === "whales" ? null : "whales")}
            >
              <span>KOLS: {filters.whales}</span>
              <ChevronDown className={`w-3 h-3 transition-transform text-white ${dropdown === "whales" ? "rotate-180" : ""}`} />
            </button>
            {dropdown === "whales" && (
              <div className="absolute top-full left-0 mt-2 w-full min-w-[120px] bg-black border border-[#2A2A2A] shadow-xl z-50 max-h-60 overflow-y-auto">
                {whaleOptions.map(opt => (
                  <button key={opt} className="w-full px-4 py-2 text-left text-white text-xs hover:bg-[#111]" onClick={() => {
                    setFilters(prev => ({ ...prev, whales: opt })); setCustomWhales(""); setDropdown(null);
                  }}>• {opt}</button>
                ))}
                <div className="p-2 bg-black border-t border-[#2A2A2A]">
                  <input type="number" placeholder="Custom" value={customWhales} onChange={e => setCustomWhales(e.target.value)} className="w-full p-2 bg-[#111] border border-[#2A2A2A] text-white text-xs mb-2 focus:outline-none" />
                  <button onClick={() => {
                    if (customWhales) {
                      setFilters(prev => ({ ...prev, whales: customWhales })); setCustomWhales(""); setDropdown(null);
                    }
                  }} className="w-full py-1 bg-white text-black text-xs font-bold uppercase hover:bg-gray-200">Apply</button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Volume */}
          <div className="relative w-full">
            <button
              className="w-full h-10 flex items-center justify-between px-3 bg-black text-white text-[12px] uppercase font-bold tracking-wider hover:bg-[#111] transition-colors rounded-none"
              style={{ border: '1px solid #333' }}
              onClick={() => setDropdown(dropdown === "volume" ? null : "volume")}
            >
              <span>VOL: {filters.volume}</span>
              <ChevronDown className={`w-3 h-3 transition-transform text-white ${dropdown === "volume" ? "rotate-180" : ""}`} />
            </button>
            {dropdown === "volume" && (
              <div className="absolute top-full right-0 mt-2 w-full min-w-[120px] bg-black border border-[#2A2A2A] shadow-xl z-50 max-h-60 overflow-y-auto">
                {volumeOptions.map(opt => (
                  <button key={opt} className="w-full px-4 py-2 text-left text-white text-xs hover:bg-[#111]" onClick={() => {
                    setFilters(prev => ({ ...prev, volume: opt })); setCustomVolume(""); setDropdown(null);
                  }}>{opt}</button>
                ))}
                <div className="p-2 bg-black border-t border-[#2A2A2A]">
                  <input type="number" placeholder="Custom" value={customVolume} onChange={e => setCustomVolume(e.target.value)} className="w-full p-2 bg-[#111] border border-[#2b2a2a] text-white text-xs mb-2 focus:outline-none" />
                  <button onClick={() => {
                    if (customVolume) {
                      setFilters(prev => ({ ...prev, volume: customVolume + "K" })); setCustomVolume(""); setDropdown(null);
                    }
                  }} className="w-full py-1 bg-white text-black text-xs font-bold uppercase hover:bg-gray-200">Apply</button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Graph Container */}
        <div className="w-full h-[50vh] min-h-[400px] md:h-[700px] overflow-hidden bg-black relative rounded-none" style={{ border: '1px solid #333' }}>
          {isRefreshing && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] z-10 flex items-center justify-center">
              <div className="flex items-center space-x-2 text-sm text-white/80">
                <div className="animate-spin rounded-none h-5 w-5 border-2 border-white/40 border-t-transparent"></div>
                <span>Updating...</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-full max-w-4xl space-y-8 px-8">
                {/* Skeleton for graph nodes and edges */}
                <div className="flex justify-center gap-12">
                  {/* Coin node skeleton */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-none bg-[#1a1a1a] animate-pulse" />
                    <div className="h-3 w-12 bg-[#1a1a1a] animate-pulse" />
                  </div>

                  {/* Whale nodes skeleton */}
                  <div className="flex flex-col gap-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-none bg-[#1a1a1a] animate-pulse" />
                        <div className="h-3 w-20 bg-[#1a1a1a] animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional skeleton rows */}
                <div className="flex justify-center gap-12">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-none bg-[#1a1a1a] animate-pulse" />
                    <div className="h-3 w-12 bg-[#1a1a1a] animate-pulse" />
                  </div>

                  <div className="flex flex-col gap-6">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-none bg-[#1a1a1a] animate-pulse" />
                        <div className="h-3 w-20 bg-[#1a1a1a] animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : nodesState.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white text-xl">
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
              defaultViewport={{ x: 0, y: 0, zoom: 1.5 }}
              onConnect={onConnect}
            >
              <Background color="#333" gap={20} variant={BackgroundVariant.Dots} size={1} />
              <MiniMap style={{ background: '#111', border: '1px solid #333' }} nodeColor={() => '#333'} maskColor="rgba(0,0,0,0.5)" />
              <DownloadButton />
              {tooltipAnchor && (
                <Panel position={toolbarSide as any} className="bg-black/90 p-3 border border-[#2b2a2a] backdrop-blur-md shadow-2xl max-w-xs min-w-[200px] pointer-events-auto">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#2b2a2a]">
                    <h3 className="text-white font-bold text-[10px] uppercase tracking-wider">KOL Address</h3>
                    <div className="flex gap-2">
                      {/* Icons moved here if needed or kept in tooltip */}
                    </div>
                    <button onClick={() => setTooltipAnchor(null)} className="text-gray-400 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {(() => {
                    const node = nodesState.find(n => n.id === tooltipAnchor.nodeId);
                    return <Tooltip tooltip={node?.data} showToast={showToast} />;
                  })()}
                </Panel>
              )}
            </ReactFlow>
          )}
        </div >

        {/* Removed Bottom Subscription as it moved to Top */}
        < div className="mb-2" ></div >
      </motion.div >
    </motion.div >
  )
}

export default KolNetworkGraph
