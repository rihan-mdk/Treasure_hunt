/**
 * ============================================================================
 * THE HUNT EXPEDITION — AUTHORIZED STAGING QA PROVISIONING RUNNER
 * Target Project Ref: uguvotvttdtclnhbsywr (Staging Only)
 * Forbidden Ref: kcupmzqnyitkchkmftcl (Production — Strictly Off-Limits)
 * ============================================================================
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  AUTHORIZED_STAGING_REF,
  FORBIDDEN_PRODUCTION_REF,
  validateTargetReference,
  validateConnectionParams,
  verifyConnectionIdentity,
  generateFixtureCredentials,
  exportCredentialsSecurely,
  provisionQAFixtures,
  formatRedactedSummary,
} from "./provision-staging-qa-fixtures.mjs";

const EXPECTED_SCRIPT_HASH = "7EEF4F9C2300E34A3D6F0E67F210CFC6B513F32EB386E057537F14B4E90C1300";
const EXPECTED_TESTS_HASH = "F6F19266503ADF2975771FB717FF120479375305DAF4672916CCEFC3BA1EC4EE";
const CREDENTIALS_EXPORT_PATH = "C:\\Users\\Muhammed Rihan MR\\the-hunt-staging-creds\\staging-qa-identities.json";

function getFileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

async function main() {
  console.log("================================================================================");
  console.log(" THE HUNT EXPEDITION — STAGING QA PROVISIONING EXECUTION");
  console.log(" Target: uguvotvttdtclnhbsywr (Staging Only)");
  console.log("================================================================================");

  // 1. Verify approved files before execution
  console.log("1. Verifying approved file hashes...");
  const scriptPath = path.resolve("scripts/provision-staging-qa-fixtures.mjs");
  const testsPath = path.resolve("tests/provision-qa-fixtures.test.mjs");

  const actualScriptHash = getFileSha256(scriptPath);
  const actualTestsHash = getFileSha256(testsPath);

  if (actualScriptHash !== EXPECTED_SCRIPT_HASH) {
    throw new Error(
      `HASH_MISMATCH: scripts/provision-staging-qa-fixtures.mjs expected ${EXPECTED_SCRIPT_HASH}, found ${actualScriptHash}. Execution aborted.`
    );
  }
  if (actualTestsHash !== EXPECTED_TESTS_HASH) {
    throw new Error(
      `HASH_MISMATCH: tests/provision-qa-fixtures.test.mjs expected ${EXPECTED_TESTS_HASH}, found ${actualTestsHash}. Execution aborted.`
    );
  }
  console.log("   ✔ File hashes match approved baseline exactly.");

  // 2. Verify target credential export directory
  console.log("2. Verifying credential destination path...");
  const credsDir = path.dirname(CREDENTIALS_EXPORT_PATH);
  if (!fs.existsSync(credsDir)) {
    throw new Error(
      `DESTINATION_ERROR: Credential directory '${credsDir}' does not exist. Please create it before running.`
    );
  }
  if (fs.existsSync(CREDENTIALS_EXPORT_PATH)) {
    throw new Error(
      `DESTINATION_ERROR: Credential file '${CREDENTIALS_EXPORT_PATH}' already exists. Refusing to overwrite.`
    );
  }
  console.log(`   ✔ Export destination verified: ${CREDENTIALS_EXPORT_PATH}`);

  // 3. Configure single-connection database client to Staging Session Pooler
  const host = "aws-0-ap-south-1.pooler.supabase.com";
  const port = 5432;
  const user = `postgres.${AUTHORIZED_STAGING_REF}`;
  const database = "postgres";
  const password = process.env.PGPASSWORD;

  if (!password) {
    throw new Error("AUTH_ERROR: PGPASSWORD environment variable is missing.");
  }

  // Pre-validate connection parameters
  validateConnectionParams({ host, user, database }, AUTHORIZED_STAGING_REF);
  console.log("3. Target parameters pre-validated. Connecting to staging database...");

  const pool = new pg.Pool({
    host,
    port,
    user,
    database,
    password,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  console.log("   ✔ Dedicated single database connection pool initialized.");

  try {
    // 4. Generate high-entropy credentials
    console.log("4. Generating CSPRNG credentials for 4 disposable identities...");
    const credentials = generateFixtureCredentials();

    // 5. Execute provisioning transaction via audited provisionQAFixtures
    console.log("5. Executing atomic provisioning transaction on staging...");
    const result = await provisionQAFixtures(pool, credentials, {
      bcryptCost: 10,
      isOfflineTest: false,
      targetRef: AUTHORIZED_STAGING_REF,
      connectionParams: { host, user },
    });

    console.log("   ✔ Transaction COMMITTED successfully.");

    // 6. Securely export credentials through protected atomic mechanism
    console.log("6. Exporting credentials to secure private path...");
    const exportRes = exportCredentialsSecurely(credentials, CREDENTIALS_EXPORT_PATH);
    console.log(`   ✔ Protected export succeeded: ${exportRes.filePath}`);

    // 7. Post-provisioning read-only verification
    console.log("7. Performing authoritative post-provisioning verification queries...");

    // a. QA Teams count
    const teamsRes = await pool.query(
      "SELECT id, team_name, callsign, is_disqualified, created_at FROM public.teams ORDER BY callsign;"
    );
    // b. QA Marshals count
    const marshalsRes = await pool.query(
      "SELECT id, username, callsign, is_active, created_at FROM public.marshals ORDER BY callsign;"
    );
    // c. Sessions counts
    const teamSessionsCount = (await pool.query("SELECT COUNT(*) as c FROM public.team_sessions;")).rows[0].c;
    const marshalSessionsCount = (await pool.query("SELECT COUNT(*) as c FROM public.marshal_sessions;")).rows[0].c;
    // d. Progress counts
    const progressCount = (await pool.query("SELECT COUNT(*) as c FROM public.team_progress;")).rows[0].c;
    const hintsCount = (await pool.query("SELECT COUNT(*) as c FROM public.team_hints;")).rows[0].c;
    // e. Event config
    const eventRow = (await pool.query("SELECT id, status, is_locked, start_at, end_at, winner_team_id FROM public.event_config WHERE id = 1;")).rows[0];
    // f. Content counts
    const levelsCount = (await pool.query("SELECT COUNT(*) as c FROM public.levels;")).rows[0].c;
    const questionsCount = (await pool.query("SELECT COUNT(*) as c FROM public.questions;")).rows[0].c;
    const keysCount = (await pool.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c;
    const contentHintsCount = (await pool.query("SELECT COUNT(*) as c FROM public.hints;")).rows[0].c;
    // g. Secrets & winners
    const secretsCount = (await pool.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c;
    const winnersCount = (await pool.query("SELECT COUNT(*) as c FROM public.winner_verifications;")).rows[0].c;

    const verificationSummary = {
      targetProjectRef: AUTHORIZED_STAGING_REF,
      transactionStatus: "COMMITTED",
      qaTeams: teamsRes.rows.map((r) => ({ id: r.id, callsign: r.callsign, team_name: r.team_name })),
      qaMarshals: marshalsRes.rows.map((r) => ({ id: r.id, callsign: r.callsign, username: r.username })),
      teamSessions: Number(teamSessionsCount),
      marshalSessions: Number(marshalSessionsCount),
      teamProgress: Number(progressCount),
      teamHints: Number(hintsCount),
      eventStatus: eventRow.status,
      eventIsLocked: eventRow.is_locked,
      eventWinnerTeamId: eventRow.winner_team_id,
      eventDates: { start_at: eventRow.start_at, end_at: eventRow.end_at },
      catalog: {
        levels: Number(levelsCount),
        questions: Number(questionsCount),
        questionKeys: Number(keysCount),
        hints: Number(contentHintsCount),
      },
      treasureSecrets: Number(secretsCount),
      winnerVerifications: Number(winnersCount),
      credentialFilePath: CREDENTIALS_EXPORT_PATH,
    };

    console.log("\n================================================================================");
    console.log(" POST-PROVISIONING AUDIT VERIFICATION REPORT");
    console.log("================================================================================");
    console.log(formatRedactedSummary(result));
    console.log("--------------------------------------------------------------------------------");
    console.log("POST-PROVISIONING STATE AUDIT:");
    console.log(` Teams in database:         ${verificationSummary.qaTeams.length} (Expected: 3)`);
    console.log(` Marshals in database:      ${verificationSummary.qaMarshals.length} (Expected: 1)`);
    console.log(` Active team sessions:      ${verificationSummary.teamSessions} (Expected: 0)`);
    console.log(` Active marshal sessions:   ${verificationSummary.marshalSessions} (Expected: 0)`);
    console.log(` Progress records:          ${verificationSummary.teamProgress} (Expected: 0)`);
    console.log(` Revealed hints:            ${verificationSummary.teamHints} (Expected: 0)`);
    console.log(` Event status:              ${verificationSummary.eventStatus} (Expected: draft)`);
    console.log(` Event is_locked:           ${verificationSummary.eventIsLocked} (Expected: false)`);
    console.log(` Event winner:              ${verificationSummary.eventWinnerTeamId === null ? "None (NULL)" : verificationSummary.eventWinnerTeamId}`);
    console.log(` Catalog levels:            ${verificationSummary.catalog.levels} (Expected: 5)`);
    console.log(` Catalog questions:         ${verificationSummary.catalog.questions} (Expected: 45)`);
    console.log(` Catalog question keys:     ${verificationSummary.catalog.questionKeys} (Expected: 45)`);
    console.log(` Catalog hints:             ${verificationSummary.catalog.hints} (Expected: 135)`);
    console.log(` Treasure secrets:          ${verificationSummary.treasureSecrets} (Expected: 0)`);
    console.log(` Winner verifications:      ${verificationSummary.winnerVerifications} (Expected: 0)`);
    console.log(` Credential export file:    ${verificationSummary.credentialFilePath}`);
    console.log("================================================================================");

    // Assert exact post-checks
    if (verificationSummary.qaTeams.length !== 3) throw new Error("POST_CHECK_FAIL: Expected 3 teams.");
    if (verificationSummary.qaMarshals.length !== 1) throw new Error("POST_CHECK_FAIL: Expected 1 marshal.");
    if (verificationSummary.teamSessions !== 0) throw new Error("POST_CHECK_FAIL: Expected 0 team sessions.");
    if (verificationSummary.marshalSessions !== 0) throw new Error("POST_CHECK_FAIL: Expected 0 marshal sessions.");
    if (verificationSummary.teamProgress !== 0) throw new Error("POST_CHECK_FAIL: Expected 0 progress records.");
    if (verificationSummary.teamHints !== 0) throw new Error("POST_CHECK_FAIL: Expected 0 hint records.");
    if (verificationSummary.eventStatus !== "draft") throw new Error("POST_CHECK_FAIL: Expected status 'draft'.");
    if (verificationSummary.eventIsLocked !== false) throw new Error("POST_CHECK_FAIL: Expected is_locked false.");
    if (verificationSummary.eventWinnerTeamId !== null) throw new Error("POST_CHECK_FAIL: Expected winner null.");
    if (verificationSummary.catalog.questions !== 45) throw new Error("POST_CHECK_FAIL: Expected 45 questions.");
    if (verificationSummary.catalog.hints !== 135) throw new Error("POST_CHECK_FAIL: Expected 135 hints.");
    if (verificationSummary.treasureSecrets !== 0) throw new Error("POST_CHECK_FAIL: Expected 0 treasure secrets.");
    if (verificationSummary.winnerVerifications !== 0) throw new Error("POST_CHECK_FAIL: Expected 0 winner verifications.");

    console.log("ALL POST-PROVISIONING AUDIT CHECKS PASSED WITH ZERO DISCREPANCIES.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nFATAL PROVISIONING ERROR:", err.message);
  process.exit(1);
});
