import { GanttSubtask, GanttTask } from "@/components/task/gantt/types";

/**
 * Transform flat tasks list into Gantt structure
 * Handles Project -> Task -> Subtask hierarchy and date normalization
 */
export function transformToGanttTasks(inputTasks: any[]): GanttTask[] {
  // 🚿 Flatten nested tasks if they arrive in Prisma-nested format
  const taskMap = new Map<string, any>();
  const flatten = (items: any[]) => {
    items.forEach(item => {
      if (!taskMap.has(item.id)) {
        taskMap.set(item.id, item);
      }
      if (item.subTasks && Array.isArray(item.subTasks)) {
        flatten(item.subTasks);
      }
    });
  };
  flatten(inputTasks);
  const allTasks = Array.from(taskMap.values());

  // console.log("🟦 [GANTT TRANSFORM] Flattened tasks count:", allTasks.length);
  const allIds = new Set(allTasks.map((t) => t.id));

  // 1. Separate parent tasks and subtasks
  // A task is a "parent" if it has no parentTaskId OR if its parentTaskId is not in the current set
  const parentTasks = allTasks.filter(
    (task) => !task.parentTaskId || !allIds.has(task.parentTaskId),
  );
  // console.log("🟦 [GANTT TRANSFORM] parentTasks (roots) count:", parentTasks.length);
  const subtasksMap = new Map<string, any[]>();

  allTasks.forEach((task) => {
    if (task.parentTaskId && allIds.has(task.parentTaskId)) {
      if (!subtasksMap.has(task.parentTaskId)) {
        subtasksMap.set(task.parentTaskId, []);
      }
      subtasksMap.get(task.parentTaskId)!.push(task);
    }
  });

  // 2. Helper to format dates consistently (dd MMM yyyy)
  const formatLocalDate = (date: Date | null): string => {
    if (!date) return "";
    const day = date.getDate();
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // 3. Transform data to GanttTask format. Progress is not stored: rows derive
  // it at render time (subtaskProgress / parentProgress in ./utils).
  return parentTasks
    .sort((a, b) => (a.position ?? 1000) - (b.position ?? 1000))
    .map((parentTask) => {
      const taskSubtasks = subtasksMap.get(parentTask.id) || [];

      // Transform subtasks with date fallback logic
      const rawSubtasks: GanttSubtask[] = taskSubtasks
        .sort((a, b) => (a.position ?? 1000) - (b.position ?? 1000))
        .map((subtask) => {
          // Date Strategy: Use startDate + days, or just dueDate, or fallback to today
          let start: Date | null = subtask.startDate
            ? new Date(subtask.startDate)
            : null;
          let end: Date | null = subtask.dueDate
            ? new Date(subtask.dueDate)
            : null;

          // Fallback: If no end but has start + days
          if (!end && start && subtask.days) {
            end = new Date(
              start.getTime() + (subtask.days - 1) * 24 * 60 * 60 * 1000,
            );
          }

          // Fallback: If no start but has end
          if (!start && end) {
            start = new Date(end); // 1-day milestone
          }

          const startStr = formatLocalDate(start);
          const endStr = formatLocalDate(end);

          return {
            id: subtask.id,
            name: subtask.name,
            taskSlug: subtask.taskSlug,
            start: startStr,
            end: endStr,
            status: subtask.status || "TO_DO",
            projectId: subtask.projectId,
            parentTaskId: subtask.parentTaskId,
            description: subtask.description,
            tagId: subtask.tagId,
            tags: subtask.tags || (subtask.tag ? [subtask.tag] : []),
            days: subtask.days,

            assigneeId: subtask.assigneeId,
            assignee: subtask.assignee
              ? {
                id: subtask.assignee.id || subtask.assigneeId,
                surname: subtask.assignee.surname || "Unknown",
              }
              : undefined,
            assigneeRole:
              subtask.projectRole || (subtask.assignee as any)?.projectRole,
            createdById: subtask.createdById,
            position: subtask.position || 0,
            dependsOnIds:
              subtask.Task_TaskDependency_A?.map((d: any) => d.id) || [],
            updatedAt: formatLocalDate(
              subtask.updatedAt ? new Date(subtask.updatedAt) : null,
            ),
          };
        });

      return {
        id: parentTask.id,
        name: parentTask.name,
        taskSlug: parentTask.taskSlug,
        projectId: parentTask.projectId || parentTask.project?.id,
        projectName: parentTask.projectName || parentTask.project?.name,
        projectColor: parentTask.projectColor || parentTask.project?.color,
        start: parentTask.startDate
          ? formatLocalDate(new Date(parentTask.startDate))
          : undefined,
        end: parentTask.dueDate
          ? formatLocalDate(new Date(parentTask.dueDate))
          : undefined,
        subtasks: (parentTask.subTasks === undefined && (parentTask.subtaskCount > 0 || parentTask._count?.subTasks > 0))
          ? undefined
          : rawSubtasks,
        assigneeId: parentTask.assigneeId,
        status: parentTask.status || "TO_DO",
        createdById: parentTask.createdById,
        parentTaskId: parentTask.parentTaskId || null,
        subtaskStatusCounts: parentTask.subtaskStatusCounts,
        assignee: parentTask.assignee
          ? {
            id: parentTask.assignee.id,
            surname:
              parentTask.assignee.surname ||
              "Unknown",
          }
          : undefined,
        updatedAt: formatLocalDate(
          parentTask.updatedAt ? new Date(parentTask.updatedAt) : null,
        ),
        subtaskCount: parentTask.subtaskCount ?? parentTask._count?.subTasks ?? 0,
      };
    });
}

/**
 * Transforms raw tasks into a flat list of GanttSubtask objects
 * This is useful for lazy-loading children of a specific parent
 */
export function transformToGanttSubtasks(tasks: any[]): GanttSubtask[] {
  // Helper to format dates consistently (dd MMM yyyy)
  const formatLocalDate = (date: Date | null): string => {
    if (!date) return "";
    const day = date.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  return tasks
    .sort((a, b) => (a.position ?? 1000) - (b.position ?? 1000))
    .map((subtask) => {
      let start: Date | null = subtask.startDate ? new Date(subtask.startDate) : null;
      let end: Date | null = subtask.dueDate ? new Date(subtask.dueDate) : null;

      if (!end && start && subtask.days) {
        end = new Date(start.getTime() + (subtask.days - 1) * 24 * 60 * 60 * 1000);
      }
      if (!start && end) {
        start = new Date(end);
      }

      const startStr = formatLocalDate(start);
      const endStr = formatLocalDate(end);

      return {
        id: subtask.id,
        name: subtask.name,
        taskSlug: subtask.taskSlug,
        start: startStr,
        end: endStr,
        status: subtask.status || "TO_DO",
        projectId: subtask.projectId,
        parentTaskId: subtask.parentTaskId,
        description: subtask.description,
        tagId: subtask.tagId,
        tags: subtask.tags || (subtask.tag ? [subtask.tag] : []),
        days: subtask.days,
        assigneeId: subtask.assigneeId,
        assignee: subtask.assignee
          ? {
            id: subtask.assignee.id || subtask.assigneeId,
            surname: subtask.assignee.surname || "Unknown",
          }
          : undefined,
        assigneeRole:
          subtask.projectRole || (subtask.assignee as any)?.projectRole,
        createdById: subtask.createdById,
        position: subtask.position || 0,
        dependsOnIds: subtask.Task_TaskDependency_A?.map((d: any) => d.id) || [],
        updatedAt: formatLocalDate(
          subtask.updatedAt ? new Date(subtask.updatedAt) : null,
        ),
      };
    });
}
