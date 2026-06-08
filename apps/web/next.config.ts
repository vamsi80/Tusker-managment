import type { NextConfig } from "next";
import path from "path";
import createBundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Force-include the Prisma query engine. Next.js does not trace it automatically
  // because Prisma resolves the engine binary at runtime (not via static import).
  // Glob is relative to this project dir (apps/web), independent of outputFileTracingRoot.
  outputFileTracingIncludes: {
    // Globs are relative to THIS file's directory (apps/web).
    // outputFileTracingRoot shifts the packaging root to the monorepo root,
    // so traced files land at /var/task/apps/web/src/generated/prisma at runtime.
    '/**': ['src/generated/prisma/**/*'],
  },
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-tabs",
      "@radix-ui/react-slot",
      "@radix-ui/react-separator",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-label",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@dnd-kit/modifiers"
    ]
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: [
    'xlsx-js-style',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
  cacheLife: {
    layout: { stale: 3600, revalidate: 86400, expire: 604800 },
    max: { stale: 3600, revalidate: 86400, expire: 604800 },
  },
  transpilePackages: ['better-auth'],
  async rewrites() {
    // In development always use the local Worker (HTTP) so browsers accept the session cookie.
    // Secure cookies from an HTTPS Worker are silently dropped by HTTP localhost.
    // In production use the configured Worker URL.
    const workerUrl =
      process.env.NODE_ENV === "production"
        ? (process.env.NEXT_PUBLIC_CF_WORKER_URL || "http://localhost:8787")
        : "http://localhost:8787";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${workerUrl}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
