"use client";

import { Button } from "@/components/ui/button";
import { RefreshCcw, LayoutDashboard, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface ProjectNotFoundProps {
    workspaceId: string;
}

export default function ProjectNotFound({ workspaceId }: ProjectNotFoundProps) {
    const router = useRouter();

    const handleRefresh = () => {
        window.location.reload();
    };

    const handleGoBack = () => {
        router.push(`/w/${workspaceId}`);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center px-6 animate-in fade-in zoom-in duration-500">
            <div className="relative">
                <div className="absolute -inset-4 bg-primary/10 rounded-full blur-2xl" />
                <div className="relative bg-background border rounded-3xl p-6 shadow-xl">
                    <AlertCircle className="h-12 w-12 text-primary animate-pulse" />
                </div>
            </div>
            
            <div className="space-y-3 max-w-[500px]">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Access Denied or Project Missing
                </h1>
                <p className="text-muted-foreground text-lg leading-relaxed">
                    We couldn&apos;t find this project. It might have been deleted, or you might not have the required permissions to view it.
                </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[400px]">
                <Button 
                    onClick={handleRefresh} 
                    variant="default" 
                    size="lg"
                    className="flex-1 gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh Hard
                </Button>
                <Button 
                    onClick={handleGoBack} 
                    variant="outline" 
                    size="lg"
                    className="flex-1 gap-2 hover:bg-accent/50 transition-all"
                >
                    <LayoutDashboard className="h-4 w-4" />
                    Back to Workspace
                </Button>
            </div>

            <p className="text-xs text-muted-foreground pt-4">
                If you believe this is an error, please contact your administrator.
            </p>
        </div>
    );
}
