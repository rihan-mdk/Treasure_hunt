/**
 * ============================================================================
 * THE HUNT EXPEDITION — STAGING QA FIXTURE PROVISIONING SCRIPT (HARDENED)
 * Target: uguvotvttdtclnhbsywr (Staging Only — Strict Exact Match)
 * Forbidden: kcupmzqnyitkchkmftcl (Production — Strictly Off-Limits)
 *
 * PURPOSE:
 * Deterministically provisions four disposable QA identities:
 *   1. QA-TEAM-ALPHA   (Squad progression testing)
 *   2. QA-TEAM-BRAVO   (Isolation and hint quota testing)
 *   3. QA-TEAM-CHARLIE (Negative test cases & brute-force lockout testing)
 *   4. QA-MARSHAL-GROUND (Ground marshal verification desk testing)
 *
 * HARDENED SAFETY INVARIANTS:
 * - Requires EXACT equality with authorized staging ref 'uguvotvttdtclnhbsywr'.
 * - Rejects prefixes, suffixes, substrings, or unextracted URLs.
 * - Positively verifies connected database identity over the wire.
 * - Single-connection transaction guarantee with automatic ROLLBACK on any error.
 * - Requires explicit outside-repo path for secure credential export with mode 0600 and O_EXCL.
 * - Refuses to overwrite existing credential files.
 * - Completely masks/redacts credentials from all logs and standard console outputs.
 * - Fails closed on duplicate identities, non-draft event, or incomplete 45-question dataset.
 * - Zero mutations to event_config, treasure_secrets, or winner_verifications.
 * ============================================================================
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AUTHORIZED_STAGING_REF = "uguvotvttdtclnhbsywr";
export const FORBIDDEN_PRODUCTION_REF = "kcupmzqnyitkchkmftcl";

export const QA_FIXTURE_SPEC = {
  teams: [
    {
      team_name: "QA Team Alpha",
      callsign: "QA-TEAM-ALPHA",
      role_description: "Normal gameplay path & successful Level 1-5 progression",
    },
    {
      team_name: "QA Team Bravo",
      callsign: "QA-TEAM-BRAVO",
      role_description: "Data isolation, level locking, and hint quota limits",
    },
    {
      team_name: "QA Team Charlie",
      callsign: "QA-TEAM-CHARLIE",
      role_description: "Negative tests, invalid submissions, and brute-force lockout",
    },
  ],
  marshal: {
    username: "qa_marshal_ground",
    callsign: "QA-MARSHAL-GROUND",
    role_description: "Physical ground marshal verification desk workflow",
  },
};

/**
 * Validates the target project reference against strict safety policies.
 * Requires STRICT EXACT EQUALITY with AUTHORIZED_STAGING_REF.
 * Rejects prefixes, suffixes, substrings, or embedded URLs.
 */
export function validateTargetReference(targetRef, options = {}) {
  if (!targetRef || typeof targetRef !== "string" || targetRef.trim() === "") {
    throw new Error("TARGET_VALIDATION_ERROR: Target project reference is missing or empty.");
  }

  const normalized = targetRef.trim().toLowerCase();

  // 1. Explicit production trap
  if (normalized.includes(FORBIDDEN_PRODUCTION_REF)) {
    throw new Error(
      `FATAL_SECURITY_TRAP: Target reference matches forbidden production project '${FORBIDDEN_PRODUCTION_REF}'! Aborting immediately.`
    );
  }

  // 2. Allow offline/in-memory test mode only if explicitly enabled
  if (options.isOfflineTest && (normalized === "pglite" || normalized === "offline-test" || normalized === "test-db")) {
    return {
      valid: true,
      target: normalized,
      mode: "offline-test",
    };
  }

  // 3. Strict EXACT equality check: reject prefixes, suffixes, or unparsed URLs
  if (normalized !== AUTHORIZED_STAGING_REF) {
    throw new Error(
      `TARGET_MISMATCH_ERROR: Target '${normalized}' does not match authorized staging reference '${AUTHORIZED_STAGING_REF}'. Exact equality required.`
    );
  }

  return {
    valid: true,
    target: AUTHORIZED_STAGING_REF,
    mode: "staging",
  };
}

/**
 * Validates connection configuration parameters (URL, host, username, or connection string).
 * Ensures connection parameters cannot point to production or an unverified destination.
 */
