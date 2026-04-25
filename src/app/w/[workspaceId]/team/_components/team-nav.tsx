"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTransition } from "react";
import { Users, Clock, Settings2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

interface TeamNavProps {
    workspaceId: string;
    isAdmin: boolean;
}

export function TeamNav({ workspaceId, isAdmin }: TeamNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const baseUrl = `/w/${workspaceId}/team`;

    const navTabs = [
        {
            name: "Members",
            href: baseUrl,
            icon: Users,
            activeMatch: (path: string) => path === baseUrl
        },
        {
            name: "Attendance",
            href: `${baseUrl}/attendance`,
            icon: Clock,
            activeMatch: (path: string) => path === `${baseUrl}/attendance`
        },
        ...(isAdmin ? [{
            name: "Settings",
            href: `${baseUrl}/settings`,
            icon: Settings2,
            activeMatch: (path: string) => path === `${baseUrl}/settings`
        }] : []),
    ];

    const handleNavChange = (href: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (isPending || pathname === href) return;
        startTransition(() => {
            router.push(href);
        });
    };

    return (
        <div className={cn("border-b mt-2", isPending && "opacity-60 pointer-events-none transition-opacity")}>
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
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
                                "flex h-full items-center gap-2 border-b-2 px-2 sm:px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            <Icon className="h-3 w-3" />
                            <span className="text-xs sm:text-xs">{tab.name}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
