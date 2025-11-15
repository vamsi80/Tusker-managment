"use client";

import { AdminLessonType } from "@/app/data/admin/admin-get-lesson";
import { Uploader } from "@/components/file-uploader/uploader";
import { RichTextEditor } from "@/components/rich-text-editor/editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { tryCatch } from "@/hooks/try-catch";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { uplodeLessons } from "../actions";
import { toast } from "sonner";

interface iAppProps {
    data: AdminLessonType;
    chapterId: string;
    courseId: string;
}

export function LessonForm({ data, chapterId, courseId }: iAppProps) {

    const [Pending, startTransition] = useTransition();

    const form = useForm<LessonSchemaType>({
        resolver: zodResolver(lessonSchema) as unknown as Resolver<LessonSchemaType>,
        defaultValues: {
            name: data.title,
            chapterId: chapterId,
            courseId: courseId,
            description: data.description ?? undefined,
            videoKey: data.videoKey ?? undefined,
            thumbnailKey: data.thumbnailKey ?? undefined
        },
    })

    function onSubmit(values: LessonSchemaType) {

        startTransition(async () => {
            const { data: result, error } = await tryCatch(uplodeLessons(values, data.id));
            console.log("results", { result });

            if (error) {
                toast.error("An Error Occured. Please Try Again.");
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
            } else (
                toast.error(result.message)
            )
        });


    }

    return (
        <div>
            <Link
                className={buttonVariants({ variant: 'outline', className: 'mb-6' })}
                href={`/admin/courses/${courseId}/edit`}
            >
                <ArrowLeft className="size-4" />
                <span>Back</span>
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle>Lesson Configuration</CardTitle>
                    <CardDescription>Configure the video and descreption for this lesson</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                name="name"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Lesson Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Lesson Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                name="description"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>descreption</FormLabel>
                                        <FormControl>
                                            <RichTextEditor field={field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                name="thumbnailKey"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Thumbnail image</FormLabel>
                                        <FormControl>
                                            <Uploader onChange={field.onChange} value={field.value} fileTypeAcepted="image" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                name="videoKey"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Video File</FormLabel>
                                        <FormControl>
                                            <Uploader onChange={field.onChange} value={field.value} fileTypeAcepted="video" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit">
                                {Pending ? "saving..." : "Save Lesson"}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
