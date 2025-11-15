import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins"
import { admin } from "better-auth/plugins";
import prisma from "./db";
import { resend } from "./resend";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword:{
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        const { data, error } = await resend.emails.send({
          from: 'LMS <onboarding@resend.dev>',
          to: [email],
          subject: 'Tusker LMS - Verify your email',
          html: `<p>YourOTP is <strong>${otp}</strong></p>`,
        });
      }
    }),
    admin() // Da toda la lógica de backend para un panel de administración, permitiéndote a ti centrarte únicamente en construir la interfaz de usuario (UI) que consuma estos servicios.
  ]
})