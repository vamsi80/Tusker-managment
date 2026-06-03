"use client"

import dynamic from "next/dynamic"
import { Bell } from "lucide-react"

// This wrapper is a Client Component, so it's allowed to use next/dynamic with ssr: false
export const NotificationCenterWrapper = dynamic(
    () => import("./notification-center").then(m => m.NotificationCenter),
    {
        ssr: false,
        loading: () => (
            <div className="relative size-9 rounded-full flex items-center justify-center cursor-pointer">
                <Bell className="h-[18px] w-[18px] text-muted-foreground/30 animate-pulse" />
            </div>
        )
    }
)

