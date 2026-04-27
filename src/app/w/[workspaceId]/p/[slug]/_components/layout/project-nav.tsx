"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LayoutList, LayoutGrid, GanttChartSquare, Folder } from "lucide-react";
import { useTransition } from "react";
import { CreateTaskForm } from "../forms/create-task-form";
import { BulkUploadForm } from "../forms/bulk-upload-form";

interface ProjectNavProps {
    workspaceId: string;
    slug: string;
    projectId: string;
    projectName: string;
    projectColor: string | null;
    userRole?: string;
    canPerformBulkOperations: boolean;
}

export function ProjectNav({ 
    workspaceId, 
    slug,
    projectId,
    projectName,
    projectColor,
    userRole,
    canPerformBulkOperations 
}: ProjectNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const baseUrl = `/w/${workspaceId}/p/${slug}`;

    const currentView = searchParams.get('view') || 'dashboard';

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

    const handleViewChange = (href: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (isPending) return;
        startTransition(() => {
            router.push(href);
        });
    };

    return (
        <div className={cn("border-b mt-2", isPending && "opacity-60 pointer-events-none transition-opacity")}>
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 px-3 border-r border-border/50 h-full flex-shrink-0">
                    <div 
                        className="h-3 w-3 rounded-full border shadow-sm shrink-0" 
                        style={{ backgroundColor: projectColor || '#888' }}
                    />
                    <span className="text-sm font-bold truncate max-w-[150px]">{projectName}</span>
                    {userRole && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/20 shrink-0">
                            {userRole}
                        </span>
                    )}
                </div>

                {isProjectPage && viewTabs.map((tab) => {
                    const isActive = currentView === tab.value;
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            prefetch={false}
                            scroll={false}
                            onClick={(e) => handleViewChange(tab.href, e)}
                            className={cn(
                                "flex h-full items-center gap-2 border-b-2 px-2 sm:px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0 cursor-pointer",
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

                <div className="ml-auto flex items-center gap-2 pr-2">
                    {canPerformBulkOperations && (
                        <>
                            <BulkUploadForm projectId={projectId} />
                            <CreateTaskForm
                                workspaceId={workspaceId}
                                projectId={projectId}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
