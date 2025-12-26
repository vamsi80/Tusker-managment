"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTag } from "@/actions/tag/create-tag";
import { updateTag } from "@/actions/tag/update-tag";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Tag {
    id: string;
    name: string;
    color: string;
}

interface TagDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    tag?: Tag | null;
    onSuccess?: () => void;
}



export function TagDialog({ open, onOpenChange, workspaceId, tag, onSuccess }: TagDialogProps) {
    const [name, setName] = useState(tag?.name || "");
    const [color, setColor] = useState(tag?.color || "#3b82f6");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Update form when tag changes
    useEffect(() => {
        if (tag) {
            setName(tag.name);
            setColor(tag.color);
        } else {
            setName("");
            setColor("#3b82f6");
        }
    }, [tag, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const result = tag
                ? await updateTag({ tagId: tag.id, name, color, workspaceId })
                : await createTag({ name, color, workspaceId });

            if (result.success) {
                toast.success(`Tag "${name}" has been ${tag ? "updated" : "created"} successfully.`);
                onOpenChange(false);
                setName("");
                setColor("#3b82f6");
                onSuccess?.();
            } else {
                toast.error(result.error || "An error occurred");
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{tag ? "Edit Tag" : "Create New Tag"}</DialogTitle>
                        <DialogDescription>
                            {tag
                                ? "Update the tag name and color."
                                : "Add a new tag to organize your tasks."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Tag Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Design, Development"
                                required
                                maxLength={50}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="color">Tag Color</Label>
                            <div className="flex gap-2 items-center">
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('color-input')?.click()}
                                        className="w-8 h-8 rounded-full border-2 border-input hover:border-primary transition-colors cursor-pointer flex items-center justify-center"
                                        style={{ backgroundColor: color }}
                                    />
                                    <input
                                        id="color-input"
                                        type="color"
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-s text-muted-foreground font-mono">{color}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {tag ? "Update" : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
