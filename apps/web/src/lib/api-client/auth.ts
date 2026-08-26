import { apiFetch } from "./fetch-wrapper";
import { ApiResponse } from "./types";

export const authClient = {
    verifyInvitation: async (token: string, email: string): Promise<ApiResponse<{ valid: boolean }>> => {
        return apiFetch(`/auth/verify-invitation?token=${token}&email=${email}`);
    },
    acceptInvitation: async (values: any): Promise<ApiResponse> => {
        return apiFetch("/auth/accept-invitation", {
            method: "POST",
            body: JSON.stringify(values),
        });
    },
};
