"use client";

import { PlusCircle } from "lucide-react";
import { CreateSubTaskForm } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/create-subTask-form";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface QuickCreateSubTaskProps {
    workspaceId: string;
    data: {
        permissions: { canCreateSubTasks: boolean };
        parentTasks: any[];
        members: any[];
        tags: any[];
        projects: any[];
    } | null;
}

/**
 * Quick Create SubTask button in sidebar
 * Receives workspace data as props and opens CreateSubTaskForm at workspace level
 */
export function QuickCreateSubTask({ workspaceId, data }: QuickCreateSubTaskProps) {
    // Only show if user has permission and there are parent tasks
    if (!data || !data.permissions.canCreateSubTasks || data.parentTasks.length === 0) {
        return null;
    }

    return (
        <CreateSubTaskForm
            workspaceId={workspaceId}
            members={data.members as any}
            tags={data.tags}
            parentTasks={data.parentTasks}
            projects={data.projects}
            level="workspace"
            customTrigger={
                <SidebarMenuButton
                    tooltip="Quick Create SubTask"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear shadow-sm cursor-pointer"
                    asChild
                >
                    <Button className="w-full justify-start h-auto p-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-0">
                        <PlusCircle size={20} />
                        <span className="font-semibold">Quick Create SubTask</span>
                    </Button>
                </SidebarMenuButton>
            }
        />
    );
}
