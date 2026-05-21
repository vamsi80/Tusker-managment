"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FileText,
  Workflow,
  AlertCircle,
  Send,
  Check,
  TrendingUp,
  ArrowRight,
  Clock,
} from "lucide-react";
import Link from "next/link";

interface DashboardClientProps {
  workspaceId: string;
}

export function DashboardClient({ workspaceId }: DashboardClientProps) {
  const [stats, setStats] = useState({
    totalIndents: 0,
    pendingApprovals: 0,
    activeRfqs: 0,
    completedProcurements: 0,
    totalBudgetEstimated: 0,
  });
  const [vendorsCount, setVendorsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Format currency
  const formatINR = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const [indentsRes, itemsRes, vendorsRes] = await Promise.all([
        fetch(`/api/v1/procurement/indents?w=${workspaceId}`),
        fetch(`/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=ALL&status=ALL`),
        fetch(`/api/v1/procurement/vendors?w=${workspaceId}`),
      ]);
      const indentsData = await indentsRes.json();
      const itemsData = await itemsRes.json();
      const vendorsData = await vendorsRes.json();

      if (indentsData.success && itemsData.success) {
        const indentsList = indentsData.data;
        const itemsList = itemsData.data;

        setStats({
          totalIndents: indentsList.length,
          pendingApprovals: indentsList.filter((i: any) => i.status === "SUBMITTED").length,
          activeRfqs: itemsList.filter((item: any) => item.status === "RFQ_SENT").length,
          completedProcurements: itemsList.filter((item: any) => item.status === "APPROVED" || item.status === "PO_CREATED").length,
          totalBudgetEstimated: itemsList.reduce((acc: number, item: any) => acc + (item.quantity * (item.estimatedUnitPrice || 0)), 0),
        });
      }
      if (vendorsData.success) {
        setVendorsCount(vendorsData.data.length);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [workspaceId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        <Clock className="h-5 w-5 animate-spin mr-1.5 text-primary" /> Loading dashboard overview...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pr-1">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Indent Requests</span>
            <h3 className="text-2xl font-bold mt-1 text-foreground">{stats.totalIndents}</h3>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
            <FileText className="h-3 w-3 text-primary" /> Workspace volume
          </div>
        </div>

        <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-amber-700">Awaiting Approvals</span>
            <h3 className="text-2xl font-bold mt-1 text-amber-600">{stats.pendingApprovals}</h3>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-amber-500 animate-bounce" /> Action required
          </div>
        </div>

        <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-700">Active RFQ Sessions</span>
            <h3 className="text-2xl font-bold mt-1 text-blue-600">{stats.activeRfqs}</h3>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
            <Send className="h-3 w-3 text-blue-500" /> Out to vendors
          </div>
        </div>

        <div className="p-4 border border-border/80 bg-card rounded-lg flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-700">Closed Procurements</span>
            <h3 className="text-2xl font-bold mt-1 text-emerald-600">{stats.completedProcurements}</h3>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 border-t pt-1 flex items-center gap-1">
            <Check className="h-3 w-3 text-emerald-500" /> Purchase finalized
          </div>
        </div>
      </div>

      {/* Overview charts / summaries */}
      <div className="grid grid-cols-2 gap-6">
        <div className="p-4 border border-border bg-card rounded-lg shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" /> Cost Overview
          </h4>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-xs text-muted-foreground">Estimated Materials Budget</span>
            <span className="text-sm font-mono font-bold text-foreground">{formatINR(stats.totalBudgetEstimated)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-xs text-muted-foreground">Registered Active Vendors</span>
            <span className="text-sm font-semibold text-foreground">{vendorsCount} vendors</span>
          </div>
          <div className="mt-4 text-[11px] text-muted-foreground">
            Onboard new suppliers and configure capabilities in the sidebar Vendor panel to receive quotes automatically.
          </div>
        </div>

        <div className="p-4 border border-border bg-card rounded-lg shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-1.5">
              <Workflow className="h-4 w-4 text-primary" /> Active Workflow Links
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              Navigate between indents, check active RFQ lists, or compare vendor quotes inside the Materials Hub.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href={`/w/${workspaceId}/procurement/indents`}>
              <Button size="sm" className="h-8 text-xs">
                Review Indents <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href={`/w/${workspaceId}/procurement/materials`}>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                Inspect Materials
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
