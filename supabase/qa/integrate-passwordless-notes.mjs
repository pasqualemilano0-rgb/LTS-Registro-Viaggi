// Only extend the existing QA worker with exact, synthetic-only routes.
// Do not change the existing auth gate, booking handler or protected report/login paths.
export function integratePasswordlessNotes(source){
 const imp="import {serveQaReportPreview} from './qa-report-preview.mjs';";
 const route=" const url=new URL(request.url),path=url.pathname;";
 if(source.split(imp).length!==2||source.split(route).length!==2||source.includes('serveSyntheticNoteQa'))throw Error('Unexpected QA worker baseline');
 return source.replace(imp,imp+"\nimport {serveSyntheticNoteQa} from './qa-notes-synthetic.mjs';").replace(route,route+"\n const syntheticNotes=serveSyntheticNoteQa(request);\n if(syntheticNotes)return syntheticNotes;");
}
