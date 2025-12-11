"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LayoutList, LayoutGrid, GanttChartSquare } from "lucide-react";

interface ProjectNavProps {
    workspaceId: string;
    slug: string;
}

export function ProjectNav({ workspaceId, slug }: ProjectNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const baseUrl = `/w/${workspaceId}/p/${slug}`;

    // Get current view from search params
    const currentView = searchParams.get('view') || 'dashboard';

    // Check if we're on the main project page
    const isProjectPage = pathname === baseUrl;

    const viewTabs = [
        {
            name: "Dashboard",
            href: `${baseUrl}?view=dashboard`,
            icon: LayoutDashboard,
            value: "dashboard"
        },
        {
            name: "List",
            href: `${baseUrl}?view=list`,
            icon: LayoutList,
            value: "list"
        },
        {
            name: "Kanban",
            href: `${baseUrl}?view=kanban`,
            icon: LayoutGrid,
            value: "kanban"
        },
        {
            name: "Gantt",
            href: `${baseUrl}?view=gantt`,
            icon: GanttChartSquare,
            value: "gantt"
        },
    ];

    return (
        <div className="border-b">
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                {/* Show view tabs only on project page */}
                {isProjectPage && viewTabs.map((tab) => {
                    const isActive = currentView === tab.value;
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                "flex h-full items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="hidden sm:inline">{tab.name}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
