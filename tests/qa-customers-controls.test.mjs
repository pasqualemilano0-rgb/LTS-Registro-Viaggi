import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../app.css',import.meta.url),'utf8');

test('explicit Aggiorna awaits request and reports success or error without disabling silently',()=>{
 const a=app.indexOf('async function refreshCompanyCustomers()');
 const b=app.indexOf('function customerRefreshControl(',a);
 const c=app.indexOf('function companyCustomersPanel(',b);
 assert.ok(a>0&&b>a&&c>b);
 const refresh=app.slice(a,b),control=app.slice(b,c);
 assert.match(refresh,/return false;/);
 assert.match(refresh,/return true;/);
 assert.match(refresh,/companyCustomersError=/);
 assert.match(control,/control[.]disabled=true/);
 assert.match(control,/await refreshCompanyCustomers\(\)/);
 assert.match(control,/status[.]hidden=false/);
 assert.match(control,/status[.]textContent=companyCustomersError/);
 assert.match(control,/clienti aziendali aggiornati/);
 assert.match(control,/control[.]disabled=false/);
 assert.match(control,/aria-busy/);
 assert.match(css,/customer-refresh-feedback\[hidden\]/);
 assert.match(css,/prefers-reduced-motion/);
});

test('all main client buttons remain wired to real handlers',()=>{
 assert.match(app,/function companyCustomersPanel\(\)/);
 assert.match(app,/updateCompanyCustomersPanel\(panel\)/);
 assert.match(app,/customerRefresh[.]control/);
 assert.match(app,/customerRefresh[.]status/);
 assert.match(app,/function mapsCustomerDialog\(\)/);
 assert.match(app,/function customerDialog\(customer=null/);
 assert.match(app,/function importCustomersCsv\(file\)/);
 assert.match(app,/async function importCustomersCsv\(file\)/);
 assert.match(app,/button\('Importa CSV'/);
 assert.match(app,/button\('Esporta CSV'/);
 assert.match(app,/button\('Da Google Maps'/);
 assert.match(app,/button\('Nuovo cliente'/);
 assert.match(app,/button\('Aggiorna|customerRefreshControl\('Aggiorna elenco'\)/);
 assert.match(app,/function useCustomerInTrip\(customer\)/);
 assert.match(app,/function customerUndoAction\(\)/);
 assert.match(app,/function customerCard\(customer/);
});

test('no customer refresh can update account state after the logged-in owner changes',()=>{
 const a=app.indexOf('async function refreshCompanyCustomers()');
 const b=app.indexOf('/** Update only the company list',a);
 const block=app.slice(a,b);
 assert.match(block,/accountAccess[.]isVerified\(\)/);
 assert.match(block,/accountAccess[.]getAccountId\(\)/);
 assert.match(block,/owner!==accountAccess[.]getAccountId\(\)/);
 assert.match(block,/companyCustomersRequest/);
 assert.match(block,/if\(tab==='customers'\)updateCompanyCustomersPanel\(\)/);
 assert.doesNotMatch(block,/state[.]customers=/);
});

test('out-of-order refreshes and logout cannot apply an older customer response',()=>{
 const a=app.indexOf('async function refreshCompanyCustomers()');
 const b=app.indexOf('/** Update only the company list',a);
 const refresh=app.slice(a,b);
 assert.match(app,/let companyCustomersRequest=0;/);
 assert.match(refresh,/request=\+\+companyCustomersRequest/);
 assert.match(refresh,/request!==companyCustomersRequest/g);
 assert.match(refresh,/!store[.]usingAccount\(\)/);
 assert.match(refresh,/!accountAccess[.]isVerified\(\)/);
 assert.equal((refresh.match(/request!==companyCustomersRequest/g)||[]).length,2);
});

test('manual refresh does not display raw backend error messages',()=>{
 const a=app.indexOf('function customerRefreshControl(');
 const b=app.indexOf('function companyCustomersPanel(',a);
 const control=app.slice(a,b);
 assert.doesNotMatch(control,/status[.]textContent=error[?][.]message/);
 assert.match(control,/Verifica l’accesso e la connessione/);
});