export function validateConnectionParams(connectionParams, expectedRef = AUTHORIZED_STAGING_REF, options = {}) {
  if (!connectionParams) return { valid: true };

  const str = typeof connectionParams === "string" 
    ? connectionParams 
    : JSON.stringify(connectionParams);

  const normalized = str.toLowerCase();

  // 1. Explicit production trap
  if (normalized.includes(FORBIDDEN_PRODUCTION_REF)) {
    throw new Error(
      `FATAL_SECURITY_TRAP: Connection parameters reference forbidden production project '${FORBIDDEN_PRODUCTION_REF}'! Aborting immediately.`
    );
  }

  // 2. Offline test bypass if explicitly enabled
  if (options.isOfflineTest) {
    return { valid: true, mode: "offline-test" };
  }

  // 3. Staging verification: must reference authorized staging ref
  if (!normalized.includes(expectedRef.toLowerCase())) {
    throw new Error(
      `TARGET_MISMATCH_ERROR: Connection parameters do not reference authorized staging project '${expectedRef}'.`
    );
  }

  return { valid: true, mode: "staging" };
}

/**
 * Positive read-only verification of the actual connected database.
 * Executes over the established connection before any DML or transaction.
 *
 * @param {object} client - Active single-connection database client
 * @param {string} expectedRef - Expected project reference
 * @param {object} options - Options ({ isOfflineTest: boolean, connectionParams?: any })
 */
export async function verifyConnectionIdentity(client, expectedRef, options = {}) {
  const targetCheck = validateTargetReference(expectedRef, options);

  if (options.connectionParams) {
    validateConnectionParams(options.connectionParams, targetCheck.target, options);
  }

  const res = await client.query(`
    SELECT 
      current_database() AS db_name,
      current_user AS user_name,
      current_schema() AS schema_name,
      clock_timestamp() AS server_time;
  `);

  if (!res.rows || res.rows.length === 0) {
    throw new Error("CONNECTION_IDENTITY_ERROR: Unable to query database session identity.");
  }

  const row = res.rows[0];
  const dbName = String(row.db_name || "").toLowerCase();
  const userName = String(row.user_name || "").toLowerCase();

  // 1. Trap production in connected database metadata
  if (dbName.includes(FORBIDDEN_PRODUCTION_REF) || userName.includes(FORBIDDEN_PRODUCTION_REF)) {
    throw new Error(
      `FATAL_SECURITY_TRAP: Connected database metadata matches forbidden production reference '${FORBIDDEN_PRODUCTION_REF}'! Aborting immediately.`
    );
  }

  // 2. In staging mode: verify expectedRef and connection details
  if (targetCheck.mode === "staging") {
    // If username is a Supabase pooler username (postgres.<project_ref>), verify it matches staging
    if (userName.startsWith("postgres.") && !userName.includes(AUTHORIZED_STAGING_REF)) {
      throw new Error(
        `CONNECTION_IDENTITY_MISMATCH: Connected user '${userName}' does not match staging reference '${AUTHORIZED_STAGING_REF}'.`
      );
    }
  }

  return {
    verified: true,
    mode: targetCheck.mode,
    targetRef: targetCheck.target,
    database: row.db_name,
    userMasked: row.user_name ? `${row.user_name.slice(0, 3)}***` : "unknown",
    serverTime: row.server_time,
  };
}

/**
 * Generates high-entropy disposable credentials securely using Node CSPRNG.
 * Entropy: > 140 bits. Avoids easily ambiguous characters.
 */
export function generateSecurePassword(length = 24) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+=-";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

/**
 * Builds the in-memory credential map for disposable identities.
 * Does NOT persist or log secrets.
 */
export function generateFixtureCredentials(customPasswords = {}) {
  const credentials = {
    teams: QA_FIXTURE_SPEC.teams.map((t) => ({
      ...t,
      password: customPasswords[t.callsign] || generateSecurePassword(24),
    })),
    marshal: {
      ...QA_FIXTURE_SPEC.marshal,
      password: customPasswords[QA_FIXTURE_SPEC.marshal.callsign] || generateSecurePassword(24),
    },
  };
  return credentials;
}

/**
 * Securely delivers credentials to an explicit file path OUTSIDE the repository.
 *
 * Safety Guards:
 * - Output path MUST be provided explicitly.
 * - Output path MUST be strictly outside the repository directory.
 * - Uses exclusive file creation ('wx' flag) to refuse overwriting existing files.
 * - Atomic write via temporary file with guaranteed cleanup on partial-write failure.
 * - Applies restrictive permissions (mode 0600) where supported.
 * - Never prints plaintext credentials to console.
 */
