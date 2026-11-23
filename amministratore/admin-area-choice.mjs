import * as account from '../account-access.mjs';
/**
 * One administrator sign-in (password + MFA) precedes the area chooser.
 * This module only controls presentation. Server-side session, MFA and role
 * verification remain in admin.mjs and the protected endpoints.
 */
const chooser=document.getElementById('admin-area-choice');
const logistics=document.getElementById('admin-logistica-login');
const loginPanel=document.getElementById('login-panel');
const dashboard=document.getElementById('dashboard');
const openLogistics=document.getElementById('select-area-logistica');
const back=document.getElementById('admin-area-back');

function showLogin(){
 if(!chooser||!logistics)return;
 if(dashboard?.hidden)dashboard.inert=false;
 chooser.hidden=true;
 logistics.hidden=false;
 if(loginPanel&&!loginPanel.hidden)document.getElementById('login-phone')?.focus({preventScroll:true});
}
function showAreaChoice(){
 if(!chooser||!logistics||!loginPanel||!dashboard)return;
 if(!account.isVerified()||account.getRole()!=='admin'||dashboard.hidden)return;
 // Only a server-verified administrator can see the chooser.
 // The event is dispatched by admin.mjs after MFA verification.
 logistics.hidden=true;
 chooser.hidden=false;
 loginPanel.hidden=false;
 dashboard.hidden=false;
 dashboard.inert=true;
 openLogistics?.focus({preventScroll:true});
}
function enterLogistics(){
 if(chooser?.hidden||!loginPanel||!dashboard)return;
 chooser.hidden=true;
 loginPanel.hidden=true;
 dashboard.inert=false;
}
document.addEventListener('lts-admin-authenticated',showAreaChoice);
openLogistics?.addEventListener('click',enterLogistics);
document.getElementById('admin-change-area')?.addEventListener('click',showAreaChoice);
back?.addEventListener('click',()=>{ /* Login is before the chooser; no return to password here. */ });
document.getElementById('logout')?.addEventListener('click',showLogin);
window.addEventListener('lts-account-locked',showLogin);
window.addEventListener('pageshow',event=>{
 if(event.persisted&&loginPanel&&!loginPanel.hidden&&dashboard.hidden)showLogin();
});
showLogin();
