// Preserve legacy omitted note fields before validateState normalizes them to empty strings.
// An explicit empty string remains an intentional clear and is retained in history.
export function preserveOmittedNotes(input,prior){
 if(!Array.isArray(input?.trips)||!Array.isArray(prior?.trips))return input;
 const existing=new Map(prior.trips.map(t=>[t.id,t]));
 return {...input,trips:input.trips.map(t=>{
  if(!t||typeof t!=='object'||Array.isArray(t))return t;
  const old=existing.get(t.id);
  if(!old)return t;
  const next={...t};
  for(const key of ['note','adminNote'])if(!Object.hasOwn(t,key)&&typeof old[key]==='string')next[key]=old[key];
  return next;
 })};
}
export function integrateOmittedNoteProtection(source){
 const imp='import { readNoteHistory } from "./note-history-handler.mjs";';
 const checked='  const checked=checkedState(body.state);';
 const prior='  const prior=await currentRecord(admin,account.id);';
 if([imp,checked,prior].some(x=>source.split(x).length!==2))throw Error('Unexpected QA baseline');
 return source.replace(imp,imp+'\nimport { preserveOmittedNotes } from "./preserve-omitted-notes.mjs";').replace(prior,'').replace(checked,prior+'\n  const checked=checkedState(preserveOmittedNotes(body.state,prior?.payload));');
}
