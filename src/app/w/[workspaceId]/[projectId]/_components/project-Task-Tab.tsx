import { getProjectDetails } from "@/app/data/project/getProjectDetails";
import { CreateTaskForm } from "./create-task-form"
import { DataTable } from "./data-table";
// import data from "./data.json"

interface iAppProps {
    projectId: string
}

// interface SortableItemProps {
//     id: string;
//     children: (listeners: any) => React.ReactNode;
// }

export async function ProjectTaskTab({ projectId }: iAppProps) {
    const  task  = await getProjectDetails(projectId);
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <a>
                    <CreateTaskForm projectId={projectId} />
                </a>
            </div>
            <div>
                <DataTable data={task} />
                {/* <CourseStracture/> */}
            </div>
        </>
    )
}
