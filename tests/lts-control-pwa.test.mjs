import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {incidentFor} from '../status/status.mjs';

const read=path=>readFileSync(new URL('../'+path, import.meta.url),'utf8');
const manifest=JSON.parse(read('status/manifest.webmanifest'));
const sw=read('status/sw.js');
const page=read('status/index.html');
const js=read('status/status.mjs');

test('Control Center installs as a distinct scoped PWA',()=>{
  assert.equal(manifest.id,'/LTS-Registro-Viaggi/status/');
  assert.equal(manifest.start_url,'/LTS-Registro-Viaggi/status/');
  assert.equal(manifest.scope,'/LTS-Registro-Viaggi/status/');
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
  assert.match(page,/rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(page,/id="install-pwa"/);
  assert.match(js,/serviceWorker\.register\('\.\/sw\.js',\{scope:'\.\/'\}\)/);
});
test('service worker never caches credentials, APIs, or private app pages',()=>{
  assert.match(sw,/url\.origin!==self\.location\.origin/);
  assert.match(sw,/!url\.pathname\.startsWith\(BASE\)/);
  assert.doesNotMatch(sw,/api\.github\.com|lt[s-]phone-auth|\/amministratore\//);
  assert.match(sw,/notificationclick/);
  assert.match(sw,/caches\.open\(CACHE\)/);
});
test('notifications are opt-in and visible-page only, not push subscriptions',()=>{
  assert.match(page,/id="enable-alerts"/);
  assert.match(page,/mentre il pannello è aperto/);
  assert.match(js,/Notification\.requestPermission\(\)/);
  assert.match(js,/registration\.showNotification/);
  assert.match(js,/document\.visibilityState==='visible'/);
  assert.doesNotMatch(js,/pushManager|navigator\.permissions\.query|setTimeout\(.*closed/);
});
test('confirmed current failures produce a single incident key',()=>{
  const monitor={id:123};
  const deploy={id:456,status:'completed',conclusion:'failure'};
  assert.deepEqual(incidentFor(monitor,'fail',['ok','fail','ok'],null),{
    id:'monitor-123',body:'Un controllo pubblico del servizio LTS ha segnalato un problema.'
  });
  assert.equal(incidentFor(monitor,'stale',['stale','stale'],null),null);
  assert.equal(incidentFor(monitor,'waiting',['waiting'],null),null);
  assert.deepEqual(incidentFor(monitor,'ok',['ok','ok'],deploy),{
    id:'deploy-456',body:'L’ultima pubblicazione del sito LTS è fallita.'
  });
});
