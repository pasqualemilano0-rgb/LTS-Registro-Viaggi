import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),shell=read('shell.html'),sw=read('sw.js');
const admin=read('amministratore/index.html');
const get=(value,pattern,label)=>{const match=value.match(pattern);assert.ok(match,label);return match[1]};
const version=/^20\d{6}-[a-z0-9-]+-v\d+$/;
test('entrypoints and PWA cache are versioned and do not cache private traffic',()=>{
 assert.equal(html,shell,'offline shell must equal canonical entrypoint');
 const cache=get(sw,/const CACHE = PREFIX \+ '([^']+)'/,'service worker cache');
 const theme=get(html,/\/LTS-Registro-Viaggi\/visual-theme\.css\?v=([^"']+)/,'active visual theme');
 const script=get(html,/\/LTS-Registro-Viaggi\/app\.mjs\?v=([^"']+)/,'driver module version');
 for(const item of [cache,theme,script])assert.match(item,version);
 assert.match(sw,/"\/LTS-Registro-Viaggi\/visual-theme[.]css"/);
 assert.match(sw,/"\/LTS-Registro-Viaggi\/app[.]mjs"/);
 assert.match(sw,/BASE \+ 'visual-theme[.]css'/);
 assert.match(sw,/url[.]origin !== self[.]location[.]origin/);
 assert.match(sw,/NETWORK_FIRST_CODE/);
});
test('administration and driver use the same approved visual theme',()=>{
 const a=get(admin,/\.\.\/visual-theme\.css\?v=([^"']+)/,'admin stylesheet');
 const b=get(html,/\/LTS-Registro-Viaggi\/visual-theme\.css\?v=([^"']+)/,'driver stylesheet');
 assert.equal(a,b);
 assert.match(admin,/admin[.]mjs[?]v=20\d{6}-[a-z0-9-]+-v\d+/);
 const css=read('visual-theme.css');
 assert.match(css,/records-certify-panel/);
 assert.match(css,/records-worklist/);
 assert.doesNotMatch(css,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY/i);
});
test('strict CSP precedes scripts, no unauthenticated client persistence keys',()=>{
 assert.ok(html.indexOf('Content-Security-Policy')>=0);
 assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<script'));
 assert.doesNotMatch(html,/onload\s*=|onclick\s*=/);
 assert.doesNotMatch([html,admin,sw].join('\n'),/sb_secret_[A-Za-z0-9_-]+|SUPABASE_SERVICE_ROLE_KEY\s*[:=]/);
});
