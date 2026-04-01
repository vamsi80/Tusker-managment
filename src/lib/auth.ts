import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins"
import { admin } from "better-auth/plugins";
import prisma from "./db";
import { sendEmail } from "./email";


export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // Require email verification before login - Better Auth blocks unverified users
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true, // Automatically send verification email on signup
    autoSignInAfterVerification: true, // Auto sign-in after verification
    sendVerificationEmail: async ({ user, url, token }) => {
      // Print verification link to console for development
      console.log('\n==============================================');
      console.log('📧 EMAIL VERIFICATION LINK');
      console.log('==============================================');
      console.log('User:', user.email);
      console.log('Name:', user.name || 'N/A');
      console.log('Verification URL:', url);
      console.log('Token:', token);
      console.log('==============================================\n');

      await sendEmail({
        to: user.email,
        subject: 'Verify your email address',
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
      clientId: env.AUTH_GITHUB_CLIENT_ID!,
      clientSecret: env.AUTH_GITHUB_SECRET!,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendEmail({
          to: email,
          subject: 'Tusker Management - Verify your email',
          html: `<p>Your OTP is <strong>${otp}</strong></p>`,
        });
      }
    }),
    admin()
  ]
})

/**
 * Helper function to send workspace invitation email
 * This is called separately from the verification email to provide workspace context
 */
export async function sendWorkspaceInvitationEmail({
  email,
  name,
  workspaceId,
  role,
}: {
  email: string;
  name: string;
  workspaceId: string;
  role: string;
}) {

  const signInUrl = `${process.env.BETTER_AUTH_URL}/sign-in`;

  await sendEmail({
    to: email,
    subject: `You've been invited to join a workspace`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Workspace Invitation</h2>
        <p>Hi ${name},</p>
        <p>You've been invited to join a workspace as <strong>${role}</strong>.</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #F3F4F6; border-radius: 6px;">
          <p style="margin: 0;"><strong>Important:</strong></p>
          <ol style="margin: 10px 0; padding-left: 20px;">
            <li>First, verify your email address using the verification email you received</li>
            <li>Then, sign in to access your workspace</li>
          </ol>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${signInUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Sign In to Workspace
          </a>
        </div>
        <p style="color: #6B7280; font-size: 14px;">
          If you have any questions, please contact your workspace administrator.
        </p>
      </div>
    `,
  });
}
