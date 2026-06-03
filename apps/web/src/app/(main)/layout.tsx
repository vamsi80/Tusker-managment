import React from "react"
import { Navbar } from "./_components/navbar"

export default function LayoutMain({ children }: { children: React.ReactNode }) {
    return (
        <div>
            {/* The Navbar will fetch its own session on the client side */}
            <Navbar />
            <main className="w-full px-4 md:px-6 lg:px-8 mb-32">
                {children}
            </main>
        </div>
    )
}
