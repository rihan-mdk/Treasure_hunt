import "server-only";
import { headers } from "next/headers";

/**
 * Resolves the client IP address in a hardened, documented fashion.
 *
 * PROXY DEPLOYMENT CONTEXT & ASSUMPTIONS:
 * 1. Cloudflare: 'cf-connecting-ip' header is edge-authoritative (overwritten by Cloudflare edge).
 * 2. Vercel / AWS CloudFront: 'x-real-ip' represents the immediate verified upstream client.
 * 3. Standard multi-hop 'x-forwarded-for': if present, the leftmost valid IP is extracted
 *    only after validating against strict IPv4/IPv6 patterns to mitigate header injection.
 * 4. Fallback: If no trusted proxy header exists (such as in local tests, isolated dev, or
 *    direct ingress without a proxy), falls back safely to '127.0.0.1'.
 */
export async function getTrustedClientIp(): Promise<string> {
  try {
    const headerList = await headers();

    // Priority 1: Cloudflare authoritative header
    const cfIp = headerList.get("cf-connecting-ip");
    if (cfIp && isValidIp(cfIp.trim())) {
      return cfIp.trim();
    }

    // Priority 2: Direct reverse proxy client header
    const realIp = headerList.get("x-real-ip");
    if (realIp && isValidIp(realIp.trim())) {
      return realIp.trim();
    }

    // Priority 3: Sanitized leftmost address from multi-hop proxy chains
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      const candidates = forwardedFor.split(",").map((c) => c.trim());
      for (const candidate of candidates) {
        if (isValidIp(candidate)) {
          return candidate;
        }
      }
    }
  } catch (err) {
    // If called outside of a request context in dev/test
    if (process.env.NODE_ENV !== "production") {
      return "127.0.0.1";
    }
    throw err;
  }

  // Development and test fallback
  if (process.env.NODE_ENV !== "production") {
    return "127.0.0.1";
  }

  // Production fallback configuration: fail closed if no trustworthy proxy header was found
  const fallbackIp = process.env.TRUSTED_PROXY_FALLBACK_IP;
  if (fallbackIp && isValidIp(fallbackIp.trim())) {
    return fallbackIp.trim();
  }

  throw new Error(
    "SECURITY_ERROR: Untrusted client IP. Production deployment requires authoritative edge proxy headers (cf-connecting-ip, x-real-ip, or x-forwarded-for)."
  );
}

/**
 * Validates basic IPv4 or IPv6 format to reject arbitrary header strings.
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
}
