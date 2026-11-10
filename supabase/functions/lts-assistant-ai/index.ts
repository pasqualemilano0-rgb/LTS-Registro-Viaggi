// Optional LTS AI gateway: no credentials or customer records in the browser.
// Disabled until GROQ_API_KEY is configured server-side and privacy review is complete.
const cors={ 'Access-Control-Allow-Origin':'https://pasqualemilano0-rgb.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin' };
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 if(req.headers.get('origin')!=='https://pasqualemilano0-rgb.github.io')return json({error:'origin_not_allowed'},403);
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return json({error:'unauthorized'},401);
 const url=Deno.env.get('SUPABASE_URL');const anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!anon)return json({error:'server_not_configured'},503);
 const who=await fetch(url+'/auth/v1/user',{headers:{authorization:'Bearer '+token,apikey:anon}}).catch(()=>null);
 if(!who?.ok)return json({error:'unauthorized'},401);
 const key=Deno.env.get('GROQ_API_KEY');
 if(!key)return json({status:'unavailable',message:'IA non configurata. Usa la ricerca guidata.'},503);
 let body;try{body=await req.json()}catch{return json({error:'invalid_json'},400)}
 const message=typeof body?.message==='string'?body.message.trim():'';
 if(!message||message.length>500)return json({error:'invalid_message'},400);
 // Never accept database dumps, customer catalogs or tariff records from clients.
 if(Object.keys(body).some(k=>k!=='message'))return json({error:'unsupported_fields'},400);
 const prompt='Sei Assistente Logistica LTS. Rispondi in italiano, massimo 100 parole. Non inventare clienti, tariffe o dati di viaggio. Non affermare mai di avere salvato o modificato dati. Suggerisci di usare la ricerca clienti guidata e di confermare ogni salvataggio. Non richiedere dati sensibili.';
 const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-oss-20b',temperature:0.2,max_completion_tokens:250,messages:[{role:'system',content:prompt},{role:'user',content:message}]})}).catch(()=>null);
 if(!response)return json({status:'unavailable',message:'IA temporaneamente non raggiungibile.'},503);
 if(response.status===429)return json({status:'rate_limited',message:'Limite gratuito raggiunto. Usa la ricerca guidata.'},429);
 if(!response.ok)return json({status:'unavailable',message:'IA non disponibile. Usa la ricerca guidata.'},503);
 const data=await response.json();const answer=data?.choices?.[0]?.message?.content;
 if(typeof answer!=='string'||!answer.trim())return json({status:'unavailable'},503);
 return json({status:'ok',answer:answer.slice(0,1200)});
});
