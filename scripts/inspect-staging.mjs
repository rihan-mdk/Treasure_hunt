import fs from "node:fs";
import path from "node:path";

// 1. Read .env.local safely
const envFile = fs.readFileSync(path.resolve(".env.local"), "utf-8");
let supabaseUrl = "";
let anonKey = "";

for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
    supabaseUrl = trimmed.split("=")[1].trim();
  }
  if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
    anonKey = trimmed.split("=")[1].trim();
  }
}

// 2. Strict Safety Guard Checks
const FORBIDDEN_PRODUCTION_REF = "kcupmzqnyitkchkmftcl";
const AUTHORIZED_STAGING_REF = "uguvotvttdtclnhbsywr";

if (supabaseUrl.includes(FORBIDDEN_PRODUCTION_REF)) {
  throw new Error("FATAL: Attempted connection to production project! Aborted immediately.");
}

if (!supabaseUrl.includes(AUTHORIZED_STAGING_REF)) {
  throw new Error(`FATAL: Configured URL does not match authorized staging ref '${AUTHORIZED_STAGING_REF}'!`);
}

// Parse JWT to verify ref inside token
const payloadBase64 = anonKey.split(".")[1];
const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf-8");
const tokenPayload = JSON.parse(payloadJson);

if (tokenPayload.ref !== AUTHORIZED_STAGING_REF) {
  throw new Error(`FATAL: Token ref '${tokenPayload.ref}' does not match authorized staging ref '${AUTHORIZED_STAGING_REF}'!`);
}

console.log("================================================================================");
console.log("READ-ONLY STAGING INSPECTION: PROJECT IDENTITY VERIFIED");
console.log("Target Project Ref:", AUTHORIZED_STAGING_REF);
console.log("Host:", supabaseUrl);
console.log("Token Role:", tokenPayload.role);
console.log("Token Ref:", tokenPayload.ref);
console.log("================================================================================");

// 3. Inspect OpenAPI / Swagger definition of public schema via PostgREST
async function inspectPostgrest() {
  console.log("\n1. Fetching PostgREST Schema Metadata (GET /rest/v1/)...");
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
      },
    });

    console.log("HTTP Status:", res.status, res.statusText);
    if (!res.ok) {
      console.log("Could not fetch schema metadata:", await res.text());
      return;
    }

    const openapi = await res.json();
    console.log("OpenAPI Title:", openapi.info?.title);
    console.log("OpenAPI Description:", openapi.info?.description);
    
    const paths = Object.keys(openapi.paths || {});
    console.log("Exposed Tables / Endpoints Count:", paths.length);
    console.log("Exposed Endpoints:", paths);

    const definitions = Object.keys(openapi.definitions || {});
    console.log("Table Definitions Count:", definitions.length);
    console.log("Table Definitions:", definitions);

    // 4. For each definition, attempt a read-only count query
    console.log("\n2. Inspecting Exposed Table Row Counts (Read-Only)...");
    for (const def of definitions) {
      try {
        const countRes = await fetch(`${supabaseUrl}/rest/v1/${def}?select=*`, {
          method: "HEAD",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
            "Range-Unit": "items",
            "Range": "0-0",
            "Prefer": "count=exact",
          },
        });
        const contentRange = countRes.headers.get("content-range");
        console.log(`- ${def}: HTTP ${countRes.status} | content-range: ${contentRange || "none"}`);
      } catch (err) {
        console.log(`- ${def}: Error: ${err.message}`);
      }
    }

    // 5. Check RPC endpoints in paths
    const rpcEndpoints = paths.filter(p => p.startsWith("/rpc/"));
    console.log("\n3. Exposed RPC Functions Count:", rpcEndpoints.length);
    console.log("Exposed RPCs:", rpcEndpoints);

  } catch (err) {
    console.error("Inspection error:", err.message);
  }
}

// 6. Test common table endpoints specifically (including migration tables)
async function testSpecificTables() {
  console.log("\n4. Probing Known Schema and Migration Tables (Read-Only HEAD / GET)...");
  const candidates = [
    "levels",
    "questions",
    "question_keys",
    "hints",
    "teams",
    "marshals",
    "event_config",
    "team_progress",
    "team_hints",
    "team_sessions",
    "marshal_sessions",
    "treasure_secrets",
    "winner_verifications",
    "auth_rate_limits",
    "schema_migrations",
    "supabase_migrations",
    "_prisma_migrations"
  ];

  for (const table of candidates) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
        method: "HEAD",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Range-Unit": "items",
          "Range": "0-0",
          "Prefer": "count=exact",
        },
      });
      const range = res.headers.get("content-range");
      console.log(`- Probe '${table}': Status ${res.status} (${res.statusText}) | Content-Range: ${range || "N/A"}`);
    } catch (err) {
      console.log(`- Probe '${table}': Failed to fetch (${err.message})`);
    }
  }
}

await inspectPostgrest();
await testSpecificTables();
