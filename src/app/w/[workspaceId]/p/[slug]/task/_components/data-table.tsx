"use client"
import * as React from "react"
import {
  closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  IconGripVertical, IconPlus, IconDotsVertical,
  IconChevronRight as TablerChevronRight,
  IconChevronDown as TablerChevronDown,
} from "@tabler/icons-react"
import { ColumnDef, ColumnFiltersState, flexRender, getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, Row, SortingState, useReactTable, VisibilityState, } from "@tanstack/react-table"
import { z } from "zod"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger, } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table"
import { Tabs, TabsContent, } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { CreateSubTaskForm } from "./create-subTask-form"
import { ProjectMembersType } from "@/app/data/project/get-project-members"
import { UserProjectsType } from "@/app/data/user/get-user-projects"
import { ProjectTaskType } from "@/app/data/task/get-project-tasks"

type ProjectWithTasks = UserProjectsType[number] & { tasks: ProjectTaskType }

interface iAppProps {
  data: ProjectWithTasks[]
  members: ProjectMembersType
  workspaceId: string
  projectId: string
  canCreateSubTask: boolean
}

// Schema & types
export const schema = z.object({
  id: z.number(),
  originalTaskId: z.string().optional(), // Store the actual database ID
  name: z.string(),
  subRows: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        assignee: z.string(),
        tag: z.string(),
        status: z.string(),
        dueDate: z.string(),
        startDate: z.string(),
      })
    )
    .optional(),
})
export type RowType = z.infer<typeof schema>

// small helper to convert an incoming id (string | number) -> deterministic number
function numericId(src: unknown, idx = 0) {
  if (typeof src === "number") return src
  if (typeof src === "string") {
    // simple string hash -> positive number
    let h = 0
    for (let i = 0; i < src.length; i++) {
      h = (h << 5) - h + src.charCodeAt(i)
      h |= 0
    }
    return Math.abs(h) + idx
  }
  return idx
}

// Drag handle for sub-rows
function SubDragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-7 hover:bg-transparent"
      aria-label="Drag sub-row"
    >
      <IconGripVertical className="size-3" />
      <span className="sr-only">Drag sub-row</span>
    </Button>
  )
}

