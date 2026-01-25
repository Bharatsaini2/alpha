import { useState } from "react"
import Sidebar from "./Sidebar"
import Header from "./Header"

interface AppLayoutProps {
    children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    return (
        <div className="app">
            <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(false)} />
            <div className="main">
                <Header onOpenSidebar={() => setIsSidebarOpen(true)} />
                <section className="content">
                    {children}
                </section>
            </div>
        </div>
    )
}
