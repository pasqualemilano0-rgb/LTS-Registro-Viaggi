import {combinedTripCustomerChoices} from '../shared/trip-customer-choices.mjs';
import {createGuidedSession} from './guided.mjs';

/**
 * Explicit, read-only bridge from LTS app state to the isolated guided engine.
 * Only call after accountAccess.isVerified() AND store.usingAccount().
 * Never pass raw account objects, tokens, full trips, or unverified catalogs.
 * No browser storage, network access, or mutations in this module.
 */
export function createLtsGuidedSnapshot({verified=false,accountActive=false,personalCustomers=[],trips=[],companyCustomers=[],companyRates=[],companyRatesLoaded=false,driverFirstName='',draft=null}={}){
 if(verified!==true||accountActive!==true)return createGuidedSession({verified:false});
 const customers=combinedTripCustomerChoices({personal:personalCustomers,trips,shared:companyCustomers});
 const tariffs=companyRatesLoaded===true&&Array.isArray(companyRates)?companyRates
  .filter(row=>row&&Number.isSafeInteger(row.cents)&&row.cents>=0)
  .map(row=>({client:row.client,city:row.city,cents:row.cents})):[];
 return createGuidedSession({verified:true,driver:{firstName:driverFirstName},customers,tariffs,draft});
}
