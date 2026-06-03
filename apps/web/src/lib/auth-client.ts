import { createAuthClient } from "better-auth/react"
import { emailOTPClient, adminClient, phoneNumberClient } from "better-auth/client/plugins"

// After the monorepo split, Better Auth is served by the CF Worker API.
// NEXT_PUBLIC_API_URL must point to the CF Worker (e.g. https://tusker-api.workers.dev)
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787",
  fetchOptions: {
    credentials: "include", // Required for cross-origin session cookie
  },
  plugins: [
    emailOTPClient(),
    adminClient(),
    phoneNumberClient(),
  ]
})
