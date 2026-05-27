"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const COMMON_UNITS = [
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "bags", label: "Bags" },
  { value: "cum", label: "Cubic Meters (cum)" },
  { value: "sqft", label: "Square Feet (sqft)" },
  { value: "rft", label: "Running Feet (rft)" },
  { value: "ton", label: "Tons" },
  { value: "liters", label: "Liters" },
  { value: "nos", label: "Numbers (nos)" },
];

// ---------------------------------------------------------------------------
// AutoCompleteInput
// ---------------------------------------------------------------------------
function AutoCompleteInput({
  value,
  onChange,
  onUnitAutoFill,
  disabled,
  catalog,
  isLoading,
  currentUnit,
  onFocusTrigger,
}: {
  value: string;
  onChange: (val: string) => void;
  onUnitAutoFill?: (unit: string) => void;
  disabled: boolean;
  catalog: any[];
  isLoading: boolean;
  currentUnit?: string;
  onFocusTrigger?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("pcs");
  const [customUnit, setCustomUnit] = useState("");

  const filtered = value
    ? catalog.filter((c) => c.name.toLowerCase().includes(value.toLowerCase()))
    : catalog;

  const exactMatch = catalog.some(
    (c) => c.name.toLowerCase() === value.trim().toLowerCase()
  );

  // Auto-fill unit if the user types or enters the exact name of an existing material
  useEffect(() => {
    if (!value.trim()) return;
    const matched = catalog.find(
      (c) => c.name.toLowerCase() === value.trim().toLowerCase()
    );
    if (matched && matched.defaultUnit?.abbreviation && onUnitAutoFill) {
      if (currentUnit !== matched.defaultUnit.abbreviation) {
        onUnitAutoFill(matched.defaultUnit.abbreviation);
      }
    }
  }, [value, catalog, onUnitAutoFill, currentUnit]);

  return (
    <div className="relative w-full">
      <Popover open={!!(open && (filtered.length > 0 || (value.trim() && !exactMatch)))} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            placeholder={isLoading ? "Loading..." : "e.g. TMT Steel 10mm"}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!open) setOpen(true);
              if (onFocusTrigger) onFocusTrigger();
            }}
            onFocus={() => {
              setOpen(true);
              if (onFocusTrigger) onFocusTrigger();
            }}
            disabled={disabled || isLoading}
            className="h-8 text-xs bg-background"
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
              className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-popover-foreground flex items-center transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(item.name);
                if (item.defaultUnit?.abbreviation && onUnitAutoFill) {
                  onUnitAutoFill(item.defaultUnit.abbreviation);
                }
                setOpen(false);
              }}
            >
              {item.name}
            </div>
          ))}
          {value.trim() && !exactMatch && (
            <div
              className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-primary flex items-center transition-colors font-medium border-t border-border/40"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNewMaterialName(value.trim());
                setSelectedUnit("pcs");
                setCustomUnit("");
                setDialogOpen(true);
                setOpen(false);
              }}
            >
              + Create &quot;{value.trim()}&quot;
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Create New Material
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-material-name" className="text-xs font-bold text-muted-foreground uppercase">
                Material Name
              </Label>
              <Input
                id="new-material-name"
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-material-unit" className="text-xs font-bold text-muted-foreground uppercase">
                Default Unit
              </Label>
              <select
                id="new-material-unit"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
                <option value="custom">Other / Custom</option>
              </select>
            </div>
            {selectedUnit === "custom" && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <Label htmlFor="custom-unit" className="text-xs font-bold text-muted-foreground uppercase">
                  Custom Unit Name
                </Label>
                <Input
                  id="custom-unit"
                  placeholder="e.g. box, roll"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="h-8 text-xs px-3"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!newMaterialName.trim()) {
                  toast.error("Please enter a material name");
                  return;
                }
                const unitToUse = selectedUnit === "custom" ? customUnit.trim() : selectedUnit;
                if (!unitToUse) {
                  toast.error("Please enter a unit");
                  return;
                }
                onChange(newMaterialName.trim());
                if (onUnitAutoFill) {
                  onUnitAutoFill(unitToUse);
                }
                setDialogOpen(false);
              }}
              className="h-8 text-xs px-3"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LineItemInput {
  materialName: string;
  unit: string;
  quantity: number;
  specifications?: string;
}

