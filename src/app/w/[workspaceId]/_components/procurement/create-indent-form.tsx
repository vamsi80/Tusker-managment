"use client";

import { useState } from "react";
import { Plus, Trash2, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface LineItemInput {
  materialName: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number; // in Rupees, converted to paise on submit
  specifications?: string;
}

interface CreateIndentFormProps {
  taskId: string;
  projectId: string;
  workspaceId: string;
  onSuccess: (indent: any) => void;
  onCancel?: () => void;
}

export function CreateIndentForm({
  taskId,
  projectId,
  workspaceId,
  onSuccess,
  onCancel,
}: CreateIndentFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { materialName: "", unit: "pcs", quantity: 1, estimatedUnitPrice: undefined, specifications: "" },
  ]);

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
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter an indent name");
      return;
    }

    // Validate line items
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
        taskId,
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
            ? Math.round(Number(item.estimatedUnitPrice) * 100) // Rupee to Paise
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
      if (!res.ok) {
        throw new Error(json.error || "Failed to create indent");
      }

      toast.success("Indent created successfully");
      onSuccess(json.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to create indent");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-background rounded-lg border border-border p-5 space-y-5 overflow-y-auto">
      <div className="flex flex-col space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Create Indent</h3>
        <p className="text-xs text-muted-foreground">
          Create an indent to request materials or services for this subtask.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="indent-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Indent Name</Label>
          <Input
            id="indent-name"
            placeholder="e.g. Screws and Bolts for Block A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expected-delivery" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expected Delivery Date</Label>
          <div className="relative">
            <Input
              id="expected-delivery"
              type="date"
              value={expectedDelivery}
              onChange={(e) => setExpectedDelivery(e.target.value)}
              disabled={isSubmitting}
              className="h-9 pr-10"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="indent-description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description (Optional)</Label>
        <Textarea
          id="indent-description"
          placeholder="Provide optional details or guidelines..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
          className="min-h-[60px] resize-none"
        />
      </div>

      <div className="border-t pt-4 flex-1 flex flex-col space-y-3 min-h-0">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Line Items / Materials</Label>
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

        <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[300px]">
          {lineItems.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-3 bg-muted/20 relative group hover:border-border transition-colors"
            >
              <div className="col-span-5 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Material Name</Label>
                <Input
                  placeholder="e.g. TMT Steel 10mm"
                  value={item.materialName}
                  onChange={(e) => handleRowChange(index, "materialName", e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Unit</Label>
                <Input
                  placeholder="pcs, kg, bags"
                  value={item.unit}
                  onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Qty</Label>
                <Input
                  type="number"
                  placeholder="10"
                  value={item.quantity}
                  onChange={(e) => handleRowChange(index, "quantity", e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Est. ₹ (unit)</Label>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={item.estimatedUnitPrice ?? ""}
                  onChange={(e) => handleRowChange(index, "estimatedUnitPrice", e.target.value === "" ? undefined : Number(e.target.value))}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="col-span-1 flex justify-center pb-0.5">
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

      <div className="flex items-center justify-end gap-2 border-t pt-4 shrink-0">
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
          className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center"
        >
          {isSubmitting ? "Creating..." : "Create Indent →"}
        </Button>
      </div>
    </form>
  );
}
