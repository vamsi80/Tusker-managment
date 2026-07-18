"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { APP_DATE_FORMAT, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserMinus, Loader2, LogIn, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { AttendanceLogger } from "./attendance-logger";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Clock, Filter, X, Calendar as CalendarIcon } from "lucide-react";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { useWorkspaceMemberStore, useRealtimeMemberSync, EMPTY_ARRAY } from "@/lib/store/workspace-member-store";
import { useTeamQueryStore } from "@/lib/store/team-query-store";

interface AttendanceRecord {
    id: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    status: string;
    isOvertime: boolean;
    checkInLatitude: number | null;
    checkInLongitude: number | null;
    checkOutLatitude: number | null;
    checkOutLongitude: number | null;
    checkInAddress: string | null;
    checkOutAddress: string | null;
    notes: string | null;
    checkInNotes: string | null;
    checkOutNotes: string | null;
    WorkspaceMember: {
        id: string;
        casualLeaveBalance: number;
        sickLeaveBalance: number;
        user: {
            name: string;
            surname: string;
            email: string;
        };
    };
}

export function AttendanceTable({
    workspaceId,
    isWorkspaceAdmin,
    workspaceRole,
}: {
    workspaceId: string;
    isWorkspaceAdmin: boolean;
    workspaceRole: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
}) {
    const isPowerUser = isWorkspaceAdmin || workspaceRole === "MANAGER";
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPageIndex(0); // Reset to first page when search changes
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const [selectedDate, setSelectedDate] = useState(new Date());

    // Main filters state (synced with API)
    const [activeFilters, setActiveFilters] = useState<{
        from: Date | undefined;
        to: Date | undefined;
        memberId: string[];
        status: string[];
    }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
        memberId: [],
        status: [],
    });

    // Helper to flatten Prisma records into the shape the table expects
    const flattenRecord = (r: any) => {
        if (!r) return r;
        // If it's already flat (has memberSurname), return it
        if (r.memberSurname) return r;
        // If it's nested (Prisma), flatten it
        return {
            ...r,
            memberSurname: r.WorkspaceMember?.user?.surname || "User",
            memberEmail: r.WorkspaceMember?.user?.email || "",
            workspaceMember: r.WorkspaceMember
        };
    };

    useEffect(() => {
        const handler = (e: any) => {
            const { action, record, oldRecord } = e.detail || {};
            const flatRecord = flattenRecord(record);

            console.log(`[AttendanceTable][SURGICAL_V2] 🔄 Event received: ${action}`, {
                record: flatRecord,
                original: record
            });

            // 1. Handle New Check-ins
            if (flatRecord && action === "CHECKED_IN") {
                setRecords(prev => {
                    if (prev.some(r => r.id === flatRecord.id)) return prev;
                    return [flatRecord, ...prev];
                });
                setTotalCount(prev => prev + 1);
                return;
            }

            // 2. Handle Updates (Check-outs, etc.)
            const updateActions = ["CHECKED_OUT", "ATTENDANCE_UPDATED"];
            if (flatRecord && updateActions.includes(action)) {
                setRecords(prev => prev.map(r => r.id === flatRecord.id ? flatRecord : r));
                return;
            }

            // 3. Handle Deletions
            if (action === "ATTENDANCE_DELETED") {
                const deletedId = record?.id || oldRecord?.id;
                if (deletedId) {
                    setRecords(prev => prev.filter(r => r.id !== deletedId));
                    setTotalCount(prev => Math.max(0, prev - 1));
                    return;
                }
            }

            // ⛔ BLOCK Fallback for all known attendance actions to prevent the fetch
            if (action?.startsWith("ATTENDANCE_") || action?.startsWith("CHECKED_")) {
                console.log(`[AttendanceTable] ✅ Surgical update complete for ${action}. No fetch required.`);
                return;
            }

            // Fallback for unknown structural changes
            if (action === "team_update" || !action) {
                console.log(`[AttendanceTable] ⚠️ Unknown action, falling back to fetch...`);
                fetchRecords(true, true);
            }
        };
        window.addEventListener("realtime-attendance-sync", handler);
        return () => window.removeEventListener("realtime-attendance-sync", handler);
    }, [workspaceId, pageIndex, pageSize, activeFilters]);

    // Local state for the filter popover
    const [tempFilters, setTempFilters] = useState(activeFilters);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const mounted = useMounted();

    // Use the slim members list for filters to ensure ALL members are available without performance burden
    const slimMembers = useWorkspaceMemberStore(
        useShallow((state) => state.slimMembersByWorkspace[workspaceId] || EMPTY_ARRAY)
    );

    // Subscribe to real-time updates for this workspace
    useRealtimeMemberSync(workspaceId);

    // Fetch slim members for filter (robust & fast)
    useEffect(() => {
        useWorkspaceMemberStore.getState().fetchSlimMembers(workspaceId);
    }, [workspaceId]);



    // Memoize options from slim members
    const memberOptions = useMemo(() => {
        if (!slimMembers.length) return [];
        return slimMembers
            .map(m => ({
                label: `${m.surname || ""}`.trim(),
                value: m.id
            }));
    }, [slimMembers]);

    const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());

    const handleMonthChange = (direction: 'prev' | 'next') => {
        const newDate = direction === 'prev' ? subMonths(selectedDate, 1) : addMonths(selectedDate, 1);
        setSelectedDate(newDate);
        setActiveFilters(prev => ({
            ...prev,
            from: startOfMonth(newDate),
            to: endOfMonth(newDate)
        }));
    };

    const { setIsQuerying } = useTeamQueryStore();

    const fetchRecords = useCallback(async (force = false, silent = false) => {
        try {
            setIsQuerying(true);
            console.log(`[AttendanceTable] Fetching records with filters:`, {
                workspaceId,
                from: activeFilters.from?.toISOString(),
                to: activeFilters.to?.toISOString(),
                memberId: activeFilters.memberId,
                status: activeFilters.status,
                silent
            });
            if (!silent) setLoading(true);
            const params = new URLSearchParams();
            if (activeFilters.from && isValidDate(activeFilters.from)) params.append("startDate", activeFilters.from.toISOString());
            if (activeFilters.to && isValidDate(activeFilters.to)) params.append("endDate", activeFilters.to.toISOString());
            if (activeFilters.memberId.length > 0) params.append("memberId", JSON.stringify(activeFilters.memberId));
            if (activeFilters.status.length > 0) params.append("status", JSON.stringify(activeFilters.status));
            if (debouncedSearch) params.append("search", debouncedSearch);
            params.append("page", (pageIndex + 1).toString());
            params.append("pageSize", pageSize.toString());

            const url = `/api/v1/attendance?${params.toString()}${force ? '&refresh=true' : ''}`;
            const res = await fetch(url, {
                headers: { "x-workspace-id": workspaceId },
                cache: 'no-store' // Ensure we don't get cached browser results
            });
            const data = await res.json();
            if (data.success) {
                console.log(`[AttendanceTable] Records successfully loaded: ${data.data?.length || 0} items`);
                setRecords(data.data || []);
                setTotalCount(data.totalCount || 0);
            } else {
                console.error("[AttendanceTable] API returned error:", data.error);
                toast.error(data.error || "Failed to load records");
            }
        } catch (error) {
            console.error("[AttendanceTable] Fetch exception:", error);
            toast.error("Failed to load attendance records");
        } finally {
            setLoading(false);
            setIsQuerying(false);
        }
    }, [
        workspaceId,
        pageIndex,
        pageSize,
        activeFilters.from?.getTime(),
        activeFilters.to?.getTime(),
        activeFilters.memberId,
        activeFilters.status,
        debouncedSearch,
        setIsQuerying
    ]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    // Sync temp filters with active filters when popover opens
    useEffect(() => {
        if (isFilterOpen) {
            setTempFilters(activeFilters);
        }
    }, [isFilterOpen, activeFilters]);

    const columns = useMemo<ColumnDef<AttendanceRecord>[]>(() => [
        {
            id: "memberId",
            accessorKey: "WorkspaceMember.user.name",
            header: "Member",
            meta: { className: "min-w-[200px]" },
            cell: ({ row }) => {
                const user = row.original.WorkspaceMember?.user;
                if (!user) return <div className="text-sm italic text-muted-foreground">Unknown Member</div>;
                const initials = (user.surname?.[0]).toUpperCase();
                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                            <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm text-foreground">
                                {user.surname}
                            </span>
                            <span className="text-[10px] text-muted-foreground/80 truncate max-w-[140px]">
                                {user.email}
                            </span>
                        </div>
                    </div>
                );
            },
        },
        {
            accessorKey: "date",
            header: "Date",
            meta: { className: "min-w-[120px]" },
            cell: ({ row }) => {
                if (!mounted) return "...";
                try {
                    const d = new Date(row.original.date);
                    if (!isValidDate(d)) return <span className="text-xs text-muted-foreground italic">Invalid Date</span>;
                    return (
                        <div className="text-sm text-foreground/80">
                            {format(d, APP_DATE_FORMAT)}
                        </div>
                    );
                } catch (e) {
                    return <span className="text-xs text-rose-500 italic">Error</span>;
                }
            },
        },
        {
            accessorKey: "checkIn",
            header: "Check-In",
            meta: { className: "min-w-[110px]" },
            cell: ({ row }) => {
                if (!mounted) return "...";
                const checkIn = row.original.checkIn;
                if (!checkIn) return <div className="text-xs text-muted-foreground italic">—</div>;
                try {
                    const d = new Date(checkIn);
                    if (!isValidDate(d)) return <div className="text-xs text-muted-foreground italic">—</div>;
                    return (
                        <div className="flex flex-col items-start">
                            <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                                <Clock className="size-3.5" />
                                {format(d, "hh:mm a")}
                            </div>
                        </div>
                    );
                } catch (e) {
                    return <div className="text-xs text-muted-foreground italic">—</div>;
                }
            },
        },
        {
            id: "inLocation",
            header: "In-Location",
            meta: { className: "min-w-[150px]" },
            cell: ({ row }) => {
                const lat = row.original.checkInLatitude;
                const lng = row.original.checkInLongitude;
                const address = row.original.checkInAddress;
                const hasNote = !!row.original.notes;

                if (!lat || !lng) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="flex justify-start">
                        <a
                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "flex items-center gap-1.5 text-[10px] hover:underline transition-all group",
                                hasNote ? "text-rose-600 font-medium" : "text-primary/70 hover:text-primary"
                            )}
                            title={address || `Raw coordinates: ${lat}, ${lng}`}
                        >
                            <MapPin className={cn("size-3 shrink-0 group-hover:scale-110 transition-transform", hasNote ? "text-rose-600" : "text-rose-500")} />
                            <span className="truncate uppercase tracking-tighter max-w-[120px]">
                                {hasNote ? "Other Location" : (address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)}
                            </span>
                        </a>
                    </div>
                );
            },
        },
        {
            accessorKey: "checkOut",
            header: "Check-Out",
            meta: { className: "min-w-[110px]" },
            cell: ({ row }) => {
                if (!mounted) return "...";
                const checkIn = row.original.checkIn;
                const checkOut = row.original.checkOut;
                if (!checkOut) return <div className="text-xs text-muted-foreground italic">—</div>;

                try {
                    const dIn = checkIn ? new Date(checkIn) : null;
                    const dOut = new Date(checkOut);
                    if (!isValidDate(dOut)) return <div className="text-xs text-muted-foreground italic">—</div>;

                    const isNextDay = (dIn && isValidDate(dIn) &&
                        (dOut.getDate() !== dIn.getDate() || dOut.getMonth() !== dIn.getMonth())) ||
                        row.original.notes?.includes("test-night");

                    return (
                        <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-1.5 text-sm text-rose-600">
                                <Clock className="size-3.5" />
                                {format(dOut, "hh:mm a")}
                                {isNextDay && (
                                    <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] font-medium border-amber-200 bg-amber-50 text-amber-600">
                                        +1 DAY
                                    </Badge>
                                )}
                            </div>
                        </div>
                    );
                } catch (e) {
                    return <div className="text-xs text-muted-foreground italic">—</div>;
                }
            },
        },
        {
            id: "outLocation",
            header: "Out-Location",
            meta: { className: "min-w-[150px]" },
            cell: ({ row }) => {
                const lat = row.original.checkOutLatitude;
                const lng = row.original.checkOutLongitude;
                const address = row.original.checkOutAddress;
                const hasNote = !!row.original.notes;

                if (!lat || !lng) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="flex justify-start">
                        <a
                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "flex items-center gap-1.5 text-[10px] hover:underline transition-all group",
                                hasNote ? "text-rose-600 font-medium" : "text-primary/70 hover:text-primary"
                            )}
                            title={address || `Raw coordinates: ${lat}, ${lng}`}
                        >
                            <MapPin className={cn("size-3 shrink-0 group-hover:scale-110 transition-transform", hasNote ? "text-rose-600" : "text-rose-500")} />
                            <span className="truncate uppercase tracking-tighter max-w-[120px]">
                                {hasNote ? "Other Location" : (address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)}
                            </span>
                        </a>
                    </div>
                );
            },
        },
        {
            id: "duration",
            header: "Duration",
            meta: { className: "min-w-[100px]" },
            cell: ({ row }) => {
                if (!mounted) return "...";
                const checkIn = row.original.checkIn;
                const checkOut = row.original.checkOut;

                if (!checkIn || !checkOut) return <div className="text-xs text-muted-foreground italic">—</div>;

                try {
                    const start = new Date(checkIn);
                    const end = new Date(checkOut);

                    if (!isValidDate(start) || !isValidDate(end)) return <div className="text-xs text-muted-foreground italic">—</div>;

                    const diffMs = end.getTime() - start.getTime();
                    if (isNaN(diffMs) || diffMs < 0) return <div className="text-xs text-muted-foreground italic">—</div>;

                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                    return (
                        <div className="flex items-center gap-1.5 font-medium text-sm text-primary/80">
                            <Clock className="size-3.5" />
                            {diffHrs}h {diffMins}m
                        </div>
                    );
                } catch (e) {
                    return <div className="text-xs text-muted-foreground italic">—</div>;
                }
            }
        },
        {
            accessorKey: "status",
            header: "Status",
            meta: { className: "min-w-[120px]" },
            cell: ({ row }) => {
                const status = row.original.status;
                let content;
                switch (status) {
                    case "PRESENT":
                        content = <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 font-medium">Present</Badge>;
                        break;
                    case "ABSENT":
                        content = <Badge variant="destructive" className="font-medium">Absent</Badge>;
                        break;
                    case "LATE":
                        content = <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">Late</Badge>;
                        break;
                    case "HALF_DAY":
                        content = <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20 font-medium">Half Day</Badge>;
                        break;
                    case "ON_LEAVE":
                        content = <Badge className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20 font-medium">On Leave</Badge>;
                        break;
                    default:
                        content = <Badge variant="outline" className="font-medium">{status}</Badge>;
                }
                return (
                    <div className="flex justify-start items-center gap-2">
                        {content}
                        {row.original.isOvertime && (
                            <Badge className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20 px-1.5 py-0 text-[10px] font-medium">
                                OT
                            </Badge>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "checkInNotes",
            header: "In-Notes",
            meta: { className: "min-w-[150px]" },
            cell: ({ row }) => {
                const notes = row.original.checkInNotes;
                if (!notes) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="max-w-[150px] truncate text-xs font-medium text-foreground/60" title={notes}>
                        {notes}
                    </div>
                );
            },
        },
        {
            accessorKey: "checkOutNotes",
            header: "Out-Notes",
            meta: { className: "min-w-[150px]" },
            cell: ({ row }) => {
                const notes = row.original.checkOutNotes;
                if (!notes) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="max-w-[150px] truncate text-xs font-medium text-foreground/60" title={notes}>
                        {notes}
                    </div>
                );
            },
        },
    ], [mounted]);

    const stats = useMemo(() => {
        const counts = { present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, total: records.length };
        records.forEach(r => {
            if (r.status === "PRESENT") counts.present++;
            if (r.status === "LATE") counts.late++;
            if (r.status === "HALF_DAY") counts.halfDay++;
            if (r.status === "ABSENT") counts.absent++;
            if (r.status === "ON_LEAVE") counts.leave++;
        });
        return counts;
    }, [records]);

    const selectedMember = useMemo(() => {
        if (activeFilters.memberId.length !== 1) return null;
        return slimMembers.find((m: any) => m.id === activeFilters.memberId[0]);
    }, [slimMembers, activeFilters.memberId]);

    const handleApplyFilters = () => {
        setActiveFilters(tempFilters);
        setIsFilterOpen(false);
    };

    const handleResetFilters = () => {
        const reset = {
            from: undefined,
            to: undefined,
            memberId: [],
            status: [],
        };
        setTempFilters(reset);
        setActiveFilters(reset);
        setIsFilterOpen(false);
    };

    const activeFilterCount = useMemo(() => {
        let count = 0;
        count += activeFilters.memberId.length;
        count += activeFilters.status.length;
        if (activeFilters.from || activeFilters.to) count++;
        return count;
    }, [activeFilters]);

    const [isReconciling, setIsReconciling] = useState(false);

    const handleReconcile = async () => {
        try {
            setIsReconciling(true);
            const res = await fetch("/api/v1/attendance/reconcile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-workspace-id": workspaceId
                },
                body: JSON.stringify({ date: new Date().toISOString() })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Successfully reconciled. Marked ${data.data.count} members as absent.`);
                fetchRecords();
            } else {
                toast.error(data.error || "Failed to reconcile attendance");
            }
        } catch (error) {
            toast.error("An error occurred during reconciliation");
        } finally {
            setIsReconciling(false);
        }
    };

    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloadPopoverOpen, setIsDownloadPopoverOpen] = useState(false);
    const [downloadDate, setDownloadDate] = useState(new Date());

    const handleDownloadAttendance = async () => {
        try {
            setIsDownloading(true);
            const year = downloadDate.getFullYear();
            const month = downloadDate.getMonth() + 1;
            const res = await fetch(`/api/v1/attendance/export?year=${year}&month=${month}`, {
                headers: { "x-workspace-id": workspaceId }
            });
            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to download attendance");
                return;
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Attendance_${year}_${month}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Attendance downloaded successfully");
            setIsDownloadPopoverOpen(false);
        } catch (error) {
            toast.error("An error occurred while downloading attendance");
        } finally {
            setIsDownloading(false);
        }
    };

    const extraToolbarContent = (
        <div className="flex items-center gap-2">
            <Dialog>
                <DialogTrigger asChild>
                    <Button
                        size="sm"
                        className="h-9 px-3 gap-2 bg-primary hover:bg-primary/90 shadow-sm transition-all active:scale-95"
                    >
                        <LogIn className="size-4" />
                        <span className="font-medium text-sm hidden sm:inline">Mark Attendance</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-sm">
                    <DialogTitle className="sr-only">Mark Attendance</DialogTitle>
                    <AttendanceLogger workspaceId={workspaceId} />
                </DialogContent>
            </Dialog>

            {isPowerUser && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReconcile}
                    disabled={isReconciling}
                    className="h-9 px-3 gap-2 border-dashed border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                    {isReconciling ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <UserMinus className="size-4" />
                    )}
                    <span className="font-medium text-sm hidden sm:inline">Mark Absents</span>
                </Button>
            )}

            {isWorkspaceAdmin && (
                <Popover open={isDownloadPopoverOpen} onOpenChange={setIsDownloadPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                            <CalendarDays className="size-4" />
                            <span className="font-medium text-sm hidden sm:inline">Download</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="end">
                        <div className="flex flex-col gap-3">
                            <h4 className="text-sm font-medium">Download Attendance</h4>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setDownloadDate(subMonths(downloadDate, 1))}>
                                    <ChevronLeft className="size-4" />
                                </Button>
                                <span className="font-medium text-sm min-w-[100px] text-center">
                                    {format(downloadDate, "MMMM yyyy")}
                                </span>
                                <Button variant="outline" size="icon" onClick={() => setDownloadDate(addMonths(downloadDate, 1))}>
                                    <ChevronRight className="size-4" />
                                </Button>
                            </div>
                            <Button 
                                onClick={handleDownloadAttendance} 
                                disabled={isDownloading}
                                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}
                                Download Excel
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            )}

            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="gap-2 relative h-9 px-3 border shadow-sm hover:bg-accent/50 transition-colors"
                    >
                        <Filter className="size-4" />
                        <span className="font-medium text-sm">Filters</span>
                        {activeFilterCount > 0 && (
                            <Badge
                                variant="destructive"
                                className="absolute -top-2 -right-2 size-5 rounded-full p-0 flex items-center justify-center text-[10px] font-medium shadow-md animate-in zoom-in"
                            >
                                {activeFilterCount}
                            </Badge>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[calc(100vw-2rem)] sm:w-[500px] p-0 overflow-hidden rounded-xl border-none shadow-2xl shadow-black/20"
                    align="end"
                    side="bottom"
                    sideOffset={8}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
                        <div className="flex items-center gap-2">
                            <Filter className="size-4 text-primary" />
                            <h3 className="text-base font-medium text-foreground">Filters</h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsFilterOpen(false)}
                            className="size-8 p-0 rounded-full hover:bg-background/80"
                        >
                            <X className="size-4" />
                        </Button>
                    </div>

                    {/* Content - Scrollable */}
                    <div className="max-h-[65vh] overflow-y-auto p-5 custom-scrollbar bg-background/50 backdrop-blur-sm">
                        {/* Filters Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">

                            {/* Member Filter */}
                            {isPowerUser && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">Member</h4>
                                        {tempFilters.memberId.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTempFilters(prev => ({ ...prev, memberId: [] }))}
                                                className="h-auto p-0 text-[10px] font-medium text-primary hover:text-primary/80 hover:bg-transparent"
                                            >
                                                CLEAR
                                            </Button>
                                        )}
                                    </div>
                                    <MultiSelectFilter
                                        selected={tempFilters.memberId}
                                        onChange={(values) => setTempFilters(prev => ({ ...prev, memberId: values }))}
                                        options={memberOptions}
                                        placeholder="All Members"
                                        searchPlaceholder="Search members..."
                                        triggerClassName="h-10 bg-background/50 border-muted-foreground/20 focus:ring-primary/20"
                                    />
                                </div>
                            )}

                            {/* Status Filter */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">Status</h4>
                                    {tempFilters.status.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTempFilters(prev => ({ ...prev, status: [] }))}
                                            className="h-auto p-0 text-[10px] font-medium text-primary hover:text-primary/80 hover:bg-transparent"
                                        >
                                            CLEAR
                                        </Button>
                                    )}
                                </div>
                                <MultiSelectFilter
                                    selected={tempFilters.status}
                                    onChange={(values) => setTempFilters(prev => ({ ...prev, status: values }))}
                                    options={[
                                        { value: "PRESENT", label: "Present" },
                                        { value: "ABSENT", label: "Absent" },
                                        { value: "LATE", label: "Late" },
                                        { value: "HALF_DAY", label: "Half Day" },
                                        { value: "ON_LEAVE", label: "On Leave" },
                                    ]}
                                    placeholder="All Statuses"
                                    searchPlaceholder="Search statuses..."
                                    triggerClassName="h-10 bg-background/50 border-muted-foreground/20 focus:ring-primary/20"
                                />
                            </div>

                            {/* Date Range Filter */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">Date Range</h4>
                                    {(tempFilters.from || tempFilters.to) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTempFilters(prev => ({
                                                ...prev,
                                                from: undefined,
                                                to: undefined
                                            }))}
                                            className="h-auto p-0 text-[10px] font-medium text-primary hover:text-primary/80 hover:bg-transparent"
                                        >
                                            RESET
                                        </Button>
                                    )}
                                </div>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal h-10 px-3 bg-background/50 border-muted-foreground/20 hover:bg-accent/30",
                                                !tempFilters.from && !tempFilters.to && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                                            <span className="truncate text-sm">
                                                {tempFilters.from && tempFilters.to ? (
                                                    <>{format(tempFilters.from, "MMM d")} - {format(tempFilters.to, "MMM d")}</>
                                                ) : tempFilters.from ? (
                                                    <>{format(tempFilters.from, "MMM d")} - ...</>
                                                ) : (
                                                    "Pick dates"
                                                )}
                                            </span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-xl overflow-hidden" align="start">
                                        <div className="bg-background">
                                            <ShadcnCalendar
                                                mode="range"
                                                selected={{
                                                    from: tempFilters.from,
                                                    to: tempFilters.to,
                                                }}
                                                onSelect={(range) => {
                                                    setTempFilters(prev => ({
                                                        ...prev,
                                                        from: range?.from,
                                                        to: range?.to,
                                                    }));
                                                }}
                                                initialFocus
                                                className="p-3"
                                            />
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center gap-3 border-t bg-muted/20 px-5 py-4">
                        <Button
                            variant="ghost"
                            onClick={handleResetFilters}
                            className="flex-1 font-medium text-sm h-10 hover:bg-background/80"
                        >
                            Reset All
                        </Button>
                        <Button
                            onClick={handleApplyFilters}
                            className="flex-[2] font-medium text-sm h-10 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
                        >
                            Apply Filters
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );

    if (!mounted) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-10 space-y-6">
                <DataTable
                    columns={columns}
                    data={records}
                    isLoading={loading}
                    searchKey="memberId"
                    searchPlaceholder="Search members..."
                    extraToolbarContent={extraToolbarContent}
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    rowCount={totalCount}
                    manualPagination={true}
                    manualFiltering={true}
                    containerClassName="max-h-[calc(100vh-300px)]"
                    onPaginationChange={(p) => {
                        setPageIndex(p.pageIndex);
                        setPageSize(p.pageSize);
                    }}
                    onFilterChange={(filters) => {
                        const searchFilter = filters.find(f => f.id === "memberId");
                        const searchValue = searchFilter?.value as string || "";
                        setSearch(searchValue);
                    }}
                />
            </div>

            <div className="lg:col-span-2 sticky top-6">
                <div className="space-y-6">
                    {/* Month Navigator - Clean Full Width Style */}
                    <div className="flex items-center justify-between px-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                            onClick={() => handleMonthChange('prev')}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-foreground tracking-tight">
                                {format(selectedDate, "MMMM yyyy")}
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                            onClick={() => handleMonthChange('next')}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>

                    {/* Main Stats Card */}
                    <div className="p-4 rounded-xl border bg-card/30 backdrop-blur-md border-muted-foreground/20 relative overflow-hidden group shadow-sm">
                        <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                            <CalendarDays className="size-4 text-primary" />
                            Summary
                        </h3>

                        <div>
                            <div className="flex items-center justify-between rounded-lg">
                                <span className="text-sm font-medium text-muted-foreground">Total:</span>
                                <span className="text-lg font-normal tabular-nums">{stats.total}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg">
                                <span className="text-sm font-medium text-emerald-600/70">On Time:</span>
                                <span className="text-lg font-normal tabular-nums text-emerald-600">{stats.present}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg">
                                <span className="text-sm font-medium text-amber-600/70">Late:</span>
                                <span className="text-lg font-normal tabular-nums text-amber-600">{stats.late}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg">
                                <span className="text-sm font-medium text-orange-600/70">Half Day:</span>
                                <span className="text-lg font-normal tabular-nums text-orange-600">{stats.halfDay}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg">
                                <span className="text-sm font-medium text-purple-600/70">Leave:</span>
                                <span className="text-lg font-normal tabular-nums text-purple-600">{stats.leave}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg">
                                <span className="text-sm font-medium text-rose-600/70">Absent:</span>
                                <span className="text-lg font-normal tabular-nums text-rose-600">{stats.absent}</span>
                            </div>
                        </div>
                    </div>

                    {/* Member Specific Balances */}
                    {selectedMember && (
                        <div className="p-4 rounded-lg border bg-card/30 backdrop-blur-md border-muted-foreground/20">
                            <h3 className="text-sm font-normal uppercase tracking-widest text-muted-foreground/80 mb-4 flex items-center gap-2">
                                Leave Balances
                            </h3>
                            <div className="space-y-0">
                                <div className="flex items-center justify-between">
                                    <div className="text-[13px] font-medium uppercase tracking-tighter text-purple-600/70 mb-1">Casual Leave</div>
                                    <div className="text-lg font-normal text-purple-600">
                                        {Math.max(0, selectedMember.casualLeaveBalance || 0)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="text-[13px] font-medium uppercase tracking-tighter text-blue-600/70 mb-1">Sick Leave</div>
                                    <div className="text-lg font-normal text-blue-600">
                                        {Math.max(0, selectedMember.sickLeaveBalance || 0)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
