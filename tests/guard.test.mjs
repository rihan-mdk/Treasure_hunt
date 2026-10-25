import test from "node:test";
import assert from "node:assert/strict";

// We import the guard logic to test it in isolation
import {
  FORBIDDEN_PRODUCTION_REF,
  AUTHORIZED_STAGING_REF,
  assertSafeDatabaseUrl,
} from "../src/lib/supabase/guard.ts";

test("Fail-closed guard: strictly rejects production project ref", () => {
  const prodUrl = `https://${FORBIDDEN_PRODUCTION_REF}.supabase.co`;
  assert.throws(
    () => assertSafeDatabaseUrl(prodUrl),
    /FATAL SECURITY TRAP/
  );
});

test("Fail-closed guard: rejects unverified third-party project refs", () => {
  const unknownUrl = "https://arbitraryprojectref.supabase.co";
  assert.throws(
    () => assertSafeDatabaseUrl(unknownUrl),
    /TARGET VERIFICATION ERROR/
  );
});

test("Fail-closed guard: rejects undefined or empty URL", () => {
  assert.throws(() => assertSafeDatabaseUrl(undefined), /DATABASE CONFIG ERROR/);
  assert.throws(() => assertSafeDatabaseUrl(""), /DATABASE CONFIG ERROR/);
});

test("Fail-closed guard: approves authorized staging project ref", () => {
  const stagingUrl = `https://${AUTHORIZED_STAGING_REF}.supabase.co`;
  const result = assertSafeDatabaseUrl(stagingUrl);
  assert.equal(result, stagingUrl);
});

test("Fail-closed guard: approves local development URLs", () => {
  const localUrl = "http://127.0.0.1:54321";
  const result = assertSafeDatabaseUrl(localUrl);
  assert.equal(result, localUrl);
});
