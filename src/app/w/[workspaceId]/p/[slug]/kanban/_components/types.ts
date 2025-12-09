export interface KanbanSubTask {
    id: string;
    name: string;
    description?: string;
    status: 'TO_DO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'COMPLETED' | 'CANCELED';
    assignee?: {
        id: string;
        name: string;
        surname?: string;
        image?: string;
    };
    tag?: 'DESIGN' | 'PROCUREMENT' | 'CONTRACTOR';
    startDate?: string;
    days?: number;
    commentCount?: number;
    parentTaskName?: string;
}

export interface KanbanColumn {
    id: string;
    title: string;
    status: KanbanSubTask['status'];
    color: string;
    bgColor: string;
    tasks: KanbanSubTask[];
}
