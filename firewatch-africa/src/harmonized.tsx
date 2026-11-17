import {useState,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Icon} from '../components/src/components/Icon';
import {get} from './api';

/** Capteurs : forme + couleur Okabe-Ito (design system « Braise » §2.6, EF-07). */
export const SENSORS = [
 {code:'TERRA',label:'MODIS Terra',family:'MODIS',shape:'square',glyph:'■',color:'#CC79A7'},
 {code:'AQUA',label:'MODIS Aqua',family:'MODIS',shape:'square',glyph:'■',color:'#CC79A7'},
 {code:'NOAA20',label:'VIIRS NOAA-20',family:'VIIRS',shape:'circle',glyph:'●',color:'#E69F00'},
 {code:'NOAA21',label:'VIIRS NOAA-21',family:'VIIRS',shape:'triangle',glyph:'▲',color:'#D55E00'},
 {code:'SNPP',label:'VIIRS Suomi-NPP (archive)',family:'VIIRS',shape:'diamond',glyph:'◆',color:'#56B4E9'},
] as const;
export const sensorOf=(code:string)=>SENSORS.find(s=>s.code===code);
/** Forme du capteur (carré, rond, triangle, losange) : la forme double toujours la couleur. */
export function SatGlyph({shape,color,size=11}:{shape:string;color:string;size?:number}){
 const h=size/2,e=size-1;
 return <svg className="sat-glyph" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
  {shape==='square'&&<rect x={1} y={1} width={size-2} height={size-2} rx={1.5} fill={color}/>}
  {shape==='circle'&&<circle cx={h} cy={h} r={h-1} fill={color}/>}
  {shape==='triangle'&&<path d={`M${h} 1L${e} ${e}H1Z`} fill={color}/>}
  {shape==='diamond'&&<path d={`M${h} .5L${size-.5} ${h}L${h} ${size-.5}L.5 ${h}Z`} fill={color}/>}
 </svg>;
}
/** Libellé lisible d'un produit FIRMS (fraîcheur des données). */
export const productLabel=(p:string)=>({MCD14DL:'MODIS (temps réel)',VIIRS_NOAA20_NRT:'NOAA-20 (temps réel)',VIIRS_NOAA21_NRT:'NOAA-21 (temps réel)',VIIRS_SNPP_NRT:'Suomi-NPP (temps réel)',
 MCD14ML:'Archives MODIS',VNP14IMGTDL:'Archives Suomi-NPP',VJ114IMGTDL:'Archives NOAA-20'} as Record<string,string>)[p]??p;
export const CONFIDENCE={low:'Faible',nominal:'Nominale',high:'Haute'} as const;
export type Confidence=keyof typeof CONFIDENCE;
const TYPE_BASIS:Record<string,string>={firms_type:'attribut FIRMS « type »',static_mask:'masque des sources statiques',presumed_outside_mask:'hors masque (présumé)'};
const DETECTION_TYPE:Record<number,string>={0:'Feu de végétation présumé',1:'Volcan actif',2:'Autre source terrestre statique (industrie, torchère)',3:'Offshore'};

export type HFilters={satellites:string[];confidence:Confidence[];vegetationOnly:boolean};
export const DEFAULT_FILTERS:HFilters={satellites:[],confidence:[],vegetationOnly:true};
export function filtersToParams(f:HFilters,params:URLSearchParams){
 if(f.satellites.length)params.set('satellite',f.satellites.join(','));
 if(f.confidence.length)params.set('confidence',f.confidence.join(','));
 if(!f.vegetationOnly)params.set('vegetation_only','false');
}
/** Phrase décrivant le filtre de source et les capteurs, à placer sous chaque chiffre (ENF-19). */
export function filterCaption(f:HFilters){
 const sats=f.satellites.length?f.satellites.map(c=>sensorOf(c)?.label).join(', '):'tous capteurs';
 const conf=f.confidence.length?` · confiance ${f.confidence.map(c=>CONFIDENCE[c].toLowerCase()).join('/')}`:'';
 return `${sats}${conf} · ${f.vegetationOnly?'végétation présumée':'toutes sources'}`;
}

export function ConfidenceBadge({level,raw,family}:{level?:string|null;raw?:string|null;family?:string}){
 if(!level)return <span className="conf">n.d.</span>;
 const label=CONFIDENCE[level as Confidence]??level;
 const origin=raw?`${family??''} : ${raw}${family==='MODIS'?' %':''}`:'';
 return <span className={`conf conf--${level}`} title={origin?`Valeur d’origine — ${origin}`:undefined}><span className="conf__bars" aria-hidden="true"><i/><i/><i/></span>{label}{origin&&<span className="muted"> ({origin})</span>}</span>;
}

