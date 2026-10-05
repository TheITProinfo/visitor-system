import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const migrationName = "20261004230000_admin_delivery_settings";
const migrationUrl = new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url);
const migrationSql = await readFile(migrationUrl, "utf8");
const checksum = createHash("sha256").update(migrationSql).digest("hex");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });

await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["visitor-system-schema-migrations"]);

  const existing = await client.query(
    'SELECT checksum FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL',
    [migrationName],
  );
  if (existing.rowCount) {
    if (existing.rows[0].checksum !== checksum) throw new Error("The database has a different checksum for this migration.");
    await client.query("COMMIT");
    process.stdout.write("Settings migration is already applied.\n");
  } else {
    await client.query(migrationSql);
    await client.query(
      'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, NOW(), $3, 1)',
      [randomUUID(), checksum, migrationName],
    );
    await client.query("COMMIT");
    process.stdout.write("Settings migration applied successfully.\n");
  }

  const expectedColumns = ["agreementText", "smtpHost", "smtpPasswordEncrypted", "printerEnabled", "badgeLabelWidthMm"];
  const columns = await client.query(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2::text[])',
    ["CompanySettings", expectedColumns],
  );
  const actualColumns = new Set(columns.rows.map((row) => row.column_name));
  const missingColumns = expectedColumns.filter((column) => !actualColumns.has(column));
  if (missingColumns.length) throw new Error(`Settings migration verification failed: ${missingColumns.join(", ")}`);
  process.stdout.write("Verified agreement, SMTP, and badge settings columns in PostgreSQL.\n");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
