"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { LayoutList, LayoutGrid, GanttChartSquare } from "lucide-react";
interface WorkspaceTasksHeaderClientProps {
    workspaceId: string;
    permissions: {
        isWorkspaceAdmin: boolean;
        canCreateTasks: boolean;
        canCreateSubTasks: boolean;
    } | null;
}

/**
 * Workspace Tasks Header Client Component
 * 
 * Shows title, view navigation tabs, and permission-based create buttons
 */
export function WorkspaceTasksHeaderClient({
    workspaceId,
    permissions,
}: WorkspaceTasksHeaderClientProps) {
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'list';
    const baseUrl = `/w/${workspaceId}/tasks`;

    const viewTabs = [
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

    // Safety check for permissions
    if (!permissions) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">All Tasks</h1>
                        <p className="text-muted-foreground">
                            View and manage tasks across all projects
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* View Tabs */}
            <div className="border-b">
                <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                    {viewTabs.map((tab) => {
                        const isActive = currentView === tab.value;
                        const Icon = tab.icon;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                prefetch={true}
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
        </div>
    );
}
