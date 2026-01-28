"use client";

import { toast } from "sonner";
import { IndentDialogFormData } from "@/lib/zodSchemas";
import { useState, useTransition, useMemo } from "react";
import { IndentRequestWithRelations } from "@/data/procurement";
import { deleteIndent } from "@/actions/procurement/delete-indent";
import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import { DataTable, DataTableFilterField } from "@/components/data-table/data-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CreateIndentDialog } from "./create-indent-dialog";
import { IndentItemColumns } from "./columns";
import { IndentItemRow } from "./columns";

interface IndentClientPageProps {
    data: IndentRequestWithRelations[];
    userRole: string;
    action?: React.ReactNode;
    workspaceId: string;
    projects: { id: string; name: string }[];
    tasks: { id: string; name: string; projectId: string; assigneeId?: string | null }[];
    materials: { id: string; name: string; defaultUnitId: string | null; vendors?: { id: string; name: string }[] }[];
    units: { id: string; name: string; abbreviation: string | null }[];
    vendors: { id: string; name: string }[];
    workspaceMembers: WorkspaceMemberRow[];
    currentMemberId: string;
}

export function IndentClientPage({
    data,
    userRole,
    action,
    workspaceId,
    projects,
    tasks,
    materials,
    units,
    vendors,
    workspaceMembers,
    currentMemberId,
}: IndentClientPageProps) {
    const [editingIndent, setEditingIndent] = useState<{ id: string, data: IndentDialogFormData } | null>(null);
    const [deletingIndentId, setDeletingIndentId] = useState<string | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const handleDelete = (row: IndentItemRow) => {
        setDeletingIndentId(row.indentId);
    };

    const confirmDelete = () => {
        if (!deletingIndentId) return;

        startTransition(async () => {
            try {
                const result = await deleteIndent({
                    indentId: deletingIndentId,
                    workspaceId,
                });

                if (result.success) {
                    toast.success("Indent deleted successfully");
                } else {
                    toast.error(result.error || "Failed to delete indent");
                }
            } catch (error) {
                console.error(error);
                toast.error("Something went wrong");
            } finally {
                setDeletingIndentId(null);
            }
        });
    };

    const handleEdit = (row: IndentItemRow) => {
        const indent = data.find((i) => i.id === row.indentId);
        if (!indent) return;

        // Map IndentRequest to Form Data
        const formData: IndentDialogFormData = {
            name: indent.name,
            projectId: indent.projectId,
            taskId: indent.taskId || undefined,
            description: indent.description || undefined,
            expectedDelivery: indent.expectedDelivery || new Date(),
            requiresVendor: indent.requiresVendor,
            assignedTo: indent.assignedTo || "", // Should exist
            materials: indent.items.map(item => ({
                materialId: item.materialId || item.material?.id,
                quantity: item.quantity,
                documentDisplayName: item.documentDisplayName,
                unitId: item.unitId || item.unit?.id || undefined,
                vendorId: item.vendorId || item.vendor?.id || undefined,
                estimatedPrice: item.estimatedPrice || undefined,
                itemStatus: item.status as any,
            })),
        };

        setEditingIndent({ id: indent.id, data: formData });
    };

    const columns = IndentItemColumns(handleEdit, handleDelete);

    // Map indent requests to table rows (one row per indent)
    const tableData = useMemo<IndentItemRow[]>(() => {
        return data.map((indent) => ({
            id: indent.id,
            indentId: indent.id,
            indentKey: indent.key,
            indentName: indent.name,
            // Keep these for compatibility with the type, but they won't be displayed
            materialId: "",
            materialName: "",
            projectName: indent.project.name,
            taskName: indent.task?.name || null,
            assigneeName: indent.assignee?.surname || null,
            assigneeImage: indent.assignee?.image || null,
            requestedByName: indent.requestor?.surname || null,
            requestedByImage: indent.requestor?.image || null,
            quantity: 0,
            unit: null,
            vendorName: null,
            estimatedPrice: null,
            startDate: indent.createdAt, // When the indent was created
            expectedDelivery: indent.expectedDelivery,
            status: "",
            materialsCount: indent.items?.length || 0, // Count of materials in this indent
            requiresVendor: indent.requiresVendor, // Whether vendor is required
        }));
    }, [data]);

    const filterFields: DataTableFilterField<IndentItemRow>[] = [
        {
            label: "Project",
            value: "projectName",
            options: projects.map(p => ({ label: p.name, value: p.name })),
        },
        {
            label: "Due Date",
            value: "expectedDelivery",
            options: [
                { label: "Overdue", value: "overdue" },
                { label: "Due This Week", value: "this_week" },
                { label: "Due This Month", value: "this_month" },
                { label: "All", value: "all" },
            ],
        },
        {
            label: "Assignee",
            value: "assigneeName",
            options: workspaceMembers
                .map(m => ({
                    label: m.user?.name || "Unknown",
                    value: m.user?.name || "Unknown"
                }))
                .filter((v, i, a) => a.findIndex(t => t.value === v.value) === i),
        },
        {
            label: "Vendor Required",
            value: "requiresVendor",
            options: [
                { label: "Required", value: "true" },
                { label: "Not Required", value: "false" },
            ],
        },
    ];

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Indent Requests</h2>
                <div className="flex items-center space-x-2">
                    {action}
                </div>
            </div>
            <div className="h-full flex-1 flex-col space-y-8 md:flex">
                <DataTable
                    columns={columns}
                    data={tableData}
                    searchKey="indentName"
                    searchPlaceholder="Search indents..."
                    filterFields={filterFields}
                    filterDisplay="menu"
                    onAdd={() => setIsCreateDialogOpen(true)}
                    addButtonLabel="Create Indent"
                />
            </div>

            {/* Create Dialog */}
            <CreateIndentDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                workspaceId={workspaceId}
                projects={projects}
                tasks={tasks}
                materials={materials}
                units={units}
                vendors={vendors}
                userRole={userRole as any}
                workspaceMembers={workspaceMembers}
                currentMemberId={currentMemberId}
            />

            {/* Edit Dialog */}
            {editingIndent && (
                <CreateIndentDialog
                    key={editingIndent.id}
                    mode="edit"
                    open={!!editingIndent}
                    onOpenChange={(open) => !open && setEditingIndent(null)}
                    indentId={editingIndent.id}
                    initialData={editingIndent.data}
                    workspaceId={workspaceId}
                    projects={projects}
                    tasks={tasks}
                    materials={materials}
                    units={units}
                    vendors={vendors}
                    workspaceMembers={workspaceMembers}
                    currentMemberId={currentMemberId}
                    userRole={userRole as any}
                />
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingIndentId} onOpenChange={(open) => !open && setDeletingIndentId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the indent request and all its items. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                confirmDelete();
                            }}
                            disabled={pending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {pending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
