/** Detect tariff drafts before navigating to another admin workspace.
 * Stored server values in the extra grid are not drafts; only edited fields are.
 * No business values, private records or customer details are persisted.
 */
const FORMS=['company-rates-form','company-manual-form','company-maps-form'];
export function hasUnsubmittedTariffDraft(doc=globalThis.document){
 if(!doc)return false;
 for(const id of FORMS){
  const form=doc.getElementById(id);
  if(!form)continue;
  for(const field of form.querySelectorAll('input,textarea,select')){
   if(field.disabled||field.type==='hidden'||field.type==='checkbox'||field.type==='radio')continue;
   if(typeof field.value==='string'&&field.value.trim())return true;
  }
 }
 return Boolean(doc.querySelector('.company-extra-row input[data-dirty="true"]'));
}
