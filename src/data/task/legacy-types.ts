export type WorkspaceTaskType = {
    id: string;
    name: string;
    status: string;
    taskSlug: string;
    description: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    days: number | null;
    projectId: string;
    isPinned: boolean;
    pinnedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    position: number;
    createdById: string;
    reviewerId: string | null;
    assignee: {
        id: string;
        name: string | null;
        surname: string | null;
        image: string | null;
    } | null;
    reviewer: {
        id: string;
        name: string | null;
        surname: string | null;
        image: string | null;
    } | null;
    createdBy: {
        id: string;
        name: string | null;
        surname: string | null;
        image: string | null;
    };
    _count: {
        subTasks: number;
        reviewComments: number;
    };
    parentTask: {
        id: string;
        name: string;
        taskSlug: string;
    } | null;
    project: {
        id: string;
        name: string;
        slug: string;
        color: string;
        workspaceId: string;
        projectMembers: {
            workspaceMember: {
                user: {
                    name: string | null;
                    surname: string | null;
                    image: string | null;
                };
            };
        }[];
    };
    tag: {
        id: string;
        name: string;
    } | null;
};
