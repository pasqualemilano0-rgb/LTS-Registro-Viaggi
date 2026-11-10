import {validContainer,normalizeContainer,searchCustomers,prepareCustomerRequest,prepareTripReview} from './flow.mjs';
// Demo-only customers. Never represent these as real LTS records.
const choices=[{name:'ALFA LOGISTICA SRL',city:'Caserta'},{name:'BETA TRASPORTI SRL',city:'Napoli'},{name:'GAMMA DISTRIBUZIONE',city:'Nola'}];
const $=id=>document.getElementById(id);let chosen=null;
const steps=['start','container-step','customer-step','request-step','review-step','done-step'];
function show(step,title,hint){for(const id of steps)$(id).hidden=id!==step;$('heading').textContent=title;$('hint').textContent=hint;$('error').textContent='';}
function error(message){$('error').textContent=message;}
$('start').addEventListener('click',()=>show('container-step','Inserisci il container','Il cliente verrà cercato nel passaggio successivo.'));
$('next').addEventListener('click',()=>{if(!validContainer($('container').value))return error('Inserisci 4 lettere e 7 cifre.');$('container').value=normalizeContainer($('container').value);show('customer-step','Seleziona il cliente','Cerca tra i clienti disponibili.');renderResults();});
function renderResults(){const box=$('results');box.replaceChildren();const query=$('customer').value.trim();if(!query)return;const rows=searchCustomers(choices,query);if(!rows.length){const p=document.createElement('p');p.textContent='Nessun cliente trovato.';box.append(p);}for(const row of rows){const button=document.createElement('button');button.type='button';button.textContent=row.name+' · '+row.city;button.addEventListener('click',()=>{chosen=row;const draft=prepareTripReview({container:$('container').value,customer:chosen});$('summary').textContent='Container: '+draft.container+' | Cliente: '+draft.client+' | Destinazione: '+(draft.city||'da verificare')+'. Controlla i dati prima di salvare nell’app.';show('review-step','Riepilogo bozza','Nessun salvataggio automatico.');});box.append(button);}}
$('customer').addEventListener('input',renderResults);
$('new-customer').addEventListener('click',()=>{$('new-name').value=$('customer').value;show('request-step','Nuovo cliente','Prepara una richiesta per la centrale.');});
$('prepare-request').addEventListener('click',()=>{try{const request=prepareCustomerRequest({container:$('container').value,customerName:$('new-name').value});$('done-message').textContent='Richiesta per '+request.customerName+' preparata ma NON inviata. La futura integrazione dovrà verificare l’accesso e inviare la richiesta al server.';show('done-step','Richiesta preparata','In attesa della futura integrazione con la centrale.');}catch(e){error(e.message);}});
$('confirm').addEventListener('click',()=>{$('done-message').textContent='Bozza confermata nella demo. Nessun viaggio reale è stato salvato.';show('done-step','Bozza pronta','La conferma operativa avverrà nell’app LTS.');});
$('restart').addEventListener('click',()=>{chosen=null;$('container').value='';$('customer').value='';show('start','Cosa vuoi fare?','Ti aiuto a preparare il viaggio con pochi passaggi.');});
show('start','Cosa vuoi fare?','Ti aiuto a preparare il viaggio con pochi passaggi.');

// Guided shortcuts: no privileged data access in the isolated demo.
$('customers-action').addEventListener('click',()=>{
 $('feature-notice').textContent='Ricerca clienti dimostrativa: inserisci prima il container. I clienti reali saranno disponibili solo dopo la verifica della sessione LTS.';
 show('container-step','Inserisci il container','Poi cerca il cliente senza domande aggiuntive.');
});
$('rates-action').addEventListener('click',()=>{
 $('feature-notice').textContent='Le tariffe reali non sono disponibili nella demo. Verranno lette soltanto dai dati autorizzati dell’app LTS.';
});
