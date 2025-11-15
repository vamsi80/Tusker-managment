import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { adminGetCourses } from "@/app/data/admin/admin-get-courses";
import { AdminCourseCard, AdminCourseCardSkeleton } from "./_components/adminCoursesCard";
import { EmptyState } from "@/components/general/emptyState";
import { Suspense } from "react";

export default async function CoursesPage() {
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Courses</h1>

                <Link className={buttonVariants()} href="/admin/courses/create">
                    Create Course
                </Link>
            </div>

            <div>
                <h1>Here you will see all of the courses</h1>
            </div>
            <Suspense fallback={<AdminCourseCardSkeletonLayout/>}>
                <RenderCourses />
            </Suspense>
        </>
    );
}

async function RenderCourses() {
    const data = await adminGetCourses();

    return (
        <>
            {data.length === 0 ? (
                <EmptyState
                    title="No Courses"
                    description="You have not created any courses yet."
                    buttonText="Create Course"
                    href="/admin/courses/create"
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3 gap-7">
                    {data.map((course) => (
                        <AdminCourseCard key={course.id} data={course} />
                    ))}
                </div>
            )}
        </>
    )
}

function AdminCourseCardSkeletonLayout() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3 gap-7">
            {Array.from({ length: 4 }).map((_, index) => (
                <AdminCourseCardSkeleton key={index} />
            ))}
        </div>
    )
}