
import React from "react"
import { Navbar } from "./_components/navbar"
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function LayoutMain({ children }: { children: React.ReactNode }) {
    // Get session if exists, but don't require it
    const session = await auth.api.getSession({
        headers: await headers()
    });

    return (
        <div>
            <Navbar session={session} />
            <main className="container mx-auto px-4 md:px-6 lg:px-8 mb-32">
                {children}
            </main>
        </div>
    )
}
