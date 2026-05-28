"use client";

import { useState, useEffect, useTransition } from "react";
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
  Truck,
  Calendar,
  DollarSign,
  Check,
  Send,
  Package,
  ListFilter,
  AlertCircle,
  ThumbsUp,
  Clock,
  Plus,
  LayoutDashboard,
  FileText,
  Workflow,
  XCircle,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
    name: string;
    status: string;
    project: Project;
  };
  quotesCount: number;
  hasApprovedQuote: boolean;
}

interface ProcurementHubClientProps {
  workspaceId: string;
  workspaceName: string;
  projects: Project[];
  userId: string;
}

export function ProcurementHubClient({
  workspaceId,
  workspaceName,
  projects,
  userId,
}: ProcurementHubClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"dashboard" | "indent" | "material" | "rfq">("dashboard");
  const [isSubmitting, startTransition] = useTransition();

  // Tab 1: Dashboard Data
  const [dashboardStats, setDashboardStats] = useState({
    totalIndents: 0,
    pendingApprovals: 0,
    activeRfqs: 0,
    completedProcurements: 0,
    totalBudgetEstimated: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Tab 2: Indents Data
  const [indents, setIndents] = useState<any[]>([]);
  const [isLoadingIndents, setIsLoadingIndents] = useState(false);
  const [indentSearch, setIndentSearch] = useState("");

  // Tab 3: Materials Data (the 3-panel layout)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [materialSearch, setMaterialSearch] = useState("");

  // Loaded material details
  const [suggestedVendors, setSuggestedVendors] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [workspaceVendors, setWorkspaceVendors] = useState<any[]>([]);
  
  // Loading details
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSendingRfq, setIsSendingRfq] = useState(false);

  // RFQ Submission state
  const [selectedVendors, setSelectedVendors] = useState<Record<string, boolean>>({});
  const [rfqDeadline, setRfqDeadline] = useState<string>("");

  // Manual quote dialog
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [manualQuoteVendorId, setManualQuoteVendorId] = useState("");
  const [manualQuoteUnitPrice, setManualQuoteUnitPrice] = useState("");
  const [manualQuoteQuantity, setManualQuoteQuantity] = useState("");
  const [manualQuoteLeadTime, setManualQuoteLeadTime] = useState("");
  const [manualQuoteNotes, setManualQuoteNotes] = useState("");

  const selectedItem = lineItems.find((item) => item.id === selectedItemId);

  // Format currency
  const formatINR = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Fetch Dashboard Statistics
  const fetchDashboardStats = async () => {
    setIsLoadingStats(true);
    try {
      // Fetch indents and materials to calculate statistics locally
      const [indentsRes, itemsRes] = await Promise.all([
        fetch(`/api/v1/procurement/indents?w=${workspaceId}`),
        fetch(`/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=ALL&status=ALL`),
      ]);
      const indentsData = await indentsRes.json();
      const itemsData = await itemsRes.json();

      if (indentsData.success && itemsData.success) {
        const indentsList = indentsData.data;
        const itemsList = itemsData.data;

        const totalInd = indentsList.length;
        const pendingApp = indentsList.filter((i: any) => i.status === "SUBMITTED").length;
        const activeRf = itemsList.filter((item: any) => item.status === "RFQ_SENT").length;
        const completed = itemsList.filter((item: any) => item.status === "APPROVED" || item.status === "PO_CREATED").length;
        
        setDashboardStats({
          totalIndents: totalInd,
          pendingApprovals: pendingApp,
          activeRfqs: activeRf,
          completedProcurements: completed,
          totalBudgetEstimated: itemsList.reduce((acc: number, item: any) => acc + (item.quantity * (item.estimatedUnitPrice || 0)), 0),
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch Indents List
  const fetchIndents = async () => {
    setIsLoadingIndents(true);
    try {
      const res = await fetch(`/api/v1/procurement/indents?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setIndents(data.data);
      }
    } catch (e) {
      toast.error("Failed to load indents list");
    } finally {
      setIsLoadingIndents(false);
    }
  };

  // Fetch Line Items for Materials Tab
  const fetchLineItems = async () => {
    try {
      const url = `/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=${projectFilter}&status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLineItems(data.data);
        if (data.data.length > 0 && !selectedItemId) {
          setSelectedItemId(data.data[0].id);
        }
      }
    } catch (e) {
      toast.error("Failed to load materials");
    }
  };

  // Fetch workspace vendors
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

  // Fetch detailed material suggestions and quotes
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

  // Approval/Rejection on Indents Tab
  const handleApproveIndent = async (indentId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indentId}/approve?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent approved successfully");
          fetchIndents();
          fetchDashboardStats();
        } else {
          toast.error(data.error || "Failed to approve indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleRejectIndent = async (indentId: string) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indentId}/cancel?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent rejected successfully");
          fetchIndents();
          fetchDashboardStats();
        } else {
          toast.error(data.error || "Failed to reject indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  // Refresh methods
  const refreshAll = async () => {
    await fetchLineItems();
    if (selectedItemId) {
      await fetchItemDetails(selectedItemId);
    }
    fetchDashboardStats();
  };

  // RFQ Submission
  const handleSendRFQ = async () => {
    if (!selectedItemId || !rfqDeadline) {
      toast.error("Please select a deadline date");
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
          lineItemId: selectedItemId,
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
          lineItemId: selectedItemId,
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

  // Sync active states on load & tab change
  useEffect(() => {
    fetchDashboardStats();
    fetchWorkspaceVendors();
  }, [workspaceId]);

  useEffect(() => {
    if (activeTab === "indent") {
      fetchIndents();
    } else if (activeTab === "material") {
      fetchLineItems();
    }
  }, [activeTab, projectFilter, statusFilter]);

  useEffect(() => {
    if (selectedItemId && activeTab === "material") {
      fetchItemDetails(selectedItemId);
    }
  }, [selectedItemId, activeTab]);

  useEffect(() => {
    if (isQuoteDialogOpen && selectedItem) {
      setManualQuoteQuantity(selectedItem.quantity.toString());
    }
  }, [isQuoteDialogOpen, selectedItem]);

  const getIndentStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-neutral-300">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Submitted</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Approved</Badge>;
      case "CANCELLED":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLineItemStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="outline" className="bg-neutral-100 text-neutral-800 border-neutral-300">Pending RFQ</Badge>;
      case "RFQ_SENT":
        return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300">RFQ Sent</Badge>;
      case "QUOTES_RECEIVED":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Quotes Recv</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">Approved</Badge>;
      case "PO_CREATED":
        return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300">PO Created</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter lists
  const filteredIndents = indents.filter((ind) =>
    ind.name.toLowerCase().includes(indentSearch.toLowerCase()) ||
    (ind.indentId && ind.indentId.toLowerCase().includes(indentSearch.toLowerCase()))
  );

  const filteredMaterials = lineItems.filter((item) =>
    item.materialName.toLowerCase().includes(materialSearch.toLowerCase())
  );

  // Active RFQs list
  const rfqMaterials = lineItems.filter((item) => item.status === "RFQ_SENT" || item.status === "QUOTES_RECEIVED");

  // Cost calculations
  const activeQuotes = quotes.filter((q) => q.status === "SUBMITTED" || q.status === "APPROVED");
  const bestQuote = activeQuotes.length > 0 
    ? activeQuotes.reduce((prev, curr) => (Number(curr.unitPrice) < Number(prev.unitPrice) ? curr : prev), activeQuotes[0])
    : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden h-full">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Truck className="size-5 text-primary animate-pulse" /> Workspace Procurement Hub
          </h1>
          <p className="text-xs text-muted-foreground">
            PO Officer control desk for <strong>{workspaceName}</strong>. Manage indents, quotes, and approvals.
          </p>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-4 shrink-0">
        <div className="flex gap-2">
          <Button
            variant={activeTab === "dashboard" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("dashboard")}
            className="h-8 text-xs font-semibold flex items-center gap-1.5"
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </Button>

          <Button
            variant={activeTab === "indent" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("indent")}
            className="h-8 text-xs font-semibold flex items-center gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" /> Indents List
          </Button>

          <Button
            variant={activeTab === "material" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("material")}
            className="h-8 text-xs font-semibold flex items-center gap-1.5"
          >
            <Package className="h-3.5 w-3.5" /> Materials Hub
          </Button>

          <Button
            variant={activeTab === "rfq" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("rfq")}
            className="h-8 text-xs font-semibold flex items-center gap-1.5"
          >
            <Workflow className="h-3.5 w-3.5" /> RFQs Active
          </Button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* ── TAB 1: DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Indent Requests</span>
                  <h3 className="text-2xl font-bold mt-1 text-foreground">{isLoadingStats ? "..." : dashboardStats.totalIndents}</h3>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
                  <FileText className="size-3 text-primary" /> Workspace volume
                </div>
              </div>

              <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-700">Awaiting Approvals</span>
                  <h3 className="text-2xl font-bold mt-1 text-amber-600">{isLoadingStats ? "..." : dashboardStats.pendingApprovals}</h3>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
                  <AlertCircle className="size-3 text-amber-500 animate-bounce" /> Action required
                </div>
              </div>

              <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-700">Active RFQ Sessions</span>
                  <h3 className="text-2xl font-bold mt-1 text-blue-600">{isLoadingStats ? "..." : dashboardStats.activeRfqs}</h3>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
                  <Send className="size-3 text-blue-500" /> Out to vendors
                </div>
              </div>

              <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700">Closed Procurements</span>
                  <h3 className="text-2xl font-bold mt-1 text-emerald-600">{isLoadingStats ? "..." : dashboardStats.completedProcurements}</h3>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
                  <Check className="size-3 text-emerald-500" /> Purchase finalized
                </div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="grid grid-cols-2 gap-6">
              <div className="p-4 border border-border bg-card rounded-lg shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-1.5">
                  <TrendingUp className="size-4 text-primary" /> Cost Overview
                </h4>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-xs text-muted-foreground">Estimated Materials Budget</span>
                  <span className="text-sm font-mono font-bold text-foreground">{formatINR(dashboardStats.totalBudgetEstimated)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-xs text-muted-foreground">Registered Active Vendors</span>
                  <span className="text-sm font-semibold text-foreground">{workspaceVendors.length} vendors</span>
                </div>
                <div className="mt-4 text-[11px] text-muted-foreground">
                  Need to onboard more suppliers? Head to the workspace settings panel to add new vendor directories.
                </div>
              </div>

              <div className="p-4 border border-border bg-card rounded-lg shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-1.5">
                    <Workflow className="size-4 text-primary" /> Active Workflow Links
                  </h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Go directly to the active tabs to approve pending requests or comparison panels.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button size="sm" onClick={() => setActiveTab("indent")} className="h-8 text-xs">
                    Review Indents <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("material")} className="h-8 text-xs">
                    Inspect Materials
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: INDENTS LIST ── */}
        {activeTab === "indent" && (
          <div className="flex-1 border border-border bg-card rounded-lg flex flex-col min-h-0 shadow-sm p-4">
            <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="size-4" /> Workspace Requests Register
              </span>
              <Input
                placeholder="Search Indents..."
                value={indentSearch}
                onChange={(e) => setIndentSearch(e.target.value)}
                className="h-8 text-xs w-[220px]"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoadingIndents ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  <Clock className="size-5 animate-spin mr-1.5 text-primary" /> Loading indents list...
                </div>
              ) : filteredIndents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                  <Package className="size-10 opacity-20 mb-2" />
                  <p className="text-xs">No Indents submitted for this workspace yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">Project</TableHead>
                      <TableHead className="text-xs">Request Name</TableHead>
                      <TableHead className="text-xs">Items Count</TableHead>
                      <TableHead className="text-xs">Requested By</TableHead>
                      <TableHead className="text-xs">Expected Delivery</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIndents.map((ind) => (
                      <TableRow key={ind.id} className="hover:bg-muted/10">
                        <TableCell className="py-2.5 font-mono text-[11px] font-bold">
                          {ind.indentId || "Draft"}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-semibold text-foreground">
                          {ind.project.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-foreground">
                          {ind.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {ind._count.lineItems} items
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {ind.requestedBy?.user?.name} {ind.requestedBy?.user?.surname}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {ind.expectedDelivery ? format(new Date(ind.expectedDelivery), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {getIndentStatusBadge(ind.status)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {ind.status === "SUBMITTED" && (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRejectIndent(ind.id)}
                                className="h-7 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApproveIndent(ind.id)}
                                className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                Approve
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: MATERIALS HUB (THE 3-PANEL SPLIT VIEW) ── */}
        {activeTab === "material" && (
          <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
            {/* Left Column (30%) */}
            <div className="w-[30%] flex flex-col gap-3 min-h-0 border border-border/80 rounded-lg p-3 bg-card shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <ListFilter className="size-3" /> Materials Catalog ({filteredMaterials.length})
              </span>

              <div className="flex flex-col gap-2 shrink-0">
                <Input
                  placeholder="Search materials..."
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-muted-foreground uppercase font-bold">Project</Label>
                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="h-7 text-xs px-2">
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

                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-muted-foreground uppercase font-bold">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-7 text-xs px-2">
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
              </div>

              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                {filteredMaterials.length === 0 ? (
                  <div className="flex flex-col py-8 items-center justify-center text-muted-foreground text-xs text-center">
                    <Package className="size-8 opacity-20 mb-2" />
                    No materials require procurement based on current filters.
                  </div>
                ) : (
                  filteredMaterials.map((item) => {
                    const isSelected = item.id === selectedItemId;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className={`flex flex-col gap-1.5 p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/30 select-none ${
                          isSelected
                            ? "border-primary bg-primary/[0.03] shadow-sm ring-1 ring-primary/20"
                            : "border-border/80 bg-card hover:border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-xs text-foreground line-clamp-1">
                            {item.materialName}
                          </span>
                          <span className="shrink-0">{getLineItemStatusBadge(item.status)}</span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>Qty: <strong>{item.quantity} {item.unit}</strong></span>
                          <span className="truncate max-w-[120px] font-medium text-foreground">
                            {item.indent.project.name}
                          </span>
                        </div>

                        {item.specifications && (
                          <p className="text-[10px] text-muted-foreground/80 line-clamp-1 italic">
                            Spec: {item.specifications}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column (70%) */}
            <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
              {selectedItem ? (
                <>
                  {/* Right-Top (50% height) */}
                  <div className="h-[48%] border border-border/80 rounded-lg bg-card p-4 flex flex-col min-h-0 shadow-sm">
                    <div className="flex items-start justify-between border-b border-border/60 pb-3 mb-3 shrink-0">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/[0.08] px-2 py-0.5 rounded border border-primary/20">
                          Material Details
                        </span>
                        <h2 className="text-base font-bold text-foreground mt-1.5 flex items-center gap-1.5">
                          {selectedItem.materialName}
                        </h2>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Quantity Required: <strong className="text-foreground">{selectedItem.quantity} {selectedItem.unit}</strong> • From Indent: <strong className="text-foreground">{selectedItem.indent.name}</strong> ({selectedItem.indent.project.name})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedItem.status !== "APPROVED" && selectedItem.status !== "PO_CREATED" && (
                          <Dialog open={isQuoteDialogOpen} onOpenChange={setIsQuoteDialogOpen}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="h-8 text-xs font-semibold">
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Enter Quote Manually
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
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Quantity ({selectedItem.unit})</Label>
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
                                    placeholder="e.g. Payment 30 days, transport extra"
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
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {isLoadingDetails ? (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                          <Clock className="size-5 animate-spin mr-1.5 text-primary" /> Loading vendor specifications...
                        </div>
                      ) : selectedItem.status === "PENDING" ? (
                        <div className="flex flex-col h-full justify-between">
                          <div className="flex-1 overflow-y-auto pr-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                              Suggested Capability Vendors ({suggestedVendors.length})
                            </Label>
                            {suggestedVendors.length === 0 ? (
                              <div className="py-6 border border-dashed border-border/85 rounded-lg text-center text-xs text-muted-foreground">
                                No vendors listed with matching material capabilities. Add capabilities first.
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {suggestedVendors.map((s) => (
                                  <div
                                    key={s.vendor.id}
                                    className="flex items-center justify-between p-2.5 border border-border/60 rounded-md hover:bg-muted/10 transition-colors"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <input
                                        type="checkbox"
                                        checked={selectedVendors[s.vendor.id] || false}
                                        onChange={(e) => {
                                          setSelectedVendors({
                                            ...selectedVendors,
                                            [s.vendor.id]: e.target.checked,
                                          });
                                        }}
                                        className="h-3.5 w-3.5 text-primary border-border rounded"
                                      />
                                      <div className="flex flex-col">
                                        <span className="text-xs font-semibold text-foreground">{s.vendor.name}</span>
                                        {s.vendor.companyName && (
                                          <span className="text-[10px] text-muted-foreground">{s.vendor.companyName}</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-[10px]">
                                      {s.hasSuppliedBefore && (
                                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[9px] py-0">
                                          Supplied Before
                                        </Badge>
                                      )}
                                      {s.performanceScore !== null && (
                                        <span className="text-muted-foreground">
                                          Score: <strong className="text-foreground">{s.performanceScore}%</strong>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="border-t border-border/50 pt-3 mt-3 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">RFQ Deadline:</Label>
                              <Input
                                type="date"
                                value={rfqDeadline}
                                onChange={(e) => setRfqDeadline(e.target.value)}
                                className="h-8 text-xs w-[150px]"
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
                        <div className="flex flex-col h-full justify-center items-center text-center p-6 bg-muted/10 border border-dashed border-border/80 rounded-lg">
                          <div className="p-3 bg-primary/5 rounded-full mb-3">
                            <Send className="size-6 text-primary" />
                          </div>
                          <h4 className="text-xs font-bold text-foreground">RFQ Session Already Initiated</h4>
                          <p className="text-xs text-muted-foreground mt-1 max-w-[340px]">
                            Request proposals list sent out. You can record manual prices or see proposals below.
                          </p>
                          {selectedItem.rfqDeadline && (
                            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted px-2.5 py-1 rounded border border-border/40">
                              <Calendar className="size-3 text-primary" />
                              <span>Deadline Date: {format(new Date(selectedItem.rfqDeadline), "MMM d, yyyy")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right-Bottom (52% height) */}
                  <div className="flex-1 border border-border/80 rounded-lg bg-card p-4 flex flex-col min-h-0 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3 shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="size-4 text-emerald-600" /> Costing & Proposal Comparison ({quotes.length})
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0">
                      {quotes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-6">
                          <AlertCircle className="size-8 opacity-20 mb-2" />
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
                              <TableHead className="text-xs">Lead Time</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quotes.map((quote) => {
                              const isApproved = quote.status === "APPROVED";
                              return (
                                <TableRow key={quote.id} className={isApproved ? "bg-emerald-50/30 hover:bg-emerald-50/40" : "hover:bg-muted/10"}>
                                  <TableCell className="py-2.5">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-xs text-foreground">{quote.vendor.name}</span>
                                      {quote.vendor.companyName && (
                                        <span className="text-[10px] text-muted-foreground">{quote.vendor.companyName}</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-2.5 text-xs font-mono font-medium">
                                    {formatINR(Number(quote.unitPrice))}
                                  </TableCell>
                                  <TableCell className="py-2.5 text-xs font-mono">
                                    {Number(quote.quantity)}
                                  </TableCell>
                                  <TableCell className="py-2.5 text-xs font-mono font-bold text-foreground">
                                    {formatINR(Number(quote.totalPrice))}
                                  </TableCell>
                                  <TableCell className="py-2.5 text-xs">
                                    {quote.leadTimeDays ? `${quote.leadTimeDays} days` : "—"}
                                  </TableCell>
                                  <TableCell className="py-2.5">
                                    {isApproved ? (
                                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[9px] py-0 uppercase">
                                        Winning Proposal
                                      </Badge>
                                    ) : quote.status === "REJECTED" ? (
                                      <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[9px] py-0 uppercase">
                                        Rejected
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-neutral-50 text-neutral-600 text-[9px] py-0 uppercase">
                                        {quote.status}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2.5 text-right">
                                    {quote.status === "SUBMITTED" && selectedItem.status !== "APPROVED" && selectedItem.status !== "PO_CREATED" && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleApproveQuote(quote.id)}
                                        className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                                      >
                                        <Check className="size-3" /> Approve
                                      </Button>
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
                          <div className="p-1.5 bg-emerald-500/10 rounded-full text-emerald-600">
                            <ThumbsUp className="size-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Best Financial Quote Highlight</span>
                            <span className="text-xs text-foreground mt-0.5">
                              <strong>{bestQuote.vendor.name}</strong> offered the lowest cost: <strong>{formatINR(Number(bestQuote.totalPrice))}</strong> at {formatINR(Number(bestQuote.unitPrice))}/{selectedItem.unit}
                            </span>
                          </div>
                        </div>
                        {bestQuote.status === "SUBMITTED" && selectedItem.status !== "APPROVED" && selectedItem.status !== "PO_CREATED" && (
                          <Button
                            size="sm"
                            onClick={() => handleApproveQuote(bestQuote.id)}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                          >
                            <Check className="size-3" /> Approve Best Offer
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/80 rounded-lg p-8 bg-muted/5">
                  <Package className="size-10 opacity-20 mb-2" />
                  <p className="text-xs">Select a material from the left panel to manage suppliers and compare costs.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: RFQS ACTIVE ── */}
        {activeTab === "rfq" && (
          <div className="flex-1 border border-border bg-card rounded-lg flex flex-col min-h-0 shadow-sm p-4">
            <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Workflow className="size-4 text-blue-600" /> Active RFQ Tracking Panel
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rfqMaterials.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                  <Workflow className="size-10 opacity-20 mb-2" />
                  <p className="text-xs">No active RFQs currently out to vendors.</p>
                  <Button size="sm" onClick={() => setActiveTab("material")} className="h-8 text-xs mt-3">
                    Go to Materials Hub
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Material</TableHead>
                      <TableHead className="text-xs">Project</TableHead>
                      <TableHead className="text-xs">Quantity</TableHead>
                      <TableHead className="text-xs">RFQ Deadline</TableHead>
                      <TableHead className="text-xs">Quotes Count</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rfqMaterials.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/10">
                        <TableCell className="py-2.5 text-xs font-semibold text-foreground">
                          {item.materialName}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {item.indent.project.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-mono">
                          {item.quantity} {item.unit}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {item.rfqDeadline ? format(new Date(item.rfqDeadline), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-bold text-foreground">
                          {item.quotesCount} quote(s) received
                        </TableCell>
                        <TableCell className="py-2.5">
                          {getLineItemStatusBadge(item.status)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setActiveTab("material");
                            }}
                            className="h-7 text-xs px-2.5"
                          >
                            Open Hub
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
