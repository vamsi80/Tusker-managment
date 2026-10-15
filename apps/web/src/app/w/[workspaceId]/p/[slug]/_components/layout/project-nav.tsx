"use client";

import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { LayoutGrid, List, Columns3, ChartGantt, ShoppingCart, Package } from "lucide-react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { can } from "@tusker/core/lib/constants/capabilities";
import { CreateTaskForm } from "../forms/create-task-form";
import { BulkUploadForm } from "../forms/bulk-upload-form";
import { PROJECT_CATEGORY_LABELS } from "@tusker/core/lib/zodSchemas";
import type { ProjectCategory } from "@tusker/core/types/project";

interface ProjectNavProps {
    workspaceId: string;
    slug: string;
    projectId: string;
    projectName: string;
    projectColor: string | null;
    projectCategory?: ProjectCategory | null;
    userRole?: string;
    canPerformBulkOperations: boolean;
}

export function ProjectNav({ 
    workspaceId, 
    slug,
    projectId,
    projectName,
    projectColor,
    projectCategory,
    userRole,
    canPerformBulkOperations 
}: ProjectNavProps) {
    const pathname = usePathname();
    const capabilities = useWorkspaceLayout().data?.permissions?.capabilities;
    const baseUrl = `/w/${workspaceId}/p/${slug}`;

    const viewMatch = pathname.match(new RegExp(`^/w/[^/]+/p/[^/]+/([^/]+)`));
    const currentView = viewMatch ? viewMatch[1] : 'dashboard';

    const isProjectPage = pathname.startsWith(baseUrl);

    const viewTabs = [
        {
            name: "Dashboard",
            href: `${baseUrl}/dashboard`,
            icon: LayoutGrid,
            value: "dashboard"
        },
        {
            name: "List",
            href: `${baseUrl}/list`,
            icon: List,
            value: "list"
        },
        {
            name: "Kanban",
            href: `${baseUrl}/kanban`,
            icon: Columns3,
            value: "kanban"
        },
        {
            name: "Gantt",
            href: `${baseUrl}/gantt`,
            icon: ChartGantt,
            value: "gantt"
        },
        {
            name: "Procurement",
            href: `${baseUrl}/procurement`,
            icon: ShoppingCart,
            value: "procurement",
            capability: "procurement:view" as const
        },
        {
            name: "Materials",
            href: `${baseUrl}/materials`,
            icon: Package,
            value: "materials"
        },
    ].filter((tab) => !tab.capability || can(capabilities, tab.capability));

    return (
        <PageHeader
            title={
                <span className="flex flex-wrap items-center gap-3">
                    <span
                        className="size-3.5 rounded-full shadow-sm shrink-0"
                        style={{ backgroundColor: projectColor || '#888' }}
                    />
                    <span className="truncate">{projectName}</span>
                    {projectCategory && (
                        <Badge variant="muted" className="font-sans">{PROJECT_CATEGORY_LABELS[projectCategory]}</Badge>
                    )}
                    {userRole && (
                        <Badge variant="warning" className="font-sans uppercase tracking-wide">{userRole}</Badge>
                    )}
                </span>
            }
            nav={
                isProjectPage && (
                    <SegmentedNav
                        items={viewTabs.map((tab) => ({
                            label: tab.name,
                            href: tab.href,
                            icon: tab.icon,
                            active: currentView === tab.value,
                        }))}
                    />
                )
            }
            actions={
                canPerformBulkOperations && (
                    <>
                        <BulkUploadForm projectId={projectId} />
                        <CreateTaskForm
                            workspaceId={workspaceId}
                            projectId={projectId}
                        />
                    </>
                )
            }
        />
    );
}