interface CreateIndentFormProps {
  taskId?: string;
  projectId?: string;
  projectName?: string;
  lockedProject?: boolean;
  workspaceId: string;
  tasks?: { id: string; name: string; taskSlug?: string; dueDate?: Date | string | null }[];
  projects?: { id: string; name: string; slug: string }[];
  onSuccess: (indent: any) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// CreateIndentForm
// ---------------------------------------------------------------------------
export function CreateIndentForm({
  taskId,
  projectId = "",
  projectName = "",
  lockedProject = false,
  workspaceId,
  tasks = [],
  projects = [],
  onSuccess,
  onCancel,
}: CreateIndentFormProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeProjectId, setActiveProjectId] = useState(projectId);
  const [projectError, setProjectError] = useState("");
  const [projectTasks, setProjectTasks] = useState(tasks);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(taskId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { materialName: "", unit: "pcs", quantity: 1, specifications: "" },
  ]);
  const [shouldLoadCatalog, setShouldLoadCatalog] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Dynamic fetch of project tasks if we change projects at workspace level
  useEffect(() => {
    // If we are at project level, use the tasks prop
    if (projectId) {
      setProjectTasks(tasks);
      return;
    }

    // If we are at workspace level, fetch tasks when activeProjectId changes
    if (!activeProjectId) {
      if (projectTasks.length > 0) {
        setProjectTasks([]);
      }
      return;
    }

    let mounted = true;
    const fetchProjectTasks = async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/projects/${activeProjectId}/tasks?w=${workspaceId}`);
        const json = await res.json();
        if (mounted && json.success && json.data) {
          setProjectTasks(json.data);
        }
      } catch (err) {
        console.error("Failed to load project tasks", err);
      }
    };
    fetchProjectTasks();
    return () => { mounted = false; };
  }, [activeProjectId, projectId, workspaceId]);

  // Auto-fill expected delivery date when taskId changes or is prefilled
  useEffect(() => {
    const tId = taskId || selectedTaskId;
    if (tId && projectTasks.length > 0) {
      const selected = projectTasks.find((t) => t.id === tId);
      if (selected?.dueDate) {
        try {
          const dateStr = new Date(selected.dueDate).toISOString().split("T")[0];
          setExpectedDelivery(dateStr);
        } catch (e) {
          console.error("Invalid task due date", e);
        }
      }
    }
  }, [taskId, selectedTaskId, projectTasks]);

  const handleTaskChange = (val: string) => {
    setSelectedTaskId(val);
    if (val) {
      const selected = projectTasks.find((t) => t.id === val);
      if (selected?.dueDate) {
        try {
          const dateStr = new Date(selected.dueDate).toISOString().split("T")[0];
          setExpectedDelivery(dateStr);
        } catch (e) {
          console.error("Invalid task due date", e);
        }
      }
    }
  };

  useEffect(() => {
    if (!shouldLoadCatalog) return;

    let mounted = true;
    setIsLoadingCatalog(true);
    const fetchCatalog = async () => {
      try {
        const res = await fetch(`/api/v1/procurement/vendors/materials/all?w=${workspaceId}`);
        const json = await res.json();
        if (mounted && json.success && json.data) {
          setCatalog(json.data);
        }
      } catch (err) {
        console.error("Failed to load catalog", err);
      } finally {
        if (mounted) setIsLoadingCatalog(false);
      }
    };
    fetchCatalog();
    return () => { mounted = false; };
  }, [workspaceId, shouldLoadCatalog]);

  const handleAddRow = () => {
    setLineItems([
      ...lineItems,
      { materialName: "", unit: "pcs", quantity: 1, specifications: "" },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof LineItemInput, value: any) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeProjectId) {
      setProjectError("Please select a project");
      toast.error("Please select a project");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter an indent name");
      return;
    }
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.materialName.trim()) {
        toast.error(`Please enter material name for item ${i + 1}`);
        return;
      }
      if (!item.unit.trim()) {
        toast.error(`Please enter unit for item ${i + 1}`);
        return;
      }
      if (item.quantity <= 0) {
        toast.error(`Quantity must be greater than 0 for item ${i + 1}`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload = {
        taskId: selectedTaskId || undefined,
        projectId: activeProjectId,
        workspaceId,
        name,
        description: description || undefined,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery).toISOString() : undefined,
        lineItems: lineItems.map((item) => ({
          materialName: item.materialName.trim(),
          unit: item.unit.trim(),
          quantity: Number(item.quantity),
          specifications: item.specifications?.trim() || undefined,
        })),
      };

      const res = await fetch(`/api/v1/procurement/indents?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create indent");

      toast.success("Indent created successfully");
      onSuccess(json.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to create indent");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-full bg-background rounded-lg border border-border p-5 gap-5 overflow-hidden"
    >
      {/* Title & Indent ID */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold tracking-tight text-foreground">Create Indent</h3>
          <p className="text-xs text-muted-foreground">
            Create an indent to request materials or services.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 bg-muted/40 px-3 py-1.5 rounded-md border border-border/80">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Indent ID</span>
          <span className="text-xs font-semibold text-foreground">Auto-assigned on save</span>
        </div>
      </div>

      {/* ── Split Panel ── */}
      <div className="flex flex-1 gap-5 overflow-hidden min-h-0">

        {/* ── LEFT: Indent Details ── */}
        <div className="flex flex-col gap-4 w-[30%] overflow-y-auto pr-2">

          {/* Project Selector (only workspace level or locked display) */}
          {lockedProject && activeProjectId ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Project <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border/80 bg-muted/40 text-xs font-semibold text-muted-foreground">
                <span>{projectName || "Selected Project"}</span>
                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border/50 flex items-center gap-1">
                  🔒 Locked
                </span>
              </div>
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="indent-project" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Project <span className="text-destructive">*</span>
              </Label>
              <select
                id="indent-project"
                value={activeProjectId}
                onChange={(e) => {
                  setActiveProjectId(e.target.value);
                  setProjectError("");
                  setSelectedTaskId(""); // reset task link when project changes
                }}
                disabled={isSubmitting}
                className={`flex h-9 w-full rounded-md border ${
                  projectError ? "border-destructive focus-visible:ring-destructive" : "border-input"
                } bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">Select a Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {projectError && (
                <p className="text-[11px] text-destructive font-medium mt-0.5">{projectError}</p>
              )}
            </div>
          ) : null}

          {/* Task Selector */}
          {!taskId && projectTasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="indent-task" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Link to Subtask (Optional)
              </Label>
              <select
                id="indent-task"
                value={selectedTaskId}
                onChange={(e) => handleTaskChange(e.target.value)}
                disabled={isSubmitting}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">None / Project-level</option>
                {projectTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Indent Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="indent-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Indent Name
            </Label>
            <Input
              id="indent-name"
              placeholder="e.g. Screws and Bolts for Block A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="h-9"
            />
          </div>

          {/* Expected Delivery */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expected-delivery" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Expected Delivery Date
            </Label>
            <Input
              id="expected-delivery"
              type="date"
              value={expectedDelivery}
              onChange={(e) => setExpectedDelivery(e.target.value)}
              disabled={isSubmitting}
              className="h-9"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="indent-description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Description (Optional)
            </Label>
            <Textarea
              id="indent-description"
              placeholder="Provide optional details or guidelines..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>

        {/* ── RIGHT: Line Items ── */}
        <div className="flex flex-col gap-3 w-[70%] border-l border-border/30 pl-5 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Line Items / Materials
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              disabled={isSubmitting}
              className="h-7 text-xs flex items-center gap-1 hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Add Row
            </Button>
          </div>

          {/* Rows Table */}
          <div className="flex-1 overflow-y-auto pr-1">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-xs">Material Name</TableHead>
                  <TableHead className="text-xs w-[90px]">Unit</TableHead>
                  <TableHead className="text-xs w-[90px]">Qty</TableHead>
                  <TableHead className="text-xs">Specifications (Optional)</TableHead>
                  <TableHead className="text-xs text-right w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, index) => (
                  <TableRow key={index} className="hover:bg-muted/5">
                    <TableCell className="py-2">
                      <AutoCompleteInput
                        value={item.materialName}
                        currentUnit={item.unit}
                        onChange={(val) => handleRowChange(index, "materialName", val)}
                        onUnitAutoFill={(unit) => handleRowChange(index, "unit", unit)}
                        onFocusTrigger={() => setShouldLoadCatalog(true)}
                        disabled={isSubmitting}
                        catalog={catalog}
                        isLoading={isLoadingCatalog}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        placeholder="pcs"
                        value={item.unit}
                        onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs bg-background"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="number"
                        placeholder="10"
                        value={item.quantity}
                        onChange={(e) =>
                          handleRowChange(index, "quantity", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        disabled={isSubmitting}
                        className="h-8 text-xs bg-background font-mono"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        placeholder="e.g. Grade 500D"
                        value={item.specifications || ""}
                        onChange={(e) => handleRowChange(index, "specifications", e.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs bg-background text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRow(index)}
                        disabled={lineItems.length === 1 || isSubmitting}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── Footer Actions ── */}
      <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-4 shrink-0">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-9 text-xs"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95"
        >
          {isSubmitting ? "Creating..." : "Create Indent →"}
        </Button>
      </div>
    </form>
  );
}
