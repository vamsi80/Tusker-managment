import { createAuthClient } from "better-auth/react"
import { emailOTPClient, adminClient, phoneNumberClient } from "better-auth/client/plugins"

// NEXT_PUBLIC_APP_URL = http://localhost:3000 (Next.js origin, no path)
// basePath = /api/v1/auth — the full path that Next.js proxies to the Hono API worker.
// Better Auth builds:  baseURL + basePath + endpoint
// → http://localhost:3000/api/v1/auth/sign-in/email  (proxied → port 8787)
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  basePath: "/api/v1/auth",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    emailOTPClient(),
    adminClient(),
    phoneNumberClient(),
  ]
})
