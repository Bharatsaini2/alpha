/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  MiniMap,
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
  useNodesInitialized,
  useViewport,
  NodeToolbar,
  useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { toPng, toSvg } from "html-to-image";
import { CheckIcon, ChevronDown, X, RefreshCw, Save } from "lucide-react";
import axios from "axios";
import CopyIcon from "../client/src/assets/Copy.svg";
import ExternalLinkIcon from "../client/src/assets/ExternalLink.svg";
import DefaultTokenImage from "../client/src/assets/default_token.svg";
import solanalogo from "../client/src/assets/solana.svg";
import { applyForceLayout } from "../client/src/utils/ForceLayout";
import ErrorPopup from "../client/src/components/ui/ErrorPopup";
import { useToast } from "../client/src/contexts/ToastContext";
import { LastUpdatedTicker } from "./TicketComponent";
import { useRandomBubbleAnimation } from "../client/src/hooks/useBubbleAnimation";

interface Whale {
  id: string;
  address: string;
  buyVolume: number;
  sellVolume: number;
  lastAction: string;
  trades: { type: string; amount: number; timestamp: string }[];
  influencerName?: string;
  influencerUsername?: string;
  influencerProfileImageUrl?: string;
  influencerFollowerCount?: number;
}

interface Coin {
  id: string;
  symbol: string;
  name: string;
  imageUrl: string;
  totalBuyInflow: number;
}

interface CoinWithWhales {
  coin: Coin;
  whales: Whale[];
}

const BASE_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9090";

// Custom Coin Node Component
const makeEdgeId = (
  coinId: string,
  whaleNodeId: string,
  type: string,
  ts: number,
  amt: number,
) => `edge_${coinId}_${whaleNodeId}_${type}_${ts}_${Math.round(amt * 1000)}`;

