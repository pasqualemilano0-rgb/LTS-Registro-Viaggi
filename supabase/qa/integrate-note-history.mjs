// Apply only to the inspected QA v4 source; fail on missing/duplicate anchors.
// The existing authorized(), write(), CORS, receipt, MFA and revision paths remain unchanged.
export function integrateNoteHistory(source){
 const replacements=[
  ['import { checkLtsSession } from "./lts-session.mjs";','import { checkLtsSession, sessionIdFromJwt } from "./lts-session.mjs";\nimport { readNoteHistory } from "./note-history-handler.mjs";'],
  ['    if(input.action==="write")return send(await write(pair.admin,user,input),200,origin);','    if(input.action==="write")return send(await write(pair.admin,user,input),200,origin);\n    if(input.action==="note-history")return send(await readNoteHistory(req,pair.admin,user,input,sessionIdFromJwt),200,origin);']
 ];
 for(const [from,to] of replacements){
  if(source.split(from).length!==2)throw new Error('Unexpected QA account core; review before integration');
  source=source.replace(from,to);
 }
 return source;
}
