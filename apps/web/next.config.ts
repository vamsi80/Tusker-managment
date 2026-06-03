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
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8787/api/v1/:path*",
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
