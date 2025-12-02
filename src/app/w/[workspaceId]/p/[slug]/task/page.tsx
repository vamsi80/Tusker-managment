
import { CreateTaskForm } from "./_components/create-task-form"

interface iAppProps {
    projectId: string
}

// interface SortableItemProps {
//     id: string;
//     children: (listeners: any) => React.ReactNode;
// }

export default async function ProjectTask({ projectId }: iAppProps) {
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <CreateTaskForm projectId={projectId} />
            </div>
            <div>
                {/* <DataTable data={task} /> */}
                {/* <CourseStracture/> */}
            </div>
        </>
    )
}
