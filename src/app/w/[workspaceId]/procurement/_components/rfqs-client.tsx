"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import Link from "next/link";
import { Plus } from "lucide-react";

interface RfqsClientProps {
  workspaceId: string;
}

export function RfqsClient({ workspaceId }: RfqsClientProps) {
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRfqItems = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=ALL&status=ALL`);
      const data = await res.json();
      if (data.success) {
        // filter for active RFQs
        const activeRfqs = data.data.filter(
          (item: any) => item.status === "RFQ_SENT" || item.status === "QUOTES_RECEIVED"
        );
        setLineItems(activeRfqs);
      }
    } catch (e) {
      toast.error("Failed to load active RFQ tracking");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRfqItems();
  }, [workspaceId]);

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
      accessorKey: "indent.project.name",
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
        <Link href={`/w/${workspaceId}/procurement/rfqs/create`}>
          <Button size="sm" className="h-8 text-xs font-semibold flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Create RFQ
          </Button>
        </Link>
      </div>
      <DataTable
        columns={rfqColumns}
        data={lineItems}
        searchKey="materialName"
        searchPlaceholder="Search materials in RFQ..."
        isLoading={isLoading}
        showPagination={true}
        showColumnToggle={true}
      />
    </div>
  );
}
