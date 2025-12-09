"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function ReloadButton() {
    const [isReloading, setIsReloading] = useState(false);

    const handleReload = () => {
        setIsReloading(true);

        // Dispatch custom event for task table to listen to
        window.dispatchEvent(new CustomEvent('taskTableReload'));

        // Reset button state after a brief moment (just for button feedback)
        setTimeout(() => {
            setIsReloading(false);
        }, 300);
    };

    return (
        <Button
            onClick={handleReload}
            variant="outline"
            size="sm"
            disabled={isReloading}
            className="gap-2"
        >
            <RefreshCw
                className={`h-4 w-4 ${isReloading ? 'animate-spin' : ''}`}
            />
        </Button>
    );
}
