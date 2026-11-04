// Public endpoints only; never include Supabase secret keys, account records or passwords.
export default Object.freeze({
  "basePath": "/LTS-Registro-Viaggi/",
  "apiUrl": "https://lts-registro-viaggi-iphone.steadyzebra1.chatgpt.site/api/public-state",
  "deviceToken": true,
  "accountAuth": {
    "enabled": true,
    "loginEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth",
    "archiveEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-account-state",
    "onboardingEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-driver-onboarding",
    "reportEndpoint": "https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-company-report"
  }
});
