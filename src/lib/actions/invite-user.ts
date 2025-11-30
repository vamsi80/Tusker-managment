// /app/actions/invite-user.ts
"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { resend } from "@/lib/resend";

export async function inviteUserToWorkspace({
  name,
  email,
  password,
  role,
  workspaceId,
}: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
  workspaceId: string;
}) {
  try {
    // Create user account (unverified)
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!result?.user?.id) {
      throw new Error("Failed to create user");
    }

    // Send custom invitation email with workspace context
    const verificationLink = `${process.env.BETTER_AUTH_URL}/sign-in?workspaceId=${workspaceId}&role=${role}&email=${email}`;
    console.log(verificationLink);

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "You've been invited to join a workspace",
      html: `
        <p>Hi ${name},</p>
        <p>You've been invited to join a workspace with the role of <strong>${role}</strong>.</p>
        <p>Click the link below to sign in and join:</p>
        <a href="${verificationLink}">Join Workspace</a>
      `,
    });

    return { success: true, userId: result.user.id };
  } catch (error) {
    console.error("Invite user error:", error);
    throw error;
  }
}
