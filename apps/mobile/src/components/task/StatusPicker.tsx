import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Lock } from "lucide-react-native";
import { tasksApi, type Task } from "../../api/tasks";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useProjectAccess } from "../../hooks/useProjectAccess";
import { TASK_STATUSES, statusColor, statusLabel, type TaskStatus } from "../../lib/constants";
import { canChangeStatus, isMandatoryTransition, missingTransitionEvidence, transitionCheck } from "../../lib/taskRules";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Banner, Button, Input, Sheet, StatusBadge, Text, tint } from "../ui";
import { AttachmentPicker, useAttachmentUploads } from "./AttachmentPicker";

/**
 * SubtaskStatusChanger + ActivityDialog: the status pill opens the six
 * statuses, disallowed ones greyed with the reason; transitions that need
 * evidence ask for a comment (and an attachment if the project requires one).
 * The pill updates optimistically and rolls back if the API refuses.
 */
export function StatusPicker({ task, size = "sm", onChanged }: { task: Task; size?: "xs" | "sm"; onChanged?: (status: TaskStatus) => void }) {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const { access } = useProjectAccess(task.projectId);
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<TaskStatus | null>(null);
    const [optimistic, setOptimistic] = useState<TaskStatus | null>(null);
    const [comment, setComment] = useState("");
    const [link, setLink] = useState("");
    const uploads = useAttachmentUploads({ workspaceId, projectId: task.projectId, taskId: task.id });

    const display = (optimistic ?? task.status) as TaskStatus;
    const subject = { ...task, status: display };
    const editable = canChangeStatus(access, subject);

    const mutation = useMutation({
        mutationFn: ({ status, comment, attachmentData }: { status: TaskStatus; comment?: string; attachmentData?: any }) =>
            tasksApi.setStatus(task.id, { workspaceId, projectId: task.projectId }, status, { comment, attachmentData }),
        onMutate: ({ status }) => setOptimistic(status),
        onSuccess: (_, { status }) => {
            toast.success(`Status updated to ${statusLabel(status)}`);
            onChanged?.(status);
            qc.invalidateQueries({ queryKey: ["tasks", workspaceId] });
            qc.invalidateQueries({ queryKey: ["tasks", "subtasks"] });
            qc.invalidateQueries({ queryKey: ["task", task.id] });
            qc.invalidateQueries({ queryKey: ["reviews", workspaceId] });
            qc.invalidateQueries({ queryKey: ["project-dashboard", workspaceId] });
            setPending(null);
            setComment("");
            setLink("");
            uploads.reset();
        },
        onError: (error) => {
            setOptimistic(null);
            toast.fromError(error, "Failed to update status");
        },
        onSettled: () => setTimeout(() => setOptimistic(null), 400),
    });

    const choose = (target: TaskStatus) => {
        if (target === display) return;
        const check = transitionCheck(access, subject, target);
        if (!check.allowed) return toast.error(check.reason ?? "This transition is not allowed");
        setOpen(false);
        if (isMandatoryTransition(display, target)) setTimeout(() => setPending(target), 250);
        else mutation.mutate({ status: target });
    };

    const submitEvidence = () => {
        if (!pending) return;
        const hasAttachment = !!link.trim() || uploads.files.length > 0;
        const missing = missingTransitionEvidence(access.projectSettings, { comment: !!comment.trim(), attachment: hasAttachment });
        if (!comment.trim()) return toast.error("A reason (comment) is required for this move.");
        if (missing) return toast.error(missing);
        if (link.trim() && !/^https?:\/\//i.test(link.trim())) return toast.error("Invalid URL");
        const attachmentData = hasAttachment ? { url: link.trim() || undefined, files: uploads.files.length ? uploads.files : undefined } : undefined;
        mutation.mutate({ status: pending, comment: comment.trim(), attachmentData });
    };

    const color = statusColor(display);

    if (!task.status) return <Text tone="muted">-</Text>;

    return (
        <>
            <Pressable
                disabled={!editable || mutation.isPending}
                onPress={() => setOpen(true)}
                hitSlop={6}
                style={({ pressed }) => [
                    styles.pill,
                    {
                        backgroundColor: tint(color, 0.12),
                        borderColor: tint(color, 0.3),
                        paddingVertical: size === "xs" ? 2 : 4,
                        opacity: pressed ? 0.7 : 1,
                    },
                ]}
            >
                {mutation.isPending ? <ActivityIndicator size={10} color={color} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />}
                <Text style={{ color, fontFamily: fonts.semibold, fontSize: size === "xs" ? 10.5 : 12 }}>{statusLabel(display)}</Text>
                {editable ? <ChevronDown size={11} color={color} /> : null}
            </Pressable>

            <Sheet open={open} onClose={() => setOpen(false)} title="Change status" description={task.name}>
                {TASK_STATUSES.map((status) => {
                    const check = transitionCheck(access, subject, status);
                    const current = status === display;
                    return (
                        <Pressable
                            key={status}
                            disabled={current}
                            onPress={() => choose(status)}
                            style={({ pressed }) => [styles.option, { backgroundColor: current ? colors.accent : pressed ? colors.secondary : "transparent", opacity: check.allowed || current ? 1 : 0.45 }]}
                        >
                            <StatusBadge status={status} />
                            <View style={{ flex: 1 }}>
                                {!check.allowed && !current ? (
                                    <Text variant="caption" tone="muted" numberOfLines={2}>
                                        {check.reason}
                                    </Text>
                                ) : null}
                            </View>
                            {current ? <Check size={17} color={colors.foreground} /> : !check.allowed ? <Lock size={14} color={colors.mutedForeground} /> : null}
                        </Pressable>
                    );
                })}
            </Sheet>

            <Sheet
                open={!!pending}
                onClose={() => !mutation.isPending && setPending(null)}
                title={pending ? `Move to ${statusLabel(pending)}` : ""}
                description={`Explain this change on "${task.name}".`}
                footer={
                    <>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setPending(null)} disabled={mutation.isPending} />
                        <Button title="Submit" style={{ flex: 1 }} loading={mutation.isPending} disabled={uploads.isUploading || !comment.trim()} onPress={submitEvidence} />
                    </>
                }
            >
                {access.projectSettings.mandatoryAttachment ? <Banner tone="info">This project requires an attachment for this transition.</Banner> : null}
                <Input label="Comment" required multiline placeholder="Add your activity note here…" value={comment} onChangeText={setComment} />
                <Input label="Attachment link (optional)" placeholder="https://example.com/document" autoCapitalize="none" keyboardType="url" value={link} onChangeText={setLink} />
                <AttachmentPicker uploads={uploads} />
            </Sheet>
        </>
    );
}

const styles = StyleSheet.create({
    pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, borderRadius: radius.xs + 2, borderWidth: 1, alignSelf: "flex-start" },
    option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 12, borderRadius: radius.md },
});
