#!/usr/bin/env node
/**
 * Live conformance test for the Elefin Partner API (doc v2, read-only).
 *
 *   node scripts/test-elefin-api.mjs [--email=client@example.com] [--ipv4] [--legacy] [--env=path/to/.env] [--verbose]
 *
 * Reads ELEFIN_API_BASE_URL / ELEFIN_API_KEY / ELEFIN_API_SECRET from .env (never printed).
 * Read-only: only GET requests. Paced at ~1.1s/request to stay under 60 req/min.
 *
 * Checks: envelope, the 13-field client contract, pagination, every /clients filter + sort,
 * /clients/{id}, /clients/lookup (and the /clients?email= alternative), auth variants,
 * error codes, rate-limit headers, and (with --legacy) the endpoints the doc no longer lists.
 * Exit code 0 = all required checks passed, 1 = failures, 2 = blocked (IP allowlist / setup).
 */
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
// --ipv4 (or ELEFIN_IPV4_FIRST=1): resolve IPv4 first so the request leaves from the allowlisted IPv4.
if (args.ipv4 || process.env.ELEFIN_IPV4_FIRST === "1") dns.setDefaultResultOrder("ipv4first");
const envPath = path.resolve(args.env || path.join(process.cwd(), ".env"));
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const BASE = (env.ELEFIN_API_BASE_URL || "https://partnersapi.elefin.com/api/v1").replace(/\/+$/, "");
const KEY = env.ELEFIN_API_KEY, SECRET = env.ELEFIN_API_SECRET;
if (!KEY || !SECRET) { console.error("ELEFIN_API_KEY / ELEFIN_API_SECRET missing in " + envPath); process.exit(2); }
const TOKEN = `${KEY}.${SECRET}`;
const redact = (s) => String(s).split(KEY).join("<key>").split(SECRET).join("<secret>");

/* ── tiny harness ─────────────────────────────────────────── */
const results = [];
let section = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

function check(name, ok, detail = "", { required = true } = {}) {
  results.push({ section, name, ok: !!ok, required, detail });
  const tag = ok ? "PASS" : required ? "FAIL" : "WARN";
  console.log(`  ${tag}  ${name}${!ok && detail ? `\n        ↳ ${redact(detail)}` : args.verbose && detail ? `  (${redact(detail)})` : ""}`);
  return !!ok;
}
const head = (t) => { section = t; console.log(`\n── ${t}`); };

async function call(p, { headers, auth = "bearer" } = {}) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const h = { Accept: "application/json", ...(headers || {}) };
  if (auth === "bearer") h.Authorization = `Bearer ${TOKEN}`;
  if (auth === "pair") { h["X-API-Key"] = KEY; h["X-API-Secret"] = SECRET; }
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + p, { headers: h });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, ms: Date.now() - t0, json, text, headers: res.headers, path: p };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, json: null, text: "", error: e.message, headers: new Headers(), path: p };
  }
}

/* ── contract validators ──────────────────────────────────── */
const isIso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));
const isIsoZ = (s) => isIso(s) && /Z$/.test(s);
const DOC_FIELDS = ["client_id", "name", "country", "status", "registered_at", "referred_at", "referral_code", "funding", "trading"];

function clientProblems(c) {
  const p = [];
  if (!c || typeof c !== "object") return ["not an object"];
  if (typeof c.client_id !== "number") p.push("client_id not number");
  if (typeof c.name !== "string") p.push("name not string");
  if (c.country !== null && typeof c.country !== "string") p.push("country not string/null");
  if (!["active", "suspended", "inactive"].includes(c.status)) p.push(`status=${c.status}`);
  if (!isIsoZ(c.registered_at)) p.push(`registered_at=${c.registered_at}`);
  if (c.referred_at !== null && !isIsoZ(c.referred_at)) p.push(`referred_at=${c.referred_at}`);
  if (c.referral_code !== null && typeof c.referral_code !== "string") p.push("referral_code type");
  const f = c.funding, t = c.trading;
  if (!f || typeof f !== "object") p.push("funding missing");
  else {
    if (typeof f.currency !== "string") p.push("funding.currency");
    if (typeof f.deposits !== "number") p.push("funding.deposits");
    if (f.first_deposit_at !== null && !isIsoZ(f.first_deposit_at)) p.push("funding.first_deposit_at");
    if (typeof f.is_funded !== "boolean") p.push("funding.is_funded");
    else if (f.is_funded !== (f.first_deposit_at !== null)) p.push("is_funded inconsistent with first_deposit_at");
  }
  if (!t || typeof t !== "object") p.push("trading missing");
  else {
    if (typeof t.lots !== "number") p.push("trading.lots");
    if (t.last_trade_at !== null && !isIsoZ(t.last_trade_at)) p.push("trading.last_trade_at");
  }
  return p;
}
const extraFields = (c) => Object.keys(c).filter((k) => !DOC_FIELDS.includes(k));
const envelopeOk = (r) => r.json && typeof r.json.success === "boolean" && typeof r.json.message === "string";
const metaOk = (m) => m && ["current_page", "per_page", "last_page", "total"].every((k) => Number.isInteger(m[k]));

