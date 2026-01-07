"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface MaterialNavProps {
    workspaceId: string;
}

export function MaterialNav({ workspaceId }: MaterialNavProps) {
    const pathname = usePathname();
    const basePath = `/w/${workspaceId}/inventory`;

    const tabs = [
        {
            title: "Inventory",
            href: `${basePath}`,
            isActive: (path: string) => path === basePath
        },
        {
            title: "Vendor",
            href: `${basePath}/vendors`,
            isActive: (path: string) => path.includes('/vendors')
        }
    ];

    return (
        <div className="flex items-center p-1 bg-muted/50 rounded-lg border">
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
