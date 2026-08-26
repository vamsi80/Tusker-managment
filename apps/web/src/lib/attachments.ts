import { z } from "zod";

/**
 * Task attachment rules — shared by the upload dialog, the presign route and the
 * reviewer's activity list, so the client pre-check and the server check can never drift.
 */

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // video / audio
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // everything else
export const MAX_FILES = 10;

export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "doc";

const EXT_KIND: Record<string, AttachmentKind> = {
    // images
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image",
    svg: "image", avif: "image", heic: "image", heif: "image", tif: "image", tiff: "image",
    // video
    mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video", m4v: "video",
    wmv: "video", flv: "video", "3gp": "video", mpeg: "video", mpg: "video",
    // audio
    mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", ogg: "audio", oga: "audio",
    flac: "audio", wma: "audio", opus: "audio", amr: "audio",
    // documents
    pdf: "pdf",
    doc: "doc", docx: "doc", xls: "doc", xlsx: "doc", csv: "doc", ppt: "doc", pptx: "doc",
    txt: "doc", rtf: "doc", odt: "doc", ods: "doc", odp: "doc",
};

/** File-picker `accept` attribute. */
export const ATTACHMENT_ACCEPT = [
    ...Object.keys(EXT_KIND).map((e) => `.${e}`),
    "image/*",
    "video/*",
    "audio/*",
].join(",");

export const extensionOf = (nameOrKey: string) =>
    (nameOrKey.split(".").pop() || "").toLowerCase();

/**
 * Extension first, MIME second: browsers report .avi/.mov inconsistently (often empty or
 * application/octet-stream), so trusting MIME alone would reject valid site footage.
 * The MIME prefix fallback keeps exotic image/video/audio formats working.
 */
export function attachmentKind(name: string, mime?: string): AttachmentKind | null {
    const byExt = EXT_KIND[extensionOf(name)];
    if (byExt) return byExt;
    if (mime?.startsWith("image/")) return "image";
    if (mime?.startsWith("video/")) return "video";
    if (mime?.startsWith("audio/")) return "audio";
    if (mime === "application/pdf") return "pdf";
    return null;
}

export const maxBytesFor = (kind: AttachmentKind) =>
    kind === "video" || kind === "audio" ? MAX_MEDIA_BYTES : MAX_FILE_BYTES;

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Returns the resolved kind, or a human-readable reason the file is not allowed. */
export function validateAttachment(
    file: { name: string; size: number; type?: string }
): { ok: true; kind: AttachmentKind } | { ok: false; error: string } {
    const kind = attachmentKind(file.name, file.type);
    if (!kind) {
        return { ok: false, error: `${file.name}: this file type is not supported.` };
    }
    const max = maxBytesFor(kind);
    if (file.size > max) {
        return { ok: false, error: `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(max)}.` };
    }
    if (file.size === 0) {
        return { ok: false, error: `${file.name} is empty.` };
    }
    return { ok: true, kind };
}

/**
 * Uploaded files are removed by the bucket's lifecycle rule this many days after upload.
 * Keep this in sync with the storage rule — the UI only derives what the bucket enforces.
 */
export const ATTACHMENT_RETENTION_DAYS = 7;

/** Files outliving the retention window are gone from storage; the activity note itself is kept forever. */
export function isAttachmentExpired(uploadedAt: string | Date, now: Date = new Date()) {
    const uploaded = new Date(uploadedAt).getTime();
    if (Number.isNaN(uploaded)) return false;
    return now.getTime() - uploaded >= ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Object keys are `workspaces/{workspaceId}/tasks/{taskId}/{uuid}.{ext}`.
 * The download route authorizes purely off this shape, and the storage lifecycle rule
 * expires everything under the `workspaces/` prefix, so both ends must agree on it.
 */
export const attachmentKeyPrefix = (workspaceId: string, taskId: string) =>
    `workspaces/${workspaceId}/tasks/${taskId}/`;

const KEY_PATTERN = /^workspaces\/([^/]+)\/tasks\/([^/]+)\/[^/]+$/;

export function parseAttachmentKey(key: string): { workspaceId: string; taskId: string } | null {
    const match = KEY_PATTERN.exec(key);
    if (!match) return null;
    const [, workspaceId, taskId] = match;
    // A traversal segment would resolve to a workspace nobody is a member of, but reject
    // it outright rather than relying on that.
    if ([workspaceId, taskId].some((part) => part === "." || part === "..")) return null;
    return { workspaceId, taskId };
}

export const attachedFileSchema = z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    mime: z.string().default(""),
    size: z.number().int().nonnegative(),
});

export type AttachedFile = z.infer<typeof attachedFileSchema>;

/** Attachment payload carried by a status change: a pasted link, uploaded files, or both. */
export type ActivityAttachment = { url?: string; files?: AttachedFile[] };
