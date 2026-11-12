// QA ONLY. Deliberately fail-closed for business data and mutating features.
// Do not copy this file into production or silently enable production fallbacks.
const QA='https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/';
export default Object.freeze({
  basePath:'/LTS-Registro-Viaggi/',
  apiUrl:null,
  deviceToken:false,
  realtime:Object.freeze({enabled:false,url:null,publishableKey:null}),
  accountAuth:Object.freeze({
    enabled:true,
    loginEndpoint:QA+'lts-phone-auth',
    archiveEndpoint:QA+'lts-account-state',
    onboardingEndpoint:QA+'lts-driver-onboarding',
    reportEndpoint:QA+'lts-company-report',
    tariffsEndpoint:null,
    sharedMapsEndpoint:null,
    mapsReaderEndpoint:null,
    adminRecordsEndpoint:null
  }),
  staging:Object.freeze({
    enabled:true,
    origin:'https://lts-booking-security-stage.pasqualemilano0.workers.dev',
    productionWritesDisabled:true,
    bookingApiEnabled:false,
    pushDisabled:true,
    backgroundSyncDisabled:true
  })
});
