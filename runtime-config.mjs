// Public endpoints only; never include Supabase secret keys, account records or passwords.
export default Object.freeze({
  "basePath": "/LTS-Registro-Viaggi/",
  "apiUrl": "https://lts-registro-viaggi-iphone.steadyzebra1.chatgpt.site/api/public-state",
  "deviceToken": true,
  "realtime": {
    "enabled": true,
    "url": "wss://otrqynkscpbeyuvdlgpg.supabase.co/realtime/v1/websocket",
    "publishableKey": "sb_publishable_9yp1GCs-X5lJ9EJth_oB1g_jzG7m5OJ"
  },
  "accountAuth": {
    "enabled": true,
    "loginEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth",
    "archiveEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-account-state",
    "onboardingEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-driver-onboarding",
    "reportEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-company-report",
    "tariffsEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-company-tariffs",
    "sharedMapsEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-shared-maps",
    "mapsReaderEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-maps-reader",
    "adminRecordsEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-admin-records"
  }
});
