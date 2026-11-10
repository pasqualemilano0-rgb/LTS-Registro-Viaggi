import {interpret} from './engine.mjs';
const conversation=document.querySelector('#conversation');
const question=document.querySelector('#question');
function bubble(text,cls){const p=document.createElement('p');p.className=cls;p.textContent=text;conversation.append(p);conversation.scrollTop=conversation.scrollHeight;}
function respond(text){const value=text.trim();if(!value)return;question.value='';bubble(value,'driver');const answer=interpret(value);bubble(answer.title+' — '+answer.message+(answer.container?' Container individuato: '+answer.container+'.':'')+(answer.requiresConfirmation?' Nessuna modifica sarà eseguita senza conferma.':''),'assistant');}
document.querySelector('#chat').addEventListener('submit',event=>{event.preventDefault();respond(question.value);});
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>respond(button.dataset.example)));
