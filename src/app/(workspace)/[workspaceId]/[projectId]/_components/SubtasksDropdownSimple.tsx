"use client";

import React from "react";
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconGripVertical, IconChevronDown, IconTrash, IconPlus } from "@tabler/icons-react";

/**
 * Simple Subtasks dropdown component
 * - Only 2 fields per subtask: title, status
 * - Raw demo data inside component
 * - Drag reorder, add, delete
 */

type Subtask = { id: string; title: string; status: "Todo" | "In Progress" | "Done" };

export default function SubtasksDropdownSimple() {
  // demo raw data
  const [subtasks, setSubtasks] = React.useState<Subtask[]>([
    { id: "s1", title: "Draft outline", status: "Todo" },
    { id: "s2", title: "Write intro", status: "In Progress" },
    { id: "s3", title: "Proofread", status: "Todo" },
  ]);

  // inputs for adding
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const [newStatus, setNewStatus] = React.useState<Subtask["status"]>("Todo");

  // dnd-kit sensors
  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor), useSensor(KeyboardSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    // items are simple ids ("s1", "s2", ...)
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setSubtasks((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  function addSubtask() {
    const title = titleRef.current?.value?.trim();
    if (!title) return;
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    setSubtasks((prev) => [...prev, { id, title, status: newStatus }]);
    if (titleRef.current) titleRef.current.value = "";
    setNewStatus("Todo");
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  // small sortable row used inside the Table
  function SortableRow({ item }: { item: Subtask }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id } as any);

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.9 : 1,
      touchAction: "manipulation",
    };

    return (
      <TableRow ref={setNodeRef as any} style={style} className="group">
        <TableCell className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="p-1 rounded hover:bg-muted">
            <IconGripVertical className="size-4" />
            <span className="sr-only">Drag</span>
          </button>
          <div className="truncate">{item.title}</div>
        </TableCell>

        <TableCell className="w-36">
          <div className="text-sm">{item.status}</div>
        </TableCell>

        <TableCell className="w-12 text-right">
          <button onClick={() => removeSubtask(item.id)} className="p-1 rounded hover:bg-destructive/10">
            <IconTrash className="size-4" />
            <span className="sr-only">Delete</span>
          </button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {subtasks.length > 0 ? `${subtasks.length} Subtasks` : "No Subtasks"}
            <IconChevronDown className="ml-2" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[28rem] p-3">
          <div className="mb-2 font-medium">Subtasks</div>

          <div className="overflow-hidden rounded-lg border">
            <DndContext collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd} sensors={sensors}>
              <Table>
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">{" "}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {subtasks.length ? (
                    <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      {subtasks.map((s) => (
                        <SortableRow key={s.id} item={s} />
                      ))}
                    </SortableContext>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="p-4 text-center text-sm text-muted-foreground">
                        No subtasks yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </DndContext>
          </div>

          {/* add new */}
          <div className="mt-3 flex gap-2">
            <Input ref={titleRef} placeholder="Subtask title" className="flex-1" />
            <div className="w-36">
              <Select onValueChange={(v) => setNewStatus(v as Subtask["status"])} defaultValue={newStatus}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todo">Todo</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addSubtask} size="sm" aria-label="Add subtask">
              <IconPlus />
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
