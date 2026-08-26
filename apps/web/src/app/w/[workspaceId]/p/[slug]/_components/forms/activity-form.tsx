"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Paperclip, X, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { activitySchema } from "@/lib/zodSchemas";
import {
    ATTACHMENT_ACCEPT,
    ATTACHMENT_RETENTION_DAYS,
    MAX_FILES,
    formatBytes,
    validateAttachment,
    type ActivityAttachment,
} from "@/lib/attachments";
import { AttachmentIcon } from "@/components/task/shared/attachment-preview";

interface ActivityDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (comment: string, attachment?: ActivityAttachment) => void;
    subTaskName: string;
    /** Required for file uploads — the attach button is hidden when any of these is missing. */
    workspaceId?: string;
    projectId?: string;
    taskId?: string;
}

interface PendingUpload {
    id: string;
    name: string;
    size: number;
    mime: string;
    progress: number;
    key?: string;
    error?: string;
    xhr?: XMLHttpRequest;
}

/** Presign, then PUT straight to storage. XHR rather than fetch, because only XHR reports upload progress. */
async function uploadToStorage(
    file: File,
    ids: { workspaceId: string; projectId: string; taskId: string },
    onStart: (xhr: XMLHttpRequest) => void,
    onProgress: (percent: number) => void,
): Promise<{ key: string; mime: string }> {
    const res = await fetch("/api/v1/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ids, name: file.name, mime: file.type, size: file.size }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Could not start the upload");
    }

    const { url, key, contentType } = json.data;

    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        onStart(xhr);
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
                ? resolve()
                : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
        xhr.onabort = () => reject(new Error("cancelled"));
        xhr.send(file);
    });

    return { key, mime: contentType };
}

export function ActivityDialog({
    isOpen,
    onClose,
    onSubmit,
    subTaskName,
    workspaceId,
    projectId,
    taskId,
}: ActivityDialogProps) {
    const [comment, setComment] = useState("");
    const [attachmentLink, setAttachmentLink] = useState("");
    const [uploads, setUploads] = useState<PendingUpload[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ comment?: string; attachmentLink?: string }>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canUpload = !!(workspaceId && projectId && taskId);
    const isUploading = uploads.some((u) => !u.key && !u.error);
    const uploadedFiles = uploads
        .filter((u) => !!u.key)
        .map((u) => ({ key: u.key!, name: u.name, mime: u.mime, size: u.size }));

    const patchUpload = (id: string, patch: Partial<PendingUpload>) =>
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

    const handleFilesPicked = (fileList: FileList | null) => {
        if (!fileList?.length || !canUpload) return;
        const picked = Array.from(fileList);

        if (uploads.length + picked.length > MAX_FILES) {
            toast.error(`You can attach up to ${MAX_FILES} files.`);
            return;
        }

        picked.forEach((file) => {
            const check = validateAttachment(file);
            if (!check.ok) {
                toast.error(check.error);
                return;
            }

            const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
            setUploads((prev) => [...prev, { id, name: file.name, size: file.size, mime: file.type, progress: 0 }]);

            uploadToStorage(
                file,
                { workspaceId: workspaceId!, projectId: projectId!, taskId: taskId! },
                (xhr) => patchUpload(id, { xhr }),
                (progress) => patchUpload(id, { progress }),
            )
                .then(({ key, mime }) => patchUpload(id, { key, mime, progress: 100, xhr: undefined }))
                .catch((err: Error) => {
                    if (err.message === "cancelled") return;
                    patchUpload(id, { error: err.message, xhr: undefined });
                    toast.error(`${file.name}: ${err.message}`);
                });
        });
    };

    const handleRemoveUpload = (id: string) => {
        setUploads((prev) => {
            prev.find((u) => u.id === id)?.xhr?.abort();
            return prev.filter((u) => u.id !== id);
        });
    };

    const handleClearAttachment = () => {
        setAttachmentLink("");
    };

    const resetForm = () => {
        uploads.forEach((u) => u.xhr?.abort());
        setComment("");
        setAttachmentLink("");
        setUploads([]);
        setErrors({});
    };

    const handleSubmit = async () => {
        const validation = activitySchema.safeParse({ comment, attachmentLink, files: uploadedFiles });
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

        const link = attachmentLink.trim();
        const attachment: ActivityAttachment | undefined =
            link || uploadedFiles.length
                ? { ...(link ? { url: link } : {}), ...(uploadedFiles.length ? { files: uploadedFiles } : {}) }
                : undefined;

        setIsSubmitting(true);
        try {
            // Files uploaded before a cancel are orphaned in the bucket, but the
            // retention lifecycle rule sweeps them up along with everything else.
            await onSubmit(comment.trim(), attachment);
            resetForm();
            onClose();
        } catch (error) {
            console.error("Error submitting activity:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        resetForm();
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
                        <Label htmlFor="attachmentLink">Attachment (Optional)</Label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex flex-1 items-center">
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
                                        <X className="size-4" />
                                    </Button>
                                )}
                            </div>

                            {canUpload && (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        title="Attach files from your device"
                                        aria-label="Attach files from your device"
                                        className="size-10 shrink-0"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Paperclip className="size-4" />
                                    </Button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        hidden
                                        accept={ATTACHMENT_ACCEPT}
                                        onChange={(e) => {
                                            handleFilesPicked(e.target.files);
                                            e.target.value = ""; // let the same file be picked again
                                        }}
                                    />
                                </>
                            )}
                        </div>

                        {canUpload && (
                            <p className="text-[10px] text-muted-foreground">
                                Uploaded files are deleted automatically {ATTACHMENT_RETENTION_DAYS} days after upload.
                            </p>
                        )}

                        {uploads.length > 0 && (
                            <ul className="space-y-1.5 pt-1">
                                {uploads.map((u) => (
                                    <li
                                        key={u.id}
                                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${u.error ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}
                                    >
                                        {u.error ? (
                                            <AlertCircle className="size-4 shrink-0 text-destructive" />
                                        ) : (
                                            <AttachmentIcon name={u.name} mime={u.mime} className="size-4 shrink-0 text-muted-foreground" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium">{u.name}</p>
                                            {u.error ? (
                                                <p className="text-[10px] text-destructive">{u.error}</p>
                                            ) : u.key ? (
                                                <p className="text-[10px] text-muted-foreground">{formatBytes(u.size)}</p>
                                            ) : (
                                                <Progress value={u.progress} className="mt-1 h-1" />
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="size-6 shrink-0 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label={`Remove ${u.name}`}
                                            onClick={() => handleRemoveUpload(u.id)}
                                        >
                                            <X className="size-3.5" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
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
                        disabled={isSubmitting || isUploading || !comment.trim()}
                    >
                        {isSubmitting ? "Submitting..." : isUploading ? "Uploading..." : "Submit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
