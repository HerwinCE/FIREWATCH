import {useState,useEffect,lazy,Suspense,type ReactNode,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import {AppShell,Sidebar,Topbar,BottomNav,NAV} from '../components/src/components/AppShell';
import {Icon} from '../components/src/components/Icon';
import {TrendChart,SatelliteChart,MedianCurve} from './lazyCharts';
import './fonts.css';
import {useSettings,applySettingsToDocument} from '../components/src/state/settings';
import '../components/src/styles/tokens.css';
import '../components/src/styles/firewatch.css';
import './style.css';
import './polish.css';
import './theme-braise.css';
import './theme-nuit.css';
import './theme-carte.css';
import './theme-chrono.css';
import './theme-echelle.css';
import './theme-alertes.css';
import './theme-graphite.css';
import './theme-finition.css';
import './theme-voice.css';
import './theme-globe.css';
import './theme-mobile.css';
import {get} from './api';
// Écran carte (Mapbox, ≈ 1,7 Mo) : chargé seulement quand on l'ouvre.
const OperationsMapScreen=lazy(()=>import('./OperationsMapScreen').then(m=>({default:m.OperationsMapScreen})));
import {useAlerts,levelOf} from './alerts';
import {SensorToggle,HarmonizeButton} from './controls';
import {VoiceAssistant} from './voice/VoiceAssistant';
import {ctl} from './voice/control';
import {QuickPanel} from './QuickPanel';
import {Methodology} from './Methodology';
import {AnomalyBanner,FireCalendar} from './history';
import {FilterBar,DetectionSheet,ExportButton,CollapsibleFilters,DEFAULT_FILTERS,filtersToParams,filterCaption,sensorOf,productLabel,type HFilters} from './harmonized';
const LazyMap=lazy(()=>import('./MapView').then(m=>({default:m.FireMap})));
function FireMap(props:Parameters<typeof import('./MapView').FireMap>[0]){
 return <Suspense fallback={<div className="map" role="status" style={{minHeight:380}}>Chargement de la carte…</div>}><LazyMap {...props}/></Suspense>;
}

const client=new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false,staleTime:60000}}});
const n=(v:unknown)=>typeof v==='number'?v.toLocaleString('fr-FR'):'—';
const dt=(v:string)=>v?new Date(v).toLocaleString('fr-FR',{timeZone:'UTC'})+' UTC':'—';
function Card({title,children,sub,tone='forest',action}:{title:string;children:ReactNode;sub?:string;tone?:'forest'|'ember'|'info'|'sand';action?:ReactNode}){return <section className={`card card--${tone}`}><div className="card__head" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><div><h2 className="card__title">{title}</h2>{sub&&<p className="muted small">{sub}</p>}</div>{action&&<div style={{paddingRight:14}}>{action}</div>}</div><div className="card__body">{children}</div></section>}
function Kpi({label,value,unit,foot,tone,icon,loading}:{label:string;value:ReactNode;unit?:string;foot?:ReactNode;tone?:string;icon?:string;loading?:boolean}){return <div className={`nx-kpi${tone?' nx-kpi--'+tone:''}${loading?' is-loading':''}`} aria-busy={loading||undefined}><span>{icon&&<Icon name={icon} size={13}/>}{label}</span><b>{value}{unit&&<small> {unit}</small>}</b>{foot&&<p>{foot}</p>}</div>}
function Section({title,icon,hint,children}:{title:string;icon:string;hint?:ReactNode;children:ReactNode}){return <section className="nx-section"><div className="nx-section__head"><h2 className="nx-section__title"><Icon name={icon} size={14}/>{title}</h2>{hint&&<span className="nx-section__hint">{hint}</span>}</div>{children}</section>}
function App(){
 const [route,setRoute]=useState(location.hash.slice(1)||'dashboard');
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[region,setRegion]=useState('world'),[sensor,setSensor]=useState(''),[offset,setOffset]=useState(0),[selected,setSelected]=useState('');
 const [hf,setHf]=useState<HFilters>(DEFAULT_FILTERS),[metric,setMetric]=useState<'active_cells'|'detections'>('active_cells'),[histFamily,setHistFamily]=useState<'VIIRS'|'MODIS'>('VIIRS');
 const settings=useSettings();
 useEffect(()=>{applySettingsToDocument(settings)},[settings]);
 useEffect(()=>{const change=()=>{setRoute(location.hash.slice(1)||'dashboard');setOffset(0);setSelected('')};addEventListener('hashchange',change);return()=>removeEventListener('hashchange',change)},[]);
 const gabon=route==='gabon'||region==='gabon';
 const params=new URLSearchParams();if(start)params.set('start_date',start);if(end)params.set('end_date',end);if(gabon)params.set('bbox','8.5,-4.1,14.6,2.4');else if(region==='africa')params.set('bbox','-20,-36,53,38');
 filtersToParams(hf,params);
 // Choix MODIS / VIIRS : s'applique à toutes les statistiques, pas seulement à la carte.
 if(sensor)params.set('sensor_family',sensor);
 const caption=`${sensor?sensor+' seul · ':''}${filterCaption(hf)} · ${start||end?`${start||'…'} → ${end||'…'}`:'toute la période chargée'}`;
 const query=params.toString();
 // Chaque page ne demande que les données qu'elle affiche (le serveur garde aussi les résultats en cache).
 const on=(...pages:string[])=>pages.includes(route);
 const q=(name:string,path:string,extra='',enabled=true)=>useQuery({queryKey:[name,query,extra],queryFn:()=>get(path,query+(extra?'&'+extra:'')),enabled});
 const health=useQuery({queryKey:['health'],queryFn:()=>get('/health')});
 const summary=q('summary','/statistics/summary','',route!=='carte');
 const timeline=q('timeline','/statistics/timeline','',on('dashboard','gabon','historique'));
 const satellites=q('satellites','/statistics/satellites','',on('dashboard','gabon','comparaison'));
 const hotspots=q('hotspots','/analytics/hotspots','limit=10',on('dashboard','gabon','zones'));
 // Historique : la zone (bbox) et la famille de capteur définissent la référence ; la période sélectionnée n'y entre pas.
 const histParams=new URLSearchParams({sensor_family:histFamily,metric});const zoneBbox=params.get('bbox');if(zoneBbox)histParams.set('bbox',zoneBbox);if(hf.confidence.length)histParams.set('confidence',hf.confidence.join(','));if(!hf.vegetationOnly)histParams.set('vegetation_only','false');
 const anomaly=useQuery({queryKey:['anomaly',histParams.toString()],queryFn:()=>get('/statistics/anomaly',histParams.toString()),enabled:on('dashboard','gabon','historique')});
 const calendar=useQuery({queryKey:['calendar',histParams.toString()],queryFn:()=>get('/detections/timeline',histParams.toString()+'&granularity=month'),enabled:on('dashboard','gabon','historique')});
 const selectedMonth=start&&end&&start.endsWith('-01')&&start.slice(0,7)===end.slice(0,7)?start.slice(0,7):undefined;
 const selectMonth=(p:string|null)=>{if(!p){setStart('');setEnd('');return;}const [y,mo]=p.split('-').map(Number);setStart(`${p}-01`);setEnd(`${p}-${String(new Date(Date.UTC(y,mo,0)).getUTCDate()).padStart(2,'0')}`);};
 const familySwitch=<div className="seg" role="group" aria-label="Famille de capteur de référence"><button aria-pressed={histFamily==='VIIRS'} onClick={()=>setHistFamily('VIIRS')}>VIIRS</button><button aria-pressed={histFamily==='MODIS'} onClick={()=>setHistFamily('MODIS')}>MODIS</button></div>;
 const calItems=calendar.data?.items||[];
 const events=q('events','/events','limit=20&offset='+offset,on('evenements'));
 const eventId=route.startsWith('event/')?route.slice(6):'';
 const event=useQuery({queryKey:['event',eventId],queryFn:()=>get('/events/'+eventId),enabled:!!eventId});
 const rows=timeline.data?.items||[],days=[...new Set<string>(rows.map((r:any)=>r.day))].sort();
 const metricLabel=metric==='active_cells'?'Cellules actives (0,01°)':'Détections';
 const lines=['MODIS','VIIRS'].map((s,i)=>({name:s,color:i?'#E69F00':'#CC79A7',values:days.map(d=>Number(rows.find((r:any)=>r.day===d&&r.sensor===s)?.[metric]||0))}));
 const sats=satellites.data?.items||[];
 const stats=summary.data;
 const title=eventId?'Détail de l’événement':NAV.flatMap(g=>g.items).find(i=>i.route===route)?.label||'Tableau de bord';
 const table=(items:any[],fields:[string,string][])=>items.length?<div className="table-wrap"><table><thead><tr>{fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{items.map((item,i)=><tr key={item.id||i}>{fields.map(([key])=><td key={key}>{key==='acquisition_time'?dt(item[key]):String(item[key]??'—')}</td>)}</tr>)}</tbody></table></div>:<p className="muted">Aucune observation sur cette sélection.</p>;
 const metricSwitch=<div className="seg" role="group" aria-label="Métrique"><button aria-pressed={metric==='active_cells'} onClick={()=>setMetric('active_cells')}>Cellules actives</button><button aria-pressed={metric==='detections'} onClick={()=>setMetric('detections')}>Détections</button></div>;
 const chart=<TrendChart x={days} series={lines} caption={`${metricLabel} par jour UTC et par famille de capteur · ${caption}`}/>;
 const hotItems=hotspots.data?.items||[],hotTop=Number(hotItems[0]?.active_cells||1);
 const rank=hotItems.length?<div className="table-wrap"><table className="nx-table"><thead><tr><th>#</th><th>Carreau de 1°</th><th className="num">Cellules</th><th className="num">Détections</th><th className="num">Jours</th></tr></thead><tbody>{hotItems.map((h:any,i:number)=><tr key={i}><td className="mono">{String(i+1).padStart(2,'0')}</td><td>{h.grid_lat}° · {h.grid_lon}°<span className="bar" style={{width:`${100*Number(h.active_cells)/hotTop}%`}}/></td><td className="num">{n(h.active_cells)}</td><td className="num">{n(h.detections)}</td><td className="num">{h.active_days}</td></tr>)}</tbody></table></div>:<p className="muted">Aucune zone active sur cette sélection.</p>;
 const satChart=<SatelliteChart caption={`Cellules actives par satellite · ${caption}`} items={sats.map((s:any)=>({label:s.satellite,value:Number(s.active_cells)}))} colorOf={i=>sensorOf(sats[i]?.satellite_code)?.color||'#E69F00'}/>;
 const freshness=(stats?.freshness||[]).map((f:any)=><tr key={f.source}><th>{productLabel(f.product)}</th><td className="num">{dt(f.last_success)}</td></tr>);
 const map=<FireMap key={gabon?'gabon':'world'} gabon={gabon} query={query} sensor={sensor} onDetection={setSelected}/>;
 const zoneName=gabon?'Gabon':region==='africa'?'Afrique':'Monde';
 // Dernier jour de données connu (conservé pendant les rechargements des statistiques).
 const lastObs=useRef<string|undefined>(undefined);if(stats?.last_observation)lastObs.current=stats.last_observation;
 // Commandes que l'assistant vocal peut appeler (liste fermée) ; l'état est relu à chaque appel.
 useEffect(()=>{ctl.app={
  navigate:p=>{location.hash='#'+p;},
  setSensor:v=>setSensor(v),setRegion:r=>setRegion(r),
  setPeriod:(s,e)=>{setStart(s);setEnd(e);},
  setTheme:m=>settings.update({theme:m==='nuit'?'dark':'light'}),
  getState:()=>({route:location.hash.slice(1)||'dashboard',sensor,region,start,end,zone:ctl.map.zoneName?.(),alerts:ctl.ops.alertSummary?.()}),
  lastDataDay:()=>lastObs.current?.slice(0,10),
 };});
 const alertSum=useAlerts(gabon?'gabon':region==='africa'?'africa':'world').data;
 return <AppShell route={route} sidebar={<Sidebar current={route} hrefOf={r=>'#'+r} health={{status:health.data?.status||'down',version:'0.1.0'}}/>} topbar={(toggle,expanded)=><Topbar title={title} crumbs="FireWatch Africa · Veille satellitaire des feux" lastUpdate={stats?.last_observation} onMenu={toggle} menuExpanded={expanded} periodControl={<div className="fw-topbar__chips"><HarmonizeButton/><span className="nx-chip"><Icon name="satellite" size={13}/>NASA FIRMS</span><span className="nx-chip"><Icon name="merge" size={13}/>MODIS + VIIRS harmonisés{stats?.harmonization?` · v${stats.harmonization.version}`:''}</span><span className="nx-chip nx-chip--ember"><Icon name="globe" size={13}/>{zoneName}</span>{alertSum?.total?<a className={`nx-chip nx-chip--alert is-${alertSum.top}`} href="#carte" title="Voir les alertes sur la carte"><Icon name={levelOf(alertSum.top).icon} size={13}/>{alertSum.counts.critique?`${alertSum.counts.critique} alerte${alertSum.counts.critique>1?'s':''} critique${alertSum.counts.critique>1?'s':''}`:`${alertSum.total} alerte${alertSum.total>1?'s':''}`}</a>:null}</div>}/>} overlay={<VoiceAssistant/>} bottomNav={open=><BottomNav current={route} hrefOf={r=>'#'+r} onMore={open}/>}>
 <div className="fw-page" key={route.startsWith("event/")?"event":route}>
 <div className="toolbar"><SensorToggle value={sensor} onChange={setSensor}/><label>Zone <select className="input" value={region} onChange={e=>setRegion(e.target.value)}><option value="world">Monde</option><option value="africa">Afrique</option><option value="gabon">Gabon (emprise)</option></select></label><label>Du <input className="input" type="date" value={start} max={end||undefined} onChange={e=>setStart(e.target.value)}/></label><label>au <input className="input" type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label><button className="btn btn--sm" onClick={()=>{setStart('');setEnd('');setRegion('world')}}><Icon name="reset" size={14}/>Réinitialiser</button><span className="badge">Couche harmonisée NASA FIRMS{stats?.harmonization?` · v${stats.harmonization.version}`:''}</span></div>
 {route!=='carte'&&<CollapsibleFilters filters={hf} total={stats?.total_detections}>
  <FilterBar value={hf} onChange={f=>{setHf(f);setOffset(0)}}/>
  <ExportButton query={query} total={stats?.total_detections} loading={summary.isPending||summary.isFetching}/>
 </CollapsibleFilters>}
 {summary.isError&&<div role="alert" className="notice">Le serveur de données ne répond pas. Vérifiez que l’API FastAPI tourne sur le port 8010. <button className="btn" onClick={()=>client.invalidateQueries()}>Réessayer</button></div>}
 {(route==='dashboard'||route==='gabon')&&<div className="nx-dash"><AnomalyBanner data={anomaly.data} loading={anomaly.isPending} error={anomaly.isError} onDetail={()=>{location.hash='#historique'}}/>
 <div className="nx-hero"><section className="hero"><div><span className="badge">NASA FIRMS · MODIS · VIIRS</span><h2>Le feu {gabon?'au Gabon':'en Afrique et dans le monde'}, <em>mesuré face à sa normale.</em></h2><p>Deux familles de satellites réunies sur une même grille d’un kilomètre. Repérez où l’activité thermique sort de l’ordinaire, preuves historiques à l’appui : 25 ans de MODIS, 13 ans de VIIRS.</p><div className="row"><a className="btn btn--primary" href="#carte"><Icon name="globe" size={16}/>Ouvrir la carte</a><a className="btn" href="#historique"><Icon name="history" size={16}/>Voir l’historique</a><a href="#methodologie">Comprendre la méthode</a></div></div></section>
 <Card title="État des données" sub="Ce que contient la base en ce moment"><dl className="nx-meta"><dt>Jours observés</dt><dd>{stats?.active_days??'—'}</dd><dt>Dernière observation</dt><dd>{dt(stats?.last_observation)}</dd><dt>Harmonisation</dt><dd>{stats?.harmonization?`version ${stats.harmonization.version}`:'—'}</dd></dl>{freshness.length>0&&<div className="table-wrap" style={{marginTop:12}}><table className="nx-table"><thead><tr><th>Produit</th><th className="num">Dernière collecte</th></tr></thead><tbody>{freshness}</tbody></table></div>}</Card></div>
 <div className="nx-grid"><div className="s6"><Section title="Situation" icon="flame" hint={caption}><div className="nx-kpis">
  <Kpi loading={anomaly.isPending} tone={anomaly.data?.position==='above_normal'?'hot':'info'} icon={anomaly.data?.position==='above_normal'?'trendUp':anomaly.data?.position==='below_normal'?'trendDown':'equal'} label="Anomalie du mois" value={anomaly.data?.anomaly_pct!=null?`${anomaly.data.anomaly_pct>0?'+':anomaly.data.anomaly_pct<0?'−':''}${Math.abs(anomaly.data.anomaly_pct).toLocaleString('fr-FR')} %`:'—'} foot={anomaly.data?.reference?`${histFamily} · ${({above_normal:'au-dessus de la normale',below_normal:'en dessous de la normale',normal:'dans la normale'} as any)[anomaly.data.position]??''} (médiane ${anomaly.data.reference.years})`:'Historique insuffisant'}/>
  <Kpi loading={summary.isPending} tone="hot" icon="flame" label={hf.vegetationOnly?'Détections · végétation':'Détections · toutes sources'} value={n(stats?.total_detections)}/>
  <Kpi loading={summary.isPending} icon="crosshair" label="Cellules actives" value={n(stats?.active_cells)} foot="Cases de 0,01° (≈ 1 km) avec au moins une détection"/>
 </div></Section></div>
 <div className="s6"><Section title="Capteurs et harmonisation" icon="merge" hint="Comparez les cellules actives, pas les détections"><div className="nx-kpis">
  <Kpi loading={summary.isPending} tone="modis" icon="satellite" label="MODIS · Terra + Aqua" value={n(stats?.modis_cells)} unit="cellules" foot={`${n(stats?.modis)} détections · pixel ≈ 1 km`}/>
  <Kpi loading={summary.isPending} tone="viirs" icon="satellite" label="VIIRS · NOAA-20 + 21" value={n(stats?.viirs_cells)} unit="cellules" foot={`${n(stats?.viirs)} détections · pixel 375 m`}/>
  <Kpi loading={summary.isPending} tone="sand" icon="link" label="Rapprochements" value={n(stats?.cross_sensor_groups)} foot="Groupes possibles ≤ 2 km et ≤ 3 h"/>
  <Kpi loading={summary.isPending} icon="filter" label="Non végétal exclu" value={n(stats?.non_vegetation_excluded)} foot={stats?.static_mask_cells?`Masque statique : ${n(stats.static_mask_cells)} cellules`:'Masque statique vide : torchères non filtrées'}/>
 </div></Section></div></div>
 <div className="nx-grid"><div className="s8"><Card title={`Carte des détections · ${zoneName}`} sub="Cliquez un pays ou une province pour voir ses points chauds"><div style={{height:430}}>{map}</div></Card></div><div className="s4"><Card tone="ember" title="Zones les plus actives" sub="Carreaux de 1° classés par cellules actives">{rank}</Card></div></div>
 <div className="nx-grid"><div className="s8"><Card tone="info" title="Activité jour par jour" action={metricSwitch}>{chart}</Card></div><div className="s4"><Card tone="ember" title={`Calendrier de feu · ${histFamily}`} sub="Un mois par case · hachures : capteur absent ou trou de données" action={familySwitch}>{calendar.isPending?<p role="status">Chargement…</p>:<FireCalendar compact items={calItems} selected={selectedMonth} onSelect={selectMonth} family={histFamily} metric={metric}/>}<a href="#historique" className="small">Ouvrir le calendrier complet</a></Card></div></div>
 <Card tone="sand" title="MODIS face à VIIRS, satellite par satellite" sub={satellites.data?.ratio_viirs_modis_cells?`Ratio VIIRS / MODIS en cellules actives : ${satellites.data.ratio_viirs_modis_cells}`:'Cellules actives par satellite'}><div className="nx-grid"><div className="s6">{satChart}</div><div className="s6">{table(sats,[['satellite','Satellite'],['sensor','Famille'],['active_cells','Cellules actives'],['detections','Détections'],['total_frp','FRP cumulée (MW)']])}</div></div></Card>
 </div>}
 {route==='carte'&&<Suspense fallback={<div className="map" role="status" style={{minHeight:380}}>Chargement de la carte…</div>}><OperationsMapScreen query={query} sensor={sensor} setSensor={setSensor} start={start} end={end} setRange={(from,to)=>{setStart(from);setEnd(to)}} region={region} onDetection={setSelected} filters={<FilterBar value={hf} onChange={f=>{setHf(f);setOffset(0)}}/>}/></Suspense>} 
 {route==='historique'&&<div className="nx-dash"><div className="row" style={{gap:12}}><span className="muted small">Famille de référence</span>{familySwitch}{metricSwitch}</div>
 <AnomalyBanner data={anomaly.data} loading={anomaly.isPending} error={anomaly.isError}/>
 <div className="nx-grid"><div className="s6"><Card tone="info" title={`Médiane historique · ${histFamily}`} sub="Chaque famille est comparée à sa propre référence : jamais VIIRS face à une médiane MODIS.">{anomaly.data&&anomaly.data.position!=='unknown'?<MedianCurve data={anomaly.data}/>:<p className="muted">Courbe indisponible pour cette sélection.</p>}{anomaly.data?.inter_satellite_correction?.ratio_noaa20_snpp!=null&&<p className="small muted">Biais inter-satellites mesuré (cellules actives 2019–2025) : NOAA-20 / Suomi-NPP = {anomaly.data.inter_satellite_correction.ratio_noaa20_snpp}. Correction non appliquée.</p>}</Card></div>
 <div className="s6"><Card tone="ember" title={`Calendrier de feu · ${histFamily}, ${metric==='active_cells'?'cellules actives':'détections'}`} sub={`Végétation présumée · ${gabon?'Gabon':region==='africa'?'Afrique':'Monde'} · ${selectedMonth?`mois sélectionné : ${selectedMonth}`:'cliquez un mois pour filtrer'}`}>{calendar.isPending?<p role="status">Chargement…</p>:calendar.isError?<p role="alert">Calendrier indisponible.</p>:<FireCalendar items={calItems} selected={selectedMonth} onSelect={selectMonth} family={histFamily} metric={metric}/>}</Card></div></div>
 <Card tone="info" title="Historique temporel" sub="Période réellement présente dans la base. Un jour manquant ne prouve pas l’absence de feu.">{chart}{table(rows,[['day','Jour UTC'],['sensor','Famille'],['active_cells','Cellules actives'],['detections','Détections']])}</Card></div>}
 {route==='zones'&&<Card tone="ember" title="Zones de concentration" sub={`Carreaux de 1°, classés par cellules actives de 0,01° · ${caption}`}>{rank}</Card>}
 {route==='comparaison'&&<div className="nx-dash"><div className="compare-grid"><Card tone="sand" title="MODIS · pixel ≈ 1 km"><div style={{height:420}}><FireMap query={query} sensor="MODIS" onDetection={setSelected}/></div></Card><Card tone="sand" title="VIIRS · pixel 375 m"><div style={{height:420}}><FireMap query={query} sensor="VIIRS" onDetection={setSelected}/></div></Card></div><Card title="Comparaison harmonisée par satellite" sub="À activité égale, VIIRS (375 m) produit mécaniquement plus de détections que MODIS (1 km). Comparez donc les cellules actives de 0,01°, pas les détections.">{satellites.data?.ratio_viirs_modis_cells!=null&&<p><b>Ratio VIIRS / MODIS en cellules actives : {satellites.data.ratio_viirs_modis_cells}</b> <span className="muted">· {caption}</span></p>}<div className="nx-grid"><div className="s6">{satChart}</div><div className="s6">{table(sats,[['satellite','Satellite'],['sensor','Famille'],['active_cells','Cellules actives'],['detections','Détections'],['total_frp','FRP cumulée (MW)']])}</div></div></Card></div>}
 {route==='evenements'&&<Card title="Événements harmonisés" sub="Groupes analytiques probables · fenêtres fixes de six heures · méthode expérimentale">{events.isPending?<p>Chargement…</p>:events.isError?<p role="alert">Événements indisponibles.</p>:(events.data?.items||[]).map((e:any)=><a className="card evcard" key={e.id} href={'#event/'+e.id}><span className="score">{Number(e.harmonization_score).toFixed(2)}</span><div><div className="evcard__id">{e.event_code}</div><div>{dt(e.start_time)}</div><div className="muted">{e.detection_count} observations · {e.sensor_count} capteurs · FRP max {e.max_frp} MW</div></div></a>)}<div className="row"><button className="btn" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-20))}>Précédent</button><span>Page {offset/20+1}</span><button className="btn" disabled={(events.data?.items.length||0)<20} onClick={()=>setOffset(offset+20)}>Suivant</button></div></Card>}
 {eventId&&<Card title={event.data?.event_code||'Événement probable'} sub="Rapprochement analytique ; validation terrain non disponible.">{event.isError?<p role="alert">Événement indisponible.</p>:event.isPending?<p>Chargement…</p>:<><p>Score {event.data.harmonization_score} · Méthode {event.data.method_version}</p>{table(event.data.detections,[['satellite','Satellite'],['acquisition_time','Acquisition UTC'],['frp','FRP MW'],['distance_km','Distance au centre km'],['association_score','Association']])}</>}</Card>}
 {route==='methodologie'&&<Methodology/>}
 {route==='assistant'&&<Card title="Assistant IA" sub="Un seul assistant pour toute l'application : il répond à voix haute ou par écrit, consulte les données et agit dans les interfaces.">
  <div className="ai-hub">
   <p>Cliquez sur la bulle du micro en bas à droite (ou <kbd>Ctrl</kbd>+<kbd>Espace</kbd>) et parlez naturellement, ou choisissez une demande ci-dessous. Les actions sensibles (harmonisation, téléchargement) vous sont toujours soumises avant d'être exécutées.</p>
   <div className="ai-hub__grid">{[
    ['globe','Montre-moi les feux VIIRS au Gabon cette semaine'],['siren','Où est l’alerte critique la plus forte et pourquoi ?'],
    ['chart','Quelle province du Gabon est la plus active en 2024 ?'],['compare','Compare MODIS et VIIRS en Afrique'],
    ['activity','Joue la chronologie sur 3 jours'],['merge','Lance l’harmonisation des données'],
   ].map(([icon,text])=><button key={text} type="button" className="ai-hub__ask" onClick={()=>dispatchEvent(new CustomEvent('fw:voice-ask',{detail:text}))}><Icon name={icon} size={16}/><span>{text}</span></button>)}</div>
  </div></Card>}
 {route==='parametres'&&<Card title="Préférences" sub="Conservées sur cet appareil"><label className="toggle-row"><span><Icon name={settings.theme==='light'?'sun':'moon'} size={15}/> Mode nuit</span><input type="checkbox" checked={settings.theme!=='light'} onChange={e=>settings.update({theme:e.target.checked?'dark':'light'})}/></label><label className="toggle-row"><span><Icon name={settings.alerts!==false?'bell':'bellOff'} size={15}/> Alertes thermiques</span><input type="checkbox" checked={settings.alerts!==false} onChange={e=>settings.update({alerts:e.target.checked})}/></label><label className="toggle-row"><span><Icon name="siren" size={15}/> Effets visuels des alertes</span><input type="checkbox" checked={settings.alertEffects!==false} onChange={e=>settings.update({alertEffects:e.target.checked})}/></label><label className="toggle-row"><span><Icon name="locate" size={15}/> Zoom automatique sur les alertes</span><input type="checkbox" checked={settings.alertAutoZoom!==false} onChange={e=>settings.update({alertAutoZoom:e.target.checked})}/></label><label className="toggle-row">Texte agrandi<input type="checkbox" checked={settings.largeText} onChange={e=>settings.update({largeText:e.target.checked})}/></label><label className="toggle-row">Réduire les animations<input type="checkbox" checked={settings.reduceMotion} onChange={e=>settings.update({reduceMotion:e.target.checked})}/></label><p className="muted small">Désactiver les alertes arrête leur calcul et tout signal (en-tête, carte, bandeau). Désactiver seulement leurs effets coupe le clignotement et le scintillement : la détection, la liste et les couleurs des niveaux restent actives. Toutes les dates sont affichées en temps universel (UTC).</p></Card>}
 {route!=='carte'&&<p className="muted small">Une détection thermique n’est pas un incendie confirmé · Données NASA FIRMS · Gabon : sélection par emprise géographique.</p>}
 {selected&&<DetectionSheet id={selected} onClose={()=>setSelected('')}/>}
 <QuickPanel stats={stats} ratio={satellites.data?.ratio_viirs_modis_cells} zone={gabon?'Gabon':region==='africa'?'Afrique':'Monde'} caption={caption} query={query}
  onResetFilters={()=>setHf(DEFAULT_FILTERS)} onAllPeriod={()=>{setStart('');setEnd('')}}
  onLast7={()=>{const last=(stats?.last_observation||new Date().toISOString()).slice(0,10);const d=new Date(last+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6);setStart(d.toISOString().slice(0,10));setEnd(last)}}/>
 </div></AppShell>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><App/></QueryClientProvider>);
