"use client";

import { useState, useTransition, useMemo } from "react";
import { DataTable, DataTableFilterField } from "@/components/data-table/data-table";
import { getColumns, IndentItemRow } from "./columns";
import { IndentRequestWithRelations } from "@/data/procurement";
import { deleteIndent } from "@/actions/procurement/delete-indent";
import { toast } from "sonner";
import { CreateIndentDialog } from "./create-indent-dialog";
import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IndentDialogFormData } from "@/lib/zodSchemas";

interface IndentClientPageProps {
    data: IndentRequestWithRelations[];
    userRole: string;
    action?: React.ReactNode;
    workspaceId: string;
    // Catalog props
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
    const [pending, startTransition] = useTransition();

    const handleDelete = (row: IndentItemRow) => {
        // We delete the whole indent by ID. 
        // Note: The UI row is an item, but the action is on the Indent.
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
                unitId: item.unitId || item.unit?.id || undefined,
                vendorId: item.vendorId || item.vendor?.id || undefined,
                estimatedPrice: item.estimatedPrice || undefined,
                itemStatus: item.status as any,
            })),
        };

        setEditingIndent({ id: indent.id, data: formData });
    };

    const columns = getColumns(userRole, handleEdit, handleDelete);

    // Flatten indent requests into individual item rows
    const flattenedData = useMemo<IndentItemRow[]>(() => {
        return data.flatMap((indent) =>
            indent.items.map((item) => ({
                id: item.id,
                indentId: indent.id,
                indentKey: indent.key,
                indentName: indent.name,
                materialId: item.material.id,
                materialName: item.material.name,
                projectName: indent.project.name,
                taskName: indent.task?.name || null,
                assigneeName: indent.assignee?.user?.name || null,
                assigneeImage: indent.assignee?.user?.image || null,
                quantity: item.quantity,
                unit: item.unit?.abbreviation || null,
                vendorName: item.vendor?.name || null,
                estimatedPrice: item.estimatedPrice || null,
                expectedDelivery: indent.expectedDelivery,
                status: item.status,
            }))
        );
    }, [data]);

    const filterFields: DataTableFilterField<IndentItemRow>[] = [
        {
            label: "Project",
            value: "projectName",
            options: projects.map(p => ({ label: p.name, value: p.name })),
        },
        {
            label: "Status",
            value: "status",
            options: [
                { label: "Pending", value: "PENDING" },
                { label: "Approved", value: "APPROVED" },
                { label: "Qty Approved", value: "QUANTITY_APPROVED" },
                { label: "Vendor Pending", value: "VENDOR_PENDING" },
                { label: "Rejected", value: "REJECTED" },
            ],
        },
        {
            label: "Vendor",
            value: "vendorName",
            options: vendors.map(v => ({ label: v.name, value: v.name })),
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
            label: "Indent",
            value: "indentKey",
            options: Array.from(new Set(data.map(d => d.key))).map(k => ({ label: k, value: k })),
        },
        {
            label: "Material",
            value: "materialName",
            options: materials.map(m => ({ label: m.name, value: m.name })),
        },
    ];

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Indent Items</h2>
                <div className="flex items-center space-x-2">
                    {action}
                </div>
            </div>
            <div className="h-full flex-1 flex-col space-y-8 md:flex">
                <DataTable
                    columns={columns}
                    data={flattenedData}
                    searchKey="materialName"
                    searchPlaceholder="Search materials..."
                    filterFields={filterFields}
                    filterDisplay="menu"
                />
            </div>

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
