# 🎯 Kanban Column Pagination Implementation Plan

## 📋 Current State

**Problem**: Kanban board loads ALL subtasks at once
- Performance issues with many subtasks
- Slow initial load
- Memory intensive

**Goal**: Load only 5 subtasks per column initially, then load more on scroll

---

## ✅ Proposed Solution

### **Step 1: Update Data Layer**

Create a new function to get subtasks by status with pagination:

#### **File**: `src/data/task/kanban/get-subtasks-by-status.ts`

```typescript
"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

async function _getSubTasksByStatusInternal(
    projectId: string,
    status: TaskStatus,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) {
    const skip = (page - 1) * pageSize;

    const whereClause = isMember
        ? {
            parentTask: { projectId },
            parentTaskId: { not: null },
            status,
            assignee: { workspaceMemberId },
        }
        : {
            parentTask: { projectId },
            parentTaskId: { not: null },
            status,
        };

    const [totalCount, subTasks] = await prisma.$transaction([
        prisma.task.count({ where: whereClause }),
        prisma.task.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                taskSlug: true,
                description: true,
                status: true,
                position: true,
                startDate: true,
                days: true,
                tag: true,
                parentTaskId: true,
                isPinned: true,
                pinnedAt: true,
                parentTask: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                    },
                },
                assignee: {
                    select: {
                        id: true,
                        workspaceMember: {
                            select: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                },
                dependsOn: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                    },
                },
                _count: {
                    select: {
                        reviewComments: true,
                    },
                },
            },
            orderBy: [
                { isPinned: 'desc' }, // Pinned first
                { position: 'asc' },
            ],
            skip,
            take: pageSize,
        }),
    ]);

    return {
        subTasks,
        totalCount,
        hasMore: skip + subTasks.length < totalCount,
        currentPage: page,
    };
}

const getCachedSubTasksByStatus = (
    projectId: string,
    status: TaskStatus,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () => _getSubTasksByStatusInternal(projectId, status, workspaceMemberId, isMember, page, pageSize),
        [`kanban-${projectId}-${status}-${workspaceMemberId}-p${page}-s${pageSize}`],
        {
            tags: [`project-tasks-${projectId}`, `kanban-${status}`],
            revalidate: 60,
        }
    )();

export const getSubTasksByStatus = cache(
    async (projectId: string, workspaceId: string, status: TaskStatus, page: number = 1, pageSize: number = 5) => {
        const user = await requireUser();

        try {
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("No access to project");
            }

            return await getCachedSubTasksByStatus(
                projectId,
                status,
                permissions.workspaceMemberId,
                permissions.isMember,
                page,
                pageSize
            );
        } catch (error) {
            console.error("Error fetching subtasks by status:", error);
            return {
                subTasks: [],
                totalCount: 0,
                hasMore: false,
                currentPage: 1,
            };
        }
    }
);

export type SubTasksByStatusResponse = Awaited<ReturnType<typeof getSubTasksByStatus>>;
export type KanbanSubTaskType = SubTasksByStatusResponse['subTasks'][number];
```

---

### **Step 2: Update Kanban Board State**

#### **File**: `kanban-board.tsx`

```typescript
export function KanbanBoard({ initialSubTasks, projectMembers, workspaceId, projectId }: KanbanBoardProps) {
    // State for each column's pagination
    const [columnData, setColumnData] = useState<Record<TaskStatus, {
        subTasks: SubTaskType[];
        page: number;
        hasMore: boolean;
        loading: boolean;
    }>>({
        TO_DO: { subTasks: [], page: 1, hasMore: true, loading: false },
        IN_PROGRESS: { subTasks: [], page: 1, hasMore: true, loading: false },
        BLOCKED: { subTasks: [], page: 1, hasMore: true, loading: false },
        REVIEW: { subTasks: [], page: 1, hasMore: true, loading: false },
        HOLD: { subTasks: [], page: 1, hasMore: true, loading: false },
        COMPLETED: { subTasks: [], page: 1, hasMore: true, loading: false },
    });

    // Initialize with initial data (first 5 per column)
    useEffect(() => {
        const grouped = initialSubTasks.reduce((acc, task) => {
            if (!acc[task.status]) acc[task.status] = [];
            acc[task.status].push(task);
            return acc;
        }, {} as Record<TaskStatus, SubTaskType[]>);

        setColumnData(prev => {
            const newData = { ...prev };
            COLUMNS.forEach(col => {
                newData[col.id] = {
                    subTasks: grouped[col.id] || [],
                    page: 1,
                    hasMore: (grouped[col.id]?.length || 0) >= 5,
                    loading: false,
                };
            });
            return newData;
        });
    }, [initialSubTasks]);

    // Load more for a specific column
    const loadMoreForColumn = async (status: TaskStatus) => {
        const column = columnData[status];
        if (column.loading || !column.hasMore) return;

        setColumnData(prev => ({
            ...prev,
            [status]: { ...prev[status], loading: true },
        }));

        try {
            const result = await getSubTasksByStatus(
                projectId,
                workspaceId,
                status,
                column.page + 1,
                5
            );

            setColumnData(prev => ({
                ...prev,
                [status]: {
                    subTasks: [...prev[status].subTasks, ...result.subTasks],
                    page: result.currentPage,
                    hasMore: result.hasMore,
                    loading: false,
                },
            }));
        } catch (error) {
            console.error(`Error loading more for ${status}:`, error);
            toast.error("Failed to load more tasks");
            setColumnData(prev => ({
                ...prev,
                [status]: { ...prev[status], loading: false },
            }));
        }
    };

    // ... rest of component
}
```

