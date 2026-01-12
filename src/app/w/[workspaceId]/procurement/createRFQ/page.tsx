import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function CreateRFQPage({ params }: PageProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4">
                <Button asChild variant="ghost" size="icon">
                    <Link href={`/w/${workspaceId}/procurement/indent`}>
                        <IconArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <h2 className="text-3xl font-bold tracking-tight">Create RFQ</h2>
            </div>

            <div className="rounded-lg border p-8">
                <p className="text-muted-foreground">RFQ creation form will go here...</p>
            </div>
        </div>
    );
}