// -----------------------------
// Custom Coin Node
// -----------------------------
const CoinNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const [isHovered, setIsHovered] = useState(false);
  const bubbleAnimation = useRandomBubbleAnimation();
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    // Throttle updates to avoid performance issues
    const timeoutId = setTimeout(() => {
      updateNodeInternals(id);
    }, 100); // Update every 100ms instead of on every frame

    return () => clearTimeout(timeoutId);
  }, [
    Math.round(bubbleAnimation.x / 5) * 5, // Quantize to reduce update frequency
    Math.round(bubbleAnimation.y / 5) * 5,
    Math.round(bubbleAnimation.scale * 20) / 20,
    updateNodeInternals,
    id,
  ]);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      className={`rf-circle-wrap relative ${selected ? "ring-2 ring-[#06DF73]" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{
        scale: isHovered ? 1.05 : 1 + bubbleAnimation.scale - 1,
        opacity: 1,
        borderRadius: "50%",
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
        position={Position.Bottom}
        style={{
          background: "transparent",
          border: "none",
          width: "0px",
          height: "0px",
          minWidth: "0px",
          minHeight: "0px",
        }}
      />
      <div className="relative">
        <motion.div
          className="rf-circle-wrap w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 bg-gradient-to-br from-[#1A1A1E] to-[#2A2A2D] flex items-center justify-center"
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
            className="w-12 h-12 rounded-full object-cover"
          />
        </motion.div>
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-r from-[#06DF73]/20 to-[#05C96A]/20 blur-md -z-10"
          animate={{
            opacity: isHovered ? 1 : 0,
            scale: isHovered ? 1.2 : 1,
          }}
          transition={{ duration: 0.3 }}
        />
        <motion.div
          className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-[#1A1A1E] border border-[#2A2A2D] rounded-lg px-2 py-1 text-xs font-medium text-white whitespace-nowrap"
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
  );
};

// -----------------------------
// Custom Whale Node
// -----------------------------
const WhaleNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const [isHovered, setIsHovered] = useState(false);
  const bubbleAnimation = useRandomBubbleAnimation();
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    // Throttle updates to avoid performance issues
    const timeoutId = setTimeout(() => {
      updateNodeInternals(id);
    }, 100); // Update every 100ms instead of on every frame

    return () => clearTimeout(timeoutId);
  }, [
    Math.round(bubbleAnimation.x / 5) * 5, // Quantize to reduce update frequency
    Math.round(bubbleAnimation.y / 5) * 5,
    Math.round(bubbleAnimation.scale * 20) / 20,
    updateNodeInternals,
    id,
  ]);

  const getWhaleColor = () => {
    const totalBuyAmount = data.totalBuyAmount || 0;
    const totalSellAmount = data.totalSellAmount || 0;
    if (totalBuyAmount > totalSellAmount) return "#06DF73";
    if (totalSellAmount > totalBuyAmount) return "#FF6467";
    return "#999999";
  };
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
        position={Position.Top}
        style={{
          background: "transparent",
          border: "none",
          width: "0px",
          height: "0px",
          minWidth: "0px",
          minHeight: "0px",
        }}
      />
      <div className="relative">
        <motion.div
          className="rf-circle-wrap w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-xs border-2 border-white/20"
          style={{ backgroundColor: "#999999" }}
          animate={{
            borderColor: isHovered
              ? `${getWhaleColor()}80`
              : "rgba(255, 255, 255, 0.2)",
          }}
          transition={{ duration: 0.2 }}
        >
          <img
            src={
              (data.influencerProfileImageUrl as string) || DefaultTokenImage
            }
            alt={(data.name as string) || "Token"}
            className="w-12 h-12 rounded-full object-cover"
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
          className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-[#1A1A1E] border border-[#2A2A2D] rounded-lg px-2 py-1 text-xs font-medium text-white whitespace-nowrap"
          animate={{
            opacity: isHovered ? 1 : 0,
            y: isHovered ? 0 : 10,
          }}
          transition={{ duration: 0.2 }}
        >
          {((data.address as string) || "0x0000").slice(0, 6)}...
          {((data.address as string) || "0000").slice(-4)}
        </motion.div>
      </div>
    </motion.div>
  );
};

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
  const [isHovered, setIsHovered] = useState(false);

  const edgeOffset = (data?.edgeOffset as number) ?? 0;

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Create perpendicular offset for multiple edges
  const perpX = (-dy / len) * edgeOffset;
  const perpY = (dx / len) * edgeOffset;
  const controlX = midX + perpX;
  const controlY = midY + perpY;
  const edgePath = `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;

  return (
    <motion.g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.path
        id={id}
        d={edgePath}
        stroke={data?.type === "buy" ? "#06DF73" : "#FF6467"}
        strokeWidth={isHovered ? 1 : 0.5}
        fill="none"
        style={{
          strokeDasharray: "none",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
        animate={{
          strokeWidth: isHovered ? 1 : 0.5,
          opacity: isHovered ? 1 : 0.7,
        }}
        transition={{ duration: 0.2 }}
      />
    </motion.g>
  );
};

// Tooltip Component
const Tooltip: React.FC<{
  tooltip: any;
  showToast: (message: string, type: "success" | "error") => void;
}> = ({ tooltip, showToast }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  if (!tooltip) return null;
  const copyToClipboard = (text: string, field: string) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or mobile devices
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopiedField(field);
      showToast("Address copied to clipboard!", "success");
      setTimeout(() => setCopiedField(null), 2000); // Hide after 2 seconds
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      showToast("Failed to copy address", "error");
    }
  };

  return (
    <>
      {tooltip.nodeType === "whale" && (
        <div className="text-white">
          <div className="flex items-center flex-row space-x-3 ">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs">
                {tooltip.address && tooltip.address.length > 8
                  ? `${tooltip.address.slice(0, 4)}...${tooltip.address.slice(-4)}`
                  : tooltip.address || "Unknown"}
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
                  className=" hover:bg-[#2A2A2D] rounded transition-colors"
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

          <div className="space-y-1 text-xs mt-2">
            <div className="flex justify-between">
              <span className="text-[#06DF73] ">Buys:</span>
              <span className="text-white ">
                {tooltip.trades?.filter((t: any) => t.type === "buy").length ||
                  0}
                <span className="text-white ml-1">
                  ($
                  {Math.round(tooltip.totalBuyAmount || 0).toLocaleString()})
                </span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#FF6467] ">Sells:</span>
              <span className="text-white ">
                {tooltip.trades?.filter((t: any) => t.type === "sell").length ||
                  0}
                <span className="text-white ml-1">
                  ($
                  {Math.round(tooltip.totalSellAmount || 0).toLocaleString()})
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const isIOS = () => {
  const ua = navigator.userAgent || "";
  const isTouchMac = ua.includes("Mac") && "ontouchend" in document;
  return /iPad|iPhone|iPod/.test(ua) || isTouchMac;
};

const drawSvgToPng = async (
  svgMarkup: string,
  width: number,
  height: number,
  pixelRatio = 2,
) => {
  const img = new Image();
  img.decoding = "async";
  const svgDataUrl =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgMarkup);
  img.src = svgDataUrl;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
};

const toPngWithRetry = async (el: HTMLElement, opts: any, attempts = 3) => {
  let last = "";
  for (let i = 0; i < attempts; i++) {
    const url = await toPng(el, opts);
    if (url.length > last.length) return url;
    last = url;
    await new Promise((r) => setTimeout(r, 150));
  }
  return last;
};

const DownloadButton: React.FC = () => {
  const { getNodes } = useReactFlow();
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  const downloadImage = (dataUrl: string) => {
    const a = document.createElement("a");
    a.setAttribute("download", "whale-network-graph.png");
    a.setAttribute("href", dataUrl);
    a.click();
  };

  const imageWidth = 1920;
  const imageHeight = 1080;

  // Replace external images with local default images to avoid CORS
  const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(`${BASE_URL}/proxy-image?url=${url}`, {
        mode: "cors",
      });
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("⚠️ Failed to fetch image:", url, err);
      return null;
    }
  };

  const prepareImagesForScreenshot = async () => {
    const images = document.querySelectorAll(".react-flow__viewport img");
    const originalSources: Array<{
      element: HTMLImageElement;
      originalSrc: string;
    }> = [];

    images.forEach(async (img) => {
      const imgElement = img as HTMLImageElement;
      const originalSrc = imgElement.src;
      if (originalSrc && originalSrc.startsWith("http")) {
        originalSources.push({ element: imgElement, originalSrc });
        const dataUrl = await fetchImageAsDataUrl(originalSrc);
        if (dataUrl) {
          imgElement.src = dataUrl;
        } else {
          imgElement.src = DefaultTokenImage;
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    return originalSources;
  };

  const restoreOriginalImages = (
    originalSources: Array<{ element: HTMLImageElement; originalSrc: string }>,
  ) => {
    originalSources.forEach(({ element, originalSrc }) => {
      element.src = originalSrc;
    });
  };

  const handleRetry = () => {
    onClick();
  };

  const onClick = async () => {
    let originalSources: Array<{
      element: HTMLImageElement;
      originalSrc: string;
    }> = [];
    const targetEl = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!targetEl) return;

    const root = document.querySelector(".react-flow") || document.body;
    const nodesBounds = getNodesBounds(getNodes());
    const viewport = getViewportForBounds(
      nodesBounds,
      imageWidth,
      imageHeight,
      0.5,
      2,
      0.5,
    );

    try {
      originalSources = await prepareImagesForScreenshot();

      // Enter snapshot mode to stabilize Safari foreignObject rendering
      root.classList.add("snapshot-mode");

      let dataUrl = "";

      if (isIOS()) {
        // Prefer SVG on iOS/Safari; rasterize to PNG
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
        });
        dataUrl = await drawSvgToPng(svgMarkup, imageWidth, imageHeight, 2);
      } else {
        // Chromium/Android path
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
          2,
        );
      }

      downloadImage(dataUrl);
    } catch (error) {
      console.error("Error downloading image:", error);
      try {
        // Minimal fallback
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
        });
        downloadImage(dataUrl);
      } catch (fallbackError) {
        console.error("Fallback download also failed:", fallbackError);
        setShowErrorPopup(true);
      }
    } finally {
      // Exit snapshot mode and restore originals
      root.classList.remove("snapshot-mode");
      if (originalSources.length > 0) {
        setTimeout(() => {
          restoreOriginalImages(originalSources);
        }, 100);
      }
    }
  };

  return (
    <>
      <Panel position="bottom-left" className="m-2">
        <div className="flex items-center">
          <motion.button
            onClick={onClick}
            className="flex items-center gap-2 px-4 py-2  text-xs md:text-sm text-white opacity-75 cursor-pointer transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Save className="w-3 h-3 md:w-4 md:h-4 opacity-75" />
          </motion.button>
          <div className="flex items-center justify-center gap-1">
            <img src="/AppIcon.png" className="h-[10px] md:h-[18px]" />
            <div
              className="color-[#B4B4B4] text-[10px] md:text-[16px]"
              style={{ color: "#B4B4B4" }}
            >
              <p>
                <span style={{ marginRight: "3px" }}>Powered</span>By
              </p>
            </div>
            <div className="color-white font-bold text-[10px] md:text-[16px]">
              AlphaBlock AI
            </div>
          </div>
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
  );
};

