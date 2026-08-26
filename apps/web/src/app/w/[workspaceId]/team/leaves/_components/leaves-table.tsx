"use client";

import { useEffect, useState, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { countDateOnlyDays, formatDateOnly, toDateOnly } from "@tusker/core/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Check, X, Loader2, Calendar as CalendarIcon, User, Info, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTeamQueryStore } from "@/lib/store/team-query-store";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { LeaveRequestDialog } from "../../_components/leave-request-dialog";

interface LeaveRequest {
    id: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "DELETED";
    type: "CASUAL" | "SICK";
    createdAt: string;
    surname: string;
    name: string;
    email: string;
    image: string | null;
    workspaceMemberId: string;
    reportToId: string | null;
    casualLeaveBalance: number;
    sickLeaveBalance: number;
    processedByName?: string | null;
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
    const [totalCount, setTotalCount] = useState(0);
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    
    // Dialog state
    const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPageIndex(0); // Reset to first page when search changes
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const mounted = useMounted();

    // Helper to flatten Prisma records into the shape the table expects
    const flattenRecord = (r: any) => {
        if (!r) return r;
        // If it's already flat (has surname), return it
        if (r.surname) return r;
        // If it's nested (Prisma), flatten it
        return {
            ...r,
            surname: r.WorkspaceMember?.user?.surname || "User",
            email: r.WorkspaceMember?.user?.email || "",
            casualLeaveBalance: r.WorkspaceMember?.casualLeaveBalance || 0,
            sickLeaveBalance: r.WorkspaceMember?.sickLeaveBalance || 0,
            processedByName: r.processedBy?.user?.surname || r.processedByName || null,
        };
    };

    useEffect(() => {
        const handler = (e: any) => {
            const { action, record, oldRecord } = e.detail || {};
            const flatRecord = flattenRecord(record);

            console.log(`[LeavesTable][SURGICAL_V2] 🔄 Event received: ${action}`, {
                record: flatRecord,
                original: record
            });

            // 1. Handle New Requests
            if (flatRecord && action === "LEAVE_REQUESTED") {
                setRequests(prev => {
                    if (prev.some(r => r.id === flatRecord.id)) return prev;
                    return [flatRecord, ...prev];
                });
                setTotalCount(prev => prev + 1);
                return;
            }

            // 2. Handle Updates
            const updateActions = ["LEAVE_UPDATED", "LEAVE_STATUS_CHANGED", "LEAVE_APPROVED", "LEAVE_REJECTED", "LEAVE_DELETED"];
            if (flatRecord && updateActions.includes(action)) {
                setRequests(prev => prev.map(r => r.id === flatRecord.id ? flatRecord : r));
                return;
            }

            // ⛔ BLOCK Fallback for all known leave actions to prevent the 10-item fetch
            if (action?.startsWith("LEAVE_")) {
                console.log(`[LeavesTable] ✅ Surgical update complete for ${action}. No fetch required.`);
                return;
            }

            // Fallback only for generic/unknown changes
            if (action === "team_update" || !action) {
                console.log(`[LeavesTable] ⚠️ Unknown action, falling back to fetch...`);
                fetchRequests(true, true);
            }
        };
        window.addEventListener("realtime-sync-refresh", handler);
        return () => window.removeEventListener("realtime-sync-refresh", handler);
    }, [workspaceId, pageIndex, pageSize]);

    const { setIsQuerying } = useTeamQueryStore();

    const fetchRequests = async (force = false, silent = false) => {
        try {
            setIsQuerying(true);
            if (!silent) setLoading(true);
            const res = await fetch(`/api/v1/attendance/leave-request?page=${pageIndex + 1}&pageSize=${pageSize}&search=${encodeURIComponent(debouncedSearch)}`, {
                headers: { "x-workspace-id": workspaceId }
            });
            const data = await res.json();
            if (data.success) {
                setRequests(data.data);
                setTotalCount(data.totalCount || 0);
            } else {
                console.error("API returned error:", data.error);
                toast.error("Failed to load leave requests");
            }
        } catch (error) {
            console.error("Failed to fetch leave requests:", error);
        } finally {
            setLoading(false);
            setIsQuerying(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [workspaceId, pageIndex, pageSize, debouncedSearch]);

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
                // Rely on real-time event for UI update
            } else {
                toast.error(data.error || `Failed to ${status.toLowerCase()} leave request`);
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const handleDeleteRequest = async (id: string) => {
        if (!confirm("Are you sure you want to delete this leave request?")) return;
        try {
            const res = await fetch(`/api/v1/attendance/leave-request/${id}`, {
                method: "DELETE",
                headers: {
                    "x-workspace-id": workspaceId
                }
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Leave request deleted successfully");
                setIsDialogOpen(false);
            } else {
                toast.error(data.error || "Failed to delete leave request");
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
                const initials = (leave.name?.[0] || leave.surname?.[0]).toUpperCase();

                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                            <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm transition-colors">
                                {leave.surname}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase font-medium">
                                    Bal: {leave.type === "CASUAL" ? `C:${leave.casualLeaveBalance}` : `S:${leave.sickLeaveBalance}`}
                                </span>
                            </div>
                        </div>
                    </div>
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
                        "font-medium uppercase text-[10px] tracking-wider",
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
                // Stored as calendar days, so render and count them in UTC —
                // new Date(...) + format() would shift the day for some viewers.
                const start = toDateOnly(row.original.startDate)!;
                const end = toDateOnly(row.original.endDate)!;
                const days = countDateOnlyDays(start, end);
                const isSingleDay = start.getTime() === end.getTime();

                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                            <CalendarIcon className="size-3.5 text-muted-foreground" />
                            {isSingleDay
                                ? formatDateOnly(start, "MMM d, yyyy")
                                : `${formatDateOnly(start, "MMM d")} - ${formatDateOnly(end, "MMM d, yyyy")}`}
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
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
                        content = <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">Approved</Badge>;
                        break;
                    case "REJECTED":
                        content = <Badge variant="destructive" className="px-2.5 py-0.5 rounded-full font-medium">Rejected</Badge>;
                        break;
                    case "DELETED":
                        content = <Badge className="bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 border-slate-500/20 px-2.5 py-0.5 rounded-full font-medium">Deleted</Badge>;
                        break;
                    case "PENDING":
                    default:
                        content = <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 px-2.5 py-0.5 rounded-full font-medium">Pending</Badge>;
                }
                return content;
            },
        },
        {
            id: "processedBy",
            header: "Processed By",
            cell: ({ row }) => {
                const processedByName = row.original.processedByName;
                if (!processedByName) return <span className="text-muted-foreground text-[10px]">—</span>;
                return (
                    <div className="flex items-center gap-1.5">
                        <User className="size-3 text-muted-foreground" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">{processedByName}</span>
                    </div>
                );
            }
        },
        {
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: ({ row }) => {
                const leave = row.original;
                const canManage = isOwnerOrAdmin || leave.reportToId === currentMemberId;

                if (!canManage || leave.status !== "PENDING") return null;

                return (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="size-8 p-0 rounded-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all active:scale-90"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(row.original.id, "APPROVED");
                            }}
                        >
                            <Check className="size-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="size-8 p-0 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all active:scale-90"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(row.original.id, "REJECTED");
                            }}
                        >
                            <X className="size-4" />
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
                searchKey="member"
                searchPlaceholder="Search by member..."
                pageIndex={pageIndex}
                pageSize={pageSize}
                rowCount={totalCount}
                manualPagination={true}
                manualFiltering={true}
                onRowClick={(row) => {
                    setSelectedLeave(row);
                    setIsDialogOpen(true);
                }}
                onPaginationChange={(p) => {
                    setPageIndex(p.pageIndex);
                    setPageSize(p.pageSize);
                }}
                onFilterChange={(filters) => {
                    const searchFilter = filters.find(f => f.id === "member");
                    const searchValue = searchFilter?.value as string || "";
                    setSearch(searchValue);
                }}
            />

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
                    {selectedLeave && (() => {
                        const leave = selectedLeave;
                        const initials = (leave.name?.[0] || leave.surname?.[0])?.toUpperCase() || "?";
                        
                        return (
                            <div className="p-8 space-y-6">
                                <DialogHeader className="flex flex-row items-start justify-between gap-4 w-full pr-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="size-16 border-2 border-primary/20">
                                            <AvatarFallback className="text-xl font-medium">{initials}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <DialogTitle className="text-2xl font-medium">{leave.name} {leave.surname}</DialogTitle>
                                            <p className="text-sm text-muted-foreground font-medium">{leave.email}</p>
                                        </div>
                                    </div>
                                    
                                    {leave.status === "PENDING" && leave.workspaceMemberId === currentMemberId && (
                                        <div className="flex items-center gap-1">
                                            <LeaveRequestDialog workspaceId={workspaceId} initialData={leave} onSuccess={() => setIsDialogOpen(false)}>
                                                <Button size="icon" variant="ghost" className="size-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                                    <Pencil className="size-4" />
                                                </Button>
                                            </LeaveRequestDialog>
                                            <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                className="size-9 rounded-full text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                                onClick={() => handleDeleteRequest(leave.id)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    )}
                                </DialogHeader>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">Leave Type</p>
                                        <p className="font-medium flex items-center gap-2 capitalize">
                                            <span className={cn("size-2 rounded-full", leave.type === 'SICK' ? "bg-rose-500" : "bg-blue-500")} />
                                            {leave.type.toLowerCase()} Leave
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">Status</p>
                                        <p className="font-medium capitalize">{leave.status.toLowerCase()}</p>
                                    </div>
                                    <div className="col-span-2 p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">Duration</p>
                                        <p className="font-medium">
                                            {formatDateOnly(leave.startDate, "MMMM d")} - {formatDateOnly(leave.endDate, "MMMM d, yyyy")}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">Reason for Application</p>
                                    <div className="p-5 rounded-2xl bg-muted/50 border border-dashed border-muted-foreground/20 italic text-sm leading-relaxed text-muted-foreground">
                                        "{leave.reason}"
                                    </div>
                                </div>
                                
                                {leave.status !== "PENDING" && leave.status !== "DELETED" && leave.processedByName && (
                                    <div className="p-4 rounded-2xl bg-muted/30 border border-muted-foreground/5 space-y-1">
                                        <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-widest">
                                            {leave.status === "APPROVED" ? "Approved By" : "Rejected By"}
                                        </p>
                                        <p className="font-medium">{leave.processedByName}</p>
                                    </div>
                                )}
                                
                                {leave.status === "DELETED" && (
                                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                                        <p className="text-sm font-medium text-rose-600 text-center">This leave request was deleted.</p>
                                    </div>
                                )}

                                {leave.status === "PENDING" && (isOwnerOrAdmin || leave.reportToId === currentMemberId) && (
                                    <div className="flex gap-3 pt-4">
                                        <Button
                                            className="flex-1 rounded-2xl h-12 bg-emerald-600 hover:bg-emerald-700 font-medium"
                                            onClick={() => {
                                                handleUpdateStatus(leave.id, "APPROVED");
                                                setIsDialogOpen(false);
                                            }}
                                        >
                                            Approve Request
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="flex-1 rounded-2xl h-12 border-rose-200 text-rose-600 hover:bg-rose-50 font-medium"
                                            onClick={() => {
                                                handleUpdateStatus(leave.id, "REJECTED");
                                                setIsDialogOpen(false);
                                            }}
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                )}


                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
