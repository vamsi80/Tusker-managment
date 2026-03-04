"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { loadMoreReportsAction } from "@/actions/daily-report/load-reports";
import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { utils, writeFile } from "xlsx";
import { ReportDetailModal } from "./report-detail-sheet";
import { Loader2, CalendarIcon, UserIcon, X, Download } from "lucide-react";

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

    // const exportToExcel = useCallback(() => {
    //     const flattenedData: any[] = [];

    //     data.forEach(row => {
    //         if (row.entries && row.entries.length > 0) {
    //             row.entries.forEach((entry: any) => {
    //                 flattenedData.push({
    //                     User: `${row.user?.name} ${row.user?.surname || ""}`,
    //                     Email: row.user?.email || "-",
    //                     Status: row.status,
    //                     Date: row.date ? format(new Date(row.date), "MMM d, yyyy") : "-",
    //                     Time: row.submittedAt ? format(new Date(row.submittedAt), "h:mm a") : "-",
    //                     Task: entry.task?.name || "Other Work",
    //                     TaskID: entry.task?.taskSlug || "-",
    //                     Description: entry.description
    //                 });
    //             });
    //         } else {
    //             flattenedData.push({
    //                 User: `${row.user?.name} ${row.user?.surname || ""}`,
    //                 Email: row.user?.email || "-",
    //                 Status: row.status,
    //                 Date: row.date ? format(new Date(row.date), "MMM d, yyyy") : "-",
    //                 Time: row.submittedAt ? format(new Date(row.submittedAt), "h:mm a") : "-",
    //                 Task: row.status === "ABSENT" ? "Absent" : "No Task",
    //                 TaskID: "-",
    //                 Description: row.description
    //             });
    //         }
    //     });

    //     const ws = utils.json_to_sheet(flattenedData);
    //     const wb = utils.book_new();
    //     utils.book_append_sheet(wb, ws, "Reports");

    //     const fileName = `Reports_${initialDate || format(new Date(), "yyyy-MM-dd")}.xlsx`;
    //     writeFile(wb, fileName);
    // }, [data, initialDate]);

    const columns = useMemo<ColumnDef<any>[]>(() => [
        {
            accessorKey: "user.name",
            header: "User",
            cell: ({ row }) => {
                const user = row.original.user;
                return (
                    <div className="flex items-center gap-3 w-[300px]">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0 border">
                            {user?.image ? (
                                <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xs font-medium text-secondary-foreground text-opacity-70">
                                    {user?.name?.charAt(0) || "U"}
                                </span>
                            )}
                        </div>
                        <div className="truncate">
                            <div className="font-medium text-sm leading-tight truncate">{user?.surname}</div>
                            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                        </div>
                    </div>
                );
            },
            filterFn: (row, id, value) => {
                const user = row.original.user;
                const search = `${user?.name} ${user?.surname} ${user?.email}`.toLowerCase();
                return search.includes(String(value).toLowerCase());
            }
        },
        {
            accessorKey: "task",
            header: "Task Reference",
            cell: ({ row }) => {
                const entries = row.original.entries || [];
                const hasMore = entries.length > 1;

                if (entries.length === 0) {
                    if (row.original.status === "ABSENT") return <span className="text-muted-foreground font-medium italic">Absent</span>;
                    return <span className="text-muted-foreground font-medium italic">Other Work</span>;
                }

                const firstEntry = entries[0];
                const task = firstEntry.task;

                return (
                    <div className="flex flex-col gap-0.5 max-w-[200px]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            {task?.project?.color ? (
                                <div
                                    className="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm"
                                    style={{ backgroundColor: task.project.color }}
                                />
                            ) : (
                                <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/30 shadow-none border border-black/5" />
                            )}
                            <span className={cn(
                                "font-medium text-xs truncate leading-tight",
                                !task && "text-muted-foreground italic"
                            )}>
                                {task?.name || "Other Work"}
                            </span>
                            {hasMore && (
                                <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold shrink-0 bg-secondary/80">
                                    +{entries.length - 1} Other
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1 rounded-sm border border-black/5">
                                {task?.taskSlug || "OTHER"}
                            </span>
                        </div>
                    </div>
                );
            }
        },
        {
            accessorKey: "description",
            header: "Description / Log",
            cell: ({ row }) => {
                const desc = row.getValue("description") as string;
                const count = row.original.entries?.length || 0;
                return (
                    <div className="max-w-[200px]">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <p className="text-sm truncate cursor-help text-card-foreground/90">
                                        {desc} {count > 1 && <span className="text-[10px] text-primary font-bold">(+{count - 1} more)</span>}
                                    </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[200px] p-3 text-xs leading-relaxed">
                                    <p className="whitespace-pre-wrap">{desc}</p>
                                    {count > 1 && (
                                        <p className="mt-2 text-[10px] font-bold border-t pt-1 border-white/20">
                                            Click to view all {count} logs
                                        </p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                );
            }
        },
        {
            accessorKey: "date",
            header: "Date",
            cell: ({ getValue }) => {
                const val = getValue() as Date | null;
                if (!val) return "-";
                return <span className="text-muted-foreground text-xs whitespace-nowrap">{format(new Date(val), "MMM d, yyyy")}</span>;
            },
            filterFn: (row, id, value) => {
                if (!value) return true;
                return format(new Date(row.getValue(id)), "yyyy-MM-dd") === value;
            }
        },
        {
            accessorKey: "submittedAt",
            header: "Time",
            cell: ({ getValue }) => {
                const val = getValue() as Date | null;
                if (!val) return "-";
                return <span className="text-muted-foreground text-xs whitespace-nowrap">{format(new Date(val), "h:mm a")}</span>;
            }
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ getValue }) => {
                const status = getValue() as string;
                return (
                    <Badge
                        variant={status === "ABSENT" ? "destructive" : "default"}
                        className={status === "SUBMITTED" ? "bg-green-600 hover:bg-green-700 text-white shadow-none" : "shadow-none"}
                    >
                        {status}
                    </Badge>
                );
            },
            filterFn: (row, id, value) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return true;
                const rowValue = row.getValue(id) as string;
                return Array.isArray(value) ? value.includes(rowValue) : rowValue === value;
            }
        }
    ], []);

    const filterFields = useMemo(() => [
        {
            label: "Status",
            value: "status",
            options: [
                { label: "Submitted", value: "SUBMITTED" },
                { label: "Not Submitted", value: "NOT_SUBMITTED" },
                { label: "Absent", value: "ABSENT" }
            ]
        }
    ], []);

    const selectedMember = useMemo(() => {
        return members.find(m => m.userId === initialUserId);
    }, [members, initialUserId]);

    return (
        <div className="space-y-4">
            <DataTable
                data={data}
                columns={columns}
                searchKey="user.name"
                searchPlaceholder="Search logs..."
                filterFields={filterFields}
                pageSize={data.length}
                showPagination={false}
                filterDisplay="default"
                showColumnToggle={true}
                onRowClick={(row) => {
                    setSelectedReport(row);
                    setIsDialogOpen(true);
                }}
                extraToolbarContent={
                    <>
                        {/* Member Picker - Admins Only */}
                        {isAdmin && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            "h-8 justify-start text-left font-normal border-dashed",
                                            !initialUserId && "text-muted-foreground"
                                        )}
                                    >
                                        <UserIcon className="mr-2 h-4 w-4" />
                                        {selectedMember ? `${selectedMember.user?.name} ${selectedMember.user?.surname || ""}` : "All members"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[200px]" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search member..." />
                                        <CommandList>
                                            <CommandEmpty>No member found.</CommandEmpty>
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
                                                        {m.user?.name} {m.user?.surname}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        )}

                        {/* Date Picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "h-8 justify-start text-left font-normal border-dashed",
                                        !initialDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {initialDate ? format(new Date(initialDate), "MMM d, yyyy") : "Any date"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={initialDate ? new Date(initialDate) : undefined}
                                    onSelect={(date) => updateFilters({ date: date ? format(date, "yyyy-MM-dd") : undefined })}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>

                        {(initialDate || (isAdmin && initialUserId)) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateFilters({ date: undefined, userId: undefined })}
                                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="mr-1 h-4 w-4" />
                                Clear
                            </Button>
                        )}

                        {/* <Button
                            variant="outline"
                            size="sm"
                            onClick={exportToExcel}
                            className="h-8 px-2 ml-auto"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Export Excel
                        </Button> */}
                    </>
                }
            />

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
