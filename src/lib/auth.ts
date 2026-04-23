import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env";
import { emailOTP, admin, phoneNumber } from "better-auth/plugins"
import prisma from "./db";
import { sendEmail } from "./email";
import path from "path";
import fs from "fs";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
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
        // For development, log the OTP to the console
        console.log('\n==============================================');
        console.log('📧 EMAIL OTP');
        console.log('==============================================');
        console.log('Email:', email);
        console.log('OTP:', otp);
        console.log('==============================================\n');

        await sendEmail({
          to: email,
          subject: 'Tusker Management - Verify your email',
          html: `<p>Your OTP is <strong>${otp}</strong></p>`,
        });
      }
    }),
    phoneNumber({
      signUpOnVerification: {
        getTempEmail: (phoneNumber: string) => `${phoneNumber.replace("+", "")}@tusker.temp`,
        getTempName: (phoneNumber: string) => `User ${phoneNumber}`,
      },
      async sendOTP({ phoneNumber, code }, request) {
        // For development, log the OTP to the console
        console.log('\n==============================================');
        console.log('📱 PHONE OTP');
        console.log('==============================================');
        console.log('Phone:', phoneNumber);
        console.log('OTP:', code);
        console.log('==============================================\n');

        // In production, you would use an SMS service like Twilio here
      },
    }),
    admin(),
  ],
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          // We import recordActivity inside the hook to avoid circular dependency
          const { recordActivity } = await import("./audit");

          await recordActivity({
            userId: session.userId,
            action: "USER_LOGIN",
            ipAddress: session.ipAddress ?? undefined,
            userAgent: session.userAgent ?? undefined,
          });
        }
      }
    }
  }
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
  token,
}: {
  email: string;
  name: string;
  workspaceId: string;
  role: string;
  token: string;
}) {

  const appUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const invitationUrl = `${appUrl}/accept-invitation?token=${token}&email=${encodeURIComponent(email)}`;

  await sendEmail({
    to: email,
    subject: `You've been invited to join a workspace`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e293b; margin-top: 0;">Welcome to the Team!</h2>
          <p>Hi <strong>${name}</strong>,</p>
          <p>You've been invited to join our workspace as a <strong>${role}</strong>. We're excited to have you on board!</p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />

          <h3 style="color: #1e293b; text-align: center;">Getting Started in 3 Simple Steps</h3>
          
          <!-- Step 1 -->
          <div style="margin-bottom: 32px; text-align: center;">
            <div style="background-color: #ef4444; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-block; line-height: 24px; margin-bottom: 8px;">1</div>
            <p style="margin-top: 0; font-weight: bold; color: #1e293b;">Set Your Password</p>
            <p style="font-size: 14px; color: #64748b; margin-bottom: 12px;">First, define a secure password to activate your account and join the workspace.</p>
            <img src="cid:step1" alt="Step 1: Set Password" width="500" style="width: 100%; max-width: 500px; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" />
          </div>

          <!-- Step 2 -->
          <div style="margin-bottom: 32px; text-align: center;">
            <div style="background-color: #ef4444; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-block; line-height: 24px; margin-bottom: 8px;">2</div>
            <p style="margin-top: 0; font-weight: bold; color: #1e293b;">Sign In to Your Account</p>
            <p style="font-size: 14px; color: #64748b; margin-bottom: 12px;">Once your password is set, you'll be redirected to the sign-in page to access your new account.</p>
            <img src="cid:step2" alt="Step 2: Sign In" width="500" style="width: 100%; max-width: 500px; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" />
          </div>

          <!-- Step 3 -->
          <div style="margin-bottom: 32px; text-align: center;">
            <div style="background-color: #ef4444; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-block; line-height: 24px; margin-bottom: 8px;">3</div>
            <p style="margin-top: 0; font-weight: bold; color: #1e293b;">Explore Your Workspace</p>
            <p style="font-size: 14px; color: #64748b; margin-bottom: 12px;">You'll land on our dashboard where you can navigate through projects, tasks, and team management.</p>
            <img src="cid:step3" alt="Step 3: Workspace Dashboard" width="500" style="width: 100%; max-width: 500px; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" />
          </div>

          <div style="text-align: center; margin: 40px 0;">
            <p style="font-size: 14px; color: #1e293b; margin-bottom: 16px; font-weight: 500;">Ready to begin?</p>
            <a href="${invitationUrl}" style="background-color: #8b0000; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
              Accept Invitation & Set Password
            </a>
          </div>

          <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
            If you have any questions, please contact your workspace administrator or reply to this email.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'paswordReset.png',
        path: path.join(process.cwd(), 'public', 'images', 'paswordReset.png'),
        cid: 'step1'
      },
      {
        filename: 'sign-in.png',
        path: path.join(process.cwd(), 'public', 'images', 'sign-in.png'),
        cid: 'step2'
      },
      {
        filename: 'landing.png',
        path: path.join(process.cwd(), 'public', 'images', 'landing.png'),
        cid: 'step3'
      }
    ]
  });
}
