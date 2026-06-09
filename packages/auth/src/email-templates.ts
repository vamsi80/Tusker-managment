/**
 * Shared Better Auth email templates.
 *
 * The HTML lives here so every app renders identical auth emails; the actual
 * transport (Resend on the Worker, etc.) is injected via the `sendEmail`
 * dependency passed to `createAuth`.
 */

export function resetPasswordEmail({ url }: { url: string }): string {
    return `
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
    `;
}

export function verifyEmail({ name, url }: { name: string; url: string }): string {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to Tusker Management!</h2>
            <p>Hi ${name},</p>
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
    `;
}

export function otpEmail({ otp }: { otp: string }): string {
    return `<p>Your OTP is <strong>${otp}</strong></p>`;
}
