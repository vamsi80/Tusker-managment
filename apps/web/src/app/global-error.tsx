"use client";

import "./globals.css";

/**
 * Without this, any uncaught client error renders Next's bare "Application
 * error: a client-side exception has occurred", which tells the user nothing
 * and leaves no way to report what broke. Show the digest so it can be quoted.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {error.digest}
            </code>
          )}
          <button
            onClick={reset}
            className="mt-2 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
