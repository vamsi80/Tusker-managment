"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteCourse } from "./actions";
import { tryCatch } from "@/hooks/try-catch";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export default function DeleteCoursePage() {
    const [Pending, startTransition] = useTransition();
    const { courseId } = useParams<{ courseId: string }>();
    const router = useRouter();

    function onSubmit() {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(deleteCourse(courseId));
            console.log("results", { result });

            if (error) {
                toast.error("An Error Occured. Please Try Again.");
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                router.push("/admin/courses");
            } else (
                toast.error(result.message)
            )
        });
    }

    return (
        <div className="max-w-xl mx-auto w-full">
            <Card className="mt-32">
                <CardHeader>
                    <CardTitle>Are you sure you want to delete this course?</CardTitle>
                    <CardDescription>This action cannot be undone.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-end gap-2" >
                    <Link className={buttonVariants({ variant: "outline" })} href="/admin/courses">
                        Cancle
                    </Link>
                    <Button variant="destructive" onClick={onSubmit} disabled={Pending}>
                        {Pending ? (
                            <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 size-4" />
                                Delete
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}