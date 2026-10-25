import test from "node:test";
import assert from "node:assert/strict";

// Import the guard logic to test it in isolation.
import {
  FORBIDDEN_PRODUCTION_REF,
  AUTHORIZED_STAGING_REF,
  AUTHORIZED_PRODUCTION_REF,
  assertSafeDatabaseUrl,
} from "../src/lib/supabase/guard.ts";

// ---------------------------------------------------------------------------
// Exported constant sanity checks
// ---------------------------------------------------------------------------

test("Guard constants: exported refs are non-empty strings", () => {
  assert.equal(typeof FORBIDDEN_PRODUCTION_REF, "string");
  assert.equal(typeof AUTHORIZED_STAGING_REF,   "string");
  assert.equal(typeof AUTHORIZED_PRODUCTION_REF, "string");
  assert.ok(FORBIDDEN_PRODUCTION_REF.length > 0);
  assert.ok(AUTHORIZED_STAGING_REF.length   > 0);
  assert.ok(AUTHORIZED_PRODUCTION_REF.length > 0);
});

test("Guard constants: all three refs are distinct", () => {
  assert.notEqual(FORBIDDEN_PRODUCTION_REF, AUTHORIZED_STAGING_REF);
  assert.notEqual(FORBIDDEN_PRODUCTION_REF, AUTHORIZED_PRODUCTION_REF);
  assert.notEqual(AUTHORIZED_STAGING_REF,   AUTHORIZED_PRODUCTION_REF);
});

test("Guard constants: staging ref is correct value", () => {
  assert.equal(AUTHORIZED_STAGING_REF, "uguvotvttdtclnhbsywr");
});

test("Guard constants: production ref is correct value", () => {
  assert.equal(AUTHORIZED_PRODUCTION_REF, "zbeglxowlfdkhwyadcst");
});

test("Guard constants: forbidden ref is correct value", () => {
  assert.equal(FORBIDDEN_PRODUCTION_REF, "kcupmzqnyitkchkmftcl");
});

// ---------------------------------------------------------------------------
// Missing / empty URL — DATABASE CONFIG ERROR
// ---------------------------------------------------------------------------

test("Fail-closed guard: rejects undefined URL", () => {
  assert.throws(
    () => assertSafeDatabaseUrl(undefined),
    /DATABASE CONFIG ERROR/
  );
});

test("Fail-closed guard: rejects empty-string URL", () => {
  assert.throws(
    () => assertSafeDatabaseUrl(""),
    /DATABASE CONFIG ERROR/
  );
});

// ---------------------------------------------------------------------------
// Forbidden project ref — FATAL SECURITY TRAP (highest-priority rejection)
// ---------------------------------------------------------------------------

test("Fail-closed guard: rejects the strictly forbidden project ref", () => {
  const forbiddenUrl = `https://${FORBIDDEN_PRODUCTION_REF}.supabase.co`;
  assert.throws(
    () => assertSafeDatabaseUrl(forbiddenUrl),
    /FATAL SECURITY TRAP/
  );
});

test("Fail-closed guard: forbidden ref is rejected even when URL also contains an authorized ref substring", () => {
  // Adversarial: craft a URL that contains both the forbidden ref AND an authorized ref.
  // The forbidden-ref check must win.
  const adversarialUrl = `https://${FORBIDDEN_PRODUCTION_REF}${AUTHORIZED_STAGING_REF}.supabase.co`;
  assert.throws(
    () => assertSafeDatabaseUrl(adversarialUrl),
    /FATAL SECURITY TRAP/
  );
});

// ---------------------------------------------------------------------------
// Unknown / third-party refs — TARGET VERIFICATION ERROR
// ---------------------------------------------------------------------------

test("Fail-closed guard: rejects unknown third-party project ref", () => {
  const unknownUrl = "https://arbitraryprojectref.supabase.co";
  assert.throws(
    () => assertSafeDatabaseUrl(unknownUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: rejects a URL that looks like supabase.co but has no authorized ref", () => {
  const unknownUrl = "https://aaaaaaaaaaaaaaaaaaaaa.supabase.co";
  assert.throws(
    () => assertSafeDatabaseUrl(unknownUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: rejects a completely arbitrary URL", () => {
  assert.throws(
    () => assertSafeDatabaseUrl("https://example.com"),
    /TARGET VERIFICATION ERROR/
  );
});

// ---------------------------------------------------------------------------
// Authorized staging ref — must be accepted
// ---------------------------------------------------------------------------

test("Fail-closed guard: approves authorized staging project ref", () => {
  const stagingUrl = `https://${AUTHORIZED_STAGING_REF}.supabase.co`;
  const result = assertSafeDatabaseUrl(stagingUrl);
  assert.equal(result, stagingUrl);
});

test("Fail-closed guard: returns staging URL unchanged (no mutation)", () => {
  const stagingUrl = `https://${AUTHORIZED_STAGING_REF}.supabase.co`;
  assert.equal(assertSafeDatabaseUrl(stagingUrl), stagingUrl);
});

// ---------------------------------------------------------------------------
// Authorized production ref — must be accepted
// ---------------------------------------------------------------------------

test("Fail-closed guard: approves authorized production project ref", () => {
  const productionUrl = `https://${AUTHORIZED_PRODUCTION_REF}.supabase.co`;
  const result = assertSafeDatabaseUrl(productionUrl);
  assert.equal(result, productionUrl);
});

test("Fail-closed guard: returns production URL unchanged (no mutation)", () => {
  const productionUrl = `https://${AUTHORIZED_PRODUCTION_REF}.supabase.co`;
  assert.equal(assertSafeDatabaseUrl(productionUrl), productionUrl);
});

// ---------------------------------------------------------------------------
// Local development — must be accepted regardless of project ref
// ---------------------------------------------------------------------------

test("Fail-closed guard: approves 127.0.0.1 local URL", () => {
  const localUrl = "http://127.0.0.1:54321";
  assert.equal(assertSafeDatabaseUrl(localUrl), localUrl);
});

test("Fail-closed guard: approves localhost URL", () => {
  const localUrl = "http://localhost:54321";
  assert.equal(assertSafeDatabaseUrl(localUrl), localUrl);
});

// ---------------------------------------------------------------------------
// Environment mismatch patterns — must be rejected
// ---------------------------------------------------------------------------

test("Fail-closed guard: rejects pooler URL that lacks any authorized ref", () => {
  // A session-pooler URL that has been manually assembled without the project ref.
  const badPoolerUrl = "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  assert.throws(
    () => assertSafeDatabaseUrl(badPoolerUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: rejects a URL where ref appears only in the password field", () => {
  const badPasswordUrl = `postgresql://user:${AUTHORIZED_STAGING_REF}@db.supabase.co:5432/postgres`;
  assert.throws(
    () => assertSafeDatabaseUrl(badPasswordUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: rejects loose substring match in query parameters", () => {
  const queryParamUrl = `https://unauthorized-domain.com/api?target=${AUTHORIZED_PRODUCTION_REF}`;
  assert.throws(
    () => assertSafeDatabaseUrl(queryParamUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: rejects loose substring match in URL path", () => {
  const pathUrl = `https://unauthorized-domain.com/${AUTHORIZED_PRODUCTION_REF}`;
  assert.throws(
    () => assertSafeDatabaseUrl(pathUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: approves authorized pooler URL with exact project username", () => {
  const poolerUrl = `postgresql://postgres.${AUTHORIZED_PRODUCTION_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  assert.equal(assertSafeDatabaseUrl(poolerUrl), poolerUrl);
});
