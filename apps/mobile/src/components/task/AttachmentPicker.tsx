import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Camera, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { MAX_FILES, formatBytes, pickDocuments, pickPhotos, uploadAttachment, validateFile, type AttachedFile, type LocalFile } from "../../lib/attachments";
import { toast } from "../../lib/toast";
import { Text } from "../ui";

type Pending = { local: LocalFile; uploaded?: AttachedFile; error?: string };

/**
 * activity-form.tsx's attach area: photos, camera or files, uploaded straight
 * to storage as they're picked; the parent reads `uploaded` keys on submit.
 */
export function useAttachmentUploads(ctx: { workspaceId: string; projectId: string; taskId: string }) {
    const [items, setItems] = useState<Pending[]>([]);
    const isUploading = items.some((i) => !i.uploaded && !i.error);
    const files = items.map((i) => i.uploaded).filter(Boolean) as AttachedFile[];

    const add = async (picked: LocalFile[]) => {
        const room = MAX_FILES - items.length;
        const accepted = picked.slice(0, Math.max(0, room));
        if (picked.length > accepted.length) toast.warning(`You can attach up to ${MAX_FILES} files.`);
        for (const local of accepted) {
            const invalid = validateFile(local);
            if (invalid) {
                toast.error(invalid);
                continue;
            }
            setItems((current) => [...current, { local }]);
            uploadAttachment(local, ctx)
                .then((uploaded) => setItems((current) => current.map((i) => (i.local === local ? { ...i, uploaded } : i))))
                .catch((error) => setItems((current) => current.map((i) => (i.local === local ? { ...i, error: error?.message ?? "Upload failed" } : i))));
        }
    };

    return { items, files, isUploading, add, remove: (local: LocalFile) => setItems((c) => c.filter((i) => i.local !== local)), reset: () => setItems([]) };
}

export function AttachmentPicker({ uploads }: { uploads: ReturnType<typeof useAttachmentUploads> }) {
    const { colors } = useTheme();
    const pick = async (source: "photos" | "camera" | "files") => {
        try {
            const picked = source === "files" ? await pickDocuments() : await pickPhotos(source === "camera");
            if (picked.length) uploads.add(picked);
        } catch (e) {
            toast.fromError(e);
        }
    };
    return (
        <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                    { key: "photos" as const, icon: ImageIcon, label: "Photos" },
                    { key: "camera" as const, icon: Camera, label: "Camera" },
                    { key: "files" as const, icon: Paperclip, label: "Files" },
                ].map(({ key, icon: Icon, label }) => (
                    <Pressable key={key} onPress={() => pick(key)} style={({ pressed }) => [styles.source, { borderColor: colors.border, backgroundColor: pressed ? colors.secondary : colors.card }]}>
                        <Icon size={16} color={colors.foreground} />
                        <Text variant="label">{label}</Text>
                    </Pressable>
                ))}
            </View>
            {uploads.items.map((item, i) => (
                <View key={i} style={[styles.file, { borderColor: item.error ? colors.destructive : colors.border, backgroundColor: colors.card }]}>
                    <FileText size={16} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                        <Text variant="small" numberOfLines={1}>
                            {item.local.name}
                        </Text>
                        <Text variant="caption" tone={item.error ? "destructive" : "muted"}>
                            {item.error ?? (item.uploaded ? formatBytes(item.uploaded.size) : "Uploading…")}
                        </Text>
                    </View>
                    {!item.uploaded && !item.error ? <ActivityIndicator size="small" color={colors.primaryInk} /> : null}
                    <Pressable hitSlop={8} onPress={() => uploads.remove(item.local)}>
                        <X size={15} color={colors.mutedForeground} />
                    </Pressable>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    source: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.sm, borderWidth: 1 },
    file: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.sm, borderWidth: 1 },
});
