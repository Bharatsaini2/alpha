import { useState, useEffect } from "react"
import { Outlet } from "react-router-dom"
import AuthManager from "../auth/AuthManager"
import { usePageTitle } from "../../hooks/usePageTitle"
import Sidebar from "../alpha-stream/Sidebar"
import Header from "../alpha-stream/Header"

const MainLayout = () => {
  const [_sidebarOpen, setSidebarOpen] = useState(false)

  // Use the custom hook to manage page titles
  usePageTitle()

  useEffect(() => {
    setSidebarOpen(false)
  }, [window.location.pathname])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSidebarOpen(false)
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [])

  const [mobileSidebar, setMobileSidebar] = useState(false);
  


  return (
    <>
    <div className="app">
      <Sidebar  mobileSidebar={mobileSidebar}
  setMobileSidebar={setMobileSidebar}/>
      <div className="main">
        <Header setMobileSidebar={setMobileSidebar}/>
        <section className="content">
          <Outlet />
        </section>
      </div>
      <AuthManager />
    </div>
    </>
  )
}

export default MainLayout
