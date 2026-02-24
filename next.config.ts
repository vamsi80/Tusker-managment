import type { NextConfig } from "next";
import { hostname } from "os";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    cacheLife: {
      layout: {
        stale: 3600, // 1 hour
        revalidate: 86400, // 24 hours
        expire: 604800, // 1 week
      },
      max: {
        stale: 3600,
        revalidate: 86400,
        expire: 604800,
      }
    }
  },
  images: {
    remotePatterns: [{
      hostname: "lms-vamsi.t3.storage.dev",
      port: "",
      protocol: "https",
    }]
  },
};

export default nextConfig;
