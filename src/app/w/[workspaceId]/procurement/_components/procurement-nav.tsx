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
            title: "PO",
            href: `${basePath}/po`,
            isActive: (path: string) => path.includes('/po')
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
        <div className="flex items-center p-1 bg-muted/50 rounded-lg border w-fit">
            {tabs.map((tab) => {
                const active = tab.isActive(pathname);
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                            active
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        {tab.title}
                    </Link>
                );
            })}
        </div>
    );
}
