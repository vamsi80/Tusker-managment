import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma || new PrismaClient({
    // Disable prepared statements to fix "prepared statement does not exist" errors
    // This is required when using connection poolers like PgBouncer or Supabase Pooler
    datasourceUrl: process.env.DATABASE_URL,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma