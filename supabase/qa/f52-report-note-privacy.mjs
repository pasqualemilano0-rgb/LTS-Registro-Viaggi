// Review-only adaptation for the inspected report handler; preserves current authorization.
// QA and production must be adapted independently; never copy QA allowlists.
export function redactCompanyReportSource(source){
 const from="services:[...trip.services],note:trip.note||'',totalCents:value,";
 const to="services:[...trip.services],adminNote:trip.adminNote||'',totalCents:value,";
 if(typeof source!=='string'||source.split(from).length!==2)throw Error('Unexpected report baseline');
 return source.replace(from,to);
}
