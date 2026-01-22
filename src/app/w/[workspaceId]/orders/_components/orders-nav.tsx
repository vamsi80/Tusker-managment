"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProcurementNavProps {
    workspaceId: string;
}

export function OrdersNav({ workspaceId }: ProcurementNavProps) {
    const pathname = usePathname();
    const basePath = `/w/${workspaceId}/orders`;

    const tabs = [
        {
            title: "Dashboard",
            href: `${basePath}`,
            isActive: (path: string) => path === basePath
        },
        {
            title: "PO",
            href: `${basePath}/po`,
            isActive: (path: string) => path.includes('/po')
        },
    ];

    return (
        <div className="border-b">
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => {
                    const active = tab.isActive(pathname);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                "flex h-full items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0",
                                active
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            {tab.title}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
