"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AttendanceLogger } from "@/app/w/[workspaceId]/team/attendance/_components/attendance-logger";

export function MarkAttendanceButton({ workspaceId }: { workspaceId: string }) {
    const [open, setOpen] = useState(false);
    // Checked in and not yet out: the arrow points out of the door.
    const [checkedIn, setCheckedIn] = useState(false);

    useEffect(() => {
        fetch(`/api/v1/attendance/today`, { headers: { "x-workspace-id": workspaceId } })
            .then((res) => res.json())
            .then((data) => setCheckedIn(!!data?.data?.checkIn && !data?.data?.checkOut))
            .catch(() => {});

        const onSync = (e: Event) => {
            const { action, isActor } = (e as CustomEvent).detail || {};
            if (!isActor) return;
            if (action === "CHECKED_IN") setCheckedIn(true);
            if (action === "CHECKED_OUT") setCheckedIn(false);
        };
        window.addEventListener("realtime-attendance-sync", onSync);
        return () => window.removeEventListener("realtime-attendance-sync", onSync);
    }, [workspaceId]);

    const label = checkedIn ? "Check Out" : "Check In";
    const Icon = checkedIn ? LogOut : LogIn;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button
                            size="icon-lg"
                            className="bg-foreground text-background shadow-md hover:bg-foreground/85 active:scale-95"
                        >
                            <Icon className="size-[18px]" />
                            <span className="sr-only">{label}</span>
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] font-medium">
                    <p>{label}</p>
                </TooltipContent>
            </Tooltip>
            <DialogContent showCloseButton={false} className="p-0 border-none bg-transparent shadow-none max-w-md w-full">
                <DialogTitle className="sr-only">Mark Attendance</DialogTitle>
                <DialogDescription className="sr-only">
                    Open the attendance logger to check in or out for the day.
                </DialogDescription>
                <AttendanceLogger workspaceId={workspaceId} />
            </DialogContent>
        </Dialog>
    );
}
