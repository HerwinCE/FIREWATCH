/* Commandes directes : choix des capteurs et lancement de l'harmonisation. */
import {useEffect, useRef, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Icon, ShapeSymbol} from '../components/src/components/Icon';

/**
 * MODIS / VIIRS : deux interrupteurs visibles. Les deux allumés = comparaison (valeur « »),
 * un seul allumé = ce capteur seul. On ne peut pas tout éteindre : le dernier reste allumé.
 */
export function SensorToggle({value,onChange,compact=false}:{value:string;onChange:(v:string)=>void;compact?:boolean}){
 const on={MODIS:value!=='VIIRS',VIIRS:value!=='MODIS'};
 const [nudge,setNudge]=useState<string|null>(null);
 const flip=(k:'MODIS'|'VIIRS')=>{
  const other=k==='MODIS'?'VIIRS':'MODIS';
  if(on[k]&&!on[other]){setNudge(k);setTimeout(()=>setNudge(null),500);return;} // dernier capteur actif : on le garde
  onChange(on[k]?other:'');
 };
 const state=value?`${value} seul`:'MODIS + VIIRS · comparaison';
 return <div className={`sensor-toggle${compact?' is-compact':''}`} role="group" aria-label={`Capteurs affichés : ${state}`}>
  {(['MODIS','VIIRS'] as const).map(k=><button key={k} type="button" className={`sensor-toggle__btn is-${k.toLowerCase()}${nudge===k?' is-nudge':''}`} aria-pressed={on[k]} onClick={()=>flip(k)}
   title={on[k]&&!on[k==='MODIS'?'VIIRS':'MODIS']?`${k} est le seul capteur actif`:on[k]?`Masquer ${k}`:`Afficher ${k}`}>
   <span className="sensor-toggle__check" aria-hidden="true">{on[k]?<Icon name="check" size={13}/>:null}</span>
   <ShapeSymbol kind={k} size={12}/>
   <span className="sensor-toggle__txt"><b>{k}</b>{!compact&&<small>{k==='MODIS'?'Terra · Aqua · 1 km':'NOAA-20/21 · SNPP · 375 m'}</small>}</span>
  </button>)}
  {!compact&&<span className="sensor-toggle__state" aria-live="polite">{value?<><Icon name="filter" size={13}/>{value} seul</>:<><Icon name="compare" size={13}/>Comparaison</>}</span>}
 </div>;
}

type RunStatus={status:string;run_id?:number;version?:string;started_at?:string;finished_at?:string;rows_processed?:number;rows_vegetation?:number;groups_created?:number;error_message?:string};
const fr=(v?:number)=>v==null?'—':v.toLocaleString('fr-FR');
const ago=(v?:string)=>{if(!v)return '';const m=Math.round((Date.now()-Date.parse(v))/60000);return m<1?'à l’instant':m<60?`il y a ${m} min`:m<1440?`il y a ${Math.round(m/60)} h`:`le ${new Date(v).toLocaleDateString('fr-FR')}`;};

/** Bouton « Harmoniser » : lance le pipeline, suit son avancement, rafraîchit les données à la fin. */
export function HarmonizeButton({variant='chip'}:{variant?:'chip'|'block'}){
 const qc=useQueryClient();
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState<{kind:'ok'|'err'|'run';text:string}|null>(null);
 const status=useQuery<RunStatus>({queryKey:['harmo-status'],queryFn:()=>fetch('/api/harmonization/status').then(r=>r.json()),refetchInterval:q=>q.state.data?.status==='running'||busy?2000:false});
 const s=status.data,running=busy||s?.status==='running';
 const was=useRef(running);
 useEffect(()=>{
  if(was.current&&!running&&s){
   if(s.status==='success'){setMsg({kind:'ok',text:s.rows_processed?`Harmonisation terminée : ${fr(s.rows_processed)} nouvelles lignes traitées, ${fr(s.groups_created)} rapprochements MODIS–VIIRS.`:`Données déjà à jour : aucune nouvelle détection à harmoniser (${fr(s.rows_vegetation)} détections de végétation prêtes).`});if(s.rows_processed)qc.invalidateQueries();}
   else if(s.status==='failed'||s.status==='error')setMsg({kind:'err',text:`Échec de l’harmonisation${s.error_message?` : ${s.error_message}`:''}.`});
  }
  was.current=running;
 },[running,s?.status]);
 useEffect(()=>{if(msg&&msg.kind!=='run'){const t=setTimeout(()=>setMsg(null),9000);return()=>clearTimeout(t);}},[msg]);
 const start=async()=>{
  if(running)return;setBusy(true);setMsg({kind:'run',text:'Harmonisation lancée…'});
  try{
   const r=await fetch('/api/harmonization/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'incremental'})});
   if(r.status===409)setMsg({kind:'run',text:'Une harmonisation est déjà en cours.'});
   else if(!r.ok){const d=await r.json().catch(()=>({}));setMsg({kind:'err',text:d.detail||`Lancement impossible (${r.status}).`});setBusy(false);return;}
   await status.refetch();
  }catch{setMsg({kind:'err',text:'Serveur injoignable.'});}
  setBusy(false);
 };
 // Libellé court dans les en-têtes (place comptée), complet dans les panneaux.
 const label=running?(variant==='chip'?'En cours…':'Harmonisation en cours…'):variant==='chip'?'Harmoniser':'Harmoniser MODIS + VIIRS';
 const sub=running?`${fr(s?.rows_processed)} lignes traitées`:s?.finished_at?`Dernière : ${ago(s.finished_at)}`:'Jamais lancée';
 return <div className={`harmo-btn is-${variant}`}>
  <button type="button" onClick={start} disabled={running} aria-busy={running} title="Unifie la confiance, la grille 0,01°, les versions SP/NRT et les rapprochements MODIS–VIIRS">
   <span className={`harmo-btn__icon${running?' is-spin':''}`}><Icon name={running?'refresh':'merge'} size={variant==='block'?18:15}/></span>
   <span className="harmo-btn__txt"><b>{label}</b>{variant==='block'&&<small>{sub}</small>}</span>
  </button>
  {msg&&<div className={`notice-pop is-${msg.kind==='ok'?'success':msg.kind==='err'?'danger':'info'}`} role={msg.kind==='err'?'alert':'status'}>
   <Icon name={msg.kind==='ok'?'check':msg.kind==='err'?'alert':'info'} size={15}/><span>{msg.text}</span>
   {msg.kind!=='run'&&<button type="button" onClick={()=>setMsg(null)} aria-label="Fermer le message"><Icon name="x" size={13}/></button>}
  </div>}
 </div>;
}
