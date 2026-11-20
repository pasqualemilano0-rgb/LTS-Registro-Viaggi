/** Payroll document viewer for the authenticated driver profile.
 * Deliberately no local/offline storage of pay slips, bearer or PDF bytes.
 */
import * as account from "../account-access.mjs";
const API = "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-payroll";
const CATEGORIES = [
 ["CEDOLINO", "CEDOLINO"],
 ["CU", "CU"],
 ["ALTRI", "ALTRI DOCUMENTI"]
];
function node(tag, className, content) {
 const el = document.createElement(tag);
 if (className) el.className = className;
 if (content !== undefined) el.textContent = content;
 return el;
}
function statusText(error) {
 if (error?.status === 401 || error?.status === 403) return "Sessione scaduta o non autorizzata. Accedi nuovamente.";
 if (error?.status === 428) return "Verifica dell'account richiesta.";
 return error?.message || "Connessione al servizio documenti non disponibile.";
}
async function request(action, id) {
 if (account.getRole() !== "driver") throw new Error("Questa sezione è riservata agli autisti.");
 const token = await account.getVerifiedAccessToken();
 const response = await fetch(API, {
  method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
  body: JSON.stringify({ action, ...(id ? { id } : {}) })
 });
 const result = await response.json().catch(() => ({}));
 if (!response.ok) {
  const error = new Error(result.error || "Richiesta non riuscita."); error.status = response.status; throw error;
 }
 return result;
}
async function pdfBytes(id) {
 const token = await account.getVerifiedAccessToken();
 const response = await fetch(API + "?action=download&id=" + encodeURIComponent(id), {
  mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
  headers: { "Authorization": "Bearer " + token }
 });
 if (!response.ok) {
  const data = await response.json().catch(() => ({}));
  const error = new Error(data.error || "Documento non disponibile."); error.status = response.status; throw error;
 }
 const blob = await response.blob();
 if (blob.type !== "application/pdf") throw new Error("Il formato ricevuto non è un PDF.");
 return blob;
}
function dialog(title) {
 const dlg = node("dialog", "lts-payroll-dialog");
 const header = node("div", "lts-payroll-head");
 const h = node("h2", "", title);
 const close = node("button", "", "Chiudi");
 close.type = "button"; close.addEventListener("click", () => dlg.close());
 header.append(h, close);
 dlg.append(header);
 document.body.append(dlg);
 dlg.addEventListener("close", () => dlg.remove(), { once: true });
 dlg.showModal();
 return dlg;
}
function displayName(item) {
 const month = item.document_month ? " · " + new Intl.DateTimeFormat("it-IT", { month: "long" })
  .format(new Date(item.document_year, item.document_month - 1, 1)) : "";
 return item.title + " · " + item.document_year + month;
}
async function showPdf(item, button) {
 button.disabled = true;
 try {
  const pdf = await pdfBytes(item.id);
  const url = URL.createObjectURL(pdf);
  const viewer = dialog("Documento PDF");
  const link = node("a", "lts-payroll-download", "Scarica PDF");
  link.href = url; link.download = "LTS-" + item.category + "-" + item.document_year + ".pdf";
  const preview = node("a", "lts-payroll-download", "Visualizza PDF");
  preview.href = url; preview.target = "_blank"; preview.rel = "noopener noreferrer";
  viewer.append(preview, link, node("p", "lts-payroll-message",
    "Apri il PDF in una nuova scheda oppure scaricalo. Alcuni telefoni supportano soltanto il download."));
  viewer.addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
 } catch (error) { window.alert(statusText(error)); }
 finally { button.disabled = false; }
}
export function openPayrollDocuments() {
 if (!account.isVerified() || account.getRole() !== "driver") {
  window.alert("Accedi con il tuo account autista per consultare i documenti.");
  return;
 }
 const dlg = dialog("I MIEI DOCUMENTI");
 const tabs = node("div", "lts-payroll-tabs");
 const message = node("p", "lts-payroll-message", "Caricamento sicuro dei documenti…");
 message.setAttribute("role", "status");
 const list = node("div", "lts-payroll-list");
 const refresh = node("button", "lts-payroll-refresh", "Aggiorna");
 refresh.type = "button";
 let selected = "CEDOLINO", docs = [], pending = false;
 const buttons = new Map();
 function render() {
  list.replaceChildren();
  for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(selected === key));
  const visible = docs.filter(doc => doc.category === selected);
  if (!visible.length) list.append(node("p", "lts-payroll-empty", "Nessun documento pubblicato in questa categoria."));
  for (const item of visible) {
   const row = node("div", "lts-payroll-row");
   const title = node("span", "", displayName(item));
   const open = node("button", "", "Apri PDF");
   open.type = "button"; open.addEventListener("click", () => showPdf(item, open));
   row.append(title, open); list.append(row);
  }
 }
 async function load() {
  if (pending || !dlg.open) return;
  pending = true; refresh.disabled = true; message.textContent = "Aggiornamento…";
  try {
   const result = await request("list");
   if (!dlg.open) return;
   if (!Array.isArray(result.documents)) throw new Error("Elenco non valido.");
   docs = result.documents;
   render();
   message.textContent = "Documenti sincronizzati con il tuo account LTS.";
  } catch (error) {
   message.textContent = statusText(error);
   // Never display a stale document list after authentication or network failure.
   docs = []; render();
  } finally { pending = false; refresh.disabled = false; }
 }
 for (const [key, label] of CATEGORIES) {
  const button = node("button", "", label); button.type = "button";
  button.addEventListener("click", () => { selected = key; render(); });
  buttons.set(key, button); tabs.append(button);
 }
 refresh.addEventListener("click", load);
 const onVisibility = () => { if (document.visibilityState === "visible" && dlg.open) void load(); };
 document.addEventListener("visibilitychange", onVisibility);
 dlg.addEventListener("close", () => document.removeEventListener("visibilitychange", onVisibility), { once: true });
 const timer = setInterval(() => { if(dlg.open && document.visibilityState === "visible") void load(); }, 60000);
 dlg.addEventListener("close", () => clearInterval(timer), { once: true });
 dlg.append(tabs, refresh, message, list);
 const cssId = "lts-payroll-style";
 if (!document.getElementById(cssId)) {
  const link = document.createElement("link");
  link.id = cssId; link.rel = "stylesheet";
  link.href = new URL("./driver.css", import.meta.url).href;
  document.head.append(link);
 }
 void load();
}
