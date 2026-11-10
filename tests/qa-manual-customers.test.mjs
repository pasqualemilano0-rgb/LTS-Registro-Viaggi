import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedCustomerSites,customerDirectoryStats} from '../amministratore/customer-overview-model.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('manual customers are valid without fake Google Maps URLs',()=>{
 const code=read('shared-maps-client.mjs')
  .replace(/^import .*$/gm,'').replace(/^export /gm,'');
 const validate=new Function(code+'\nreturn validCustomer;')();
 const manual={name:'LAVORATO PORTO',city:'NAPOLI',address:'',
  mapsUrl:'',source:'manual',operationalNotes:''};
 assert.deepEqual(validate(manual),manual);
 assert.throws(()=>validate({...manual,mapsUrl:'https://maps.app.goo.gl/not-real'}),
  /cliente manuale/);
 assert.throws(()=>validate({...manual,source:'google_maps_link'}),
  /incompleta/);
 assert.match(code,/action:'save-manual'/);
 assert.match(code,/account[.]getVerifiedAccessToken\(\)/);
});
test('manual customers appear in shared list but never as missing Maps addresses',()=>{
 const sites=[{name:'DEPOSITO MAPS',city:'NAPOLI',source:'google_maps_link',
  address:'VIA TEST 1',mapsUrl:'https://maps.app.goo.gl/test'},
 {name:'CLIENTE MANUALE',city:'AVELLINO',source:'manual',address:'',mapsUrl:''},
 {name:'SEDE DA COMPLETARE',city:'ROMA',source:'google_maps_link',
  address:'INDIRIZZO STRADALE DA CONFERMARE',mapsUrl:'https://maps.app.goo.gl/other'}];
 assert.deepEqual(selectedCustomerSites(sites,'manual').map(x=>x.name),['CLIENTE MANUALE']);
 assert.deepEqual(selectedCustomerSites(sites,'incomplete').map(x=>x.name),['SEDE DA COMPLETARE']);
 assert.equal(selectedCustomerSites(sites,'all').length,3);
 assert.deepEqual(customerDirectoryStats(sites.filter(x=>x.source!=='manual')),
  {total:2,complete:1,incomplete:1,coverage:50});
});
test('admin manual customer creation requires MFA and uses private backend tables',()=>{
 const source=read('supabase/functions/lts-shared-maps/maps-registry-handler.mjs');
 const migration=read('supabase/migrations/20261107142500_lts_shared_manual_company_customers.sql');
 assert.match(source,/input[.]action==='save-manual'/);
 assert.match(source,/if\(role!=='admin'\)/);
 assert.match(source,/requireAdminMfa\(/);
 assert.match(source,/checkLtsSession\(/);
 assert.match(source,/lts_shared_customers_manual/);
 assert.match(source,/lts_shared_maps_customers/);
 assert.match(source,/lts_company_tariffs/);
 assert.match(source,/source:'manual'/);
 assert.match(source,/mapsUrl:''/);
 assert.match(source,/if\(mapsMatches[.]length\)/);
 assert.match(source,/if\(existing\)return json/);
 assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY\s*=/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on table public[.]lts_shared_customers_manual from public,anon,authenticated/);
 assert.match(migration,/lts_manual_customer_realtime_notice/);
 assert.match(migration,/lts:v1:catalog/);
});
test('dashboard offers shared custom customer and optional fare without touching trips',()=>{
 const html=read('amministratore/index.html');
 const editor=read('amministratore/company-manual-registration.mjs');
 const tariff=read('amministratore/company-rates.mjs');
 const overview=read('amministratore/customer-overview.mjs');
 const driver=read('app.mjs');
 for(const id of ['company-manual-add','company-manual-form','company-manual-name',
  'company-manual-city','company-manual-address','company-manual-notes',
  'company-manual-amount','company-manual-save','company-manual-status']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/data-open-manual/);
 assert.match(html,/value="manual"/);
 assert.match(editor,/saveSharedManualCustomer\(customer\)/);
 assert.match(editor,/matchingRate\(response[.]tariffs,customer\)/);
 assert.match(editor,/saveSharedPricedCustomer\(\{source:'manual'/);
 assert.match(tariff,/else await saveSharedPricedCustomer\(\{/);
 assert.match(tariff,/focusManual\(\)/);
 assert.match(overview,/if\(row[.]mapsUrl\)/);
 assert.match(driver,/if\(shared&&customer[.]mapsUrl\)/);
 assert.doesNotMatch(editor,/innerHTML|localStorage|state[.]trips|adminRecords\('mutate'/);
});
