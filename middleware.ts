import { NextRequest, NextResponse } from "next/server";

type SessionData = {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
  };
} | null;

export async function authMiddleware(request: NextRequest) {
  let session: SessionData = null;
  let retries = 3;

  // Retry session fetch with exponential backoff
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Make HTTP request to get session (Edge Runtime compatible)
      const response = await fetch(
        new URL("/api/auth/get-session", request.nextUrl.origin),
        {
          headers: {
            cookie: request.headers.get("cookie") || "",
          },
        }
      );

      if (response.ok) {
        session = await response.json();
      }
      break; // Success, exit retry loop
    } catch (error) {
      console.error(`[authMiddleware] Session fetch attempt ${attempt + 1} failed`, {
        error: error instanceof Error ? error.message : String(error),
        url: request.nextUrl.pathname,
        attempt: attempt + 1,
        maxRetries: retries
      });

      if (attempt < retries - 1) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // All retries failed, log and redirect
        console.error('[authMiddleware] All session fetch attempts failed, redirecting to sign-in', {
          url: request.nextUrl.pathname,
          timestamp: new Date().toISOString()
        });
        return NextResponse.redirect(new URL("/sign-in?error=session-timeout", request.url));
      }
    }
  }

  // If no session after retries, redirect to sign-in
  if (!session) {
    console.warn('[authMiddleware] No session found after retries', {
      url: request.nextUrl.pathname
    });
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Check if email is verified
  if (!session.user.emailVerified) {
    // Allow access to verification-related pages
    if (
      request.nextUrl.pathname.startsWith("/verify-email") ||
      request.nextUrl.pathname.startsWith("/api/auth")
    ) {
      return NextResponse.next();
    }

    // Redirect unverified users to verification pending page
    return NextResponse.redirect(
      new URL("/verify-email?error=email-not-verified", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  // Exclude public routes from middleware
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|sign-in|sign-up|$).*)"
  ]
};

// Default middleware
export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = [
    "/",           // Landing page
    "/sign-in",    // Sign in page
    "/sign-up",    // Sign up page
    "/verify-email", // Email verification page
  ];

  // Check if current path is a public route
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Protect workspace and admin routes - require authentication and email verification
  if (
    pathname.startsWith("/w/")
  ) {
    return authMiddleware(request);
  }

  // Allow all other routes
  return NextResponse.next();
}
