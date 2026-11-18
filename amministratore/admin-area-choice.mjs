/**
 * Presentation-only chooser for the two independent LTS administrative areas.
 * This module never reads passwords, changes account roles, or bypasses MFA.
 * AREA LOGISTICA uses the existing admin.mjs login + controls;
 * AREA AMMINISTRATIVA follows its own /buste-paga/ sign-in flow.
 */
const chooser=document.getElementById('admin-area-choice');
const logistics=document.getElementById('admin-logistica-login');
const openLogistics=document.getElementById('select-area-logistica');
const back=document.getElementById('admin-area-back');
const loginPanel=document.getElementById('login-panel');

function showChooser(){
 if(!chooser||!logistics)return;
 logistics.hidden=true;chooser.hidden=false;
 const password=document.getElementById('login-password');
 if(password)password.value='';
 const error=document.getElementById('login-error');
 if(error){error.textContent='';error.hidden=true;}
 if(loginPanel&&!loginPanel.hidden)openLogistics?.focus({preventScroll:true});
}
function showLogistics(){
 if(!chooser||!logistics)return;
 chooser.hidden=true;logistics.hidden=false;
 document.getElementById('login-phone')?.focus({preventScroll:true});
}
openLogistics?.addEventListener('click',showLogistics);
back?.addEventListener('click',showChooser);
// Logout from the logistics dashboard returns to the access-area chooser.
document.getElementById('logout')?.addEventListener('click',showChooser);
// A browser history restore must not reveal an outdated password form.
window.addEventListener('pageshow',event=>{
 if(event.persisted&&loginPanel&&!loginPanel.hidden)showChooser();
});
