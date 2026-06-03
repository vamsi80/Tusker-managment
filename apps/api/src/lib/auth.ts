import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, admin, phoneNumber } from "better-auth/plugins";
import { createEmailClient, sendEmailWith } from "./email";
import type { Env } from "../types";
import type { DbClient } from "./db";

// Accept the shared DB client from registry to avoid creating a second pg.Pool
export function createAuth(env: Env, db: DbClient) {
    const resend = createEmailClient(env.RESEND_API_KEY);

    const sendEmail = (opts: { to: string; subject: string; html: string }) =>
        sendEmailWith(resend, env.RESEND_FROM_EMAIL, opts);

    return betterAuth({
        baseURL: env.BETTER_AUTH_URL,
        basePath: "/api/v1/auth",
        secret: env.BETTER_AUTH_SECRET,
        trustedOrigins: [env.APP_URL, "http://localhost:3000"],
        database: prismaAdapter(db, {
            provider: "postgresql",
        }),
        session: {
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
            cookieCache: {
                enabled: true,   // session verified from signed cookie — no DB hit for 5 min
                maxAge: 5 * 60,
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
            sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
                console.log(`[Auth] Password reset for: ${user.email}`);
                await sendEmail({
                    to: user.email,
                    subject: "Reset your password",
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2>Reset Your Password</h2>
                            <p>Hi,</p>
                            <p>You requested to reset your password for Tusker Management. Click the button below to proceed:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${url}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                    Reset Password
                                </a>
                            </div>
                            <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
                                If you didn't request this, you can safely ignore this email.
                            </p>
                        </div>
                    `,
                });
            },
        },
        emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }: { user: any; url: string; token: string }) => {
                await sendEmail({
                    to: user.email,
                    subject: "Verify your email address",
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2>Welcome to Tusker Management!</h2>
                            <p>Hi ${user.name || user.email},</p>
                            <p>Please verify your email address by clicking the button below:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${url}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                    Verify Email Address
                                </a>
                            </div>
                            <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
                                If you didn't create this account, you can safely ignore this email.
                            </p>
                        </div>
                    `,
                });
            },
        },
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
        plugins: [
            emailOTP({
                async sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
                    console.log(`[Auth] OTP for ${email}: ${otp}`);
                    await sendEmail({
                        to: email,
                        subject: "Tusker Management - Verify your email",
                        html: `<p>Your OTP is <strong>${otp}</strong></p>`,
                    });
                },
            }),
            phoneNumber({
                signUpOnVerification: {
                    getTempEmail: (ph: string) => `${ph.replace("+", "")}@tusker.temp`,
                    getTempName: (ph: string) => `User ${ph}`,
                },
                async sendOTP({ phoneNumber: ph, code }: { phoneNumber: string; code: string }) {
                    console.log(`[Auth] Phone OTP for ${ph}: ${code}`);
                },
            }),
            admin(),
        ],
        databaseHooks: {
            session: {
                create: {
                    after: async (session: any) => {
                        const { recordActivity } = await import("./audit");
                        await recordActivity(db, {
                            userId: session.userId,
                            action: "USER_LOGIN",
                            ipAddress: session.ipAddress ?? undefined,
                            userAgent: session.userAgent ?? undefined,
                        });
                    },
                },
            },
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
