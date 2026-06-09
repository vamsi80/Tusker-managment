import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, admin, phoneNumber, bearer } from "better-auth/plugins";
import type { PrismaClient } from "@tusker/db";
import { resetPasswordEmail, verifyEmail, otpEmail } from "./email-templates";

/**
 * Runtime-agnostic dependencies for the single, canonical Better Auth server.
 *
 * Everything that differs per runtime (DB client, secret/URLs, OAuth creds,
 * email/SMS transport, audit hook) is injected so the SAME config can run on
 * the Cloudflare Worker today and anywhere else tomorrow. This is the only
 * place `betterAuth()` is constructed — keeping cookie/session/plugin config
 * in lock-step across the system.
 */
export interface CreateAuthDeps {
    /** Prisma client for the auth datasource (pg/Hyperdrive on the Worker). */
    db: PrismaClient;
    /** Shared secret used to sign sessions/cookies. MUST be identical everywhere a session is validated. */
    secret: string;
    /** Public origin of the auth server (the Worker), e.g. https://tusker-api.workers.dev */
    baseURL: string;
    /** Mount path for the Better Auth handler. Defaults to the Worker's /api/v1/auth. */
    basePath?: string;
    /** Origins allowed to make credentialed auth requests (web app origin + extras). */
    trustedOrigins: string[];
    /** OAuth provider credentials. Pass only the providers you use. */
    socialProviders?: {
        github?: { clientId: string; clientSecret: string };
        google?: { clientId: string; clientSecret: string };
    };
    /** Transactional email transport (Resend on the Worker). */
    sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<unknown> | unknown;
    /** Optional SMS transport for phone-number OTP. No-op if omitted. */
    sendSms?: (opts: { phoneNumber: string; code: string }) => Promise<unknown> | unknown;
    /** Optional side-effect after a session is created (e.g. audit log). */
    onSessionCreate?: (session: {
        userId: string;
        ipAddress?: string | null;
        userAgent?: string | null;
    }) => Promise<void> | void;
}

export function createAuth(deps: CreateAuthDeps) {
    const {
        db,
        secret,
        baseURL,
        basePath = "/api/v1/auth",
        trustedOrigins,
        socialProviders,
        sendEmail,
        sendSms,
        onSessionCreate,
    } = deps;

    return betterAuth({
        baseURL,
        basePath,
        secret,
        trustedOrigins,
        database: prismaAdapter(db, {
            provider: "postgresql",
        }),
        session: {
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
            cookieCache: {
                // Session verified from the signed cookie — no DB hit for 5 min.
                enabled: true,
                maxAge: 5 * 60,
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
                await sendEmail({
                    to: user.email,
                    subject: "Reset your password",
                    html: resetPasswordEmail({ url }),
                });
            },
        },
        emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string }; url: string }) => {
                await sendEmail({
                    to: user.email,
                    subject: "Verify your email address",
                    html: verifyEmail({ name: user.name || user.email, url }),
                });
            },
        },
        socialProviders: socialProviders ?? {},
        plugins: [
            emailOTP({
                async sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
                    await sendEmail({
                        to: email,
                        subject: "Tusker Management - Verify your email",
                        html: otpEmail({ otp }),
                    });
                },
            }),
            phoneNumber({
                signUpOnVerification: {
                    getTempEmail: (ph: string) => `${ph.replace("+", "")}@tusker.temp`,
                    getTempName: (ph: string) => `User ${ph}`,
                },
                async sendOTP({ phoneNumber: ph, code }: { phoneNumber: string; code: string }) {
                    await sendSms?.({ phoneNumber: ph, code });
                },
            }),
            admin(),
            // Honor `Authorization: Bearer <session-token>` in addition to cookies.
            // Required for cross-domain server-side reads (web RSC -> Worker).
            bearer(),
        ],
        databaseHooks: onSessionCreate
            ? {
                  session: {
                      create: {
                          after: async (session: { userId: string; ipAddress?: string | null; userAgent?: string | null }) => {
                              await onSessionCreate({
                                  userId: session.userId,
                                  ipAddress: session.ipAddress,
                                  userAgent: session.userAgent,
                              });
                          },
                      },
                  },
              }
            : undefined,
    });
}

export type Auth = ReturnType<typeof createAuth>;
