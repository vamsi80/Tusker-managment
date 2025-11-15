// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Auth guard used for /admin routes.
 * Returns a redirect to "/" if no session cookie is present.
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse> {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // Redirect to home if not authenticated
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

/**
 * Next.js middleware entrypoint (no Arcjet).
 * Only enforces authentication for routes beginning with /admin.
 */
export function middleware(request: NextRequest) {
  // Protect only /admin and subpaths
  if (request.nextUrl.pathname.startsWith("/admin")) {
    // authMiddleware is async; we can return the Promise directly
    return authMiddleware(request);
  }

  // Allow all other routes to pass through
  return NextResponse.next();
}

/**
 * Optional: limit the middleware to only run for /admin routes.
 * This prevents it from running for every request (recommended).
 */
export const config = {
  matcher: ["/admin/:path*"],
};

/**
 * If you deploy to the Edge runtime, uncomment the next line:
 */
// export const runtime = "edge";
