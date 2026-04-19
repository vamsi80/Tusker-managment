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

  // 3. Helper for Progress Calculation
  const calculateProgress = (status: string, startStr: string, endStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (status === "COMPLETED") return 100;
    if (status === "REVIEW") return 80;
    if (status === "TO_DO" || status === "HOLD" || status === "CANCELLED") return 0;

    if (status === "IN_PROGRESS") {
      const startDate = parseDisplayDate(startStr);
      const endDate = parseDisplayDate(endStr);

      if (!startDate || !endDate) return 10; // Default base for in-progress if no dates

      const total = endDate.getTime() - startDate.getTime();
      if (total <= 0) return 60; // Milestone/Overdue in progress

      const elapsed = today.getTime() - startDate.getTime();
      const rawProgress = Math.max(0, (elapsed / total) * 60);
      return Math.min(60, Math.round(rawProgress));
    }

    return 0;
  };

  const parseDisplayDate = (dateStr: string | null): Date | null => {
    if (!dateStr) return null;
    try {
      const parts = dateStr.split(" ");
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0]);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames.indexOf(parts[1]);
      const year = parseInt(parts[2]);
      if (month === -1) return null;
      return new Date(year, month, day);
    } catch {
      return null;
    }
  };

  // 4. Transform data to GanttTask format
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
          const progress = calculateProgress(subtask.status || "TO_DO", startStr, endStr);

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
            days: subtask.days,
            progress,

            assigneeId: subtask.assigneeId,
            assignee: subtask.assignee
              ? {
                  id: subtask.assignee.workspaceMember?.user?.id || subtask.assigneeId,
                  name:
                    subtask.assignee.workspaceMember?.user?.surname ||
                    subtask.assignee.workspaceMember?.user?.name ||
                    "Unknown",
                  image: subtask.assignee.workspaceMember?.user?.image,
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

      // Calculate Parent Progress (weighted average by duration)
      let parentProgress = 0;
      if (rawSubtasks.length > 0) {
        let totalWeight = 0;
        let weightedSum = 0;
        rawSubtasks.forEach(s => {
          const weight = s.days || 1;
          weightedSum += s.progress * weight;
          totalWeight += weight;
        });
        parentProgress = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      } else {
        // If no subtasks, check parent's own status
        parentProgress = calculateProgress(
          parentTask.status || "TO_DO",
          parentTask.startDate ? formatLocalDate(new Date(parentTask.startDate)) : "",
          parentTask.dueDate ? formatLocalDate(new Date(parentTask.dueDate)) : ""
        );
      }

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
        subtasks: rawSubtasks,
        assigneeId: parentTask.assigneeId,
        status: parentTask.status || "TO_DO",
        createdById: parentTask.createdById,
        parentTaskId: parentTask.parentTaskId || null,
        progress: parentProgress,
          assignee: parentTask.assignee
            ? {
                id: parentTask.assignee.workspaceMember?.user?.id || parentTask.assigneeId,
                name:
                  parentTask.assignee.workspaceMember?.surname ||
                  parentTask.assignee.workspaceMember?.user?.surname ||
                  parentTask.assignee.workspaceMember?.user?.name ||
                  "Unknown",
                image: parentTask.assignee.workspaceMember?.user?.image,
              }
            : undefined,
          updatedAt: formatLocalDate(
            parentTask.updatedAt ? new Date(parentTask.updatedAt) : null,
          ),
          subtaskCount: parentTask.subtaskCount ?? parentTask._count?.subTasks ?? 0,
        };
      });
  }
