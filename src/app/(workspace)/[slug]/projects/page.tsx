import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default async function ProjectPage() {
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Projects</h1>

                <Link className={buttonVariants()} href="/admin/courses/create">
                    Create project
                </Link>
            </div>

            <div>
                <h1>Here you will see all of the projects</h1>
            </div>
        </>
    );
}
