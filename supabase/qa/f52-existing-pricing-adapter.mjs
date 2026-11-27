// Review-only adapter for the existing production account-state contract.
 // Never deploy the QA bundle or its synthetic account/project allowlist.
 // F51's receipt and pricing transition requires a separate coordinated gate.
export function integrateNotesIntoExistingPricing(source){
 const imp='import { checkLtsSession } from "./lts-session.mjs";';
 const checked='  const checked=checkedState(applyCompanyRates(body.state,rates));';
 const prior='  const prior=await currentRecord(admin,account.id);';
 const rates='    const rates=await loadCompanyRates(pair.admin);';
 if(typeof source!=='string'||source.includes('QA_ROLES')||source.includes('preserveOmittedNotes')||[imp,checked,prior,rates].some(x=>source.split(x).length!==2))throw Error('Unexpected account-state baseline; review required');
 return source
  .replace(imp,imp.replace('checkLtsSession','checkLtsSession, sessionIdFromJwt')+'\nimport { preserveOmittedNotes } from "./preserve-omitted-notes.mjs";\nimport { readNoteHistory } from "./note-history-handler.mjs";')
  .replace(prior,'')
  .replace(checked,prior+'\n  const checked=checkedState(applyCompanyRates(preserveOmittedNotes(body.state,prior?.payload),rates));')
  .replace(rates,'    if(input.action==="note-history")return send(await readNoteHistory(req,pair.admin,user,input,sessionIdFromJwt),200,origin);\n'+rates);
}
