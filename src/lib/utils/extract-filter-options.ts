/**
 * Utility functions to extract filter options from task data
 * Used by GlobalFilterToolbar to show only relevant filter options
 */

import type { TaskStatus, TaskTag } from "@/components/task/shared/types";

/**
 * Extract unique projects from tasks
 * @param tasks - Array of tasks with project information
 * @returns Array of unique projects with id and name
 */
export function extractProjectOptions<T extends { projectId?: string; project?: { id: string; name: string } }>(
    tasks: T[]
): Array<{ id: string; name: string }> {
    const projectsMap = new Map<string, { id: string; name: string }>();

    tasks.forEach(task => {
        if (task.project) {
            projectsMap.set(task.project.id, {
                id: task.project.id,
                name: task.project.name,
            });
        }
    });

    return Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract unique statuses from tasks
 * @param tasks - Array of tasks with status
 * @returns Array of unique statuses
 */
export function extractStatusOptions<T extends { status?: TaskStatus | string }>(
    tasks: T[]
): TaskStatus[] {
    const statusesSet = new Set<TaskStatus>();

    tasks.forEach(task => {
        if (task.status) {
            statusesSet.add(task.status as TaskStatus);
        }
    });

    // Return in a logical order
    const statusOrder: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "COMPLETED"];
    return statusOrder.filter(status => statusesSet.has(status));
}

export function extractAssigneeOptions<T extends {
    assignee?: {
        id: string;
        name?: string;
        surname?: string | null;
        workspaceMember?: {
            id?: string;
            user?: {
                id: string;
                name: string;
                surname?: string | null;
            }
        };
        workspaceMemberId?: string;
    } | null;
}>(
    tasks: T[]
): Array<{ id: string; name: string; surname?: string }> {
    const assigneesMap = new Map<string, { id: string; name: string; surname?: string }>();

    tasks.forEach((task) => {
        const assignee = task.assignee;
        if (!assignee) return;

        // Check for new flattened structure first
        if (assignee.name) {
            assigneesMap.set(assignee.id, {
                id: assignee.id,
                name: assignee.name,
                surname: assignee.surname || undefined,
            });
            return;
        }

        const workspaceMember = assignee.workspaceMember;
        const user = workspaceMember?.user;

        // Try to get the workspace member ID from various possible sources
        const workspaceMemberId = assignee.workspaceMemberId || workspaceMember?.id;

        if (user && workspaceMemberId) {
            assigneesMap.set(workspaceMemberId, {
                id: workspaceMemberId,
                name: user.name,
                surname: user.surname || undefined,
            });
        }
    });

    const result = Array.from(assigneesMap.values()).sort((a, b) => {
        const nameA = `${a.name} ${a.surname || ''}`.trim();
        const nameB = `${b.name} ${b.surname || ''}`.trim();
        return nameA.localeCompare(nameB);
    });

    return result;
}

/**
 * Extract unique tags from tasks
 * @param tasks - Array of tasks with tags
 * @returns Array of unique tags
 */
export function extractTagOptions<T extends { tag?: TaskTag | string | null }>(
    tasks: T[]
): TaskTag[] {
    const tagsSet = new Set<TaskTag>();

    tasks.forEach(task => {
        if (task.tag) {
            tagsSet.add(task.tag as TaskTag);
        }
    });

    // Return in alphabetical order
    return Array.from(tagsSet).sort();
}

export function extractAllFilterOptions<T extends {
    projectId?: string;
    project?: { id: string; name: string };
    status?: TaskStatus | string;
    tag?: TaskTag | string | null;
    subTasks?: any[];
    assignee?: {
        id?: string;
        name?: string;
        surname?: string | null;
        workspaceMember?: {
            id?: string;
            user?: {
                id: string;
                name: string;
                surname?: string | null;
            }
        };
        workspaceMemberId?: string;
    };
}>(
    tasks: T[],
    level: 'project' | 'workspace'
) {
    // Flatten tasks to include both parent tasks and subtasks for assignee extraction
    const allTasksForAssignees: any[] = [];

    tasks.forEach(task => {
        // Add parent task if it has assignee
        if (task.assignee) {
            allTasksForAssignees.push(task);
        }

        // Add all subtasks
        if (task.subTasks && Array.isArray(task.subTasks)) {
            allTasksForAssignees.push(...task.subTasks);
        }
    });

    return {
        projects: level === 'workspace' ? extractProjectOptions(tasks) : [],
        statuses: extractStatusOptions(tasks),
        assignees: extractAssigneeOptions(allTasksForAssignees),
        tags: extractTagOptions(tasks),
    };
}
