/** Provenance gate: only a new customer saved from the Maps-link dialog
 * may be submitted to the protected company registry. No manual/CSV/trip edits. */
import {checkedGoogleMapsUrl} from './maps-client.mjs';
export function mapsLinkForCompanySync({existingCustomer=null,proposal=null,enabled=false}={}){
 if(!enabled||existingCustomer||!proposal||typeof proposal.mapsUrl!=='string')return null;
 return checkedGoogleMapsUrl(proposal.mapsUrl).href;
}
