import { ChevronDown, ArrowDownUp, Settings, Check } from "lucide-react"
import DefaultTokenImage from "../../assets/default_token.svg"

interface RightSidebarProps {
  selectedToken?: any
  quickBuyAmount?: string
}

const MarketOrderWidget = ({ selectedToken, quickBuyAmount }: { selectedToken?: any, quickBuyAmount?: string }) => {
  return (
    <div className="bg-[#111113] rounded-xl p-4 border border-[#2A2A2D]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-sm uppercase tracking-wider">MARKET ORDER</h3>
        <div className="flex items-center gap-3">
          {/* Version Selector */}
          <button className="flex items-center gap-1.5 text-xs text-gray-300 bg-[#1A1A1E] px-2 py-1 rounded border border-[#2A2A2D]">
            <Check className="w-3 h-3 text-[#00D9AC]" />
            <span>ULTRA V3</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {/* Slippage */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-500">SLIPPAGE:</span>
            <span className="text-white font-semibold">1.00%</span>
            <Settings className="w-3.5 h-3.5 text-gray-500 hover:text-white cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Selling Input */}
      <div className="bg-[#0A0A0B] rounded-lg p-4 mb-2 border border-[#2A2A2D]">
        <div className="flex justify-between mb-2">
          <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">SELLING</span>
        </div>
        <div className="flex justify-between items-center">
          <input
            type="number"
            placeholder="0.00"
            value={quickBuyAmount || ""}
            readOnly
            className="bg-transparent text-white text-2xl font-bold focus:outline-none w-1/2"
          />
          <div className="flex flex-col items-end gap-1">
            <button className="flex items-center gap-2 bg-[#1A1A1E] hover:bg-[#252528] px-3 py-2 rounded-lg transition-colors border border-[#2A2A2D]">
              <div className="w-5 h-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                $
              </div>
              <span className="text-white text-sm font-semibold">USDC</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            <span className="text-gray-500 text-xs">$0</span>
          </div>
        </div>
      </div>

      {/* Swap Icon */}
      <div className="flex justify-center -my-4 relative z-10">
        <div className="bg-[#111113] p-1.5 rounded-lg border border-[#2A2A2D]">
          <div className="bg-[#1A1A1E] p-2 rounded-lg hover:bg-[#252528] cursor-pointer transition-colors">
            <ArrowDownUp className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Buying Input */}
      <div className="bg-[#0A0A0B] rounded-lg p-4 mt-2 mb-4 border border-[#2A2A2D]">
        <div className="flex justify-between mb-2">
          <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">BUYING</span>
        </div>
        <div className="flex justify-between items-center">
          <input
            type="number"
            placeholder="0"
            className="bg-transparent text-white text-2xl font-bold focus:outline-none w-1/2"
          />
          <button className="flex items-center gap-2 bg-[#1A1A1E] hover:bg-[#252528] px-3 py-2 rounded-lg transition-colors border border-[#2A2A2D]">
            {selectedToken ? (
              <>
                <img
                  src={selectedToken.image || DefaultTokenImage}
                  alt={selectedToken.symbol}
                  className="w-5 h-5 rounded-full"
                  onError={(e) => { e.currentTarget.src = DefaultTokenImage }}
                />
                <span className="text-white text-sm font-semibold">{selectedToken.symbol}</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                <span className="text-white text-sm font-semibold">SOLANA</span>
              </>
            )}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Connect Wallet Button */}
      <button className="w-full bg-[#00D9AC] hover:bg-[#00C49A] text-black font-bold py-3.5 rounded-lg transition-colors uppercase tracking-wider text-sm mt-4">
        CONNECT WALLET
      </button>

      {/* Rate Display */}
      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-gray-500 uppercase">RATE</span>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">1 USDC = 0.0072945 SOL</span>
          <ChevronDown className="w-3 h-3 text-gray-500" />
        </div>
      </div>
    </div>
  )
}

const mockKOLCoins = [
  { id: 1, name: "TRUMP", fullName: "OFFICIAL TRUMP", symbol: "TRUMP", mc: "$1.40B", age: "10M", change: "+2.5%", positive: true },
  { id: 2, name: "SOLO", fullName: "SOLOMON", symbol: "SOLO", mc: "$23.8M", age: "19H", change: "-2.5%", positive: false },
  { id: 3, name: "JAZZ", fullName: "JAZZ HANDS", symbol: "JAZZ", mc: "$5.2M", age: "3D", change: "-1.5%", positive: false },
  { id: 4, name: "PIXEL", fullName: "PIXEL PALS", symbol: "PIXEL", mc: "$12.4M", age: "2W", change: "+3.2%", positive: true },
  { id: 5, name: "GXY", fullName: "GALAXY", symbol: "GXY", mc: "$8.1M", age: "1M", change: "+2.0%", positive: true },
]

const HotKOLCoins = () => {
  return (
    <div className="bg-[#111113] rounded-xl p-4 border border-[#2A2A2D] flex-1">
      <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-4">HOT KOL COINS</h3>
      <div className="space-y-2">
        {mockKOLCoins.map((coin, index) => (
          <div key={coin.id} className="flex items-center justify-between p-2 hover:bg-[#1A1A1E] rounded-lg cursor-pointer transition-colors group">
            <div className="flex items-center gap-3">
              {/* Rank Number */}
              <span className="text-gray-600 text-xs font-bold w-4">#{index + 1}</span>
              {/* Coin Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
                {coin.symbol[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-white text-sm font-bold">{coin.name}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    coin.positive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {coin.change}
                  </span>
                </div>
                <span className="text-gray-500 text-[10px] uppercase tracking-wide">{coin.fullName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* MC / Age Stats */}
              <div className="text-right hidden group-hover:block whitespace-nowrap">
                <span className="text-[9px] text-gray-500 uppercase">MC: {coin.mc} / AGE: {coin.age}</span>
              </div>
              <button className="px-3 py-1 bg-transparent border border-[#2A2A2D] hover:border-[#00D9AC] text-[10px] text-gray-400 hover:text-[#00D9AC] rounded font-semibold transition-colors uppercase tracking-wide">
                QUICK BUY
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="w-full mt-4 text-xs text-gray-500 hover:text-white transition-colors border border-[#2A2A2D] rounded-lg py-2 uppercase tracking-wider font-medium">
        View All
      </button>
    </div>
  )
}

const RightSidebar = ({ selectedToken, quickBuyAmount }: RightSidebarProps) => {
  return (
    <div className="w-full h-full flex flex-col space-y-4">
      <MarketOrderWidget selectedToken={selectedToken} quickBuyAmount={quickBuyAmount} />
      <HotKOLCoins />
    </div>
  )
}

export default RightSidebar
