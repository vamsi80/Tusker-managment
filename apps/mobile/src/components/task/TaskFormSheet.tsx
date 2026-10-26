import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays } from "date-fns";
import { projectsApi } from "../../api/projects";
import { tasksApi, type Task } from "../../api/tasks";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { TASK_STATUSES, statusLabel, roleLabel } from "../../lib/constants";
import { displayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { Button, DateField, Input, MultiSelect, Select, Sheet } from "../ui";

type Mode =
    | { kind: "task"; projectId?: string }
    | { kind: "subtask"; projectId?: string; parentTaskId?: string }
    | { kind: "editSubtask"; task: Task }
    | { kind: "editTask"; task: Task };

/**
 * An exact instant ("…Z"). The web form submits a zone-less "yyyy-MM-ddTHH:mm",
 * which the UTC server reads as UTC, so every save of an IST date moved it 5h30
 * later; parseIST keeps a Z-suffixed string as the instant it names.
 */
const toLocal = (d: Date | null) => (d ? d.toISOString() : undefined);

/**
 * create-task-form / create-subTask-form / edit-subtask-form / edit-task-form.
 * Start date + days keeps the due date in sync and vice versa (syncDays).
 */
export function TaskFormSheet({ open, onClose, mode, onSaved }: { open: boolean; onClose: () => void; mode: Mode; onSaved?: (task?: Task) => void }) {
    const qc = useQueryClient();
    const { workspaceId, layout } = useWorkspace();
    const editing = mode.kind === "editSubtask" || mode.kind === "editTask" ? mode.task : null;
    const isSubtask = mode.kind === "subtask" || mode.kind === "editSubtask";

    const [name, setName] = useState("");
    const [projectId, setProjectId] = useState<string | null>(null);
    const [parentTaskId, setParentTaskId] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [dueDate, setDueDate] = useState<Date | null>(null);
    const [days, setDays] = useState("1");
    const [status, setStatus] = useState<string>("TO_DO");
    const [assignee, setAssignee] = useState<string | null>(null);
    const [reviewerId, setReviewerId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const t = editing;
        setName(t?.name ?? "");
        setProjectId(t?.projectId ?? (mode.kind === "task" || mode.kind === "subtask" ? mode.projectId ?? null : null));
        setParentTaskId(t?.parentTaskId ?? (mode.kind === "subtask" ? mode.parentTaskId ?? null : null));
        setDescription(t?.description ?? "");
        setTagIds(t?.tags?.map((x) => x.id) ?? []);
        setStartDate(t?.startDate ? new Date(t.startDate) : null);
        setDueDate(t?.dueDate ? new Date(t.dueDate) : null);
        setDays(String(t?.days ?? 1));
        setStatus(t?.status ?? "TO_DO");
        setAssignee((t?.assignee as any)?.id ?? null);
        // Reviewer options are keyed by user id. Only take a user id here: a project-member id
        // (task.reviewerId, or reviewer.id in list payloads) resolves to nothing on save and
        // would clear the reviewer. The effect below maps reviewerId once members load.
        const reviewer = t?.reviewer as any;
        setReviewerId(reviewer?.workspaceMember?.userId ?? reviewer?.workspaceMember?.user?.id ?? null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const members = useQuery({ queryKey: qk.projectMembers(projectId ?? ""), queryFn: () => projectsApi.members(projectId!), enabled: open && !!projectId });
    useEffect(() => {
        const pmId = (editing as any)?.reviewerId ?? (editing?.reviewer as any)?.id;
        if (!open || reviewerId || !pmId || !members.data) return;
        const match = members.data.find((m: any) => m.projectMemberId === pmId);
        if (match) setReviewerId(match.userId);
    }, [open, members.data]); // eslint-disable-line react-hooks/exhaustive-deps
    const reviewers = useQuery({ queryKey: ["reviewers", projectId], queryFn: () => projectsApi.reviewers(projectId!), enabled: open && !!projectId });
    const parents = useQuery({
        queryKey: qk.tasks(workspaceId, { parentsOf: projectId }),
        queryFn: () => tasksApi.list({ workspaceId, projectId: projectId!, viewMode: "list", limit: 200, includeSubTasks: false, hierarchyMode: "parents" }),
        enabled: open && isSubtask && !!projectId,
    });

    const parentOptions = useMemo(() => (parents.data?.tasks ?? []).filter((t) => t.isParent !== false).map((t) => ({ value: t.id, label: t.name })), [parents.data]);
    useEffect(() => {
        if (open && isSubtask && !parentTaskId && parentOptions.length) setParentTaskId(parentOptions[0].value);
    }, [open, isSubtask, parentOptions, parentTaskId]);

    const changeStart = (d: Date | null) => {
        setStartDate(d);
        if (d) setDueDate(addDays(d, Math.max(1, Number(days) || 1)));
    };
    const changeDays = (v: string) => {
        setDays(v.replace(/\D/g, ""));
        const n = Number(v);
        if (startDate && n > 0) setDueDate(addDays(startDate, n));
    };
    const changeDue = (d: Date | null) => {
        setDueDate(d);
        if (d && startDate) setDays(String(Math.max(1, differenceInCalendarDays(d, startDate))));
    };

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        if (editing) qc.invalidateQueries({ queryKey: qk.task(editing.id) });
        qc.invalidateQueries({ queryKey: ["project-dashboard", workspaceId] });
    };

    const save = useMutation({
        mutationFn: async (): Promise<Task | undefined> => {
            if (!name.trim()) throw new Error("Title must be at least 1 character long");
            if (!projectId) throw new Error("Select a project");
            if (mode.kind === "task") return tasksApi.create({ name: name.trim(), projectId, tagIds: tagIds.length ? tagIds : undefined, reviewerId: reviewerId ?? undefined });
            if (mode.kind === "editTask")
                return tasksApi.update(editing!.id, { workspaceId, projectId }, { name: name.trim(), description: description.trim() || undefined, reviewerId: reviewerId ?? undefined, tagIds });
            if (!parentTaskId) throw new Error("Select a parent task");
            if (!assignee) throw new Error("Assignee is required");
            if (!reviewerId) throw new Error("Reviewer is required");
            if (startDate && dueDate && dueDate < startDate) throw new Error("Due date must be after start date");
            const payload = {
                name: name.trim(),
                description: description.trim() || undefined,
                status,
                assignee,
                reviewerId,
                startDate: toLocal(startDate),
                dueDate: toLocal(dueDate),
                days: Math.max(1, Number(days) || 1),
                tagIds: tagIds.length ? tagIds : undefined,
                projectId,
                parentTaskId,
            };
            if (mode.kind === "subtask") return tasksApi.createSubtask(payload);
            return tasksApi.update(editing!.id, { workspaceId, projectId }, payload);
        },
        onSuccess: (task) => {
            toast.success(editing ? "Task updated" : isSubtask ? "Subtask created successfully" : "Task created successfully");
            invalidate();
            onSaved?.(task);
            onClose();
        },
        onError: (e) => toast.fromError(e),
    });

    const title = { task: "New Task", subtask: "New Subtask", editSubtask: "Edit Subtask", editTask: "Edit Task" }[mode.kind];
    const memberOptions = (members.data ?? []).map((m: any) => ({
        value: m.userId ?? m.id,
        label: displayName(m.user ?? m),
        description: roleLabel(m.projectRole),
    }));
    const reviewerOptions = (reviewers.data ?? []).map((r: any) => ({ value: r.id, label: r.surname || "Member", description: roleLabel(r.role) }));

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                    <Button title={editing ? "Save changes" : "Create"} style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                </>
            }
        >
            <Input label={isSubtask ? "SubTask Name" : "Task Title"} required placeholder={isSubtask ? "Enter subtask name" : "Enter task title"} value={name} onChangeText={setName} maxLength={100} />
            {!editing ? (
                <Select
                    label="Project"
                    required
                    value={projectId}
                    onChange={(v) => {
                        setProjectId(v);
                        setParentTaskId(null);
                    }}
                    options={(layout?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select a project"
                />
            ) : null}
            {isSubtask ? (
                <Select label="Parent Task" required value={parentTaskId} onChange={setParentTaskId} options={parentOptions} placeholder={projectId ? "Select a parent task" : "Select a project first"} disabled={!projectId} />
            ) : null}
            {mode.kind !== "task" ? <Input label="Description" multiline placeholder={isSubtask ? "SubTask description" : "Task description"} value={description} onChangeText={setDescription} /> : null}
            <MultiSelect label="Tags" placeholder="Select tags…" values={tagIds} onChange={setTagIds} options={(layout?.tags ?? []).map((t) => ({ value: t.id, label: t.name }))} />
            {isSubtask ? (
                <>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={{ flex: 1.4 }}>
                            <DateField label="Start Date" value={startDate} onChange={changeStart} clearable />
                        </View>
                        <Input label="Days" containerStyle={{ flex: 0.8 }} keyboardType="number-pad" value={days} onChangeText={changeDays} />
                    </View>
                    <DateField label="Due Date" value={dueDate} onChange={changeDue} minimumDate={startDate ?? undefined} clearable />
                    <Select label="Status" value={status} onChange={(v) => v && setStatus(v)} options={TASK_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
                    <Select label="Assignee" required value={assignee} onChange={setAssignee} options={memberOptions} searchable placeholder={projectId ? "Select assignee" : "Select a project first"} disabled={!projectId} />
                </>
            ) : null}
            {mode.kind !== "task" || reviewerOptions.length ? (
                <Select label="Reviewer" required={isSubtask} value={reviewerId} onChange={setReviewerId} options={reviewerOptions} searchable allowClear={!isSubtask} placeholder={projectId ? "Select reviewer" : "Select a project first"} disabled={!projectId} />
            ) : null}
        </Sheet>
    );
}
