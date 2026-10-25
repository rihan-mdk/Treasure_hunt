/**
 * Fail-closed security guard for Supabase environment connections.
 * Strictly prevents accidental connections to production (kcupmzqnyitkchkmftcl).
 * Enforces that any remote database operations target the authorized staging project (uguvotvttdtclnhbsywr).
 */

export const FORBIDDEN_PRODUCTION_REF = "kcupmzqnyitkchkmftcl";
export const AUTHORIZED_STAGING_REF = "uguvotvttdtclnhbsywr";

export function assertSafeDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE CONFIG ERROR: Supabase URL is undefined.");
  }

  // 1. Production check (Fail-Closed)
  if (url.includes(FORBIDDEN_PRODUCTION_REF)) {
    throw new Error(
      `FATAL SECURITY TRAP: Attempted connection to production project '${FORBIDDEN_PRODUCTION_REF}'. Execution aborted.`
    );
  }

  // 2. Allow local test environments (e.g. 127.0.0.1, localhost)
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  if (isLocal) {
    return url;
  }

  // 3. Staging reference check (Fail-Closed)
  if (!url.includes(AUTHORIZED_STAGING_REF)) {
    throw new Error(
      `TARGET VERIFICATION ERROR: Configured URL does not match authorized staging project '${AUTHORIZED_STAGING_REF}'.`
    );
  }

  return url;
}
