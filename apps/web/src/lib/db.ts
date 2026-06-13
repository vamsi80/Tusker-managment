import { PrismaClient } from "@/generated/prisma";
import path from "path";
import fs from "fs";

// Dynamically point Prisma to the traced query engine binary in production.
// This solves engine lookup issues caused by custom generator output paths in monorepos.
// Only override on Linux (the deployment target) — on other platforms (e.g. Windows dev
// builds) this would force the rhel `.so.node` engine, which cannot load and throws
// PrismaClientInitializationError. There, let Prisma auto-detect the `native` engine.
if (process.env.NODE_ENV === "production" && process.platform === "linux") {
  const possiblePaths = [
    path.join(process.cwd(), "packages/db/src/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node"),
    path.join(process.cwd(), "../../packages/db/src/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node"),
    path.join(process.cwd(), "src/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = p;
      break;
    }
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { level: "error", emit: "stdout" },
            { level: "warn", emit: "stdout" },
          ]
        : [{ level: "error", emit: "stdout" }],
  });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

