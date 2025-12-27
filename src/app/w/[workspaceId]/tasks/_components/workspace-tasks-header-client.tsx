"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { LayoutList, LayoutGrid, GanttChartSquare } from "lucide-react";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { CreateTaskForm } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/create-task-form";
import { CreateSubTaskForm } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/create-subTask-form";

interface WorkspaceTasksHeaderClientProps {
    workspaceId: string;
    projects: { id: string; name: string; }[];
    members: ProjectMembersType;
    tags: { id: string; name: string; }[];
    parentTasks: { id: string; name: string; projectId: string; }[];
    permissions: {
        isWorkspaceAdmin: boolean;
        canCreateTasks: boolean;
        canCreateSubTasks: boolean;
    };
}

/**
 * Workspace Tasks Header Client Component
 * 
 * Shows title, view navigation tabs, and permission-based create buttons
 */
export function WorkspaceTasksHeaderClient({
    workspaceId,
    projects,
    members,
    tags,
    parentTasks,
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
        console.error('Permissions object is undefined in WorkspaceTasksHeaderClient');
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

    // Show create buttons only if user has permission and required data
    const showCreateSubTask = permissions.canCreateSubTasks && parentTasks.length > 0;
    const showCreateTask = permissions.canCreateTasks && projects.length > 0;

    return (
        <div className="space-y-4">
            {/* Title and Action Buttons */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">All Tasks</h1>
                    <p className="text-muted-foreground">
                        View and manage tasks across all projects
                    </p>
                </div>

                {/* Create Buttons - Permission-based */}
                {(showCreateSubTask || showCreateTask) && (
                    <div className="flex items-center gap-3">
                        {showCreateSubTask && (
                            <CreateSubTaskForm
                                workspaceId={workspaceId}
                                members={members}
                                level="workspace"
                                tags={tags}
                                parentTasks={parentTasks}
                                projects={projects}
                            />
                        )}
                        {showCreateTask && (
                            <CreateTaskForm
                                workspaceId={workspaceId}
                                level="workspace"
                                projects={projects}
                            />
                        )}
                    </div>
                )}
            </div>

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
