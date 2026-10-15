"use client";

import { useSearchParams } from "next/navigation";
import { List, Columns3, ChartGantt } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";

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
 * Shows the page title and the List / Kanban / Gantt view switcher.
 */
export function WorkspaceTasksHeaderClient({
    workspaceId,
    permissions,
}: WorkspaceTasksHeaderClientProps) {
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'list';
    const baseUrl = `/w/${workspaceId}/tasks`;

    const viewTabs = [
        { label: "List", value: "list", icon: List },
        { label: "Kanban", value: "kanban", icon: Columns3 },
        { label: "Gantt", value: "gantt", icon: ChartGantt },
    ];

    return (
        <PageHeader
            title="Tasks"
            nav={
                permissions && (
                    <SegmentedNav
                        items={viewTabs.map((tab) => ({
                            label: tab.label,
                            href: `${baseUrl}?view=${tab.value}`,
                            icon: tab.icon,
                            active: currentView === tab.value,
                        }))}
                    />
                )
            }
        />
    );
}
