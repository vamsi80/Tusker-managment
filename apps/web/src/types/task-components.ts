import type {
  SubTaskType,
  WorkspaceTaskType,
  KanbanSubTaskType,
  TaskStatus,
} from "@/types/task";
import type { TaskWithSubTasks } from "@/components/task/shared/types";

export interface ProjectOption {
  id: string;
  name: string;
  color?: string | null;
  slug?: string;
  icon?: string;
  canManageMembers?: boolean;
  memberIds?: string[];
}

export interface ProjectMapEntry {
  id: string;
  name: string;
  color?: string | null;
  canManageMembers?: boolean;
  memberIds?: string[];
}

export type TasksChangeUpdater = (prev: TaskWithSubTasks[]) => TaskWithSubTasks[];

export interface TaskHandlerCallbacks {
  onTasksChange?: (update: TasksChangeUpdater) => void;
  onSubTaskUpdated?: (subTaskId: string, data: Partial<SubTaskType>) => void;
  handleSubTaskClick: (subTask: SubTaskType) => void;
  getCachedSubTasks: (taskId: string) => WorkspaceTaskType | undefined;
}

export interface TaskPaginationState {
  isLoading: boolean;
  hasMore: boolean;
  nextCursor?: string | null;
}

export type KanbanTaskMap = Partial<Record<TaskStatus, KanbanSubTaskType[]>>;

export interface KanbanColumnMeta {
  subTaskIds: string[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export type KanbanColumnMetaMap = Partial<Record<TaskStatus, KanbanColumnMeta>>;

export type TaskSyncEventDetail = {
  action: "created" | "updated" | "deleted" | "status_changed";
  record: Partial<WorkspaceTaskType>;
  entityId?: string;
  status?: TaskStatus;
  toStatus?: TaskStatus;
};

export type TaskSyncEvent = CustomEvent<TaskSyncEventDetail>;
