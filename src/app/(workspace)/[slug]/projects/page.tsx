import { EmptyState } from "@/components/general/emptyState";
import { Suspense } from "react";
import ProjectHeaderClient from "./_components/ProjectHeaderClient";

export default async function ProjectPage() {
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Projects</h1>
                <ProjectHeaderClient />
            </div>

            <div>
                <h1>Here you will see all of the projects</h1>
            </div>

            <Suspense>
                <RenderCourses />
            </Suspense>
        </>
    );
}

async function RenderCourses() {
    // const data = await adminGetCourses();

    return (
        <>
            <EmptyState
                title="No Project"
                description="You have not created any project yet."
                buttonText="Create Project"
                href="/admin/courses/create"
            />
        </>
    )
}

// function AdminCourseCardSkeletonLayout() {
//     return (
//         <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3 gap-7">
//             {Array.from({ length: 4 }).map((_, index) => (
//                 <AdminCourseCardSkeleton key={index} />
//             ))}
//         </div>
//     )
// }
