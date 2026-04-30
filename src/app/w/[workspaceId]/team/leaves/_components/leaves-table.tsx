"use client";

import { useEffect, useState, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Loader2, Calendar as CalendarIcon, User, Info } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface LeaveRequest {
    id: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    type: "CASUAL" | "SICK";
    createdAt: string;
    WorkspaceMember: {
        id: string;
        reportToId: string | null;
        casualLeaveBalance: number;
        sickLeaveBalance: number;
        user: {
            name: string;
            surname: string | null;
            email: string;
            image: string | null;
        };
    };
}

export function LeavesTable({
    workspaceId,
    isWorkspaceAdmin,
    workspaceRole,
    currentMemberId,
}: {
    workspaceId: string;
    isWorkspaceAdmin: boolean;
    workspaceRole: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
    currentMemberId: string;
}) {
    const isOwnerOrAdmin = workspaceRole === "OWNER" || workspaceRole === "ADMIN";
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const mounted = useMounted();

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/v1/attendance/leave-request`, {
                headers: { "x-workspace-id": workspaceId }
            });
            const data = await res.json();
            // Note: I need to make sure the GET /leave-request exists or update the existing GET / to handle leaves
            // Actually, I'll update the GET /api/v1/attendance/leave-request to return all leaves for workspace
            if (data.success) {
                setRequests(data.data);
            }
        } catch (error) {
            console.error("Failed to fetch leave requests:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [workspaceId]);

    const handleUpdateStatus = async (id: string, status: "APPROVED" | "REJECTED") => {
        try {
            const res = await fetch(`/api/v1/attendance/leave-request/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-workspace-id": workspaceId
                },
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Leave request ${status.toLowerCase()} successfully`);
                fetchRequests();
            } else {
                toast.error(data.error || `Failed to ${status.toLowerCase()} leave request`);
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const columns = useMemo<ColumnDef<LeaveRequest>[]>(() => [
        {
            id: "member",
            header: "Member",
            cell: ({ row }) => {
                const leave = row.original;
                const user = leave.WorkspaceMember?.user;
                if (!user) return <div className="text-sm italic text-muted-foreground">Unknown</div>;

                const name = user.surname || user.name || "Member";
                const initials = (user.name?.[0] || user.surname?.[0] || "M").toUpperCase();
                const image = user.image || "";

                return (
                    <Dialog>
                        <DialogTrigger asChild>
                            <div className="flex items-center gap-3 cursor-pointer group">
                                <Avatar className="h-9 w-9 border-2 border-background shadow-sm group-hover:scale-105 transition-transform">
                                    <AvatarImage src={image} alt={name} />
                                    <AvatarFallback className="bg-primary/5 text-primary font-bold">{initials}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm group-hover:text-primary transition-colors">
                                        {user.surname}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase font-bold">
                                            Bal: {leave.type === "CASUAL" ? `C:${leave.WorkspaceMember.casualLeaveBalance}` : `S:${leave.WorkspaceMember.sickLeaveBalance}`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
                            <div className="p-8 space-y-6">
                                <DialogHeader className="flex flex-row items-center gap-4">
                                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                                        <AvatarImage src={image} alt={name} />
                                        <AvatarFallback className="text-xl font-black">{initials}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <DialogTitle className="text-2xl font-black">{user.name} {user.surname}</DialogTitle>
                                        <p className="text-sm text-muted-foreground font-medium">{user.email}</p>
                                    </div>
                                </DialogHeader>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Leave Type</p>
                                        <p className="font-bold flex items-center gap-2 capitalize">
                                            <span className={cn("h-2 w-2 rounded-full", leave.type === 'SICK' ? "bg-rose-500" : "bg-blue-500")} />
                                            {leave.type.toLowerCase()} Leave
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status</p>
                                        <p className="font-bold capitalize">{leave.status.toLowerCase()}</p>
                                    </div>
                                    <div className="col-span-2 p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Duration</p>
                                        <p className="font-bold">
                                            {format(new Date(leave.startDate), "MMMM d")} - {format(new Date(leave.endDate), "MMMM d, yyyy")}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Reason for Application</p>
                                    <div className="p-5 rounded-2xl bg-muted/50 border border-dashed border-muted-foreground/20 italic text-sm leading-relaxed text-muted-foreground">
                                        "{leave.reason}"
                                    </div>
                                </div>

                                {leave.status === "PENDING" && (isOwnerOrAdmin || leave.WorkspaceMember.reportToId === currentMemberId) && (
                                    <div className="flex gap-3 pt-4">
                                        <Button
                                            className="flex-1 rounded-2xl h-12 bg-emerald-600 hover:bg-emerald-700 font-bold"
                                            onClick={() => handleUpdateStatus(leave.id, "APPROVED")}
                                        >
                                            Approve Request
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="flex-1 rounded-2xl h-12 border-rose-200 text-rose-600 hover:bg-rose-50 font-bold"
                                            onClick={() => handleUpdateStatus(leave.id, "REJECTED")}
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                );
            },
        },
        {
            id: "type",
            header: "Type",
            cell: ({ row }) => {
                const type = row.original.type;
                return (
                    <Badge variant="outline" className={cn(
                        "font-bold uppercase text-[10px] tracking-wider",
                        type === "SICK" ? "border-rose-200 text-rose-600 bg-rose-50/50" : "border-blue-200 text-blue-600 bg-blue-50/50"
                    )}>
                        {type}
                    </Badge>
                );
            }
        },
        {
            id: "dates",
            header: "Duration",
            cell: ({ row }) => {
                const start = new Date(row.original.startDate);
                const end = new Date(row.original.endDate);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            {format(start, "MMM d")} - {format(end, "MMM d, yyyy")}
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            {days} {days === 1 ? 'Day' : 'Days'}
                        </span>
                    </div>
                );
            },
        },
        {
            accessorKey: "reason",
            header: "Reason",
            cell: ({ row }) => (
                <div className="max-w-[200px] truncate text-sm text-muted-foreground group relative">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-help">{row.original.reason}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs bg-popover text-popover-foreground border shadow-xl p-3 rounded-xl">
                                <p className="text-xs leading-relaxed">{row.original.reason}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const status = row.original.status;
                let content;
                switch (status) {
                    case "APPROVED":
                        content = <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">Approved</Badge>;
                        break;
                    case "REJECTED":
                        content = <Badge variant="destructive" className="px-2.5 py-0.5 rounded-full font-bold">Rejected</Badge>;
                        break;
                    case "PENDING":
                    default:
                        content = <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 px-2.5 py-0.5 rounded-full font-bold">Pending</Badge>;
                }
                return content;
            },
        },
        {
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: ({ row }) => {
                const leave = row.original;
                const canManage = isOwnerOrAdmin || leave.WorkspaceMember.reportToId === currentMemberId;

                if (!canManage || leave.status !== "PENDING") return null;

                return (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 rounded-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all active:scale-90"
                            onClick={() => handleUpdateStatus(row.original.id, "APPROVED")}
                        >
                            <Check className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all active:scale-90"
                            onClick={() => handleUpdateStatus(row.original.id, "REJECTED")}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                );
            }
        }
    ], [isOwnerOrAdmin, currentMemberId, mounted]);

    if (!mounted) return null;

    return (
        <div className="space-y-4">
            <DataTable
                columns={columns}
                data={requests}
                isLoading={loading}
                searchKey="reason"
                searchPlaceholder="Search by reason..."
            />
        </div>
    );
}