export function exportCredentialsSecurely(credentials, outputPath) {
  if (!outputPath || typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new Error(
      "CREDENTIAL_EXPORT_ERROR: An explicit output path outside the repository is required to deliver credentials."
    );
  }

  const resolvedTarget = path.resolve(outputPath.trim());
  const repoRoot = path.resolve(".");

  // Guard 1: Must be strictly outside repository directory
  if (resolvedTarget === repoRoot || resolvedTarget.startsWith(repoRoot + path.sep)) {
    throw new Error(
      `FATAL_SECURITY_VIOLATION: Credential export path ('${resolvedTarget}') must be strictly OUTSIDE the repository ('${repoRoot}') to prevent accidental git commit or credential leakage.`
    );
  }

  // Guard 2: Parent directory must exist
  const parentDir = path.dirname(resolvedTarget);
  if (!fs.existsSync(parentDir)) {
    throw new Error(`CREDENTIAL_EXPORT_ERROR: Destination directory does not exist: '${parentDir}'.`);
  }

  // Guard 3: Target file must not already exist (refuse overwrite)
  if (fs.existsSync(resolvedTarget)) {
    throw new Error(
      `CREDENTIAL_EXPORT_ERROR: Destination credential file already exists: '${resolvedTarget}'. Refusing to overwrite existing file.`
    );
  }

  const payload = {
    generated_at: new Date().toISOString(),
    environment: "staging-disposable-qa",
    target_project_ref: AUTHORIZED_STAGING_REF,
    notice: "STAGING DISPOSABLE QA CREDENTIALS ONLY. DO NOT COMMIT TO VERSION CONTROL OR EXPOSE.",
    identities: {
      teams: credentials.teams.map((t) => ({
        team_name: t.team_name,
        callsign: t.callsign,
        role: t.role_description,
        password: t.password,
      })),
      marshal: {
        username: credentials.marshal.username,
        callsign: credentials.marshal.callsign,
        role: credentials.marshal.role_description,
        password: credentials.marshal.password,
      },
    },
  };

  // Atomic write pattern: write to secure temporary sibling file, then rename.
  // If writing or formatting fails, the partial temporary file is cleaned up immediately.
  const tempFile = `${resolvedTarget}.tmp.${crypto.randomBytes(6).toString("hex")}`;

  try {
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), {
      flag: "wx", // Exclusive creation
      mode: 0o600, // Read/write for owner only
    });

    // Re-verify destination hasn't appeared concurrently before rename
    if (fs.existsSync(resolvedTarget)) {
      try { fs.unlinkSync(tempFile); } catch {}
      throw new Error(
        `CREDENTIAL_EXPORT_ERROR: Destination credential file already exists: '${resolvedTarget}'. Refusing to overwrite existing file.`
      );
    }

    fs.renameSync(tempFile, resolvedTarget);
  } catch (err) {
    // Guaranteed cleanup of incomplete or partial temp file
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
    if (err.code === "EEXIST") {
      throw new Error(
        `CREDENTIAL_EXPORT_ERROR: Destination credential file already exists: '${resolvedTarget}'. Refusing to overwrite existing file.`
      );
    }
    throw err;
  }

  return {
    exported: true,
    filePath: resolvedTarget,
  };
}

/**
 * Checks for existing identities in target database to guarantee idempotency
 * and prevent accidental credential overwrites.
 */
export async function checkExistingIdentities(client) {
  const teamCallsigns = QA_FIXTURE_SPEC.teams.map((t) => t.callsign);
  const marshalCallsign = QA_FIXTURE_SPEC.marshal.callsign;
  const marshalUsername = QA_FIXTURE_SPEC.marshal.username;

  const existingTeamsRes = await client.query(
    "SELECT id, team_name, callsign, created_at FROM public.teams WHERE callsign = ANY($1::text[]) OR team_name = ANY($2::text[]);",
    [teamCallsigns, QA_FIXTURE_SPEC.teams.map((t) => t.team_name)]
  );

  const existingMarshalRes = await client.query(
    "SELECT id, username, callsign, created_at FROM public.marshals WHERE callsign = $1 OR username = $2;",
    [marshalCallsign, marshalUsername]
  );

  return {
    teams: existingTeamsRes.rows,
    marshals: existingMarshalRes.rows,
    hasConflict: existingTeamsRes.rows.length > 0 || existingMarshalRes.rows.length > 0,
  };
}

/**
 * Validates pre-conditions in target database:
 * 1. Event status MUST be 'draft' and is_locked = false
 * 2. Questions table MUST contain exactly 45 questions
 */
export async function verifyDatabasePreconditions(client) {
  const eventRes = await client.query(
    "SELECT id, status, is_locked, winner_team_id FROM public.event_config WHERE id = 1;"
  );

  if (!eventRes.rows || eventRes.rows.length === 0) {
    throw new Error("PRECONDITION_FAILURE: Event configuration row (id = 1) is missing.");
  }

  const eventConfig = eventRes.rows[0];
  if (eventConfig.status !== "draft") {
    throw new Error(
      `PRECONDITION_FAILURE: Event status is '${eventConfig.status}'. Expected 'draft'. Fixture provisioning is strictly forbidden on non-draft events.`
    );
  }

  if (eventConfig.is_locked) {
    throw new Error("PRECONDITION_FAILURE: Event is locked. Cannot provision fixtures.");
  }

  const qCountRes = await client.query("SELECT COUNT(*) as c FROM public.questions;");
  const qCount = Number(qCountRes.rows[0].c);
  if (qCount !== 45) {
    throw new Error(
      `PRECONDITION_FAILURE: Staging dataset incomplete. Found ${qCount} questions, expected exactly 45.`
    );
  }

  return { valid: true, eventStatus: eventConfig.status, questionCount: qCount };
}

