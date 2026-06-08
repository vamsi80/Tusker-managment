"use client";

import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function useSignout() {

    const router = useRouter();

    const handleSignOut = async function signOut(workspaceId?: string) {
        // Send offline heartbeat immediately before signing out to clear status
        if (workspaceId) {
            try {
                await fetch(`/api/v1/presence/${workspaceId}`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'offline' }),
                });
            } catch (e) {
                console.error("Failed to send offline status on signout", e);
            }
        }

        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    window.location.href = "/";
                    toast.success("Signed out successfully");
                },
                onError: () => {
                    toast.error("Sign out failed");
                },
            },
        });
    }
    return handleSignOut;
}
