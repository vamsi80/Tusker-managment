import { createAuthClient } from "better-auth/react"
import { emailOTPClient, adminClient, phoneNumberClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [
    emailOTPClient(),
    adminClient(),
    phoneNumberClient(),
  ]
})
