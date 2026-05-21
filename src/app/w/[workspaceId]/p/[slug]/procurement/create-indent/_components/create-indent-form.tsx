"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
}: {
  value: string;
  onChange: (val: string) => void;
  onUnitAutoFill?: (unit: string) => void;
  disabled: boolean;
  catalog: any[];
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);

  const filtered = value
    ? catalog.filter((c) => c.name.toLowerCase().includes(value.toLowerCase()))
    : catalog;

  return (
    <div className="relative w-full">
      <Input
        placeholder={isLoading ? "Loading..." : "e.g. TMT Steel 10mm"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 200);
        }}
        disabled={disabled || isLoading}
        className="h-8 text-xs bg-background"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full mt-1 w-[300px] bg-popover border border-border/80 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto overflow-x-hidden">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-popover-foreground flex items-center transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
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
        </div>
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
  quantity: number;
  estimatedUnitPrice?: number;
  specifications?: string;
}

interface CreateIndentFormProps {
  taskId?: string;
  projectId: string;
  workspaceId: string;
  tasks?: { id: string; name: string }[];
  onSuccess: (indent: any) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// CreateIndentForm
// ---------------------------------------------------------------------------
export function CreateIndentForm({
  taskId,
  projectId,
  workspaceId,
  tasks = [],
  onSuccess,
  onCancel,
}: CreateIndentFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(taskId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { materialName: "", unit: "pcs", quantity: 1, estimatedUnitPrice: undefined, specifications: "" },
  ]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  useEffect(() => {
    let mounted = true;
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
  }, [workspaceId]);

  const handleAddRow = () => {
    setLineItems([
      ...lineItems,
      { materialName: "", unit: "pcs", quantity: 1, estimatedUnitPrice: undefined, specifications: "" },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof LineItemInput, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter an indent name");
      return;
    }
    if (!selectedTaskId) {
      toast.error("Please select a task for this indent");
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
        taskId: selectedTaskId,
        projectId,
        workspaceId,
        name,
        description: description || undefined,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery).toISOString() : undefined,
        lineItems: lineItems.map((item) => ({
          materialName: item.materialName.trim(),
          unit: item.unit.trim(),
          quantity: Number(item.quantity),
          estimatedUnitPrice: item.estimatedUnitPrice
            ? Math.round(Number(item.estimatedUnitPrice) * 100)
            : undefined,
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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-full bg-background rounded-lg border border-border p-5 gap-5 overflow-hidden"
    >
      {/* Title */}
      <div className="flex flex-col gap-1 shrink-0">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Create Indent</h3>
        <p className="text-xs text-muted-foreground">
          Create an indent to request materials or services.
        </p>
      </div>

      {/* ── Split Panel ── */}
      <div className="flex flex-1 gap-5 overflow-hidden min-h-0">

        {/* ── LEFT: Indent Details ── */}
        <div className="flex flex-col gap-4 w-1/2 overflow-y-auto pr-2">

          {/* Task Selector */}
          {!taskId && tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="indent-task" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Link to Task
              </Label>
              <select
                id="indent-task"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                disabled={isSubmitting}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Select a task...</option>
                {tasks.map((t) => (
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
        <div className="flex flex-col gap-3 w-1/2 border-l border-border/30 pl-5 overflow-hidden">
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

          {/* Rows */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {lineItems.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-3 bg-muted/20 group hover:border-border transition-colors"
              >
                {/* Material */}
                <div className="col-span-5 flex flex-col gap-1">
                  <Label className="text-[10px] font-bold text-muted-foreground">Material Name</Label>
                  <AutoCompleteInput
                    value={item.materialName}
                    onChange={(val) => handleRowChange(index, "materialName", val)}
                    onUnitAutoFill={(unit) => handleRowChange(index, "unit", unit)}
                    disabled={isSubmitting}
                    catalog={catalog}
                    isLoading={isLoadingCatalog}
                  />
                </div>

                {/* Unit */}
                <div className="col-span-2 flex flex-col gap-1">
                  <Label className="text-[10px] font-bold text-muted-foreground">Unit</Label>
                  <Input
                    placeholder="pcs"
                    value={item.unit}
                    onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                    disabled={isSubmitting}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Qty */}
                <div className="col-span-2 flex flex-col gap-1">
                  <Label className="text-[10px] font-bold text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    placeholder="10"
                    value={item.quantity}
                    onChange={(e) =>
                      handleRowChange(index, "quantity", e.target.value === "" ? "" : Number(e.target.value))
                    }
                    disabled={isSubmitting}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Price */}
                <div className="col-span-2 flex flex-col gap-1">
                  <Label className="text-[10px] font-bold text-muted-foreground">Est. ₹/unit</Label>
                  <Input
                    type="number"
                    placeholder="—"
                    value={item.estimatedUnitPrice ?? ""}
                    onChange={(e) =>
                      handleRowChange(
                        index,
                        "estimatedUnitPrice",
                        e.target.value === "" ? undefined : Number(e.target.value)
                      )
                    }
                    disabled={isSubmitting}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Delete */}
                <div className="col-span-1 flex justify-center">
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
                </div>
              </div>
            ))}
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
