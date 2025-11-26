"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DndContext, DragEndEvent, PointerSensor, KeyboardSensor, rectIntersection, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from '@dnd-kit/utilities';
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileText, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

interface SortableItemProps {
    id: string;
    children: (listeners: any) => React.ReactNode;
    className?: string;
    data?: {
        type: "chapter" | "lesson";
        chapterId?: string;
        lessonId?: string;
    }
}

const mockCourse = {
    id: "course_123",
    title: "Mock Course",
    chapters: [
        {
            id: "chapter_1",
            title: "Introduction",
            position: 1,
            lessons: [
                { id: "lesson_1_1", title: "Welcome", position: 1 },
                { id: "lesson_1_2", title: "Course Overview", position: 2 },
            ],
        },
        {
            id: "chapter_2",
            title: "Setup",
            position: 2,
            lessons: [
                { id: "lesson_2_1", title: "Install", position: 1 },
                { id: "lesson_2_2", title: "Configure", position: 2 },
            ],
        },
    ],
};

export function CourseStracture() {

    const source = mockCourse;

    const initialItems = source.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        order: chapter.position,
        isOpen: true,
        lessons: chapter.lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            order: lesson.position,
        })),
    }));


    const [items, setItems] = useState(initialItems);

    useEffect(() => {
        setItems(prevItems => {
            const updatedItems = source.chapters.map((chapter) => ({
                id: chapter.id,
                title: chapter.title,
                order: chapter.position,
                isOpen: prevItems.find(item => item.id === chapter.id)?.isOpen ?? true,
                lessons: chapter.lessons.map((lesson) => ({
                    id: lesson.id,
                    title: lesson.title,
                    order: lesson.position
                }))
            })) || [];
            return updatedItems;
        });
    }, [source]);

    function SortableItem({ children, id, className, data }: SortableItemProps) {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({ id: id, data: data });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
        };

        return (
            <div ref={setNodeRef}
                style={style} {...attributes}
                className={cn("touch-none", className, isDragging ? 'z-10 opacity-80' : '')}
            >
                {children(listeners)}
            </div>
        );
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;

        if (!over || active.id === over.id) {
            return;
        }
        const activeaId = active.id as string;
        const overId = over.id as string;
        const activeType = active.data.current?.type as "chapter" | "lesson";
        const overType = over.data.current?.type as "chapter" | "lesson";
        const courseId = source.id;
        if (activeType === "chapter") {

            let targetChapterId: string | null = null;

            if (overType === "chapter") {
                targetChapterId = overId;

            } else if (overType === "lesson") {
                targetChapterId = over.data.current?.chapterId ?? null;
            }

            if (!targetChapterId) {
                toast.error("Could not determine the chapter for reordering. Please try again.");
                return;
            }

            const oldIndex = items.findIndex((item) => item.id === activeaId);
            const newIndex = items.findIndex((item) => item.id === targetChapterId);

            if (oldIndex === -1 || newIndex === -1) {
                toast.error("Could not determine the chapter for reordering. Please try again.");
                return;
            }

            const newItems = arrayMove(items, oldIndex, newIndex);

            const updatedChapterForState = newItems.map((chapter, index) => ({
                ...chapter,
                order: index + 1,
            }));
            const previousItems = [...items];

            setItems(updatedChapterForState);

            if (courseId) {
                const chaptersToUpdate = updatedChapterForState.map((chapter) => ({
                    id: chapter.id,
                    position: chapter.order
                }));

                // persist API call placeholder
            }
            return;
        }

        if (activeType === "lesson" && overType === "lesson") {
            const chapterId = active.data.current?.chapterId;
            const overChapterId = over.data.current?.chapterId;

            if (!chapterId || chapterId !== overChapterId) {
                toast.error("Lesson move between different chapters or invalid chapter ID is not allowed. Please try again.");
                return;
            }

            const chapterIndex = items.findIndex((item) => item.id === chapterId);

            if (chapterIndex === -1) {
                toast.error("Could not determine the chapter for reordering. Please try again.");
                return;
            }

            const chapterToUpdate = items[chapterIndex];

            const oldLessonIndex = chapterToUpdate.lessons.findIndex((lesson) => lesson.id === activeaId);
            const newLessonIndex = chapterToUpdate.lessons.findIndex((lesson) => lesson.id === overId);

            if (oldLessonIndex === -1 || newLessonIndex === -1) {
                toast.error("Could not find lessons for reordering. Please try again.");
                return;
            }

            const reorderedLessons = arrayMove(chapterToUpdate.lessons, oldLessonIndex, newLessonIndex);

            const updatedLessonForState = reorderedLessons.map((lesson, index) => ({
                ...lesson,
                order: index + 1,
            }));


            const newItems = [...items];

            newItems[chapterIndex] = {
                ...chapterToUpdate,
                lessons: updatedLessonForState,
            }

            const previousItems = [...items];

            setItems(newItems);

            if (courseId) {
                const lessonToUpdate = updatedLessonForState.map((lesson) => ({
                    id: lesson.id,
                    position: lesson.order
                }));
                // persist API call placeholder
            }
            return;
        }
    }


    function toggleChapter(chapterId: string) {
        setItems((items) => {
            return items.map((chapter) => {
                if (chapter.id === chapterId) {
                    return {
                        ...chapter,
                        isOpen: !chapter.isOpen
                    }
                }
                return chapter;
            });
        });
    }

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    return (
        <div className="w-full overflow-auto">
            <DndContext
                collisionDetection={rectIntersection}
                onDragEnd={handleDragEnd}
                sensors={sensors}
            >
                {/* Chapters table - chapters are rows, each row contains a collapsible lessons table */}
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="text-left">
                            <th className="p-2 border">#</th>
                            <th className="p-2 border">Chapter</th>
                            <th className="p-2 border">Lessons</th>
                        </tr>
                    </thead>
                    <tbody>
                        <SortableContext
                            items={items.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map((item, chapterIndex) => (
                                <SortableItem key={item.id} id={item.id} data={{ type: "chapter" }}>
                                    {(listeners) => (
                                        <>
                                            <tr className="align-top" >
                                                <td className="p-2 border align-top">{chapterIndex + 1}</td>
                                                <td className="p-2 border">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <Collapsible open={item.isOpen} onOpenChange={() => toggleChapter(item.id)}>
                                                                <CollapsibleTrigger asChild>
                                                                    <Button size="icon" variant="ghost" className="p-0">
                                                                        {item.isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                    </Button>
                                                                </CollapsibleTrigger>
                                                            </Collapsible>
                                                            <span className="font-medium">{item.title}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-2 border">
                                                    <div className="text-sm text-muted-foreground">{item.lessons.length} lessons</div>
                                                </td>
                                            </tr>

                                            {/* Collapsible row showing lessons as a nested table */}
                                            <tr>
                                                <td colSpan={3} className="p-0">
                                                    <Collapsible open={item.isOpen}>
                                                        <CollapsibleContent>
                                                            <table className="w-full border-collapse">
                                                                <thead>
                                                                    <tr>
                                                                        <th className="p-2 border">#</th>
                                                                        <th className="p-2 border">Lesson</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    <SortableContext
                                                                        items={item.lessons.map(l => l.id)}
                                                                        strategy={verticalListSortingStrategy}
                                                                    >
                                                                        {item.lessons.map((lesson, lessonIndex) => (
                                                                            <SortableItem
                                                                                key={lesson.id}
                                                                                id={lesson.id}
                                                                                data={{ type: "lesson", chapterId: item.id }}
                                                                            >
                                                                                {(lessonListeners) => (
                                                                                    <tr className="hover:bg-accent">
                                                                                        <td className="p-2 border">{lessonIndex + 1}</td>
                                                                                        <td className="p-2 border w-full">
                                                                                            <div className="flex items-center justify-between w-full">
                                                                                                <div className="flex items-center gap-2 w-full">
                                                                                                    <Button size="icon" variant="ghost" {...lessonListeners}>
                                                                                                        <GripVertical className="w-4 h-4" />
                                                                                                    </Button>
                                                                                                    <FileText className="w-4 h-4" />
                                                                                                    <Link href={`/admin/courses`} className="hover:text-primary w-full truncate">{lesson.title}</Link>
                                                                                                </div>
                                                                                                {/* Action buttons (delete/edit) can be added here */}
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                )}
                                                                            </SortableItem>
                                                                        ))}
                                                                    </SortableContext>
                                                                </tbody>
                                                            </table>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </SortableItem>
                            ))}
                        </SortableContext>
                    </tbody>
                </table>
            </DndContext>
        </div>
    )
}
