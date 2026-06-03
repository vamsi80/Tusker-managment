import { Resend } from "resend";

interface EmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
}

export function createEmailClient(apiKey: string): Resend {
    return new Resend(apiKey);
}

export async function sendEmailWith(
    resend: Resend,
    fromAddress: string,
    { to, subject, html, from }: EmailOptions
) {
    try {
        const { data, error } = await resend.emails.send({
            from: from || `Tusker Management <${fromAddress}>`,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
        });

        if (error) {
            console.error("Resend error:", error);
            return { success: false, error: error.message };
        }

        return { success: true, messageId: data?.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send email";
        console.error("Email send error:", err);
        return { success: false, error: message };
    }
}
