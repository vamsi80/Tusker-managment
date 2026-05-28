"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Settings2, History, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { useState, useEffect } from "react";

interface SettingsNavProps {
    workspaceId: string;
}

export function SettingsNav({ workspaceId }: SettingsNavProps) {
    const pathname = usePathname();
    const router = useSafeNavigation();
    const isPending = router.isNavigating;
    const baseUrl = `/w/${workspaceId}/settings`;

    const navTabs = [
        {
            name: "General",
            href: baseUrl,
            icon: Settings2,
            activeMatch: (path: string) => path === baseUrl
        },
        {
            name: "Activity Log",
            href: `${baseUrl}/activity`,
            icon: History,
            activeMatch: (path: string) => path === `${baseUrl}/activity`
        },
    ];

    const handleNavChange = (href: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (isPending || pathname === href) return;
        router.push(href);
    };

    return (
        <div className={cn("border-b mb-6", isPending && "opacity-60 pointer-events-none transition-opacity")}>
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 px-3 h-full flex-shrink-0">
                    <Settings2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-bold">Settings</span>
                </div>

                {navTabs.map((tab) => {
                    const isActive = tab.activeMatch(pathname);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            prefetch={false}
                            onClick={(e) => handleNavChange(tab.href, e)}
                            className={cn(
                                "flex h-full items-center gap-2 border-b-2 px-2 sm:px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0 cursor-pointer",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            <Icon className="size-3" />
                            <span className="text-xs sm:text-xs">{tab.name}</span>
                        </Link>
                    );
                })}

                <div className="ml-auto flex items-center gap-3 pr-2 flex-shrink-0">
                    <div className={cn(
                        "flex items-center justify-center size-8 rounded-md border border-border/60 bg-background/50 transition-all duration-500 flex-shrink-0",
                        isPending && "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/10"
                    )}>
                        <RefreshCw className={cn("h-3.5 w-3.5 transition-all duration-500", isPending ? "text-primary animate-spin" : "text-muted-foreground/40")} />
                    </div>
                </div>
            </div>
        </div>
    );
}
