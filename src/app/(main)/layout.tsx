
import React from "react"
import { Navbar } from "./_components/navbar"
import { getSession } from "@/lib/auth/require-user";

export default async function LayoutMain({ children }: { children: React.ReactNode }) {
    // Get session if exists, but don't require it
    const session = await getSession();

    return (
        <div>
            <Navbar session={session} />
            <main className="container mx-auto px-4 md:px-6 lg:px-8 mb-32">
                {children}
            </main>
        </div>
    )
}
