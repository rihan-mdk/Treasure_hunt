import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDisposableDatabase } from "./migration-runner.mjs";
import {
  AUTHORIZED_STAGING_REF,
  FORBIDDEN_PRODUCTION_REF,
  validateTargetReference,
  validateConnectionParams,
  verifyConnectionIdentity,
  generateSecurePassword,
  generateFixtureCredentials,
  exportCredentialsSecurely,
  checkExistingIdentities,
  verifyDatabasePreconditions,
  provisionQAFixtures,
  formatRedactedSummary,
} from "../scripts/provision-staging-qa-fixtures.mjs";

test("QA Fixture Provisioning: 1. Strict Target Validation & Attack Vector Rejection", () => {
  // 1. Exact staging match passes
  const stagingCheck = validateTargetReference(AUTHORIZED_STAGING_REF);
  assert.equal(stagingCheck.valid, true);
  assert.equal(stagingCheck.target, AUTHORIZED_STAGING_REF);
  assert.equal(stagingCheck.mode, "staging");

  // Normalized whitespace / uppercase staging match passes
  const upperStaging = validateTargetReference(`  ${AUTHORIZED_STAGING_REF.toUpperCase()}  `);
  assert.equal(upperStaging.valid, true);
  assert.equal(upperStaging.target, AUTHORIZED_STAGING_REF);

  // 2. Production match throws FATAL_SECURITY_TRAP
  assert.throws(
    () => validateTargetReference(FORBIDDEN_PRODUCTION_REF),
    /FATAL_SECURITY_TRAP.*kcupmzqnyitkchkmftcl/
  );
  assert.throws(
    () => validateTargetReference(`https://${FORBIDDEN_PRODUCTION_REF}.supabase.co`),
    /FATAL_SECURITY_TRAP/
  );

  // 3. Prefix attack throws TARGET_MISMATCH_ERROR
  assert.throws(
    () => validateTargetReference(`prefix-${AUTHORIZED_STAGING_REF}`),
    /TARGET_MISMATCH_ERROR.*Exact equality required/
  );

  // 4. Suffix attack throws TARGET_MISMATCH_ERROR
  assert.throws(
    () => validateTargetReference(`${AUTHORIZED_STAGING_REF}-suffix`),
    /TARGET_MISMATCH_ERROR.*Exact equality required/
  );

  // 5. Embedded URL / hostname throws TARGET_MISMATCH_ERROR (must be raw reference)
  assert.throws(
    () => validateTargetReference(`https://${AUTHORIZED_STAGING_REF}.supabase.co`),
    /TARGET_MISMATCH_ERROR.*Exact equality required/
  );
  assert.throws(
    () => validateTargetReference(`db.${AUTHORIZED_STAGING_REF}.supabase.co`),
    /TARGET_MISMATCH_ERROR.*Exact equality required/
  );

  // 6. Unknown / arbitrary reference throws TARGET_MISMATCH_ERROR
  assert.throws(
    () => validateTargetReference("some-random-project-ref"),
    /TARGET_MISMATCH_ERROR/
  );

  // 7. Null, undefined, empty string throws TARGET_VALIDATION_ERROR
  assert.throws(() => validateTargetReference(""), /TARGET_VALIDATION_ERROR/);
  assert.throws(() => validateTargetReference("   "), /TARGET_VALIDATION_ERROR/);
  assert.throws(() => validateTargetReference(null), /TARGET_VALIDATION_ERROR/);
  assert.throws(() => validateTargetReference(undefined), /TARGET_VALIDATION_ERROR/);

  // 8. Offline test mode targets require isOfflineTest: true
  assert.throws(() => validateTargetReference("pglite"), /TARGET_MISMATCH_ERROR/);
  assert.throws(() => validateTargetReference("offline-test"), /TARGET_MISMATCH_ERROR/);
  assert.throws(() => validateTargetReference("test-db"), /TARGET_MISMATCH_ERROR/);

  const offlinePglite = validateTargetReference("pglite", { isOfflineTest: true });
  assert.equal(offlinePglite.valid, true);
  assert.equal(offlinePglite.mode, "offline-test");

  const offlineNamed = validateTargetReference("offline-test", { isOfflineTest: true });
  assert.equal(offlineNamed.valid, true);
  assert.equal(offlineNamed.mode, "offline-test");

  // 9. Connection parameter validation checks
  // Rejects production URL
  assert.throws(
    () => validateConnectionParams(`postgres://user:pass@db.${FORBIDDEN_PRODUCTION_REF}.supabase.co:5432/postgres`),
    /FATAL_SECURITY_TRAP/
  );
  // Rejects unknown URL
  assert.throws(
    () => validateConnectionParams("postgres://user:pass@db.unknown-ref.supabase.co:5432/postgres"),
    /TARGET_MISMATCH_ERROR/
  );
  // Accepts staging URL
  const stagingUrlCheck = validateConnectionParams(`postgres://user:pass@db.${AUTHORIZED_STAGING_REF}.supabase.co:5432/postgres`);
  assert.equal(stagingUrlCheck.valid, true);
  assert.equal(stagingUrlCheck.mode, "staging");

  // Offline connection params allowed with isOfflineTest: true
  const offlineParams = validateConnectionParams("local-pglite", AUTHORIZED_STAGING_REF, { isOfflineTest: true });
  assert.equal(offlineParams.valid, true);
  assert.equal(offlineParams.mode, "offline-test");
});

