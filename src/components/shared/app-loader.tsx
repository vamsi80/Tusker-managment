import { Loader2 } from "lucide-react";

interface AppLoaderProps {
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function AppLoader({ className = "", size = "md" }: AppLoaderProps) {
    const sizeClasses = {
        sm: "h-4 w-4",
        md: "h-6 w-6",
        lg: "h-10 w-10",
    };

    return (
        <div className={`flex flex-1 items-center justify-center p-8 min-h-[100px] ${className}`}>
            <div className="relative">
                <div className={`absolute inset-0 blur-md bg-primary/20 rounded-full animate-pulse`} />
                <Loader2 className={`${sizeClasses[size]} animate-spin text-primary relative z-10`} />
            </div>
        </div>
    );
}
