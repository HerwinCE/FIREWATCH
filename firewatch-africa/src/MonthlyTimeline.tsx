import {useEffect, useMemo, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {get} from './api';
import {Icon} from '../components/src/components/Icon';

type Item={period:string;period_end:string;sensor_family:'MODIS'|'VIIRS';value:number|null;coverage:string};
type Month={period:string;end:string;value:number|null;median:number|null;p90:number|null;hot:boolean;pct:number|null};
const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const fr=(v:number)=>v.toLocaleString('fr-FR');
const label=(p:string)=>`${MONTHS[Number(p.slice(5,7))-1]} ${p.slice(0,4)}`;
const quantile=(xs:number[],q:number)=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),i=(s.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
const SPEEDS=[1,2,4];

/**
 * Chronologie mensuelle sur toute l'archive : une barre par mois, comparée à la normale du même mois
 * (médiane de la même famille de capteur — jamais VIIRS face à une médiane MODIS).
 * Lecture : un mois par pas ; chaque mois filtre la carte sur ses dates.
 */
export function MonthlyTimeline({query,end,setRange,family:wanted}:{query:string;end:string;setRange:(s:string,e:string)=>void;family?:'MODIS'|'VIIRS'}){
 const [family,setFamily]=useState<'MODIS'|'VIIRS'>(wanted??'MODIS');
 useEffect(()=>{if(wanted)setFamily(wanted);},[wanted]);
 const base=useMemo(()=>{const p=new URLSearchParams(query);['start_date','end_date','sensor','sensor_family'].forEach(k=>p.delete(k));
  p.set('granularity','month');p.set('metric','detections');p.set('sensor_family',family);return p.toString();},[query,family]);
 const q=useQuery<{items:Item[];domain?:string|null}>({queryKey:['tl-month',base],queryFn:()=>get('/detections/timeline',base),staleTime:10*60_000});
 const months=useMemo<Month[]>(()=>{
  const items=(q.data?.items??[]).filter(i=>i.sensor_family===family);
  const first=items.findIndex(i=>i.value!=null);const list=first<0?[]:items.slice(first);
  const byMonth=new Map<string,number[]>();list.forEach(i=>{if(i.value!=null){const k=i.period.slice(5,7);const a=byMonth.get(k)??[];a.push(i.value);byMonth.set(k,a);}});
  return list.map(i=>{const ref=byMonth.get(i.period.slice(5,7))??[];const med=quantile(ref,.5),p90=quantile(ref,.9);
   return {period:i.period,end:i.period_end,value:i.value,median:med,p90,hot:i.value!=null&&p90!=null&&ref.length>=5&&i.value>p90&&i.value>0,
    pct:i.value!=null&&med?Math.round(100*(i.value-med)/med):null};});
 },[q.data,family]);
 const max=Math.max(1,...months.map(m=>m.value??0));
 const [cursor,setCursor]=useState(-1),[hover,setHover]=useState(-1),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
 // Le curseur suit la période choisie ailleurs (fin de période dans un mois connu).
 useEffect(()=>{if(playing||!months.length)return;const i=end?months.findIndex(m=>end>=m.period&&end<=m.end):-1;setCursor(i);},[end,months,playing]);
 const today=new Date().toISOString().slice(0,10);
 const apply=(i:number)=>{if(!months.length)return;const c=Math.max(0,Math.min(months.length-1,i));setCursor(c);const m=months[c];setRange(m.period,m.end>today?today:m.end);};
 const cur=useRef(cursor);cur.current=cursor;
 useEffect(()=>{if(!playing)return;const id=setInterval(()=>{const n=cur.current+1;if(n>=months.length){setPlaying(false);return;}apply(n);},700/speed);return()=>clearInterval(id);},[playing,speed,months]);
 const play=()=>{if(playing){setPlaying(false);return;}if(cursor<0||cursor>=months.length-1)apply(0);setPlaying(true);};
 const shown=months[hover>=0?hover:cursor>=0?cursor:months.length-1];
 const svg=useRef<SVGSVGElement>(null);
 const at=(e:{clientX:number})=>{const r=svg.current?.getBoundingClientRect();if(!r||!months.length)return -1;return Math.max(0,Math.min(months.length-1,Math.floor((e.clientX-r.left)/r.width*months.length)));};
 const years=months.map((m,i)=>[m.period,i] as const).filter(([p])=>p.endsWith('-01-01')&&Number(p.slice(0,4))%2===0);
 return <div className="tdock__monthwrap">
  <div className="tdock__controls">
   <div className="tdock__transport">
    <button type="button" onClick={()=>{setPlaying(false);apply(cursor-1)}} disabled={!months.length||cursor<=0} aria-label="Mois précédent"><Icon name="stepBack" size={16}/></button>
    <button type="button" className="tdock__play" onClick={play} disabled={!months.length} aria-label={playing?'Mettre en pause':'Lire mois par mois'}><Icon name={playing?'pause':'play'} size={18}/></button>
    <button type="button" onClick={()=>{setPlaying(false);apply(cursor+1)}} disabled={!months.length||cursor>=months.length-1} aria-label="Mois suivant"><Icon name="stepForward" size={16}/></button>
   </div>
   {shown&&<div className="tdock__month"><div><h3>{label(shown.period)}</h3>
    <p>{shown.value==null?'Données absentes pour ce mois':<><b>{fr(shown.value)}</b> détection{shown.value>1?'s':''}{shown.pct!=null?` · ${shown.pct>0?'+':shown.pct<0?'−':''}${Math.abs(shown.pct)} % vs normale`:''}{shown.median!=null?` (médiane ${fr(Math.round(shown.median))})`:''}</>}</p></div></div>}
   <div className="tdock__field"><span>Capteur</span><div className="tdock__seg" role="group" aria-label="Famille de capteur">{(['MODIS','VIIRS'] as const).map(f=><button key={f} type="button" aria-pressed={family===f} onClick={()=>{setPlaying(false);setFamily(f);}}>{f}</button>)}</div></div>
   <div className="tdock__field"><span>Vitesse</span><div className="tdock__seg" role="group" aria-label="Vitesse de lecture">{SPEEDS.map(s=><button key={s} type="button" aria-pressed={speed===s} onClick={()=>setSpeed(s)}>×{s}</button>)}</div></div>
   <div className="tdock__legend"><span><i style={{background:'#B4532A'}}/>Détections / mois</span><span><i style={{background:'#FF8A3D'}}/>Très supérieur à la normale</span></div>
  </div>
  {q.isPending?<p className="tdock__msg" role="status">Chargement de l’historique mensuel…</p>:q.isError?<p className="tdock__msg" role="alert">Historique indisponible : le serveur ne répond pas.</p>:!months.length?<p className="tdock__msg">Aucun mois disponible pour {family}.</p>:<>
   <div className="tdock__monthly">
    <svg ref={svg} viewBox={`0 0 ${months.length} 100`} preserveAspectRatio="none" role="img" aria-label={`Détections ${family} par mois, ${label(months[0].period)} à ${label(months[months.length-1].period)}`}
     onPointerMove={e=>setHover(at(e))} onPointerLeave={()=>setHover(-1)} onClick={e=>{setPlaying(false);apply(at(e));}}>
     {months.map((m,i)=>{const h=m.value?Math.max(1.2,Math.sqrt(m.value/max)*96):0;return <rect key={m.period} className={`bar${m.hot?' is-hot':''}${i===cursor?' is-on':''}`} x={i+.12} width={.76} y={100-h} height={h}/>;})}
     {hover>=0&&<line className="hover" x1={hover+.5} x2={hover+.5} y1={0} y2={100} vectorEffect="non-scaling-stroke"/>}
     {cursor>=0&&<rect className="cursor" x={cursor+.1} width={.8} y={-4} height={3}/>}
    </svg>
   </div>
   <div className="tdock__years" aria-hidden="true">{years.map(([p,i])=><span key={p} style={{left:`${(i+.5)/months.length*100}%`}}>{p.slice(0,4)}</span>)}</div>
   <p className="tdock__note">Hauteur en racine carrée. {q.data?.domain?<>Zone : {q.data.domain}. </>:null}Normale : médiane du même mois sur toute l’archive {family} ; orange vif au-delà du 9ᵉ décile. Cliquez un mois pour filtrer la carte.</p>
  </>}
 </div>;
}
