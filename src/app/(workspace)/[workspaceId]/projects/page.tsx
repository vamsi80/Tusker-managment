import { EmptyState } from "@/components/general/emptyState";
import { Suspense } from "react";
// import ProjectHeaderClient from "./_components/ProjectHeaderClient";


export default async function ProjectPage() {

    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Projects</h1>
                {/* <ProjectHeaderClient/> */}
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
