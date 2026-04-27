"use client";

import { useEffect, useState, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { APP_DATE_FORMAT, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { UserMinus, Loader2, LogIn } from "lucide-react";
import { AttendanceLogger } from "./attendance-logger";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Clock, Filter, X, Calendar as CalendarIcon, Timer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    WorkspaceMember: {
        id: string;
        user: {
            name: string;
            surname: string | null;
            email: string;
        };
    };
}

export function AttendanceTable({ workspaceId }: { workspaceId: string }) {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [members, setMembers] = useState<{ label: string; value: string }[]>([]);

    // Main filters state (synced with API)
    const [activeFilters, setActiveFilters] = useState<{
        from: Date | undefined;
        to: Date | undefined;
        memberId: string | undefined;
        status: string | undefined;
    }>(() => {
        const today = new Date();
        const start = new Date(today.setHours(0, 0, 0, 0));
        const end = new Date(today.setHours(23, 59, 59, 999));
        return {
            from: start,
            to: end,
            memberId: undefined,
            status: undefined,
        };
    });

    // Local state for the filter popover
    const [tempFilters, setTempFilters] = useState(activeFilters);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const mounted = useMounted();

    // Fetch members for filter
    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const res = await apiClient.workspaces.getMembers(workspaceId);
                if (res && res.workspaceMembers) {
                    const options = res.workspaceMembers
                        .filter(m => m.workspaceRole !== "OWNER" && m.workspaceRole !== "ADMIN")
                        .map(m => ({
                            label: m.user?.surname || m.user?.name || "Unknown Member",
                            value: m.id
                        }));
                    setMembers(options);
                }
            } catch (error) {
                console.error("Failed to fetch members:", error);
            }
        };
        fetchMembers();
    }, [workspaceId]);

    const fetchRecords = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (activeFilters.from) params.append("startDate", activeFilters.from.toISOString());
            if (activeFilters.to) params.append("endDate", activeFilters.to.toISOString());
            if (activeFilters.memberId) params.append("memberId", activeFilters.memberId);
            if (activeFilters.status) params.append("status", activeFilters.status);

            const res = await fetch(`/api/v1/attendance?${params.toString()}`, {
                headers: { "x-workspace-id": workspaceId }
            });
            const data = await res.json();
            if (data.success) {
                setRecords(data.data);
            }
        } catch (error) {
            console.error("Failed to fetch attendance records:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, [workspaceId, activeFilters]);

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
            cell: ({ row }) => {
                const user = row.original.WorkspaceMember?.user;
                if (!user) return <div className="text-sm italic text-muted-foreground">Unknown Member</div>;

                const name = user.surname || "Member";
                const initials = (user.name?.[0] || user.surname?.[0] || "M").toUpperCase();
                const image = (user as any).image || "";

                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={image} alt={name} />
                            <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">
                                {user.name} {user.surname}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
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
            cell: ({ row }) => {
                if (!mounted) return "...";
                return (
                    <div className="font-medium text-sm">
                        {format(new Date(row.original.date), APP_DATE_FORMAT)}
                    </div>
                );
            },
        },
        {
            accessorKey: "checkIn",
            header: "In",
            cell: ({ row }) => {
                if (!mounted) return "...";
                return (
                    <div className="flex flex-col items-start">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Clock className="h-3.5 w-3.5 text-emerald-500" />
                            {format(new Date(row.original.checkIn), "hh:mm a")}
                        </div>
                    </div>
                );
            },
        },
        {
            id: "inLocation",
            header: "In Location",
            cell: ({ row }) => {
                const lat = row.original.checkInLatitude;
                const lng = row.original.checkInLongitude;
                const address = row.original.checkInAddress;
                if (!lat || !lng) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="flex justify-start max-w-[180px]">
                        <a
                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[10px] text-primary hover:underline bg-primary/5 px-2 py-1 rounded-md transition-colors hover:bg-primary/10 truncate group"
                            title={address || `Raw coordinates: ${lat}, ${lng}`}
                        >
                            <MapPin className="h-3 w-3 shrink-0 text-rose-500 group-hover:scale-110 transition-transform" />
                            <span className="truncate">{address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
                        </a>
                    </div>
                );
            },
        },
        {
            accessorKey: "checkOut",
            header: "Out",
            cell: ({ row }) => {
                if (!mounted) return "...";
                const checkOut = row.original.checkOut;
                if (!checkOut) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="flex flex-col items-start">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Clock className="h-3.5 w-3.5 text-rose-500" />
                            {format(new Date(checkOut), "hh:mm a")}
                        </div>
                    </div>
                );
            },
        },
        {
            id: "outLocation",
            header: "Out Location",
            cell: ({ row }) => {
                const lat = row.original.checkOutLatitude;
                const lng = row.original.checkOutLongitude;
                const address = row.original.checkOutAddress;
                if (!lat || !lng) return <div className="text-xs text-muted-foreground italic">—</div>;
                return (
                    <div className="flex justify-start max-w-[180px]">
                        <a
                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[10px] text-primary hover:underline bg-primary/5 px-2 py-1 rounded-md transition-colors hover:bg-primary/10 truncate group"
                            title={address || `Raw coordinates: ${lat}, ${lng}`}
                        >
                            <MapPin className="h-3 w-3 shrink-0 text-rose-500 group-hover:scale-110 transition-transform" />
                            <span className="truncate">{address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
                        </a>
                    </div>
                );
            },
        },
        {
            id: "duration",
            header: "Duration",
            cell: ({ row }) => {
                if (!mounted) return "...";
                const checkIn = row.original.checkIn;
                const checkOut = row.original.checkOut;

                if (!checkIn || !checkOut) return <div className="text-xs text-muted-foreground italic">—</div>;

                const start = new Date(checkIn);
                const end = new Date(checkOut);
                const diffMs = end.getTime() - start.getTime();
                const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                return (
                    <div className="flex items-center gap-1.5 font-bold text-sm text-primary/80">
                        <Timer className="h-3.5 w-3.5" />
                        {diffHrs}h {diffMins}m
                    </div>
                );
            }
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const status = row.original.status;
                let content;
                switch (status) {
                    case "PRESENT":
                        content = <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Present</Badge>;
                        break;
                    case "ABSENT":
                        content = <Badge variant="destructive">Absent</Badge>;
                        break;
                    case "LATE":
                        content = <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Late</Badge>;
                        break;
                    case "HALF_DAY":
                        content = <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20">Half Day</Badge>;
                        break;
                    case "ON_LEAVE":
                        content = <Badge className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20">On Leave</Badge>;
                        break;
                    default:
                        content = <Badge variant="outline">{status}</Badge>;
                }
                return (
                    <div className="flex justify-start items-center gap-2">
                        {content}
                        {row.original.isOvertime && (
                            <Badge className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20 px-1.5 py-0 text-[10px] font-bold">
                                OT
                            </Badge>
                        )}
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

    const handleApplyFilters = () => {
        setActiveFilters(tempFilters);
        setIsFilterOpen(false);
    };

    const handleResetFilters = () => {
        const reset = {
            from: undefined,
            to: undefined,
            memberId: undefined,
            status: undefined,
        };
        setTempFilters(reset);
        setActiveFilters(reset);
        setIsFilterOpen(false);
    };

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (activeFilters.memberId) count++;
        if (activeFilters.status) count++;
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

    const extraToolbarContent = (
        <div className="flex items-center gap-2">
            <Dialog>
                <DialogTrigger asChild>
                    <Button
                        size="sm"
                        className="h-9 px-3 gap-2 bg-primary hover:bg-primary/90 shadow-sm transition-all active:scale-95"
                    >
                        <LogIn className="h-4 w-4" />
                        <span className="font-medium text-sm hidden sm:inline">Mark Attendance</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-sm">
                    <AttendanceLogger workspaceId={workspaceId} />
                </DialogContent>
            </Dialog>

            <Button
                variant="outline"
                size="sm"
                onClick={handleReconcile}
                disabled={isReconciling}
                className="h-9 px-3 gap-2 border-dashed border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
                {isReconciling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <UserMinus className="h-4 w-4" />
                )}
                <span className="font-medium text-sm hidden sm:inline">Mark Absents</span>
            </Button>

            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="gap-2 relative h-9 px-3 border shadow-sm hover:bg-accent/50 transition-colors"
                    >
                        <Filter className="h-4 w-4" />
                        <span className="font-medium text-sm">Filter</span>
                        {activeFilterCount > 0 && (
                            <Badge
                                variant="destructive"
                                className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] font-bold shadow-md animate-in zoom-in"
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
                            <Filter className="h-4 w-4 text-primary" />
                            <h3 className="text-base font-bold text-foreground">Filter Records</h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsFilterOpen(false)}
                            className="h-8 w-8 p-0 rounded-full hover:bg-background/80"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Content - Scrollable */}
                    <div className="max-h-[65vh] overflow-y-auto p-5 custom-scrollbar bg-background/50 backdrop-blur-sm">
                        {/* Filters Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">

                            {/* Member Filter */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">Member</h4>
                                    {tempFilters.memberId && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTempFilters(prev => ({ ...prev, memberId: undefined }))}
                                            className="h-auto p-0 text-[10px] font-bold text-primary hover:text-primary/80 hover:bg-transparent"
                                        >
                                            CLEAR
                                        </Button>
                                    )}
                                </div>
                                <Select
                                    value={tempFilters.memberId || "all"}
                                    onValueChange={(val) => setTempFilters(prev => ({ ...prev, memberId: val === "all" ? undefined : val }))}
                                >
                                    <SelectTrigger className="h-10 bg-background/50 border-muted-foreground/20 focus:ring-primary/20">
                                        <SelectValue placeholder="All Members" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Members</SelectItem>
                                        {members.map(m => (
                                            <SelectItem key={m.value} value={m.value} className="text-sm">
                                                {m.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Status Filter */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">Status</h4>
                                    {tempFilters.status && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTempFilters(prev => ({ ...prev, status: undefined }))}
                                            className="h-auto p-0 text-[10px] font-bold text-primary hover:text-primary/80 hover:bg-transparent"
                                        >
                                            CLEAR
                                        </Button>
                                    )}
                                </div>
                                <Select
                                    value={tempFilters.status || "all"}
                                    onValueChange={(val) => setTempFilters(prev => ({ ...prev, status: val === "all" ? undefined : val }))}
                                >
                                    <SelectTrigger className="h-10 bg-background/50 border-muted-foreground/20 focus:ring-primary/20">
                                        <SelectValue placeholder="All Statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        <SelectItem value="PRESENT" className="text-sm">Present</SelectItem>
                                        <SelectItem value="ABSENT" className="text-sm">Absent</SelectItem>
                                        <SelectItem value="LATE" className="text-sm">Late</SelectItem>
                                        <SelectItem value="HALF_DAY" className="text-sm">Half Day</SelectItem>
                                        <SelectItem value="ON_LEAVE" className="text-sm">On Leave</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Date Range Filter */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">Date Range</h4>
                                    {(tempFilters.from || tempFilters.to) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTempFilters(prev => ({
                                                ...prev,
                                                from: undefined,
                                                to: undefined
                                            }))}
                                            className="h-auto p-0 text-[10px] font-bold text-primary hover:text-primary/80 hover:bg-transparent"
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
                                            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
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
                            className="flex-1 font-bold text-sm h-10 hover:bg-background/80"
                        >
                            Reset All
                        </Button>
                        <Button
                            onClick={handleApplyFilters}
                            className="flex-[2] font-bold text-sm h-10 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
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
        <div className="space-y-6">
            {/* Stats Strip */}
            <div className="flex flex-wrap items-center justify-around gap-6 p-3 rounded-xl border bg-card/30 backdrop-blur-md shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Total:</span>
                    <span className="text-lg font-bold tabular-nums">{stats.total}</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-emerald-600/70">On Time:</span>
                    <span className="text-lg font-bold tabular-nums text-emerald-600">{stats.present}</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-amber-600/70">Late:</span>
                    <span className="text-lg font-bold tabular-nums text-amber-600">{stats.late}</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-orange-600/70">Half Day:</span>
                    <span className="text-lg font-bold tabular-nums text-orange-600">{stats.halfDay}</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-600/70">Leave:</span>
                    <span className="text-lg font-bold tabular-nums text-purple-600">{stats.leave}</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-rose-600/70">Absent:</span>
                    <span className="text-lg font-bold tabular-nums text-rose-600">{stats.absent}</span>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={records}
                isLoading={loading}
                searchKey="memberId"
                searchPlaceholder="Search members..."
                extraToolbarContent={extraToolbarContent}
            />
        </div>
    );
}
