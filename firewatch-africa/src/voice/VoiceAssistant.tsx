/* Assistant vocal : écoute (micro autonome + transcription Gemini, ou reconnaissance du navigateur),
   comprend (Gemini côté serveur, compréhension locale en secours), agit (actions autorisées,
   résultat constaté) et répond d'une voix IA masculine (Gemini), avec les voix Windows en secours. */
import {useEffect, useRef, useState} from 'react';
import {Icon} from '../../components/src/components/Icon';
import {ctl} from './control';
import {actionLabel, localPlan, runAction, type Action} from './actions';
import {MicError, listMics, openMic, primeAudio, probeMic, record, toBase64, type Probe, type Recording} from './recorder';

type Phase='idle'|'listening'|'transcribing'|'thinking'|'acting'|'confirm'|'speaking'|'error';
type Step={label:string;ok?:boolean;message?:string;pending?:boolean};
type Entry={role:'user'|'bot';text:string;steps?:Step[];engine?:string;error?:boolean};
type Pref={ear?:'gemini'|'browser';aiVoice?:string;sysVoice?:string;rate?:number;mute?:boolean;tts?:'gemini'|'system';micId?:string;raw?:boolean};

const PHASES:Record<Phase,{label:string;icon:string}>={
 idle:{label:'En attente · cliquez ou Ctrl + Espace',icon:'mic'},listening:{label:'Je vous écoute… parlez',icon:'mic'},transcribing:{label:'Je retranscris…',icon:'sparkle'},
 thinking:{label:'J’analyse la demande…',icon:'sparkle'},acting:{label:'J’exécute…',icon:'zap'},confirm:{label:'Confirmation requise',icon:'alert'},
 speaking:{label:'Je réponds…',icon:'volume'},error:{label:'Problème · voir le message',icon:'alert'},
};
const SR:any=typeof window!=='undefined'?((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition):null;
const PREF='fw.voice.v2';
const loadPref=():Pref=>{try{return JSON.parse(localStorage.getItem(PREF)||'{}')}catch{return {}}};
const savePref=(p:Pref)=>{try{localStorage.setItem(PREF,JSON.stringify(p))}catch{/* rien */}};
const YES=/^(oui|ouais|vas[- ]y|confirme|d'accord|ok|go|c'est bon|valide|absolument|bien s[uû]r)/i,NO=/^(non|annule|stop|arr[eê]te|pas maintenant|laisse)/i;
const MALE=/paul|henri|remy|rémy|claude|alain|jerome|jérôme|yves|antoine|fabrice|guillaume|jean|thomas|vincent|gerard|gérard|maxime|eloi|denis\b/i;

/** Voix Windows françaises, masculines et « Natural » d'abord (secours si la voix IA est indisponible). */
function systemVoices(){
 const all=typeof speechSynthesis!=='undefined'?speechSynthesis.getVoices():[];
 const score=(v:SpeechSynthesisVoice)=>(MALE.test(v.name)?8:0)+(/natural|online|neural/i.test(v.name)?4:0)+(/microsoft/i.test(v.name)?1:0)+(v.lang==='fr-FR'?1:0);
 return all.filter(v=>/^fr/i.test(v.lang)).sort((a,b)=>score(b)-score(a));
}

export function VoiceAssistant(){
 const [open,setOpen]=useState(false),[phase,setPhase]=useState<Phase>('idle'),[interim,setInterim]=useState(''),[level,setLevel]=useState(0);
 const [log,setLog]=useState<Entry[]>([]),[typed,setTyped]=useState(''),[confirmAsk,setConfirmAsk]=useState<string|null>(null);
 const [sysVoices,setSysVoices]=useState<SpeechSynthesisVoice[]>([]),[aiVoices,setAiVoices]=useState<Record<string,string>>({}),[server,setServer]=useState<'gemini'|null>(null);
 const [pref,setPref]=useState<Pref>(loadPref),[showSettings,setShowSettings]=useState(false),[mics,setMics]=useState<{id:string;label:string}[]>([]);
 useEffect(()=>{if(showSettings)listMics().then(setMics);},[showSettings]);
 const [probe,setProbe]=useState<{running:boolean;level:number;result?:Probe;error?:string}>({running:false,level:0});
 /** Test du micro : 6 s de niveau en direct ; si silence, second essai sans traitement audio. */
 const testMic=async()=>{primeAudio();setProbe({running:true,level:0});
  try{let r=await probeMic(pref.micId,v=>setProbe(p=>({...p,level:v})),5000,!!pref.raw);
   if(r.peak<0.002&&!pref.raw){const r2=await probeMic(pref.micId,v=>setProbe(p=>({...p,level:v})),4000,true);if(r2.peak>=0.002){updatePref({raw:true});r=r2;}}
   setProbe({running:false,level:0,result:r});listMics().then(setMics);
  }catch(e){setProbe({running:false,level:0,error:(e as Error).message});}};
 const rec=useRef<any>(null),mic=useRef<Recording|null>(null),audio=useRef<HTMLAudioElement|null>(null);
 const decide=useRef<((v:boolean)=>void)|null>(null),busy=useRef(false),listRef=useRef<HTMLDivElement>(null),stepsCount=useRef(0);
 const ear=pref.ear??(server==='gemini'?'gemini':'browser');

 useEffect(()=>{const up=()=>setSysVoices(systemVoices());up();if(typeof speechSynthesis!=='undefined')speechSynthesis.onvoiceschanged=up;
  fetch('/api/voice/voices').then(r=>r.json()).then(d=>{setAiVoices(d.voices||{});setServer(d.engine);}).catch(()=>{});},[]);
 useEffect(()=>{listRef.current?.scrollTo({top:listRef.current.scrollHeight,behavior:'smooth'});},[log,interim,phase]);
 // Demandes envoyées par la page « Assistant IA » : même assistant, même mémoire de conversation.
 const handleRef=useRef<(t:string)=>void>(()=>{});
 useEffect(()=>{const ask=(e:Event)=>{const t=(e as CustomEvent<string>).detail;if(t){primeAudio();setOpen(true);handleRef.current(t);}};addEventListener('fw:voice-ask',ask);return()=>removeEventListener('fw:voice-ask',ask);},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.code==='Space'){e.preventDefault();primeAudio();setOpen(true);toggleListen();}if(e.key==='Escape'&&phase!=='idle')stopAll();};addEventListener('keydown',k);return()=>removeEventListener('keydown',k);});

 const push=(e:Entry)=>setLog(l=>[...l.slice(-30),e]);
 const patchLast=(fn:(e:Entry)=>Entry)=>setLog(l=>l.length?[...l.slice(0,-1),fn(l[l.length-1])]:l);
 const fail=(text:string,say?:string)=>{push({role:'bot',text,error:true});setPhase('error');if(say)speak(say).then(()=>setPhase('error'));};

 /* ---------- Voix : IA masculine (Gemini), voix Windows en secours ---------- */
 const speakSystem=(text:string)=>new Promise<void>(res=>{
  if(typeof speechSynthesis==='undefined'||!speechSynthesis.getVoices().length){push({role:'bot',text:'Aucune voix n’est disponible pour lire la réponse : vérifiez le son de Windows (volume, sortie audio).',error:true});res();return;}
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=pref.rate??1;
  const v=sysVoices.find(x=>x.name===pref.sysVoice)??sysVoices[0];if(v)u.voice=v;u.onend=()=>res();u.onerror=()=>res();speechSynthesis.speak(u);
 });
 const speak=async(text:string)=>{
  if(pref.mute||!text)return;
  setPhase('speaking');
  if(server==='gemini'&&pref.tts!=='system'){
   try{
    const r=await fetch('/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:pref.aiVoice??'Charon'})});
    if(r.ok){const url=URL.createObjectURL(await r.blob());const a=new Audio(url);audio.current=a;a.playbackRate=pref.rate??1;
     const played=await new Promise<boolean>(res=>{a.onended=()=>res(true);a.onerror=()=>res(false);a.play().catch(()=>res(false));});URL.revokeObjectURL(url);audio.current=null;
     if(played)return;}   // lecture refusée ou échouée : voix de Windows ci-dessous
   }catch{/* voix de secours */}
  }
  await speakSystem(text);
 };
 const silence=()=>{try{audio.current?.pause();}catch{/* rien */}audio.current=null;if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();};

 /* ---------- Écoute ---------- */
 /** Micro autonome + transcription Gemini : ne dépend pas du service vocal du navigateur. */
 const listenGemini=async(onFinal:(t:string)=>void,short=false,retry=false)=>{void retry;
  silence();
  let stream:MediaStream;
  try{stream=await openMic(pref.micId,!!pref.raw||retry);}catch(e){fail((e as MicError).message,'Je n’ai pas accès au micro. Regardez le message à l’écran.');return;}
  listMics().then(setMics);
  setPhase(short?'confirm':'listening');setInterim('');
  const r=record(stream,v=>setLevel(v),short?{maxMs:6000,silenceMs:900,waitMs:5000}:{maxMs:15000,silenceMs:1300,waitMs:8000});mic.current=r;
  const {wav,heard,peak,device,stalled,muted}=await r.done;mic.current=null;setLevel(0);
  if(stalled){if(!short)fail('Le navigateur a mis le son en pause. Cliquez de nouveau sur le micro pour relancer l’écoute.','Cliquez de nouveau sur le micro, s’il vous plaît.');return;}
  if(!heard||!wav){if(short)return;
   const pct=Math.round(Math.min(1,peak/0.08)*100);
   if(peak<0.002&&!pref.raw){updatePref({raw:true});push({role:'bot',text:`Le micro « ${device} » n’envoie aucun son avec le traitement audio. Je réessaie sans réduction de bruit : parlez de nouveau.`,error:true});listenGemini(onFinal,short,true);return;}
   if(peak<0.002){setShowSettings(true);fail(`Le micro « ${device} » ne capte aucun son (niveau ${pct} %)${muted?' : il est COUPÉ par Windows ou par une touche du clavier':''}. Choisissez un autre micro dans les réglages ci-dessus, ou vérifiez qu’il n’est pas coupé (touche micro du clavier, Paramètres Windows › Son › Entrée).`,'Je ne reçois aucun son de ce micro. Choisissez-en un autre dans les réglages.');}
   else fail(`Je n’ai pas reconnu de parole (micro « ${device} », niveau maximal ${pct} %). Cliquez sur le micro, attendez « Je vous écoute », puis parlez normalement.`,'Je n’ai pas bien entendu. Recommencez en parlant normalement.');
   return;}
  setPhase('transcribing');setInterim('…');
  try{
   const res=await fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:await toBase64(wav),mime:'audio/wav'})});
   const d=await res.json().catch(()=>({}));setInterim('');
   if(!res.ok){if(SR&&!short){push({role:'bot',text:`${d.detail||'Transcription indisponible.'} Je passe à la reconnaissance du navigateur : parlez de nouveau.`,error:true});listenBrowser(onFinal,short);}else fail(d.detail||'Transcription indisponible.');return;}
   if(!d.text){if(!short)fail('Je n’ai pas compris les paroles. Pouvez-vous répéter plus distinctement ?');return;}
   onFinal(d.text);
  }catch{setInterim('');fail('Le serveur ne répond pas : la transcription a échoué.');}
 };
 /** Reconnaissance vocale du navigateur (Edge, Chrome). */
 const listenBrowser=(onFinal:(t:string)=>void,short=false)=>{
  if(!SR){fail('La reconnaissance vocale du navigateur n’est pas disponible : utilisez Edge ou Chrome, ou l’écoute Gemini dans les réglages.');return;}
  try{rec.current?.abort();}catch{/* rien */}silence();
  const r=new SR();rec.current=r;r.lang='fr-FR';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;let final='';
  r.onresult=(e:any)=>{let it='';for(let i=e.resultIndex;i<e.results.length;i++){const s=e.results[i][0].transcript;if(e.results[i].isFinal)final+=s;else it+=s;}setInterim(final+it);};
  r.onerror=(e:any)=>{setInterim('');
   const msg:Record<string,string>={'no-speech':'Je n’ai rien entendu. Parlez juste après le signal, un peu plus fort.','audio-capture':'Aucun micro détecté par le navigateur.',
    'not-allowed':'Le micro est refusé : autorisez-le dans la barre d’adresse, puis réessayez.','service-not-allowed':'Le service vocal du navigateur est bloqué.',
    network:'Le service de reconnaissance du navigateur est injoignable.','language-not-supported':'Le français n’est pas pris en charge par ce navigateur.'};
   if(e.error==='aborted')return;
   if((e.error==='network'||e.error==='service-not-allowed'||e.error==='language-not-supported')&&server==='gemini'&&!short){
    push({role:'bot',text:`${msg[e.error]} Je passe au micro autonome (Gemini) : parlez de nouveau.`,error:true});updatePref({ear:'gemini'});listenGemini(onFinal);return;}
   if(!short)fail(msg[e.error]??`Erreur de reconnaissance vocale (${e.error}).`);};
  r.onend=()=>{const t=final.trim();setInterim('');if(t)onFinal(t);else if(!busy.current)setPhase(p=>p==='listening'?'idle':p);};
  setPhase(short?'confirm':'listening');
  try{r.start();}catch{fail('Impossible de démarrer l’écoute du navigateur.');}
 };
 const listen=(onFinal:(t:string)=>void,short=false)=>ear==='gemini'&&server==='gemini'?listenGemini(onFinal,short):listenBrowser(onFinal,short);
 const toggleListen=()=>{
  if(phase==='listening'){mic.current?.stop();try{rec.current?.stop();}catch{/* rien */}return;}
  if(busy.current)return;listen(t=>handle(t));
 };
 const stopAll=()=>{mic.current?.stop();try{rec.current?.abort();}catch{/* rien */}silence();decide.current?.(false);setPhase('idle');setInterim('');setLevel(0);};

 /* ---------- Confirmation (voix ou clic) ---------- */
 const askConfirm=async(label:string)=>{
  setConfirmAsk(label);const p=new Promise<boolean>(res=>{decide.current=res;});
  await speak(`${label}. Vous confirmez ?`);setPhase('confirm');
  listen(t=>{if(YES.test(t.trim()))decide.current?.(true);else if(NO.test(t.trim()))decide.current?.(false);},true);
  const timer=setTimeout(()=>decide.current?.(false),20000);
  const ok=await p;clearTimeout(timer);decide.current=null;setConfirmAsk(null);mic.current?.stop();try{rec.current?.abort();}catch{/* rien */}
  return ok;
 };
 /* ---------- Exécution d'une série d'actions, résultats réels ---------- */
 const execute=async(actions:Action[])=>{
  const results:{id?:string;name:string;result:{ok:boolean;message:string}}[]=[];
  for(const a of actions){
   const label=actionLabel(a);stepsCount.current++;
   patchLast(e=>({...e,steps:[...(e.steps??[]),{label,pending:true}]}));
   if(a.confirm){setPhase('confirm');const ok=await askConfirm(label);
    if(!ok){const r={ok:false,message:'Action annulée : l’utilisateur n’a pas confirmé.'};results.push({id:a.id,name:a.name,result:r});
     patchLast(e=>({...e,steps:e.steps!.map((s,i,arr)=>i===arr.length-1?{label,ok:false,message:r.message}:s)}));continue;}}
   setPhase('acting');const r=await runAction(a);results.push({id:a.id,name:a.name,result:r});
   patchLast(e=>({...e,steps:e.steps!.map((s,i,arr)=>i===arr.length-1?{label,ok:r.ok,message:r.message}:s)}));
  }
  return results;
 };
 /* ---------- Une demande complète ---------- */
 const handle=async(text:string)=>{
  if(busy.current)return;busy.current=true;stepsCount.current=0;
  push({role:'user',text});push({role:'bot',text:'',steps:[]});setPhase('thinking');
  try{
   const post=(body:any)=>fetch('/api/voice/turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({error:'Serveur injoignable.'}));
   const failed:string[]=[];   // échecs constatés pendant cette demande
   let res=await post({message:text,state:ctl.app.getState?.()??{}});
   if(res.error){await localTurn(text,res.engine==='local'?undefined:res.error);return;}
   for(let i=0;i<8&&res&&!res.done&&res.actions?.length;i++){
    const results=await execute(res.actions);results.forEach(r=>{if(!r.result.ok)failed.push(r.result.message);});setPhase('thinking');
    res=await post({results,server_results:res.server_results??[],conversation:res.conversation,model:res.model,state:ctl.app.getState?.()});
    if(res.error)break;
   }
   if(res?.done){
    // Un échec n'est jamais passé sous silence : s'il n'est pas déjà dans la réponse, on l'ajoute.
    let say:string=res.say;
    if(failed.length&&!/pas pu|échou|annul|impossible|refus/i.test(say))say+=` Attention, je n’ai pas pu tout faire : ${failed.join(' ')}`;
    const problem=failed.length>0||/^je n.ai pas (pu|compris)/i.test(say);
    patchLast(e=>({...e,text:say,engine:'Gemini',error:problem}));await speak(say);setPhase(problem?'error':'idle');}
   else{const msg=`${res?.error??'Je n’ai pas pu terminer.'}${stepsCount.current?' Les étapes affichées ci-dessus indiquent ce qui a réellement été fait.':''}`;
    patchLast(e=>({...e,text:msg,error:true}));await speak(msg);setPhase('error');}
  }finally{busy.current=false;}
 };
 /** Secours local : commandes courantes sans IA, questions envoyées à l'assistant de données. */
 const localTurn=async(text:string,why?:string)=>{
  const plan=localPlan(text);
  if(plan){const results=await execute(plan);const ok=results.filter(r=>r.result.ok).map(r=>r.result.message),ko=results.filter(r=>!r.result.ok).map(r=>r.result.message);
   const say=[...ok,...ko].join(' ')||'C’est fait.';patchLast(e=>({...e,text:say,engine:'local',error:!ok.length}));await speak(say);setPhase(ok.length?'idle':'error');return;}
  const r=await fetch('/api/assistant/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:text,context:{}})}).then(x=>x.json()).catch(()=>null);
  if(!r){const m='Je n’ai pas pu joindre le serveur de données.';patchLast(e=>({...e,text:m,error:true}));await speak(m);setPhase('error');return;}
  const say=String(r.answer||'').replace(/[*_`#|]/g,'').replace(/\n+/g,' ').replace(/Une détection thermique.*$/,'').trim();
  patchLast(e=>({...e,text:say+(why?` (${why} Réponse calculée localement.)`:''),engine:'local'}));await speak(say);setPhase('idle');
 };

 handleRef.current=handle;
 const P=PHASES[phase];
 const updatePref=(p:Pref)=>setPref(old=>{const n={...old,...p};savePref(n);return n;});
 const bars=[.35,.7,1,.7,.35];
 return <div className={`va is-${phase}${open?' is-open':''}`} style={{['--lvl' as any]:level}}>
  {open&&<section className="va__panel" aria-label="Assistant vocal">
   <header className="va__head">
    <span className="va__orb-mini" aria-hidden="true"><Icon name={P.icon} size={15}/></span>
    <div><b>Assistant vocal</b><span role="status" aria-live="polite">{P.label}</span></div>
    {phase==='listening'&&<span className="va__meter" aria-label="Niveau du micro">{bars.map((b,i)=><i key={i} style={{transform:`scaleY(${Math.max(.15,Math.min(1,level*1.6*b))})`}}/>)}</span>}
    <button type="button" onClick={()=>setShowSettings(v=>!v)} aria-pressed={showSettings} aria-label="Réglages de l’assistant vocal"><Icon name="settings" size={16}/></button>
    <button type="button" onClick={()=>{stopAll();setOpen(false);}} aria-label="Fermer l’assistant vocal"><Icon name="x" size={16}/></button>
   </header>
   {showSettings&&<div className="va__settings">
    <label>Voix IA<select value={pref.aiVoice??'Charon'} onChange={e=>updatePref({aiVoice:e.target.value,tts:'gemini'})} disabled={server!=='gemini'}>
     {Object.entries(aiVoices).length?Object.entries(aiVoices).map(([k,v])=><option key={k} value={k}>{v}</option>):<option>Indisponible (pas de clé Gemini)</option>}</select></label>
    <label>Lecture<select value={pref.tts??'gemini'} onChange={e=>updatePref({tts:e.target.value as any})}><option value="gemini">Voix IA (Gemini)</option><option value="system">Voix de Windows</option></select></label>
    <label>Voix Windows<select value={pref.sysVoice??sysVoices[0]?.name??''} onChange={e=>updatePref({sysVoice:e.target.value})}>{sysVoices.map(v=><option key={v.name} value={v.name}>{v.name.replace(/Microsoft |Google /,'').replace(/ - .*$/,'')}{MALE.test(v.name)?' (homme)':''}</option>)}</select></label>
    <label>Micro<select value={pref.micId??''} onChange={e=>updatePref({micId:e.target.value||undefined})}><option value="">Micro par défaut de Windows</option>{mics.filter(m=>m.id&&m.id!=='default'&&m.id!=='communications').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
    <div className="va__test">
     <button type="button" onClick={testMic} disabled={probe.running}><Icon name="mic" size={14}/>{probe.running?'Parlez maintenant…':'Tester le micro'}</button>
     <span className="va__testbar" aria-label="Niveau du micro"><i style={{width:`${Math.round(probe.level*100)}%`}}/></span>
     {probe.result&&<small className={probe.result.peak>=0.002?'is-ok':'is-ko'}>{probe.result.peak>=0.002?`Micro OK : « ${probe.result.device} » capte votre voix (niveau ${Math.round(Math.min(1,probe.result.peak/0.08)*100)} %)${probe.result.raw?', sans réduction de bruit':''}.`:`« ${probe.result.device} » ne capte rien${probe.result.muted?' (coupé par Windows ou le matériel)':''}. Essayez un autre micro dans la liste.`}</small>}
     {probe.error&&<small className="is-ko">{probe.error}</small>}
    </div>
    <label className="va__mute"><input type="checkbox" checked={!!pref.raw} onChange={e=>updatePref({raw:e.target.checked})}/>Sans réduction de bruit (si le micro reste muet)</label>
    <label>Écoute<select value={ear} onChange={e=>updatePref({ear:e.target.value as any})}><option value="gemini" disabled={server!=='gemini'}>Micro autonome + Gemini (recommandé)</option><option value="browser" disabled={!SR}>Reconnaissance du navigateur</option></select></label>
    <label>Débit<input type="range" min={0.8} max={1.3} step={0.05} value={pref.rate??1} onChange={e=>updatePref({rate:Number(e.target.value)})}/></label>
    <label className="va__mute"><input type="checkbox" checked={!!pref.mute} onChange={e=>updatePref({mute:e.target.checked})}/>Réponses écrites seulement</label>
    <button type="button" onClick={()=>{primeAudio();speak('Bonjour, je suis l’assistant vocal de FireWatch Africa. Que puis-je faire pour vous ?').then(()=>setPhase('idle'));}}><Icon name="volume" size={14}/>Tester la voix</button>
   </div>}
   <div className="va__log" ref={listRef}>
    {!log.length&&<div className="va__hello"><b>Parlez-moi naturellement.</b>
     <p>Cliquez sur le micro, attendez « Je vous écoute », puis parlez. Exemples : « Montre-moi les feux VIIRS au Gabon cette semaine », « Où est l’alerte critique la plus forte ? », « Lance l’harmonisation ».</p>
     <p className="va__keys"><kbd>Ctrl</kbd>+<kbd>Espace</kbd> pour parler · <kbd>Échap</kbd> pour arrêter · l’écoute s’arrête seule après un silence</p></div>}
    {log.map((e,i)=>e.role==='user'?<p key={i} className="va__user">{e.text}</p>:
     <div key={i} className={`va__bot${e.error?' is-error':''}`}>
      {!!e.steps?.length&&<ul className="va__steps">{e.steps.map((s,j)=><li key={j} className={s.pending?'is-run':s.ok?'is-ok':'is-ko'} title={s.message}>
       <Icon name={s.pending?'refresh':s.ok?'check':'x'} size={13}/><span>{s.label}</span>{s.message&&!s.pending&&<small>{s.message}</small>}</li>)}</ul>}
      {e.text&&<p>{e.text}</p>}
      {e.engine&&<span className="va__engine">{e.engine==='local'?'Compréhension locale':'Gemini'}</span>}
     </div>)}
    {interim&&<p className="va__user is-interim">{interim==='…'?'Transcription en cours…':interim}</p>}
   </div>
   {confirmAsk&&<div className="va__confirm" role="alertdialog" aria-label="Confirmation">
    <Icon name="alert" size={18}/><div><b>{confirmAsk}</b><span>Dites « oui » ou « non », ou choisissez :</span></div>
    <button type="button" className="is-yes" onClick={()=>decide.current?.(true)}><Icon name="check" size={14}/>Confirmer</button>
    <button type="button" onClick={()=>decide.current?.(false)}>Annuler</button>
   </div>}
   <form className="va__form" onSubmit={e=>{e.preventDefault();const t=typed.trim();if(t){setTyped('');handle(t);}}}>
    <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="…ou écrivez votre demande" aria-label="Demande écrite"/>
    <button type="submit" disabled={!typed.trim()} aria-label="Envoyer"><Icon name="send" size={15}/></button>
   </form>
  </section>}
  <button type="button" className="va__orb" onClick={()=>{primeAudio();if(!open)setOpen(true);toggleListen();}}
   aria-label={phase==='listening'?'Terminer et envoyer':'Parler à l’assistant vocal (Ctrl + Espace)'} aria-pressed={phase==='listening'} title="Assistant vocal · Ctrl + Espace">
   <span className="va__ring" aria-hidden="true"/><span className="va__ring is-2" aria-hidden="true"/><span className="va__level" aria-hidden="true"/>
   <Icon name={phase==='listening'?'micOff':phase==='speaking'?'volume':phase==='thinking'||phase==='acting'||phase==='transcribing'?'sparkle':'mic'} size={24}/>
   {!open&&<span className="va__tag">Assistant vocal</span>}
  </button>
 </div>;
}