/** Detects the IP-allowlist block so we fail fast with a clear message instead of ~40 identical 403s. */
function isIpBlock(r) { return r.status === 403 && /not allowed for this API key/i.test(r.json?.message || ""); }

/* ── tests ────────────────────────────────────────────────── */
async function main() {
  console.log(`Elefin Partner API conformance test\nbase: ${BASE}\nenv:  ${envPath}\n`);

  head("1. Auth & connectivity");
  const me = await call("/me");
  if (isIpBlock(me)) {
    console.log(`\n  BLOCKED: ${me.json.message}\n  The key is IP-allowlisted. Run this from an allowed host (e.g. the production server) or ask Elefin to allow this IP.`);
    const bad = await call("/me", { auth: "none", headers: { Authorization: "Bearer bad.bad" } });
    console.log(`  (sanity: a bad key returns ${bad.status} "${bad.json?.message}", so the server is reachable and the real key is recognised)`);
    process.exit(2);
  }
  check("/me → 200", me.status === 200, `status ${me.status} ${me.json?.message ?? me.error ?? ""}`);
  check("/me envelope {success,message,data}", envelopeOk(me) && me.json.success === true && "data" in me.json);
  const md = me.json?.data ?? {};
  check("/me data.key.{name,abilities[],rate_limit_per_minute,expires_at}", md.key && Array.isArray(md.key.abilities) && typeof md.key.rate_limit_per_minute === "number" && "expires_at" in md.key, JSON.stringify(md.key));
  check("/me key can read clients (abilities [] = all granted, or lists clients.read)", Array.isArray(md.key?.abilities) && (md.key.abilities.length === 0 || md.key.abilities.includes("clients.read")), `abilities=${JSON.stringify(md.key?.abilities)}`);
  check("/me expires_at not in the past", !md.key?.expires_at || Date.parse(md.key.expires_at) > Date.now(), md.key?.expires_at ?? "");
  check("/me scope.partner.{id,name}", md.scope?.partner && md.scope.partner.id != null && typeof md.scope.partner.name === "string", JSON.stringify(md.scope));
  check("/me totals.clients is a number", typeof md.totals?.clients === "number", JSON.stringify(md.totals));
  check("/me data_availability.trades_from", md.data_availability && "trades_from" in md.data_availability, JSON.stringify(md.data_availability));
  check("/me conventions USD / UTC / lots", md.conventions?.currency === "USD" && md.conventions?.timezone === "UTC" && md.conventions?.volume_unit === "lots", JSON.stringify(md.conventions));
  check("rate-limit headers present on response", me.headers.get("x-ratelimit-limit") && me.headers.get("x-ratelimit-remaining") != null,
    `limit=${me.headers.get("x-ratelimit-limit")} remaining=${me.headers.get("x-ratelimit-remaining")}`);
  const docLimit = Number(me.headers.get("x-ratelimit-limit"));
  check(`configured ELEFIN_RATE_LIMIT_PER_MIN (${env.ELEFIN_RATE_LIMIT_PER_MIN || "default 60"}) ≤ key limit (${docLimit})`,
    !docLimit || Number(env.ELEFIN_RATE_LIMIT_PER_MIN || 60) <= docLimit);

  const pair = await call("/me", { auth: "pair" });
  check("X-API-Key / X-API-Secret header pair accepted", pair.status === 200, `status ${pair.status}`);
  const keyOnly = await call("/me", { auth: "none", headers: { Authorization: `Bearer ${KEY}` } });
  check("public key alone → 401", keyOnly.status === 401, `status ${keyOnly.status}`);
  const noAuth = await call("/me", { auth: "none" });
  check("no credential → 401 with envelope", noAuth.status === 401 && envelopeOk(noAuth) && noAuth.json.success === false, `status ${noAuth.status}`);
  const bad = await call("/me", { auth: "none", headers: { Authorization: "Bearer bad.bad" } });
  check("bad credential → 401", bad.status === 401, `status ${bad.status}`);

  head("2. GET /clients — list, shape, pagination");
  const l1 = await call("/clients?per_page=5");
  check("/clients → 200", l1.status === 200, `status ${l1.status} ${l1.json?.message ?? ""}`);
  const ld = l1.json?.data;
  check("double-nested paginator data.data[] + data.meta", Array.isArray(ld?.data) && metaOk(ld?.meta), JSON.stringify(ld?.meta));
  check("per_page honoured (≤5 rows)", (ld?.data?.length ?? 99) <= 5 && ld?.meta?.per_page === 5, `rows=${ld?.data?.length} per_page=${ld?.meta?.per_page}`);
  check("meta.total matches /me totals.clients", ld?.meta?.total === md.totals?.clients, `list=${ld?.meta?.total} me=${md.totals?.clients}`, { required: false });
  const rows = ld?.data ?? [];
  const bad13 = rows.map((c) => [c.client_id, clientProblems(c)]).filter(([, p]) => p.length);
  check(`every row matches the 13-field contract (${rows.length} rows)`, rows.length > 0 && !bad13.length, bad13.slice(0, 3).map(([id, p]) => `${id}: ${p.join(", ")}`).join(" | ") || "no rows returned");
  const extras = [...new Set(rows.flatMap(extraFields))];
  check("no undocumented extra fields (code expects none)", !extras.length, `extra: ${extras.join(", ")}`, { required: false });
  check("default order is newest registered first", rows.every((c, i) => i === 0 || Date.parse(rows[i - 1].registered_at) >= Date.parse(c.registered_at)));
  const first = rows[0];

  const alias = await call("/clients?limit=2");
  check("limit= alias works as per_page", alias.status === 200 && alias.json?.data?.meta?.per_page === 2 && alias.json.data.data.length <= 2, `status ${alias.status} per_page=${alias.json?.data?.meta?.per_page}`);
  const big = await call("/clients?per_page=200&page=1");
  check("per_page=200 accepted", big.status === 200 && big.json?.data?.meta?.per_page === 200, `status ${big.status} per_page=${big.json?.data?.meta?.per_page}`);
  const tooBig = await call("/clients?per_page=201");
  check("per_page=201 is clamped or rejected (not 5xx)", tooBig.status < 500 && (tooBig.status === 200 ? tooBig.json?.data?.meta?.per_page <= 200 : true), `status ${tooBig.status} per_page=${tooBig.json?.data?.meta?.per_page}`);
  const last = ld?.meta?.last_page ?? 1;
  const p2 = last > 1 ? await call(`/clients?per_page=5&page=2`) : null;
  if (p2) {
    const ids1 = new Set(rows.map((c) => c.client_id));
    check("page 2 has no overlap with page 1", p2.status === 200 && !(p2.json?.data?.data ?? []).some((c) => ids1.has(c.client_id)));
  } else check("page 2 overlap (skipped: only one page)", true, "", { required: false });
  const past = await call("/clients?page=999999");
  check("page past last_page → 200 + empty array (not an error)", past.status === 200 && Array.isArray(past.json?.data?.data) && past.json.data.data.length === 0, `status ${past.status}`);

  head("3. GET /clients — sort & filters");
  const sortChecks = [
    ["registered_at", "asc", (c) => Date.parse(c.registered_at), 1],
    ["registered_at", "desc", (c) => Date.parse(c.registered_at), -1],
    ["client_id", "asc", (c) => c.client_id, 1],
    ["client_id", "desc", (c) => c.client_id, -1],
    ["name", "asc", (c) => c.name.toLowerCase(), 1],
  ];
  for (const [s, d, key, dir] of sortChecks) {
    const r = await call(`/clients?per_page=20&sort=${s}&direction=${d}`);
    const a = r.json?.data?.data ?? [];
    const ok = r.status === 200 && a.length > 0 && a.every((c, i) => i === 0 || (dir > 0 ? key(a[i - 1]) <= key(c) : key(a[i - 1]) >= key(c)));
    check(`sort=${s} direction=${d}`, ok, `status ${r.status} rows=${a.length}`);
  }
  const badSort = await call("/clients?sort=bogus");
  check("unknown sort value doesn't 5xx", badSort.status < 500, `status ${badSort.status}`);

  const fund = await call("/clients?per_page=50&funded_only=1");
  const fr = fund.json?.data?.data ?? [];
  check("funded_only=1 → only is_funded:true", fund.status === 200 && fr.every((c) => c.funding?.is_funded === true), `status ${fund.status} rows=${fr.length}`);
  for (const st of ["active", "suspended", "inactive"]) {
    const r = await call(`/clients?per_page=50&status=${st}`);
    const a = r.json?.data?.data ?? [];
    check(`status=${st} → only that status (${a.length} rows)`, r.status === 200 && a.every((c) => c.status === st), `status ${r.status}`);
  }
  if (first?.country) {
    const r = await call(`/clients?per_page=50&country=${encodeURIComponent(first.country)}`);
    const a = r.json?.data?.data ?? [];
    check(`country=${first.country} → only that country (${a.length} rows)`, r.status === 200 && a.length > 0 && a.every((c) => c.country === first.country), `status ${r.status}`);
  }
  const none = await call("/clients?country=Atlantis");
  check("filter matching nothing → 200 + empty (not an error)", none.status === 200 && none.json?.data?.data?.length === 0 && none.json?.data?.meta?.total === 0, `status ${none.status}`);
  if (first) {
    const day = first.registered_at.slice(0, 10);
    const r = await call(`/clients?per_page=200&registered_from=${day}&registered_to=${day}`);
    const a = r.json?.data?.data ?? [];
    check(`registered_from/to = ${day} → rows within that day, includes first row`, r.status === 200 && a.some((c) => c.client_id === first.client_id) && a.every((c) => c.registered_at.slice(0, 10) === day), `status ${r.status} rows=${a.length}`);
    const future = await call("/clients?registered_from=2099-01-01");
    check("registered_from in the future → empty", future.status === 200 && future.json?.data?.data?.length === 0, `status ${future.status}`);
  }
  const since = new Date(Date.now() - 36e5).toISOString().replace(/\.\d+Z$/, "Z");
  const upd = await call(`/clients?per_page=5&updated_from=${encodeURIComponent(since)}`);
  check("updated_from (ISO timestamp) accepted", upd.status === 200 && metaOk(upd.json?.data?.meta), `status ${upd.status} ${upd.json?.message ?? ""}`);
  const updFuture = await call(`/clients?updated_from=${encodeURIComponent("2099-01-01T00:00:00Z")}`);
  check("updated_from in the future → empty", updFuture.status === 200 && updFuture.json?.data?.data?.length === 0, `status ${updFuture.status}`);
  const updAll = await call(`/clients?per_page=1&updated_from=${encodeURIComponent("2000-01-01T00:00:00Z")}`);
  check("updated_from far past ≈ full roster", updAll.status === 200 && updAll.json?.data?.meta?.total === ld?.meta?.total, `total=${updAll.json?.data?.meta?.total} vs ${ld?.meta?.total}`, { required: false });

  head("4. GET /clients/{id}");
  if (first) {
    const one = await call(`/clients/${first.client_id}`);
    check("/clients/{id} → 200", one.status === 200, `status ${one.status} ${one.json?.message ?? ""}`);
    const d = one.json?.data;
    check("object directly under data (no paginator)", d && !Array.isArray(d) && d.client_id === first.client_id && !("meta" in d), JSON.stringify(Object.keys(d || {})));
    check("detail passes the 13-field contract", !clientProblems(d).length, clientProblems(d).join(", "));
    check("detail equals the matching /clients row", JSON.stringify(d) === JSON.stringify(first) || JSON.stringify(Object.keys(d || {}).sort()) === JSON.stringify(Object.keys(first).sort()),
      "values differ (may be legit if data changed between calls)", { required: false });
  } else check("/clients/{id} (skipped: no clients returned)", false, "list was empty");
  const miss = await call("/clients/99999999");
  check("unknown id → 404 with {success:false} envelope", miss.status === 404 && envelopeOk(miss) && miss.json.success === false, `status ${miss.status} body=${miss.text.slice(0, 80)}`);
  const nonNum = await call("/clients/abc");
  check("non-numeric id → 404/422 (not 5xx)", [404, 422, 400].includes(nonNum.status), `status ${nonNum.status}`);

  head("5. GET /clients/lookup  (and the /clients?email= alternative)");
  const email = args.email && args.email !== true ? String(args.email) : null;
  const lkMiss = await call(`/clients/lookup?email=${encodeURIComponent("nobody-zzz-12345@example.com")}`);
  const lookupWorks = lkMiss.status === 200;
  check("/clients/lookup responds with the API envelope (404 'Resource not found' with empty body = route missing on host)",
    lookupWorks, `status ${lkMiss.status} body=${JSON.stringify(lkMiss.text.slice(0, 100))}`);
  if (lookupWorks) {
    check("miss → affiliated:false and no client data (an echoed email is fine)", lkMiss.json?.data?.affiliated === false && !("client_id" in lkMiss.json.data) && !("funding" in lkMiss.json.data), JSON.stringify(lkMiss.json?.data));
    const noEmail = await call("/clients/lookup");
    check("missing email param → 4xx (not 5xx)", noEmail.status >= 400 && noEmail.status < 500, `status ${noEmail.status}`);
    if (email) {
      const hit = await call(`/clients/lookup?email=${encodeURIComponent(email)}`);
      const d = hit.json?.data;
      check("known email → affiliated:true + client fields", hit.status === 200 && d?.affiliated === true && typeof d.client_id === "number" && !clientProblems(d).length, `status ${hit.status} ${clientProblems(d).join(", ")}`);
    } else check("known-email lookup (skipped: pass --email=…)", true, "", { required: false });
  }
  const eqMiss = await call(`/clients?email=${encodeURIComponent("nobody-zzz-12345@example.com")}&per_page=1`);
  check("/clients?email=<unknown> → 200 + empty array", eqMiss.status === 200 && Array.isArray(eqMiss.json?.data?.data) && eqMiss.json.data.data.length === 0, `status ${eqMiss.status}`);
  if (email) {
    const eq = await call(`/clients?email=${encodeURIComponent(email)}&per_page=1`);
    const a = eq.json?.data?.data ?? [];
    check("/clients?email=<known> → exactly the one client", eq.status === 200 && a.length === 1 && !clientProblems(a[0]).length, `status ${eq.status} rows=${a.length}`);
    // does the filter really filter, or is it silently ignored?
    check("/clients?email= actually filters (total < roster)", (eq.json?.data?.meta?.total ?? Infinity) < (ld?.meta?.total ?? 0) || (ld?.meta?.total ?? 0) <= 1, `total=${eq.json?.data?.meta?.total}`);
  }
  const fp = await call(`/clients?email=${encodeURIComponent("nobody-zzz-12345@example.com")}&per_page=1`);
  check("email filter on a stranger doesn't return the whole roster", (fp.json?.data?.data?.length ?? 0) === 0, `rows=${fp.json?.data?.data?.length}`);

  head("6. Data-quality cross-checks (whole roster, read via per_page=200)");
  const all = [];
  for (let pg = 1; pg <= Math.min(last > 1 ? Math.ceil((ld?.meta?.total ?? 0) / 200) : 1, 15); pg++) {
    const r = await call(`/clients?per_page=200&page=${pg}`);
    if (r.status !== 200) { check(`roster page ${pg}`, false, `status ${r.status}`); break; }
    all.push(...r.json.data.data);
  }
  if (all.length) {
    check(`roster size (${all.length}) equals meta.total (${ld?.meta?.total})`, all.length === ld?.meta?.total);
    check("client_id unique across roster", new Set(all.map((