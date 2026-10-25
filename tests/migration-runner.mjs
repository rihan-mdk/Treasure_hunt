import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

export async function createDisposableDatabase() {
  const db = new PGlite({
    extensions: {
      pgcrypto,
    },
  });

  // Ensure extensions schema exists for standard Supabase extension layout
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END
    $$;
  `);

  return db;
}

async function testApplyMigration() {
  console.log("1. Initializing disposable local PostgreSQL instance...");
  const db = await createDisposableDatabase();

  const vRes = await db.query("SELECT version();");
  console.log("   PG Version:", vRes.rows[0].version);

  console.log("2. Reading migration SQL...");
  const migrationPath = path.resolve("supabase/migrations/20261025000000_phase1_core.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("3. Applying migration...");
  await db.exec(sql);
  console.log("   Migration applied successfully!");

  // Verify tables
  const tablesRes = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log("   Tables created:", tablesRes.rows.map(r => r.table_name));

  return db;
}

if (process.argv[1]?.endsWith("migration-runner.mjs")) {
  testApplyMigration()
    .then(() => {
      console.log("Migration test complete!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration test failed with error:", err);
      process.exit(1);
    });
}
