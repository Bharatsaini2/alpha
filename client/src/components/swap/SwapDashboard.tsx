import React, { useState, useCallback } from "react"
import { Activity, BarChart3, History, Settings } from "lucide-react"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import TransactionHistory from "./TransactionHistory"
import PriorityLevelAnalytics from "./PriorityLevelAnalytics"

interface SwapDashboardProps {
  className?: string
}

type DashboardTab = 'history' | 'analytics' | 'settings'

/**
 * Swap Dashboard Component
 * 
 * Provides a comprehensive view of user's swap activity including:
 * - Transaction history with priority level information
 * - Priority level analytics and usage statistics
 * - Settings and preferences
 * 
 * Requirements: 16.5 - Display priority level used in transaction history,
 *                     Show estimated vs actual priority fee paid,
 *                     Add analytics for priority level usage
 */
export const SwapDashboard: React.FC<SwapDashboardProps> = ({
  className = "",
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('history')
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d')
  const { wallet } = useWalletConnection()

  // Handle tab change
  const handleTabChange = useCallback((tab: DashboardTab) => {
    setActiveTab(tab)
  }, [])

  // Handle time range change
  const handleTimeRangeChange = useCallback((range: '24h' | '7d' | '30d' | 'all') => {
    setTimeRange(range)
  }, [])

  if (!wallet.connected) {
    return (
      <div className={`swap-dashboard ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity size={48} className="mx-auto mb-4 text-gray-400 opacity-50" />
            <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
            <p className="text-gray-400">
              Connect your wallet to view your swap history and analytics
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`swap-dashboard ${className}`}>
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity size={24} className="text-blue-400" />
          <h2 className="text-xl font-bold text-white">Swap Dashboard</h2>
        </div>
        
        {/* Wallet Info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm text-gray-400">Connected Wallet</div>
            <div className="text-sm font-mono text-white">
              {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
            </div>
          </div>
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 bg-[#1A1A1A] p-1 rounded-lg">
        <button
          onClick={() => handleTabChange('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-[#2B6AD1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
          }`}
        >
          <History size={16} />
          Transaction History
        </button>
        
        <button
          onClick={() => handleTabChange('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'bg-[#2B6AD1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
          }`}
        >
          <BarChart3 size={16} />
          Analytics
        </button>
        
        <button
          onClick={() => handleTabChange('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-[#2B6AD1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
          }`}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>

      {/* Time Range Selector (for analytics) */}
      {activeTab === 'analytics' && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-gray-400">Time Range:</span>
          <div className="flex items-center gap-1 bg-[#1A1A1A] p-1 rounded-lg">
            {(['24h', '7d', '30d', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => handleTimeRangeChange(range)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-[#2B6AD1] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
                }`}
              >
                {range === '24h' ? '24H' : range === '7d' ? '7D' : range === '30d' ? '30D' : 'All'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
              <div className="text-sm text-gray-400">
                Showing transactions with priority level information
              </div>
            </div>
            
            <TransactionHistory
              walletAddress={wallet.address || undefined}
              limit={20}
              className="transaction-history-tab"
            />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <PriorityLevelAnalytics
              walletAddress={wallet.address || undefined}
              timeRange={timeRange}
              className="priority-analytics-tab"
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-[#1A1A1A] border border-[#2a2a2a] rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Swap Preferences</h3>
              
              <div className="space-y-4">
                {/* Default Priority Level */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Default Priority Level</div>
                    <div className="text-xs text-gray-400">
                      Default priority level for new swaps
                    </div>
                  </div>
                  <select className="bg-[#2a2a2a] border border-[#3a3a3a] rounded px-3 py-2 text-white text-sm">
                    <option value="Low">Low (Cheapest)</option>
                    <option value="Medium">Medium</option>
                    <option value="High" selected>High (Recommended)</option>
                    <option value="VeryHigh">Very High (Fastest)</option>
                  </select>
                </div>

                {/* Dynamic Slippage */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Dynamic Slippage</div>
                    <div className="text-xs text-gray-400">
                      Let Jupiter automatically adjust slippage
                    </div>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>

                {/* Transaction Notifications */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Transaction Notifications</div>
                    <div className="text-xs text-gray-400">
                      Show notifications for completed swaps
                    </div>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>

                {/* Auto-refresh */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Auto-refresh Quotes</div>
                    <div className="text-xs text-gray-400">
                      Automatically refresh quotes every 30 seconds
                    </div>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-600 transition-colors">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1" />
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end mt-6">
                <button className="px-4 py-2 bg-[#2B6AD1] text-white rounded text-sm font-medium hover:bg-[#2B6AD1]/80 transition-colors">
                  Save Preferences
                </button>
              </div>
            </div>

            {/* Export Data */}
            <div className="bg-[#1A1A1A] border border-[#2a2a2a] rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Export Data</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Transaction History</div>
                    <div className="text-xs text-gray-400">
                      Export your complete swap transaction history
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-[#2a2a2a] text-white rounded text-sm font-medium hover:bg-[#3a3a3a] transition-colors">
                    Export CSV
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Priority Level Analytics</div>
                    <div className="text-xs text-gray-400">
                      Export priority level usage statistics
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-[#2a2a2a] text-white rounded text-sm font-medium hover:bg-[#3a3a3a] transition-colors">
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SwapDashboard