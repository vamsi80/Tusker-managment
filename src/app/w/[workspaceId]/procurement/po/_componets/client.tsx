"use client";

import { toast } from "sonner";
import { IndentDialogFormData } from "@/lib/zodSchemas";
import { useState, useTransition, useMemo } from "react";
import { CreateIndentDialog } from "../../indent/_components/create-indent-dialog";
import { CreatePODialog } from "./create-po-dialog";
import { IndentRequestWithRelations } from "@/data/procurement";
import { deleteIndent } from "@/actions/procurement/delete-indent";
import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import { DataTable, DataTableFilterField } from "@/components/data-table/data-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { POItemColumns, POItemRow } from "./columns";
import { Item } from "@radix-ui/react-dropdown-menu";

interface PoClientPageProps {
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

export function PoClientPage({
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
}: PoClientPageProps) {
    const [editingIndent, setEditingIndent] = useState<{ id: string, data: IndentDialogFormData } | null>(null);
    const [deletingIndentId, setDeletingIndentId] = useState<string | null>(null);
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
    const [createPODialogOpen, setCreatePODialogOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const selectedCount = Object.keys(rowSelection).filter(key => rowSelection[key]).length;

    const handleDelete = (row: POItemRow) => {
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

    const handleEdit = (row: POItemRow) => {
        const indent = data.find((i) => i.id === row.indentId);
        if (!indent) return;

        const formData: IndentDialogFormData = {
            name: indent.name,
            projectId: indent.projectId,
            taskId: indent.taskId || undefined,
            description: indent.description || undefined,
            expectedDelivery: indent.expectedDelivery || new Date(),
            requiresVendor: indent.requiresVendor,
            assignedTo: indent.assignedTo || "",
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

    const columns = POItemColumns(handleEdit, handleDelete);

    const flattenedData = useMemo<POItemRow[]>(() => {
        return data.flatMap((indent) =>
            indent.items.map((item) => {
                // Check if item has any PO items
                const hasPO = item.purchaseOrderItems && item.purchaseOrderItems.length > 0;
                const firstPO = hasPO ? item.purchaseOrderItems[0] : null;

                return {
                    id: item.id,
                    indentId: indent.id,
                    indentKey: indent.key,
                    indentName: indent.name,
                    materialId: item.material.id,
                    materialName: item.material.name,
                    projectName: indent.project.name,
                    taskName: indent.task?.name || null,
                    assigneeName: indent.assignee?.name || null,
                    assigneeImage: indent.assignee?.image || null,
                    quantity: item.quantity,
                    unitId: item.unit?.id || null,
                    unit: item.unit?.abbreviation || null,
                    vendorId: item.vendor?.id || null,
                    vendorName: item.vendor?.name || null,
                    estimatedPrice: item.estimatedPrice || null,
                    expectedDelivery: indent.expectedDelivery,
                    status: item.status,

                    // ADD THESE:
                    hasPO: hasPO,
                    poNumber: firstPO?.purchaseOrder?.poNumber,
                    poStatus: firstPO?.purchaseOrder?.status,
                };
            })
        );
    }, [data]);

    const filterFields: DataTableFilterField<POItemRow>[] = [
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
            value: "indentName",
            options: Array.from(new Map(flattenedData.map(d => [d.indentName, d.indentName])).entries())
                .map(([name, _]) => ({ label: name, value: name })),
        },
        {
            label: "Material",
            value: "materialName",
            options: Array.from(new Set(flattenedData.map(d => d.materialName))).map(name => ({ label: name, value: name })),
        },
    ];

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">PO Items</h2>
                <div className="flex items-center space-x-2">
                    {action}
                    <Button
                        disabled={selectedCount === 0}
                        onClick={() => setCreatePODialogOpen(true)}
                    >
                        <IconPlus className="mr-2 h-4 w-4" />
                        Create PO {selectedCount > 0 && `(${selectedCount})`}
                    </Button>
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
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    getRowId={(row) => row.id}
                    enableRowSelection={(row) => !row.original.hasPO}
                    getRowClassName={(row) =>
                        row.original.hasPO ? 'opacity-50 bg-muted/30 cursor-not-allowed' : ''
                    }
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

            {/* Create PO Dialog */}
            {createPODialogOpen && (() => {
                const selectedItemsData = flattenedData.filter((item) => rowSelection[item.id]);
                console.log('=== CLIENT PASSING TO DIALOG ===');
                console.log('Row Selection:', rowSelection);
                console.log('Flattened Data Length:', flattenedData.length);
                console.log('Selected Items Data:', selectedItemsData);
                console.log('Selected Items Length:', selectedItemsData.length);
                console.log('===================================');

                return (
                    <CreatePODialog
                        open={createPODialogOpen}
                        onOpenChange={setCreatePODialogOpen}
                        selectedItems={selectedItemsData}
                        workspaceId={workspaceId}
                        vendors={vendors}
                        projects={projects}
                        materials={materials}
                        onSuccess={() => {
                            setRowSelection({});
                            setCreatePODialogOpen(false);
                        }}
                    />
                );
            })()}
        </div>
    );
}
