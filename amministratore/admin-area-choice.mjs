/**
 * Presentation-only area selector. It is hidden by default until admin.mjs
 * verifies the real server session AND MFA. It never reads tokens or passwords.
 * Area Logistica is a same-page transition; Documenti is same-origin navigation
 * and re-verifies the shared admin session on its protected backend.
 */
const chooseLogistics=document.getElementById('select-area-logistica');
chooseLogistics?.addEventListener('click',()=>{
 window.dispatchEvent(new Event('lts-admin-open-logistics'));
});
