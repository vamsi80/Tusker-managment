import { createAuth as createTuskerAuth } from "@tusker/auth/server";
import { createEmailClient, sendEmailWith } from "./email";
import type { Env } from "../types";
import type { DbClient } from "./db";

/**
 * Worker-side adapter for the shared Better Auth config.
 *
 * The canonical config lives in `@tusker/auth/server`; here we inject the
 * Worker's runtime dependencies: the request-scoped Prisma client (pg/Hyperdrive),
 * Resend email transport, OAuth credentials from the env, and the audit hook.
 * Accepts the shared DB client from the registry to avoid a second pg.Pool.
 */
export function createAuth(env: Env, db: DbClient) {
    const resend = createEmailClient(env.RESEND_API_KEY);

    const sendEmail = (opts: { to: string; subject: string; html: string }) =>
        sendEmailWith(resend, env.RESEND_FROM_EMAIL, opts);

    return createTuskerAuth({
        db,
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        basePath: "/api/v1/auth",
        trustedOrigins: [
            env.APP_URL,
            ...(env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim()) : []),
        ],
        socialProviders: {
            github: {
                clientId: env.AUTH_GITHUB_CLIENT_ID,
                clientSecret: env.AUTH_GITHUB_SECRET,
            },
            google: {
                clientId: env.GOOGLE_CLIENT_ID,
                clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
        },
        sendEmail,
        onSessionCreate: async (session) => {
            const { recordActivity } = await import("./audit");
            await recordActivity(db, {
                userId: session.userId,
                action: "USER_LOGIN",
                ipAddress: session.ipAddress ?? undefined,
                userAgent: session.userAgent ?? undefined,
            });
        },
    });
}

export async function sendWorkspaceInvitationEmail({
    email, name, workspaceId, role, token,
}: {
    email: string;
    name: string;
    workspaceId: string;
    role: string;
    token: string;
}) {
    // Uses registry singletons — only works after initServices() has been called
    const { getResend, getEnv } = await import("./registry");
    const resend = getResend();
    const env = getEnv();
    if (!resend) {
        console.warn("[sendWorkspaceInvitationEmail] Resend not configured");
        return;
    }
    const appUrl = env.APP_URL || "http://localhost:3000";
    const fromAddress = env.RESEND_FROM_EMAIL || "noreply@example.com";
    const invitationUrl = `${appUrl}/accept-invitation?token=${token}&email=${encodeURIComponent(email)}`;

    await sendEmailWith(resend, fromAddress, {
        to: email,
        subject: `You've been invited to join a workspace`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <h2 style="color: #1e293b; margin-top: 0;">Welcome to the Team!</h2>
                    <p>Hi <strong>${name}</strong>,</p>
                    <p>You've been invited to join our workspace as a <strong>${role}</strong>. We're excited to have you on board!</p>
                    <div style="text-align: center; margin: 40px 0;">
                        <p style="font-size: 14px; color: #1e293b; margin-bottom: 16px; font-weight: 500;">Ready to begin?</p>
                        <a href="${invitationUrl}" style="background-color: #8b0000; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                            Accept Invitation &amp; Set Password
                        </a>
                    </div>
                    <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                        If you have any questions, please contact your workspace administrator.
                    </p>
                </div>
            </div>
        `,
    });
}