test("QA Fixture Provisioning: 2. CSPRNG Credential Generation & Secure Export Safeguards", () => {
  // 1. Password generation entropy & character distribution
  const pwd1 = generateSecurePassword(24);
  const pwd2 = generateSecurePassword(24);
  assert.equal(pwd1.length, 24);
  assert.notEqual(pwd1, pwd2, "Passwords generated across calls must be unique");
  assert.match(pwd1, /[A-Za-z0-9!@#$%&*+=-]{24}/);

  const creds = generateFixtureCredentials();
  assert.equal(creds.teams.length, 3);
  assert.equal(creds.marshal.callsign, "QA-MARSHAL-GROUND");

  // 2. Export Guard: Rejects output path inside repository
  const repoInsidePath = path.resolve("./qa-credentials.json");
  assert.throws(
    () => exportCredentialsSecurely(creds, repoInsidePath),
    /FATAL_SECURITY_VIOLATION.*must be strictly OUTSIDE the repository/
  );

  const relativeInsidePath = "qa-credentials.json";
  assert.throws(
    () => exportCredentialsSecurely(creds, relativeInsidePath),
    /FATAL_SECURITY_VIOLATION.*must be strictly OUTSIDE the repository/
  );

  // 3. Export Guard: Rejects empty or null output paths
  assert.throws(() => exportCredentialsSecurely(creds, ""), /CREDENTIAL_EXPORT_ERROR/);
  assert.throws(() => exportCredentialsSecurely(creds, null), /CREDENTIAL_EXPORT_ERROR/);

  // 4. Export Guard: Rejects non-existent destination directory
  const nonExistentDir = path.join(os.tmpdir(), "non_existent_qa_dir_" + Date.now(), "creds.json");
  assert.throws(() => exportCredentialsSecurely(creds, nonExistentDir), /CREDENTIAL_EXPORT_ERROR.*Destination directory does not exist/);

  // 5. Export Guard: Successful export to temporary directory outside repository
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hunt-qa-test-"));
  const tempFilePath = path.join(tempDir, "qa-staging-credentials.json");

  try {
    const exportRes = exportCredentialsSecurely(creds, tempFilePath);
    assert.equal(exportRes.exported, true);
    assert.equal(exportRes.filePath, tempFilePath);
    assert.ok(fs.existsSync(tempFilePath));

    const exportedContent = JSON.parse(fs.readFileSync(tempFilePath, "utf-8"));
    assert.equal(exportedContent.target_project_ref, AUTHORIZED_STAGING_REF);
    assert.equal(exportedContent.identities.teams.length, 3);
    assert.equal(exportedContent.identities.marshal.callsign, "QA-MARSHAL-GROUND");

    // 6. Export Guard: Refusal to overwrite existing file (exclusive creation 'wx')
    assert.throws(
      () => exportCredentialsSecurely(creds, tempFilePath),
      /CREDENTIAL_EXPORT_ERROR.*already exists.*Refusing to overwrite/
    );
  } finally {
    // Cleanup temporary test directory
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {
      // Ignore cleanup error in test
    }
  }
});

test("QA Fixture Provisioning: 3. Read-Only Database Connection Identity Verification", async () => {
  const db = await createDisposableDatabase();

  // 1. Verifies connection identity against offline test target
  const identity = await verifyConnectionIdentity(db, "pglite", { isOfflineTest: true });
  assert.equal(identity.verified, true);
  assert.equal(identity.mode, "offline-test");
  assert.ok(identity.database);
  assert.ok(identity.userMasked);
  assert.ok(identity.serverTime);

  // 2. Fails closed if expectedRef is unauthorized
  await assert.rejects(
    async () => {
      await verifyConnectionIdentity(db, "unauthorized-ref", { isOfflineTest: false });
    },
    /TARGET_MISMATCH_ERROR/
  );

  // 3. Fails closed if expectedRef is production
  await assert.rejects(
    async () => {
      await verifyConnectionIdentity(db, FORBIDDEN_PRODUCTION_REF, { isOfflineTest: false });
    },
    /FATAL_SECURITY_TRAP/
  );
});

test("QA Fixture Provisioning: 4. End-to-End Database Provisioning & Authentication on PGlite", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  const seedSql = fs.readFileSync(path.resolve("supabase/seed_content_pack_v1.sql"), "utf-8");

  await db.exec(migrationSql);
  await db.exec(seedSql);

  // 1. Initial State assertions
  const initialTeams = await db.query("SELECT COUNT(*) as c FROM public.teams;");
  const initialMarshals = await db.query("SELECT COUNT(*) as c FROM public.marshals;");
  assert.equal(Number(initialTeams.rows[0].c), 0);
  assert.equal(Number(initialMarshals.rows[0].c), 0);

  // 2. Generate fixture credentials and provision (using bcrypt cost 8 for fast unit test)
  const credentials = generateFixtureCredentials();
  const result = await provisionQAFixtures(db, credentials, {
    bcryptCost: 8,
    isOfflineTest: true,
    targetRef: "pglite",
  });

  assert.equal(result.success, true);
  assert.equal(result.provisionedTeams.length, 3);
  assert.ok(result.provisionedMarshal.id);

  // 3. Verify database records
  const dbTeams = (await db.query("SELECT id, team_name, callsign FROM public.teams ORDER BY callsign;")).rows;
  assert.equal(dbTeams.length, 3);
  assert.equal(dbTeams[0].callsign, "QA-TEAM-ALPHA");
  assert.equal(dbTeams[1].callsign, "QA-TEAM-BRAVO");
  assert.equal(dbTeams[2].callsign, "QA-TEAM-CHARLIE");

  const dbMarshal = (await db.query("SELECT id, username, callsign, is_active FROM public.marshals;")).rows[0];
  assert.equal(dbMarshal.callsign, "QA-MARSHAL-GROUND");
  assert.equal(dbMarshal.username, "qa_marshal_ground");
  assert.equal(dbMarshal.is_active, true);

  // 4. Test Team Authentication via database RPC
  const teamAuthSuccess = (
    await db.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", credentials.teams[0].password, "127.0.0.1"]
    )
  ).rows[0].res;
  assert.equal(teamAuthSuccess.success, true);
  assert.equal(teamAuthSuccess.callsign, "QA-TEAM-ALPHA");
  assert.ok(teamAuthSuccess.session_token);

  // Case-insensitivity test for callsign
  const teamAuthLower = (
    await db.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["qa-team-alpha", credentials.teams[0].password, "127.0.0.1"]
    )
  ).rows[0].res;
  assert.equal(teamAuthLower.success, true);

  // Invalid password rejection
  const teamAuthFail = (
    await db.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", "IncorrectPassword123!", "127.0.0.1"]
    )
  ).rows[0].res;
  assert.equal(teamAuthFail.success, false);
  assert.equal(teamAuthFail.error, "ERR_INVALID_CREDENTIALS");

  // 5. Test Marshal Authentication via database RPC
  const marshalAuthSuccess = (
    await db.query(
      "SELECT public.authenticate_marshal($1, $2, $3) as res;",
      ["qa_marshal_ground", credentials.marshal.password, "127.0.0.1"]
    )
  ).rows[0].res;
  assert.equal(marshalAuthSuccess.success, true);
  assert.equal(marshalAuthSuccess.callsign, "QA-MARSHAL-GROUND");
  assert.ok(marshalAuthSuccess.session_token);

  const marshalAuthFail = (
    await db.query(
      "SELECT public.authenticate_marshal($1, $2, $3) as res;",
      ["qa_marshal_ground", "WrongMarshalPass!", "127.0.0.1"]
    )
  ).rows[0].res;
  assert.equal(marshalAuthFail.success, false);
  assert.equal(marshalAuthFail.error, "ERR_INVALID_CREDENTIALS");

  // 6. Test Idempotency & Conflict Guard (Second run must fail closed without altering DB)
  await assert.rejects(
    async () => {
      await provisionQAFixtures(db, credentials, { bcryptCost: 8, isOfflineTest: true, targetRef: "pglite" });
    },
    /CONFLICT_DETECTED.*QA-TEAM-ALPHA/
  );

  // Confirm row counts remain exactly 3 teams and 1 marshal
  const postTeams = await db.query("SELECT COUNT(*) as c FROM public.teams;");
  const postMarshals = await db.query("SELECT COUNT(*) as c FROM public.marshals;");
  assert.equal(Number(postTeams.rows[0].c), 3);
  assert.equal(Number(postMarshals.rows[0].c), 1);

  // 7. Verify Safety Invariants Unchanged
  const eventStatus = (await db.query("SELECT status, is_locked, winner_team_id FROM public.event_config WHERE id = 1;")).rows[0];
  assert.equal(eventStatus.status, "draft", "Event must remain in draft");
  assert.equal(eventStatus.is_locked, false, "Event must not be locked");
  assert.equal(eventStatus.winner_team_id, null, "Winner must be null");

  const secretsCount = (await db.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c;
  assert.equal(Number(secretsCount), 0, "Treasure secrets must remain empty");

  // 8. Test Redacted Summary Output (ensures zero secret passwords in output)
  const summaryOutput = formatRedactedSummary(result);
  assert.match(summaryOutput, /QA-TEAM-ALPHA/);
  assert.match(summaryOutput, /\[REDACTED: 24-char CSPRNG\]/);
  assert.doesNotMatch(summaryOutput, new RegExp(credentials.teams[0].password));
  assert.doesNotMatch(summaryOutput, new RegExp(credentials.marshal.password));
});

