"use client";

import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, PackageSearch, Calendar, User } from "lucide-react";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { useParams } from "next/navigation";

interface ProjectProcurementClientProps {
  workspaceId: string;
  projectId: string;
  indents: any[];
}

export function ProjectProcurementClient({
  workspaceId,
  projectId,
  indents,
}: ProjectProcurementClientProps) {
  const router = useSafeNavigation();
  const { slug } = useParams();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Submitted</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Approved</Badge>;
      case "REJECTED":
        return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => router.push(`/w/${workspaceId}/p/${slug}/procurement/create-indent`)}
          className="h-9 text-xs"
        >
          <Plus className="mr-2 h-4 w-4" /> Create New Indent
        </Button>
      </div>

      <div className="border rounded-md overflow-y-auto bg-background flex-1">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[200px]">Indent Name</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Expected Delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <PackageSearch className="h-8 w-8 mb-2 opacity-20" />
                    <p>No indents found for this project.</p>
                    <p className="text-xs mt-1">Click &quot;Create New Indent&quot; to get started.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              indents.map((indent) => (
                <TableRow
                  key={indent.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(
                      `/w/${workspaceId}/p/${slug}/procurement?subtask=${indent.task.taskSlug}&tab=procurement`
                    )
                  }
                >
                  <TableCell className="font-medium">{indent.name}</TableCell>
                  <TableCell className="text-muted-foreground">{indent.task.name}</TableCell>
                  <TableCell>{getStatusBadge(indent.status)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {indent.lineItems?.length || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {indent.requestedBy?.user?.name} {indent.requestedBy?.user?.surname}
                    </div>
                  </TableCell>
                  <TableCell>
                    {indent.expectedDelivery ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(indent.expectedDelivery), "MMM d, yyyy")}
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">Not set</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
