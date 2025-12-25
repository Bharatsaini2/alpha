import Sidebar from "./Sidebar"
import Header from "./Header"

interface AppLayoutProps {
    children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
    return (
        <div className="app">
            <Sidebar />
            <div className="main">
                <Header />
                <section className="content">
                    {children}
                </section>
            </div>
        </div>
    )
}
