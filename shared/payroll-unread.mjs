/** Count unopened published PDFs using the authenticated owner's list.
 * No document data is persisted. Reject mixed-owner, duplicate or malformed rows.
 */
function inspectPage(response,owner,seen){
 const driverId=owner.replace(/^account:/,'');
 const docs=response?.documents;
 if(!Array.isArray(docs)||docs.length>50)throw Error('Elenco documenti non valido.');
 let unread=0;
 for(const doc of docs){
  if(doc?.state!=='published'||doc.driver_id!==driverId||!['cedolino','cu','altri'].includes(doc.category)||
     typeof doc.id!=='string'||!doc.id||seen.has(doc.id))throw Error('Elenco documenti non autorizzato o duplicato.');
  if(doc.first_accessed_at!==null&&(typeof doc.first_accessed_at!=='string'||!Number.isFinite(Date.parse(doc.first_accessed_at))))
   throw Error('Stato apertura documento non valido.');
  seen.add(doc.id);
  if(doc.first_accessed_at===null)unread++;
 }
 return {length:docs.length,unread};
}
export async function countUnreadDocuments(listDocuments,{owner,firstPage,onFirstPageValidated}={}){
 if(typeof listDocuments!=='function'||typeof owner!=='string'||!owner||owner==='account:')throw Error('Servizio documenti non valido.');
 let unread=0;const seen=new Set();
 for(let offset=0;offset<=100000;offset+=50){
  const response=offset===0&&firstPage!==undefined?firstPage:await listDocuments({offset});
  const page=inspectPage(response,owner,seen);
  // Permission to open the menu is established by its existing first-page check.
  // A later pagination failure leaves the count unknown, not zero.
  if(offset===0)onFirstPageValidated?.();
  unread+=page.unread;
  if(unread>=100)return 100;
  if(page.length<50)return unread;
 }
 throw Error('Elenco documenti troppo esteso.');
}
