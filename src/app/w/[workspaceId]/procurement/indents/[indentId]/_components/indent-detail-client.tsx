"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Calendar,
  Check,
  User,
  X,
  Package,
  FileText,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

interface IndentDetailClientProps {
  workspaceId: string;
  indent: any;
}

export function IndentDetailClient({ workspaceId, indent: initialIndent }: IndentDetailClientProps) {
  const router = useRouter();
  const [indent, setIndent] = useState(initialIndent);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIndent(initialIndent);
  }, [initialIndent]);

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

  const handleApprove = async () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/approve?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent approved successfully");
          // Re-fetch or update state
          const updated = { ...indent, status: "APPROVED" };
          setIndent(updated);
          router.refresh();
        } else {
          toast.error(data.error || "Failed to approve indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleReject = async () => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/cancel?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent rejected successfully");
          const updated = { ...indent, status: "CANCELLED" };
          setIndent(updated);
          router.refresh();
        } else {
          toast.error(data.error || "Failed to reject indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Back button and page header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/w/${workspaceId}/procurement/indents`)}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground">{indent.name}</h1>
              {getIndentStatusBadge(indent.status)}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5">
              Indent ID: <strong className="font-mono text-foreground">{indent.indentId || "Draft"}</strong>
            </span>
          </div>
        </div>

        {/* Top Actions panel */}
        {indent.status === "SUBMITTED" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isPending}
              className="h-8 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50"
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> Reject
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left column: Indent metadata info */}
        <div className="flex flex-col gap-4">
          {/* Project Details */}
          <Card>
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Project Context
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3.5 flex flex-col gap-3.5">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Associated Project</span>
                <span className="text-xs font-bold text-foreground mt-0.5">{indent.project?.name}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Requested Delivery Date</span>
                <span className="text-xs font-semibold text-foreground mt-0.5">
                  {indent.expectedDelivery ? format(new Date(indent.expectedDelivery), "PPP") : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Requester Profile */}
          <Card>
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-4 w-4" /> Requested By
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3.5 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {indent.requestedBy?.user?.name?.[0]}
                {indent.requestedBy?.user?.surname?.[0]}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">
                  {indent.requestedBy?.user?.name} {indent.requestedBy?.user?.surname}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {indent.requestedBy?.user?.email}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Approver Profile */}
          {indent.finalApprovedBy && (
            <Card>
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-600" /> Approved By
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3.5 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                  {indent.finalApprovedBy.user?.name?.[0]}
                  {indent.finalApprovedBy.user?.surname?.[0]}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">
                    {indent.finalApprovedBy.user?.name} {indent.finalApprovedBy.user?.surname}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {indent.finalApprovedBy.user?.email}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 2 columns: Items Details table */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary" /> Requested Materials & Quantities
              </CardTitle>
              <CardDescription className="text-[11px]">
                List of materials requested in this procurement indent.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs">Material Name</TableHead>
                    <TableHead className="text-xs">Quantity</TableHead>
                    <TableHead className="text-xs">Specifications</TableHead>
                    <TableHead className="text-xs text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indent.lineItems?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold text-xs text-foreground py-2.5">
                        {item.materialName}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground py-2.5">
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2.5 max-w-[200px] truncate">
                        {item.specifications || "—"}
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!indent.lineItems || indent.lineItems.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                        No materials found in this indent.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
