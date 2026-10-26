import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, CircleDot, FolderKanban, SlidersHorizontal, Tag, User } from "lucide-react-native";
import { workspacesApi } from "../../api/workspaces";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { TASK_STATUSES, statusColor, statusLabel } from "../../lib/constants";
import { displayName, fmtShortDate } from "../../lib/format";
import { Button, Chip, DateField, MultiSelect, SearchBar, Select, Sheet, Text } from "../ui";

export type TaskFilterState = {
    search: string;
    status: string[];
    assigneeId: string[];
    tagId: string[];
    projectId?: string;
    dueAfter?: string;
    dueBefore?: string;
};

export const emptyFilters: TaskFilterState = { search: "", status: [], assigneeId: [], tagId: [] };

export const activeFilterCount = (f: TaskFilterState) =>
    f.status.length + f.assigneeId.length + f.tagId.length + (f.projectId ? 1 : 0) + (f.dueAfter || f.dueBefore ? 1 : 0);

/** Debounces the search box so typing doesn't refetch on every keystroke. */
export function useDebounced<T>(value: T, delay = 350) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

/**
 * GlobalFilterToolbar: search, then status / assignee / tag / project /
 * due-date filters as chips, each opening its picker.
 */
export function TaskFilters({
    value,
    onChange,
    showProject,
    showStatus = true,
    placeholder = "Search tasks…",
    projectMembers,
}: {
    value: TaskFilterState;
    onChange: (next: TaskFilterState) => void;
    showProject?: boolean;
    showStatus?: boolean;
    placeholder?: string;
    projectMembers?: { id: string; name: string }[];
}) {
    const { workspaceId, layout } = useWorkspace();
    const [dateOpen, setDateOpen] = useState(false);
    const members = useQuery({ queryKey: qk.membersSlim(workspaceId), queryFn: () => workspacesApi.membersSlim(workspaceId), enabled: !!workspaceId && !projectMembers });

    const memberOptions = useMemo(
        () =>
            projectMembers?.map((m) => ({ value: m.id, label: m.name })) ??
            (members.data ?? []).map((m: any) => ({ value: m.userId, label: displayName(m.user ?? m) })),
        [members.data, projectMembers],
    );
    const tagOptions = (layout?.tags ?? []).map((t) => ({ value: t.id, label: t.name }));
    const projectOptions = (layout?.projects ?? []).map((p) => ({ value: p.id, label: p.name }));
    const set = (patch: Partial<TaskFilterState>) => onChange({ ...value, ...patch });
    const count = activeFilterCount(value);
    const dateLabel = value.dueAfter || value.dueBefore ? `${fmtShortDate(value.dueAfter, "…")} – ${fmtShortDate(value.dueBefore, "…")}` : "Due date";

    return (
        <View style={{ gap: 10 }}>
            <SearchBar value={value.search} onChangeText={(search) => set({ search })} placeholder={placeholder} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {count > 0 ? <Chip label={`Clear (${count})`} icon={SlidersHorizontal} onPress={() => onChange({ ...emptyFilters, search: value.search })} /> : null}
                {showStatus ? (
                    <MultiSelect
                        title="Status"
                        values={value.status}
                        onChange={(status) => set({ status })}
                        options={TASK_STATUSES.map((s) => ({ value: s, label: statusLabel(s), left: <CircleDot size={14} color={statusColor(s)} /> }))}
                        trigger={(open) => <Chip label={value.status.length ? `Status · ${value.status.length}` : "Status"} icon={CircleDot} active={value.status.length > 0} onPress={open} />}
                    />
                ) : null}
                <MultiSelect
                    title="Assignee"
                    values={value.assigneeId}
                    onChange={(assigneeId) => set({ assigneeId })}
                    options={memberOptions}
                    searchable
                    trigger={(open) => <Chip label={value.assigneeId.length ? `Assignee · ${value.assigneeId.length}` : "Assignee"} icon={User} active={value.assigneeId.length > 0} onPress={open} />}
                />
                <MultiSelect
                    title="Tags"
                    values={value.tagId}
                    onChange={(tagId) => set({ tagId })}
                    options={tagOptions}
                    trigger={(open) => <Chip label={value.tagId.length ? `Tag · ${value.tagId.length}` : "Tag"} icon={Tag} active={value.tagId.length > 0} onPress={open} />}
                />
                {showProject ? (
                    <Select
                        title="Project"
                        value={value.projectId ?? null}
                        onChange={(projectId) => set({ projectId: projectId ?? undefined })}
                        options={projectOptions}
                        allowClear
                        trigger={(open, label) => <Chip label={label ?? "Project"} icon={FolderKanban} active={!!value.projectId} onPress={open} />}
                    />
                ) : null}
                <Chip label={dateLabel} icon={CalendarRange} active={!!(value.dueAfter || value.dueBefore)} onPress={() => setDateOpen(true)} />
            </ScrollView>

            <Sheet
                open={dateOpen}
                onClose={() => setDateOpen(false)}
                title="Due date range"
                footer={
                    <>
                        <Button title="Clear" variant="outline" style={{ flex: 1 }} onPress={() => { set({ dueAfter: undefined, dueBefore: undefined }); setDateOpen(false); }} />
                        <Button title="Done" style={{ flex: 1 }} onPress={() => setDateOpen(false)} />
                    </>
                }
            >
                <Text variant="small" tone="muted">
                    Show tasks due between these dates.
                </Text>
                <DateField label="From" value={value.dueAfter ? new Date(value.dueAfter) : null} clearable onChange={(d) => set({ dueAfter: d ? startOfDay(d).toISOString() : undefined })} />
                <DateField label="To" value={value.dueBefore ? new Date(value.dueBefore) : null} clearable onChange={(d) => set({ dueBefore: d ? startOfDay(d).toISOString() : undefined })} />
            </Sheet>
        </View>
    );
}

function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
