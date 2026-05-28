"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Package, Check, X, Edit2, Trash2, Plus, CornerDownRight, ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
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
    catalog: any[];
    isLoading: boolean;
    onCreateClick?: (val: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);

    const filtered = value
        ? catalog.filter((c) => c.name.toLowerCase().includes(value.toLowerCase()))
        : catalog;

    const exactMatch = catalog.some(
        (c) => c.name.toLowerCase() === value.trim().toLowerCase()
    );

    return (
        <div className="relative w-full">
            <Popover open={!!(open && (filtered.length > 0 || (value.trim() && !exactMatch)))} onOpenChange={setOpen}>
                <PopoverAnchor asChild>
                    <Input
                        placeholder={isLoading ? "Loading..." : placeholder || "e.g. TMT Steel 10mm"}
                        value={value}
                        onChange={(e) => {
                            onChange(e.target.value);
                            if (!open) setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        disabled={disabled || isLoading}
                        className="h-8 text-xs bg-background w-full border-border focus:ring-primary/20"
                    />
                </PopoverAnchor>
                <PopoverContent
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    className="w-[300px] p-0 bg-popover border border-border/80 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto overflow-x-hidden"
                    align="start"
                >
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-popover-foreground flex items-center justify-between transition-colors"
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
                            <span className="font-medium truncate mr-2">{item.name}</span>
                            {(item.defaultUnit?.abbreviation || item.unit) && (
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0 font-semibold uppercase">
                                    {item.defaultUnit?.abbreviation || item.unit}
                                </span>
                            )}
                        </div>
                    ))}
                    {value.trim() && !exactMatch && onCreateClick && (
                        <div
                            className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-primary flex items-center transition-colors font-medium border-t border-border/40"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCreateClick(value.trim());
                                setOpen(false);
                            }}
                        >
                            <Plus className="mr-2 size-3 text-primary shrink-0" /> Create &quot;{value.trim()}&quot;
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
    const [catalog, setCatalog] = useState<any[]>([]);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createMaterialName, setCreateMaterialName] = useState("");
    const [createMaterialUnit, setCreateMaterialUnit] = useState(units[0] || "PCS");

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

    const handleCreateMaterialSuccess = async (createdMaterial: any) => {
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
        <div className="border border-border/60 bg-card/30 backdrop-blur-sm overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
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
                            <TableHead className="w-[15%] text-xs font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Actions</TableHead>
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
                                                    {/* {row.id === "orphaned" ? (
                                                        <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                                                    ) : (
                                                        <ListChecks className="size-4 text-primary/75 shrink-0" />
                                                    )} */}
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
                                                <div className="flex items-center gap-1.5">
                                                    <Badge variant="secondary" className="bg-primary/[0.04] text-primary hover:bg-primary/[0.04] text-[10px] py-0 px-2 font-mono border border-primary/5">
                                                        {row.materials.length} Planning Items
                                                    </Badge>
                                                </div>
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
                                                    className="h-7 text-[10px] font-semibold text-primary hover:text-primary hover:bg-primary/5 gap-1 px-2 border border-primary/10 rounded-lg transition-all"
                                                >
                                                    <Plus className="size-3" /> Add Material
                                                </Button>
                                            </TableCell>
                                        </TableRow>

                                        {/* Child Rows (Materials level) */}
                                        {isExpanded && (
                                            <>
                                                {row.materials.map((material, idx) => {
                                                    const isEditing = editingItemId === material.id;

                                                    if (isEditing) {
                                                        return (
                                                            <TableRow
                                                                key={material.id}
                                                                className="bg-primary/[0.01] border-b border-border/40 hover:bg-primary/[0.02]"
                                                            >
                                                                <TableCell className="relative py-1.5">
                                                                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border/40 -translate-x-1/2" />
                                                                </TableCell>
                                                                <TableCell className="pl-6 py-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-1/2 min-w-[140px]">
                                                                            <AutoCompleteInput
                                                                                value={editName}
                                                                                onChange={setEditName}
                                                                                onUnitAutoFill={setEditUnit}
                                                                                catalog={catalog}
                                                                                isLoading={isLoadingCatalog}
                                                                                disabled={false}
                                                                                onCreateClick={(val) => {
                                                                                    setCreateMaterialName(val);
                                                                                    setCreateMaterialUnit(editUnit);
                                                                                    setCreateDialogOpen(true);
                                                                                }}
                                                                                placeholder="Select material..."
                                                                            />
                                                                        </div>
                                                                        <div className="w-1/2 min-w-[120px]">
                                                                            <Input
                                                                                value={editNotes}
                                                                                onChange={(e) => setEditNotes(e.target.value)}
                                                                                placeholder="Specifications..."
                                                                                className="h-8 text-xs bg-background border-border w-full"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="py-1.5">
                                                                    <Select value={editUnit} onValueChange={setEditUnit}>
                                                                        <SelectTrigger className="h-8 text-xs bg-background border-border">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {units.map((unit) => (
                                                                                <SelectItem key={unit} value={unit} className="text-xs">
                                                                                    {unit}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </TableCell>
                                                                <TableCell className="py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        value={editQuantity}
                                                                        onChange={(e) => setEditQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                                                                        placeholder="Qty"
                                                                        className="h-8 text-xs bg-background border-border w-full font-mono"
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="py-1.5 text-xs text-muted-foreground">
                                                                    Editing...
                                                                </TableCell>
                                                                <TableCell className="py-1.5 text-right pr-4">
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="size-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                                                                            onClick={() => handleSaveEdit(material.id)}
                                                                            title="Save Changes"
                                                                        >
                                                                            <Check className="size-4" />
                                                                        </Button>
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="size-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                                            onClick={() => setEditingItemId(null)}
                                                                            title="Cancel"
                                                                        >
                                                                            <X className="size-4" />
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    }

                                                    return (
                                                        <TableRow
                                                            key={material.id}
                                                            className="hover:bg-muted/5 border-b border-border/30 bg-background/30 transition-colors group"
                                                        >
                                                            <TableCell className="relative py-1.5">
                                                                {/* Visual hierarchy tree connector line */}
                                                                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border/40 -translate-x-1/2" />
                                                                {(idx === row.materials.length - 1 && !isAdding) && (
                                                                    <div className="absolute left-1/2 bottom-0 top-1/2 w-0.5 bg-background -translate-x-1/2" />
                                                                )}
                                                                <div className="absolute left-1/2 top-1/2 w-3 h-0.5 bg-border/40" />
                                                            </TableCell>
                                                            <TableCell className="pl-6 py-1.5">
                                                                <div className="flex items-center gap-2 w-full min-w-0">
                                                                    <Package className="size-3.5 text-muted-foreground/75 group-hover:text-primary transition-colors shrink-0" />
                                                                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                                                        <span className="font-medium text-xs text-foreground truncate max-w-[240px]" title={material.name}>
                                                                            {material.name}
                                                                        </span>
                                                                        {material.specifications && (
                                                                            <span className="text-[10px] text-muted-foreground/60 font-normal italic shrink-0" title={material.specifications}>
                                                                                · {material.specifications}
                                                                            </span>
                                                                        )}
                                                                        {/* If orphaned, show snapshot context */}
                                                                        {material.subtaskId === null && (
                                                                            <span className="text-[9px] text-amber-500 font-medium shrink-0 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10">
                                                                                ⚠ Deleted Task: {material.subtaskNameSnapshot || "Unknown"}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-1.5">
                                                                <span className="text-[10px] font-bold uppercase text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border/40">
                                                                    {material.unit}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="py-1.5 font-mono text-xs font-semibold text-foreground">
                                                                {material.quantity.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="py-1.5 flex flex-col gap-0.5">
                                                                {getStatusBadge(material.status)}
                                                                {material.addedBy && (
                                                                    <span className="text-[9px] text-muted-foreground/70 mt-0.5 truncate max-w-[100px]">
                                                                        By: {material.addedBy}
                                                                    </span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="py-1.5 text-right pr-4">
                                                                <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-1 transition-opacity">
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="size-7 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded"
                                                                        onClick={(e) => handleStartEdit(material, e)}
                                                                        title="Edit Requirement"
                                                                    >
                                                                        <Edit2 className="size-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="size-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded"
                                                                        onClick={() => onDeleteMaterial(material.id)}
                                                                        title="Remove Requirement"
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}

                                                {/* Add Material Row Form */}
                                                {isAdding && (
                                                    <TableRow className="bg-primary/[0.01] border-b border-border/45">
                                                        <TableCell className="relative py-1.5">
                                                            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border/40 -translate-x-1/2" />
                                                            <div className="absolute left-1/2 bottom-0 top-1/2 w-0.5 bg-background -translate-x-1/2" />
                                                            <div className="absolute left-1/2 top-1/2 w-3 h-0.5 bg-border/40" />
                                                        </TableCell>
                                                        <TableCell className="pl-6 py-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-1/2 min-w-[140px]">
                                                                    <AutoCompleteInput
                                                                        value={newName}
                                                                        onChange={setNewName}
                                                                        onUnitAutoFill={setNewUnit}
                                                                        catalog={catalog}
                                                                        isLoading={isLoadingCatalog}
                                                                        disabled={false}
                                                                        onCreateClick={(val) => {
                                                                            setCreateMaterialName(val);
                                                                            setCreateMaterialUnit(newUnit);
                                                                            setCreateDialogOpen(true);
                                                                        }}
                                                                        placeholder="Select material..."
                                                                    />
                                                                </div>
                                                                <div className="w-1/2 min-w-[120px]">
                                                                    <Input
                                                                        value={newNotes}
                                                                        onChange={(e) => setNewNotes(e.target.value)}
                                                                        placeholder="Specifications..."
                                                                        className="h-8 text-xs bg-background border-border w-full"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-1.5">
                                                            <Select value={newUnit} onValueChange={setNewUnit}>
                                                                <SelectTrigger className="h-8 text-xs bg-background border-border">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {units.map((unit) => (
                                                                        <SelectItem key={unit} value={unit} className="text-xs">
                                                                            {unit}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="py-1.5">
                                                            <Input
                                                                type="number"
                                                                value={newQuantity}
                                                                onChange={(e) => setNewQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                                                                placeholder="Qty"
                                                                className="h-8 text-xs bg-background border-border w-full font-mono"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-1.5 text-xs text-muted-foreground/60">
                                                            New Schedule
                                                        </TableCell>
                                                        <TableCell className="py-1.5 text-right pr-4">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="size-7 text-primary hover:bg-primary/5 border border-primary/10"
                                                                    onClick={() => handleSaveAdd(row.id)}
                                                                    title="Save"
                                                                >
                                                                    <Check className="size-4" />
                                                                </Button>
                                                                <Button
                                                                    size="icon"
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
