import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react-native";
import { reportsApi } from "../../api/people";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Button, Input, Select, Sheet, Text } from "../ui";

type Entry = { taskId: string; description: string };
/**
 * Today's IST calendar day as "yyyy-MM-dd". ReportService.submitReport builds
 * `${date}T00:00:00Z`, which only parses for this format (the web's
 * "d MMM yyyy" yields an invalid date).
 */
function todayIST() {
    return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** reports/_components/DailyReportModal.tsx — task (or Other Work) + a 15+ character description per entry. */
export function DailyReportSheet({ workspaceId, open, onClose, onSubmitted }: { workspaceId: string; open: boolean; onClose: () => void; onSubmitted?: () => void }) {
    const { colors } = useTheme();
    const form = useQuery({ queryKey: qk.reportForm(workspaceId), queryFn: () => reportsApi.formData(workspaceId), enabled: open && !!workspaceId });
    const [entries, setEntries] = useState<Entry[]>([{ taskId: "", description: "" }]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) setEntries([{ taskId: "", description: "" }]);
    }, [open]);

    const options = useMemo(
        () => [
            ...(form.data?.suggestedTasks ?? []).map((t: any) => ({
                value: t.id as string,
                label: t.parentTask ? `${t.parentTask.name} / ${t.name}` : t.name,
                description: t.project?.name,
                left: <View style={[styles.dot, { backgroundColor: t.project?.color || "#cccccc" }]} />,
            })),
            { value: "other", label: "Other Work (No explicit task)", description: "Work that isn't tied to a task" },
        ],
        [form.data],
    );

    const update = (index: number, patch: Partial<Entry>) => setEntries((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)));

    const submit = async () => {
        for (const entry of entries) {
            if (!entry.taskId) return toast.error("Please select a task (or 'Other Work') for all entries.");
            if (!entry.description || entry.description.trim().length < 15) return toast.error("Descriptions must be at least 15 characters long.");
        }
        setSubmitting(true);
        try {
            await reportsApi.submit(workspaceId, { entries, date: todayIST() });
            toast.success("Daily report submitted successfully!");
            onSubmitted?.();
            onClose();
        } catch (e) {
            toast.fromError(e, "Failed to submit report");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Daily Work Report"
            description="Log the tasks you worked on today. Submitting is required to avoid being marked absent."
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} disabled={submitting} onPress={onClose} />
                    <Button title={submitting ? "Submitting..." : "Submit Report"} style={{ flex: 1 }} loading={submitting} disabled={entries.length === 0} onPress={submit} />
                </>
            }
        >
            <View style={{ gap: 14 }}>
                {entries.map((entry, index) => (
                    <View key={index} style={[styles.entry, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        {entries.length > 1 ? (
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text variant="overline" tone="muted" style={{ flex: 1 }}>
                                    Entry {index + 1}
                                </Text>
                                <Pressable hitSlop={10} onPress={() => setEntries((list) => list.filter((_, i) => i !== index))}>
                                    <X size={16} color={colors.mutedForeground} />
                                </Pressable>
                            </View>
                        ) : null}
                        <Select
                            label="Task / Work Type"
                            required
                            searchable
                            title="Select a task"
                            placeholder={form.isLoading ? "Loading tasks…" : "Select a task or 'Other Work'..."}
                            options={options}
                            value={entry.taskId || null}
                            onChange={(taskId) => update(index, { taskId: taskId ?? "" })}
                        />
                        <Input
                            label="Description"
                            required
                            multiline
                            placeholder="What did you achieve today? (min 15 chars)"
                            value={entry.description}
                            onChangeText={(description) => update(index, { description })}
                            hint={entry.description.trim().length > 0 && entry.description.trim().length < 15 ? `${15 - entry.description.trim().length} more characters` : undefined}
                        />
                    </View>
                ))}
                <Button title="Add another entry" icon={Plus} variant="ghost" size="sm" onPress={() => setEntries((list) => [...list, { taskId: "", description: "" }])} />
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    entry: { gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
    dot: { width: 8, height: 8, borderRadius: 4 },
});
