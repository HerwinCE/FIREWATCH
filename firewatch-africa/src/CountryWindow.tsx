import {useEffect,useMemo,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {useQuery} from '@tanstack/react-query';
import {Icon} from '../components/src/components/Icon';
import {FireCalendar} from './history';
import {sensorOf,SatGlyph} from './harmonized';

/* ---------- Fonds de carte et modes de représentation ---------- */
export const BASEMAPS={
 satellite:{label:'Satellite',style:'mapbox://styles/mapbox/satellite-streets-v12'},
 dark:{label:'Nuit',style:'mapbox://styles/mapbox/dark-v11'},
 light:{label:'Clair',style:'mapbox://styles/mapbox/light-v11'},
 relief:{label:'Relief',style:'mapbox://styles/mapbox/outdoors-v12'},
} as const;
export type Basemap=keyof typeof BASEMAPS;
export const DISPLAYS={points:'Lumineux',heat:'Chaleur',sensors:'Capteurs'} as const;
export type Display=keyof typeof DISPLAYS;

export function MapDisplayControl({basemap,display,allPoints,provinces,onBasemap,onDisplay,onAllPoints,onProvinces,extra,projection,onProjection}:{projection?:'globe'|'mercator';onProjection?:(p:'globe'|'mercator')=>void;extra?:React.ReactNode;basemap:Basemap;display:Display;allPoints:boolean;provinces:boolean;onBasemap:(b:Basemap)=>void;onDisplay:(d:Display)=>void;onAllPoints:(v:boolean)=>void;onProvinces:(v:boolean)=>void}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 // Un seul panneau ouvert à la fois : clic à l'extérieur, Échap ou ouverture d'une fenêtre le referment.
 useEffect(()=>{if(!open)return;
  const out=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  const close=()=>setOpen(false);
  addEventListener('pointerdown',out,true);addEventListener('keydown',esc);addEventListener('fw:close-popovers',close);
  return()=>{removeEventListener('pointerdown',out,true);removeEventListener('keydown',esc);removeEventListener('fw:close-popovers',close);};},[open]);
 return <div ref={root} className={`map-display${open?' is-open':''}`}>
  <button className="map-display__toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>
   <Icon name="filter" size={16}/><span>Affichage</span><Icon name="chevronDown" size={14} className="map-display__chev"/>
  </button>
  {open&&<div className="map-display__panel">
   {onProjection&&<><span className="map-display__label">Vue</span>
   <div className="map-display__seg map-display__seg--2" role="group" aria-label="Projection de la carte">
    <button aria-pressed={projection==='globe'} onClick={()=>onProjection('globe')}>Globe</button>
    <button aria-pressed={projection==='mercator'} onClick={()=>onProjection('mercator')}>Carte plane</button>
   </div></>}
   <span className="map-display__label">Fond de carte</span>
   <div className="map-display__grid" role="group" aria-label="Fond de carte">
    {(Object.keys(BASEMAPS) as Basemap[]).map(b=><button key={b} aria-pressed={basemap===b} className={`map-display__opt is-${b}`} onClick={()=>onBasemap(b)}><i aria-hidden="true"/>{BASEMAPS[b].label}</button>)}
   </div>
   <span className="map-display__label">Représentation</span>
   <div className="map-display__seg" role="group" aria-label="Représentation des détections">
    {(Object.keys(DISPLAYS) as Display[]).map(d=><button key={d} aria-pressed={display===d} onClick={()=>onDisplay(d)}>{DISPLAYS[d]}</button>)}
   </div>
   <label className="map-display__switch"><span className="switch"><input type="checkbox" role="switch" checked={allPoints} onChange={e=>onAllPoints(e.target.checked)}/><span/></span>
    <span><b>Afficher tous les points</b><small>Chaque détection, sans regroupement (60 000 max., les plus intenses d’abord)</small></span></label>
   <label className="map-display__switch"><span className="switch"><input type="checkbox" role="switch" checked={provinces} onChange={e=>onProvinces(e.target.checked)}/><span/></span>
    <span><b>Limites des provinces</b><small>Gabon · geoBoundaries</small></span></label>
   {extra}
  </div>}
 </div>;
}

const n=(v:unknown,d=0)=>v==null||v===''?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const day=(v?:string)=>v?new Date(v).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'—';
const MONTHS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const iso=(d:Date)=>d.toISOString().slice(0,10);

export type Zone={kind:'country'|'region'|'province'|'continent';name:string;iso?:string;name_en?:string;polygons?:number[][][];cells?:number[][]};
type Period={key:string;label:string;start?:string;end?:string};

function periods(latest:string):Period[]{
 const end=new Date(latest+'T12:00:00Z'),back=(days:number)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-days+1);return iso(d);};
 return [{key:'7j',label:'7 jours',start:back(7),end:latest},{key:'30j',label:'30 jours',start:back(30),end:latest},
  {key:'12m',label:'12 mois',start:back(365),end:latest},{key:'5a',label:'5 ans',start:back(5*365),end:latest},{key:'all',label:'Tout'}];
}

