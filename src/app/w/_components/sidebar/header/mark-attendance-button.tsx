"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AttendanceLogger } from "@/app/w/[workspaceId]/team/attendance/_components/attendance-logger";

export function MarkAttendanceButton({ workspaceId }: { workspaceId: string }) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all active:scale-95 cursor-pointer">
                            <LogIn className="h-4 w-4" />
                            <span className="sr-only">Mark Attendance</span>
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] font-medium">
                    <p>Mark Daily Attendance</p>
                </TooltipContent>
            </Tooltip>
            <DialogContent showCloseButton={false} className="p-0 border-none bg-transparent shadow-none max-w-md w-full">
                <DialogTitle className="sr-only">Mark Attendance</DialogTitle>
                <DialogDescription className="sr-only">
                    Open the attendance logger to check in or out for the day.
                </DialogDescription>
                <div className="bg-card text-card-foreground shadow-lg sm:rounded-xl overflow-hidden border">
                    <AttendanceLogger workspaceId={workspaceId} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
