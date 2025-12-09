"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProjectNavProps {
    workspaceId: string;
    slug: string;
}

export function ProjectNav({ workspaceId, slug }: ProjectNavProps) {
    const pathname = usePathname();
    const baseUrl = `/w/${workspaceId}/p/${slug}`;

    const tabs = [
        { name: "Dashboard", href: `${baseUrl}` },
        { name: "Tasks", href: `${baseUrl}/task` },
    ];

    return (
        <div className="border-b">
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => {
                    const isActive = pathname === tab.href;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                "flex h-full items-center border-b-2 px-4 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            {tab.name}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
