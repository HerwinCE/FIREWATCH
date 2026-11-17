import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from '../components/src/components/Icon';
import {useSettings} from '../components/src/state/settings';
import {sensorOf,productLabel} from './harmonized';

const STORE_KEY='fw-quick-panel-open';
const readOpen=()=>{try{return localStorage.getItem(STORE_KEY)==='1'}catch{return false}};
const saveOpen=(v:boolean)=>{try{localStorage.setItem(STORE_KEY,v?'1':'0')}catch{/* stockage indisponible */}};
const fr=(v:unknown)=>typeof v==='number'?v.toLocaleString('fr-FR'):'—';
const utc=(v?:string)=>v?new Date(v).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';

type Props={
 stats:any; ratio?:number|null; zone:string; caption:string; query:string;
 onLast7:()=>void; onResetFilters:()=>void; onAllPeriod:()=>void;
};

/** Panneau « Repères » : chiffres clés et raccourcis, non modal (la carte et les filtres restent utilisables). */
export function QuickPanel({stats,ratio,zone,caption,query,onLast7,onResetFilters,onAllPeriod}:Props){
 const [open,setOpenState]=useState(readOpen);
 const panel=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const settings=useSettings();
 const setOpen=(v:boolean)=>{setOpenState(v);saveOpen(v);if(!v)trigger.current?.focus();};
 useEffect(()=>{if(open)panel.current?.focus();},[open]);
 const go=(hash:string)=>{location.hash=hash;};
 const maskEmpty=!stats?.static_mask_cells;
 const shortcuts:{icon:string;label:string;run:()=>void;href?:string}[]=[
  {icon:'gabon',label:'Vue Gabon',run:()=>go('#gabon')},
  {icon:'globe',label:'Carte opérationnelle',run:()=>go('#carte')},
  {icon:'compare',label:'Comparer MODIS et VIIRS',run:()=>go('#comparaison')},
  {icon:'zones',label:'Zones de concentration',run:()=>go('#zones')},
  {icon:'clock',label:'7 derniers jours',run:onLast7},
  {icon:'history',label:'Toute la période',run:onAllPeriod},
  {icon:'reset',label:'Réinitialiser les filtres',run:onResetFilters},
  {icon:settings.theme==='light'?'moon':'sun',label:settings.theme==='light'?'Passer en mode nuit':'Passer en mode jour',run:()=>settings.update({theme:settings.theme==='light'?'dark':'light'})},
  {icon:'book',label:'Méthode et limites',run:()=>go('#methodologie')},
 ];
 const tooMany=(stats?.total_detections??0)>200000;
 // Portail vers <body> : les conteneurs à requêtes de conteneur de l'app piègent position:fixed.
 return createPortal(<div className={`qp-root${open?' is-open':''}`}>
  <button ref={trigger} className={`qp-trigger${open?' is-open':''}`} aria-expanded={open} aria-controls="quick-panel"
   onClick={()=>setOpen(!open)} title={open?'Fermer les repères':'Ouvrir les repères'}>
   <Icon name={open?'panelExpand':'panelCollapse'} size={20}/><span>Repères</span>
  </button>
  <aside id="quick-panel" ref={panel} tabIndex={-1} className={`qp${open?' is-open':''}`} aria-label="Repères : chiffres clés et raccourcis"
   inert={!open} aria-hidden={!open} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
   <header className="qp__head">
    <h2>Repères</h2>
    <button className="qp__close" onClick={()=>setOpen(false)} aria-label="Fermer les repères"><Icon name="x" size={18}/></button>
   </header>

   <section className="qp__section" aria-labelledby="qp-situation">
    <h3 id="qp-situation">Situation · {zone}</h3>
    <p className="qp__scope">{caption}</p>
    <dl className="qp__figures">
     <div><dt>Détections</dt><dd>{fr(stats?.total_detections)}</dd></div>
     <div><dt>Cellules actives</dt><dd>{fr(stats?.active_cells)}</dd></div>
     <div><dt>MODIS</dt><dd>{fr(stats?.modis_cells)} <small>cellules</small></dd></div>
     <div><dt>VIIRS</dt><dd>{fr(stats?.viirs_cells)} <small>cellules</small></dd></div>
    </dl>
    <dl className="qp__list">
     <dt>Ratio VIIRS / MODIS</dt><dd>{ratio??'—'}</dd>
     <dt>Rapprochements inter-capteurs</dt><dd>{fr(stats?.cross_sensor_groups)}</dd>
     <dt>Dernière observation</dt><dd>{utc(stats?.last_observation)}</dd>
    </dl>
   </section>

   <section className="qp__section" aria-labelledby="qp-fresh">
    <h3 id="qp-fresh">Fraîcheur des données</h3>
    <dl className="qp__list">
     {(stats?.freshness||[]).map((f:any)=><div key={f.source} className="qp__row"><dt>{productLabel(f.product)}</dt><dd>{utc(f.last_success)}</dd></div>)}
     <div className="qp__row"><dt>Harmonisation</dt><dd>{stats?.harmonization?`v${stats.harmonization.version} · ${utc(stats.harmonization.finished_at)}`:'—'}</dd></div>
    </dl>
    {maskEmpty&&<p className="qp__warn"><Icon name="alert" size={16}/><span>Masque des torchères vide : archives 2000–2025 non importées, sites industriels comptés comme feux.</span></p>}
   </section>

   <section className="qp__section" aria-labelledby="qp-shortcuts">
    <h3 id="qp-shortcuts">Raccourcis</h3>
    <ul className="qp__actions">
     {shortcuts.map(s=><li key={s.label}><button onClick={s.run}><Icon name={s.icon} size={18}/><span>{s.label}</span></button></li>)}
     <li>{tooMany||!stats?.total_detections
      ?<button disabled title="Export limité à 200 000 lignes : réduisez la zone ou la période"><Icon name="download" size={18}/><span>Exporter en CSV</span></button>
      :<a href={'/api/export/csv'+(query?'?'+query:'')} download><Icon name="download" size={18}/><span>Exporter en CSV · {fr(stats?.total_detections)} lignes</span></a>}</li>
    </ul>
   </section>

   <p className="qp__foot">Détection thermique ≠ incendie confirmé · légende des capteurs : {['TERRA','NOAA20','NOAA21','SNPP'].map(c=>{const s=sensorOf(c)!;return <span key={c} className="qp__sensor"><i style={{background:s.color}} data-shape={s.shape}/>{c==='TERRA'?'MODIS':s.label.replace('VIIRS ','').replace(' (archive)','')}</span>})}</p>
  </aside>
 </div>,document.body);
}
