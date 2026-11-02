"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { can } from "@tusker/core/lib/constants/capabilities";
import { formatPaise } from "@tusker/core/lib/procurement/purchase-order";
import type { BoqStatus } from "@tusker/core/lib/procurement/boq";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { NoAccess, apiJson, toastError } from "../_components/boq-shared";
import { BoqStatusBadge } from "./_components/boq-status-badge";

interface BoqRow {
  id: string;
  name: string;
  revision: number;
  status: BoqStatus;
  updatedAt: string;
  project: { id: string; name: string; slug: string };
  _count: { lines: number };
  costAmount: number;
  amount: number;
}

export default function BoqListPage() {
  return (
    <Suspense>
      <BoqList />
    </Suspense>
  );
}

function BoqList() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading: layoutLoading } = useWorkspaceLayout();
  const canView = can(data.permissions.capabilities, "boq:view");
  const canEdit = can(data.permissions.capabilities, "boq:edit");
  const projects: { id: string; name: string }[] = data.projects ?? [];

  const [projectFilter, setProjectFilter] = useState(searchParams.get("projectId") || "all");
  const [rows, setRows] = useState<BoqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [newName, setNewName] = useState("Main BOQ");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const project = projectFilter !== "all" ? `&projectId=${projectFilter}` : "";
      setRows(await apiJson<BoqRow[]>(`/api/v1/procurement/boq?w=${workspaceId}${project}`));
    } catch (e) {
      toastError(e, "Could not load BOQs");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectFilter]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const create = async () => {
    if (!newProjectId) return toast.error("Choose a project");
    if (!newName.trim()) return toast.error("Give the BOQ a name");
    setCreating(true);
    try {
      const boq = await apiJson<{ id: string }>(`/api/v1/procurement/boq?w=${workspaceId}`, {
        method: "POST",
        json: { projectId: newProjectId, name: newName.trim() },
      });
      router.push(`/w/${workspaceId}/procurement/boq/${boq.id}`);
    } catch (e) {
      toastError(e, "Could not create the BOQ");
      setCreating(false);
    }
  };

  const columns: ColumnDef<BoqRow>[] = [
    { id: "project", accessorFn: (r) => r.project.name, header: "Project" },
    {
      id: "name",
      accessorFn: (r) => r.name,
      header: "BOQ",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.name} <span className="text-muted-foreground font-normal">· R{row.original.revision}</span>
        </span>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <BoqStatusBadge status={row.original.status} /> },
    { id: "lines", accessorFn: (r) => r._count.lines, header: "Lines" },
    {
      accessorKey: "costAmount",
      header: () => <div className="text-right">Cost</div>,
      cell: ({ row }) => <div className="text-right tabular-nums">{formatPaise(row.original.costAmount)}</div>,
    },
    {
      accessorKey: "amount",
      header: () => <div className="text-right">Total (with markup)</div>,
      cell: ({ row }) => <div className="text-right tabular-nums font-medium">{formatPaise(row.original.amount)}</div>,
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) => new Date(row.original.updatedAt).toLocaleDateString("en-IN"),
    },
  ];

  if (layoutLoading) return null;
  if (!canView) return <NoAccess what="BOQs" />;

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <DataTable
        fillViewport
        columns={columns}
        data={rows}
        isLoading={loading}
        enableGlobalFilter
        searchPlaceholder="Search project or BOQ..."
        onRowClick={(row) => router.push(`/w/${workspaceId}/procurement/boq/${row.id}`)}
        onAdd={
          canEdit
            ? () => {
                setNewProjectId(projectFilter !== "all" ? projectFilter : "");
                setCreateOpen(true);
              }
            : undefined
        }
        addButtonLabel="New BOQ"
        toolbarLeading={
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New BOQ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Main BOQ, Phase 2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={create} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
