import { Hono } from "hono";
import { inviteUserSchema, acceptInvitationSchema } from "@/lib/zodSchemas";
import { WorkspaceService } from "@/server/services/workspace.service";
import { AppError } from "@/lib/errors/app-error";
import { HonoVariables } from "../types";

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

export default auth;
