"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/data-table";

type ServiceType = "SUPPLY" | "LABOUR" | "LABOUR_WITH_MATERIAL";

interface MaterialRow {
  kind: "INDENT" | "CAPABILITY";
  id: string;
  materialName: string;
  unit: string | null;
  serviceType: ServiceType | null;
  quantity: number | null;
  rate: number | null;
  indentId: string | null;
  indentRef: string | null;
  indentName: string | null;
  projectName: string | null;
  date: string | null;
}

const money = (paise: number | null) =>
  paise == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

const SERVICE_LABEL: Record<ServiceType, string> = {
  SUPPLY: "📦 Supply",
  LABOUR: "🔨 Labour",
  LABOUR_WITH_MATERIAL: "🔄 Labour + Material",
};

const SERVICE_CLASS: Record<ServiceType, string> = {
  SUPPLY: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  LABOUR: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  LABOUR_WITH_MATERIAL: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
};

export function VendorMaterials({ vendorId, workspaceId }: { vendorId: string; workspaceId: string }) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [existingItems, setExistingItems] = useState<{ id: string; name: string; type: "material" | "tag"; unit?: string }[]>([]);

  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [customMaterialName, setCustomMaterialName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newServiceType, setNewServiceType] = useState<ServiceType>("SUPPLY");
  const [adding, setAdding] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/materials?w=${workspaceId}`);
      const body = await res.json();
      if (body.success) setRows(body.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [vendorId, workspaceId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useEffect(() => {
    const load = async () => {
      try {
        const [matData, tagData] = await Promise.all([
          fetch(`/api/v1/materials?w=${workspaceId}`).then((r) => r.json()),
          fetch(`/api/v1/tags?workspaceId=${workspaceId}`).then((r) => r.json()),
        ]);

        const items: { id: string; name: string; type: "material" | "tag"; unit?: string }[] = [];
        if (matData.success && matData.data) {
          matData.data.forEach((m: any) =>
            items.push({ id: m.id, name: m.name, type: "material", unit: m.defaultUnit?.abbreviation })
          );
        }
        if (tagData.success && tagData.tags) {
          tagData.tags.forEach((t: any) => items.push({ id: t.id, name: t.name, type: "tag" }));
        }

        setExistingItems(
          items.filter(
            (item, index, self) => self.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase()) === index
          )
        );
      } catch (error) {
        console.error("Failed to fetch existing tags/materials:", error);
      }
    };
    load();
  }, [workspaceId]);

  const newMaterialName =
    selectedMaterialId === "CUSTOM"
      ? customMaterialName.trim()
      : existingItems.find((i) => i.id === selectedMaterialId)?.name || "";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialName) {
      toast.error("Please select or enter a material name");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/capabilities?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName: newMaterialName,
          unit: newUnit || undefined,
          serviceType: newServiceType,
          // Rupees in the form, paise on the wire, like every other price.
          rate: newRate ? Math.round(Number(newRate) * 100) : undefined,
        }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success("Material added");
        setSelectedMaterialId("");
        setCustomMaterialName("");
        setNewUnit("");
        setNewRate("");
        setNewServiceType("SUPPLY");
        fetchMaterials();
      } else {
        toast.error(body.error || "Failed to add material");
      }
    } catch {
      toast.error("Failed to add material");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (capId: string) => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/capabilities/${capId}?w=${workspaceId}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (body.success) {
        toast.success("Material removed");
        fetchMaterials();
      } else {
        toast.error(body.error || "Failed to remove material");
      }
    } catch {
      toast.error("Failed to remove material");
    }
  };

  const columns = useMemo<ColumnDef<MaterialRow>[]>(
    () => [
      {
        accessorKey: "materialName",
        header: "Material / Service",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium capitalize text-foreground">{row.original.materialName}</span>
            {row.original.serviceType && (
              <Badge variant="outline" className={cn("w-fit text-[10px]", SERVICE_CLASS[row.original.serviceType])}>
                {SERVICE_LABEL[row.original.serviceType]}
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "indentRef",
        header: "Source",
        cell: ({ row }) =>
          row.original.kind === "INDENT" ? (
            <div className="flex flex-col gap-0.5">
              <Link
                href={`/w/${workspaceId}/procurement/indents/${row.original.indentId}`}
                className="font-mono text-[11px] font-bold text-primary hover:underline"
              >
                {row.original.indentRef || row.original.indentName}
              </Link>
              <span className="text-[11px] text-muted-foreground">{row.original.projectName || "General"}</span>
            </div>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              Added manually
            </Badge>
          ),
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.date
              ? new Date(row.original.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.quantity == null ? "—" : `${row.original.quantity} ${row.original.unit || ""}`}
          </span>
        ),
      },
      {
        accessorKey: "rate",
        header: "Rate",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold">
            {money(row.original.rate)}
            {row.original.rate != null && row.original.unit ? (
              <span className="text-muted-foreground font-normal"> / {row.original.unit}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {money(
              row.original.rate == null || row.original.quantity == null
                ? null
                : row.original.rate * row.original.quantity
            )}
          </span>
        ),
      },
      {
        id: "actions",
        header: " ",
        cell: ({ row }) =>
          row.original.kind === "CAPABILITY" ? (
            <div className="text-right">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(row.original.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 size-8"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null,
        meta: { className: "w-[80px] text-right" },
      },
    ],
    [workspaceId]
  );

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <div className="space-y-1 md:col-span-4">
          <label className="text-xs font-semibold text-muted-foreground">Material / Service Name</label>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={popoverOpen}
                aria-controls="vendor-materials-list"
                className="w-full justify-between h-9 bg-background font-normal text-left border border-input shadow-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">{newMaterialName || "Select Material / Service..."}</span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0" align="start">
              <Command loop>
                <CommandInput
                  placeholder="Search or enter new material..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList id="vendor-materials-list" className="max-h-[200px] overflow-y-auto">
                  <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                    No materials found. Type to create custom.
                  </CommandEmpty>
                  <CommandGroup>
                    {searchQuery.trim() &&
                      !existingItems.some((item) => item.name.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                        <CommandItem
                          value={searchQuery}
                          onSelect={() => {
                            setSelectedMaterialId("CUSTOM");
                            setCustomMaterialName(searchQuery.trim());
                            setPopoverOpen(false);
                            setSearchQuery("");
                          }}
                          className="text-primary font-medium cursor-pointer"
                        >
                          <Plus className="mr-2 size-4 text-primary" /> Create new &quot;{searchQuery.trim()}&quot;
                        </CommandItem>
                      )}
                    {existingItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.name}
                        onSelect={() => {
                          setSelectedMaterialId(item.id);
                          if (item.unit) setNewUnit(item.unit);
                          setPopoverOpen(false);
                          setSearchQuery("");
                        }}
                        className="cursor-pointer flex items-center"
                      >
                        <Check
                          className={cn("mr-2 size-4", selectedMaterialId === item.id ? "opacity-100" : "opacity-0")}
                        />
                        <span className="truncate">{item.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground capitalize">{item.type}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">Unit</label>
          <Input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="e.g. ton, sqm"
            className="bg-background h-9"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">Rate (₹)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            placeholder="0.00"
            className="bg-background h-9"
          />
        </div>

        <div className="space-y-1 md:col-span-3">
          <label className="text-xs font-semibold text-muted-foreground">Service Type</label>
          <select
            value={newServiceType}
            onChange={(e) => setNewServiceType(e.target.value as ServiceType)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
          >
            <option value="SUPPLY" className="bg-background text-foreground">📦 Supply Only</option>
            <option value="LABOUR" className="bg-background text-foreground">🔨 Labour Only</option>
            <option value="LABOUR_WITH_MATERIAL" className="bg-background text-foreground">🔄 Labour &amp; Material</option>
          </select>
        </div>

        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-semibold text-muted-foreground invisible">Add</label>
          <Button
            type="submit"
            disabled={adding || !newMaterialName}
            className="h-9 w-full p-0 flex items-center justify-center shrink-0"
            title="Add material"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}
          </Button>
        </div>
      </form>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={loading}
        showPagination={true}
        searchKey="materialName"
        searchPlaceholder="Search materials..."
      />
    </div>
  );
}