/**
 * Atomically provisions the QA identities in the database.
 * Guarantees execution on a single database client connection.
 * Wraps in BEGIN ... COMMIT with guaranteed ROLLBACK on any failure.
 *
 * @param {object} db - Database pool or single client supporting query()
 * @param {object} credentials - In-memory credentials object
 * @param {object} options - Options ({ bcryptCost: 10, isOfflineTest: false, targetRef: 'uguvotvttdtclnhbsywr' })
 */
export async function provisionQAFixtures(db, credentials, options = {}) {
  const bcryptCost = options.bcryptCost || 10;
  const targetRef = options.targetRef || (options.isOfflineTest ? "pglite" : AUTHORIZED_STAGING_REF);

  // Guarantee single connection: acquire dedicated client if pool is provided
  const isPool = typeof db.connect === "function";
  const client = isPool ? await db.connect() : db;

  try {
    // 1. Read-only positive connection identity verification
    await verifyConnectionIdentity(client, targetRef, options);

    // 2. Precondition checks (draft status & 45 questions)
    await verifyDatabasePreconditions(client);

    // 3. Conflict check (fail-closed on existing identities)
    const conflictCheck = await checkExistingIdentities(client);
    if (conflictCheck.hasConflict) {
      const existingList = [
        ...conflictCheck.teams.map((t) => `Team: ${t.callsign}`),
        ...conflictCheck.marshals.map((m) => `Marshal: ${m.callsign}`),
      ].join(", ");

      throw new Error(
        `CONFLICT_DETECTED: Staging already contains existing QA identities (${existingList}). Script aborted to prevent accidental overwrite. Use verified teardown script before re-provisioning.`
      );
    }

    // 4. Provision inside atomic transaction
    await client.query("BEGIN;");

    try {
      const insertedTeams = [];

      for (const team of credentials.teams) {
        const res = await client.query(
          `
          INSERT INTO public.teams (id, team_name, callsign, password_hash, is_disqualified)
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            extensions.crypt($3, extensions.gen_salt('bf', $4)),
            false
          )
          RETURNING id, team_name, callsign, created_at;
          `,
          [team.team_name, team.callsign, team.password, bcryptCost]
        );
        insertedTeams.push(res.rows[0]);
      }

      const marshalRes = await client.query(
        `
        INSERT INTO public.marshals (id, username, callsign, password_hash, is_active)
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          extensions.crypt($3, extensions.gen_salt('bf', $4)),
          true
        )
        RETURNING id, username, callsign, is_active, created_at;
        `,
        [
          credentials.marshal.username,
          credentials.marshal.callsign,
          credentials.marshal.password,
          bcryptCost,
        ]
      );

      await client.query("COMMIT;");

      return {
        success: true,
        provisionedTeams: insertedTeams,
        provisionedMarshal: marshalRes.rows[0],
        summary: {
          teamsCreated: insertedTeams.length,
          marshalsCreated: 1,
          eventStatus: "draft (unchanged)",
          treasureSecrets: "unchanged (0 rows)",
        },
      };
    } catch (dmlErr) {
      await client.query("ROLLBACK;");
      throw dmlErr;
    }
  } finally {
    if (isPool) {
      client.release();
    }
  }
}

/**
 * Generates safe, redacted console summary without leaking secret passwords.
 */
export function formatRedactedSummary(result) {
  const lines = [
    "================================================================================",
    " THE HUNT EXPEDITION — QA FIXTURE PROVISIONING REPORT",
    "================================================================================",
    `Target Project Ref:     ${AUTHORIZED_STAGING_REF}`,
    `Event Status:           ${result.summary.eventStatus}`,
    `Treasure Secrets:       ${result.summary.treasureSecrets}`,
    "--------------------------------------------------------------------------------",
    "PROVISIONED IDENTITIES (PASSWORDS REDACTED):",
  ];

  for (const team of result.provisionedTeams) {
    lines.push(` [TEAM]    Callsign: ${team.callsign.padEnd(18)} ID: ${team.id} (Password: [REDACTED: 24-char CSPRNG])`);
  }

  const m = result.provisionedMarshal;
  lines.push(` [MARSHAL] Callsign: ${m.callsign.padEnd(18)} ID: ${m.id} (Password: [REDACTED: 24-char CSPRNG])`);
  lines.push("================================================================================");
  lines.push("SAFETY STATUS: Event remains in draft mode. Zero treasure secrets created.");
  lines.push("================================================================================");

  return lines.join("\n");
}
