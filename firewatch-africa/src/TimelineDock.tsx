import {useEffect, useMemo, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {get} from './api';
import {Icon} from '../components/src/components/Icon';

type Row={day:string;sensor:string;detections:number;active_cells:number};
const MONTHS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const label=(d:string)=>{const [y,m,j]=d.split('-');return `${Number(j)} ${MONTHS[Number(m)-1]} ${y}`;};
const fr=(v:number)=>v.toLocaleString('fr-FR');
const RANGES:[string,number][]=[['30 j',30],['90 j',90],['1 an',365],['2 ans',730]];
const SPEEDS=[1,2,4];

/**
 * Chronologie : fenêtre fixe en bas de la carte, repliable.
 * Une fenêtre glissante de 1 à N jours parcourt les jours disponibles ;
 * la lecture l'avance d'un jour à chaque pas et filtre la carte sur cette période.
 */
export function TimelineDock({query,open,onToggle,start,end,setRange,playSignal}:{playSignal?:{k:number;days?:number};query:string;open:boolean;onToggle:()=>void;start:string;end:string;setRange:(s:string,e:string)=>void}){
 // La chronologie ignore la période choisie : elle doit toujours montrer tous les jours disponibles.
 const base=useMemo(()=>{const p=new URLSearchParams(query);p.delete('start_date');p.delete('end_date');return p.toString();},[query]);
 const tl=useQuery<{items:Row[]}>({queryKey:['timeline',base,''],queryFn:()=>get('/statistics/timeline',base)});
 const [span,setSpan]=useState(30),[win,setWin]=useState(1),[speed,setSpeed]=useState(1),[playing,setPlaying]=useState(false),[cursor,setCursor]=useState(-1);
 const all=useMemo(()=>{const m=new Map<string,{modis:number;viirs:number}>();(tl.data?.items||[]).forEach(r=>{const o=m.get(r.day)??{modis:0,viirs:0};if(r.sensor==='MODIS')o.modis+=Number(r.detections||0);else o.viirs+=Number(r.detections||0);m.set(r.day,o);});
  return [...m.entries()].sort(([a],[b])=>a<b?-1:1).map(([day,v])=>({day,...v,total:v.modis+v.viirs}));},[tl.data]);
 const days=useMemo(()=>{if(!span||!all.length)return all;const last=Date.parse(all[all.length-1].day);return all.filter(d=>last-Date.parse(d.day)<span*864e5);},[all,span]);
 const max=Math.max(1,...days.map(d=>d.total));
 const maxWin=Math.max(1,Math.min(days.length,span||days.length,365));
 const w=Math.min(win,maxWin);
 // Le curseur suit la période déjà choisie ailleurs (panneau Couches, calendrier…).
 useEffect(()=>{if(playing||!days.length)return;const i=end?days.findIndex(d=>d.day===end):-1;setCursor(i);},[end,days,playing]);
 const apply=(i:number)=>{if(!days.length)return;const c=Math.max(0,Math.min(days.length-1,i));setCursor(c);setRange(days[Math.max(0,c-w+1)].day,days[c].day);};
 // Lecture : un pas par seconde (÷ vitesse), arrêt automatique au dernier jour.
 const cur=useRef(cursor);cur.current=cursor;
 useEffect(()=>{if(!playing)return;const id=setInterval(()=>{const next=cur.current+1;if(next>=days.length){setPlaying(false);return;}apply(next);},1000/speed);return()=>clearInterval(id);},[playing,speed,days,w]);
 const play=()=>{if(playing){setPlaying(false);return;}if(cursor<0||cursor>=days.length-1)apply(Math.min(days.length-1,w-1));setPlaying(true);};
 // Lecture demandée par l'assistant vocal : fenêtre de N jours, départ au début de la plage chargée.
 const pending=useRef<{days?:number}|null>(null);
 useEffect(()=>{if(playSignal)pending.current={days:playSignal.days};},[playSignal?.k]);
 useEffect(()=>{const p=pending.current;if(!p||!days.length)return;pending.current=null;
  const n=Math.max(1,Math.min(p.days??1,maxWin));setWin(n);setCursor(-1);
  setTimeout(()=>{setRange(days[0].day,days[Math.min(days.length-1,n-1)].day);setCursor(Math.min(days.length-1,n-1));setPlaying(true);},250);
 },[playSignal?.k,days.length]);
 const sel=cursor>=0&&days[cursor]?{from:Math.max(0,cursor-w+1),to:cursor}:null;
 const sum=sel?days.slice(sel.from,sel.to+1).reduce((a,d)=>({modis:a.modis+d.modis,viirs:a.viirs+d.viirs}),{modis:0,viirs:0}):null;
 const reset=()=>{setPlaying(false);setCursor(-1);setRange('','');};
 return <section className={`tdock${open?' is-open':''}`} aria-label="Chronologie des détections">
  <button type="button" className="tdock__tab" onClick={onToggle} aria-expanded={open}>
   <Icon name="activity" size={16}/><b>Chronologie</b>
   <span>{sel?`${label(days[sel.from].day)}${w>1?` → ${label(days[sel.to].day)}`:''}`:start||end?`${start||'…'} → ${end||'…'}`:'Toute la période'}</span>
   {playing&&<i className="tdock__live" aria-label="Lecture en cours"/>}
   <Icon name={open?'chevronDown':'chevronUp'} size={16}/>
  </button>
  {open&&<div className="tdock__body">
   <div className="tdock__controls">
    <div className="tdock__transport">
     <button type="button" onClick={()=>{setPlaying(false);apply(cursor-1)}} disabled={!days.length||cursor<=0} aria-label="Jour précédent"><Icon name="stepBack" size={16}/></button>
     <button type="button" className="tdock__play" onClick={play} disabled={!days.length} aria-label={playing?'Mettre en pause':'Lire la chronologie'}><Icon name={playing?'pause':'play'} size={18}/></button>
     <button type="button" onClick={()=>{setPlaying(false);apply(cursor+1)}} disabled={!days.length||cursor>=days.length-1} aria-label="Jour suivant"><Icon name="stepForward" size={16}/></button>
    </div>
    <div className="tdock__field"><span>Vitesse</span><div className="tdock__seg" role="group" aria-label="Vitesse de lecture">{SPEEDS.map(s=><button key={s} type="button" aria-pressed={speed===s} onClick={()=>setSpeed(s)}>×{s}</button>)}</div></div>
    <label className="tdock__field tdock__win"><span>Période affichée : <b>{w} jour{w>1?'s':''}</b></span>
     <input type="range" min={1} max={maxWin} value={w} onChange={e=>{const v=Number(e.target.value);setWin(v);if(cursor>=0&&days[cursor])setRange(days[Math.max(0,cursor-v+1)].day,days[cursor].day);}} aria-label="Nombre de jours affichés à chaque pas"/>
     <input type="number" min={1} max={maxWin} value={w} onChange={e=>setWin(Math.max(1,Math.min(maxWin,Number(e.target.value)||1)))} aria-label="Nombre de jours"/>
    </label>
    <div className="tdock__field"><span>Jours chargés</span><div className="tdock__seg" role="group" aria-label="Étendue de la chronologie">{RANGES.map(([l,v])=><button key={l} type="button" aria-pressed={span===v} onClick={()=>{setPlaying(false);setSpan(v);setCursor(-1);}}>{l}</button>)}</div></div>
    <button type="button" className="tdock__reset" onClick={reset}><Icon name="reset" size={14}/>Toute la période</button>
   </div>
   {days.length>0&&<p className="tdock__note">Hauteur des barres en racine carrée : les petits jours restent visibles à côté des grands.</p>}
   {tl.isPending?<p className="tdock__msg" role="status">Chargement de la chronologie…</p>:!days.length?<p className="tdock__msg">Aucun jour disponible pour cette sélection.</p>:<>
    <div className="tdock__bars" style={{gridTemplateColumns:`repeat(${days.length},minmax(0,1fr))`}}>
     {days.map((d,i)=>{const on=sel&&i>=sel.from&&i<=sel.to;return <button key={d.day} type="button" className={`tdock__bar${on?' is-on':''}${sel&&i===sel.to?' is-head':''}`} onClick={()=>{setPlaying(false);apply(i)}}
      title={`${label(d.day)} : ${fr(d.total)} détections (MODIS ${fr(d.modis)} · VIIRS ${fr(d.viirs)})`} aria-label={`${label(d.day)}, ${fr(d.total)} détections`}>
      {(()=>{const h=Math.sqrt(d.total/max)*100,k=d.total?h/d.total:0;return <><i className="v" style={{height:`${d.viirs*k}%`}}/><i className="m" style={{height:`${d.modis*k}%`}}/></>;})()}</button>;})}
    </div>
    <input className="tdock__scrub" type="range" min={0} max={days.length-1} value={Math.max(0,cursor)} onChange={e=>{setPlaying(false);apply(Number(e.target.value))}} aria-label="Position dans la chronologie"/>
    <div className="tdock__foot">
     <span>{label(days[0].day)}</span>
     <span className="tdock__sum">{sum?<><b>{fr(sum.modis+sum.viirs)}</b> détections sur la période · <i className="m"/>MODIS {fr(sum.modis)} · <i className="v"/>VIIRS {fr(sum.viirs)}</>:'Lancez la lecture ou cliquez un jour pour filtrer la carte.'}</span>
     <span>{label(days[days.length-1].day)}</span>
    </div>
   </>}
  </div>}
 </section>;
}