/** Filtres combinables EF-09 + puces des filtres actifs supprimables. */
export function FilterBar({value,onChange}:{value:HFilters;onChange:(f:HFilters)=>void}){
 const toggle=<K extends 'satellites'|'confidence'>(key:K,item:HFilters[K][number])=>{
  const list=value[key] as string[];onChange({...value,[key]:list.includes(item)?list.filter(x=>x!==item):[...list,item]});
 };
 const active=[
  ...value.satellites.map(c=>({key:'s'+c,label:`Capteur : ${sensorOf(c)?.label}`,remove:()=>toggle('satellites',c)})),
  ...value.confidence.map(c=>({key:'c'+c,label:`Confiance ${CONFIDENCE[c].toLowerCase()}`,remove:()=>toggle('confidence',c)})),
  ...(!value.vegetationOnly?[{key:'veg',label:'Sources non végétales affichées',remove:()=>onChange({...value,vegetationOnly:true})}]:[]),
 ];
 const uniq=SENSORS.filter(s=>s.code!=='AQUA');
 return <div className="hfilters" role="group" aria-label="Filtres des détections harmonisées">
  <div className="hfilters__row"><span className="hfilters__label">Capteurs</span>{uniq.map(s=>{const codes=s.code==='TERRA'?['TERRA','AQUA']:[s.code];const on=codes.every(c=>value.satellites.includes(c));
   return <button key={s.code} className="chip" aria-pressed={on} onClick={()=>onChange({...value,satellites:on?value.satellites.filter(c=>!codes.includes(c)):[...new Set([...value.satellites,...codes])]})}><SatGlyph shape={s.shape} color={s.color}/>{s.code==='TERRA'?'MODIS (Terra + Aqua)':s.label}</button>;})}</div>
  <div className="hfilters__row"><span className="hfilters__label">Confiance</span>{(Object.keys(CONFIDENCE) as Confidence[]).map(c=><button key={c} className="chip" aria-pressed={value.confidence.includes(c)} onClick={()=>toggle('confidence',c)}><span className={`conf conf--${c}`}><span className="conf__bars" aria-hidden="true"><i/><i/><i/></span></span>{CONFIDENCE[c]}</button>)}
   <label className="hfilters__switch"><span className="switch"><input type="checkbox" role="switch" checked={!value.vegetationOnly} onChange={e=>onChange({...value,vegetationOnly:!e.target.checked})}/><span/></span>Afficher industrie, offshore, volcans</label></div>
  {active.length>0&&<div className="hfilters__row" aria-label="Filtres actifs"><span className="hfilters__label">Actifs</span>{active.map(a=><button key={a.key} className="chip chip--active" onClick={a.remove} aria-label={`Retirer le filtre ${a.label}`}>{a.label} <span aria-hidden="true">×</span></button>)}<button className="btn btn--sm" onClick={()=>onChange(DEFAULT_FILTERS)}>Réinitialiser les filtres</button></div>}
 </div>;
}

/** Zone des filtres et de l'export, repliée par défaut ; le bouton indique qu'elle se déplie et résume les filtres actifs. */
export function CollapsibleFilters({filters,total,children}:{filters:HFilters;total?:number;children:ReactNode}){
 const KEY='fw-filters-open';
 const [open,setOpen]=useState(()=>{try{return localStorage.getItem(KEY)==='1'}catch{return false}});
 const toggle=()=>{const v=!open;setOpen(v);try{localStorage.setItem(KEY,v?'1':'0')}catch{/* stockage indisponible */}};
 const active=filters.satellites.length+filters.confidence.length+(filters.vegetationOnly?0:1);
 return <section className={`fold${open?' is-open':''}`}>
  <button className="fold__toggle" aria-expanded={open} aria-controls="fold-filters" onClick={toggle}>
   <Icon name="filter" size={18}/>
   <span className="fold__title">Filtres et export</span>
   {active>0&&<span className="fold__count" aria-label={`${active} filtre${active>1?'s':''} actif${active>1?'s':''}`}>{active}</span>}
   <span className="fold__summary">{filterCaption(filters)}{total!=null?` · ${total.toLocaleString('fr-FR')} détections`:''}</span>
   <span className="fold__action">{open?'Replier':'Déplier'}<Icon name="chevronDown" size={16} className="fold__chevron"/></span>
  </button>
  <div id="fold-filters" className="fold__body" hidden={!open}>{children}</div>
 </section>;
}

