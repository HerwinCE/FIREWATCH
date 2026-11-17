import {useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as RKeyboardEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {FireMap} from './MapView';
import {get} from './api';
import {Icon} from '../components/src/components/Icon';
import {TrendChart, SatelliteChart} from './charts';
import {FireCalendar} from './history';
import {ExportButton, sensorOf, productLabel} from './harmonized';
import {TimelineDock} from './TimelineDock';
import {AlertCenter,AlertBanner,useAlerts,levelOf,placeOf,type Alert} from './alerts';
import {useSettings} from '../components/src/state/settings';
import {SensorToggle,HarmonizeButton} from './controls';
import {ctl} from './voice/control';

type TimelineRow={day:string;sensor:string;detections:number;active_cells:number};
type Tool='layers'|'alerts'|'stats'|'harmo'|'calendar'|'zones'|'export'|'method';
const iso=(d:Date)=>d.toISOString().slice(0,10);
const shift=(day:string,amount:number)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+amount);return iso(d)};
const fr=(v:unknown,d=0)=>typeof v==='number'?v.toLocaleString('fr-FR',{maximumFractionDigits:d}):v!=null&&v!==''&&!isNaN(Number(v))?Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d}):'—';
const utc=(v?:string)=>v?new Date(v).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';

/** Outils de la carte : chaque fonction principale a son icône et son espace dédié. */
const TOOLS:{id:Tool;label:string;kind:string;icon:string;ember?:boolean}[]=[
 {id:'layers',label:'Couches et période',kind:'Affichage',icon:'layers'},
 {id:'alerts',label:'Alertes thermiques',kind:'Surveillance',icon:'siren',ember:true},
 {id:'stats',label:'Statistiques',kind:'Analyse',icon:'chart',ember:true},
 {id:'harmo',label:'Harmonisation MODIS · VIIRS',kind:'Méthode',icon:'merge'},
 {id:'calendar',label:'Calendrier de feu',kind:'Historique',icon:'calendar',ember:true},
 {id:'zones',label:'Zones les plus actives',kind:'Analyse',icon:'radar',ember:true},
 {id:'export',label:'Exporter les données',kind:'Données',icon:'download'},
 {id:'method',label:'Sources et limites',kind:'Référence',icon:'book'},
];

