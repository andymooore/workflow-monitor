#!/usr/bin/env node
/**
 * Production migration runner - uses pg directly (no prisma CLI needed).
 * Reads all migration.sql files and applies them in order.
 * Tracks applied migrations in a _prisma_migrations table.
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to database");

  // Create _prisma_migrations table if not exists (Prisma-compatible)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Get already applied migrations
  const { rows: applied } = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliedSet = new Set(applied.map((r) => r.migration_name));

  // Read migration directories
  const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
  const dirs = fs
    .readdirSync(migrationsDir)
    .filter((d) => {
      const p = path.join(migrationsDir, d, "migration.sql");
      return fs.existsSync(p);
    })
    .sort();

  let count = 0;
  for (const dir of dirs) {
    if (appliedSet.has(dir)) {
      console.log(`  skip: ${dir} (already applied)`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, dir, "migration.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();

    console.log(`  apply: ${dir}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, NOW(), $3, 1)`,
        [id, checksum, dir]
      );
      await client.query("COMMIT");
      count++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FAILED: ${dir}`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log(`Done. Applied ${count} migration(s).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
