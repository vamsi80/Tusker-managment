"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import React, { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Package, Check, X, Edit2, Trash2, Plus, CornerDownRight, ChevronsDownUpIcon, ChevronsUpDownIcon, Search, BarChart2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { CreateMaterialDialog } from "./create-material-dialog";

interface Material {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    specifications?: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELLED";
    addedBy?: string;
    subtaskId: string | null;
    subtaskNameSnapshot?: string | null;
    parentTaskNameSnapshot?: string | null;
}

interface SubtaskHierarchy {
    id: string;
    name: string;
    taskName: string;
    status: string;
    materials: Material[];
}

interface MaterialsTableProps {
    data: SubtaskHierarchy[];
    workspaceId: string;
    units: string[];
    onAddMaterial: (subtaskId: string | null, name: string, unit: string, quantity: number, notes?: string) => Promise<void>;
    onEditMaterial: (itemId: string, name: string, unit: string, quantity: number, notes?: string) => Promise<void>;
    onDeleteMaterial: (itemId: string) => Promise<void>;
}

interface CatalogItem {
    id: string;
    name: string;
    unit?: string;
    defaultUnit?: { abbreviation?: string };
}

function AutoCompleteInput({
    value,
    onChange,
    onUnitAutoFill,
    disabled,
    catalog,
    isLoading,
    onCreateClick,
    placeholder,
}: {
    value: string;
    onChange: (val: string) => void;
    onUnitAutoFill?: (unit: string) => void;
    disabled: boolean;
    catalog: CatalogItem[];
    isLoading: boolean;
    onCreateClick?: (val: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Reset search query when popover opens
    useEffect(() => {
        if (open) {
            setSearchQuery("");
        }
    }, [open]);

    const filtered = searchQuery
        ? catalog.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : catalog;

    const exactMatch = catalog.some(
        (c) => c.name.toLowerCase() === searchQuery.trim().toLowerCase()
    );

    return (
        <div className="relative w-full">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverAnchor asChild>
                    <button
                        type="button"
                        onClick={() => !disabled && !isLoading && setOpen(true)}
                        disabled={disabled || isLoading}
                        className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-xs shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left font-normal"
                    >
                        <span className={value ? "text-foreground font-medium truncate" : "text-muted-foreground truncate"}>
                            {value || placeholder || "Select material..."}
                        </span>
                        <ChevronDown className="size-3.5 text-muted-foreground/70 shrink-0 ml-2" />
                    </button>
                </PopoverAnchor>
                <PopoverContent
                    onOpenAutoFocus={(e) => {
                        const searchInput = document.getElementById("material-search-input");
                        if (searchInput) searchInput.focus();
                    }}
                    className="w-[300px] p-0 bg-popover border border-border/80 rounded-md shadow-lg z-50 flex flex-col max-h-64 overflow-hidden"
                    align="start"
                >
                    {/* Search Bar inside popover */}
                    <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 shrink-0">
                        <Search className="size-3.5 text-muted-foreground/60 shrink-0" />
                        <input
                            id="material-search-input"
                            placeholder="Search materials..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/60 text-foreground"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                <X className="size-3 shrink-0" />
                            </button>
                        )}
                    </div>

                    {/* Material List */}
                    <div className="overflow-y-auto max-h-48 divide-y divide-border/20">
                        {isLoading ? (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                                Loading materials...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                                No matching materials
                            </div>
                        ) : (
                            filtered.map((item) => (
                                <div
                                    key={item.id}
                                    className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-popover-foreground flex items-center justify-between transition-colors font-medium"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onChange(item.name);
                                        if (item.defaultUnit?.abbreviation && onUnitAutoFill) {
                                            onUnitAutoFill(item.defaultUnit.abbreviation);
                                        } else if (item.unit && onUnitAutoFill) {
                                            onUnitAutoFill(item.unit);
                                        }
                                        setOpen(false);
                                    }}
                                >
                                    <span className="truncate mr-2">{item.name}</span>
                                    {(item.defaultUnit?.abbreviation || item.unit) && (
                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0 font-bold uppercase border border-border/30">
                                            {item.defaultUnit?.abbreviation || item.unit}
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Create New Option */}
                    {searchQuery.trim() && !exactMatch && onCreateClick && (
                        <div
                            className="px-3 py-2.5 text-xs cursor-pointer hover:bg-primary/5 text-primary flex items-center transition-colors font-semibold border-t border-border/40 bg-muted/20 mt-auto shrink-0"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCreateClick(searchQuery.trim());
                                setOpen(false);
                            }}
                        >
                            <Plus className="mr-2 size-3 text-primary shrink-0" /> Create &quot;{searchQuery.trim()}&quot;
                        </div>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function MaterialsTable({
    data,
    workspaceId,
    units,
    onAddMaterial,
    onEditMaterial,
    onDeleteMaterial,
}: MaterialsTableProps) {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>(
        // Default first row to expanded for rich visual first impression
        data.length > 0 ? { [data[0].id]: true } : {}
    );

    // Inline Add state
    const [addingToSubtask, setAddingToSubtask] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [newUnit, setNewUnit] = useState(units[0] || "PCS");
    const [newQuantity, setNewQuantity] = useState<number | "">("");
    const [newNotes, setNewNotes] = useState("");

    // Inline Edit state
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editUnit, setEditUnit] = useState("");
    const [editQuantity, setEditQuantity] = useState<number | "">("");
    const [editNotes, setEditNotes] = useState("");

    // Catalog search/autocomplete and creation states
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createMaterialName, setCreateMaterialName] = useState("");
    const [createMaterialUnit, setCreateMaterialUnit] = useState(units[0] || "PCS");

    const [showSummary, setShowSummary] = useState(false);
    const [expandedSummaryRows, setExpandedSummaryRows] = useState<Record<string, boolean>>({});

    const materialSummary = useMemo(() => {
        const summaryMap = new Map<string, {
            name: string;
            unit: string;
            totalQuantity: number;
            usages: {
                id: string;
                subtaskName: string;
                taskName: string;
                quantity: number;
                status: Material["status"];
                specifications?: string;
                addedBy?: string;
            }[];
        }>();

        data.forEach((row) => {
            row.materials.forEach((mat) => {
                const key = `${mat.name.toLowerCase().trim()}_${mat.unit.toLowerCase().trim()}`;
                const existing = summaryMap.get(key);
                const usageEntry = {
                    id: mat.id,
                    subtaskName: row.name,
                    taskName: row.taskName,
                    quantity: mat.quantity,
                    status: mat.status,
                    specifications: mat.specifications,
                    addedBy: mat.addedBy,
                };
                if (existing) {
                    existing.totalQuantity += mat.quantity;
                    existing.usages.push(usageEntry);
                } else {
                    summaryMap.set(key, {
                        name: mat.name,
                        unit: mat.unit,
                        totalQuantity: mat.quantity,
                        usages: [usageEntry],
                    });
                }
            });
        });

        return Array.from(summaryMap.values()).map(item => ({
            ...item,
            subtaskCount: new Set(item.usages.map(u => u.subtaskName)).size
        })).sort((a, b) => b.totalQuantity - a.totalQuantity);
    }, [data]);

    const fetchCatalog = async () => {
        if (!workspaceId) return;
        try {
            setIsLoadingCatalog(true);
            const res = await fetch(`/api/v1/materials?w=${workspaceId}`);
            const resJson = await res.json();
            if (resJson.success && resJson.data) {
                setCatalog(resJson.data);
            }
        } catch (err) {
            console.error("Failed to fetch catalog:", err);
        } finally {
            setIsLoadingCatalog(false);
        }
    };

    useEffect(() => {
        if (workspaceId) {
            fetchCatalog();
        }
    }, [workspaceId]);

    const handleCreateMaterialSuccess = async (createdMaterial: CatalogItem) => {
        // Refresh catalog cache
        await fetchCatalog();

        // Auto-fill active form
        if (addingToSubtask) {
            setNewName(createdMaterial.name);
            if (createdMaterial.defaultUnit?.abbreviation) {
                setNewUnit(createdMaterial.defaultUnit.abbreviation);
            }
        } else if (editingItemId) {
            setEditName(createdMaterial.name);
            if (createdMaterial.defaultUnit?.abbreviation) {
                setEditUnit(createdMaterial.defaultUnit.abbreviation);
            }
        }
    };

    const toggleRow = (rowId: string) => {
        setExpandedRows((prev) => ({
            ...prev,
            [rowId]: !prev[rowId],
        }));
    };

    const toggleAll = () => {
        const allExpanded = Object.keys(expandedRows).length === data.length;
        if (allExpanded) {
            setExpandedRows({});
        } else {
            const newExpanded: Record<string, boolean> = {};
            data.forEach((row) => {
                newExpanded[row.id] = true;
            });
            setExpandedRows(newExpanded);
        }
    };

    const isAllExpanded = Object.keys(expandedRows).length === data.length && data.length > 0;

    const handleStartAdd = (subtaskId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't collapse row
        setAddingToSubtask(subtaskId);
        setNewName("");
        setNewUnit(units[0] || "PCS");
        setNewQuantity("");
        setNewNotes("");
        // Auto expand if collapsed
        setExpandedRows(prev => ({ ...prev, [subtaskId]: true }));
    };

    const handleSaveAdd = async (subtaskId: string) => {
        if (!newName.trim()) {
            return;
        }
        const qty = Number(newQuantity) || 1;
        await onAddMaterial(subtaskId === "orphaned" ? null : subtaskId, newName.trim(), newUnit, qty, newNotes.trim() || undefined);
        setAddingToSubtask(null);
    };

    const handleStartEdit = (item: Material, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingItemId(item.id);
        setEditName(item.name);
        setEditUnit(item.unit);
        setEditQuantity(item.quantity);
        setEditNotes(item.specifications || "");
    };

    const handleSaveEdit = async (itemId: string) => {
        if (!editName.trim()) {
            return;
        }
        const qty = Number(editQuantity) || 1;
        await onEditMaterial(itemId, editName.trim(), editUnit, qty, editNotes.trim() || undefined);
        setEditingItemId(null);
    };

    const getStatusBadge = (status: Material["status"]) => {
        switch (status) {
            case "DRAFT":
                return (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 text-[9px] font-semibold py-0 px-2 rounded-full uppercase tracking-wider">
                        Planned
                    </Badge>
                );
            case "SUBMITTED":
                return (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[9px] font-semibold py-0 px-2 rounded-full uppercase tracking-wider">
                        Submitted
                    </Badge>
                );
            case "APPROVED":
                return (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-semibold py-0 px-2 rounded-full uppercase tracking-wider">
                        Approved
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[9px] font-semibold py-0 px-2 rounded-full uppercase tracking-wider">
                        Draft
                    </Badge>
                );
        }
    };

    return (
        <div className="border border-border/60 bg-card/30 backdrop-blur-sm overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 rounded-lg">
            {/* Header bar with Summary view toggle */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/10">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {showSummary ? "Material Scheduling Summary" : "Material Schedule"}
                </span>
                <button
                    onClick={() => setShowSummary(!showSummary)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-all duration-200 ${
                        showSummary
                            ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                            : "text-muted-foreground border-border/40 hover:bg-muted/40"
                    }`}
                >
                    <BarChart2 className="size-3.5" />
                    Summary View
                </button>
            </div>

            {showSummary ? (
                /* Material Summary View */
                <div className="overflow-x-auto">
                    <Table className="w-full table-fixed min-w-[800px]">
                        <TableHeader className="bg-muted/30 border-b border-border/60">
                            <TableRow>
                                <TableHead className="w-[5%] text-center"></TableHead>
                                <TableHead className="w-[45%] text-xs font-bold uppercase tracking-wider text-muted-foreground">Material Name</TableHead>
                                <TableHead className="w-[15%] text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Unit</TableHead>
                                <TableHead className="w-[15%] text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Total Quantity</TableHead>
                                <TableHead className="w-[20%] text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Usages (Subtasks)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {materialSummary.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-xs text-muted-foreground">
                                        No materials found in schedule.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                materialSummary.map((item) => {
                                    const key = `${item.name.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
                                    const isRowExpanded = !!expandedSummaryRows[key];
                                    return (
                                        <React.Fragment key={key}>
                                            <TableRow 
                                                className="hover:bg-muted/10 transition-colors cursor-pointer select-none"
                                                onClick={() => {
                                                    setExpandedSummaryRows(prev => ({
                                                        ...prev,
                                                        [key]: !prev[key]
                                                    }));
                                                }}
                                            >
                                                <TableCell className="text-center py-2.5">
                                                    <div className="flex items-center justify-center">
                                                        {isRowExpanded ? (
                                                            <ChevronDown className="size-3.5 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronRight className="size-3.5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2.5">
                                                    <span className="font-semibold text-xs text-foreground truncate">{item.name}</span>
                                                </TableCell>
                                                <TableCell className="py-2.5 text-center text-xs font-mono font-medium text-muted-foreground">{item.unit}</TableCell>
                                                <TableCell className="py-2.5 text-right font-mono font-bold text-xs text-foreground">
                                                    {item.totalQuantity.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-center">
                                                    <Badge variant="secondary" className="bg-primary/[0.04] text-primary hover:bg-primary/[0.05] text-[10px] py-0 px-2 font-mono border border-primary/5">
                                                        {item.subtaskCount} {item.subtaskCount === 1 ? "subtask" : "subtasks"}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                            
                                            {isRowExpanded && (
                                                <TableRow className="bg-muted/[0.02]">
                                                    <TableCell colSpan={5} className="py-1 px-4 border-t border-border/30">
                                                        <div className="pl-6 pr-2 py-2 flex flex-col gap-1.5 border-l-2 border-primary/10 my-1">
                                                            {item.usages.map((usage, idx) => (
                                                                <div key={usage.id || idx} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-b-0">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <CornerDownRight className="size-3 text-muted-foreground/60 shrink-0" />
                                                                        <span className="font-medium text-muted-foreground/90 truncate max-w-[200px] md:max-w-[300px]" title={usage.subtaskName}>
                                                                            {usage.subtaskName}
                                                                        </span>
                                                                        <span className="text-[10px] text-muted-foreground/50 truncate">
                                                                            ({usage.taskName})
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="font-mono text-muted-foreground font-semibold">
                                                                            {usage.quantity.toLocaleString()} {item.unit}
                                                                        </span>
                                                                        {getStatusBadge(usage.status)}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                /* Original List View */
                <div className="overflow-x-auto">
                    <Table className="w-full table-fixed min-w-[850px]">
                        <TableHeader className="bg-muted/30 border-b border-border/60">
                            <TableRow>
                                <TableHead className="w-[4%] text-center">
                                    <TooltipProvider delayDuration={200}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={toggleAll}
                                                    className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/65 flex items-center justify-center mx-auto"
                                                >
                                                    {isAllExpanded ? (
                                                        <ChevronsDownUpIcon className="size-4" />
                                                    ) : (
                                                        <ChevronsUpDownIcon className="size-4" />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                {isAllExpanded ? "Collapse All Tasks" : "Expand All Tasks"}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableHead>
                                <TableHead className="w-[42%] text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                                <TableHead className="w-[12%] text-xs font-bold uppercase tracking-wider text-muted-foreground">Units</TableHead>
                                <TableHead className="w-[12%] text-xs font-bold uppercase tracking-wider text-muted-foreground">Quantity</TableHead>
                                <TableHead className="w-[13%] text-xs font-bold uppercase tracking-wider text-muted-foreground">Status / Added By</TableHead>
                                <TableHead className="w-[17%] text-xs font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                                        No material schedules or tasks found matching filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.map((row) => {
                                    const isExpanded = !!expandedRows[row.id];
                                    const isAdding = addingToSubtask === row.id;

                                    return (
                                        <React.Fragment key={row.id}>
                                            {/* Parent Row (Subtask / Task level) */}
                                            <TableRow
                                                className="bg-muted/10 hover:bg-muted/20 border-b border-border/40 transition-colors cursor-pointer select-none group"
                                                onClick={() => toggleRow(row.id)}
                                            >
                                                <TableCell className="text-center py-1.5">
                                                    <div className="flex items-center justify-center">
                                                        {isExpanded ? (
                                                            <ChevronDown className="size-4 text-muted-foreground group-hover:text-foreground transition-transform duration-200" />
                                                        ) : (
                                                            <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-transform duration-200" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-sm text-foreground truncate">
                                                                {row.name}
                                                            </span>
                                                            <span className="text-[12px] text-muted-foreground truncate flex items-center gap-1">
                                                                <CornerDownRight className="size-3 text-muted-foreground/60 shrink-0" />
                                                                {row.taskName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-1.5 text-xs text-muted-foreground/40">—</TableCell>
                                                <TableCell className="py-1.5">
                                                    <span className="text-[12px] font-mono text-muted-foreground">
                                                        {row.materials.length} materials
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-1.5">
                                                    {row.id === "orphaned" ? (
                                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] font-bold uppercase tracking-wider py-0.5 px-2">
                                                            Orphaned
                                                        </Badge>
                                                    ) : (
                                                        <Badge
                                                            variant="outline"
                                                            className="bg-muted/40 text-muted-foreground border-border/60 text-[9px] font-bold uppercase tracking-wider py-0.5 px-2 rounded"
                                                        >
                                                            {row.status}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-1.5 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        onClick={(e) => handleStartAdd(row.id, e)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs gap-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                                                    >
                                                        <Plus className="size-3.5" />
                                                        Add Material
                                                    </Button>
                                                </TableCell>
                                            </TableRow>

                                            {/* Child Material Rows */}
                                            {isExpanded && (
                                                <>
                                                    {row.materials.map((item) => {
                                                        const isEditing = editingItemId === item.id;
                                                        return (
                                                            <TableRow
                                                                key={item.id}
                                                                className="bg-background/40 border-b border-border/20 transition-colors group/row"
                                                            >
                                                                <TableCell></TableCell>
                                                                <TableCell className="py-1.5">
                                                                    <div className="flex items-center gap-1.5 pl-6 min-w-0">
                                                                        <CornerDownRight className="size-3 text-muted-foreground/40 shrink-0" />
                                                                        {isEditing ? (
                                                                            <AutoCompleteInput
                                                                                value={editName}
                                                                                onChange={setEditName}
                                                                                onUnitAutoFill={setEditUnit}
                                                                                disabled={false}
                                                                                catalog={catalog}
                                                                                isLoading={isLoadingCatalog}
                                                                                onCreateClick={(val) => {
                                                                                    setCreateMaterialName(val);
                                                                                    setCreateDialogOpen(true);
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                                                <span className="text-xs font-semibold text-foreground truncate">
                                                                                    {item.name}
                                                                                </span>
                                                                                {item.specifications && (
                                                                                    <span className="text-[10px] text-muted-foreground truncate">
                                                                                        {item.specifications}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="py-1.5">
                                                                    {isEditing ? (
                                                                        <Select value={editUnit} onValueChange={setEditUnit}>
                                                                            <SelectTrigger className="h-7 text-xs bg-background">
                                                                                <SelectValue placeholder="Unit" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {units.map((u) => (
                                                                                    <SelectItem key={u} value={u} className="text-xs">
                                                                                        {u}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    ) : (
                                                                        <span className="text-xs font-mono font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/30">
                                                                            {item.unit}
                                                                        </span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="py-1.5">
                                                                    {isEditing ? (
                                                                        <Input
                                                                            type="number"
                                                                            value={editQuantity}
                                                                            onChange={(e) => setEditQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                                                                            className="h-7 text-xs font-mono bg-background text-right"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-xs font-mono font-semibold text-foreground">
                                                                            {item.quantity.toLocaleString()}
                                                                        </span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="py-1.5">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <div>{getStatusBadge(item.status)}</div>
                                                                        {item.addedBy && (
                                                                            <span className="text-[9px] text-muted-foreground/60 italic font-medium">
                                                                                by {item.addedBy}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="py-1.5 text-right pr-4">
                                                                    {isEditing ? (
                                                                        <div className="flex items-center justify-end gap-1">
                                                                            <Button
                                                                                onClick={() => handleSaveEdit(item.id)}
                                                                                size="sm"
                                                                                className="h-7 text-xs bg-primary hover:bg-primary/95 text-primary-foreground px-2.5 rounded flex items-center gap-1 shadow-sm"
                                                                            >
                                                                                <Check className="size-3.5" />
                                                                                Save
                                                                            </Button>
                                                                            <Button
                                                                                onClick={() => setEditingItemId(null)}
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-7 text-xs hover:bg-muted text-muted-foreground px-2.5 rounded border border-border/50"
                                                                            >
                                                                                <X className="size-3.5" />
                                                                                Cancel
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                                                                                onClick={(e) => handleStartEdit(item, e)}
                                                                                title="Edit Material"
                                                                            >
                                                                                <Edit2 className="size-3.5" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10 rounded"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    onDeleteMaterial(item.id);
                                                                                }}
                                                                                title="Delete Material"
                                                                            >
                                                                                <Trash2 className="size-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}

                                                    {/* Inline Add Form */}
                                                    {isAdding && (
                                                        <TableRow className="bg-primary/[0.01] border-b border-border/20">
                                                            <TableCell></TableCell>
                                                            <TableCell className="py-2">
                                                                <div className="flex items-center gap-1.5 pl-6 min-w-0">
                                                                    <CornerDownRight className="size-3 text-primary/40 shrink-0" />
                                                                    <div className="flex-1 flex flex-col gap-1">
                                                                        <AutoCompleteInput
                                                                            value={newName}
                                                                            onChange={setNewName}
                                                                            onUnitAutoFill={setNewUnit}
                                                                            disabled={false}
                                                                            catalog={catalog}
                                                                            isLoading={isLoadingCatalog}
                                                                            onCreateClick={(val) => {
                                                                                setCreateMaterialName(val);
                                                                                setCreateDialogOpen(true);
                                                                            }}
                                                                            placeholder="Select material..."
                                                                        />
                                                                        <Input
                                                                            placeholder="Specifications / Notes (optional)"
                                                                            value={newNotes}
                                                                            onChange={(e) => setNewNotes(e.target.value)}
                                                                            className="h-7 text-[11px] bg-background w-full"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-2">
                                                                <Select value={newUnit} onValueChange={setNewUnit}>
                                                                    <SelectTrigger className="h-8 text-xs bg-background">
                                                                        <SelectValue placeholder="Unit" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {units.map((u) => (
                                                                            <SelectItem key={u} value={u} className="text-xs">
                                                                                {u}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </TableCell>
                                                            <TableCell className="py-2">
                                                                <Input
                                                                    type="number"
                                                                    placeholder="0.00"
                                                                    value={newQuantity}
                                                                    onChange={(e) => setNewQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                                                                    className="h-8 text-xs font-mono bg-background text-right"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="py-2">
                                                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 text-[9px] font-semibold py-0.5 px-2 rounded uppercase tracking-wider">
                                                                    Planned
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="py-2 text-right pr-4">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <Button
                                                                        size="sm"
                                                                        className="h-8 text-xs bg-primary hover:bg-primary/95 text-primary-foreground px-3 rounded flex items-center gap-1 shadow-sm font-medium"
                                                                        onClick={() => handleSaveAdd(row.id)}
                                                                    >
                                                                        <Check className="size-3.5" />
                                                                        Add
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        className="size-7 text-muted-foreground hover:bg-muted"
                                                                        onClick={() => setAddingToSubtask(null)}
                                                                        title="Cancel"
                                                                    >
                                                                        <X className="size-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Create Material Catalog Item Dialog */}
            <CreateMaterialDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                workspaceId={workspaceId}
                units={units}
                initialName={createMaterialName}
                initialUnit={createMaterialUnit}
                onSuccess={handleCreateMaterialSuccess}
            />
        </div>
    );
}