export function OperationsMapScreen({query,sensor,setSensor,start,end,setRange,region,onDetection,filters}:{filters?:ReactNode;query:string;sensor:string;setSensor:(value:string)=>void;start:string;end:string;setRange:(start:string,end:string)=>void;region:string;onDetection?:(id:string)=>void}){
 const [tool,setTool]=useState<Tool|null>('layers'),[timelineOpen,setTimelineOpen]=useState(false);
 const [focus,setFocus]=useState<{center:[number,number];zoom:number;k:number}|undefined>();
 const timeline=useQuery<{items:TimelineRow[]}>({queryKey:['timeline',query,''],queryFn:()=>get('/statistics/timeline',query)});
 const days=useMemo(()=>[...new Set((timeline.data?.items||[]).map(r=>r.day))].sort(),[timeline.data]);
 const latest=days.at(-1)||iso(new Date());
 const period=(count:number)=>setRange(shift(latest,-(count-1)),latest);
 const values=days.map(day=>(timeline.data?.items||[]).filter(row=>row.day===day).reduce((sum,row)=>sum+Number(row.detections||0),0));
 const max=Math.max(1,...values);
 const selectSensor=(kind:'MODIS'|'VIIRS')=>setSensor(sensor===kind?'':kind);
 const toggle=(t:Tool)=>setTool(v=>v===t?null:t);
 // Rail : icônes seules par défaut, noms des outils sur demande (choix mémorisé sur cet appareil).
 const [wide,setWide]=useState(()=>{try{return localStorage.getItem('fw.rail.wide')==='1'}catch{return false}});
 const toggleWide=()=>setWide(v=>{try{localStorage.setItem('fw.rail.wide',v?'0':'1')}catch{/* rien */}return !v;});
 // Dock : un seul repère lumineux glisse jusqu'à l'outil ouvert (au lieu de s'allumer sur place).
 const railRef=useRef<HTMLElement>(null);
 const [glow,setGlow]=useState<{x:number;y:number;w:number;h:number;ember:boolean}|null>(null);
 useLayoutEffect(()=>{const nav=railRef.current;if(!nav)return;
  const place=()=>{const b=tool?nav.querySelector<HTMLElement>(`button[data-tool="${tool}"]`):null;
   setGlow(g=>b?{x:b.offsetLeft,y:b.offsetTop,w:b.offsetWidth,h:b.offsetHeight,ember:b.dataset.tone==='ember'}:g&&{...g,w:0});};
  place();const ro=new ResizeObserver(place);ro.observe(nav);return()=>ro.disconnect();},[tool,wide]);
 // Clavier : flèches haut/bas (gauche/droite sur mobile), Début et Fin parcourent les outils.
 const railKeys=(e:RKeyboardEvent<HTMLElement>)=>{const keys=['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;
  const list=[...(railRef.current?.querySelectorAll<HTMLButtonElement>('button')??[])];const i=list.indexOf(document.activeElement as HTMLButtonElement);if(i<0)return;e.preventDefault();
  const n=e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowDown'||e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[n].focus();};
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.cwin,.detail-overlay'))setTool(null)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[]);
 const current=TOOLS.find(t=>t.id===tool);
 // --- Alertes : détection automatique, zoom intelligent sur toute nouvelle alerte élevée ou critique ---
 const settings=useSettings();
 const fx=settings.alertEffects!==false&&!settings.reduceMotion,autoZoom=settings.alertAutoZoom!==false;
 const scope=region==='gabon'?'gabon':region==='africa'?'africa':'world';
 const alerts=useAlerts(scope,sensor||undefined);const alertData=alerts.data;
 const [names,setNames]=useState<Record<string,string>>({});
 const [alertFocus,setAlertFocus]=useState<{alert:Alert;k:number}|undefined>();
 const [banner,setBanner]=useState<Alert|null>(null),[calmed,setCalmed]=useState(false);
 const locate=(a:Alert)=>{setAlertFocus({alert:a,k:Date.now()});setBanner(a.rank>=3?a:null);};
 useEffect(()=>{const top=alertData?.alerts?.[0];if(!top||top.rank<3)return;
  let seen:string[]=[];try{seen=JSON.parse(sessionStorage.getItem('fw.alerts.seen')||'[]')}catch{/* rien */}
  if(seen.includes(top.id))return;
  // Déclenché après un court délai (la carte finit de charger) ; l'alerte n'est marquée « vue » qu'une fois traitée.
  const t=setTimeout(()=>{
   try{sessionStorage.setItem('fw.alerts.seen',JSON.stringify([...seen,top.id].slice(-50)))}catch{/* rien */}
   setBanner(top);setCalmed(false);
   if(autoZoom)setAlertFocus({alert:top,k:Date.now()});
  },1400);
  return()=>clearTimeout(t);
 },[alertData?.alerts?.[0]?.id]);
 useEffect(()=>{if(!alerts.enabled){setBanner(null);setAlertFocus(undefined);}},[alerts.enabled]);
 const critical=(alertData?.counts?.critique??0)>0;
 const [playSignal,setPlaySignal]=useState<{k:number;days?:number}|undefined>();
 // Commandes vocales de l'écran carte (liste fermée, résultats constatés).
 useEffect(()=>{ctl.ops={
  openPanel:p=>{if(p==='timeline'){setTimelineOpen(true);return {ok:true,message:'Chronologie ouverte.'};}
   const tl=TOOLS.find(x=>x.id===p);if(!tl)return {ok:false,message:`Panneau « ${p} » inconnu.`};setTool(tl.id);return {ok:true,message:`Panneau « ${tl.label} » ouvert.`};},
  showAlert:(level,rank=1)=>{if(!alerts.enabled)return {ok:false,message:'Les alertes sont désactivées dans les paramètres.'};const list=(alertData?.alerts??[]).filter(a=>!level||a.level===level);const a=list[Math.max(0,rank-1)];
   if(!a)return {ok:false,message:level?`Aucune alerte de niveau ${levelOf(level as any).label.toLowerCase()} en ce moment.`:'Aucune alerte en ce moment.'};
   locate(a);setTool('alerts');return {ok:true,message:`Alerte ${a.label.toLowerCase()} localisée : ${placeOf(a,names)}, ${a.cells} cellules actives, pic ${a.max_frp} MW.`};},
  playTimeline:days=>{setTimelineOpen(true);setPlaySignal({k:Date.now(),days});return {ok:true,message:`Chronologie en lecture${days?`, fenêtre de ${days} jour${days>1?'s':''}`:''}.`};},
  exportCsv:async()=>{try{const s=await get('/statistics/summary',query);const n=Number(s?.total_detections??0);
    if(!n)return {ok:false,message:'Aucune détection à exporter sur la sélection.'};
    if(n>200000)return {ok:false,message:`${n.toLocaleString('fr-FR')} détections : l’export est limité à 200 000 lignes. Réduisez la période ou les capteurs.`};
    const a=document.createElement('a');a.href='/api/export/csv'+(query?'?'+query:'');a.download='';document.body.appendChild(a);a.click();a.remove();
    return {ok:true,message:`Export CSV lancé : ${n.toLocaleString('fr-FR')} détections.`};}catch{return {ok:false,message:'Export impossible : serveur injoignable.'};}},
  alertSummary:()=>alertData?`${alertData.counts.critique} critiques, ${alertData.counts.eleve} élevées, ${alertData.counts.modere} modérées, ${alertData.counts.faible} faibles`:undefined,
 };});
 useEffect(()=>()=>{ctl.ops={};},[]);
 const view=region==='gabon'?'Gabon':region==='africa'?'Afrique':'Monde';
 return <section className="operations-map" aria-label="Carte opérationnelle des feux actifs">
  <div className="operations-map__canvas"><FireMap query={query} gabon={region==='gabon'} sensor={sensor} onDetection={onDetection} focus={focus} exportTools alerts={alertData} alertEffects={fx} alertFocus={alertFocus} onAlertNames={setNames}/></div>
  <header className="ops-header">
   <button type="button" className="ops-menu" aria-controls="fw-sidebar" aria-label="Ouvrir le menu" title="Menu" onClick={()=>dispatchEvent(new Event('fw:toggle-menu'))}><Icon name="menu" size={22}/></button>
   <a href="#dashboard" className="ops-brand" aria-label="Accueil FireWatch Africa"><Icon name="flame" size={22} style={{color:'#FFA45C'}}/><span><b>FIREWATCH <span>AFRICA</span></b><small>Mode opérationnel · {view}</small></span></a>
   <span className="ops-live"><i/> NASA FIRMS · données réelles</span>
   {alertData&&alertData.total>0&&<button type="button" className={`ops-alert is-${alertData.top}${fx&&(alertData.top==='critique'||alertData.top==='eleve')?' has-fx':''}`} onClick={()=>setTool('alerts')} title="Ouvrir le centre d’alertes"><Icon name={levelOf(alertData.top).icon} size={15}/>{alertData.counts.critique?`${alertData.counts.critique} critique${alertData.counts.critique>1?'s':''}`:alertData.counts.eleve?`${alertData.counts.eleve} élevée${alertData.counts.eleve>1?'s':''}`:`${alertData.total} alerte${alertData.total>1?'s':''}`}</button>}
   <SensorToggle compact value={sensor} onChange={setSensor}/>
   <div className="ops-header__actions"><HarmonizeButton/><button onClick={()=>location.hash='#gabon'} title="Tableau de bord du Gabon"><Icon name="gabon" size={16}/>Gabon</button><a href="#dashboard" title="Retour au tableau de bord"><Icon name="dashboard" size={16}/>Tableau de bord</a></div>
  </header>
  <div className="ops-coordinates"><span>Vue : {view}</span><span>{start||end?`${start||'…'} → ${end||latest}`:'Toute la période chargée'}</span><span>{sensor||'MODIS + VIIRS'} · UTC</span></div>

  <nav ref={railRef} className={`mrail${wide?' is-wide':''}`} aria-label="Outils de la carte" onKeyDown={railKeys}>
   <span className={`mrail__glow${glow?.ember?' is-ember':''}`} aria-hidden="true" style={glow?{transform:`translate(${glow.x}px,${glow.y}px)`,width:glow.w,height:glow.h,opacity:glow.w?1:0}:{opacity:0}}/>
   {TOOLS.slice(0,1).map(t=><RailBtn key={t.id} t={t} on={tool===t.id} onClick={()=>toggle(t.id)}/>)}
   <button type="button" data-label="Chronologie" aria-label="Chronologie" aria-pressed={timelineOpen} onClick={()=>setTimelineOpen(v=>!v)}><Icon name="activity" size={20}/><span className="mrail__lbl">Chronologie</span></button>
   <span className="mrail__sep" aria-hidden="true"/>
   {TOOLS.slice(1,7).map(t=><RailBtn key={t.id} t={t} on={tool===t.id} onClick={()=>toggle(t.id)} badge={t.id==='alerts'&&alertData?.total?{n:alertData.total,level:alertData.top}:undefined}/>)}
   <span className="mrail__sep" aria-hidden="true"/>
   {TOOLS.slice(7).map(t=><RailBtn key={t.id} t={t} on={tool===t.id} onClick={()=>toggle(t.id)}/>)}
   <button type="button" className="mrail__wide" aria-pressed={wide} aria-label={wide?'Réduire le rail':'Afficher les noms des outils'} data-label={wide?'Réduire':'Afficher les noms'} onClick={toggleWide}><Icon name={wide?'panelCollapse':'panelExpand'} size={16}/><span className="mrail__lbl">Réduire</span></button>
  </nav>

  {current&&<aside className="mtool" aria-label={current.label}>
   <div className="mtool__head"><span className={`mtool__icon${current.ember?' is-ember':''}`}><Icon name={current.icon} size={18}/></span><div><span className="mtool__kind">{current.kind}</span><h2 className="mtool__title">{current.label}</h2></div><button className="mtool__close" onClick={()=>setTool(null)} aria-label="Fermer le panneau"><Icon name="x" size={16}/></button></div>
   <div className="mtool__body" key={tool}>
    {tool==='alerts'&&<AlertCenter enabled={alerts.enabled} onEnabled={v=>settings.update({alerts:v})} data={alertData} loading={alerts.isPending} names={names} effects={settings.alertEffects!==false} autoZoom={autoZoom}
      onEffects={v=>settings.update({alertEffects:v})} onAutoZoom={v=>settings.update({alertAutoZoom:v})} onLocate={locate}/>}
    {tool==='layers'&&<>
     <Group label="Période"><div className="ops-period"><button onClick={()=>period(1)} className={start===latest&&end===latest?'is-on':''}>Auj.</button><button onClick={()=>period(2)} className={start===shift(latest,-1)&&end===latest?'is-on':''}>24 h</button><button onClick={()=>period(7)} className={start===shift(latest,-6)&&end===latest?'is-on':''}>7 j</button><button onClick={()=>setRange('','')} className={!start&&!end?'is-on':''}>Tout</button><label title="Choisir une date de fin"><Icon name="calendar" size={14}/><input type="date" value={end} max={latest} onChange={e=>setRange(start||e.target.value,e.target.value)} aria-label="Date de fin"/></label></div><p>{start&&end?<><b>{start} → {end}</b> · </>:null}Dates et heures en UTC.</p></Group>
     <Group label="Capteurs affichés"><SensorToggle value={sensor} onChange={setSensor}/><p>Les deux allumés : comparaison MODIS / VIIRS. Éteignez-en un pour isoler l’autre.</p></Group>
     {filters&&<Group label="Filtres">{filters}</Group>}
     <Group label="Produit"><p><b>Couche harmonisée.</b> Confiance unifiée, grille commune de 0,01°, végétation présumée par défaut, meilleure version disponible (SP sinon NRT). Le fond de carte et les points se règlent dans « Affichage », en haut à gauche.</p></Group>
    </>}
    {tool==='stats'&&<StatsTool query={query} days={days} rows={timeline.data?.items||[]} loading={timeline.isPending}/>}
    {tool==='harmo'&&<HarmoTool query={query}/>}
    {tool==='calendar'&&<CalendarTool query={query} onMonth={setRange}/>}
    {tool==='zones'&&<ZonesTool query={query} onFly={(lon,lat)=>setFocus({center:[lon,lat],zoom:7,k:Date.now()})}/>}
    {tool==='export'&&<ExportTool query={query}/>}
    {tool==='method'&&<MethodTool/>}
   </div>
  </aside>}

  {banner&&<AlertBanner alert={banner} place={placeOf(banner,names)} effects={fx} onLocate={()=>setAlertFocus({alert:banner,k:Date.now()})} onDetails={()=>setTool('alerts')} onDismiss={()=>{setBanner(null);setCalmed(true);}}/>}
  {fx&&critical&&!calmed&&<div className="al-vignette" key={alertData?.alerts?.[0]?.id} aria-hidden="true"/>}
  <TimelineDock playSignal={playSignal} query={query} open={timelineOpen} onToggle={()=>setTimelineOpen(v=>!v)} start={start} end={end} setRange={setRange}/>
 </section>;
}

function RailBtn({t,on,onClick,badge}:{t:typeof TOOLS[number];on:boolean;onClick:()=>void;badge?:{n:number;level:string|null}}){return <button type="button" data-tool={t.id} data-label={t.label} data-tone={t.ember?'ember':undefined} aria-label={badge?`${t.label} (${badge.n})`:t.label} aria-pressed={on} onClick={onClick}><Icon name={t.icon} size={20}/><span className="mrail__lbl">{t.label}</span>{badge&&<span className={`mrail__badge is-${badge.level}`}>{badge.n>99?'99+':badge.n}</span>}</button>}
function Group({label,children}:{label:string;children:ReactNode}){return <section className="mtool__group"><h3 className="mtool__label">{label}</h3>{children}</section>}
function Layer({enabled,color,square,label,sub,onClick}:{enabled:boolean;color:string;square?:boolean;label:string;sub:string;onClick:()=>void}){return <button className={`ops-layer${enabled?'':' is-off'}`} onClick={onClick} aria-pressed={enabled}><i className={square?'square':''} style={{background:color,color}}/><span><b>{label}</b><small>{sub}</small></span><em>{enabled?<Icon name="eye" size={16}/>:null}</em></button>}
function Kpi({label,value,unit,foot,tone,icon}:{label:string;value:ReactNode;unit?:string;foot?:ReactNode;tone?:string;icon?:string}){return <div className={`nx-kpi${tone?' nx-kpi--'+tone:''}`}><span>{icon&&<Icon name={icon} size={13}/>}{label}</span><b>{value}{unit&&<small> {unit}</small>}</b>{foot&&<p>{foot}</p>}</div>}

function StatsTool({query,days,rows,loading}:{query:string;days:string[];rows:TimelineRow[];loading?:boolean}){
 const summary=useQuery<any>({queryKey:['summary',query,''],queryFn:()=>get('/statistics/summary',query)});
 const sats=useQuery<any>({queryKey:['satellites',query,''],queryFn:()=>get('/statistics/satellites',query)});
 const s=summary.data,items=sats.data?.items||[];
 const series=['MODIS','VIIRS'].map((f,i)=>({name:f,color:i?'#E69F00':'#CC79A7',values:days.map(d=>Number(rows.find(r=>r.day===d&&r.sensor===f)?.active_cells||0))}));
 return <>
  <div className="nx-kpis"><Kpi tone="hot" icon="flame" label="Détections" value={fr(s?.total_detections)}/><Kpi icon="crosshair" label="Cellules actives" value={fr(s?.active_cells)}/><Kpi tone="modis" label="MODIS" value={fr(s?.modis_cells)} unit="cell."/><Kpi tone="viirs" label="VIIRS" value={fr(s?.viirs_cells)} unit="cell."/></div>
  <Group label="Activité dans le temps">{loading?<p role="status">Chargement de la chronologie…</p>:<TrendChart x={days} series={series} height={190} caption="Cellules actives de 0,01° par famille de capteur (UTC)."/>}</Group>
  <Group label="Par satellite">{sats.isPending?<p role="status">Chargement…</p>:<SatelliteChart items={items.map((x:any)=>({label:x.satellite,value:Number(x.active_cells)}))} colorOf={i=>sensorOf(items[i]?.satellite_code)?.color||'#E69F00'} caption={sats.data?.ratio_viirs_modis_cells!=null?`Ratio VIIRS / MODIS en cellules actives : ${fr(sats.data.ratio_viirs_modis_cells,2)}.`:'Cellules actives par satellite.'}/>}</Group>
  <a className="mtool__link" href="#dashboard"><Icon name="dashboard" size={16}/>Tableau de bord complet<small>toutes les statistiques</small></a>
 </>;
}

function HarmoTool({query}:{query:string}){
 const status=useQuery<any>({queryKey:['harmo-status'],queryFn:()=>get('/harmonization/status')});
 const summary=useQuery<any>({queryKey:['summary',query,''],queryFn:()=>get('/statistics/summary',query)});
 const sats=useQuery<any>({queryKey:['satellites',query,''],queryFn:()=>get('/statistics/satellites',query)});
 const r=status.data,s=summary.data,ok=r?.status==='success'||r?.status==='completed';
 const launch=<HarmonizeButton variant="block"/>;
 return <>
  {launch}
  <Group label="Dernier passage du pipeline">{status.isPending?<p role="status">Chargement…</p>:!r||r.status==='never_run'?<p><span className="mtool__state is-warn"><Icon name="alert" size={12}/>Jamais exécuté</span> Les données affichées sont brutes tant que le pipeline n’a pas tourné.</p>:<>
   <p><span className={`mtool__state ${ok?'is-ok':'is-warn'}`}><Icon name={ok?'check':'alert'} size={12}/>{ok?'Terminé':r.status}</span> Version {r.version||s?.harmonization?.version||'—'} · {utc(r.finished_at||r.started_at)}</p>
   <table className="nx-table"><tbody>
    <tr><th>Lignes traitées</th><td className="num">{fr(r.rows_processed)}</td></tr>
    <tr><th>Végétation présumée</th><td className="num">{fr(r.rows_vegetation)}</td></tr>
    <tr><th>Versions NRT remplacées par SP</th><td className="num">{fr(r.rows_superseded)}</td></tr>
    <tr><th>Groupes inter-capteurs</th><td className="num">{fr(r.groups_created)}</td></tr>
    <tr><th>Lignes rejetées</th><td className="num">{fr(r.rows_rejected)}</td></tr>
   </tbody></table></>}</Group>
  <Group label="Sur la sélection en cours"><div className="nx-kpis"><Kpi icon="merge" label="Ratio VIIRS / MODIS" value={fr(sats.data?.ratio_viirs_modis_cells,2)} foot="en cellules actives"/><Kpi icon="link" label="Rapprochements" value={fr(s?.cross_sensor_groups)} foot="≤ 2 km et ≤ 3 h"/><Kpi tone="sand" icon="filter" label="Non végétal exclu" value={fr(s?.non_vegetation_excluded)} foot="torchères, industrie"/><Kpi tone="info" icon="layers" label="Masque statique" value={fr(s?.static_mask_cells)} unit="cell."/></div></Group>
  <Group label="Les cinq règles appliquées"><ol className="mtool__steps">
   <li><b>Confiance unifiée.</b> MODIS (0–100) et VIIRS (faible, nominale, haute) parlent la même échelle.</li>
   <li><b>Grille commune de 0,01°.</b> Environ 1 km : un VIIRS à 375 m et un MODIS à 1 km deviennent comparables.</li>
   <li><b>Végétation présumée.</b> Sources fixes (torchères, volcans, usines) écartées par l’attribut FIRMS et un masque statique.</li>
   <li><b>Meilleure version.</b> La donnée scientifique (SP) remplace la donnée temps réel (NRT) dès qu’elle existe.</li>
   <li><b>Rapprochement prudent.</b> Deux capteurs à moins de 2 km et 3 h forment un groupe possible, pas un « même feu ».</li>
  </ol></Group>
  <a className="mtool__link" href="#methodologie"><Icon name="book" size={16}/>Méthode détaillée<small>sources et limites</small></a>
 </>;
}

function CalendarTool({query,onMonth}:{query:string;onMonth:(start:string,end:string)=>void}){
 const [family,setFamily]=useState<'VIIRS'|'MODIS'>('VIIRS');
 const p=new URLSearchParams(query),hp=new URLSearchParams({sensor_family:family,metric:'active_cells',granularity:'month'});if(p.get('bbox'))hp.set('bbox',p.get('bbox')!);
 const cal=useQuery<any>({queryKey:['calendar',hp.toString()],queryFn:()=>get('/detections/timeline',hp.toString())});
 const pick=(m:string|null)=>{if(!m){onMonth('','');return;}const [y,mo]=m.split('-').map(Number);onMonth(`${m}-01`,`${m}-${String(new Date(Date.UTC(y,mo,0)).getUTCDate()).padStart(2,'0')}`);};
 return <>
  <div className="seg" role="group" aria-label="Famille de capteur"><button aria-pressed={family==='VIIRS'} onClick={()=>setFamily('VIIRS')}>VIIRS · 2012–2025</button><button aria-pressed={family==='MODIS'} onClick={()=>setFamily('MODIS')}>MODIS · 2001–2025</button></div>
  {cal.isPending?<p role="status">Chargement du calendrier…</p>:cal.isError?<p role="alert">Calendrier indisponible.</p>:<FireCalendar compact items={cal.data?.items||[]} onSelect={pick} family={family} metric="active_cells"/>}
  <p>Chaque case est un mois : plus elle est sombre, plus l’activité est forte. Cliquez un mois pour filtrer la carte sur cette période. Hachures : capteur absent ou trou de données.</p>
  <a className="mtool__link" href="#historique"><Icon name="history" size={16}/>Historique complet<small>médiane et anomalie</small></a>
 </>;
}

function ZonesTool({query,onFly}:{query:string;onFly:(lon:number,lat:number)=>void}){
 const hot=useQuery<any>({queryKey:['hotspots',query,'limit=10'],queryFn:()=>get('/analytics/hotspots',query+'&limit=10')});
 const items=hot.data?.items||[],top=Number(items[0]?.active_cells||1);
 return <>
  <p>Carreaux de 1° classés par nombre de cellules actives. Cliquez une ligne pour y centrer la carte.</p>
  {hot.isPending?<p role="status">Chargement…</p>:!items.length?<p>Aucune zone active sur cette sélection.</p>:
  <table className="nx-table"><thead><tr><th>#</th><th>Carreau</th><th className="num">Cellules</th><th className="num">Jours</th></tr></thead><tbody>
   {items.map((h:any,i:number)=><tr key={i} tabIndex={0} style={{cursor:'pointer'}} onClick={()=>onFly(Number(h.grid_lon)+.5,Number(h.grid_lat)+.5)} onKeyDown={e=>{if(e.key==='Enter')onFly(Number(h.grid_lon)+.5,Number(h.grid_lat)+.5)}}>
    <td>{String(i+1).padStart(2,'0')}</td><td>{h.grid_lat}° · {h.grid_lon}°<span className="bar" style={{width:`${100*Number(h.active_cells)/top}%`}}/></td><td className="num">{fr(h.active_cells)}</td><td className="num">{fr(h.active_days)}</td></tr>)}
  </tbody></table>}
  <a className="mtool__link" href="#zones"><Icon name="zones" size={16}/>Toutes les zones<small>tableau détaillé</small></a>
 </>;
}

function ExportTool({query}:{query:string}){
 const summary=useQuery<any>({queryKey:['summary',query,''],queryFn:()=>get('/statistics/summary',query)});
 return <>
  <p>Téléchargez les détections harmonisées de la sélection en cours (période, zone, capteurs et filtres) au format CSV, lisible dans un tableur.</p>
  <ExportButton query={query} total={summary.data?.total_detections} loading={summary.isPending||summary.isFetching}/>
  <Group label="Dernière collecte par produit"><table className="nx-table"><tbody>{(summary.data?.freshness||[]).map((f:any)=><tr key={f.source}><th>{productLabel(f.product)}</th><td className="num">{utc(f.last_success)}</td></tr>)}</tbody></table></Group>
 </>;
}

function MethodTool(){
 return <>
  <p><b>Une détection thermique n’est pas un incendie confirmé.</b> Un satellite repère un pixel anormalement chaud ; ce peut être un feu de végétation, un brûlis agricole ou une source industrielle.</p>
  <table className="nx-table"><thead><tr><th>Capteur</th><th>Pixel</th><th>Depuis</th></tr></thead><tbody>
   <tr><td><span className="sym-dot" style={{background:'#CC79A7'}}/> MODIS Terra / Aqua</td><td>≈ 1 km</td><td>2000</td></tr>
   <tr><td><span className="sym-dot" style={{background:'#E69F00'}}/> VIIRS NOAA-20 / 21</td><td>375 m</td><td>2018</td></tr>
   <tr><td><span className="sym-dot" style={{background:'#56B4E9'}}/> VIIRS Suomi-NPP</td><td>375 m</td><td>2012 (archive)</td></tr>
  </tbody></table>
  <div className="mtool__links">
   <a className="mtool__link" href="#methodologie"><Icon name="book" size={16}/>Sources et méthodologie</a>
   <a className="mtool__link" href="#comparaison"><Icon name="compare" size={16}/>Comparer MODIS et VIIRS</a>
   <a className="mtool__link" href="#evenements"><Icon name="events" size={16}/>Événements harmonisés</a>
  </div>
 </>;
}
