"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  DollarSign,
  Check,
  Send,
  Package,
  AlertCircle,
  ThumbsUp,
  Clock,
  Plus,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface LineItemRow {
  id: string;
  materialName: string;
  unit: string;
  quantity: number;
  specifications?: string;
  status: string;
  rfqDeadline?: string | null;
  indent: {
    id: string;
    indentId: string | null;
    name: string;
    status: string;
    project: Project;
  };
  quotesCount: number;
  hasApprovedQuote: boolean;
}

interface MaterialsHubClientProps {
  workspaceId: string;
  projects: Project[];
}

interface GroupedMaterialRow {
  groupKey: string;
  materialName: string;
  unit: string;
  combinedQuantity: number;
  statuses: string[];
  items: LineItemRow[];
}

export function MaterialsHubClient({
  workspaceId,
  projects,
}: MaterialsHubClientProps) {
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [activeSubItemId, setActiveSubItemId] = useState<string | null>(null);
  
  // Filters
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Loaded details inside the sheet
  const [suggestedVendors, setSuggestedVendors] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [workspaceVendors, setWorkspaceVendors] = useState<any[]>([]);
  
  // Loading states
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSendingRfq, setIsSendingRfq] = useState(false);

  // RFQ Submission
  const [selectedVendors, setSelectedVendors] = useState<Record<string, boolean>>({});
  const [rfqDeadline, setRfqDeadline] = useState<string>("");

  // Manual quote dialog
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [manualQuoteVendorId, setManualQuoteVendorId] = useState("");
  const [manualQuoteUnitPrice, setManualQuoteUnitPrice] = useState("");
  const [manualQuoteQuantity, setManualQuoteQuantity] = useState("");
  const [manualQuoteLeadTime, setManualQuoteLeadTime] = useState("");
  const [manualQuoteNotes, setManualQuoteNotes] = useState("");

  // Format currency
  const formatINR = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const fetchLineItems = async () => {
    setIsLoadingItems(true);
    try {
      const url = `/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=${projectFilter}&status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLineItems(data.data);
      }
    } catch (e) {
      toast.error("Failed to load materials");
    } finally {
      setIsLoadingItems(false);
    }
  };

  const fetchWorkspaceVendors = async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setWorkspaceVendors(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchItemDetails = async (itemId: string) => {
    setIsLoadingDetails(true);
    try {
      const [vendorsRes, quotesRes] = await Promise.all([
        fetch(`/api/v1/procurement/rfq/items/${itemId}/suggested-vendors?w=${workspaceId}`),
        fetch(`/api/v1/procurement/rfq/items/${itemId}/quotes?w=${workspaceId}`),
      ]);
      const vendorsData = await vendorsRes.json();
      const quotesData = await quotesRes.json();

      if (vendorsData.success) {
        setSuggestedVendors(vendorsData.data);
        const initialSels: Record<string, boolean> = {};
        vendorsData.data.forEach((v: any) => {
          initialSels[v.vendor.id] = false;
        });
        setSelectedVendors(initialSels);
      }
      if (quotesData.success) {
        setQuotes(quotesData.data);
      }
    } catch (e) {
      toast.error("Failed to load details for item");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const refreshAll = async () => {
    await fetchLineItems();
    if (activeSubItemId) {
      await fetchItemDetails(activeSubItemId);
    }
  };

  useEffect(() => {
    fetchLineItems();
    fetchWorkspaceVendors();
  }, [workspaceId, projectFilter, statusFilter]);

  useEffect(() => {
    if (activeSubItemId) {
      fetchItemDetails(activeSubItemId);
    } else {
      setSuggestedVendors([]);
      setQuotes([]);
    }
  }, [activeSubItemId]);

  // Group line items client-side by materialName (case insensitive) and unit
  const groupedItemsMap: Record<string, GroupedMaterialRow> = {};
  lineItems.forEach((item) => {
    const key = `${item.materialName.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
    if (!groupedItemsMap[key]) {
      groupedItemsMap[key] = {
        groupKey: key,
        materialName: item.materialName,
        unit: item.unit,
        combinedQuantity: 0,
        statuses: [],
        items: [],
      };
    }
    groupedItemsMap[key].combinedQuantity += item.quantity;
    groupedItemsMap[key].items.push(item);
    if (!groupedItemsMap[key].statuses.includes(item.status)) {
      groupedItemsMap[key].statuses.push(item.status);
    }
  });
  const groupedMaterials = Object.values(groupedItemsMap);

  const selectedGroup = selectedGroupKey ? groupedItemsMap[selectedGroupKey] : null;
  const activeSubItem = selectedGroup?.items.find((item) => item.id === activeSubItemId);

  // Set default active sub-item when a group is selected
  useEffect(() => {
    if (selectedGroup && selectedGroup.items.length > 0) {
      // Keep existing sub-item selection if it belongs to the group, else select first item
      const belongs = selectedGroup.items.some((i) => i.id === activeSubItemId);
      if (!belongs) {
        setActiveSubItemId(selectedGroup.items[0].id);
      }
    } else {
      setActiveSubItemId(null);
    }
  }, [selectedGroupKey]);

  useEffect(() => {
    if (isQuoteDialogOpen && activeSubItem) {
      setManualQuoteQuantity(activeSubItem.quantity.toString());
    }
  }, [isQuoteDialogOpen, activeSubItem]);

  const handleSendRFQ = async () => {
    if (!activeSubItemId || !rfqDeadline) {
      toast.error("Please fill in the deadline date");
      return;
    }
    const vendorIds = Object.keys(selectedVendors).filter((id) => selectedVendors[id]);
    if (vendorIds.length === 0) {
      toast.error("Please select at least one vendor");
      return;
    }

    setIsSendingRfq(true);
    try {
      const res = await fetch(`/api/v1/procurement/rfq/send?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItemId: activeSubItemId,
          vendorIds,
          deadline: new Date(rfqDeadline).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("RFQs dispatched successfully");
        setRfqDeadline("");
        refreshAll();
      } else {
        toast.error(data.error || "Failed to dispatch RFQs");
      }
    } catch (e) {
      toast.error("Request failed");
    } finally {
      setIsSendingRfq(false);
    }
  };

  const handleApproveQuote = async (quoteId: string) => {
    try {
      const res = await fetch(`/api/v1/procurement/rfq/quotes/${quoteId}/approve?w=${workspaceId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Quote approved and finalized");
        refreshAll();
      } else {
        toast.error(data.error || "Failed to approve quote");
      }
    } catch (e) {
      toast.error("Request failed");
    }
  };

  const handleManualQuoteSubmit = async () => {
    if (!manualQuoteVendorId || !manualQuoteUnitPrice || !manualQuoteQuantity) {
      toast.error("Please fill in vendor, unit price and quantity");
      return;
    }

    try {
      const res = await fetch(`/api/v1/procurement/rfq/quotes?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItemId: activeSubItemId,
          vendorId: manualQuoteVendorId,
          unitPrice: parseFloat(manualQuoteUnitPrice),
          quantity: parseFloat(manualQuoteQuantity),
          leadTimeDays: manualQuoteLeadTime ? parseInt(manualQuoteLeadTime) : undefined,
          notes: manualQuoteNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Quote recorded successfully");
        setIsQuoteDialogOpen(false);
        setManualQuoteVendorId("");
        setManualQuoteUnitPrice("");
        setManualQuoteLeadTime("");
        setManualQuoteNotes("");
        refreshAll();
      } else {
        toast.error(data.error || "Failed to record quote");
      }
    } catch (e) {
      toast.error("Request failed");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="outline" className="bg-neutral-100 text-neutral-800 border-neutral-300 font-medium">Pending RFQ</Badge>;
      case "RFQ_SENT":
        return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 font-medium">RFQ Sent</Badge>;
      case "QUOTES_RECEIVED":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-medium">Quotes Recv</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-medium">Approved</Badge>;
      case "PO_CREATED":
        return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300 font-medium">PO Created</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const activeQuotes = quotes.filter((q) => q.status === "SUBMITTED" || q.status === "APPROVED");
  const bestQuote = activeQuotes.length > 0 
    ? activeQuotes.reduce((prev, curr) => (Number(curr.unitPrice) < Number(prev.unitPrice) ? curr : prev), activeQuotes[0])
    : null;

  // Columns for the grouped materials table
  const materialColumns: ColumnDef<GroupedMaterialRow>[] = [
    {
      accessorKey: "materialName",
      header: "Material Name",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-foreground">
          {row.original.materialName}
        </span>
      ),
    },
    {
      id: "projectsList",
      header: "Projects List",
      cell: ({ row }) => {
        const names = Array.from(new Set(row.original.items.map((i) => i.indent.project.name)));
        return (
          <span className="text-xs text-muted-foreground font-medium max-w-[240px] truncate block">
            {names.join(", ")}
          </span>
        );
      },
    },
    {
      id: "indentsList",
      header: "Indents List",
      cell: ({ row }) => {
        const ids = Array.from(new Set(row.original.items.map((i) => i.indent.indentId || "Draft")));
        return (
          <span className="font-mono text-[10px] font-bold text-muted-foreground truncate max-w-[180px] block">
            {ids.join(", ")}
          </span>
        );
      },
    },
    {
      id: "combinedQuantity",
      header: "Total Combined Qty",
      cell: ({ row }) => (
        <span className="text-xs font-mono font-bold text-foreground">
          {row.original.combinedQuantity} {row.original.unit}
        </span>
      ),
    },
    {
      id: "statuses",
      header: "Status States",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.statuses.map((status) => (
            <span key={status}>{getStatusBadge(status)}</span>
          ))}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Action</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            size="sm"
            onClick={() => setSelectedGroupKey(row.original.groupKey)}
            className="h-7 text-xs px-2.5 flex items-center gap-1 ml-auto"
          >
            <Eye className="h-3.5 w-3.5" /> Manage
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {/* Search Filters Row */}
      <div className="flex items-center gap-4 shrink-0 bg-muted/20 p-3 rounded-lg border border-border/50">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Project:</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending RFQ</SelectItem>
              <SelectItem value="RFQ_SENT">RFQ Sent</SelectItem>
              <SelectItem value="QUOTES_RECEIVED">Quotes Received</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PO_CREATED">PO Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main DataTable list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <DataTable
          columns={materialColumns}
          data={groupedMaterials}
          searchKey="materialName"
          searchPlaceholder="Search materials..."
          isLoading={isLoadingItems}
          showPagination={true}
          showColumnToggle={true}
          getRowClassName={(row) => {
            const isGroupApproved = row.original?.items?.some(
              (item: any) => item.indent?.status === "APPROVED"
            );
            return !isGroupApproved ? "opacity-60 bg-muted/20" : "";
          }}
        />
      </div>

      {/* Sliding detail Sheet */}
      <Sheet open={!!selectedGroupKey} onOpenChange={(open) => { if (!open) setSelectedGroupKey(null); }}>
        <SheetContent className="sm:max-w-[700px] overflow-y-auto flex flex-col gap-6 p-6">
          {selectedGroup && (
            <>
              <SheetHeader className="p-0 border-b pb-4 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/[0.08] px-2 py-0.5 rounded border border-primary/20">
                      Consolidated Material Overview
                    </span>
                    <SheetTitle className="text-base font-bold text-foreground mt-2">
                      {selectedGroup.materialName}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground mt-1">
                      Combined total required: <strong className="text-foreground">{selectedGroup.combinedQuantity} {selectedGroup.unit}</strong>
                    </SheetDescription>
                  </div>
                </div>

                {/* Horizontal tabs selector for sub-items/projects */}
                <div className="flex flex-wrap gap-2 mt-4 pt-2 border-t">
                  {selectedGroup.items.map((subItem) => {
                    const isActive = subItem.id === activeSubItemId;
                    return (
                      <button
                        key={subItem.id}
                        onClick={() => setActiveSubItemId(subItem.id)}
                        className={`text-xs px-2.5 py-1.5 border rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        <span className="truncate max-w-[100px]">{subItem.indent.project.name}</span>
                        <Badge variant="outline" className={`py-0 px-1 text-[9px] font-bold ${isActive ? "bg-primary-foreground/10 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          {subItem.quantity} {subItem.unit}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </SheetHeader>

              {activeSubItem ? (
                <>
                  <div className="flex items-center justify-between text-xs bg-muted/40 p-2.5 rounded border">
                    <span>
                      Selected Indent Request: <strong>{activeSubItem.indent?.name}</strong> ({activeSubItem.indent?.indentId || "Draft"})
                    </span>
                    <span>{getStatusBadge(activeSubItem.status)}</span>
                  </div>

                  {/* RFQ & Vendors section */}
                  <div className="border border-border/80 rounded-lg bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Vendor Capabilities & RFQ Dispatch
                      </h3>
                      {activeSubItem.status !== "APPROVED" && activeSubItem.status !== "PO_CREATED" && (
                        <Dialog open={isQuoteDialogOpen} onOpenChange={setIsQuoteDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 text-xs font-semibold">
                              <Plus className="mr-1.5 h-3.5 w-3.5" /> Record Quote
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                                Record Vendor Quote
                              </DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col gap-4 py-4">
                              <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Select Vendor</Label>
                                <Select value={manualQuoteVendorId} onValueChange={setManualQuoteVendorId}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Choose Vendor..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {workspaceVendors.map((v) => (
                                      <SelectItem key={v.id} value={v.id}>
                                        {v.name} {v.companyName ? `(${v.companyName})` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                  <Label className="text-xs font-bold text-muted-foreground uppercase">Unit Price (₹)</Label>
                                  <Input
                                    type="number"
                                    placeholder="e.g. 450"
                                    value={manualQuoteUnitPrice}
                                    onChange={(e) => setManualQuoteUnitPrice(e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <Label className="text-xs font-bold text-muted-foreground uppercase">Quantity ({activeSubItem.unit})</Label>
                                  <Input
                                    type="number"
                                    value={manualQuoteQuantity}
                                    onChange={(e) => setManualQuoteQuantity(e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Lead Time (Days)</Label>
                                <Input
                                  type="number"
                                  placeholder="e.g. 5"
                                  value={manualQuoteLeadTime}
                                  onChange={(e) => setManualQuoteLeadTime(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Notes / Terms</Label>
                                <Textarea
                                  placeholder="Payment conditions, logistics terms..."
                                  value={manualQuoteNotes}
                                  onChange={(e) => setManualQuoteNotes(e.target.value)}
                                  className="text-xs min-h-[60px]"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button size="sm" variant="outline" onClick={() => setIsQuoteDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button size="sm" onClick={handleManualQuoteSubmit}>
                                Record Quote
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>

                    {isLoadingDetails ? (
                      <div className="py-8 flex items-center justify-center text-xs text-muted-foreground">
                        <Clock className="h-5 w-5 animate-spin mr-1.5 text-primary" /> Loading matching vendors...
                      </div>
                    ) : activeSubItem.status === "PENDING" ? (
                      <div className="flex flex-col gap-4">
                        <div className="max-h-[160px] overflow-y-auto pr-1 flex flex-col gap-2">
                          {suggestedVendors.length === 0 ? (
                            <div className="py-4 border border-dashed border-border/80 rounded-lg text-center text-xs text-muted-foreground">
                              No matching capability vendors found.
                            </div>
                          ) : (
                            suggestedVendors.map((s) => (
                              <div
                                key={s.vendor.id}
                                className="flex items-center justify-between p-2 border border-border/60 rounded-md hover:bg-muted/10"
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedVendors[s.vendor.id] || false}
                                    onChange={(e) => {
                                      setSelectedVendors({
                                        ...selectedVendors,
                                        [s.vendor.id]: e.target.checked,
                                      });
                                    }}
                                    className="h-3.5 w-3.5 text-primary rounded"
                                    id={`vendor-${s.vendor.id}`}
                                  />
                                  <div className="flex flex-col">
                                    <label htmlFor={`vendor-${s.vendor.id}`} className="text-xs font-semibold text-foreground cursor-pointer">{s.vendor.name}</label>
                                    {s.vendor.companyName && (
                                      <span className="text-[10px] text-muted-foreground">{s.vendor.companyName}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  {s.hasSuppliedBefore && (
                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 py-0">
                                      Supplied
                                    </Badge>
                                  )}
                                  {s.performanceScore !== null && (
                                    <span className="text-muted-foreground">{s.performanceScore}%</span>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="border-t border-border/50 pt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Deadline:</Label>
                            <Input
                              type="date"
                              value={rfqDeadline}
                              onChange={(e) => setRfqDeadline(e.target.value)}
                              className="h-8 text-xs w-[140px]"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={handleSendRFQ}
                            disabled={isSendingRfq}
                            className="h-8 text-xs bg-primary hover:bg-primary/95 text-white flex items-center gap-1.5"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {isSendingRfq ? "Sending..." : "Dispatch RFQ"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center items-center text-center p-4 bg-muted/10 border border-dashed border-border/80 rounded-lg">
                        <Send className="h-5 w-5 text-primary mb-2" />
                        <h4 className="text-xs font-bold text-foreground">RFQ Dispatched</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Waiting for vendor quotes to come in.
                        </p>
                        {activeSubItem.rfqDeadline && (
                          <span className="text-[10px] text-muted-foreground mt-2 bg-muted px-2 py-0.5 rounded border border-border/40">
                            Deadline: {format(new Date(activeSubItem.rfqDeadline), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Proposals Table */}
                  <div className="flex-1 flex flex-col gap-3 min-h-0 border border-border/80 rounded-lg p-4 bg-card shadow-xs">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-emerald-600" /> Costing & Proposal Comparison ({quotes.length})
                    </span>

                    <div className="flex-1 overflow-y-auto min-h-0">
                      {quotes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-8">
                          <AlertCircle className="h-6 w-6 opacity-20 mb-2" />
                          <p className="text-xs">No quotes submitted yet for this material request.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow>
                              <TableHead className="text-xs">Vendor</TableHead>
                              <TableHead className="text-xs">Unit Cost</TableHead>
                              <TableHead className="text-xs">Quantity</TableHead>
                              <TableHead className="text-xs">Total Price</TableHead>
                              <TableHead className="text-xs text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quotes.map((quote) => {
                              const isApproved = quote.status === "APPROVED";
                              return (
                                <TableRow key={quote.id} className={isApproved ? "bg-emerald-50/30 hover:bg-emerald-50/40" : "hover:bg-muted/10"}>
                                  <TableCell className="py-2">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-xs text-foreground">{quote.vendor.name}</span>
                                      {quote.vendor.companyName && (
                                        <span className="text-[10px] text-muted-foreground">{quote.vendor.companyName}</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-2 text-xs font-mono font-medium">
                                    {formatINR(Number(quote.unitPrice))}
                                  </TableCell>
                                  <TableCell className="py-2 text-xs font-mono">
                                    {Number(quote.quantity)}
                                  </TableCell>
                                  <TableCell className="py-2 text-xs font-mono font-bold text-foreground">
                                    {formatINR(Number(quote.totalPrice))}
                                  </TableCell>
                                  <TableCell className="py-2 text-right">
                                    {quote.status === "SUBMITTED" && activeSubItem.status !== "APPROVED" && activeSubItem.status !== "PO_CREATED" && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleApproveQuote(quote.id)}
                                        className="h-6 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {isApproved && (
                                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Won</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    {bestQuote && (
                      <div className="mt-3 p-3 bg-emerald-500/[0.04] border border-emerald-500/20 rounded-lg flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-emerald-500/10 rounded-full text-emerald-600">
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Best Financial Quote Highlight</span>
                            <span className="text-xs text-foreground mt-0.5">
                              <strong>{bestQuote.vendor.name}</strong> offered: <strong>{formatINR(Number(bestQuote.totalPrice))}</strong>
                            </span>
                          </div>
                        </div>
                        {bestQuote.status === "SUBMITTED" && activeSubItem.status !== "APPROVED" && activeSubItem.status !== "PO_CREATED" && (
                          <Button
                            size="sm"
                            onClick={() => handleApproveQuote(bestQuote.id)}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                          >
                            <Check className="h-3 w-3" /> Approve Best
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Select a project indent request above to view details.
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
