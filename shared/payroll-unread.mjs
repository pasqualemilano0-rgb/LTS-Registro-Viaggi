/** Count published PDFs not yet opened by the authenticated driver.
 * The Edge Function must enforce ownership and published-only filtering.
 * Nothing from this response is persisted in browser storage.
 */
export async function countUnreadDocuments(listDocuments){
 if(typeof listDocuments!=='function')throw Error('Servizio documenti non valido.');
 let unread=0;
 // Payroll list returns up to 50 rows per page, with a server maximum offset.
 for(let offset=0;offset<=100000;offset+=50){
  const response=await listDocuments({offset});
  const docs=response?.documents;
  if(!Array.isArray(docs)||docs.length>50)throw Error('Elenco documenti non valido.');
  for(const doc of docs){
   if(doc?.state!=='published'||!['cedolino','cu','altri'].includes(doc.category))
    throw Error('Elenco documenti non autorizzato.');
   if(doc.first_accessed_at==null)unread++;
   // The avatar uses a compact "99+" indicator for large archives.
   if(unread>=100)return 100;
  }
  if(docs.length<50)return unread;
 }
 throw Error('Elenco documenti troppo esteso.');
}
