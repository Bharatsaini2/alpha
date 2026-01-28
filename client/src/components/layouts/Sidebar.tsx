import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"
import { usePremiumAccess } from "../../contexts/PremiumAccessContext"

import SideIcon1 from "../../assets/alpha.svg"
import SideIcon2 from "../../assets/sd2.svg"
import SideIcon3 from "../../assets/sd3.svg"
import SideIcon4 from "../../assets/sd4.svg"
import SideIcon5 from "../../assets/sd5.svg"
import SideIcon6 from "../../assets/sd6.svg"
import tele from "../../assets/telegram.png"
import x from "../../assets/twitter.svg"
import LogoutRounded from "../../assets/LogoutRounded.png"
import { User, Star } from "lucide-react"

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, logout } = useAuth()
  const { validateAccess } = usePremiumAccess()
  const navigate = useNavigate()

  const navigationItems = [
    {
      category: "Alpha Whales",
      items: [
        { name: "Alpha Stream", path: "/", icon: SideIcon1 },
        { name: "Top Coins", path: "/top-coins", icon: SideIcon2 },
      ],
    },
    {
      category: "Influencer Intel",
      items: [
        { name: "KOL Feed", path: "/kol-feed", icon: SideIcon3 },
        { name: "Top KOL Coins", path: "/top-kol-coins", icon: SideIcon4 },
      ],
    },
    {
      category: "Alpha Insights",
      items: [
        {
          name: "Whales Leaderboard",
          path: "/whales-leaderboard",
          icon: SideIcon5,
        },
        { name: "Signal Engine", path: "/signal-engine", icon: SideIcon6 },
        { name: "Subscription", path: "/telegram-subscription", icon: Star, isLucide: true },
      ],
    },
  ]

  const isActiveRoute = (path: string) => {
    if (path === "/") {
      // Check if we're on the home page OR if we're on a transaction page with type=whale
      return (
        location.pathname === "/" ||
        (location.pathname.startsWith("/transaction/") &&
          searchParams.get("type") === "whale")
      )
    } else if (path === "/kol-feed") {
      return (
        location.pathname === "/kol-feed" ||
        (location.pathname.startsWith("/transaction/") &&
          searchParams.get("type") === "kol")
      )
    }
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        fixed lg:static inset-y-0 right-0 lg:left-0 z-50 w-64 bg-[#111113] border-l lg:border-r lg:border-l-0 border-[#222222]
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="w-full flex items-center justify-start">
            <img
              onClick={() => {
                window.location.href = "https://alpha-block.ai"
              }}
              src="/al.png"
              alt="Alpha AI"
              className="w-55 h-auto px-8 pt-4 pb-4 cursor-pointer"
            />
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 px-4 py-6 space-y-6">
            {navigationItems.map((section) => (
              <div key={section.category}>
                <h3 className="text-white text-xs font-semibold  tracking-wider text-left mb-3 px-3">
                  {section.category}
                </h3>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = isActiveRoute(item.path)
                    const isSubscription = item.path === "/telegram-subscription"

                    if (isSubscription) {
                      return (
                        <div
                          key={item.name}
                          onClick={() => {
                            validateAccess(() => {
                              navigate(item.path)
                              if (window.innerWidth < 1024) {
                                onToggle()
                              }
                            })
                          }}
                          className={`
                            relative flex items-center justify-start space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left w-full cursor-pointer
                            ${isActive
                              ? "text-white bg-[#2B2B2D]"
                              : "text-[#B4B4B4] hover:text-white"
                            }
                          `}
                        >
                          {item.isLucide ? (
                            <item.icon
                              className={`w-5 h-5 ${isActive ? "text-white" : "text-[#767678]"}`}
                            />
                          ) : (
                            <img
                              src={item.icon as string}
                              alt={item.name}
                              className="w-5 h-5 object-contain"
                            />
                          )}
                          <span className={isActive ? "text-white" : "text-[#B4B4B4]"}>
                            {item.name}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => {
                          if (window.innerWidth < 1024) {
                            onToggle()
                          }
                        }}
                        className={`
                            relative flex items-center justify-start space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left w-full
                            ${isActive
                            ? "text-white bg-[#2B2B2D]"
                            : "text-[#B4B4B4] hover:text-white"
                          }
                          `}
                      >
                        {item.isLucide ? (

                          <item.icon
                            className={`w-5 h-5 ${isActive ? "text-white" : "text-[#767678]"}`}
                          />
                        ) : (
                          <img
                            src={item.icon as string}
                            alt={item.name}
                            className="w-5 h-5 object-contain"
                          />
                        )}
                        <span className={isActive ? "text-white" : "text-[#B4B4B4]"}>
                          {item.name}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom Section */}
          <div className="px-4 border-b border-[#2B2B2D] py-3 bg-[#1B1B1D]">
            {user ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#2B2B2D] flex items-center justify-center">
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt="User"
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="text-white text-sm md:text-base font-medium truncate"
                      title={
                        user?.displayName ||
                        user?.email?.split("@")[0] ||
                        user?.walletAddress ||
                        "Anonymous"
                      }
                    >
                      {user?.displayName ||
                        (user?.email ? user.email.split("@")[0] : null) ||
                        (user?.walletAddress
                          ? `${user.walletAddress.slice(0, 3)}...${user.walletAddress.slice(-3)}`
                          : null) ||
                        "Anonymous"}
                    </span>
                    <span
                      className="text-gray-400 text-xs truncate"
                      title={user?.email || ""}
                    >
                      {user?.email || ""}
                    </span>
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="flex items-center space-x-1 cursor-pointer"
                >
                  <img
                    src={LogoutRounded}
                    alt="Logout"
                    className="w-4 h-4 md:w-5 md:h-5"
                  />
                  <span className="text-white text-sm font-medium">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                Sign in
              </div>
            )}
          </div>
          <div className="flex items-center justify-evenly space-x-2 p-4">
            <img
              src={tele}
              alt="Telegram"
              className="w-5 h-5 md:w-8 md:h-8 cursor-pointer opacity-70 hover:opacity-100 transition-opacity duration-300"
              onClick={() => {
                window.open("https://t.me/AlphaBlockAI", "_blank")
              }}
            />
            <span className="border-l border-[#3B3B3D] h-full" />
            <img
              src={x}
              alt="X"
              className="w-5 h-5 md:w-8 md:h-8 cursor-pointer opacity-70 hover:opacity-100 transition-opacity duration-300"
              onClick={() => {
                window.open("https://x.com/alphablockai?s=21", "_blank")
              }}
            />
          </div>
        </div >
      </div >
    </>
  )
}

export default Sidebar
