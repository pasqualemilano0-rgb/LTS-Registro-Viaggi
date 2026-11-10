import {filterTripCustomerChoices} from '../shared/trip-customer-choices.mjs';
export function normalizeContainer(value){return String(value??'').trim().toUpperCase().replace(/\s+/g,'');}
export function validContainer(value){return /^[A-Z]{4}[0-9]{7}$/.test(normalizeContainer(value));}
export function searchCustomers(choices,query){return filterTripCustomerChoices(choices,query,12);}
export function prepareCustomerRequest({container,customerName}){
 const name=String(customerName??'').trim().slice(0,160);
 if(!validContainer(container))throw new Error('Container non valido');
 if(name.length<2)throw new Error('Indica il nome del cliente');
 return {type:'customer_approval_proposal',container:normalizeContainer(container),customerName:name,status:'not_sent'};
}
export function prepareTripReview({container,customer}){
 if(!validContainer(container))throw new Error('Container non valido');
 if(!customer||typeof customer.name!=='string'||!customer.name.trim())throw new Error('Seleziona un cliente');
 return {container:normalizeContainer(container),client:customer.name.trim(),city:String(customer.city??'').trim(),status:'draft_only'};
}
