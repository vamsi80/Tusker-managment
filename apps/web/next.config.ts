import type { NextConfig } from "next";
import path from "path";
import dotenv from "dotenv";

// The monorepo keeps a single .env at the repo root, shared by every app and
// package. Next only looks inside this app's directory, so point it upward.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,  // Cache dynamic pages on client for 30 seconds
      static: 180,  // Cache static pages on client for 3 minutes
    },
    optimizePackageImports: [
      "@tabler/icons-react",
      "lucide-react",
      "date-fns",
      "recharts",
      "framer-motion",
      "@radix-ui/react-icons",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-tabs",
      "@radix-ui/react-slot",
      "@radix-ui/react-separator",
      "@radix-ui/react-avatar",
      "@radix-ui/react-badge",
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
  // Workspace packages live above this app, so the file tracer needs the
  // monorepo root to follow them into the deployed function.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),

  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    'xlsx-js-style',
    'nodemailer',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner'
  ],

  cacheLife: {
    layout: {
      stale: 3600,
      revalidate: 86400,
      expire: 604800,
    },
    max: {
      stale: 3600,
      revalidate: 86400,
      expire: 604800,
    }
  },
  images: {
    remotePatterns: [{
      hostname: "lms-vamsi.t3.storage.dev",
      port: "",
      protocol: "https",
    }]
  },
  // 'api' is apps/api, mounted at src/app/api/v1/[[...route]]/route.ts. Like the
  // @tusker/* packages it ships raw TypeScript, so Next has to transpile it.
  transpilePackages: ['better-auth', '@tusker/db', '@tusker/core', '@tusker/api-client', 'api'],
};

export default withBundleAnalyzer(nextConfig);
