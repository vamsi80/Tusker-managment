# ✅ Kanban Pagination - Implementation Complete (Step 1/2)

## 🎯 What's Been Done

### ✅ **Step 1: Data Layer Created**

Created new data function for paginated subtasks by status:

**File**: `src/data/task/kanban/get-subtasks-by-status.ts`

**Features**:
- ✅ Fetches subtasks by status (TO_DO, IN_PROGRESS, etc.)
- ✅ Pagination support (page, pageSize)
- ✅ Role-based filtering (admin/lead see all, members see assigned)
- ✅ Cached with `unstable_cache` (60 second TTL)
- ✅ Request deduplication with React `cache`
- ✅ Pinned tasks appear first
- ✅ Returns `hasMore` flag for infinite scroll

**Usage**:
```typescript
import { getSubTasksByStatus } from "@/data/task/kanban";

const result = await getSubTasksByStatus(
    projectId,
    workspaceId,
    "TO_DO",  // status
    1,        // page
    5         // pageSize
);

// result = {
//   subTasks: [...],
//   totalCount: 25,
//   hasMore: true,
//   currentPage: 1
// }
```

---

## 📋 Next Steps (Step 2/2)

### **Update Kanban Board Component**

You need to update `kanban-board.tsx` to:

1. ✅ Add column state management
2. ✅ Add scroll detection
3. ✅ Add load more functionality
4. ✅ Update DroppableColumn component

---

## 🔧 Implementation Guide

### **1. Add Imports**

```typescript
// Add to kanban-board.tsx
import { getSubTasksByStatus } from "@/data/task/kanban";
import { useRef } from "react";
import { Loader2 } from "lucide-react";
```

### **2. Add Column State**

```typescript
export function KanbanBoard({ initialSubTasks, projectMembers, workspaceId, projectId }: KanbanBoardProps) {
    // Replace single state with column-based state
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

    // Initialize with first 5 per column
    useEffect(() => {
        const grouped = initialSubTasks.reduce((acc, task) => {
            if (!acc[task.status]) acc[task.status] = [];
            if (acc[task.status].length < 5) {
                acc[task.status].push(task);
            }
            return acc;
        }, {} as Record<TaskStatus, SubTaskType[]>);

        setColumnData(prev => {
            const newData = { ...prev };
            COLUMNS.forEach(col => {
                const tasks = grouped[col.id] || [];
                newData[col.id] = {
                    subTasks: tasks,
                    page: 1,
                    hasMore: tasks.length >= 5,
                    loading: false,
                };
            });
            return newData;
        });
    }, [initialSubTasks]);
}
```

### **3. Add Load More Function**

```typescript
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
```

### **4. Update DroppableColumn**

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
    onSubTaskClick: (subTask: SubTaskType) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: column.id });
    const scrollRef = useRef<HTMLDivElement>(null);

    // Detect scroll to bottom
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const element = e.currentTarget;
        const isNearBottom = 
            element.scrollHeight - element.scrollTop - element.clientHeight < 50;

        if (isNearBottom && hasMore && !loading) {
            onLoadMore();
        }
    };

    return (
        <div className="flex-shrink-0 w-80 flex flex-col h-full">
            {/* Header */}
            <div className={cn("border-2 border-b p-4", column.borderColor, column.bgColor)}>
                <div className="flex items-center justify-between">
                    <h3 className={cn("font-semibold text-sm", column.color)}>
                        {column.title}
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                        {subTasks.length}
                    </Badge>
                </div>
            </div>

            {/* Scrollable Content */}
            <ScrollArea 
                ref={scrollRef}
                className="flex-1"
                onScrollCapture={handleScroll}
            >
                <div
                    ref={setNodeRef}
                    className={cn(
                        "p-3 space-y-2 min-h-[200px] transition-colors",
                        isOver && "bg-muted/50"
                    )}
                >
                    {subTasks.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8 text-sm">
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
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {/* Load More Button */}
                    {hasMore && !loading && subTasks.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
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

### **5. Update Render**

```typescript
return (
    <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
    >
        <div className="flex gap-4 h-[calc(100vh-200px)] overflow-x-auto">
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

        {/* Rest of component... */}
    </DndContext>
);
```

---

## 📊 What This Achieves

| Feature | Before | After |
|---------|--------|-------|
| **Initial Load** | ALL subtasks | 5 per column (30 total) |
| **Load Time** | Slow | Fast ⚡ |
| **Memory** | High | Low |
| **User Experience** | All at once | Progressive |

---

## ✅ Summary

**Completed**:
- ✅ Data layer function created
- ✅ Pagination logic implemented
- ✅ Caching configured

**Next**:
- ⏳ Update `kanban-board.tsx` with code above
- ⏳ Test scroll detection
- ⏳ Test load more functionality

**The data layer is ready! Now just update the component.** 🚀
