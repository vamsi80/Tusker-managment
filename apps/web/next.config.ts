import type { NextConfig } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
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
    '@aws-sdk/s3-request-presigner'
  ],
  cacheLife: {
    layout: { stale: 3600, revalidate: 86400, expire: 604800 },
    max: { stale: 3600, revalidate: 86400, expire: 604800 },
  },
  transpilePackages: ['better-auth'],
  async rewrites() {
    // In production set NEXT_PUBLIC_CF_WORKER_URL=https://tusker-api.your-subdomain.workers.dev
    const workerUrl = process.env.NEXT_PUBLIC_CF_WORKER_URL || "http://localhost:8787";
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
