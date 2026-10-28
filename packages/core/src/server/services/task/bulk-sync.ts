import { getISTDateOnly, parseIST } from "../../../lib/date-utils";

/**
 * Re-upload of an exported bulk sheet: decides, row by row, what changes
 * against the project's current tasks. Pure, so the service only executes it.
 */

/** Exported sheets carry four tag columns; extra tags are left alone unless the row changes them. */
export const BULK_TAG_COLUMNS = 4;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BulkRow {
  id?: string;
  taskName: string;
  subtaskName?: string;
  description?: string;
  assigneeEmail?: string;
  reviewerEmail?: string;
  startDate?: string;
  days?: number;
  status?: string;
  tags?: string[];
}

export interface ExistingTask {
  id: string;
  name: string;
  parentTaskId: string | null;
  description: string | null;
  status: string | null;
  startDate: Date | null;
  days: number | null;
  createdAt: Date;
  updatedAt: Date;
  assigneeEmail: string | null;
  reviewerEmail: string | null;
  tagNames: string[];
}

export interface BulkPatch {
  name?: string;
  description?: string | null;
  status?: string;
  startDate?: string | null;
  days?: number | null;
  dueDate?: string;
  assigneeEmail?: string | null;
  reviewerEmail?: string | null;
  tagNames?: string[];
}

export interface BulkSyncPlan {
  /** Block the whole upload. */
  invalid: string[];
  /** Rows skipped or tasks kept, reported alongside the result. */
  notes: string[];
  updates: { rowNum: number; id: string; label: string; patch: BulkPatch }[];
  attaches: { rowNum: number; parentTaskId: string; row: BulkRow }[];
  /** Rows for brand-new task groups, handed to the existing create path. */
  newRows: BulkRow[];
  deletes: { id: string; name: string; isParent: boolean }[];
  unchanged: number;
}

const normName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const normEmail = (s: string | null | undefined) => (s ?? "").trim().toLowerCase() || null;
const normStatus = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "_");
const dayKey = (d: Date | null) => (d ? getISTDateOnly(d).getTime() : null);
const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