export function DataTable({ data, members, workspaceId, projectId, canCreateSubTask }: iAppProps) {
  // 'data' here is AdminGetTasks (from your getTasksProjectId)
  // Map server task shape -> RowType[]
  // Note: `data` is an array of projects; we access the first project below in initialRows.
  // The `initialItems` variable was unused and accessed `data.tasks` incorrectly, so it has been removed.
  // const project = data[0]
  // const tasks = project.tasks[0]

  // const intialItems = project.tasks.map((task)=>({
  //   id: task.id,
  //   name: task.name,
  //   subTasks:tasks.subTasks.map((subTask) => ({
  //     id: subTask.id,
  //     name: subTask.name,
  //     description: subTask.description,
  //     createdAt: subTask.createdAt,
  //     dueDate: subTask.dueDate,
  //     priority: subTask.priority,
  //     status: subTask.status
  //   }))
  // })) || []

  // const [rows, setRows] = useState(intialItems);

  const initialRows = React.useMemo((): RowType[] => {
    if (!data || !Array.isArray(data) || data.length === 0) return []
    const project = data[0]
    return (project.tasks ?? []).map((t, tIdx) => ({
      id: numericId(t.id, tIdx),
      originalTaskId: t.id, // Store the actual database ID
      name: String(t.name ?? "Untitled Task"),
      subRows:
        (t.subTasks ?? []).map((s, sIdx) => {
          // Extract assignee name from nested structure
          let assigneeName = "Unassigned";
          if ((s as any).assignee?.workspaceMember?.user) {
            const user = (s as any).assignee.workspaceMember.user;
            assigneeName = `${user.name} ${user.surname || ''}`.trim();
          }

          return {
            id: numericId((s as any).id ?? `${t.id}-sub-${sIdx}`, sIdx),
            name: String(s.name ?? s.description ?? "Untitled Subtask"),
            assignee: assigneeName,
            tag: String((s as any).tag ?? "CONTRACTOR"),
            status: String((s as any).status ?? "TO_DO"),
            dueDate: (s as any).dueDate ? new Date((s as any).dueDate).toISOString().slice(0, 10) : "",
            startDate: (s as any).createdAt ? new Date((s as any).createdAt).toISOString().slice(0, 10) : "",
          };
        }) || [],
    }))
  }, [data])

  // Use mapped rows as component state (keeps existing UI behaviour)
  const [rows, setRows] = React.useState<RowType[]>(() => initialRows)
  React.useEffect(() => setRows(initialRows), [initialRows])

  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })

  const toggleExpand = (id: number) => setExpanded((s) => ({ ...s, [id]: !s[id] }))

  // NOTE: read-only UI — still keep addSubRow local-only if you want to add visually
  const addSubRow = (TaskId: number) => {
    setRows((prev) =>
      prev.map((p) =>
        p.id === TaskId
          ? {
            ...p,
            subRows: [
              ...(p.subRows || []),
              {
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: "New subtask",
                assignee: "Unassigned",
                priority: "Medium",
                status: "Not Started",
                dueDate: "",
                startDate: "",
                tag: "",
              },
            ],
          }
          : p
      )
    )
    setExpanded((s) => ({ ...s, [TaskId]: true }))
  }

  const removeSubRow = (_TaskId: number, _subId: number) => {
    // no-op in read-only mode
  }
  const updateSubRow = (_parentId: number, _subId: number, _patch: Partial<RowType>) => {
    // no-op in read-only mode
  }

  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor), useSensor(KeyboardSensor))

  // Columns: render display-only UI (no Input/Select)
  const columns: ColumnDef<RowType>[] = React.useMemo(
    () => [
      {
        id: "expand",
        header: () => null,
        cell: ({ row }) => {
          const isOpen = !!expanded[row.original.id]
          return (
            <Button variant="ghost" size="icon" onClick={() => toggleExpand(row.original.id)} className="size-8" aria-expanded={isOpen}>
              {isOpen ? <TablerChevronDown className="size-4" /> : <TablerChevronRight className="size-4" />}
              <span className="sr-only">{isOpen ? "Collapse" : "Expand"}</span>
            </Button>
          )
        },
        meta: { className: "w-10 p-0 text-right" },
        enableHiding: false,
        enableSorting: false,
      },
      { id: "drag", header: () => null, cell: () => null, enableHiding: false, enableSorting: false, meta: { className: "w-8 p-0 text-center" } },
      {
        id: "select",
        // header renders a master checkbox that selects/deselects visible page rows
        header: ({ table }) => (
          <div className="flex items-center justify-center max-w-10">
            <Checkbox
              checked={table.getIsAllPageRowsSelected() || undefined}
              onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
              aria-label="Select all"
            />
          </div>
        ),
        // cell renders checkbox for parent rows only (sub-rows will skip this column)
        cell: ({ row }) => (
          <div className="flex items-center justify-center max-w-10">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(val) => row.toggleSelected(!!val)}
              aria-label={`Select ${row.original.name}`}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-10 p-0" },
      },
      {
        accessorKey: "name",
        header: "Task Title",
        cell: ({ row }) => <TableCellViewer item={row.original} />,
        meta: { className: "min-w-[200px] w-[30%] text-left" },
        enableHiding: false,
      },

      // ===== updated columns: parent shows preview (first subtask) +N, sub-rows show actual values =====
      {
        accessorKey: "assignee",
        header: "Assignee",
        cell: ({ row }) => {
          const subs = (row.original as any).subRows as (RowType | any)[] | undefined
          if (subs && subs.length) {
            const uniqueAssignees = new Set(subs.map((s: any) => s.assignee).filter((a: string) => a !== "Unassigned"));
            return <div>{uniqueAssignees.size} People</div>
          }
          return <div>{(row.original as any).assignee ?? "Unassigned"}</div>
        },
      },
      {
        accessorKey: "tag",
        header: "Tag",
        cell: ({ row }) => {
          const subs = (row.original as any).subRows as (RowType | any)[] | undefined
          if (subs && subs.length) {
            return <div>—</div>
          }
          return <div>{(row.original as any).tag ?? "—"}</div>
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const subs = (row.original as any).subRows as (RowType | any)[] | undefined
          if (subs && subs.length) {
            // Check if all subtasks are done? Or just show summary?
            // For now keeping existing behavior of showing first + count, or maybe "In Progress" if mixed?
            // User said "update the parent task" - let's try to be smart.
            // If any is "IN_PROGRESS", show "In Progress". If all "DONE", show "Done".
            // But status strings might vary. Let's stick to simple summary for now to avoid breaking.
            const first = subs[0].status ?? "Not Started"
            return <div className="truncate">{first}{subs.length > 1 ? ` +${subs.length - 1}` : ""}</div>
          }
          return <div>{(row.original as any).status ?? "—"}</div>
        },
      },

      {
        accessorKey: "dueDate",
        header: () => <div className="w-full text-center">Due Date</div>,
        cell: ({ row }) => <div className="text-center">{(row.original as any).dueDate ?? ""}</div>
      },
      {
        accessorKey: "startDate",
        header: () => <div className="w-full text-right">Start Date</div>,
        cell: ({ row }) => <div className="text-right">{(row.original as any).startDate ?? ""}</div>
      },
      {
        id: "actions",
        header: () => null,
        cell: () => (
          <div className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="size-8" size="icon">
                  <IconDotsVertical />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem>View</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        enableHiding: false,
        meta: { className: "text-center" },
      },
    ],
    [expanded]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  // DnD handler unchanged, just operates on `rows`
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!active || !over) return
    const activeId = Number(active.id)
    const overId = Number(over.id)

    let activeParentId: number | undefined
    let overParentId: number | undefined
    for (const p of rows) {
      if ((p.subRows || []).some((s) => s.id === activeId)) activeParentId = p.id
      if ((p.subRows || []).some((s) => s.id === overId)) overParentId = p.id
    }
    if (activeParentId == null || overParentId == null || activeParentId !== overParentId) return
    const parentId = activeParentId
    setRows((prev) =>
      prev.map((p) => {
        if (p.id !== parentId) return p
        const subs = p.subRows ? [...p.subRows] : []
        const oldIndex = subs.findIndex((s) => s.id === activeId)
        const newIndex = subs.findIndex((s) => s.id === overId)
        if (oldIndex === -1 || newIndex === -1) return p
        const moved = arrayMove(subs, oldIndex, newIndex)
        return { ...p, subRows: moved }
      })
    )
  }

  // ParentRow and SubRow: keep identical logic but use `rows`/`setRows` where appropriate
  function ParentRow({ row }: { row: Row<RowType> }) {
    const parent = row.original
    const isExpanded = !!expanded[parent.id]

    return (
      <>
        <TableRow>
          {row.getVisibleCells().map((cell) => {
            const metaClass = String((((cell as any).columnDef?.meta as { className?: string })?.className ?? "") as string)
            if (cell.column.id === "drag") {
              return <TableCell key={cell.id} className={`${metaClass} w-0 max-w-0 overflow-hidden p-0`} />
            }
            return <TableCell key={cell.id} className={metaClass}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
          })}
        </TableRow>

        {isExpanded && (
          <SortableContext items={(parent.subRows || []).map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {(parent.subRows || []).map((sub) => (
              <SubRow key={sub.id} parentId={parent.id} sub={sub} visibleCols={table.getVisibleLeafColumns()} onRemove={removeSubRow} onUpdate={updateSubRow} />
            ))}
            <TableRow className="bg-muted/10">
              <TableCell colSpan={table.getVisibleLeafColumns().length}>
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">{(parent.subRows || []).length} sub-row{(parent.subRows || []).length !== 1 && "s"}</div>
                  {canCreateSubTask && parent.originalTaskId && (
                    <div className="flex items-center gap-2">
                      <CreateSubTaskForm
                        members={members}
                        workspaceId={workspaceId}
                        projectId={projectId}
                        parentTaskId={parent.originalTaskId}
                      />
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          </SortableContext>
        )}
      </>
    )
  }

  function SubRow({ parentId, sub, visibleCols }: { parentId: number; sub: RowType; visibleCols: ReturnType<typeof table.getVisibleLeafColumns> }) {
    const { transform, transition, setNodeRef, isDragging } = useSortable({ id: sub.id })
    const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition }

    const renderCell = (col: any) => {
      if (col.id === "expand") return <div className="pl-6" />
      if (col.id === "drag") return <SubDragHandle id={sub.id} />
      if (col.id === "select") return null
      if (col.id === "actions") {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <IconDotsVertical />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem>View</DropdownMenuItem>
            </DropdownMenuContent>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem>Edit</DropdownMenuItem>
            </DropdownMenuContent>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem>Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }

      const key = col.accessorKey
      switch (key) {
        case "name":
          return <div className="truncate">{sub.name}</div>
        case "assignee":
          return <div>{sub.subRows?.length}</div>
        case "tag":
          return <div>{sub.subRows?.length}</div>
        case "status":
          return <div>{sub.subRows?.length}</div>
        case "dueDate":
          return <div className="text-center">{(sub as any).dueDate}</div>
        case "startDate":
          return <div className="text-right">{(sub as any).startDate}</div>
        default:
          return <div>{(sub as any)[key]}</div>
      }
    }

    return (
      <TableRow ref={setNodeRef} style={style} className={`bg-muted/5 ${isDragging ? "opacity-80 z-10" : ""}`}>
        {visibleCols.map((col) => {
          const metaClass = String((((col as any).columnDef?.meta as { className?: string })?.className ?? "") as string)
          return <TableCell key={`sub-${sub.id}-${col.id}`} className={metaClass}>{renderCell(col)}</TableCell>
        })}
      </TableRow>
    )
  }

  // If no rows, keep UI consistent with your layout
  if (!rows || rows.length === 0) {
    return <div className="p-6 text-center">No tasks found for this project.</div>
  }

  // final render — layout preserved
  return (
    <Tabs defaultValue="outline" className="w-full flex-col justify-start gap-6 mt-5">
      <TabsContent value="outline" className="relative flex flex-col gap-4 overflow-auto">
        <div className="rounded-lg border overflow-x-auto overflow-y-hidden -mx-4 sm:mx-0">
          <DndContext collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd} sensors={sensors}>
            <Table style={{ tableLayout: "fixed" }} className="min-w-[900px]">
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => {
                      const headerMeta = (h.column.columnDef.meta as { className?: string } | undefined)?.className ?? ""
                      const isDragHeader = h.column.id === "drag"
                      const className = isDragHeader ? `${headerMeta} w-0 max-w-0 p-0 overflow-hidden` : headerMeta
                      return (
                        <TableHead key={h.id} colSpan={h.colSpan} className={className}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>

              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <ParentRow row={row} />
                    </React.Fragment>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">No results.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </TabsContent>
    </Tabs>
  )
}

// Minimal Drawer viewer (kept simple)
function TableCellViewer({ item }: { item: RowType }) {
  const isMobile = useIsMobile()
  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">{item.name}</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{item.name}</DrawerTitle>
          <DrawerDescription>Details</DrawerDescription>
        </DrawerHeader>
        <div className="p-4">{/* put fields here if you like */}</div>
        <DrawerFooter>
          <Button>Done</Button>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
