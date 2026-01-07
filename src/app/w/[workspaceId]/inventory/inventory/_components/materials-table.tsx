"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { createMaterialColumns } from "./material-columns";
import { MaterialRow } from "@/data/inventory/materials";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CreateMaterialForm } from "./create-material-form";

interface MaterialsTableProps {
    data: MaterialRow[];
    workspaceId: string;
    isAdmin: boolean;
    units: {
        id: string;
        name: string;
        abbreviation: string;
        category: string | null;
        isDefault: boolean;
    }[];
}

export function MaterialsTable({ data, workspaceId, isAdmin, units }: MaterialsTableProps) {
    const router = useRouter();

    // Dialog states
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [materialToView, setMaterialToView] = useState<MaterialRow | null>(null);

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [materialToEdit, setMaterialToEdit] = useState<MaterialRow | null>(null);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [materialToDelete, setMaterialToDelete] = useState<MaterialRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    // Handlers
    const handleView = (material: MaterialRow) => {
        setMaterialToView(material);
        setViewDialogOpen(true);
    };

    const handleEdit = (material: MaterialRow) => {
        setMaterialToEdit(material);
        setEditDialogOpen(true);
        toast.info("Edit material functionality coming soon!");
    };

    const handleDelete = (material: MaterialRow) => {
        setMaterialToDelete(material);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!materialToDelete) return;

        setIsDeleting(true);
        try {
            // TODO: Implement deleteMaterial action
            // const result = await deleteMaterial(materialToDelete.id, workspaceId);

            // Simulation for now
            await new Promise(resolve => setTimeout(resolve, 1000));

            toast.info("Delete functionality implementation pending");
            setDeleteDialogOpen(false);
            setMaterialToDelete(null);

            // Refresh page if successful
            // router.refresh();

        } catch (error) {
            toast.error("Failed to delete material");
        } finally {
            setIsDeleting(false);
        }
    };

    const columns = createMaterialColumns(
        isAdmin,
        handleView,
        handleEdit,
        handleDelete
    );

    return (
        <>
            <DataTable
                columns={columns}
                data={data}
                searchKey="name"
                searchPlaceholder="Search materials..."
                onRowClick={handleView}
                showPagination={true}
                showColumnToggle={true}
                pageSize={10}
                onAdd={isAdmin ? () => setCreateDialogOpen(true) : undefined}
                addButtonLabel="Add New Material"
            />

            <CreateMaterialForm
                workspaceId={workspaceId}
                units={units}
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                hideTrigger={true}
            />

            {/* View Material Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Material Details</DialogTitle>
                    </DialogHeader>
                    {materialToView && (
                        <div className="space-y-4 py-4">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-lg font-semibold">{materialToView.name}</h3>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <span>Unit: {materialToView.defaultUnit.name} ({materialToView.defaultUnit.abbreviation})</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium">Specifications</h4>
                                <div className="p-3 bg-muted rounded-md text-sm">
                                    {materialToView.specifications || "No specifications provided."}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Material</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <span className="font-semibold">{materialToDelete?.name}</span>?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                "Delete"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