export function planBulkSync({
  rows,
  existing,
  knownTags,
  exportedAt,
}: {
  rows: BulkRow[];
  existing: ExistingTask[];
  /** Upper-cased workspace tag names; unknown tags in a row are ignored, as on create. */
  knownTags: Set<string>;
  /** Present only for sheets produced by Export; enables deletes and the stale-row guard. */
  exportedAt?: Date;
}): BulkSyncPlan {
  const plan: BulkSyncPlan = { invalid: [], notes: [], updates: [], attaches: [], newRows: [], deletes: [], unchanged: 0 };
  const byId = new Map(existing.map((t) => [t.id, t]));
  const seen = new Set<string>();

  // Name → parent id, for new subtask rows typed under an existing task.
  // File rows win over the DB so a parent renamed in the sheet still catches its new rows.
  const parentIdByName = new Map<string, string>();
  for (const t of existing) {
    if (!t.parentTaskId && !parentIdByName.has(normName(t.name))) parentIdByName.set(normName(t.name), t.id);
  }
  for (const row of rows) {
    const t = row.id ? byId.get(row.id) : undefined;
    if (t) parentIdByName.set(normName(row.taskName), t.parentTaskId ?? t.id);
  }

  const keptParents = new Set<string>();

  rows.forEach((row, i) => {
    const rowNum = i + 2;

    if (!row.id) {
      const parentTaskId = parentIdByName.get(normName(row.taskName));
      if (!parentTaskId) plan.newRows.push(row);
      else if (row.subtaskName?.trim()) {
        plan.attaches.push({ rowNum, parentTaskId, row });
        keptParents.add(parentTaskId);
      }
      // A bare row naming an existing task adds nothing.
      return;
    }

    const t = byId.get(row.id);
    if (!t) {
      plan.invalid.push(`Row ${rowNum}: ID "${row.id}" is not a task in this project. Clear the ID to add it as new.`);
      return;
    }
    if (seen.has(row.id)) {
      plan.invalid.push(`Row ${rowNum}: ID "${row.id}" appears more than once. Clear the ID on copied rows.`);
      return;
    }
    seen.add(row.id);
    if (t.parentTaskId) keptParents.add(t.parentTaskId);

    const isParent = !t.parentTaskId;
    if (isParent && row.subtaskName?.trim()) {
      plan.invalid.push(`Row ${rowNum}: this ID belongs to the task "${t.name}". Clear its Subtask Name.`);
      return;
    }
    const name = normName(isParent ? row.taskName : row.subtaskName);
    if (!name) {
      plan.invalid.push(`Row ${rowNum}: name is empty for "${t.name}".`);
      return;
    }

    const patch: BulkPatch = {};
    if (name !== normName(t.name)) patch.name = name;
    if ((row.description ?? "").trim() !== (t.description ?? "").trim()) patch.description = row.description?.trim() || null;

    const rowTags = (row.tags ?? []).map((n) => n.trim().toUpperCase()).filter((n) => knownTags.has(n));
    const dbTags = t.tagNames.map((n) => n.toUpperCase());
    if (!sameTags(rowTags, dbTags.slice(0, BULK_TAG_COLUMNS))) patch.tagNames = rowTags;

    if (!isParent) {
      if (row.status?.trim() && normStatus(row.status) !== t.status) patch.status = normStatus(row.status);

      const assignee = normEmail(row.assigneeEmail);
      if (assignee !== normEmail(t.assigneeEmail)) patch.assigneeEmail = assignee;
      const reviewer = normEmail(row.reviewerEmail);
      if (reviewer !== normEmail(t.reviewerEmail)) patch.reviewerEmail = reviewer;

      const start = parseIST(row.startDate);
      if (dayKey(start) !== dayKey(t.startDate)) patch.startDate = start ? start.toISOString() : null;
      const days = row.days ?? null;
      if (days !== t.days) patch.days = days;

      // Same rule as create and the edit form: due = start + days.
      // ponytail: clearing start or days leaves the old due date in place; clear it in the app.
      if (patch.startDate !== undefined || patch.days !== undefined) {
        const s = patch.startDate !== undefined ? start : t.startDate;
        const d = patch.days !== undefined ? days : t.days;
        if (s && d !== null) patch.dueDate = new Date(s.getTime() + d * MS_PER_DAY).toISOString();
      }
    }

    if (Object.keys(patch).length === 0) {
      plan.unchanged++;
      return;
    }
    // Someone changed this subtask in the app after the export; writing the old
    // sheet back would silently undo their edit. Parents are exempt: their
    // updatedAt moves with every subtask count change.
    if (exportedAt && !isParent && t.updatedAt > exportedAt) {
      plan.notes.push(`Row ${rowNum}: skipped "${t.name}", it was changed in the app after this file was exported. Export again to edit it.`);
      return;
    }
    plan.updates.push({ rowNum, id: t.id, label: name, patch });
  });

  if (exportedAt && plan.invalid.length === 0) {
    const missing = existing.filter((t) => !seen.has(t.id) && t.createdAt <= exportedAt);
    const deletedParents = new Set<string>();
    for (const t of missing.filter((t) => !t.parentTaskId)) {
      if (keptParents.has(t.id)) {
        plan.notes.push(`Kept task "${t.name}": its row is missing but its subtasks are still in the file.`);
        continue;
      }
      deletedParents.add(t.id);
      plan.deletes.push({ id: t.id, name: t.name, isParent: true });
    }
    // Subtasks of a deleted parent go with it (cascade).
    for (const t of missing.filter((t) => t.parentTaskId && !deletedParents.has(t.parentTaskId))) {
      plan.deletes.push({ id: t.id, name: t.name, isParent: false });
    }
  }

  return plan;
}
