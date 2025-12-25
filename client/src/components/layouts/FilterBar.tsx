import { useState } from "react"
import { Filter, ChevronDown } from "lucide-react"

const FilterBar = () => {
  const [activeFilter, setActiveFilter] = useState("all")
  const [hotnessOpen, setHotnessOpen] = useState(false)
  const [amountOpen, setAmountOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)

  const filters = [
    { id: "all", label: "All" },
    { id: "buy", label: "Buy" },
    { id: "sell", label: "Sell" },
  ]

  const hotnessOptions = [
    "1/10",
    "2/10",
    "3/10",
    "4/10",
    "5/10",
    "6/10",
    "7/10",
    "8/10",
    "9/10",
    "10/10",
  ]
  const amountOptions = [
    "$0 - $100",
    "$100 - $1K",
    "$1K - $10K",
    "$10K - $100K",
    "$100K+",
  ]
  const tagOptions = ["Sniper", "KOL", "Whale", "Smart Money", "Flipper"]

  return (
    <div className="bg-[#0f0f0f] border-b border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between overflow-x-auto">
        <div className="flex items-center space-x-2 min-w-max">
          {/* Main Filters */}
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                ${
                  activeFilter === filter.id
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                }
              `}
            >
              {filter.label}
            </button>
          ))}

          {/* Hotness Dropdown */}
          <div className="relative">
            <button
              onClick={() => setHotnessOpen(!hotnessOpen)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
            >
              <span className="text-sm font-medium">Hotness</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${hotnessOpen ? "rotate-180" : ""}`}
              />
            </button>

            {hotnessOpen && (
              <div className="absolute top-full left-0 mt-2 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
                {hotnessOptions.map((option) => (
                  <button
                    key={option}
                    className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    onClick={() => setHotnessOpen(false)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAmountOpen(!amountOpen)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
            >
              <span className="text-sm font-medium">Amount</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${amountOpen ? "rotate-180" : ""}`}
              />
            </button>

            {amountOpen && (
              <div className="absolute top-full left-0 mt-2 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
                {amountOptions.map((option) => (
                  <button
                    key={option}
                    className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    onClick={() => setAmountOpen(false)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tags Dropdown */}
          <div className="relative">
            <button
              onClick={() => setTagsOpen(!tagsOpen)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
            >
              <span className="text-sm font-medium">Tags</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${tagsOpen ? "rotate-180" : ""}`}
              />
            </button>

            {tagsOpen && (
              <div className="absolute top-full left-0 mt-2 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
                {tagOptions.map((option) => (
                  <button
                    key={option}
                    className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    onClick={() => setTagsOpen(false)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter Icon */}
        <button className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors ml-2">
          <Filter className="w-4 h-4 text-gray-300" />
        </button>
      </div>
    </div>
  )
}

export default FilterBar
