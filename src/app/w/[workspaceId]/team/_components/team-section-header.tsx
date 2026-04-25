"use client";

import { usePathname } from "next/navigation";
import { AdminActionsClient } from "./admin-actions-client";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { AttendanceLogger } from "../attendance/_components/attendance-logger";

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
    const isAdmin = layoutData?.permissions?.isWorkspaceAdmin || false;

    const isAttendance = pathname.endsWith("/attendance");

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h1 className="text-2xl font-normal leading-tight tracking-tighter md:text-2xl">
                {isAttendance ? "Attendance" : "Team"}
            </h1>

            <div className="flex items-center gap-2">
                {isAttendance ? (
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button size="sm" className="gap-2">
                                <LogIn className="h-4 w-4" />
                                Mark Attendance
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-sm">
                            <AttendanceLogger workspaceId={workspaceId} />
                        </DialogContent>
                    </Dialog>
                ) : (
                    <AdminActionsClient workspaceId={workspaceId} isAdmin={isAdmin} />
                )}
            </div>
        </div>
    );
}
