/** Driver trip-editor protections. Pure rules; no browser storage or server access. */
import {normalizeContainer,normalizeText,SERVICES} from './domain.mjs';

const allowedServices=new Set(SERVICES.map(service=>service.key));
const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
export const TRIP_DRAFT_VERSION=1;

export function tripDraftHasWork(draft,editingId=null,currentDate=''){
 if(editingId)return true;
 if(!draft||typeof draft!=='object')return false;
 return Boolean(text(draft.container).trim()||text(draft.client).trim()||
  text(draft.city).trim()||text(draft.secondClient).trim()||text(draft.secondCity).trim()||
  text(draft.note,2000).trim()||draft.second||
  (Array.isArray(draft.services)&&draft.services.length)||
  (draft.date&&draft.date!==currentDate));
}

/** A warning rather than a hard block: a driver may legitimately repeat a route. */
export function possibleTripDuplicate(trips,draft,editingId=null){
 if(!Array.isArray(trips)||!draft||!draft.date||!draft.container||!draft.client||!draft.city)return null;
 const canonicalContainer=value=>normalizeContainer(value).replace(/[.\s]/gu,'');
 const container=canonicalContainer(draft.container);
 return trips.find(trip=>trip?.id!==editingId&&trip?.date===draft.date&&
  canonicalContainer(trip.container)===container&&
  normalizeText(trip.client)===normalizeText(draft.client)&&
  normalizeText(trip.city)===normalizeText(draft.city))||null;
}

export function restoreTripEditorSnapshot(snapshot,trips){
 if(!snapshot||snapshot.version!==TRIP_DRAFT_VERSION||!snapshot.draft||
  typeof snapshot.draft!=='object'||Array.isArray(snapshot.draft))return null;
 const source=snapshot.draft;
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(source.date||''))return null;
 const draft={
  date:source.date,container:text(source.container),client:text(source.client),city:text(source.city),
  secondClient:text(source.secondClient),secondCity:text(source.secondCity),
  second:Boolean(source.second),note:text(source.note,2000),
  services:Array.isArray(source.services)?[...new Set(source.services.filter(key=>allowedServices.has(key)))]:[],
  noteOpen:Boolean(source.noteOpen),servicesOpen:Boolean(source.servicesOpen)
 };
 const editingId=typeof snapshot.editingId==='string'&&snapshot.editingId.length<129?snapshot.editingId:null;
 const existing=editingId&&Array.isArray(trips)?trips.find(trip=>trip.id===editingId):null;
 // An edit whose target was deleted remotely is never resurrected with the old ID.
 return {draft,editingId:existing?editingId:null,
  editingBaseline:existing&&typeof snapshot.editingBaseline==='string'?snapshot.editingBaseline:null,
  removedEdit:Boolean(editingId&&!existing)};
}
