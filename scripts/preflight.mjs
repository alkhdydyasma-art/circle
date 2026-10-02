#!/usr/bin/env node
// Launch preflight for Circle: environment, security, PDPL and cost caps.
//   node --env-file=.env.local scripts/preflight.mjs                 (config + code checks)
//   node --env-file=.env.local scripts/preflight.mjs --live https://your-site   (+ read-only probes)
// Exit code 1 when any check FAILS. WARN items are allowed for the demo but not for real patients.
import { readFileSync } from "node:fs";

const env = process.env;
const results = [];
const check = (area, name, ok, fix, level = "FAIL") => results.push({ area, name, status: ok ? "OK" : level, fix: ok ? "" : fix });
const src = (p) => { try { return readFileSync(new URL(`../${p}`, import.meta.url), "utf8"); } catch { return ""; } };
const num = (text, re) => Number(text.match(re)?.[1] ?? NaN);

// ── Environment ──────────────────────────────────────────────────────────────
const url = (v) => { try { return new URL(v); } catch { return null; } };
check("env", "SUPABASE_URL", !!url(env.SUPABASE_URL ?? ""), "Set SUPABASE_URL (project URL, no /rest/v1).");
check("env", "SUPABASE_ANON_KEY", (env.SUPABASE_ANON_KEY ?? "").length > 20, "Set SUPABASE_ANON_KEY.");
check("env", "SUPABASE_SERVICE_ROLE_KEY", (env.SUPABASE_SERVICE_ROLE_KEY ?? "").length > 20, "Set SUPABASE_SERVICE_ROLE_KEY (server only).");
check("env", "SITE_URL is https", url(env.SITE_URL ?? "")?.protocol === "https:", "Set SITE_URL to the public https address.");
check("env", "RATE_LIMIT_SALT", (env.RATE_LIMIT_SALT ?? "").length >= 32, "Set RATE_LIMIT_SALT to 32+ random characters.", "WARN");

// ── WhatsApp Business API readiness ─────────────────────────────────────────
check("whatsapp", "ANTHROPIC_API_KEY", /^sk-ant-/.test(env.ANTHROPIC_API_KEY ?? ""), "Set ANTHROPIC_API_KEY (console.anthropic.com).");
check("whatsapp", "N8N_WEBHOOK_SECRET ≥ 32 chars", (env.N8N_WEBHOOK_SECRET ?? "").length >= 32, "Use a long random N8N_WEBHOOK_SECRET (shared with n8n).");
check("whatsapp", "N8N_SEND_WEBHOOK_URL", !!url(env.N8N_SEND_WEBHOOK_URL ?? ""), "Set N8N_SEND_WEBHOOK_URL (n8n circle-send webhook) for front-desk replies.");
const agentWf = src("n8n/whatsapp-agent.workflow.json");
check("whatsapp", "WHATSAPP_VERIFY_TOKEN", (env.WHATSAPP_VERIFY_TOKEN ?? "").length >= 16, "Set WHATSAPP_VERIFY_TOKEN (same value you type in Meta's webhook settings).");
check("whatsapp", "WHATSAPP_APP_SECRET", (env.WHATSAPP_APP_SECRET ?? "").length >= 16, "Set WHATSAPP_APP_SECRET (Meta app → Settings → Basic → App secret).");
check("whatsapp", "n8n workflow sends messages through Circle's signature check", /x-hub-signature-256/i.test(agentWf) && /\/api\/whatsapp\/meta/.test(agentWf), "n8n/whatsapp-agent.workflow.json must call /api/whatsapp/meta.");
check("whatsapp", "n8n workflows need no server env ($env)", !/\$env\./.test(["whatsapp-agent", "whatsapp-send", "reminders", "booking-confirmation"].map((f) => src(`n8n/${f}.workflow.json`)).join("")), "Use the Settings node instead of $env (n8n Cloud blocks $env).");

// ── Security ────────────────────────────────────────────────────────────────
const inbound = src("src/app/api/whatsapp/inbound/route.ts");
check("security", "Inbound webhook requires the shared secret", /fromN8n\(request\)/.test(inbound), "Inbound route must call fromN8n().");
check("security", "Constant-time secret comparison", /timingSafeEqual/.test(src("src/lib/whatsapp.ts")), "Use timingSafeEqual for secrets.");
const autonomy = src("supabase/migrations/20261003000000_autonomy.sql");
check("security", "Ops functions are server-only", /revoke execute on function %s from public, anon, authenticated/.test(autonomy), "Revoke ops_* functions from anon/authenticated.");
const autofix = src(".github/workflows/autofix.yml");
check("security", "Auto-fix never merges without the founder", autofix && !/gh pr merge/.test(autofix), "Remove any automatic merge from .github/workflows/autofix.yml.");
check("security", "Auto-fix runs without a GitHub token in Claude's step", /persist-credentials: false/.test(autofix), "checkout must use persist-credentials: false.");