export const EXPORT_MAX_ROWS=200000;
/** Export CSV EF-28 : mêmes filtres que les compteurs affichés ; nombre de lignes = compteur. */
export function ExportButton({query,total,loading}:{query:string;total?:number;loading?:boolean}){
 const tooMany=(total??0)>EXPORT_MAX_ROWS, empty=total===0;
 const fr=(v:number)=>v.toLocaleString('fr-FR');
 return <div className="export-row">
  {tooMany||empty||loading||total==null
   ?<button className="btn btn--sm" disabled aria-disabled="true"><Icon name="download" size={15}/>Exporter en CSV</button>
   :<a className="btn btn--sm btn--primary" href={'/api/export/csv'+(query?'?'+query:'')} download><Icon name="download" size={15}/>Exporter en CSV</a>}
  <span className="muted small" role="status">{loading||total==null?'Calcul du nombre de lignes…'
   :empty?'Aucune détection à exporter pour ces filtres.'
   :tooMany?`${fr(total)} détections : l’export est limité à ${fr(EXPORT_MAX_ROWS)} lignes. Réduisez la zone, la période ou les capteurs.`
   :`${fr(total)} lignes · détections harmonisées filtrées · UTF-8, séparateur virgule`}</span>
 </div>;
}

const utc=(v?:string)=>v?new Date(v).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';

/** Fiche d'observation EF-08. */
export function DetectionSheet({id,onClose}:{id:string;onClose:()=>void}){
 const q=useQuery({queryKey:['detection',id],queryFn:()=>get('/detections/'+id)});
 const [copied,setCopied]=useState(false);
 const d=q.data;
 const copy=async()=>{try{await navigator.clipboard.writeText(`${d.latitude}, ${d.longitude}`);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{/* presse-papiers indisponible */}};
 const s=d&&sensorOf(d.satellite_code);
 return <div className="detail-overlay" role="dialog" aria-modal="true" aria-label="Fiche d’observation" onKeyDown={e=>e.key==='Escape'&&onClose()}>
  <section className="card sheet">
   <div className="card__head"><h3 className="card__title">{s&&<SatGlyph shape={s.shape} color={s.color} size={13}/> }Détection thermique {s?.label??''}</h3><button className="btn btn--sm" onClick={onClose} aria-label="Fermer la fiche" autoFocus>Fermer</button></div>
   {q.isPending?<p className="card__body">Chargement…</p>:q.isError?<p className="card__body" role="alert">Observation indisponible.</p>:<>
    <dl className="kv">
     <dt>Coordonnées</dt><dd>{d.latitude.toFixed(5)}, {d.longitude.toFixed(5)} <button className="btn btn--sm" onClick={copy}>{copied?<><Icon name="check" size={14}/>Copiées</>:<><Icon name="table" size={14}/>Copier</>}</button></dd>
     <dt>Date et heure</dt><dd>{utc(d.acquisition_time)}</dd>
     <dt>Satellite · instrument</dt><dd className="sans">{s?.label} · {d.instrument}</dd>
     <dt>Résolution d’origine</dt><dd>{d.native_resolution_m} m</dd>
     <dt>Confiance unifiée</dt><dd className="sans"><ConfidenceBadge level={d.confidence_level} raw={d.confidence_raw} family={d.sensor}/></dd>
     <dt>FRP</dt><dd>{d.frp??'—'} MW</dd>
     <dt>Jour / nuit</dt><dd className="sans">{d.daynight==='D'?'Jour':d.daynight==='N'?'Nuit':'—'}</dd>
     <dt>Type de source</dt><dd className="sans">{d.detection_type!=null?DETECTION_TYPE[d.detection_type]:d.is_vegetation?'Végétation présumée':'Source non végétale'}</dd>
     <dt>Base du type</dt><dd className="sans">{TYPE_BASIS[d.type_basis]??d.type_basis}</dd>
     <dt>Niveau de qualité</dt><dd className="sans">{d.quality_level==='NRT'?'NRT (temps quasi réel)':'SP (qualité scientifique)'} · {d.source_product}</dd>
     <dt>Cellule 0,01°</dt><dd>{d.grid_cell_id}</dd>
     <dt>Harmonisation</dt><dd>v{d.harmonization_version} · exécution {d.harmonization_run_id}</dd>
    </dl>
    {d.group_id!=null&&<div className="notice notice--sci"><b>Rapprochement possible entre capteurs</b> (groupe {d.group_id}) — observations à ≤ 2 km et ≤ 3 h. Ce n’est pas la preuve d’un même incendie.<ul>{(d.group_members||[]).map((m:any)=><li key={m.id}>{sensorOf(m.satellite_code)?.glyph} {sensorOf(m.satellite_code)?.label} · {utc(m.acquired_at)}</li>)}</ul></div>}
    <details className="card__body"><summary>Données d’origine NASA FIRMS</summary><pre className="small">{JSON.stringify(d.original_data,null,1)}</pre></details>
    <p className="muted small card__body">Détection thermique ≠ incendie confirmé.</p>
   </>}
  </section>
 </div>;
}
