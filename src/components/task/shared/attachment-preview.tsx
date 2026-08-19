"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileSpreadsheet, FileText, Film, Image as ImageIcon, Music } from "lucide-react";
import {
    ATTACHMENT_RETENTION_DAYS,
    attachmentKind,
    extensionOf,
    formatBytes,
    isAttachmentExpired,
    type AttachedFile,
} from "@/lib/attachments";

/**
 * Attachments live in a private bucket; this route authorizes the viewer and then
 * redirects to a short-lived signed URL, so it can be used directly as an <img>/<video> src.
 */
export const attachmentUrl = (file: AttachedFile, download = false) =>
    `/api/v1/uploads/file?key=${encodeURIComponent(file.key)}&name=${encodeURIComponent(file.name)}${download ? "&download=1" : ""}`;

export function AttachmentIcon({ name, mime, className }: { name: string; mime?: string; className?: string }) {
    const kind = attachmentKind(name, mime);
    if (kind === "image") return <ImageIcon className={className} />;
    if (kind === "video") return <Film className={className} />;
    if (kind === "audio") return <Music className={className} />;
    if (["xls", "xlsx", "csv"].includes(extensionOf(name))) return <FileSpreadsheet className={className} />;
    return <FileText className={className} />;
}

/**
 * Files attached to an activity, with in-place preview where the browser can render it.
 * Office documents and .avi have no browser renderer, so they are download-only.
 */
export function AttachmentList({ files, uploadedAt }: { files: AttachedFile[]; uploadedAt?: string | Date }) {
    const [preview, setPreview] = useState<AttachedFile | null>(null);

    if (!files?.length) return null;

    // The bucket deletes the objects on its own schedule; showing dead View/Download
    // buttons would just hand the reviewer a broken link.
    const expired = uploadedAt ? isAttachmentExpired(uploadedAt) : false;

    if (expired) {
        return (
            <ul className="flex w-full flex-col gap-1.5">
                {files.map((file) => (
                    <li
                        key={file.key}
                        className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 opacity-70"
                    >
                        <AttachmentIcon name={file.name} mime={file.mime} className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium line-through decoration-muted-foreground/50">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                                Deleted &mdash; attachments are removed {ATTACHMENT_RETENTION_DAYS} days after upload
                            </p>
                        </div>
                    </li>
                ))}
            </ul>
        );
    }

    const previewKind = preview ? attachmentKind(preview.name, preview.mime) : null;

    return (
        <>
            <ul className="flex w-full flex-col gap-1.5">
                {files.map((file) => {
                    const kind = attachmentKind(file.name, file.mime);
                    const inlinePreview = kind === "image" || kind === "video" || kind === "audio";

                    return (
                        <li
                            key={file.key}
                            className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                        >
                            <AttachmentIcon name={file.name} mime={file.mime} className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{file.name}</p>
                                <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                            </div>

                            {inlinePreview && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs"
                                    onClick={() => setPreview(file)}
                                >
                                    <Eye className="size-3.5" />
                                    View
                                </Button>
                            )}
                            {kind === "pdf" && (
                                <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                                    <a href={attachmentUrl(file)} target="_blank" rel="noopener noreferrer">
                                        <Eye className="size-3.5" />
                                        View
                                    </a>
                                </Button>
                            )}
                            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                                <a href={attachmentUrl(file, true)}>
                                    <Download className="size-3.5" />
                                    Download
                                </a>
                            </Button>
                        </li>
                    );
                })}
            </ul>

            <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="truncate pr-6 text-sm">{preview?.name}</DialogTitle>
                    </DialogHeader>
                    {preview && (
                        <div className="flex max-h-[70vh] items-center justify-center overflow-auto">
                            {previewKind === "image" && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={attachmentUrl(preview)} alt={preview.name} className="max-h-[70vh] w-auto max-w-full rounded-md" />
                            )}
                            {previewKind === "video" && (
                                <video src={attachmentUrl(preview)} controls className="max-h-[70vh] w-full rounded-md" />
                            )}
                            {previewKind === "audio" && (
                                <audio src={attachmentUrl(preview)} controls className="w-full" />
                            )}
                        </div>
                    )}
                    {preview && (
                        <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                            <a href={attachmentUrl(preview, true)}>
                                <Download className="size-4" />
                                Download
                            </a>
                        </Button>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
