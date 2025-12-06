import { NextRequest, NextResponse } from "next/server";
import { betterFetch } from "@better-fetch/fetch";

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
  const { data: session } = await betterFetch<SessionData>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    }
  );

  // If no session, redirect to sign-in
  if (!session) {
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
    pathname.startsWith("/w/") ||
    pathname.startsWith("/workspace")
  ) {
    return authMiddleware(request);
  }

  // Allow all other routes
  return NextResponse.next();
}
