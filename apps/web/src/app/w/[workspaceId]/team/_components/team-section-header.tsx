"use client";

import { usePathname } from "next/navigation";
import { AdminActionsClient } from "./admin-actions-client";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";

interface TeamSectionHeaderProps {
    workspaceId: string;
}

/**
 * TeamSectionHeader
 * Client component that displays dynamic titles and actions based on the current route.
 */
export function TeamSectionHeader({ workspaceId }: TeamSectionHeaderProps) {
    const { data: layoutData } = useWorkspaceLayout();
    const pathname = usePathname();
    const isAdmin = layoutData?.permissions?.isWorkspaceAdmin;
    const isAttendance = pathname.endsWith("/attendance");

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h1 className="text-2xl font-normal leading-tight tracking-tighter md:text-2xl">
                {isAttendance ? "Attendance" : "Team"}
            </h1>

            <div className="flex items-center gap-2">
                {!isAttendance && (
                    <AdminActionsClient workspaceId={workspaceId} isAdmin={isAdmin} />
                )}
            </div>
        </div>
    );
}
