import {useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {Icon} from '../components/src/components/Icon';

const MONTHS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const MONTHS_LONG=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const fr=(v:number|null|undefined,d=0)=>v==null?'—':v.toLocaleString('fr-FR',{maximumFractionDigits:d});

/* ---------------- Anomaly Banner (EF-02, Design System §5.7) ---------------- */
export function AnomalyBanner({data,loading,error,onDetail}:{data:any;loading?:boolean;error?:boolean;onDetail?:()=>void}){
 if(loading)return <div className="anomaly anomaly--loading" role="status">Calcul de l’anomalie du mois…</div>;
 if(error)return <div className="anomaly anomaly--error" role="status"><Icon name="alert" size={20}/><p>Anomalie non calculable : le service d’historique ne répond pas.</p></div>;
 if(!data||data.position==='unknown'||data.current_value==null)
  return <div className="anomaly anomaly--normal" role="status"><Icon name="info" size={20}/><p>{data?.message??'Historique insuffisant pour cette zone : anomalie non calculable.'}</p></div>;
 const [y,m]=data.period.month.split('-').map(Number);
 const [d1,d2]=data.period.days_compared.split('-').map(Number);
 const ref=data.reference, pct=data.anomaly_pct, abs=data.anomaly_abs;
 const variant=data.position==='above_normal'?'up':data.position==='below_normal'?'down':'normal';
 const metric=data.metric==='active_cells'?'cellules actives':'détections';
 const sign=(v:number)=>v>0?'+':v<0?'−':'';
 const delta=pct!=null?`${sign(pct)}${fr(Math.abs(pct),1)} %`:`${sign(abs)}${fr(Math.abs(abs))} ${metric} (médiane nulle)`;
 const where={up:'Au-dessus de la normale',down:'En dessous de la normale',normal:'Dans la normale'}[variant];
 return <div className={`anomaly anomaly--${variant}`} role="status" aria-live="polite">
  <Icon name={variant==='up'?'trendUp':variant==='down'?'trendDown':'equal'} size={22}/>
  <p>Activité du mois en cours ({d1}–{d2} {MONTHS_LONG[m-1]} {y}{data.period.partial?', mois partiel':''}) : <b>{delta}</b> par rapport à la médiane historique {data.sensor_family} {ref.years} — {fr(data.current_value)} {metric} contre {fr(ref.median,1)}. <b>{where}</b> (P25 = {fr(ref.p25,1)}, P75 = {fr(ref.p75,1)} · {ref.n_years} années{ref.excluded_years.length?`, ${ref.excluded_years.length} exclues pour données manquantes`:''}).</p>
  {onDetail&&<button className="anomaly__link" onClick={onDetail}>Voir le détail</button>}
 </div>;
}

/* ---------------- Courbe médiane mensuelle + bande P25–P75 (EF-26) ---------------- */
export function MedianChart({data}:{data:any}){
 const curve:any[]=data?.monthly_reference||[];
 if(!curve.length)return <p className="muted">Courbe de référence indisponible.</p>;
 const [, m]=data.period.month.split('-').map(Number);
 const W=640,H=220,L=44,R=12,T=12,B=28,iw=W-L-R,ih=H-T-B;
 const max=Math.max(1,data.current_value??0,...curve.map(c=>c.p75??0))*1.1;
 const x=(i:number)=>L+(i+.5)*iw/12, y=(v:number)=>T+ih-(v/max)*ih;
 const band=curve.map((c,i)=>`${x(i)},${y(c.p75??0)}`).join(' ')+' '+[...curve].reverse().map((c,i)=>`${x(11-i)},${y(c.p25??0)}`).join(' ');
 const line=curve.map((c,i)=>`${x(i)},${y(c.median??0)}`).join(' ');
 const up=data.position==='above_normal',down=data.position==='below_normal';
 const ticks=[0,.25,.5,.75,1].map(t=>Math.round(max*t));
 return <figure className="median-chart">
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Médiane mensuelle ${data.sensor_family} ${data.reference.years} avec bande P25–P75, et mois en cours`}>
   {ticks.map(t=><g key={t}><line x1={L} x2={W-R} y1={y(t)} y2={y(t)} className="mc__grid"/><text x={L-6} y={y(t)+4} textAnchor="end" className="mc__axis">{t}</text></g>)}
   {MONTHS.map((n,i)=><text key={n} x={x(i)} y={H-8} textAnchor="middle" className="mc__axis">{n}</text>)}
   <polygon points={band} className="mc__band"/>
   <polyline points={line} className="mc__median"/>
   <circle cx={x(m-1)} cy={y(data.current_value)} r={6} className={`mc__point${up?' is-up':down?' is-down':''}`}/>
  </svg>
  <figcaption className="muted small">Ligne : médiane mensuelle {data.sensor_family} ({data.reference.years}) · bande : P25–P75 · point : mois en cours ({data.period.partial?`jours ${data.period.days_compared} seulement, comparés aux mêmes jours`:'mois complet'}). Métrique : {data.metric==='active_cells'?'cellules actives de 0,01°':'détections'}, végétation présumée.</figcaption>
 </figure>;
}

/* ---------------- Fire Calendar Heatmap année × mois (EF-27, Design System §5.15) ---------------- */
type Item={period:string;value:number|null;coverage:'full'|'partial'|'gap'|'unavailable';sensor_family:string};
export function FireCalendar({items,compact=false,selected,onSelect,family,metric}:{items:Item[];compact?:boolean;selected?:string;onSelect?:(period:string|null)=>void;family:string;metric:string}){
 const grid=useRef<HTMLDivElement>(null);
 const [table,setTable]=useState(false);
 const years=useMemo(()=>[...new Set(items.map(i=>i.period.slice(0,4)))].sort(),[items]);
 const byKey=useMemo(()=>new Map(items.map(i=>[i.period.slice(0,7),i])),[items]);
 // Classes par quantiles sur les cellules non nulles (5 classes + zéro), bornes affichées dans la légende.
 const bounds=useMemo(()=>{const v=items.filter(i=>i.value&&i.value>0).map(i=>i.value as number).sort((a,b)=>a-b);
  if(!v.length)return [] as number[];return [.2,.4,.6,.8].map(q=>v[Math.min(v.length-1,Math.floor(q*v.length))]);},[items]);
 const level=(v:number)=>v<=0?0:1+bounds.filter(b=>v>b).length;
 const max=Math.max(0,...items.map(i=>i.value??0));
 const unit=metric==='active_cells'?'cellules actives':'détections';
 const label=(k:string,it?:Item)=>{const [y,m]=k.split('-').map(Number);const when=`${MONTHS_LONG[m-1]} ${y}`;
  if(!it||it.coverage==='unavailable')return `${when} — ${family} indisponible`;
  if(it.coverage==='gap')return `${when} — trou de données (aucun fichier reçu)`;
  return `${when} — ${fr(it.value)} ${unit} — ${family}${it.coverage==='partial'?' (mois partiel)':''}`;};
 const move=(e:KeyboardEvent<HTMLButtonElement>,yi:number,mi:number)=>{
  const d:{[k:string]:[number,number]}={ArrowRight:[0,1],ArrowLeft:[0,-1],ArrowDown:[1,0],ArrowUp:[-1,0]};
  if(!d[e.key])return;e.preventDefault();
  const ny=Math.max(0,Math.min(years.length-1,yi+d[e.key][0])),nm=Math.max(0,Math.min(11,mi+d[e.key][1]));
  (grid.current?.querySelector(`[data-pos="${ny}-${nm}"]`) as HTMLElement|null)?.focus();
 };
 if(!items.length)return <p className="muted">Calendrier indisponible.</p>;
 return <div className={`firecal${compact?' firecal--compact':''}`}>
  <div className="firecal__grid" ref={grid} role="grid" aria-label={`Calendrier de feu ${family}, ${unit} par mois`} style={{gridTemplateColumns:`auto repeat(12, minmax(${compact?12:26}px, 1fr))`}}>
   <span role="presentation"/>{MONTHS.map(n=><span key={n} className="firecal__month" aria-hidden="true">{compact?n[0].toUpperCase():n}</span>)}
   {years.map((y,yi)=><div key={y} role="row" className="firecal__row">
    <span className="firecal__year" role="rowheader">{y}</span>
    {MONTHS.map((_,mi)=>{const k=`${y}-${String(mi+1).padStart(2,'0')}`;const it=byKey.get(k);
     const state=!it||it.coverage==='unavailable'?'unavailable':it.coverage==='gap'?'gap':`l${level(it.value??0)}`;
     const usable=state!=='unavailable'&&state!=='gap';const isSel=selected===k;
     return <button key={k} role="gridcell" data-pos={`${yi}-${mi}`} tabIndex={yi===years.length-1&&mi===0?0:-1}
      className={`firecal__cell is-${state}${it?.coverage==='partial'?' is-partial':''}${isSel?' is-selected':''}`}
      aria-label={label(k,it)+(isSel?', sélectionné':'')} aria-selected={isSel} title={label(k,it)}
      aria-disabled={!usable}
      onClick={()=>usable&&onSelect?.(isSel?null:k)} onKeyDown={e=>move(e,yi,mi)}>
      {!compact&&usable&&(it?.value??0)>0?<span>{it!.value! >= 1000?`${Math.round(it!.value!/100)/10}k`:it!.value}</span>:null}
     </button>;})}
   </div>)}
  </div>
  <div className="firecal__legend">
   <span>0</span>{[0,1,2,3,4,5].map(l=><i key={l} className={`firecal__swatch is-l${l}`} title={l===0?'zéro détection':l===1?`1 – ${bounds[0]??'…'}`:l===5?`> ${bounds[3]??'…'}`:`${(bounds[l-2]??0)+1} – ${bounds[l-1]??'…'}`}/>)}<span>{fr(max)} {unit}</span>
   <span className="firecal__key"><i className="firecal__swatch is-unavailable"/>capteur indisponible</span>
   <span className="firecal__key"><i className="firecal__swatch is-gap"/>trou de données</span>
   <span className="firecal__key"><i className="firecal__swatch is-l0"/>zéro détection</span>
  </div>
  {!compact&&<p className="muted small">Classes par quantiles des mois non nuls : {bounds.length?`1–${bounds[0]}, ${bounds[0]+1}–${bounds[1]}, ${bounds[1]+1}–${bounds[2]}, ${bounds[2]+1}–${bounds[3]}, > ${bounds[3]}`:'—'}. Cliquez un mois (ou Entrée) pour filtrer carte, graphiques et export ; recliquez pour annuler. Flèches pour se déplacer.</p>}
  {!compact&&<><button className="btn btn--sm" onClick={()=>setTable(!table)} aria-expanded={table}>{table?'Masquer':'Afficher'} le tableau équivalent</button>
   {table&&<div className="table-wrap"><table><caption className="sr-only">Calendrier de feu en tableau</caption><thead><tr><th scope="col">Année</th>{MONTHS.map(n=><th key={n} scope="col">{n}</th>)}</tr></thead>
    <tbody>{years.map(y=><tr key={y}><th scope="row">{y}</th>{MONTHS.map((_,mi)=>{const it=byKey.get(`${y}-${String(mi+1).padStart(2,'0')}`);return <td key={mi}>{!it||it.coverage==='unavailable'?'indispo.':it.coverage==='gap'?'trou':fr(it.value)}</td>})}</tr>)}</tbody></table></div>}</>}
 </div>;
}
