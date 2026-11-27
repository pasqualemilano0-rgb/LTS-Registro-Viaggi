// Internal receipt: clients cannot send a colon in a request ID.
// Bind the immutable request to its original validated payload AND base revision.
export async function requestReceipt(requestId,baseRevision,state){
 const input=new TextEncoder().encode(JSON.stringify([requestId,baseRevision,state]));
 const digest=await crypto.subtle.digest('SHA-256',input);
 return 'lts-v2:'+requestId+':'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function receiptHasId(stored,requestId){
 return typeof stored==='string' && stored.startsWith('lts-v2:'+requestId+':');
}
