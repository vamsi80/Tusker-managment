"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { TagDialog } from "./tag-dialog";
import { deleteTag } from "@/actions/tag/delete-tag";
import { toast } from "@/lib/toast";
import { Pencil, Plus, X } from "lucide-react";
import { toTitleCase } from "@/lib/utils";

interface Tag {
    id: string;
    name: string;
    requirePurchase?: boolean;
    _count?: {
        tasks: number;
    };
}

interface TagsManagerProps {
    workspaceId: string;
    tags: Tag[];
    isWorkspaceAdmin?: boolean;
}

export function TagsManager({ workspaceId, tags, isWorkspaceAdmin = false }: TagsManagerProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleEdit = (tag: Tag) => {
        if (!isWorkspaceAdmin) return;
        setEditingTag(tag);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        if (!isWorkspaceAdmin) return;
        setEditingTag(null);
        setDialogOpen(true);
    };

    const handleDeleteClick = (tag: Tag) => {
        if (!isWorkspaceAdmin) return;
        setTagToDelete(tag);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!tagToDelete || !isWorkspaceAdmin) return;

        setIsDeleting(true);
        try {
            const result = await deleteTag({
                tagId: tagToDelete.id,
                workspaceId,
            });

            if (result.success) {
                toast.success(`Tag "${toTitleCase(tagToDelete.name)}" has been deleted successfully.`);
                setDeleteDialogOpen(false);
                setTagToDelete(null);
            } else {
                toast.error(result.error || "Failed to delete tag");
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <div className="flex flex-col gap-1 py-2">
                <CardHeader className="px-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Task Tags</CardTitle>
                            <CardDescription>
                                Manage tags to organize and categorize your tasks
                            </CardDescription>
                        </div>
                        {isWorkspaceAdmin && (
                            <Button onClick={handleCreate}>
                                <Plus className="mr-2 size-4" />
                                Add Tag
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="px-0">
                    {tags.length === 0 ? (
                        <div className="text-center text-muted-foreground">
                            <p>No tags yet. {isWorkspaceAdmin ? "Create your first tag to get started." : "No tags available in this workspace."}</p>
                        </div>
                    ) : (
                        // Alphabetical, split into up to five columns of white cards.
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                            {chunk(
                                [...tags].sort((x, y) => x.name.localeCompare(y.name)),
                                Math.ceil(tags.length / 5)
                            ).map((column, i) => (
                                <div key={i} className="flex flex-col items-start gap-3 rounded-2xl bg-white p-4 shadow-xs dark:bg-card">
                                    {column.map((tag) => (
                                        <Badge
                                            key={tag.id}
                                            variant="outline"
                                            className="group relative gap-2 bg-white px-3 py-1.5 text-sm font-normal shadow-xs dark:bg-card"
                                        >
                                            {toTitleCase(tag.name)}
                                            {tag._count && tag._count.tasks > 0 && (
                                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-foreground/40 px-1 text-[10px] tabular-nums">
                                                    {String(tag._count.tasks).padStart(2, "0")}
                                                </span>
                                            )}
                                            {isWorkspaceAdmin && (
                                                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                                    <button
                                                        onClick={() => handleEdit(tag)}
                                                        className="p-0.5 hover:bg-accent rounded-full transition-colors"
                                                        aria-label="Edit tag"
                                                    >
                                                        <Pencil className="size-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(tag)}
                                                        className="p-0.5 hover:bg-destructive/10 rounded-full transition-colors"
                                                        aria-label="Delete tag"
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                </span>
                                            )}
                                        </Badge>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </div>

            <TagDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                workspaceId={workspaceId}
                tag={editingTag}
                isWorkspaceAdmin={isWorkspaceAdmin}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete the tag "{toTitleCase(tagToDelete?.name)}". Tasks using this tag will
                            have it removed. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
    return out;
}
