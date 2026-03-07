"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { formatIST } from "@/lib/utils";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ReportDetailModal } from "./report-detail-sheet";
import { Loader2, CalendarIcon, UserIcon, X, ChevronDown, Clock, Search } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import { loadMoreReportsAction } from "@/actions/daily-report/load-reports";

interface Props {
    initialData: any[];
    workspaceId: string;
    members: WorkspaceMemberRow[];
    initialDate?: string;
    initialUserId?: string;
    isAdmin: boolean;
}

export function ReportsTable({ initialData, workspaceId, members, initialDate, initialUserId, isAdmin }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [data, setData] = useState(initialData);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(initialData.length >= 30);
    const [skip, setSkip] = useState(30);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Sync with initialData change (when server-side searchParams change)
    useEffect(() => {
        setData(initialData);
        setSkip(30);
        setHasMore(initialData.length >= 30);
    }, [initialData]);

    const updateFilters = useCallback((updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });
        router.push(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore) return;

        setIsLoadingMore(true);
        try {
            const nextBatch = await loadMoreReportsAction({
                workspaceId,
                date: initialDate,
                userId: initialUserId,
                skip: skip,
                take: 30
            });

            if (nextBatch.length === 0) {
                setHasMore(false);
            } else {
                setData((prev: any[]) => [...prev, ...nextBatch]);
                setSkip((prev: number) => prev + 30);
            }
        } catch (error) {
            console.error("Failed to load more reports:", error);
        } finally {
            setIsLoadingMore(false);
        }
    }, [workspaceId, initialDate, initialUserId, skip, isLoadingMore, hasMore]);

    // Infinite scroll observer
    const observerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );

        if (observerRef.current) {
            observer.observe(observerRef.current);
        }

        return () => observer.disconnect();
    }, [loadMore, hasMore, isLoadingMore]);

    const selectedMember = useMemo(() => {
        return members.find(m => m.userId === initialUserId);
    }, [members, initialUserId]);

    const filteredData = useMemo(() => {
        if (!searchQuery) return data;
        const lowSearch = searchQuery.toLowerCase();
        return data.filter(item => {
            const user = item.user;
            const userName = `${user?.name} ${user?.surname} ${user?.email}`.toLowerCase();
            const entries = item.entries || [];
            const taskMatch = entries.some((e: any) =>
                (e.task?.name?.toLowerCase() || "").includes(lowSearch) ||
                (e.task?.taskSlug?.toLowerCase() || "").includes(lowSearch) ||
                (e.description?.toLowerCase() || "").includes(lowSearch)
            );
            const reportDescMatch = (item.description?.toLowerCase() || "").includes(lowSearch);

            return userName.includes(lowSearch) || taskMatch || reportDescMatch;
        });
    }, [data, searchQuery]);

    const groupedData = useMemo(() => {
        const groups: Record<string, any[]> = {};
        filteredData.forEach(report => {
            // Treat date as a plain string YYYY-MM-DD to avoid timezone shifts
            let dateStr = "No Date";
            if (report.date) {
                dateStr = typeof report.date === "string"
                    ? report.date.split("T")[0]
                    : formatIST(report.date, "yyyy-MM-dd");
            }

            if (!groups[dateStr]) groups[dateStr] = [];

            const entries = report.entries || [];
            if (entries.length === 0) {
                groups[dateStr].push({
                    ...report,
                    _isFirstInReport: true,
                    _entry: null,
                });
            } else {
                entries.forEach((entry: any, index: number) => {
                    groups[dateStr].push({
                        ...report,
                        _isFirstInReport: index === 0,
                        _entry: entry,
                    });
                });
            }
        });
        return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
    }, [filteredData]);

    const reportColumns = useMemo<ColumnDef<any>[]>(() => [
        {
            accessorKey: "user",
            header: "Assignee",
            meta: { className: "[&:not(th)]:align-top" } as any,
            cell: ({ row }) => {
                if (!row.original._isFirstInReport) return null;

                const user = row.original.user;
                const status = row.original.status;
                return (
                    <div className="flex items-start gap-4 py-0 pl-1">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0 border shadow-sm">
                            {user?.image ? (
                                <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xs font-medium text-secondary-foreground">
                                    {user?.surname?.charAt(0) || "U"}
                                </span>

                            )}

                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="truncate">
                                <div className="font-normal text-sm text-foreground truncate flex items-center gap-2">
                                    {user?.surname}
                                    <Badge
                                        variant={status === "ABSENT" ? "destructive" : "default"}
                                        className={cn(
                                            "text-[9px] h-4 w-fit px-1.5 shadow-none font-bold uppercase tracking-tighter",
                                            status === "SUBMITTED" && "bg-green-600/10 text-green-600 border-green-600/20 hover:bg-green-600/20"
                                        )}
                                    >
                                        {status}
                                    </Badge>
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
                            </div>
                        </div>
                    </div>
                );
            }
        },
        {
            accessorKey: "tasks",
            header: "Task & Time",
            meta: { className: "w-[25%] border-l border-border/10 pl-4 [&:not(th)]:align-top" } as any,
            cell: ({ row }) => {
                const entry = row.original._entry;
                const submittedAt = row.original.submittedAt;

                if (!entry) {
                    return (
                        <div className="py-3 flex items-start gap-3">
                            <span className="text-xs text-muted-foreground italic bg-muted/30 px-2 py-1 rounded-md border border-dashed">
                                {row.original.status === "ABSENT" ? "Absent" : "Other Work"}
                            </span>
                            {submittedAt && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-secondary/30 px-1.5 py-0.5 rounded mt-1">
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatIST(submittedAt, "h:mm a")}
                                </div>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-1 py-1 items-start justify-start min-h-[44px]">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                style={{ backgroundColor: entry.task?.project?.color || "#cbd5e1" }}
                            />
                            <span className="font-normal text-xs truncate leading-tight text-foreground/80">
                                {entry.task?.name || "Other Work"}
                            </span>
                        </div>
                        <div className="pl-4 flex items-center gap-2">
                            {submittedAt && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground/60 font-mono">
                                    <Clock className="h-2 w-2" />
                                    {formatIST(submittedAt, "h:mm a")}
                                </div>
                            )}
                        </div>
                    </div>
                );
            }
        },
        {
            accessorKey: "logs",
            header: "Work Log Descriptions",
            meta: { className: "w-[55%] border-l border-border/10 pl-4 [&:not(th)]:align-top" } as any,
            cell: ({ row }) => {
                const entry = row.original._entry;
                const description = entry ? entry.description : row.original.description;

                return (
                    <div className="py-1 flex items-start min-h-[44px]">
                        <p className="text-sm text-card-foreground/90 font-normal leading-relaxed whitespace-pre-wrap">
                            {description || "-"}
                        </p>
                    </div>
                );
            }
        }
    ], []);

    return (
        <div className="space-y-6">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search assignees, tasks, or logs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 border-muted/40 focus:border-primary/30 transition-all text-sm"
                    />
                </div>

                {isAdmin && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "h-9 justify-start text-left font-normal border-dashed",
                                    !initialUserId && "text-muted-foreground"
                                )}
                            >
                                <UserIcon className="mr-2 h-4 w-4" />
                                {selectedMember ? `${selectedMember.user?.surname || ""}` : "All Assignees"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[200px]" align="start">
                            <Command>
                                <CommandInput placeholder="Search assignee..." />
                                <CommandList>
                                    <CommandEmpty>No assignee found.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            onSelect={() => updateFilters({ userId: undefined })}
                                        >
                                            All members
                                        </CommandItem>
                                        {members.map((m) => (
                                            <CommandItem
                                                key={m.userId}
                                                onSelect={() => updateFilters({ userId: m.userId })}
                                            >
                                                {m.user?.surname}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                )}

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-9 justify-start text-left font-normal border-dashed",
                                !initialDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {initialDate ? formatIST(new Date(`${initialDate}T12:00:00`), "MMM d, yyyy") : "Any date"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={initialDate ? new Date(initialDate) : undefined}
                            onSelect={(date) => updateFilters({ date: date ? formatIST(date, "yyyy-MM-dd") : undefined })}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>

                {(initialDate || (isAdmin && initialUserId)) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateFilters({ date: undefined, userId: undefined })}
                        className="h-9 px-2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="mr-1 h-4 w-4" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Grouped Date Sections */}
            <div className="space-y-4">
                {groupedData.length > 0 ? (
                    groupedData.map(([date, rows], index) => (
                        <Collapsible
                            key={date}
                            defaultOpen={index === 0}
                            className="bg-card/30 border border-border/40 rounded-2xl overflow-hidden hover:border-primary/20 transition-all duration-300 shadow-sm"
                        >
                            <CollapsibleTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="w-full flex items-center justify-between p-5 h-auto hover:bg-muted/30 group text-foreground"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10 group-hover:bg-primary group-hover:text-white transition-colors">
                                            <CalendarIcon className="h-5 w-5" />
                                        </div>
                                        <div className="text-left">
                                            <h3 className="font-semibold text-base">
                                                {date !== "No Date" ? formatIST(new Date(`${date}T12:00:00`), "EEEE, MMMM d, yyyy") : "No Date"}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">
                                                Daily activity logs
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="px-4 pb-4 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Separator className="mb-2 bg-border/20" />
                                    <div className="rounded-xl border border-border/10 overflow-auto max-h-[60vh] shadow-inner bg-card/20 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-background/95 [&_thead]:backdrop-blur [&_[data-slot=table-container]]:overflow-visible transition-colors">
                                        <DataTable
                                            data={rows}
                                            columns={reportColumns}
                                            pageSize={rows.length}
                                            showPagination={false}
                                            showColumnToggle={false}
                                            getRowClassName={(row: any) =>
                                                row.original._isFirstInReport ? "border-t border-border/40 mt-4 first:mt-0 first:border-0" : ""
                                            }
                                            onRowClick={(row) => {
                                                setSelectedReport(row);
                                                setIsDialogOpen(true);
                                            }}
                                        />
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed rounded-2xl text-center">
                        <div className="p-4 rounded-full bg-muted/50 mb-4">
                            <Search className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <h3 className="font-medium text-lg">No reports found</h3>
                        <p className="text-sm text-muted-foreground max-w-xs">
                            Try adjusting your search or filters to find what you're looking for.
                        </p>
                    </div>
                )}
            </div>

            {hasMore && (
                <div ref={observerRef} className="flex justify-center p-4">
                    {isLoadingMore && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                </div>
            )}

            <ReportDetailModal
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                report={selectedReport}
            />
        </div>
    );
}
