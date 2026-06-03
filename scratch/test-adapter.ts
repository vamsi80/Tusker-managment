import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../apps/api/src/generated/prisma";
import * as fs from "fs";
import * as dotenv from "dotenv";

async function main() {
  const connectionString = "postgres://postgres.huruairekknyibistusz:rplZt8LNZjEhCgSi@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";
  console.log(`Testing connection string: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    max: 5,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const userCount = await prisma.user.count();
    console.log(`✅ PrismaPg adapter connection succeeded!`);
    console.log(`User count: ${userCount}`);
  } catch (err: any) {
    console.error("❌ PrismaPg connection failed!");
    console.error(err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