---

### **Step 3: Add Scroll Detection to Column**

#### **Updated DroppableColumn Component**

```typescript
function DroppableColumn({
    column,
    subTasks,
    hasMore,
    loading,
    onLoadMore,
    onSubTaskClick,
}: {
    column: typeof COLUMNS[number];
    subTasks: SubTaskType[];
    hasMore: boolean;
    loading: boolean;
    onLoadMore: () => void;
    onSubTaskClick: (subTask: SubTaskType) =\u003e void;
}) {
    const { setNodeRef } = useDroppable({ id: column.id });
    const scrollRef = useRef<HTMLDivElement>(null);

    // Detect scroll to bottom
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const element = e.currentTarget;
        const isNearBottom = 
            element.scrollHeight - element.scrollTop - element.clientHeight < 100;

        if (isNearBottom && hasMore && !loading) {
            onLoadMore();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Column Header */}
            <div className={cn(
                "flex items-center justify-between p-3 border-b",
                column.bgColor,
                column.borderColor
            )}>
                <h3 className={cn("font-semibold", column.color)}>
                    {column.title}
                </h3>
                <span className="text-sm text-muted-foreground">
                    {subTasks.length}
                </span>
            </div>

            {/* Scrollable Content */}
            <ScrollArea 
                ref={scrollRef}
                className="flex-1"
                onScrollCapture={handleScroll}
            >
                <div
                    ref={setNodeRef}
                    className="p-2 space-y-2 min-h-[200px]"
                >
                    {subTasks.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            No tasks
                        </div>
                    ) : (
                        subTasks.map((subTask) => (
                            <KanbanCard
                                key={subTask.id}
                                subTask={subTask}
                                onClick={() => onSubTaskClick(subTask)}
                            />
                        ))
                    )}

                    {/* Loading Indicator */}
                    {loading && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {/* Load More Button (Alternative to auto-scroll) */}
                    {hasMore && !loading && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={onLoadMore}
                        >
                            Load More
                        </Button>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
```

---

### **Step 4: Update Render**

```typescript
return (
    <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
    >
        <div className="grid grid-cols-6 gap-4 h-[calc(100vh-200px)]">
            {COLUMNS.map((column) => (
                <DroppableColumn
                    key={column.id}
                    column={column}
                    subTasks={columnData[column.id].subTasks}
                    hasMore={columnData[column.id].hasMore}
                    loading={columnData[column.id].loading}
                    onLoadMore={() => loadMoreForColumn(column.id)}
                    onSubTaskClick={handleSubTaskClick}
                />
            ))}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
            {activeSubTask && (
                <KanbanCard subTask={activeSubTask} onClick={() => {}} />
            )}
        </DragOverlay>

        {/* Review Comment Dialog */}
        <ReviewCommentDialog
            open={isReviewDialogOpen}
            onClose={handleReviewCommentCancel}
            onSubmit={handleReviewCommentSubmit}
            projectMembers={projectMembers}
        />
    </DndContext>
);
```

---

## 📊 Benefits

| Feature | Before | After |
|---------|--------|-------|
| **Initial Load** | All subtasks | 5 per column (30 total) |
| **Memory Usage** | High | Low |
| **Performance** | Slow with many tasks | Fast |
| **User Experience** | All at once | Progressive loading |

---

## 🎯 Summary

**Changes**:
1. ✅ New data function: `getSubTasksByStatus` (paginated)
2. ✅ Column state management (page, hasMore, loading)
3. ✅ Scroll detection in each column
4. ✅ Load more on scroll or button click

**Result**: Each Kanban column loads 5 subtasks initially, then loads 5 more when user scrolls to bottom!

**Ready to implement?** 🚀
