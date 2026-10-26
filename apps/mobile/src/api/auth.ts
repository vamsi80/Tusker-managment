import { API_BASE, ApiError, getToken, request, setToken } from "./client";

const API_ORIGIN = new URL(API_BASE).origin;

export type SessionUser = {
    id: string;
    name: string;
    surname?: string | null;
    email: string;
    image?: string | null;
    emailVerified?: boolean;
    phoneNumber?: string | null;
};

/**
 * Better Auth endpoints, reached through the API's /api/v1/auth/* proxy. Done
 * with fetch directly (not request()) because sign-in hands the session token
 * back in the `set-auth-token` header, which a JSON-only helper would drop.
 */
async function authCall(path: string, body?: unknown, method: "GET" | "POST" = "POST") {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/v1/auth${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Origin: API_ORIGIN,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => {
        throw new ApiError("Couldn't reach Tusker. Check your connection.", 0);
    });

    const text = await res.text();
    let data: any = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = {};
    }
    if (!res.ok) {
        throw new ApiError(data?.message || data?.error || "Something went wrong. Please try again.", res.status, data?.code, data);
    }
    return { data, headers: res.headers };
}

function tokenFrom(headers: Headers, data: any): string | null {
    const header = headers.get("set-auth-token");
    if (header) return header;
    if (data?.token) return data.token;
    if (data?.session?.token) return data.session.token;
    const cookie = headers.get("set-cookie");
    const match = cookie?.match(/(?:__Secure-)?better-auth\.session_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export async function signInWithEmail(email: string, password: string): Promise<SessionUser> {
    const { data, headers } = await authCall("/sign-in/email", { email: email.trim(), password });
    const token = tokenFrom(headers, data);
    if (!token) throw new ApiError("Signed in, but no session was returned. Please try again.", 500);
    await setToken(token);
    return data.user;
}

export async function signUpWithEmail(input: { name: string; email: string; password: string }) {
    const { data } = await authCall("/sign-up/email", {
        name: input.name,
        email: input.email.trim(),
        password: input.password,
    });
    return data;
}

export async function sendVerificationOtp(email: string) {
    await authCall("/email-otp/send-verification-otp", { email: email.trim(), type: "email-verification" });
}

/** Verifies the sign-up code; Better Auth signs the user in on success. */
export async function verifyEmailOtp(email: string, otp: string) {
    const { data, headers } = await authCall("/email-otp/verify-email", { email: email.trim(), otp });
    const token = tokenFrom(headers, data);
    if (token) await setToken(token);
    return data;
}

export async function requestPasswordResetOtp(email: string) {
    await authCall("/forget-password/email-otp", { email: email.trim() });
}

export async function resetPasswordWithOtp(email: string, otp: string, password: string) {
    await authCall("/email-otp/reset-password", { email: email.trim(), otp, password });
}

export async function changePassword(currentPassword: string, newPassword: string) {
    await authCall("/change-password", { currentPassword, newPassword, revokeOtherSessions: false });
}

export async function getSession(): Promise<{ user: SessionUser } | null> {
    try {
        const { data } = await authCall("/get-session", undefined, "GET");
        return data?.user ? data : null;
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
}

export async function signOut() {
    await request("/user/push-token", { method: "DELETE" }).catch(() => {});
    await authCall("/sign-out", {}).catch(() => {});
    await setToken(null);
}

/** apps/api/src/hono/routes/auth.ts — invitation links from the invite email. */
export async function verifyInvitation(token: string, email: string) {
    return request<{ valid: boolean; message: string }>(`/auth/verify-invitation`, { query: { token, email } });
}

export async function acceptInvitation(input: {
    token: string;
    email: string;
    name: string;
    niceName?: string;
    password: string;
    confirmPassword: string;
}) {
    return request(`/auth/accept-invitation`, { method: "POST", body: input });
}
