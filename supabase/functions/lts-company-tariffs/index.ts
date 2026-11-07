import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {handleCompanyTariffs} from './tariff-handler.mjs';
function key(current,legacy){
 const raw=Deno.env.get(current);
 if(raw)try{const j=JSON.parse(raw);if(typeof j?.default==='string'&&j.default.length>10)return j.default;}catch{}
 return Deno.env.get(legacy)||null;
}
function clients(){
 const url=Deno.env.get('SUPABASE_URL');
 const pub=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const secret=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!pub||!secret)return null;
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 return {public:createClient(url,pub,options),admin:createClient(url,secret,options)};
}
Deno.serve(req=>handleCompanyTariffs(req,{getClients:clients}));