test("QA Fixture Provisioning: 5. Fail-Closed Preconditions & Transaction Rollback", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(migrationSql);

  // 1. Incomplete dataset check (0 questions in db)
  const creds = generateFixtureCredentials();
  await assert.rejects(
    async () => {
      await provisionQAFixtures(db, creds, { bcryptCost: 8, isOfflineTest: true, targetRef: "pglite" });
    },
    /PRECONDITION_FAILURE: Staging dataset incomplete/
  );

  // 2. Non-draft event check
  const seedSql = fs.readFileSync(path.resolve("supabase/seed_content_pack_v1.sql"), "utf-8");
  await db.exec(seedSql);

  // Test 2a: Event status is 'paused' (valid enum, but not draft)
  await db.exec("UPDATE public.event_config SET status = 'paused' WHERE id = 1;");
  await assert.rejects(
    async () => {
      await provisionQAFixtures(db, creds, { bcryptCost: 8, isOfflineTest: true, targetRef: "pglite" });
    },
    /PRECONDITION_FAILURE: Event status is 'paused'/
  );

  // Test 2b: Event is locked
  await db.exec("UPDATE public.event_config SET status = 'draft', is_locked = true WHERE id = 1;");
  await assert.rejects(
    async () => {
      await provisionQAFixtures(db, creds, { bcryptCost: 8, isOfflineTest: true, targetRef: "pglite" });
    },
    /PRECONDITION_FAILURE: Event is locked/
  );

  // Reset event to valid draft
  await db.exec("UPDATE public.event_config SET is_locked = false WHERE id = 1;");

  // 3. Transaction Rollback Verification:
  // If an error occurs during transaction (e.g. invalid callsign constraint violation on 2nd team),
  // rollback must revert ALL changes, leaving 0 teams created.
  const badCreds = {
    teams: [
      { team_name: "Valid Alpha", callsign: "QA-TEAM-ALPHA", password: "Password1!" },
      { team_name: "Invalid Beta", callsign: "INVALID CALLSIGN WITH SPACES!", password: "Password2!" }, // Violates regex
      { team_name: "Valid Charlie", callsign: "QA-TEAM-CHARLIE", password: "Password3!" },
    ],
    marshal: creds.marshal,
  };

  await assert.rejects(
    async () => {
      await provisionQAFixtures(db, badCreds, { bcryptCost: 8, isOfflineTest: true, targetRef: "pglite" });
    },
    /violates check constraint/
  );

  // Confirm that Team Alpha was rolled back completely
  const rolledBackTeams = await db.query("SELECT COUNT(*) as c FROM public.teams;");
  const rolledBackMarshals = await db.query("SELECT COUNT(*) as c FROM public.marshals;");
  assert.equal(Number(rolledBackTeams.rows[0].c), 0, "All team inserts must be rolled back on error");
  assert.equal(Number(rolledBackMarshals.rows[0].c), 0, "Marshal insert must be rolled back on error");

  // 4. Pre-existing QA Identity Abort & Zero-Mutation Verification:
  // If an identity already exists (e.g. from a previous partial or un-cleaned run),
  // the script must abort before opening a transaction and mutate zero records.
  await db.query(`
    INSERT INTO public.teams (team_name, callsign, password_hash)
    VALUES ('Pre-existing Alpha', 'QA-TEAM-ALPHA', 'hash123');
  `);

  await assert.rejects(
    async () => {
      await provisionQAFixtures(db, creds, { bcryptCost: 8, isOfflineTest: true, targetRef: "pglite" });
    },
    /CONFLICT_DETECTED.*QA-TEAM-ALPHA/
  );

  // Assert zero mutation: exactly 1 team remains (the pre-existing one), 0 marshals
  const conflictTeams = await db.query("SELECT COUNT(*) as c FROM public.teams;");
  const conflictMarshals = await db.query("SELECT COUNT(*) as c FROM public.marshals;");
  assert.equal(Number(conflictTeams.rows[0].c), 1, "No additional teams should be inserted on conflict");
  assert.equal(Number(conflictMarshals.rows[0].c), 0, "No marshals should be inserted on conflict");

  // Assert event_config, treasure_secrets, and winner_verifications were NOT touched
  const conflictEvent = (await db.query("SELECT status, is_locked, winner_team_id FROM public.event_config WHERE id = 1;")).rows[0];
  assert.equal(conflictEvent.status, "draft", "Event must remain draft");
  assert.equal(conflictEvent.is_locked, false, "Event must remain unlocked");
  assert.equal(conflictEvent.winner_team_id, null, "Winner must remain null");

  const conflictSecrets = (await db.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c;
  assert.equal(Number(conflictSecrets), 0, "Treasure secrets must remain empty");

  const conflictWinners = (await db.query("SELECT COUNT(*) as c FROM public.winner_verifications;")).rows[0].c;
  assert.equal(Number(conflictWinners), 0, "Winner verifications must remain empty");
});