type TooltipAnchor = { type: "whale"; nodeId: string };
// Main Network Graph Component
const KolNetworkGraph: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [apiData, setApiData] = useState<CoinWithWhales[]>([]);
  const [loading, setLoading] = useState(false);
  // const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [tooltipAnchor, setTooltipAnchor] = useState<TooltipAnchor | null>(
    null,
  );
  const [toolbarSide, setToolbarSide] = useState<Position>(Position.Right);
  const { showToast } = useToast();
  const { x: vpX, y: vpY, zoom } = useViewport();
  const [filters, setFilters] = useState({
    timeframe: "5m",
    whales: "2",
    volume: "5K",
  });
  const [touched, setTouched] = useState({
    timeframe: false,
    whales: false,
    volume: false,
  });
  const [dropdown, setDropdown] = useState<string | null>(null);
  const [customWhales, setCustomWhales] = useState("");
  const [customVolume, setCustomVolume] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);

  // State for data management
  const [mergedData, setMergedData] = useState<CoinWithWhales[]>([]);
  const positionsRef = React.useRef<Record<string, { x: number; y: number }>>(
    {},
  );
  const layoutAppliedRef = React.useRef(false);
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      coin: CoinNode,
      whale: WhaleNode,
    }),
    [],
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      custom: CustomEdge,
    }),
    [],
  );

  // Helper function to update data directly (no merging or fade-out logic)
  const updateDataDirectly = useCallback((newData: CoinWithWhales[]) => {
    // Simply replace the data with new data from API
    setMergedData(newData);
  }, []);

  // Fetch data
  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        // Use custom values if provided, otherwise use filter values
        const whaleCount = customWhales || filters.whales;
        const volumeValue = customVolume || filters.volume;

        // Convert volume from "K" format to actual number for backend
        // Backend now handles all filtering: whale count and buy volume only
        const numericVolume = volumeValue.toString().includes("K")
          ? parseInt(volumeValue.replace("K", ""), 10) * 1000
          : parseInt(volumeValue, 10) || 0;

        const res = await axios.get(
          `${BASE_URL}/influencer/visualize-kols?timeframe=${filters.timeframe}&minKols=${whaleCount}&minInflow=${numericVolume}`,
        );

        const newData = res.data.data || [];
        setApiData(newData);

        // Update data directly (no merging or fade-out logic)
        updateDataDirectly(newData);

        // Update last updated time and reset timer
        setLastUpdatedTime(new Date());
      } catch (err) {
        console.error("❌ Error fetching visualizeWhales:", err);
        setApiData([]);
      } finally {
        if (isRefresh) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters, customWhales, customVolume, updateDataDirectly],
  );

  // Process data for React Flow
  const { nodes, edges } = useMemo(() => {
    let flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Use merged data instead of raw apiData
    const dataToProcess = mergedData.length > 0 ? mergedData : apiData;

    if (!dataToProcess || dataToProcess.length === 0) {
      return { nodes: flowNodes, edges: flowEdges };
    }

    // Flatten all trades
    const allTrades = dataToProcess.flatMap((coinData) =>
      coinData.whales.flatMap((whale) =>
        whale.trades.map((trade) => ({
          ...trade,
          coinId: coinData.coin.id,
          coinSymbol: coinData.coin.symbol,
          whaleId: whale.id,
          whaleAddress: whale.address,
          influencerName: whale.influencerName,
          influencerUsername: whale.influencerUsername,
          influencerProfileImageUrl: whale.influencerProfileImageUrl,
          influencerFollowerCount: whale.influencerFollowerCount,
          amount:
            typeof trade.amount === "string"
              ? parseFloat(trade.amount)
              : trade.amount,
          timestamp:
            typeof trade.timestamp === "string"
              ? new Date(trade.timestamp).getTime()
              : Number(trade.timestamp),
        })),
      ),
    );

    // Filter trades by timeframe only (backend handles volume and whale count filtering)
    const now = Date.now();
    const timePeriodMinutes = parseInt(filters.timeframe.replace("m", ""), 10);

    const filteredTrades = allTrades.filter((trade) => {
      const timeCheck = now - trade.timestamp <= timePeriodMinutes * 60 * 1000;
      return timeCheck;
    });

    // Group by coin
    const tradesByCoin = filteredTrades.reduce(
      (acc, trade) => {
        if (!acc[trade.coinId]) {
          acc[trade.coinId] = {
            coin: dataToProcess.find((d) => d.coin.id === trade.coinId)?.coin,
            trades: [],
          };
        }
        acc[trade.coinId].trades.push(trade);
        return acc;
      },
      {} as Record<string, { coin: any; trades: any[] }>,
    );

    // Create nodes and edges
    Object.values(tradesByCoin).forEach((coinData, coinIndex) => {
      const coinId = `coin_${coinData.coin.id}`;

      // Calculate total trades for this coin
      const totalTrades = coinData.trades.length;

      // Add coin node
      flowNodes.push({
        id: coinId,
        type: "coin",
        position: { x: 100 + coinIndex * 200, y: 100 },
        data: {
          ...coinData.coin,
          imageUrl: coinData.coin.imageUrl,
          nodeType: "coin",
          totalTrades: totalTrades,
        },
      });

      // Group trades by whale
      const tradesByWhale = coinData.trades.reduce(
        (
          acc: Record<
            string,
            {
              whaleAddress: string;
              trades: any[];
              influencerName?: string;
              influencerUsername?: string;
              influencerProfileImageUrl?: string;
              influencerFollowerCount?: number;
            }
          >,
          trade: any,
        ) => {
          if (!acc[trade.whaleId]) {
            acc[trade.whaleId] = {
              whaleAddress: trade.whaleAddress,
              trades: [],
              influencerName: trade.influencerName,
              influencerUsername: trade.influencerUsername,
              influencerProfileImageUrl: trade.influencerProfileImageUrl,
              influencerFollowerCount: trade.influencerFollowerCount,
            };
          }
          acc[trade.whaleId].trades.push(trade);
          return acc;
        },
        {} as Record<
          string,
          {
            whaleAddress: string;
            trades: any[];
            influencerName?: string;
            influencerUsername?: string;
            influencerProfileImageUrl?: string;
            influencerFollowerCount?: number;
          }
        >,
      );

      // Create whale nodes and edges
      Object.entries(tradesByWhale).forEach(
        ([whaleId, whaleData], whaleIndex) => {
          const whaleNodeId = `whale_${coinData.coin.id}_${whaleId}`;

          const totalBuyAmount = whaleData.trades
            .filter((t: any) => t.type === "buy")
            .reduce((sum: number, t: any) => sum + t.amount, 0);
          const totalSellAmount = whaleData.trades
            .filter((t: any) => t.type === "sell")
            .reduce((sum: number, t: any) => sum + t.amount, 0);

          // Add whale node
          flowNodes.push({
            id: whaleNodeId,
            type: "whale",
            position: {
              x: 100 + coinIndex * 200 + (whaleIndex - 1) * 80,
              y: 250 + whaleIndex * 60,
            },
            data: {
              address: whaleData.whaleAddress,
              trades: whaleData.trades,
              totalBuyAmount,
              totalSellAmount,
              nodeType: "whale",
              influencerName: whaleData.influencerName,
              influencerUsername: whaleData.influencerUsername,
              influencerProfileImageUrl: whaleData.influencerProfileImageUrl,
            },
          });

          // Add individual edges for each trade
          whaleData.trades.forEach((trade: any, tradeIndex: number) => {
            const edgeId = makeEdgeId(
              coinId,
              whaleNodeId,
              trade.type,
              trade.timestamp,
              trade.amount,
            );

            // Create a slight offset for multiple edges between same nodes
            const edgeOffset = tradeIndex * 2 - (whaleData.trades.length - 1);

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
              animated: trade.type === "sell",
            });
          });
        },
      );
    });

    if (!layoutAppliedRef.current) {
      flowNodes = applyForceLayout(flowNodes, flowEdges, 1200, 800);
      layoutAppliedRef.current = true;
    } else {
      flowNodes = flowNodes.map((n) => ({
        ...n,
        position: positionsRef.current[n.id] ?? n.position,
      }));
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [mergedData, apiData, filters, customVolume]);

  const [nodesState, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds) as any),
    [setEdges],
  );
  React.useEffect(() => {
    setNodes((prev: Node[]) => {
      const prevMap = new Map(prev.map((n) => [n.id, n])); // prev is Node[]
      return (nodes as Node[]).map((n) => {
        const old = prevMap.get(n.id);
        return old
          ? {
              ...old,
              data: n.data,
              style: n.style,
              type: n.type,
              // keep old.position/width/height to avoid geometry shift
            }
          : n;
      });
    });
    setEdges((prev: Edge[]) => {
      const prevMap = new Map(prev.map((e) => [e.id, e])); // prev is Edge[]
      return (edges as Edge[]).map((e) => {
        const old = prevMap.get(e.id);
        return old
          ? {
              ...old,
              data: e.data,
              animated: e.animated,
              type: e.type,
              // keep any internal geometry React Flow manages
            }
          : e;
      });
    });
  }, [nodes, edges, setNodes, setEdges]);

  // Handle node click for tooltip (whales) and copy (coins)
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "whale") {
        // Show tooltip for whale nodes
        setTooltipAnchor({ type: "whale", nodeId: node.id });
      } else if (node.type === "coin") {
        // Copy token address for coin nodes
        const tokenAddress = (node.data?.id || node.id) as string;
        if (tokenAddress && typeof tokenAddress === "string") {
          navigator.clipboard
            .writeText(tokenAddress)
            .then(() => {
              showToast("Address copied to clipboard!", "success");
            })
            .catch(() => {
              showToast("Failed to copy address", "error");
            });
        }
      }
    },
    [showToast],
  );

  // Close tooltip when clicking elsewhere
  const onPaneClick = useCallback(() => {
    setTooltipAnchor(null);
  }, []);

  // Manual refresh function
  const handleManualRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  // Fetch data when filters change
  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 seconds for live updates
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true); // true indicates this is a refresh
    }, 5000); // 5 seconds for live updates

    return () => clearInterval(interval);
  }, [fetchData]);

  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const [didFit, setDidFit] = useState(false);

  React.useEffect(() => {
    if (!didFit && nodesInitialized && nodesState.length > 0) {
      fitView({ padding: 0.2 });
      setDidFit(true);
    }
  }, [didFit, nodesInitialized, nodesState.length, fitView]);

  const timeframeOptions = ["1m", "3m", "5m", "7m", "10m", "15m"];
  const whaleOptions = ["2", "3", "4", "5", "7", "10"];
  const volumeOptions = ["3K", "5K", "10K", "15K", "25K"];

  // Helper function to format time display
  const formatTimeSinceUpdate = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
  };

  React.useEffect(() => {
    if (!tooltipAnchor) return;
    const pane = document.querySelector(".react-flow") as HTMLElement | null;
    if (!pane) return;

    const rect = pane.getBoundingClientRect();
    const node = nodesState.find((n) => n.id === tooltipAnchor.nodeId);
    if (!node) return;

    // node size fallbacks
    const width = node.width ?? 48;
    const height = node.height ?? 48;

    // node center in pane pixel space (using viewport transform)
    const nodeCenterX = vpX + node.position.x * zoom + (width * zoom) / 2;
    const nodeCenterY = vpY + node.position.y * zoom + (height * zoom) / 2;

    // estimated tooltip box size (adjust if your content differs)
    const estTooltipWidth = 260;
    const estTooltipHeight = 140;
    const gap = 12;

    // available pixels to each side within pane bounds
    const availableRight =
      rect.width - (nodeCenterX + (width * zoom) / 2) - gap;
    const availableLeft = nodeCenterX - (width * zoom) / 2 - gap;
    const availableBottom =
      rect.height - (nodeCenterY + (height * zoom) / 2) - gap;
    const availableTop = nodeCenterY - (height * zoom) / 2 - gap;

    // Score each side by how much room remains after placing the tooltip
    const scores: Array<{ side: Position; score: number; fits: boolean }> = [
      {
        side: Position.Right,
        score: availableRight - estTooltipWidth,
        fits: availableRight >= estTooltipWidth,
      },
      {
        side: Position.Left,
        score: availableLeft - estTooltipWidth,
        fits: availableLeft >= estTooltipWidth,
      },
      {
        side: Position.Bottom,
        score: availableBottom - estTooltipHeight,
        fits: availableBottom >= estTooltipHeight,
      },
      {
        side: Position.Top,
        score: availableTop - estTooltipHeight,
        fits: availableTop >= estTooltipHeight,
      },
    ];

    // Prefer any side that "fits"; otherwise choose the maximum score as fallback
    const fitting = scores.filter((s) => s.fits);
    const chosen = (fitting.length > 0 ? fitting : scores).reduce(
      (best, cur) => (cur.score > best.score ? cur : best),
    );

    setToolbarSide(chosen.side);
  }, [tooltipAnchor, nodesState, vpX, vpY, zoom]);

  React.useEffect(() => {
    if (isOpen) {
      setTouched({ timeframe: false, whales: false, volume: false });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black flex items-center justify-center z-50 px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="relative w-full max-w-7xl mx-auto bg-[#000000] rounded-2xl shadow-xl p-6 md:p-8"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex items-center justify-end mb-6">
          <div className="flex items-center gap-3">
            {/* Last updated timer */}
            {lastUpdatedTime && (
              <div className="flex items-center space-x-2 px-3 py-2 text-xs text-gray-400">
                <span className="text-gray-500">Last updated:</span>
                <LastUpdatedTicker
                  lastUpdated={lastUpdatedTime}
                  format={formatTimeSinceUpdate}
                />
              </div>
            )}

            {/* Manual refresh button */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-3 py-2 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>

            {/* Close button */}
            <button
              className="text-white border border-white rounded-full p-1 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Filters - Horizontal Row */}
        <div className="flex md:hidden gap-1 mb-6 px-2">
          {/* Mobile Timeframe */}
          <div className="relative flex-1">
            <button
              className={`flex items-center justify-between w-full px-2 py-2 border border-[#2B2B2D] rounded-lg text-xs ${
                dropdown === "timeframe" ? "text-white" : "text-gray-400"
              } ${dropdown === "timeframe" ? "font-bold" : "font-normal"} transition-colors cursor-pointer`}
              onClick={() =>
                setDropdown(dropdown === "timeframe" ? null : "timeframe")
              }
            >
              {touched.timeframe ? filters.timeframe : "Timeframe"}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${dropdown === "timeframe" ? "rotate-180" : ""}`}
              />
            </button>
            {dropdown === "timeframe" && (
              <div className="absolute mt-2 w-full bg-black border border-[#2B2B2D] rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-xs text-white">
                  Filter by Time
                </div>
                {timeframeOptions.map((option) => (
                  <button
                    key={option}
                    className="w-full px-2 py-1 text-left text-white hover:text-white/70 transition-colors text-xs"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, timeframe: option }));
                      setTouched((t) => ({ ...t, timeframe: true }));
                      setDropdown(null);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Whales */}
          <div className="relative flex-1">
            <button
              className={`flex items-center justify-between w-full px-2 py-2 border border-[#2B2B2D] rounded-lg text-xs ${
                dropdown === "whales" ? "text-white" : "text-gray-400"
              } ${dropdown === "whales" ? "font-bold" : "font-normal"} transition-colors cursor-pointer`}
              onClick={() =>
                setDropdown(dropdown === "whales" ? null : "whales")
              }
            >
              {touched.whales ? `${filters.whales}W` : "No.Whales"}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${dropdown === "whales" ? "rotate-180" : ""}`}
              />
            </button>
            {dropdown === "whales" && (
              <div className="absolute mt-2 w-full bg-black border border-[#2B2B2D] rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-xs text-white">
                  Filter by Kol Count
                </div>
                {whaleOptions.map((option) => (
                  <button
                    key={option}
                    className="w-full px-2 py-1 text-left text-white hover:text-white/70 transition-colors text-xs"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, whales: option }));
                      setCustomWhales("");
                      setTouched((t) => ({ ...t, whales: true }));
                      setDropdown(null);
                    }}
                  >
                    •{option}
                  </button>
                ))}
                <div className="px-2 py-1">
                  <input
                    type="number"
                    placeholder="Custom"
                    value={customWhales}
                    onChange={(e) => setCustomWhales(e.target.value)}
                    className="w-full px-1 py-1 bg-[#1A1A1E] border border-[#2B2B2D] rounded text-white text-xs placeholder-gray-400"
                  />
                  <button
                    onClick={() => {
                      if (customWhales) {
                        setFilters((prev) => ({
                          ...prev,
                          whales: customWhales,
                        }));
                        setCustomWhales("");
                        setTouched((t) => ({ ...t, whales: true }));
                        setDropdown(null);
                      }
                    }}
                    className="w-full mt-1 px-2 py-1 bg-[#06DF73] text-black rounded text-xs font-medium hover:bg-[#05C96A] transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Volume */}
          <div className="relative flex-1">
            <button
              className={`flex items-center justify-between w-full px-2 py-2 border border-[#2B2B2D] rounded-lg text-xs ${
                dropdown === "volume" ? "text-white" : "text-gray-400"
              } ${dropdown === "volume" ? "font-bold" : "font-normal"} transition-colors cursor-pointer`}
              onClick={() =>
                setDropdown(dropdown === "volume" ? null : "volume")
              }
            >
              {touched.volume ? filters.volume : "Volume"}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${dropdown === "volume" ? "rotate-180" : ""}`}
              />
            </button>
            {dropdown === "volume" && (
              <div className="absolute mt-2 w-full bg-black border border-[#2B2B2D] rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-xs text-white">
                  Filter by Volume
                </div>
                {volumeOptions.map((option) => (
                  <button
                    key={option}
                    className="w-full px-2 py-1 text-left text-white hover:text-white/70 transition-colors text-xs"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, volume: option }));
                      setCustomVolume("");
                      setTouched((t) => ({ ...t, volume: true }));
                      setDropdown(null);
                    }}
                  >
                    {option}
                  </button>
                ))}
                <div className="px-2 py-1">
                  <input
                    type="number"
                    placeholder="Custom"
                    value={customVolume}
                    onChange={(e) => setCustomVolume(e.target.value)}
                    className="w-full px-1 py-1 bg-[#1A1A1E] border border-[#2B2B2D] rounded text-white text-xs placeholder-gray-400"
                  />
                  <button
                    onClick={() => {
                      if (customVolume) {
                        setFilters((prev) => ({
                          ...prev,
                          volume: customVolume + "K",
                        }));
                        setCustomVolume("");
                        setTouched((t) => ({ ...t, volume: true }));
                        setDropdown(null);
                      }
                    }}
                    className="w-full mt-1 px-2 py-1 bg-[#06DF73] text-black rounded text-xs font-medium hover:bg-[#05C96A] transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Filters - End Aligned */}
        <div className="hidden md:flex flex-wrap gap-4 justify-end mb-6">
          {/* Timeframe */}
          <div
            className="custom-frm-bx position-relative"
            style={{ width: "160px" }}
          >
            <label className="nw-label">Timeframe</label>
            <div
              className="form-select cursor-pointer text-start"
              onClick={(e) => {
                e.stopPropagation();
                setDropdown(dropdown === "timeframe" ? null : "timeframe");
              }}
            >
              {touched.timeframe ? filters.timeframe : "Timeframe"}
            </div>
            {dropdown === "timeframe" && (
              <ul className="subscription-dropdown-menu show w-100">
                {timeframeOptions.map((option) => (
                  <li
                    key={option}
                    className="subs-items"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, timeframe: option }));
                      setTouched((t) => ({ ...t, timeframe: true }));
                      setDropdown(null);
                    }}
                  >
                    {option}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* No. of Whales */}
          <div
            className="custom-frm-bx position-relative"
            style={{ width: "160px" }}
          >
            <label className="nw-label">No. Whales</label>
            <div
              className="form-select cursor-pointer text-start"
              onClick={(e) => {
                e.stopPropagation();
                setDropdown(dropdown === "whales" ? null : "whales");
              }}
            >
              {touched.whales ? `${filters.whales}W` : "No. Whales"}
            </div>
            {dropdown === "whales" && (
              <ul className="subscription-dropdown-menu show w-100">
                {whaleOptions.map((option) => (
                  <li
                    key={option}
                    className="subs-items"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, whales: option }));
                      setCustomWhales("");
                      setTouched((t) => ({ ...t, whales: true }));
                      setDropdown(null);
                    }}
                  >
                    •{option}
                  </li>
                ))}
                {/* Custom input for whales */}
                <div className="px-3 py-2">
                  <input
                    type="number"
                    placeholder="Custom count"
                    value={customWhales}
                    onChange={(e) => setCustomWhales(e.target.value)}
                    className="w-full px-2 py-2 bg-[#1A1A1E] border border-[#2B2B2D] rounded-[10px] text-white text-sm placeholder-gray-400"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={() => {
                      if (customWhales) {
                        setFilters((prev) => ({
                          ...prev,
                          whales: customWhales,
                        }));
                        setCustomWhales("");
                        setTouched((t) => ({ ...t, whales: true }));
                        setDropdown(null);
                      }
                    }}
                    className="mt-2 w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </ul>
            )}
          </div>

          {/* Volume */}
          <div
            className="custom-frm-bx position-relative"
            style={{ width: "160px" }}
          >
            <label className="nw-label">Min Volume</label>
            <div
              className="form-select cursor-pointer text-start"
              onClick={(e) => {
                e.stopPropagation();
                setDropdown(dropdown === "volume" ? null : "volume");
              }}
            >
              {touched.volume ? filters.volume : "Min Volume"}
            </div>
            {dropdown === "volume" && (
              <ul className="subscription-dropdown-menu show w-100">
                {volumeOptions.map((option) => (
                  <li
                    key={option}
                    className="subs-items"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, volume: option }));
                      setCustomVolume("");
                      setTouched((t) => ({ ...t, volume: true }));
                      setDropdown(null);
                    }}
                  >
                    {option}
                  </li>
                ))}
                {/* Custom input for volume */}
                <div className="px-3 py-2">
                  <input
                    type="number"
                    placeholder="Custom volume"
                    value={customVolume}
                    onChange={(e) => setCustomVolume(e.target.value)}
                    className="w-full px-2 py-2 bg-[#1A1A1E] border border-[#2B2B2D] rounded-[10px] text-white text-sm placeholder-gray-400"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={() => {
                      if (customVolume) {
                        setFilters((prev) => ({
                          ...prev,
                          volume: customVolume + "K",
                        }));
                        setCustomVolume("");
                        setTouched((t) => ({ ...t, volume: true }));
                        setDropdown(null);
                      }
                    }}
                    className="mt-2 w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </ul>
            )}
          </div>
        </div>

        {/* Graph Container */}
        <div className="w-full h-96 rounded-xl overflow-hidden bg-black relative">
          {/* Subtle refresh overlay */}
          {isRefreshing && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] rounded-xl z-10 flex items-center justify-center">
              <div className="flex items-center space-x-2 text-sm text-white/80">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/40 border-t-transparent"></div>
                <span>Updating...</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#06DF73] border-t-transparent"></div>
            </div>
          ) : nodesState.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white text-xl">
              Not enough whale transactions for the selected filters.
            </div>
          ) : (
            <>
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
                fitViewOptions={{ padding: 0.2 }}
                className="bg-black"
                defaultViewport={{ x: 0, y: 0, zoom: 1.5 }}
                onConnect={onConnect}
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="black" gap={20} />

                <MiniMap
                  style={{
                    backgroundColor: "black",
                    color: "white",
                    border: "1px solid white",
                    height: 100,
                    width: 100,
                  }}
                  nodeColor={(node) => {
                    if (node.type === "coin") return "#06DF73";
                    if (node.type === "whale") {
                      const totalBuy = node.data?.totalBuyAmount || 0;
                      const totalSell = node.data?.totalSellAmount || 0;
                      if (totalBuy > totalSell) return "#06DF73";
                      if (totalSell > totalBuy) return "#FF6467";
                      return "#999999";
                    }
                    return "#999999";
                  }}
                  zoomable={true}
                  pannable={true}
                  zoomStep={100}
                />
                <AnimatePresence>
                  {tooltipAnchor && (
                    <NodeToolbar
                      key={tooltipAnchor.nodeId}
                      nodeId={tooltipAnchor.nodeId}
                      isVisible
                      position={toolbarSide}
                      offset={12}
                      align="center"
                      className="bg-[#1A1A1E] border border-[#2A2A2D] rounded-lg p-4 shadow-2xl max-w-xs pointer-events-auto"
                    >
                      {(() => {
                        const n = nodesState.find(
                          (n) => n.id === tooltipAnchor.nodeId,
                        );
                        return n ? (
                          <Tooltip tooltip={n.data} showToast={showToast} />
                        ) : null;
                      })()}
                    </NodeToolbar>
                  )}
                </AnimatePresence>
                <DownloadButton />
              </ReactFlow>
            </>
          )}
        </div>
        <div className="flex items-center justify-start gap-1">
          <img
            src="/AppIcon.png"
            className="h-[10px] md:h-[18px]"
            style={{ width: "25px" }}
          />
          <div
            className="color-[#B4B4B4] text-[10px] md:text-[16px]"
            style={{ color: "#B4B4B4" }}
          >
            <p>
              <span style={{ marginRight: "3px" }}>Powered</span>By
            </p>
          </div>
          <div className="color-white font-bold text-[10px] md:text-[16px]">
            AlphaBlock AI
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default KolNetworkGraph;
