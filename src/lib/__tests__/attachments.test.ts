import { describe, it, expect } from "vitest";
import {
    attachmentKind,
    validateAttachment,
    isAttachmentExpired,
    ATTACHMENT_RETENTION_DAYS,
    attachmentKeyPrefix,
    parseAttachmentKey,
    MAX_MEDIA_BYTES,
    MAX_FILE_BYTES,
} from "@/lib/attachments";

const MB = 1024 * 1024;

describe("attachment validation", () => {
    it("classifies by extension when the browser reports a useless MIME", () => {
        // Browsers routinely hand back "" or application/octet-stream for these.
        expect(attachmentKind("site-walk.mov", "")).toBe("video");
        expect(attachmentKind("drone.avi", "application/octet-stream")).toBe("video");
        expect(attachmentKind("deck.pptx", "")).toBe("doc");
        expect(attachmentKind("boq.xlsx", "")).toBe("doc");
        expect(attachmentKind("scan.pdf", "")).toBe("pdf");
    });

    it("falls back to the MIME prefix for formats not in the extension table", () => {
        expect(attachmentKind("clip.mts", "video/mp2t")).toBe("video");
        expect(attachmentKind("photo.jfif", "image/jpeg")).toBe("image");
        expect(attachmentKind("note.caf", "audio/x-caf")).toBe("audio");
    });

    it("rejects file types outside the allowlist", () => {
        const result = validateAttachment({ name: "payload.exe", size: 1024, type: "" });
        expect(result.ok).toBe(false);
    });

    it("allows video up to the media limit and rejects beyond it", () => {
        expect(validateAttachment({ name: "walk.mp4", size: MAX_MEDIA_BYTES, type: "video/mp4" }).ok).toBe(true);
        expect(validateAttachment({ name: "walk.mp4", size: MAX_MEDIA_BYTES + 1, type: "video/mp4" }).ok).toBe(false);
    });

    it("holds documents to the smaller limit", () => {
        expect(validateAttachment({ name: "report.pdf", size: MAX_FILE_BYTES, type: "application/pdf" }).ok).toBe(true);

        const tooBig = validateAttachment({ name: "report.pdf", size: 30 * MB, type: "application/pdf" });
        expect(tooBig.ok).toBe(false);
        if (!tooBig.ok) expect(tooBig.error).toContain("limit is");
    });

    it("rejects empty files", () => {
        expect(validateAttachment({ name: "empty.png", size: 0, type: "image/png" }).ok).toBe(false);
    });
});

describe("attachment retention", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date("2026-08-19T12:00:00Z");
    const daysAgo = (d: number) => new Date(now.getTime() - d * DAY).toISOString();

    it("keeps files inside the retention window", () => {
        expect(isAttachmentExpired(daysAgo(0), now)).toBe(false);
        expect(isAttachmentExpired(daysAgo(ATTACHMENT_RETENTION_DAYS - 1), now)).toBe(false);
    });

    it("marks files expired once the bucket would have deleted them", () => {
        expect(isAttachmentExpired(daysAgo(ATTACHMENT_RETENTION_DAYS), now)).toBe(true);
        expect(isAttachmentExpired(daysAgo(30), now)).toBe(true);
    });

    it("does not hide files when the timestamp is unusable", () => {
        expect(isAttachmentExpired("not-a-date", now)).toBe(false);
    });
});

describe("attachment object keys", () => {
    it("round-trips the ids the download route authorizes against", () => {
        const key = `${attachmentKeyPrefix("ws_1", "tsk_9")}3f2a.png`;
        expect(key).toBe("workspaces/ws_1/tasks/tsk_9/3f2a.png");
        expect(parseAttachmentKey(key)).toEqual({ workspaceId: "ws_1", taskId: "tsk_9" });
    });

    it("stays under the workspaces/ prefix the lifecycle rule expires", () => {
        expect(attachmentKeyPrefix("ws_1", "tsk_9").startsWith("workspaces/")).toBe(true);
    });

    it("rejects keys that do not match the expected shape", () => {
        expect(parseAttachmentKey("workspaces/ws_1/tasks/tsk_9/nested/file.png")).toBeNull();
        expect(parseAttachmentKey("other/ws_1/tasks/tsk_9/file.png")).toBeNull();
        expect(parseAttachmentKey("workspaces/ws_1/file.png")).toBeNull();
        expect(parseAttachmentKey("workspaces/../tasks/tsk_9/file.png")).toBeNull();
        expect(parseAttachmentKey("")).toBeNull();
    });
});
