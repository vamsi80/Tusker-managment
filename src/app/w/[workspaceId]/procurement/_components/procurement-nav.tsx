"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProcurementNavProps {
    workspaceId: string;
}

export function ProcurementNav({ workspaceId }: ProcurementNavProps) {
    const pathname = usePathname();
    const basePath = `/w/${workspaceId}/procurement`;

    const tabs = [
        {
            title: "Dashboard",
            href: `${basePath}`,
            isActive: (path: string) => path === basePath
        },
        {
            title: "Tasks",
            href: `${basePath}/Tasks`,
            isActive: (path: string) => path.includes('/Tasks') || path.includes('/tasks')
        },
        {
            title: "Indent",
            href: `${basePath}/indent`,
            isActive: (path: string) => path.includes('/indent')
        },
        {
            title: "Deliveries",
            href: `${basePath}/deliveries`,
            isActive: (path: string) => path.includes('/deliveries')
        },
        {
            title: "GRN",
            href: `${basePath}/grn`,
            isActive: (path: string) => path.includes('/grn')
        }
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
