/** Standalone payroll admin login and document assignment view.
 * The UI never stores PDF bytes or tokens. Every request is re-authorized server-side.
 */
import * as account from "../account-access.mjs";
const API = "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-payroll";
const byId = id => document.getElementById(id);
const login = byId("login-panel"), mfa = byId("mfa-panel"), area = byId("workspace");
const loginError = byId("login-error"), mfaError = byId("mfa-error");
const uploadStatus = byId("upload-status"), listStatus = byId("list-status");
let drivers = [], documents = [], assignments = [], active = false;
function show(which) {
 login.hidden = which !== "login"; mfa.hidden = which !== "mfa"; area.hidden = which !== "area";
}
function fail(error) {
 if (error?.status === 401 || error?.status === 403) {
  active = false; show("login");
  return "Accesso non autorizzato. Effettua di nuovo l'accesso.";
 }
 return error?.message || "Servizio momentaneamente non disponibile.";
}
async function api(action, extra = {}, file = null) {
 if (!account.isVerified() || account.getRole() !== "admin")
  throw new Error("Per le paghe è richiesto l'accesso amministratore verificato.");
 const jwt = await account.getVerifiedAccessToken();
 let payload, headers = { "Authorization": "Bearer " + jwt };
 if (file) {
  payload = new FormData();
  for (const [key, value] of Object.entries(extra)) payload.append(key, String(value ?? ""));
  payload.append("file", file, file.name);
 } else {
  payload = JSON.stringify({ action, ...extra });
  headers["Content-Type"] = "application/json";
 }
 const response = await fetch(API, {
  method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
  headers, body: payload
 });
 const result = await response.json().catch(() => ({}));
 if (!response.ok) {
  const error = new Error(result.error || "Richiesta non riuscita."); error.status = response.status; throw error;
 }
 return result;
}
async function downloadPdf(doc, button) {
 button.disabled = true;
 try {
  const jwt = await account.getVerifiedAccessToken();
  const response = await fetch(API + "?action=download&id=" + encodeURIComponent(doc.id), {
   headers: { Authorization: "Bearer " + jwt }, cache: "no-store", redirect: "error",
   credentials: "omit", mode: "cors"
  });
  if (!response.ok) {
   const data = await response.json().catch(() => ({}));
   const error = new Error(data.error || "Documento non disponibile."); error.status = response.status; throw error;
  }
  const blob = await response.blob();
  if (blob.type !== "application/pdf") throw new Error("Formato del documento non valido.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url;
  link.download = "LTS-" + doc.category + "-" + doc.document_year + ".pdf";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
 } catch (error) { listStatus.textContent = fail(error); }
 finally { button.disabled = false; }
}
function button(label, onClick) {
 const el = document.createElement("button"); el.type = "button"; el.textContent = label;
 el.addEventListener("click", onClick); return el;
}
function chooseDriver(value = "") {
 const select = document.createElement("select");
 const empty = document.createElement("option");
 empty.value = ""; empty.textContent = "Seleziona autista"; select.append(empty);
 for (const driver of drivers) {
  const item = document.createElement("option");
  item.value = driver.id; item.textContent = driver.name; select.append(item);
 }
 select.value = value; return select;
}
function renderAssignments() {
 const output = byId("file-assignments");
 output.replaceChildren(); assignments = [];
 const files = [...byId("files").files];
 for (const file of files) {
  const row = document.createElement("div"); row.className = "assignment";
  const label = document.createElement("strong"); label.textContent = file.name + " · " + Math.ceil(file.size / 1024) + " KB";
  const driverLabel = document.createElement("label"); driverLabel.textContent = "Destinatario da verificare";
  const select = chooseDriver(byId("driver-filter").value);
  select.required = true; driverLabel.append(select);
  const state = document.createElement("span"); state.setAttribute("role", "status");
  row.append(label, driverLabel, state); output.append(row);
  assignments.push({ file, select, state, uploaded: false });
 }
}
function renderDocuments() {
 const output = byId("documents"); output.replaceChildren();
 const filter = byId("driver-filter").value;
 const visible = documents.filter(doc => !filter || doc.employee_id === filter);
 if (!visible.length) {
  const empty = document.createElement("p"); empty.textContent = "Nessun documento presente.";
  output.append(empty); return;
 }
 const names = new Map(drivers.map(driver => [driver.id, driver.name]));
 for (const doc of visible) {
  const card = document.createElement("article"); card.className = "doc";
  const title = document.createElement("div"); title.className = "doc-title"; title.textContent = doc.title;
  const badge = document.createElement("span"); badge.className = "tag"; badge.textContent = doc.status;
  title.append(badge);
  const sub = document.createElement("p"); sub.className = "doc-sub";
  sub.textContent = (names.get(doc.employee_id) || "Autista non disponibile") + " · " +
   doc.category + " · " + doc.document_year +
   (doc.document_month ? " / " + String(doc.document_month).padStart(2, "0") : "");
  const actions = document.createElement("div"); actions.className = "doc-actions";
  actions.append(button("Scarica PDF", event => downloadPdf(doc, event.currentTarget)));
  if (doc.status === "draft") actions.append(button("Pubblica", event =>
   changeStatus(doc, "publish", event.currentTarget)));
  if (doc.status === "published") actions.append(button("Revoca accesso", event =>
   changeStatus(doc, "revoke", event.currentTarget)));
  card.append(title, sub, actions); output.append(card);
 }
}
async function changeStatus(doc, action, control) {
 const driver = drivers.find(d => d.id === doc.employee_id);
 const text = action === "publish"
  ? "Pubblicare \"" + doc.title + "\" per " + (driver?.name || "l'autista selezionato") + "?"
  : "Revocare l'accesso al documento \"" + doc.title + "\"?";
 if (!window.confirm(text)) return;
 control.disabled = true; listStatus.textContent = "Operazione in corso…";
 try {
  await api(action, { id: doc.id });
  listStatus.textContent = action === "publish" ? "Documento pubblicato per il dipendente." : "Accesso al documento revocato.";
  await refreshDocuments();
 } catch (error) { listStatus.textContent = fail(error); }
 finally { control.disabled = false; }
}
async function refreshDocuments() {
 const result = await api("list");
 if (!Array.isArray(result.documents)) throw new Error("Elenco documenti non valido.");
 documents = result.documents; renderDocuments();
}
async function refreshAll() {
 const control = byId("refresh"); control.disabled = true;
 try {
  const [roster, rows] = await Promise.all([api("drivers"), api("list")]);
  if (!Array.isArray(roster.drivers) || !Array.isArray(rows.documents))
   throw new Error("Risposta del servizio non valida.");
  drivers = roster.drivers; documents = rows.documents;
  const previous = byId("driver-filter").value;
  const filter = byId("driver-filter"); filter.replaceChildren();
  const all = document.createElement("option"); all.value = ""; all.textContent = "Tutti gli autisti";
  filter.append(all);
  for (const item of drivers) {
   const option = document.createElement("option"); option.value = item.id; option.textContent = item.name;
   filter.append(option);
  }
  filter.value = drivers.some(x => x.id === previous) ? previous : "";
  renderDocuments(); renderAssignments();
  listStatus.textContent = "Sincronizzati " + documents.length + " documenti e " + drivers.length + " autisti.";
 } catch (error) { listStatus.textContent = fail(error); }
 finally { control.disabled = false; }
}
async function openArea() {
 const status = await account.verifySession();
 if (status.role !== "admin" || !status.mfa_enrolled || !status.mfa_verified)
  throw new Error("Sono obbligatori account amministratore e Authenticator verificato.");
 active = true; show("area"); await refreshAll();
}
byId("login-form").addEventListener("submit", async event => {
 event.preventDefault(); const submit = event.currentTarget.querySelector("button[type=submit]");
 submit.disabled = true; loginError.textContent = "";
 const pass = byId("password").value; byId("password").value = "";
 try {
  if (account.hasSession()) await account.logout(); // No implicit carryover from the main admin dashboard.
  const status = await account.login(byId("phone").value.trim(), pass);
  if (status.role !== "admin") { account.signOut(); throw new Error("Account amministratore necessario."); }
  if (!status.mfa_enrolled) throw new Error("Prima attiva Authenticator nella pagina Amministrazione LTS.");
  if (!status.mfa_verified) {
   show("mfa");
   const factors = await account.listAdminMfaFactors();
   const select = byId("factor"); select.replaceChildren();
   for (const factor of factors) {
    const option = document.createElement("option");
    option.value = factor.id; option.textContent = factor.label;
    select.append(option);
   }
   byId("factor-wrap").hidden = factors.length <= 1;
   byId("mfa").focus();
  } else await openArea();
 } catch (error) { loginError.textContent = fail(error); if (!mfa.hidden) mfaError.textContent = error.message; }
 finally { submit.disabled = false; }
});
byId("mfa-form").addEventListener("submit", async event => {
 event.preventDefault(); const submit = event.currentTarget.querySelector("button[type=submit]");
 submit.disabled = true; mfaError.textContent = "";
 try {
  await account.verifyAdminTotp(byId("mfa").value.trim(), byId("factor").value || null);
  byId("mfa").value = "";
  await openArea();
 } catch (error) { mfaError.textContent = fail(error); }
 finally { submit.disabled = false; }
});
byId("mfa-cancel").addEventListener("click", () => {
 account.signOut(); byId("mfa").value = ""; show("login");
});
byId("logout").addEventListener("click", async () => {
 active = false; documents = []; drivers = [];
 byId("documents").replaceChildren(); show("login");
 const result = await account.logout();
 if (!result.revoked) loginError.textContent = "Accesso chiuso localmente. Revoca online non confermata.";
});
byId("refresh").addEventListener("click", refreshAll);
byId("driver-filter").addEventListener("change", () => { renderDocuments(); renderAssignments(); });
byId("files").addEventListener("change", renderAssignments);
byId("category").addEventListener("change", () => {
 const cat = byId("category").value, month = byId("month");
 byId("month-wrap").hidden = cat === "CU";
 if (cat === "CU") month.value = "";
 month.required = cat === "CEDOLINO";
});
byId("year").value = String(new Date().getFullYear());
byId("month").value = String(new Date().getMonth() + 1);
byId("category").dispatchEvent(new Event("change"));
byId("upload-form").addEventListener("submit", async event => {
 event.preventDefault();
 const submit = byId("upload-submit");
 if (submit.disabled || !active) return;
 if (!assignments.length) { uploadStatus.textContent = "Seleziona almeno un PDF."; return; }
 if (assignments.some(row => !row.uploaded && !row.select.value)) {
  uploadStatus.textContent = "Per ogni PDF seleziona e conferma l'autista destinatario."; return;
 }
 submit.disabled = true; let ok = 0, failed = 0;
 const category = byId("category").value;
 const year = byId("year").value;
 const month = category === "CU" ? "" : byId("month").value;
 for (const item of assignments) {
  if (item.uploaded) continue;
  if (item.file.type !== "application/pdf" || item.file.size > 8 * 1024 * 1024) {
   item.state.textContent = "Formato o dimensione non validi."; failed++; continue;
  }
  item.state.textContent = "Caricamento…";
  try {
   await api("upload", {
    employee_id: item.select.value, category,
    document_year: year, document_month: month,
    title: item.file.name.replace(/\.pdf$/i, "").slice(0, 160)
   }, item.file);
   item.uploaded = true; ok++;
   item.state.textContent = "Bozza caricata. Verifica prima di pubblicare.";
   item.select.disabled = true;
  } catch (error) { failed++; item.state.textContent = fail(error); if (!active) break; }
 }
 uploadStatus.textContent = ok + " bozze caricate; " + failed + " errori. Nessuna bozza è visibile agli autisti.";
 if (active) await refreshDocuments().catch(error => { listStatus.textContent = fail(error); });
 if (!failed) { byId("files").value = ""; assignments = []; byId("file-assignments").replaceChildren(); }
 submit.disabled = false;
});
show("login");
