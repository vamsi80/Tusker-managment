"use client";

import { IconEdit, IconTrash, IconLock } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";

interface UnitItemProps {
    unit: {
        id: string;
        name: string;
        abbreviation: string;
        isDefault: boolean;
    };
    onEdit?: (unitId: string) => void;
    onDelete?: (unitId: string) => void;
}

export function UnitItem({ unit, onEdit, onDelete }: UnitItemProps) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const handleDelete = async () => {
        if (onDelete) {
            onDelete(unit.id);
        }
        setShowDeleteDialog(false);
    };

    return (
        <>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer group">
                <div className="flex-1 text-sm">
                    {unit.name} ({unit.abbreviation})
                    {unit.isDefault && (
                        <IconLock className="inline-block ml-1 h-3 w-3 text-muted-foreground" />
                    )}
                </div>

                {!unit.isDefault && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onEdit) onEdit(unit.id);
                            }}
                        >
                            <IconEdit className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteDialog(true);
                            }}
                        >
                            <IconTrash className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </div>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Unit</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{unit.name} ({unit.abbreviation})"?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