/* ---------- Fenêtre de zone : flottante, déplaçable, redimensionnable ---------- */
type Tab='overview'|'calendar'|'provinces'|'sensors';
export function ZoneWindow({zone:initial,query,sensor,onClose,onPeriod}:{zone:Zone;query:string;sensor?:string;onClose:()=>void;onPeriod?:(start?:string,end?:string)=>void}){
 const [stack,setStack]=useState<Zone[]>([initial]);
 useEffect(()=>setStack([initial]),[initial]);
 const zone=stack[stack.length-1];
 const latest=iso(new Date());
 const choices=useMemo(()=>periods(latest),[latest]);
 const [period,setPeriod]=useState<Period>(choices[4]);
 const [tab,setTab]=useState<Tab>('overview');
 const [picked,setPicked]=useState<string|null>(null);
 const q=useQuery({queryKey:['zone',zone.kind,zone.iso,zone.name,query,sensor,period.start,period.end],
  queryFn:()=>{const f=Object.fromEntries(new URLSearchParams(query));delete (f as any).bbox;
   const body={...f,...zone,start_date:period.start,end_date:period.end,vegetation_only:f.vegetation_only!=='false',sensor:sensor||undefined};
   return fetch('/api/map/zone',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>{if(!r.ok)throw new Error('API '+r.status);return r.json();});}});
 const d=q.data;
 useEffect(()=>setPicked(null),[zone,period]);
 // La carte affiche les points de la zone sur la même durée que la fenêtre.
 useEffect(()=>{onPeriod?.(period.start,period.end);},[period.start,period.end]);

 // Déplacement par l'en-tête (souris, tactile) et Alt + flèches au clavier.
 // La fenêtre reste sous l'en-tête (64 px) et entièrement dans l'écran ; centrée sur la zone de contenu à l'ouverture.
 const TOP=64,EDGE=12;
 const compact=()=>matchMedia('(max-width: 640px)').matches;
 const [pos,setPos]=useState(()=>{const w=Math.min(innerWidth-2*EDGE,Math.max(660,Math.min(780,innerWidth*.4))),h=Math.min(Math.max(500,Math.min(640,innerHeight*.58)),innerHeight-TOP-EDGE);
  // Ancrée à gauche, sous les commandes de la carte : la zone survolée reste visible à droite.
  const side=innerWidth>w+380;
  return side?{x:24,y:Math.max(TOP,Math.min(196,innerHeight-h-EDGE))}:{x:Math.max(EDGE,Math.round((innerWidth-w)/2)),y:Math.max(TOP,Math.round(TOP+(innerHeight-TOP-h)/2))};});
 const drag=useRef<{dx:number;dy:number}|null>(null),box=useRef<HTMLElement>(null);
 const [min,setMin]=useState(false);
 // Toute modification de taille, de position ou de réduction prévient la carte, qui recadre la zone.
 const layout=useRef(0);
 const announce=()=>{clearTimeout(layout.current);layout.current=window.setTimeout(()=>dispatchEvent(new Event('fw:cwin-layout')),260);};
 useEffect(()=>{const el=box.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(announce);ro.observe(el);return()=>{ro.disconnect();clearTimeout(layout.current);};},[]);
 useEffect(announce,[min]);
 useEffect(()=>{box.current?.focus();dispatchEvent(new Event('fw:close-popovers'));},[]);
 const clamp=(x:number,y:number)=>{const w=box.current?.offsetWidth??600,h=box.current?.offsetHeight??400;
  return {x:Math.min(Math.max(EDGE,x),Math.max(EDGE,innerWidth-w-EDGE)),y:Math.min(Math.max(TOP,y),Math.max(TOP,innerHeight-Math.min(h,160)))};};
 useEffect(()=>{const fit=()=>setPos(p=>clamp(p.x,p.y));addEventListener('resize',fit);return()=>removeEventListener('resize',fit);},[]);
 const onDown=(e:RPointerEvent<HTMLElement>)=>{if(compact()||(e.target as HTMLElement).closest('button'))return;drag.current={dx:e.clientX-pos.x,dy:e.clientY-pos.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);};
 const onMove=(e:RPointerEvent<HTMLElement>)=>{if(drag.current)setPos(clamp(e.clientX-drag.current.dx,e.clientY-drag.current.dy));};
 const onUp=()=>{if(drag.current)announce();drag.current=null;};

 const series:any[]=d?.series?.items||[];
 const gran:string=d?.series?.granularity||'month';
 const label=(p:string)=>gran==='year'?p.slice(0,4):gran==='month'?`${MONTHS[+p.slice(5,7)-1]} ${p.slice(0,4)}`:new Date(p+'T00:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'});
 // Clic sur une année ou un mois : on « descend » dans cette période.
 const drill=(p:string)=>{setPicked(p);
  if(gran==='year')setPeriod({key:'y'+p.slice(0,4),label:p.slice(0,4),start:`${p.slice(0,4)}-01-01`,end:`${p.slice(0,4)}-12-31`});
  else if(gran==='month'){const [y,m]=p.split('-').map(Number);setPeriod({key:'m'+p.slice(0,7),label:`${MONTHS[m-1]} ${y}`,start:p,end:iso(new Date(Date.UTC(y,m,0)))});}
 };
 const max=Math.max(1,...series.map(r=>r.active_cells));
 const kindLabel={country:'Pays',region:'Région',province:'Province',continent:'Continent'}[zone.kind];

 return createPortal(<section ref={box} tabIndex={-1} className={`cwin${min?' is-min':''}`} role="dialog" aria-label={`${kindLabel} : ${zone.name}`}
   style={{left:pos.x,top:pos.y}} onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
  <header className="cwin__head" onDoubleClick={e=>{if(!(e.target as HTMLElement).closest('button'))setMin(v=>!v)}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
   onKeyDown={e=>{const s=e.shiftKey?60:20,v:any={ArrowLeft:[-s,0],ArrowRight:[s,0],ArrowUp:[0,-s],ArrowDown:[0,s]}[e.key];if(v&&e.altKey){e.preventDefault();setPos(p=>clamp(p.x+v[0],p.y+v[1]));}}}>
   <span className="cwin__grip" aria-hidden="true"/>
   {stack.length>1&&<button className="cwin__back" onClick={()=>setStack(s=>s.slice(0,-1))} aria-label={`Revenir à ${stack[stack.length-2].name}`}><Icon name="arrowRight" size={16} style={{transform:'rotate(180deg)'}}/></button>}
   <div><span className="cwin__kind">{kindLabel}{zone.kind==='region'?' (carreau cliqué)':''}</span><h3>{zone.name}</h3>
    <p>{d?`${d.has_archive?'Archives 2000–2025 + temps réel':'Temps réel seulement (5 jours)'} · ${period.label}`:'Chargement…'}</p></div>
   <button className="cwin__close" onClick={()=>setMin(v=>!v)} aria-label={min?'Agrandir la fenêtre':'Réduire la fenêtre'} aria-expanded={!min} title={min?'Agrandir (double-clic sur l’en-tête)':'Réduire (double-clic sur l’en-tête)'}><Icon name={min?'expand':'shrink'} size={16}/></button>
   <button className="cwin__close" onClick={onClose} aria-label="Fermer la fenêtre"><Icon name="x" size={18}/></button>
  </header>

  <div className="cwin__periods" role="group" aria-label="Durée analysée">
   {choices.map(c=><button key={c.key} aria-pressed={period.key===c.key} onClick={()=>setPeriod(c)}>{c.label}</button>)}
   {!choices.some(c=>c.key===period.key)&&<button aria-pressed="true">{period.label}</button>}
  </div>

  <div className="cwin__kpis">
   <div><span>Détections</span><b>{q.isPending?'…':n(d?.detections)}</b></div>
   <div><span>Cellules actives</span><b>{q.isPending?'…':n(d?.active_cells)}</b></div>
   <div className="is-hot"><span>Pic de chaleur</span><b>{q.isPending?'…':n(d?.max_frp,1)}<small> MW</small></b></div>
   <div><span>Jours actifs</span><b>{q.isPending?'…':n(d?.active_days)}</b></div>
  </div>
  {d?.busiest_day&&<p className="cwin__peak">Jour le plus actif : <b>{day(d.busiest_day.day)}</b> · {n(d.busiest_day.detections)} détections{d.peak_frp?<> · pic de <b>{n(d.peak_frp.frp_mw,1)} MW</b> le {day(d.peak_frp.acquired_at)}</>:null}</p>}

  <div className="cwin__tabs" role="tablist" aria-label="Vue des données">
   {([['overview','Graphe et tableau'],['calendar','Calendrier'],['provinces',`Provinces${d?.provinces?.length?` (${d.provinces.length})`:''}`],['sensors','Satellites']] as [Tab,string][]).map(([k,l])=>
    <button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k)}>{l}</button>)}
  </div>

  <div className="cwin__body" role="tabpanel">
   {q.isError?<p className="cwin__note" role="alert">Données de la zone indisponibles. Réessayez dans un instant.</p>:q.isPending?<p className="cwin__note">Calcul sur les limites réelles de la zone…</p>:<>
   {tab==='overview'&&(series.length?<div className="cwin__split">
    <figure className="zchart" aria-label={`Cellules actives par ${gran==='year'?'année':gran==='month'?'mois':'jour'}`}>
     <div className="zchart__bars" style={{gridTemplateColumns:`repeat(${series.length}, minmax(4px, 1fr))`}}>
      {series.map(r=><button key={r.period} className={`zchart__bar${picked===r.period?' is-picked':''}`} style={{['--h' as any]:`${Math.max(2,100*r.active_cells/max)}%`}}
        title={`${label(r.period)} : ${n(r.active_cells)} cellules · ${n(r.detections)} détections · pic ${n(r.max_frp,1)} MW`}
        aria-label={`${label(r.period)}, ${n(r.active_cells)} cellules actives`} onClick={()=>drill(r.period)}><i/></button>)}
     </div>
     <figcaption>{label(series[0].period)} → {label(series[series.length-1].period)} · cellules actives · {gran!=='day'?'cliquez une barre pour zoomer sur cette période':'cliquez une barre pour la repérer dans le tableau'}</figcaption>
    </figure>
    <div className="table-wrap zt"><table>
     <thead><tr><th scope="col">{gran==='year'?'Année':gran==='month'?'Mois':'Jour'}</th><th scope="col">Cellules</th><th scope="col">Détections</th><th scope="col">Pic MW</th></tr></thead>
     <tbody>{series.map(r=><tr key={r.period} aria-selected={picked===r.period} className={picked===r.period?'is-picked':''} tabIndex={0}
       onClick={()=>drill(r.period)} onKeyDown={e=>{if(e.key==='Enter')drill(r.period);}}>
      <th scope="row">{label(r.period)}</th><td>{n(r.active_cells)}</td><td>{n(r.detections)}</td><td>{n(r.max_frp,1)}</td></tr>)}</tbody>
    </table></div>
   </div>:<p className="cwin__note">Aucune détection sur cette période. Essayez une durée plus longue.</p>)}

   {tab==='calendar'&&<>
    <FireCalendar items={d.calendar} family="MODIS + VIIRS" metric="active_cells"
     onSelect={p=>{if(!p)return;const [y,m]=p.split('-').map(Number);setPeriod({key:'m'+p,label:`${MONTHS[m-1]} ${y}`,start:`${p}-01`,end:iso(new Date(Date.UTC(y,m,0)))});setTab('overview');}}/>
    <p className="cwin__note">Le calendrier couvre toute la période disponible. Cliquez un mois pour l’analyser en détail.{!d.has_archive?' Pour cette zone, seuls les jours temps réel existent : les autres mois sont des trous de données, pas des mois sans feu.':''}</p>
   </>}

   {tab==='provinces'&&(d.provinces?.length?<div className="cwin__split">
    <div className="pbars">{d.provinces.map((p:any)=><button key={p.name} className="pbar" onClick={()=>setStack(s=>[...s,{kind:'province',iso:p.iso,name:p.name}])}
      aria-label={`Ouvrir la province ${p.name} : ${n(p.active_cells)} cellules actives`}>
      <span className="pbar__name">{p.name}</span><span className="pbar__track"><i style={{width:`${100*p.active_cells/Math.max(1,d.provinces[0].active_cells)}%`}}/></span><b>{n(p.active_cells)}</b></button>)}</div>
    <div className="table-wrap zt"><table>
     <thead><tr><th scope="col">Province</th><th scope="col">Cellules</th><th scope="col">Détections</th><th scope="col">Jours</th><th scope="col">Pic MW</th></tr></thead>
     <tbody>{d.provinces.map((p:any)=><tr key={p.name} tabIndex={0} onClick={()=>setStack(s=>[...s,{kind:'province',iso:p.iso,name:p.name}])} onKeyDown={e=>{if(e.key==='Enter')setStack(s=>[...s,{kind:'province',iso:p.iso,name:p.name}]);}}>
      <th scope="row">{p.name}</th><td>{n(p.active_cells)}</td><td>{n(p.detections)}</td><td>{n(p.active_days)}</td><td>{n(p.max_frp,1)}</td></tr>)}</tbody>
    </table></div>
   </div>:<p className="cwin__note">{zone.kind==='province'?'Vous êtes déjà au niveau de la province.':zone.kind==='continent'?'Cliquez un pays du continent sur la carte pour son détail.':'Aucune limite de province disponible pour cette zone (seul le Gabon est chargé).'}</p>)}

   {tab==='sensors'&&<div className="table-wrap zt"><table>
    <thead><tr><th scope="col">Satellite</th><th scope="col">Famille</th><th scope="col">Détections</th><th scope="col">Cellules</th><th scope="col">Puissance moy. MW</th><th scope="col">Pic MW</th></tr></thead>
    <tbody>{(d.by_satellite||[]).map((s:any)=>{const m=sensorOf(s.satellite_code);return <tr key={s.satellite_code}><th scope="row">{m&&<SatGlyph shape={m.shape} color={m.color}/>} {m?.label??s.satellite_code}</th><td>{s.sensor_family}</td><td>{n(s.detections)}</td><td>{n(s.active_cells)}</td><td>{n(s.mean_frp,1)}</td><td>{n(s.max_frp,1)}</td></tr>;})}</tbody>
   </table></div>}
   </>}
  </div>
  <footer className="cwin__foot">Glissez l’en-tête pour déplacer · coin inférieur droit pour agrandir · Échap pour fermer · Provinces : geoBoundaries (CC BY-SA 3.0)</footer>
  {!min&&<span className="cwin__resize" aria-hidden="true"/>}
 </section>,document.body);
}
