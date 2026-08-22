"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  ACTIVE_RFQ_STATUSES,
  areStatusFiltersEqual,
  parseProcurementStatusParam,
  RFQ_STATUS_OPTIONS,
} from "@/lib/procurement/status-filters";

interface RfqsClientProps {
  workspaceId: string;
}

export function RfqsClient({ workspaceId }: RfqsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const { data: workspaceData } = useWorkspaceLayout();
  const isAccounts = workspaceData?.permissions?.workspaceRole === "ACCOUNTS";
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    parseProcurementStatusParam(statusParam, ACTIVE_RFQ_STATUSES),
  );

  const handleStatusFilterChange = (values: string[]) => {
    setStatusFilter(values);
    const params = new URLSearchParams(searchParams.toString());
    if (values.length > 0) params.set("status", values.join(","));
    else params.delete("status");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const fetchRfqItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const effectiveStatuses = statusFilter.length > 0 ? statusFilter : ACTIVE_RFQ_STATUSES;
      const params = new URLSearchParams({
        w: workspaceId,
        projectId: "ALL",
        status: effectiveStatuses.join(","),
      });
      const res = await fetch(`/api/v1/procurement/indents/line-items?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLineItems(data.data);
      }
    } catch (e) {
      toast.error("Failed to load active RFQ tracking");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, statusFilter]);

  useEffect(() => {
    fetchRfqItems();
  }, [fetchRfqItems]);

  useEffect(() => {
    const nextStatuses = parseProcurementStatusParam(statusParam, ACTIVE_RFQ_STATUSES);
    setStatusFilter((currentStatuses) =>
      areStatusFiltersEqual(currentStatuses, nextStatuses) ? currentStatuses : nextStatuses,
    );
  }, [statusParam]);

  const getLineItemStatusBadge = (status: string) => {
    switch (status) {
      case "RFQ_SENT":
        return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300">RFQ Sent</Badge>;
      case "QUOTES_RECEIVED":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Quotes Recv</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const rfqColumns: ColumnDef<any>[] = [
    {
      accessorKey: "materialName",
      header: "Material",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-foreground">
          {row.original.materialName}
        </span>
      ),
    },
    {
      id: "indent.project.name",
      accessorFn: (row: any) => row.indent?.project?.name || "General",
      header: "Project",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-medium">
          {row.original.indent?.project?.name}
        </span>
      ),
    },
    {
      id: "quantity",
      header: "Quantity",
      cell: ({ row }) => (
        <span className="text-xs font-mono">
          {row.original.quantity} {row.original.unit}
        </span>
      ),
    },
    {
      accessorKey: "rfqDeadline",
      header: "RFQ Deadline",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.rfqDeadline ? format(new Date(row.original.rfqDeadline), "MMM d, yyyy") : "—"}
        </span>
      ),
    },
    {
      id: "quotesCount",
      header: "Quotes Received",
      cell: ({ row }) => (
        <span className="text-xs font-bold text-foreground">
          {row.original.quotesCount || 0} quote(s)
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => getLineItemStatusBadge(row.original.status),
    },
    {
      id: "action",
      header: () => <div className="text-right">Action</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Link href={`/w/${workspaceId}/procurement/materials`}>
            <Button size="sm" className="h-7 text-xs px-2.5">
              Open Hub
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-foreground">Active RFQs</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Track and compare vendor quotes for sent RFQs</p>
        </div>
        {!isAccounts && (
          <Link href={`/w/${workspaceId}/procurement/rfqs/create`}>
            <Button size="sm" className="h-8 text-xs font-semibold flex items-center gap-1">
              <Plus className="size-3.5" /> Create RFQ
            </Button>
          </Link>
        )}
      </div>
      <DataTable
        columns={rfqColumns}
        data={lineItems}
        searchKey="materialName"
        searchPlaceholder="Search materials in RFQ..."
        isLoading={isLoading}
        showPagination={true}
        showColumnToggle={true}
        extraToolbarContent={(
          <MultiSelectFilter
            selected={statusFilter}
            onChange={handleStatusFilterChange}
            options={RFQ_STATUS_OPTIONS}
            placeholder="All active statuses"
            searchPlaceholder="Search statuses..."
            triggerClassName="h-9 min-w-40 text-xs"
          />
        )}
      />
    </div>
  );
}
