"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { activitySchema } from "@/lib/zodSchemas";

interface ActivityDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (comment: string, attachmentLink?: string) => void;
    subTaskName: string;
}

export function ActivityDialog({ isOpen, onClose, onSubmit, subTaskName }: ActivityDialogProps) {
    const [comment, setComment] = useState("");
    const [attachmentLink, setAttachmentLink] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ comment?: string; attachmentLink?: string }>({});

    const handleClearAttachment = () => {
        setAttachmentLink("");
    };

    const handleSubmit = async () => {
        const validation = activitySchema.safeParse({ comment, attachmentLink });
        if (!validation.success) {
            const formattedErrors: Record<string, string> = {};
            validation.error.issues.forEach((err) => {
                if (err.path[0]) {
                    formattedErrors[err.path[0].toString()] = err.message;
                }
            });
            setErrors(formattedErrors);
            toast.error(formattedErrors.comment || formattedErrors.attachmentLink || "Validation failed");
            return;
        }

        setErrors({});

        setIsSubmitting(true);
        try {
            await onSubmit(comment.trim(), attachmentLink.trim() || undefined);
            // Reset form
            setComment("");
            setAttachmentLink("");
            setErrors({});
            onClose();
        } catch (error) {
            console.error("Error submitting activity:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setComment("");
        setAttachmentLink("");
        setErrors({});
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Activity</DialogTitle>
                    <DialogDescription>
                        Moving <span className="font-semibold text-foreground">{subTaskName}</span> requires an activity note or attachment.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="comment">Activity Note</Label>
                        <Textarea
                            id="comment"
                            placeholder="Add your activity note here..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={4}
                            className={`resize-none ${errors.comment ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                        {errors.comment && <p className="text-xs text-destructive mt-1">{errors.comment}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="attachmentLink">Attachment Link (Optional)</Label>
                        <div className="relative flex items-center">
                            <input
                                type="url"
                                id="attachmentLink"
                                placeholder="https://example.com/document"
                                value={attachmentLink}
                                onChange={(e) => setAttachmentLink(e.target.value)}
                                className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.attachmentLink ? 'border-destructive' : ''}`}
                            />
                            {errors.attachmentLink && <p className="text-[10px] text-destructive absolute -bottom-4">{errors.attachmentLink}</p>}
                            {attachmentLink && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-1 px-2 text-muted-foreground hover:text-foreground"
                                    onClick={handleClearAttachment}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !comment.trim()}
                    >
                        {isSubmitting ? "Submitting..." : "Submit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
