"use client";

import slugify from "slugify";
import { toast } from "sonner";
import { useTransition } from "react";
// import { createCourse } from "./actions";
import { editCourse } from "../actions";
import { useRouter } from "next/navigation";
import { tryCatch } from "@/hooks/try-catch";
import { Input } from "@/components/ui/input";
import { Resolver, useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { Uploader } from "@/components/file-uploader/uploader";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/rich-text-editor/editor";
import { Loader2, PlusIcon, SparkleIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CourseCategories, CourseLevel, courseSchema, CourseSchemaType, CourseStatus } from "@/lib/zodSchemas";
import { AdminCourseType } from "@/app/data/admin/admin-get-course";

interface iAppProps {
    data: AdminCourseType;
}

export function EditCourseForm({ data }: iAppProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const form = useForm<CourseSchemaType>({
        resolver: zodResolver(courseSchema) as unknown as Resolver<CourseSchemaType>,
        defaultValues: {
            title: data.title,
            description: data.description,
            fileKey: data.fileKey,
            price: data.price,
            duration: data.duration,
            level: data.level,
            category: data.category as CourseSchemaType["category"],
            status: data.status,
            slug: data.slug,
            smallDescription: data.smallDescription
        },
    })

    function onSubmit(values: CourseSchemaType) {

        startTransition(async () => {
            const { data: result, error } = await tryCatch(editCourse(values, data.id));
            console.log("results", { result });

            if (error) {
                toast.error("An Error Occured. Please Try Again.");
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                form.reset();
                router.push("/admin/courses");
            } else (
                toast.error(result.message)
            )
        });
    }

    return (
        <Form {...form}>
            <form
                className="space-y-6"
                onSubmit={form.handleSubmit(onSubmit)}
            >
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input placeholder="Title"{...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className=" flex gap-4 items-end">
                    <FormField
                        control={form.control}
                        name="slug"
                        render={({ field }) => (
                            <FormItem className="w-full">
                                <FormLabel>Slug</FormLabel>
                                <FormControl>
                                    <Input placeholder="Slug"{...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="button" className="w-fit" onClick={() => {
                        const titleValue = form.getValues("title");
                        const slug = slugify(titleValue)

                        form.setValue('slug', slug, { shouldValidate: true })
                    }}>
                        Generate Slug <SparkleIcon className="ml-1" size={16} />
                    </Button>
                </div>
                <FormField
                    control={form.control}
                    name="smallDescription"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Small Descreption</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Small Descreption"
                                    className="min-h-[20px]"{...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descreption</FormLabel>
                            <FormControl>
                                <RichTextEditor field={field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="fileKey"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Thumbnail image</FormLabel>
                            <FormControl>
                                <Uploader onChange={field.onChange} value={field.value} fileTypeAcepted="image" />
                                {/* <Input placeholder="thumbnail url" {...field} /> */}
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select Category" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {CourseCategories.map((category) => (
                                            <SelectItem key={category} value={category}>
                                                {category}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="level"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Level</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select Level" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {CourseLevel.map((category) => (
                                            <SelectItem key={category} value={category}>
                                                {category}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="duration"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Duration (hours)</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Duration"
                                        type="number"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price (Rs)</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Duration"
                                        type="number"
                                        {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select Status" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {CourseStatus.map((category) => (
                                        <SelectItem key={category} value={category}>
                                            {category}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={isPending}>
                    {
                        isPending ? (
                            <>
                                Upadting...
                                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                            </>
                        ) : (
                            <>
                                Upadting Course
                                <PlusIcon className="ml-1" size={16} />
                            </>
                        )
                    }
                </Button>
            </form>
        </Form>
    )
}