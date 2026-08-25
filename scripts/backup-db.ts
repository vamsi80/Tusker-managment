








































/**
 * Full data backup of the public schema, table by table, to JSON.
 *
 *   npx tsx scripts/backup-db.ts [outputDir]
 *
 * Tables are read from information_schema rather than the Prisma schema, so
 * anything the app does not model (_prisma_migrations included) is still saved.
 * The DDL is not dumped - prisma/migrations already carries it.
 *
 * ponytail: reads each table whole; swap in a server-side cursor if one ever
 * outgrows memory.
 */
import { Client } from "pg";
import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

dotenv.config();

// Session mode (5432), not the transaction pooler - long reads sit better here.
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

/** Postgres types JSON has no answer for. Numerics already arrive as strings. */
const replacer = (_key: string, value: unknown) => {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return { __type: "Buffer", base64: value.toString("base64") };
  return value;
};

async function backup() {
  if (!connectionString) {
    console.error("DIRECT_URL / DATABASE_URL missing");
    process.exit(1);
  }

  const startedAt = new Date();
  const outDir =
    process.argv[2] ??
    join("backups", startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z");
  mkdirSync(outDir, { recursive: true });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: version } = await client.query<{ version: string }>("SELECT version()");
  const { rows: tables } = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );

  console.log(`${version[0].version.split(",")[0]}`);
  console.log(`${tables.length} tables -> ${outDir}\n`);

  const counts: Record<string, number> = {};
  let total = 0;

  for (const { table_name: table } of tables) {
    const { rows } = await client.query(`SELECT * FROM "${table}"`);
    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, replacer), "utf-8");
    counts[table] = rows.length;
    total += rows.length;
    console.log(`  ${table.padEnd(32)} ${String(rows.length).padStart(7)} rows`);
  }

  writeFileSync(
    join(outDir, "_manifest.json"),
    JSON.stringify(
      {
        takenAt: startedAt.toISOString(),
        host: new URL(connectionString).hostname,
        database: new URL(connectionString).pathname.replace("/", ""),
        serverVersion: version[0].version,
        totalRows: total,
        tables: counts,
      },
      null,
      2
    ),
    "utf-8"
  );

  await client.end();
  console.log(`\n${total} rows in ${tables.length} tables. Manifest: ${join(outDir, "_manifest.json")}`);
}

backup().catch((error) => {
  console.error(error);
  process.exit(1);
});
