import { Hono } from "hono";
import { inviteUserSchema, acceptInvitationSchema } from "@tusker/core/lib/zodSchemas";
import { WorkspaceService } from "@tusker/core/server/services/workspace.service";
import { AppError } from "@tusker/core/lib/errors/app-error";
import { HonoVariables } from "../types";
import { auth as betterAuth } from "@tusker/core/lib/auth";
import prisma from "@tusker/db";

const auth = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/v1/auth/verify-invitation
 * Verify if a token satisfies the invitation requirement
 */
auth.get("/verify-invitation", async (c) => {
    const token = c.req.query("token");
    const email = c.req.query("email");

    if (!token || !email) {
        return c.json({ success: false, valid: false, message: "Missing token or email" }, 400);
    }

    const isValid = await WorkspaceService.verifyInvitationToken(token, email);
    
    return c.json({ 
        status: isValid ? "success" : "error",
        valid: isValid,
        message: isValid ? "Token is valid" : "Token is invalid or expired"
    });
});

/**
 * POST /api/v1/auth/accept-invitation
 * Finalize account creation by setting a password
 */
auth.post("/accept-invitation", async (c) => {
    const body = await c.req.json();
    const parsed = acceptInvitationSchema.safeParse(body);

    if (!parsed.success) {
        return c.json({ 
            status: "error",
            message: "Invalid input data", 
            details: parsed.error.format() 
        }, 400);
    }

    try {
        const result = await WorkspaceService.acceptInvitation(parsed.data);
        return c.json({
            status: "success",
            message: "Account activated successfully. You can now log in.",
            data: result
        });
    } catch (err: any) {
        console.error("[Hono.Auth.AcceptInvitation] Error:", err);
        return c.json({
            status: "error",
            message: err.message || "Failed to accept invitation"
        }, 500);
    }
});

/**
 * Better Auth fallback.
 *
 * Registered last so the explicit invitation routes above still win. Serving
 * Better Auth here lets native clients use one origin for auth and data; the
 * web app keeps serving it at /api/auth/* against the same secret and
 * database, so either origin issues an equivalent session.
 *
 * Better Auth resolves routes against its own basePath (/api/auth), while this
 * API is mounted under /api/v1, so the path is rewritten before handing over.
 */
auth.all("/*", async (c) => {
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.replace("/api/v1/auth", "/api/auth");

    const res = await betterAuth.handler(new Request(url, c.req.raw));

    // The mobile UI renders user.surname, which Better Auth does not return.
    const isSessionShaped = url.pathname.includes("/get-session") || url.pathname.includes("/sign-in");
    if (isSessionShaped && res.status === 200) {
        try {
            const data: any = await res.clone().json();
            if (data?.user?.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: data.user.id },
                    select: { surname: true },
                });
                if (dbUser?.surname) {
                    data.user.surname = dbUser.surname;
                    data.user.name = dbUser.surname;
                }
                // Forward Better Auth's headers — set-auth-token in particular,
                // which is how a native client receives its bearer token. Skip
                // the ones that describe the original body: it is re-serialized
                // here with surname added, so a copied content-length is short
                // and truncates the JSON the client tries to parse.
                const headers: Record<string, string> = {};
                res.headers.forEach((value, key) => {
                    const k = key.toLowerCase();
                    if (k === "content-length" || k === "content-encoding") return;
                    headers[key] = value;
                });
                return c.json(data, 200, headers);
            }
        } catch (e) {
            console.error("[AUTH INTERCEPT] Failed to enrich auth response:", e);
        }
    }
    return res;
});

export default auth;
