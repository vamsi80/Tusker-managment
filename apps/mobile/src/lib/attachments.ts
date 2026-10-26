import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { API_BASE, getToken } from "../api/client";
import { uploadsApi } from "../api/comms";

/** Mirrors @tusker/core/lib/attachments.ts limits. */
export const MAX_FILES = 10;
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type AttachedFile = { key: string; name: string; mime: string; size: number };
export type LocalFile = { uri: string; name: string; mime: string; size: number };

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isMedia = (mime: string) => mime.startsWith("video/") || mime.startsWith("audio/");

export function validateFile(file: LocalFile): string | null {
    const limit = isMedia(file.mime) ? MAX_MEDIA_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) return `${file.name} is larger than ${formatBytes(limit)}.`;
    return null;
}

export async function pickDocuments(): Promise<LocalFile[]> {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return [];
    return result.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType ?? "application/octet-stream", size: a.size ?? 0 }));
}

export async function pickPhotos(fromCamera = false): Promise<LocalFile[]> {
    const permission = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error(fromCamera ? "Camera permission denied." : "Photo library permission denied.");
    const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, quality: 0.8 });
    if (result.canceled) return [];
    return result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `photo-${Date.now()}-${i}.${(a.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`,
        mime: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
        size: a.fileSize ?? 0,
    }));
}

/**
 * Presign, then PUT straight to storage (activity-form.tsx uploadToStorage) —
 * large media never passes through the API.
 */
export async function uploadAttachment(file: LocalFile, ctx: { workspaceId: string; projectId: string; taskId: string }): Promise<AttachedFile> {
    let size = file.size;
    if (!size) {
        const info = await FileSystem.getInfoAsync(file.uri);
        size = info.exists ? (info as any).size ?? 0 : 0;
    }
    const { url, key, contentType } = await uploadsApi.presign({ ...ctx, name: file.name, mime: file.mime, size: Math.max(1, size) });
    const res = await FileSystem.uploadAsync(url, file.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed for ${file.name} (${res.status})`);
    return { key, name: file.name, mime: file.mime, size };
}

/**
 * GET /uploads/file authorizes the viewer and redirects to a short-lived signed
 * URL. Follow it with the session token, then open the signed URL.
 */
export async function openAttachment(file: { key: string; name: string }, download = false) {
    const token = await getToken();
    const url = `${API_BASE}/api/v1/uploads/file?key=${encodeURIComponent(file.key)}&name=${encodeURIComponent(file.name)}${download ? "&download=1" : ""}`;
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const signed = res.url && res.url !== url ? res.url : url;
    await WebBrowser.openBrowserAsync(signed);
}

/** Activities store their attachment as JSON text: { url?, files?: AttachedFile[] }. */
export function parseActivityAttachment(raw: unknown): { url?: string; files: AttachedFile[] } {
    if (!raw) return { files: [] };
    try {
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (typeof value === "string") return { url: value, files: [] };
        return { url: value?.url, files: Array.isArray(value?.files) ? value.files : [] };
    } catch {
        return typeof raw === "string" && /^https?:/.test(raw) ? { url: raw, files: [] } : { files: [] };
    }
}
