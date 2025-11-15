'use clint'

import { toast } from "sonner";
import { authClient } from "@/lib/auth-clint";
import { useRouter } from "next/navigation";

export function useSignout() {

    const router = useRouter();
    const handleSignOut = async function signOut() {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push("/");
                    toast.success("Signed out successfully");
                },
                onError: () => {
                    toast.error("Sign out failed: ");
                },
            },
        });
    }
    return handleSignOut ;
}