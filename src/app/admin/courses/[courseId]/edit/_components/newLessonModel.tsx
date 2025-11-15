import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { tryCatch } from "@/hooks/try-catch";
import { createLesson } from "../actions";
import { toast } from "sonner";

export function NewLessonModel({ courseId, chapterId }: { courseId: string, chapterId: string }) {

    const [isopen, setIsOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const form = useForm<LessonSchemaType>({
        resolver: zodResolver(lessonSchema) as unknown as Resolver<LessonSchemaType>,
        defaultValues: {
            name: '',
            courseId: courseId,
            chapterId: chapterId,
        },
    })

    async function onSubmit(values: LessonSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(createLesson(values));
            if (error) {
                toast.error("An Error Occured. Please Try Again.");
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                form.reset();
                setIsOpen(false);
            } else (
                toast.error(result.message)
            )
        });
    }

    function handleOpenChange(Open: boolean) {
        if (!Open) {
            form.reset();
        }

        setIsOpen(Open);
    }

    return (
        <Dialog open={isopen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-center gap-1">
                    <Plus className="size-4" /> New Lesson
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    Create New Lesson
                </DialogHeader>
                <DialogDescription>
                    What would you like to name yout new Lesson?
                </DialogDescription>
                <DialogHeader>
                    <Form {...form} >
                        <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Name
                                        </FormLabel>

                                        <FormControl>
                                            <Input placeholder="Lesson Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button
                                    disabled={pending}
                                    type="submit"
                                >
                                    {pending ? "Creating..." : "Save Change"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}
