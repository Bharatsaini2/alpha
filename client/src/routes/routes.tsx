import { Route, Routes } from "react-router-dom"
import { MainLayout } from "../components/layouts"
import {
  HomePage,
  TopCoinsPage,
  KOLFeedPage,
  TopKOLCoinsPage,
  WhalesLeaderboardPage,
  SignalEnginePage,
} from "../pages"
import NotFound from "../components/common/NotFound"
import TransactionDetail from "../pages/transaction/TransactionDetail"
import AuthCallback from "../pages/auth/AuthCallback"
import { ProtectedRoute } from "../components/common/ProtectedRoute"
import KolFeedProfile from "../pages/home/KolFeedProfile"
import ProfilePage from "../pages/home/ProfilePage"
import TelegramSubscription from "../pages/home/TelegramSubscription"


const AppRoutes = () => {
  return (
    <Routes>
      {/* Auth callback routes */}
      <Route
        path="/auth/callback"
        element={
          <ProtectedRoute requireAuth={false}>
            <AuthCallback />
          </ProtectedRoute>
        }
      />

      {/* Main app routes with sidebar */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="top-coins" element={<TopCoinsPage />} />
        <Route path="kol-feed" element={<KOLFeedPage />} />
        <Route path="top-kol-coins" element={<TopKOLCoinsPage />} />
        <Route path="whales-leaderboard" element={<WhalesLeaderboardPage />} />
        <Route path="signal-engine" element={<SignalEnginePage />} />
        <Route path="transaction/:id" element={<TransactionDetail />} />

          {/* New */}
         <Route path="kol-feed-profile" element={<KolFeedProfile />} />
         <Route path="profile-page" element={<ProfilePage />} />
         <Route path="telegram-subscription" element={<TelegramSubscription />} />
        
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes
