import { requireUser } from "@/app/data/user/require-user";
import { CreateUserForm } from "./_components/create-user";

interface iAppProps {
    workspaceId: string;
}

export default async function TeamPage({ workspaceId }: iAppProps) {
    const user = await requireUser();
    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                    Wellcome {user.name}
                </h1>
                <a>
                    <CreateUserForm workspaceId={workspaceId} />
                </a>
            </div>
        </>
    )
}