import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../apps/api/src/generated/prisma/wasm";

async function main() {
  const connectionString = "postgresql://postgres:rplZt8LNZjEhCgSi@db.huruairekknyibistusz.supabase.co:5432/postgres";
  console.log(`Testing Client connection string: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const adapter = new PrismaPg(client);
  const prisma = new PrismaClient({ adapter });

  try {
    const count = await prisma.user.count();
    console.log("✅ PrismaClient + pg.Client connection succeeded!");
    console.log(`User count: ${count}`);
  } catch (err: any) {
    console.error("❌ PrismaClient + pg.Client connection failed!");
    console.error(err);
  } finally {
    await prisma.$disconnect();
    await client.end();
  }
}

main().catch(console.error);
