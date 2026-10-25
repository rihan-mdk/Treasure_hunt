/**
 * Fail-closed security guard for Supabase environment connections.
 *
 * Authorized remote targets:
 *   - Staging:    uguvotvttdtclnhbsywr
 *   - Production: zbeglxowlfdkhwyadcst
 *
 * Strictly forbidden (connection is aborted regardless of any other setting):
 *   - kcupmzqnyitkchkmftcl
 *
 * Any URL that is not local (127.0.0.1 / localhost) and does not contain one
 * of the two authorized project refs is also rejected (fail-closed).
 */

export const FORBIDDEN_PRODUCTION_REF    = "kcupmzqnyitkchkmftcl";
export const AUTHORIZED_STAGING_REF      = "uguvotvttdtclnhbsywr";
export const AUTHORIZED_PRODUCTION_REF   = "zbeglxowlfdkhwyadcst";

/** All refs that are permitted to receive database connections. */
const AUTHORIZED_REFS: readonly string[] = [
  AUTHORIZED_STAGING_REF,
  AUTHORIZED_PRODUCTION_REF,
] as const;

export function assertSafeDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE CONFIG ERROR: Supabase URL is undefined or empty.");
  }

  // 1. Forbidden project — hard reject regardless of any other condition.
  if (url.includes(FORBIDDEN_PRODUCTION_REF)) {
    throw new Error(
      `FATAL SECURITY TRAP: Attempted connection to strictly forbidden project '${FORBIDDEN_PRODUCTION_REF}'. Execution aborted.`
    );
  }

  // 2. Allow local test environments (e.g. 127.0.0.1, localhost).
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  if (isLocal) {
    return url;
  }

  // 3. Allow-list check — fail-closed for any unknown remote host.
  // Validates exact project reference match on the Supabase hostname or pooler identity,
  // preventing loose substring bypasses in query parameters, paths, or arbitrary domains.
  let isAuthorized = false;
  try {
    const parsed = new URL(url);
    for (const ref of AUTHORIZED_REFS) {
      if (parsed.hostname === `${ref}.supabase.co`) {
        isAuthorized = true;
        break;
      }
      if (
        parsed.hostname.endsWith(".pooler.supabase.com") &&
        (parsed.username === `postgres.${ref}` || parsed.username === ref)
      ) {
        isAuthorized = true;
        break;
      }
    }
  } catch {
    isAuthorized = false;
  }

  if (!isAuthorized) {
    throw new Error(
      `TARGET VERIFICATION ERROR: Configured URL does not match any authorized project ref. ` +
        `Authorized refs: [${AUTHORIZED_REFS.join(", ")}].`
    );
  }

  return url;
}
