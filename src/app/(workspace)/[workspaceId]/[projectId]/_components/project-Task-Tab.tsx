"use client"
import { CreateTaskForm } from "./create-task-form"
import { DndContext, DragEndEvent, DraggableSyntheticListeners, KeyboardSensor, PointerSensor, rectIntersection, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight, FileText, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { DataTable } from "./data-table";
import data from "./data.json"
import SubtasksDropdownSimple from "./SubtasksDropdownSimple";

interface iAppProps {
    projectId: string
}

interface SortableItemProps {
    id: string;
    children: (listeners: any) => React.ReactNode;
}


export const ProjectTaskTab = ({ projectId }: iAppProps) => {
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <a>
                    <CreateTaskForm projectId={projectId} />
                </a>
            </div>
            <div>
                {/* <DataTable data={data} /> */}
                <SubtasksDropdownSimple/>
            </div>
        </>
    )
}
