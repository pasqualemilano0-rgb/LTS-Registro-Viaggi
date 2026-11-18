/** LTS payroll: a dedicated, server-authorized document API.
 * Files never pass through GitHub, IndexedDB, realtime broadcasts or public URLs.
 * Deploy only after the private bucket and SQL migration are verified.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ORIGIN = "https://pasqualemilano0-rgb.github.io";
const BUCKET = "lts-payroll-private";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^Bearer ([A-Za-z0-9._-]{50,4096})$/;
const MAX_PDF = 8 * 1024 * 1024;
const MAX_BODY = MAX_PDF + 32768;
const CATEGORIES = new Set(["CEDOLINO", "CU", "ALTRI"]);

function key(current: string, legacy: string): string | null {
 const raw = Deno.env.get(current);
 if (raw) try {
  const parsed = JSON.parse(raw);
  if (typeof parsed?.default === "string" && parsed.default.length > 10) return parsed.default;
 } catch { /* legacy fallback */ }
 return Deno.env.get(legacy) || null;
}
function pair() {
 const url = Deno.env.get("SUPABASE_URL");
 const pub = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
 const secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
 if (!url || !pub || !secret) throw { status: 503 };
 const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
 return { public: createClient(url, pub, { auth }), admin: createClient(url, secret, { auth }) };
}
function headers(origin: string | null, extra: Record<string,string> = {}) {
 return {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache",
  "Vary": "Origin", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  ...(origin === ORIGIN ? {
   "Access-Control-Allow-Origin": ORIGIN,
   "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
   "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  } : {}), ...extra
 };
}
function json(value: unknown, status: number, origin: string | null) {
 return new Response(JSON.stringify(value), {
  status, headers: headers(origin, { "Content-Type": "application/json; charset=utf-8" })
 });
}
function parseSessionId(jwt: string): string | null {
 // Only used AFTER public.auth.getUser(jwt) verifies the token identity.
 const segment = jwt.split(".")[1];
 if (!segment || segment.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(segment)) return null;
 try {
  const raw = segment.replace(/-/g, "+").replace(/_/g, "/");
  const claims = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")));
  return UUID.test(claims?.session_id || "") ? claims.session_id : null;
 } catch { return null; }
}
function aal2(jwt: string): boolean {
 const segment = jwt.split(".")[1];
 if (!segment || segment.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(segment)) return false;
 try {
  const raw = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")))?.aal === "aal2";
 } catch { return false; }
}
async function authorized(req: Request, clients: ReturnType<typeof pair>) {
 const match = TOKEN.exec(req.headers.get("authorization") || "");
 if (!match) throw { status: 401 };
 const jwt = match[1];
 const { data, error } = await clients.public.auth.getUser(jwt);
 const id = data?.user?.id;
 if (error || !UUID.test(id || "")) throw { status: 401 };
 const { data: account, error: accessError } = await clients.admin.from("lts_account_access")
  .select("user_id,role,enabled,removed_at").eq("user_id", id).maybeSingle();
 if (accessError) throw { status: 503 };
 if (!account || account.enabled !== true || account.removed_at ||
  !["admin", "driver"].includes(account.role)) throw { status: 403 };
 const sessionId = parseSessionId(jwt);
 if (!sessionId) throw { status: 401 };
 const { data: active, error: sessionError } = await clients.admin.rpc("lts_session_is_active",
  { p_user_id: id, p_session_id: sessionId });
 if (sessionError || typeof active !== "boolean") throw { status: 503 };
 if (!active) throw { status: 403 };
 if (account.role === "admin") {
  const { data: factor, error: factorError } = await clients.admin.rpc("lts_admin_verified_totp_factor",
   { p_user_id: id });
  if (factorError) throw { status: 503 };
  // Payroll is stricter than legacy admin: enrolled AND recently verified MFA required.
  if (!UUID.test(factor || "") || !aal2(jwt)) throw { status: 428 };
 }
 return { id, role: account.role };
}
function adminOnly(user: { id:string,role:string }) {
 if (user.role !== "admin") throw { status: 403 };
}
async function bytes(req: Request, max: number): Promise<Uint8Array> {
 const length = req.headers.get("content-length");
 if (length !== null && (!/^\d+$/.test(length) || Number(length) > max))
  throw { status: 413 };
 const reader = req.body?.getReader();
 if (!reader) throw { status: 400 };
 const parts: Uint8Array[] = []; let total = 0;
 try {
  for (;;) {
   const { done, value } = await reader.read();
   if (done) break;
   total += value.byteLength;
   if (total > max) { await reader.cancel(); throw { status: 413 }; }
   parts.push(value);
  }
 } finally { reader.releaseLock(); }
 const merged = new Uint8Array(total); let at = 0;
 for (const part of parts) { merged.set(part, at); at += part.length; }
 return merged;
}
async function jsonBody(req: Request) {
 if (!(req.headers.get("content-type") || "").startsWith("application/json")) throw { status: 415 };
 const raw = await bytes(req, 16384);
 try {
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw 0;
  return result;
 } catch { throw { status: 400 }; }
}
async function validDriver(db: ReturnType<typeof pair>["admin"], employee: unknown) {
 if (typeof employee !== "string" || !UUID.test(employee)) throw { status: 400 };
 const { data, error } = await db.from("lts_account_access").select("user_id")
  .eq("user_id", employee).eq("role", "driver").eq("enabled", true).is("removed_at", null).maybeSingle();
 if (error) throw { status: 503 };
 if (!data) throw { status: 409 };
 return employee;
}
async function audit(db: ReturnType<typeof pair>["admin"], doc: string, actor: string, action: string) {
 const { error } = await db.from("lts_payroll_audit").insert({
  document_id: doc, actor_id: actor, action
 });
 if (error) throw { status: 503 };
}
function textField(input: unknown, max: number): string {
 if (typeof input !== "string") throw { status: 400 };
 const result = input.trim();
 if (!result || result.length > max || /[\u0000-\u001f]/.test(result)) throw { status: 400 };
 return result;
}
async function upload(req: Request, user: {id:string,role:string}, db: ReturnType<typeof pair>["admin"]) {
 adminOnly(user);
 const type = req.headers.get("content-type") || "";
 if (!type.toLowerCase().startsWith("multipart/form-data;")) throw { status: 415 };
 const raw = await bytes(req, MAX_BODY);
 const decoded = new Request("https://local.invalid/", {
  method: "POST", headers: { "Content-Type": type }, body: raw
 });
 const form = await decoded.formData().catch(() => { throw { status: 400 }; });
 const file = form.get("file");
 if (!(file instanceof File) || file.size < 10 || file.size > MAX_PDF ||
  file.type !== "application/pdf") throw { status: 415 };
 const first = new Uint8Array(await file.slice(0, 5).arrayBuffer());
 if (new TextDecoder().decode(first) !== "%PDF-") throw { status: 415 };
 const employeeId = await validDriver(db, form.get("employee_id"));
 const category = form.get("category");
 const year = Number(form.get("document_year"));
 const monthRaw = form.get("document_month");
 const month = monthRaw === "" || monthRaw === null ? null : Number(monthRaw);
 if (typeof category !== "string" || !CATEGORIES.has(category) ||
  !Number.isInteger(year) || year < 2000 || year > 2100 ||
  (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) ||
  (category === "CEDOLINO" && month === null) ||
  (category === "CU" && month !== null)) throw { status: 400 };
 const title = textField(form.get("title"), 160);
 const filename = textField(file.name.replace(/[^\w.\- ]/g, "_"), 180);
 const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
 const sha256 = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
 const path = employeeId + "/" + crypto.randomUUID() + ".pdf";
 const { error: storageError } = await db.storage.from(BUCKET)
  .upload(path, file, { contentType: "application/pdf", cacheControl: "0", upsert: false });
 if (storageError) throw { status: 503 };
 const { data, error } = await db.from("lts_payroll_documents").insert({
  employee_id: employeeId, uploaded_by: user.id, category,
  document_year: year, document_month: month, title,
  original_filename: filename, object_path: path, size_bytes: file.size, sha256
 }).select("id").single();
 if (error || !data?.id) {
  await db.storage.from(BUCKET).remove([path]);
  throw { status: 503 };
 }
 try { await audit(db, data.id, user.id, "upload"); }
 catch {
  await db.from("lts_payroll_documents").delete().eq("id", data.id).eq("status", "draft");
  await db.storage.from(BUCKET).remove([path]);
  throw { status: 503 };
 }
 return { id: data.id, status: "draft" };
}
async function drivers(db: ReturnType<typeof pair>["admin"]) {
 const { data: accounts, error: ae } = await db.from("lts_account_access")
  .select("user_id").eq("role", "driver").eq("enabled", true).is("removed_at", null).limit(500);
 if (ae) throw { status: 503 };
 const ids = new Set((accounts || []).map((x: {user_id:string}) => x.user_id));
 if (!ids.size) return [];
 const { data: names, error: ne } = await db.from("lts_pending_drivers")
  .select("auth_user_id,first_name,last_name").in("auth_user_id", [...ids]).is("removed_at", null).limit(500);
 if (ne) throw { status: 503 };
 return (names || []).filter((x: {auth_user_id:string}) => ids.has(x.auth_user_id))
  .map((x: {auth_user_id:string,first_name:string,last_name:string}) => ({
   id: x.auth_user_id, name: (x.first_name + " " + x.last_name).trim()
  })).sort((a: {name:string}, b: {name:string}) => a.name.localeCompare(b.name, "it"));
}
async function list(db: ReturnType<typeof pair>["admin"], user: {id:string,role:string}) {
 let query = db.from("lts_payroll_documents")
  .select("id,employee_id,category,document_year,document_month,title,status,created_at,published_at")
  .order("created_at", { ascending: false }).limit(500);
 if (user.role === "driver") query = query.eq("employee_id", user.id).eq("status", "published");
 const { data, error } = await query;
 if (error) throw { status: 503 };
 return data || [];
}
async function setStatus(db: ReturnType<typeof pair>["admin"], user: {id:string,role:string},
 id: unknown, next: "published" | "revoked") {
 adminOnly(user);
 if (typeof id !== "string" || !UUID.test(id)) throw { status: 400 };
 const { data: existing, error: before } = await db.from("lts_payroll_documents")
  .select("employee_id,status").eq("id", id).maybeSingle();
 if (before) throw { status: 503 };
 if (!existing || existing.status !== (next === "published" ? "draft" : "published"))
  throw { status: 409 };
 await validDriver(db, existing.employee_id);
 const now = new Date().toISOString();
 const update = next === "published"
  ? { status: "published", published_at: now }
  : { status: "revoked", revoked_at: now };
 const { data, error } = await db.from("lts_payroll_documents").update(update)
  .eq("id", id).eq("status", existing.status).select("id").maybeSingle();
 if (error) throw { status: 503 };
 if (!data) throw { status: 409 };
 await audit(db, id, user.id, next === "published" ? "publish" : "revoke");
 return { id, status: next };
}
async function download(db: ReturnType<typeof pair>["admin"], user: {id:string,role:string}, id: string, origin: string|null) {
 if (!UUID.test(id)) throw { status: 400 };
 let query = db.from("lts_payroll_documents")
  .select("id,employee_id,object_path,status").eq("id", id);
 if (user.role === "driver") query = query.eq("employee_id", user.id).eq("status", "published");
 const { data, error } = await query.maybeSingle();
 if (error) throw { status: 503 };
 if (!data) throw { status: 404 };
 if (user.role === "driver") await validDriver(db, user.id);
 if (user.role === "admin" && !["draft", "published"].includes(data.status)) throw { status: 404 };
 if (!data.object_path.startsWith(data.employee_id + "/")) throw { status: 503 };
 const { data: file, error: storageError } = await db.storage.from(BUCKET).download(data.object_path);
 if (storageError || !file) throw { status: 503 };
 await audit(db, id, user.id, "download");
 return new Response(file.stream(), { status: 200, headers: headers(origin, {
  "Content-Type": "application/pdf",
  "Content-Disposition": 'attachment; filename="documento-lts.pdf"',
  "Content-Security-Policy": "default-src 'none'; sandbox"
 }) });
}
Deno.serve(async req => {
 const origin = req.headers.get("origin");
 if (origin && origin !== ORIGIN) return json({ error: "Origine non autorizzata." }, 403, origin);
 if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
 if (!["GET", "POST"].includes(req.method)) return json({ error: "Metodo non consentito." }, 405, origin);
 try {
  const db = pair();
  const user = await authorized(req, db);
  if (req.method === "GET") {
   const url = new URL(req.url);
   if (url.searchParams.get("action") !== "download") throw { status: 400 };
   return await download(db.admin, user, url.searchParams.get("id") || "", origin);
  }
  if ((req.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data;")) {
   return json(await upload(req, user, db.admin), 201, origin);
  }
  const input = await jsonBody(req);
  if (input.action === "drivers") {
   adminOnly(user);
   return json({ drivers: await drivers(db.admin) }, 200, origin);
  }
  if (input.action === "list") return json({ documents: await list(db.admin, user) }, 200, origin);
  if (input.action === "publish" || input.action === "revoke") {
   return json(await setStatus(db.admin, user, input.id, input.action === "publish" ? "published" : "revoked"), 200, origin);
  }
  throw { status: 400 };
 } catch (err) {
  const status = [400, 401, 403, 404, 405, 409, 413, 415, 428].includes(err?.status) ? err.status : 503;
  const message = ({
   400: "Dati non validi.", 401: "Accedi al tuo account.", 403: "Accesso non autorizzato.",
   404: "Documento non disponibile.", 409: "Dati cambiati: aggiorna l'elenco.",
   413: "PDF troppo grande.", 415: "Carica un PDF valido.",
   428: "Verifica MFA amministratore obbligatoria.", 503: "Servizio temporaneamente non disponibile."
  } as Record<number,string>)[status];
  return json({ error: message }, status, origin);
 }
});
