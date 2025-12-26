"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { toast } from "sonner";
import { Pencil, Plus, X } from "lucide-react";

interface Tag {
    id: string;
    name: string;
    color: string;
    _count?: {
        tasks: number;
    };
}

interface TagsManagerProps {
    workspaceId: string;
    tags: Tag[];
}

export function TagsManager({ workspaceId, tags }: TagsManagerProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleEdit = (tag: Tag) => {
        setEditingTag(tag);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingTag(null);
        setDialogOpen(true);
    };

    const handleDeleteClick = (tag: Tag) => {
        setTagToDelete(tag);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!tagToDelete) return;

        setIsDeleting(true);
        try {
            const result = await deleteTag({
                tagId: tagToDelete.id,
                workspaceId,
            });

            if (result.success) {
                toast.success(`Tag "${tagToDelete.name}" has been deleted successfully.`);
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
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Task Tags</CardTitle>
                            <CardDescription>
                                Manage tags to organize and categorize your tasks
                            </CardDescription>
                        </div>
                        <Button onClick={handleCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Tag
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {tags.length === 0 ? (
                        <div className="text-center text-muted-foreground">
                            <p>No tags yet. Create your first tag to get started.</p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                                <div
                                    key={tag.id}
                                    className="group relative inline-flex items-center px-2 py-1 rounded-4xl transition-all hover:shadow-md"
                                    style={{
                                        backgroundColor: tag.color,
                                        color: "#ffffff",
                                    }}
                                >
                                    <span className="text-xs">{tag.name}</span>
                                    {tag._count && tag._count.tasks > 0 && (
                                        <span className="text-xs opacity-80">
                                            ({tag._count.tasks})
                                        </span>
                                    )}
                                    <div className="flex items-center gap-1 ml-1 opacity-100">
                                        <button
                                            onClick={() => handleEdit(tag)}
                                            className="p-1 hover:bg-white/20 rounded transition-colors"
                                            aria-label="Edit tag"
                                        >
                                            <Pencil className="h-3 w-3" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(tag)}
                                            className="p-1 hover:bg-white/20 rounded transition-colors"
                                            aria-label="Delete tag"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <TagDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                workspaceId={workspaceId}
                tag={editingTag}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete the tag "{tagToDelete?.name}". Tasks using this tag will
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
