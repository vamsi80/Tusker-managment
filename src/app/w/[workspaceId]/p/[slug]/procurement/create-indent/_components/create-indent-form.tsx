"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Check, ChevronsUpDown, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FALLBACK_UNITS } from "@/lib/procurement/units";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuotationImportDialog, type ImportedItem } from "@/app/w/[workspaceId]/_components/procurement/quotation-import-dialog";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const query = value.trim().toLowerCase();
  const suggestions = catalog
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, 20);

  // The rows table scrolls, and an absolutely placed menu inside it gets
  // clipped to the row. Rendered against the body instead, and re-anchored
  // while it is open.
  const placeMenu = useCallback(() => {
    const box = inputRef.current?.getBoundingClientRect();
    if (box) setAnchor({ left: box.left, top: box.bottom + 4, width: box.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", placeMenu, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      window.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [open, placeMenu]);

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
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          placeMenu();
          setOpen(true);
        }}
        onFocus={() => {
           if (onFocusTrigger) onFocusTrigger();
           placeMenu();
           setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        // Never disabled while the catalog loads: that dropped the focus the
        // click had just given, and the field had to be clicked a second time.
        disabled={disabled}
        placeholder={isLoading ? "Enter material... (loading suggestions)" : "Enter material..."}
        className="h-8 text-xs bg-background font-medium px-2"
        autoComplete="off"
      />
      {open && !isLoading && value.trim() && suggestions.length > 0 && anchor && createPortal(
        <div
          role="listbox"
          style={{ position: "fixed", left: anchor.left, top: anchor.top, width: Math.max(anchor.width, 260) }}
          className="z-[100] max-h-[320px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Use a remembered material
          </div>
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(item.name);
                if (item.defaultUnit?.abbreviation && onUnitAutoFill) {
                  onUnitAutoFill(item.defaultUnit.abbreviation);
                }
                setOpen(false);
              }}
            >
              <span className="font-medium">{item.name}</span>
              {item.defaultUnit?.abbreviation && (
                <span className="text-[10px] text-muted-foreground">{item.defaultUnit.abbreviation}</span>
              )}
            </button>
          ))}
          <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
            Keep typing to use a new material name.
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LineItemInput {
  materialName: string;
  unit: string;
  quantity: number | "";
  specifications?: string;
  unitPrice?: string | number;
  totalPrice?: string | number;
}

interface CreateIndentFormProps {
  taskId?: string;
  projectId?: string;
  projectName?: string;
  lockedProject?: boolean;
  /** True for the entry points inside a project, which routes manager approval
   * to the project manager instead of the raiser's reporting manager. */
  raisedInProject?: boolean;
  workspaceId: string;
  tasks?: { id: string; name: string; taskSlug?: string; dueDate?: Date | string | null }[];
  projects?: { id: string; name: string; slug: string }[];
  onSuccess: (indent: any) => void;
  onCancel?: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);

const optionalPercent = (value: string) => (value === "" ? undefined : Number(value));
/** Flat charges travel in paise, like every other money field. */
const optionalAmount = (value: string) => (value === "" ? undefined : Math.round(Number(value) * 100));

// ---------------------------------------------------------------------------
// CreateIndentForm
// ---------------------------------------------------------------------------
export function CreateIndentForm({
  taskId,
  projectId = "",
  projectName = "",
  lockedProject = false,
  raisedInProject = false,
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
  // Asked only in the global hub: a "No" makes this a general indent with no
  // project, which then shows up only in the workspace-wide indent list.
  const [isProjectRelated, setIsProjectRelated] = useState(true);
  const asksProjectQuestion = !lockedProject && !raisedInProject;
  const needsProject = !asksProjectQuestion || isProjectRelated;
  const [projectError, setProjectError] = useState("");
  const [projectTasks, setProjectTasks] = useState(tasks);
  const [description, setDescription] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [exciseDutyPercent, setExciseDutyPercent] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [includeTax, setIncludeTax] = useState(false);
  const [includeExciseDuty, setIncludeExciseDuty] = useState(false);
  const [includeVat, setIncludeVat] = useState(false);
  const [transportCharge, setTransportCharge] = useState("");
  const [labourCharge, setLabourCharge] = useState("");
  const [includeTransport, setIncludeTransport] = useState(false);
  const [includeLabour, setIncludeLabour] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(taskId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { materialName: "", unit: "pcs", quantity: 1, unitPrice: "", totalPrice: "" },
  ]);
  const [shouldLoadCatalog, setShouldLoadCatalog] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  // Approvers Multi-Select
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [approverError, setApproverError] = useState("");
  const [owners, setOwners] = useState<any[]>([]);
  const [ownersOpen, setOwnersOpen] = useState(false);

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
    // Fetch units and owners
    const fetchUnits = async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/units?w=${workspaceId}`);
        const json = await res.json();
        if (json.success && json.data) setUnits(json.data);
      } catch (err) {
        console.error("Failed to load units", err);
      }
    };
    const fetchOwners = async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/members/slim`);
        const json = await res.json();
        if (json.success && json.data) {
          const workspaceOwners = json.data.filter((m: any) => m.workspaceRole === "OWNER");
          setOwners(workspaceOwners);
        }
      } catch (err) {
        console.error("Failed to fetch owners", err);
      }
    };

    fetchUnits();
    fetchOwners();
  }, [workspaceId]);

  useEffect(() => {
    if (!shouldLoadCatalog) return;

    let mounted = true;
    setIsLoadingCatalog(true);
    const fetchCatalogAndUnits = async () => {
      try {
        const catalogRes = await fetch(`/api/v1/materials?w=${workspaceId}`);
        const catalogJson = await catalogRes.json();

        if (mounted && catalogJson.success && catalogJson.data) {
          setCatalog(catalogJson.data);
        }
      } catch (err) {
        console.error("Failed to load catalog", err);
      } finally {
        if (mounted) setIsLoadingCatalog(false);
      }
    };
    fetchCatalogAndUnits();
    return () => { mounted = false; };
  }, [workspaceId, shouldLoadCatalog]);

  const handleAddRow = () => {
    setLineItems([
      ...lineItems,
      { materialName: "", unit: "pcs", quantity: 1, unitPrice: "", totalPrice: "" },
    ]);
  };

  const [isImportOpen, setIsImportOpen] = useState(false);

  /**
   * Imported rows land in the same editable table as typed ones — nothing is
   * saved here. Rows the user already typed are kept and the import appends to
   * them; only the untouched blank starter row is replaced.
   */
  const handleImportedItems = (items: ImportedItem[]) => {
    const importedRows: LineItemInput[] = items.map((item) => {
      // The indent stores whole units; a fractional quotation quantity is rounded
      // up rather than down so the site never under-orders.
      const quantity = item.quantity && item.quantity > 0 ? Math.ceil(item.quantity) : 1;
      const unitPrice = item.unitPrice !== null && item.unitPrice > 0 ? item.unitPrice : "";
      return {
        materialName: item.itemName,
        unit: item.unit || "pcs",
        quantity,
        specifications: item.description,
        unitPrice,
        totalPrice: unitPrice === "" ? "" : Math.round(Number(unitPrice) * quantity * 100) / 100,
      };
    });

    const hasTypedRows = lineItems.some(
      (item) => item.materialName.trim() !== "" || item.unitPrice !== "" || item.totalPrice !== ""
    );
    setLineItems(hasTypedRows ? [...lineItems, ...importedRows] : importedRows);
    toast.success(`${importedRows.length} items added — review them before creating the indent`);
  };

  const handleRemoveRow = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof LineItemInput, value: any) => {
    setLineItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      
      const qty = Number(item.quantity) || 0;
      
      if (field === 'quantity') {
        if (item.unitPrice !== "" && item.unitPrice !== undefined && !isNaN(Number(item.unitPrice))) {
          item.totalPrice = Math.round((Number(item.unitPrice) * qty) * 100) / 100;
        } else if (item.totalPrice !== "" && item.totalPrice !== undefined && qty > 0 && !isNaN(Number(item.totalPrice))) {
          item.unitPrice = Math.round((Number(item.totalPrice) / qty) * 100) / 100;
        }
      } else if (field === 'unitPrice') {
        if (value !== "" && !isNaN(Number(value))) {
          item.totalPrice = Math.round((Number(value) * qty) * 100) / 100;
        } else if (value === "") {
          item.totalPrice = "";
        }
      } else if (field === 'totalPrice') {
        if (value !== "" && !isNaN(Number(value)) && qty > 0) {
          item.unitPrice = Math.round((Number(value) / qty) * 100) / 100;
        } else if (value === "") {
          item.unitPrice = "";
        }
      }
      
      updated[index] = item;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (needsProject && !activeProjectId) {
      setProjectError("Please select a project");
      toast.error("Please select a project");
      return;
    }
    if (approverIds.length === 0) {
      setApproverError("Select at least one owner for approval");
      toast.error("Select at least one owner for approval");
      return;
    }
    const charges = [
      ["Tax", taxPercent],
      ["Excise duty", exciseDutyPercent],
      ["VAT", vatPercent],
    ] as const;
    for (const [label, value] of charges) {
      const parsed = Number(value);
      if (value !== "" && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)) {
        toast.error(`${label} must be between 0% and 100%`);
        return;
      }
    }
    const flatCharges = [
      ["Transportation charge", transportCharge],
      ["Labour charge", labourCharge],
    ] as const;
    for (const [label, value] of flatCharges) {
      const parsed = Number(value);
      if (value !== "" && (!Number.isFinite(parsed) || parsed < 0)) {
        toast.error(`${label} must be a positive amount`);
        return;
      }
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
      if (Number(item.quantity) <= 0) {
        toast.error(`Quantity must be greater than 0 for item ${i + 1}`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload = {
        projectId: needsProject ? activeProjectId : undefined,
        taskId: needsProject ? selectedTaskId || undefined : undefined,
        raisedInProject,
        workspaceId,
        description: description || undefined,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery).toISOString() : undefined,
        taxPercent: optionalPercent(taxPercent),
        exciseDutyPercent: optionalPercent(exciseDutyPercent),
        vatPercent: optionalPercent(vatPercent),
        transportCharge: optionalAmount(transportCharge),
        labourCharge: optionalAmount(labourCharge),
        approverIds,
        lineItems: lineItems.map((item) => ({
          materialName: item.materialName.trim(),
          unit: item.unit.trim(),
          quantity: Number(item.quantity),
          estimatedUnitPrice: item.unitPrice ? Math.round(Number(item.unitPrice) * 100) : undefined,
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

  const displayedUnits = units.length > 0 ? units : FALLBACK_UNITS;
  const estimatedSubtotal = lineItems.reduce((total, item) => {
    const unitPrice = Number(item.unitPrice);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(unitPrice) || !Number.isFinite(quantity) || unitPrice <= 0 || quantity <= 0) return total;
    return total + (Math.round(unitPrice * 100) / 100) * quantity;
  }, 0);
  const chargePercentTotal = [taxPercent, exciseDutyPercent, vatPercent].reduce(
    (total, value) => total + (Number(value) || 0),
    0
  );
  const flatChargeTotal = [transportCharge, labourCharge].reduce(
    (total, value) => total + (Number(value) || 0),
    0
  );
  // Percentages apply to the materials only - flat charges are added on top.
  const estimatedCharges = estimatedSubtotal * (chargePercentTotal / 100) + flatChargeTotal;
  const anyChargeSelected =
    includeTax || includeExciseDuty || includeVat || includeTransport || includeLabour;

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
        <div className="flex flex-col gap-4 w-[25%] lg:w-[22%] overflow-y-auto pr-2">

          {asksProjectQuestion && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Is this related to a project? <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                {[
                  { label: "Yes", value: true },
                  { label: "No", value: false },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setIsProjectRelated(option.value);
                      setProjectError("");
                      if (!option.value) {
                        setActiveProjectId("");
                        setSelectedTaskId("");
                      }
                    }}
                    className={`flex h-9 flex-1 items-center justify-center rounded-md border text-xs font-semibold transition-colors disabled:opacity-50 ${
                      isProjectRelated === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {!isProjectRelated && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Saved as a general indent. It appears in the workspace indent list only, not under
                  any project.
                </p>
              )}
            </div>
          )}

          {/* Project Selector (only workspace level or locked display) */}
          {!needsProject ? null : lockedProject && activeProjectId ? (
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

          {/* Approval Required By */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Approval Required By <span className="text-destructive">*</span>
            </Label>
            <Popover open={ownersOpen} onOpenChange={setOwnersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={ownersOpen}
                  aria-invalid={Boolean(approverError)}
                  aria-describedby={approverError ? "approver-error" : undefined}
                  className={`w-full justify-between h-9 text-xs ${
                    approverError ? "border-destructive focus-visible:ring-destructive" : ""
                  }`}
                  disabled={isSubmitting}
                >
                  {approverIds.length > 0
                    ? `${approverIds.length} owner(s) selected`
                    : "Select owners..."}
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <div className="max-h-[200px] overflow-y-auto py-1">
                  {owners.map((owner) => (
                    <div
                      key={owner.id}
                      onClick={() => {
                        setApproverError("");
                        setApproverIds(prev => 
                          prev.includes(owner.id) 
                            ? prev.filter(id => id !== owner.id)
                            : [...prev, owner.id]
                        );
                      }}
                      className="flex items-center space-x-2 px-3 py-2 cursor-pointer hover:bg-muted text-xs"
                    >
                      <div className={`flex h-4 w-4 items-center justify-center rounded-sm border ${approverIds.includes(owner.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-primary/50'}`}>
                        {approverIds.includes(owner.id) && <Check className="h-3 w-3" />}
                      </div>
                      <span className="flex-1 truncate">{owner.surname || "Owner"} ({owner.email})</span>
                    </div>
                  ))}
                  {owners.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No owners found</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {approverError && (
              <p id="approver-error" className="mt-0.5 text-[11px] font-medium text-destructive">
                {approverError}
              </p>
            )}
          </div>

          {/* Optional charges */}
          <div className="flex flex-col gap-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Additional Charges (Optional)
              </Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Select only the charges that apply.
              </p>
            </div>
            {[
              {
                id: "include-indent-tax",
                label: "Add Tax",
                checked: includeTax,
                setChecked: setIncludeTax,
                clearValue: () => setTaxPercent(""),
              },
              {
                id: "include-indent-excise",
                label: "Add Excise Duty",
                checked: includeExciseDuty,
                setChecked: setIncludeExciseDuty,
                clearValue: () => setExciseDutyPercent(""),
              },
              {
                id: "include-indent-vat",
                label: "Add VAT",
                checked: includeVat,
                setChecked: setIncludeVat,
                clearValue: () => setVatPercent(""),
              },
              {
                id: "include-indent-transport",
                label: "Add Transportation Charge",
                checked: includeTransport,
                setChecked: setIncludeTransport,
                clearValue: () => setTransportCharge(""),
              },
              {
                id: "include-indent-labour",
                label: "Add Labour Charge",
                checked: includeLabour,
                setChecked: setIncludeLabour,
                clearValue: () => setLabourCharge(""),
              },
            ].map((charge) => (
              <div
                key={charge.id}
                className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2"
              >
                <Checkbox
                  id={charge.id}
                  checked={charge.checked}
                  onCheckedChange={(checked) => {
                    const isSelected = checked === true;
                    charge.setChecked(isSelected);
                    if (!isSelected) charge.clearValue();
                  }}
                  disabled={isSubmitting}
                />
                <Label htmlFor={charge.id} className="cursor-pointer text-xs font-medium">
                  {charge.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Line Items ── */}
        <div className="flex flex-col gap-3 flex-1 border-l border-border/30 pl-5 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Line Items / Materials
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsImportOpen(true)}
                disabled={isSubmitting}
                className="h-7 text-xs flex items-center gap-1 hover:bg-muted"
              >
                <FileUp className="size-3" /> Upload Quotation
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                disabled={isSubmitting}
                className="h-7 text-xs flex items-center gap-1 hover:bg-muted"
              >
                <Plus className="size-3" /> Add Row
              </Button>
            </div>
          </div>


          {/* Rows Table */}
          <div className="flex-1 overflow-y-auto pr-1">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-xs">Material Name / Description</TableHead>
                  <TableHead className="text-xs w-[90px]">Unit</TableHead>
                  <TableHead className="text-xs w-[80px]">Qty</TableHead>
                  <TableHead className="text-xs w-[150px]">Unit Price</TableHead>
                  <TableHead className="text-xs w-[150px]">Total Price</TableHead>
                  <TableHead className="text-xs text-right w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, index) => (
                  <TableRow key={index} className="hover:bg-muted/5">
                    <TableCell className="py-2 space-y-1.5">
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
                      <Input
                        placeholder="Description (optional)"
                        value={item.specifications || ""}
                        onChange={(e) => handleRowChange(index, "specifications", e.target.value)}
                        disabled={isSubmitting}
                        className="h-7 text-xs bg-background"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <select
                        value={item.unit}
                        onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                        disabled={isSubmitting}
                        className="flex h-8 w-full rounded-md border border-input bg-background text-foreground px-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {item.unit && !displayedUnits.some((u) => u.abbreviation === item.unit) && (
                          <option value={item.unit}>{item.unit}</option>
                        )}
                        {displayedUnits.map((u) => (
                          <option key={u.abbreviation} value={u.abbreviation} className="bg-background text-foreground">
                            {u.abbreviation} ({u.name})
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="py-2 px-1">
                      <Input
                        type="number"
                        placeholder="10"
                        value={item.quantity}
                        onChange={(e) =>
                          handleRowChange(index, "quantity", e.target.value === "" ? "" : Number(e.target.value))
                        }
                        disabled={isSubmitting}
                        className="h-8 text-xs bg-background font-mono px-2"
                      />
                    </TableCell>
                    <TableCell className="py-2 px-1">
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">₹</span>
                        <Input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={item.unitPrice || ""}
                          onChange={(e) => handleRowChange(index, "unitPrice", e.target.value)}
                          disabled={isSubmitting}
                          className="h-8 text-xs bg-background font-mono pl-5 pr-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-1">
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">₹</span>
                        <Input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={item.totalPrice || ""}
                          onChange={(e) => handleRowChange(index, "totalPrice", e.target.value)}
                          disabled={isSubmitting}
                          className="h-8 text-xs bg-background font-mono pl-5 pr-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRow(index)}
                        disabled={lineItems.length === 1 || isSubmitting}
                        className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Optional charges apply to the complete material subtotal. */}
          <div className="shrink-0 border-t border-border/50 pt-3">
            {anyChargeSelected && (
              <div className="mb-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Additional Charges (Optional)
                </Label>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Taxes and duties are a percentage of the subtotal; transport and labour are flat amounts.
                </p>
              </div>
            )}
            {(includeTax || includeExciseDuty || includeVat) && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  {
                    id: "indent-tax",
                    label: "Tax (%)",
                    value: taxPercent,
                    setValue: setTaxPercent,
                    visible: includeTax,
                  },
                  {
                    id: "indent-excise",
                    label: "Excise Duty (%)",
                    value: exciseDutyPercent,
                    setValue: setExciseDutyPercent,
                    visible: includeExciseDuty,
                  },
                  {
                    id: "indent-vat",
                    label: "VAT (%)",
                    value: vatPercent,
                    setValue: setVatPercent,
                    visible: includeVat,
                  },
                ]
                  .filter((charge) => charge.visible)
                  .map((charge) => (
                    <div key={charge.id} className="flex flex-col gap-1">
                      <Label htmlFor={charge.id} className="text-[10px] font-semibold text-muted-foreground">
                        {charge.label}
                      </Label>
                      <Input
                        id={charge.id}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={charge.value}
                        onChange={(event) => charge.setValue(event.target.value)}
                        disabled={isSubmitting}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  ))}
              </div>
            )}
            {(includeTransport || includeLabour) && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "indent-transport",
                    label: "Transportation Charge (₹)",
                    value: transportCharge,
                    setValue: setTransportCharge,
                    visible: includeTransport,
                  },
                  {
                    id: "indent-labour",
                    label: "Labour Charge (₹)",
                    value: labourCharge,
                    setValue: setLabourCharge,
                    visible: includeLabour,
                  },
                ]
                  .filter((charge) => charge.visible)
                  .map((charge) => (
                    <div key={charge.id} className="flex flex-col gap-1">
                      <Label htmlFor={charge.id} className="text-[10px] font-semibold text-muted-foreground">
                        {charge.label}
                      </Label>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">₹</span>
                        <Input
                          id={charge.id}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0.00"
                          value={charge.value}
                          onChange={(event) => charge.setValue(event.target.value)}
                          disabled={isSubmitting}
                          className="h-8 pl-5 pr-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/50 pt-3 text-[11px] sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 sm:block">
                <span className="text-muted-foreground">Subtotal</span>
                <div className="font-mono font-semibold text-foreground sm:mt-0.5">
                  {formatCurrency(estimatedSubtotal)}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 sm:block">
                <span className="text-muted-foreground">Charges</span>
                <div className="font-mono font-semibold text-foreground sm:mt-0.5">
                  {formatCurrency(estimatedCharges)}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 sm:block">
                <span className="font-semibold text-foreground">Estimated Total</span>
                <div className="font-mono font-bold text-foreground sm:mt-0.5">
                  {formatCurrency(estimatedSubtotal + estimatedCharges)}
                </div>
              </div>
            </div>
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

      <QuotationImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        workspaceId={workspaceId}
        onImport={handleImportedItems}
      />
    </form>
  );
}