// ── PDPL (patient data) ─────────────────────────────────────────────────────
const host = url(env.SUPABASE_URL ?? "")?.hostname ?? "";
const cloud = /\.supabase\.co$/.test(host);
check("pdpl", "Database hosted in Saudi Arabia", !cloud, "Supabase Cloud is outside KSA: demo with fictional data only. Real patients → self-hosted deploy/ (Jeddah).", env.PDPL_MODE === "production" ? "FAIL" : "WARN");
check("pdpl", "Errors scrubbed before storage", /ops_scrub/.test(autonomy), "ops_record must scrub personal data.");
check("pdpl", "Conversations purged after 90 days", /90 days/.test(src("supabase/migrations/20261001000000_whatsapp_agent.sql")), "Keep the 90-day purge in agent_inbound.");
const exportSrc = src("src/app/[lang]/portal/clinic/[id]/reports/export/route.ts");
check("pdpl", "Reports carry no patient identifiers", exportSrc && !/patients\(|patient_phone|patient_name/.test(exportSrc), "CSV export must not include patient names or phones.");
check("pdpl", "Privacy notice mentions AI processing", /Anthropic/.test(src("src/i18n/portal.ts")), "Tell clinics that chats are processed by Anthropic.", "WARN");

// ── Cost caps ───────────────────────────────────────────────────────────────
const agent = src("src/lib/agent.ts");
const model = env.AGENT_MODEL || (agent.match(/AGENT_MODEL \|\| "([^"]+)"/)?.[1] ?? "");
check("cost", `Chat model is low-cost (${model})`, /haiku/.test(model), "Use claude-haiku-4-5 for routine WhatsApp chats (AGENT_MODEL).", "WARN");
check("cost", "Model calls per message ≤ 6", num(agent, /MAX_STEPS = (\d+)/) <= 6, "Lower MAX_STEPS in src/lib/agent.ts.");
check("cost", "Output tokens capped", /MAX_TOKENS = LIGHT \? (\d+)/.test(agent) && num(agent, /MAX_TOKENS = LIGHT \? (\d+)/) <= 2048, "Cap max_tokens for chat replies.");
check("cost", "History window ≤ 20 messages", num(agent, /HISTORY = (\d+)/) <= 20, "Lower HISTORY in src/lib/agent.ts.");
const limits = src("src/lib/rate-limit.ts");
check("cost", "Per-patient hourly cap", num(limits, /whatsapp: \{ limit: (\d+)/) <= 30, "Keep LIMITS.whatsapp ≤ 30/hour.");
check("cost", "Per-clinic daily cap", num(limits, /agentDay: \{ limit: (\d+)/) > 0, "Keep LIMITS.agentDay.");
check("cost", "Emergency check runs before the model", inbound.indexOf("detectEmergency(") > -1 && inbound.indexOf("detectEmergency(") < inbound.indexOf("runAgent("), "detectEmergency must run before runAgent.");
check("cost", "Circuit breaker before the model", inbound.indexOf("agentDegraded()") > -1 && inbound.indexOf("agentDegraded()") < inbound.indexOf("runAgent("), "Check agentDegraded() before runAgent.");
check("cost", "Auto-fix turn cap ≤ 30", num(autofix, /--max-turns (\d+)/) <= 30, "Set --max-turns ≤ 30 in autofix.yml.");
check("cost", "Auto-fix ≤ 3 issues/day", /3 - \(select count\(\*\)::int from public\.ops_incidents where sent_at/.test(autonomy), "Keep the daily cap in ops_incidents_to_fix.");

// ── Optional read-only probes of a running site ─────────────────────────────
const liveAt = process.argv.indexOf("--live");
if (liveAt > -1) {
  const base = (process.argv[liveAt + 1] ?? env.SITE_URL ?? "").replace(/\/$/, "");
  const probe = async (name, path, init, expect) => {
    try {
      const r = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15000) });
      check("live", `${name} → ${r.status}`, r.status === expect, `Expected ${expect}.`);
    } catch (e) { check("live", name, false, String(e)); }
  };
  await probe("GET /api/health", "/api/health", {}, 200);
  await probe("WhatsApp webhook rejects missing secret", "/api/whatsapp/inbound", { method: "POST", body: "{}" }, 401);
  await probe("Ops summary rejects missing secret", "/api/ops/summary", {}, 401);
  await probe("Ops tick rejects missing secret", "/api/ops/tick", {}, 401);
  await probe("Meta check rejects missing secret", "/api/whatsapp/meta", { method: "POST", body: "{}" }, 401);
}

const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.area.padEnd(9)} ${r.name.padEnd(w)}  ${r.fix}`);
const fails = results.filter((r) => r.status === "FAIL").length, warns = results.filter((r) => r.status === "WARN").length;
console.log(`\n${results.length - fails - warns} ok, ${warns} warnings, ${fails} failures`);
process.exit(fails ? 1 : 0);
