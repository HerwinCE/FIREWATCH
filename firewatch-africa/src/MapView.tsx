import {useEffect,useMemo,useRef,useState} from 'react';
import mapboxgl from 'mapbox-gl';
import type * as GeoJSON from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import {useQuery} from '@tanstack/react-query';
import {get} from './api';
import {useSettings} from '../components/src/state/settings';
import {SENSORS} from './harmonized';
import {Icon} from '../components/src/components/Icon';
import {levelOf,type Alert,type AlertData} from './alerts';
import {ctl,type Result} from './voice/control';
import {ZoneWindow,MapDisplayControl,BASEMAPS,type Basemap,type Display,type Zone} from './CountryWindow';

/** Dessine un marqueur (carré, cercle, triangle, losange, croix) pour Mapbox. */
function shapeImage(shape:string,color:string){
 const size=28,c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d')!;
 g.fillStyle=color;g.strokeStyle='#0E1412';g.lineWidth=3;g.beginPath();
 const p=5,e=size-p,mid=size/2;
 if(shape==='square')g.rect(p,p,e-p,e-p);
 else if(shape==='circle')g.arc(mid,mid,mid-p,0,Math.PI*2);
 else if(shape==='triangle'){g.moveTo(mid,p-1);g.lineTo(e+1,e);g.lineTo(p-1,e);g.closePath();}
 else if(shape==='diamond'){g.moveTo(mid,p-2);g.lineTo(e+2,mid);g.lineTo(mid,e+2);g.lineTo(p-2,mid);g.closePath();}
 else {g.lineWidth=7;g.moveTo(p,p);g.lineTo(e,e);g.moveTo(e,p);g.lineTo(p,e);g.stroke();g.strokeStyle=color;g.lineWidth=3.5;g.beginPath();g.moveTo(p,p);g.lineTo(e,e);g.moveTo(e,p);g.lineTo(p,e);g.stroke();return g.getImageData(0,0,size,size);}
 g.fill();g.stroke();return g.getImageData(0,0,size,size);
}

type Compact={fields:string[];satellites:string[];confidences:string[];points:any[][];total:number;shown:number;partial:boolean};
const lsGet=(k:string)=>{try{return localStorage.getItem(k)}catch{return null}};
const lsSet=(k:string,v:string)=>{try{localStorage.setItem(k,v)}catch{/* stockage indisponible */}};
// Couleur « braise » selon la puissance (FRP) : du jaune pâle au rouge vif.
const HOT:any=['interpolate',['linear'],['coalesce',['get','frp'],0],0,'#FFE7A8',5,'#FFC46B',20,'#FF8A3D',60,'#F2542D',200,'#C81D25'];
const SENSOR_COLOR:any=['match',['get','satellite'],'TERRA','#CC79A7','AQUA','#CC79A7','NOAA20','#E69F00','NOAA21','#D55E00','SNPP','#56B4E9','#FFC46B'];
const EMPTY:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[]};
/** Contrastes par fond : la terre se détache de la mer, les frontières et les provinces restent lisibles. */
const CONTRAST:Record<string,{water?:string;land?:string;landOpacity:number;border:string;province:string;label:string;halo:string;dim:string}>={
 dark:{water:'#101317',land:'#262A31',landOpacity:.92,border:'rgba(235,238,242,.5)',province:'#8ED9CB',label:'#F2F3F5',halo:'rgba(10,12,15,.95)',dim:'#07080A'},
 satellite:{landOpacity:0,border:'rgba(255,255,255,.66)',province:'#9ADFD3',label:'#FFFFFF',halo:'rgba(4,8,16,.92)',dim:'#02050B'},
 light:{water:'#CFE0EE',land:'#F1F4F8',landOpacity:.6,border:'rgba(15,30,55,.5)',province:'#0E7490',label:'#0B1628',halo:'rgba(255,255,255,.95)',dim:'#0B1628'},
 relief:{landOpacity:0,border:'rgba(15,30,55,.55)',province:'#0E7490',label:'#0B1628',halo:'rgba(255,255,255,.95)',dim:'#0B1628'},
};

/** Mouvement de caméra : accélère puis freine en douceur (ease-in-out cubique). */
const EASE=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const calmMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.reduceMotion==='true';
type Box=[number,number,number,number];
/** Emprise d'un ensemble d'anneaux ; un pays à cheval sur l'antiméridien garde son plus grand morceau. */
function ringsBox(rings:number[][][]):Box|null{
 const box=(rs:number[][][]):Box=>{let w=180,s=90,e=-180,n=-90;rs.forEach(r=>r.forEach(([x,y])=>{if(x<w)w=x;if(x>e)e=x;if(y<s)s=y;if(y>n)n=y;}));return [w,s,e,n];};
 if(!rings.length)return null;let b=box(rings);
 if(b[2]-b[0]>200){const big=[...rings].sort((a,c)=>c.length-a.length)[0];b=box([big]);}
 return b;
}

/** Marges de cadrage : la zone se place dans l'espace libre, à côté de ce qui flotte sur la carte
    (fenêtre de zone, panneau d'outil, rail, chronologie). Si la fenêtre de zone n'est pas encore
    affichée, sa place prévue (à gauche, sous les commandes) est réservée. */
function framePadding(r:DOMRect){
 const pad={top:r.top<60?120:64,bottom:Math.max(70,r.height*.08),left:48,right:48};
 const rects:DOMRect[]=[];
 ['.cwin','.mtool','.mrail','.tdock.is-open .tdock__body'].forEach(sel=>{const el=document.querySelector(sel);if(el){const b=el.getBoundingClientRect();if(b.width&&b.height)rects.push(b);}});
 if(!document.querySelector('.cwin')&&innerWidth>640){const w=Math.min(innerWidth-24,Math.max(660,Math.min(780,innerWidth*.4)));rects.push(new DOMRect(24,196,w,Math.min(640,innerHeight*.58)));}
 rects.forEach(o=>{
  if(o.right<=r.left||o.left>=r.right||o.bottom<=r.top||o.top>=r.bottom)return;
  const wide=o.width>r.width*.55;
  if(o.height<150&&o.top<r.top+r.height*.4){pad.top=Math.max(pad.top,o.bottom-r.top+16);return;}     // fenêtre réduite en haut
  if(wide&&o.top>r.top+r.height*.5){pad.bottom=Math.max(pad.bottom,r.bottom-o.top+16);return;}      // chronologie en bas
  if(o.left+o.width/2<r.left+r.width/2)pad.left=Math.max(pad.left,o.right-r.left+28);else pad.right=Math.max(pad.right,r.right-o.left+28);
 });
 const room=r.width-160;if(pad.left+pad.right>room){const k=room/(pad.left+pad.right);pad.left*=k;pad.right*=k;}
 const vroom=r.height-120;if(pad.top+pad.bottom>vroom){const k=vroom/(pad.top+pad.bottom);pad.top*=k;pad.bottom*=k;}
 return pad;
}

/** Continents (propriété « region » des frontières Mapbox) et leur cadrage. */
export const CONTINENTS:{key:string;label:string;box:Box}[]=[
 {key:'Africa',label:'Afrique',box:[-19,-36,52,38]},{key:'Europe',label:'Europe',box:[-25,35,45,71]},
 {key:'Asia',label:'Asie',box:[26,-10,150,72]},{key:'Americas',label:'Amériques',box:[-168,-56,-34,72]},{key:'Oceania',label:'Océanie',box:[112,-47,179,-1]},
];
/** Mailles de 0,5° couvertes par des anneaux (lon, lat), par ligne : [y, x début, x fin].
    Balayage à trois latitudes par ligne + chaque sommet : les côtes et les îles sont retenues. */
function cellsOf(rings:number[][][]):number[][]{
 const rows=new Map<number,Set<number>>();
 const add=(y:number,x:number)=>{if(x<-360||x>=360||y<-180||y>=180)return;let s=rows.get(y);if(!s){s=new Set();rows.set(y,s);}s.add(x);};
 rings.forEach(r=>{
  if(r.length<3)return;let s=90,n=-90;r.forEach(([x,y])=>{if(y<s)s=y;if(y>n)n=y;add(Math.floor(y*2),Math.floor(x*2));});
  for(let y=Math.floor(s*2);y<=Math.floor(n*2);y++){
   [.1,.5,.9].forEach(f=>{const lat=(y+f)/2,xs:number[]=[];
    for(let i=0;i<r.length;i++){const [x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];if(Math.abs(x2-x1)>180)continue;
     if((y1<=lat&&y2>lat)||(y2<=lat&&y1>lat))xs.push(x1+(lat-y1)/(y2-y1)*(x2-x1));}
    xs.sort((a,b)=>a-b);for(let k=0;k+1<xs.length;k+=2)for(let x=Math.floor(xs[k]*2);x<=Math.floor(xs[k+1]*2);x++)add(y,x);});
  }
 });
 const out:number[][]=[];
 [...rows.entries()].sort((a,b)=>a[0]-b[0]).forEach(([y,set])=>{const xs=[...set].sort((a,b)=>a-b);let a=xs[0],b=xs[0];
  for(let i=1;i<=xs.length;i++){if(i<xs.length&&xs[i]===b+1){b=xs[i];continue;}out.push([y,a,b]);if(i<xs.length){a=b=xs[i];}}});
 return out;
}
type Probe={lon:number;lat:number;radius_km:number;sensors:Record<string,{raw:number;superseded:number;non_vegetation:number;kept:number;cells:number;linked:number;high:number;nominal:number;low:number;max_frp:number|null;mean_frp:number|null;last_time:string|null}>;harmonized:{detections:number;cells:number;groups:number;max_frp:number|null}};

/** Format compact de l'API -> GeoJSON pour Mapbox. */
function toGeoJSON(c?:Compact):GeoJSON.FeatureCollection{
 if(!c)return EMPTY;
 return {type:'FeatureCollection',features:c.points.map(([lon,lat,frp,s,cf,veg,day,t,id],i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[lon,lat]},
  properties:{id,frp,satellite:c.satellites[s]??'',confidence:c.confidences[cf]??'',vegetation:veg===1,daynight:day?'D':'N',time:new Date(t*1000).toISOString(),phase:i%2}}))};
}

export function FireMap({query='',gabon=false,sensor='',onDetection,focus,exportTools=false,alerts,alertEffects=true,alertFocus,onAlertNames}:{exportTools?:boolean;alerts?:AlertData;alertEffects?:boolean;alertFocus?:{alert:Alert;k:number};onAlertNames?:(n:Record<string,string>)=>void;query?:string;gabon?:boolean;sensor?:string;onDetection?:(id:string)=>void;focus?:{center:[number,number];zoom:number;k:number}}){
 const container=useRef<HTMLDivElement>(null), map=useRef<mapboxgl.Map|null>(null);
 const settings=useSettings();
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 const [basemap,setBasemapState]=useState<Basemap>(()=>(lsGet('fw-basemap') as Basemap)||(settings.theme==='light'?'satellite':'dark'));
 const [display,setDisplayState]=useState<Display>(()=>(lsGet('fw-map-display') as Display)||'points');
 const [allPoints,setAllPointsState]=useState(false); // jamais actif par défaut : la carte s'ouvre vide
 const [showProvinces,setShowProvincesState]=useState(()=>lsGet('fw-provinces')!=='0');
 const setBasemap=(b:Basemap)=>{setBasemapState(b);lsSet('fw-basemap',b)};
 const setDisplay=(d:Display)=>{setDisplayState(d);lsSet('fw-map-display',d)};
 const setShowProvinces=(v:boolean)=>{setShowProvincesState(v);lsSet('fw-provinces',v?'1':'0')};
 const [zone,setZone]=useState<Zone|null>(null);
 // Vue : globe à chaque ouverture de la carte ; « Carte plane » (l'ancienne vue) au choix dans Affichage.
 const [projection,setProjection]=useState<'globe'|'mercator'>('globe');const projRef=useRef(projection);projRef.current=projection;
 const focusIso=zone?(zone.kind==='province'?zone.iso:zone.kind==='country'?zone.iso:undefined):undefined;
 const continent=zone?.kind==='continent'?CONTINENTS.find(c=>c.label===zone.name)?.key:undefined;
 // Inspecteur : un tableau capteurs + harmonisation suit le curseur ; un clic l'épingle.
 const [inspect,setInspect]=useState(false);const inspectRef=useRef(false);inspectRef.current=inspect;
 const [probe,setProbe]=useState<{x:number;y:number;lon:number;lat:number;pinned:boolean;data?:Probe;loading:boolean;error?:boolean}|null>(null);
 const probeRef=useRef(probe);probeRef.current=probe;
 const [zonePeriod,setZonePeriod]=useState<{start?:string;end?:string}>({});
 const filters=Object.fromEntries(new URLSearchParams(query));delete (filters as any).bbox;
 const scope=gabon?'gabon':new URLSearchParams(query).get('bbox')==='-20,-36,53,38'?'africa':'world';
 // « Tous les points » : un seul téléchargement pour la vue, indépendant des déplacements de la carte.
 const allParams=new URLSearchParams({...filters,scope});if(sensor)allParams.set('sensor',sensor);
 const all=useQuery<Compact>({queryKey:['all-points',allParams.toString()],enabled:allPoints,staleTime:5*60_000,placeholderData:p=>p,
  queryFn:()=>get('/map/all-points',allParams.toString())});
 // Points de la zone cliquée, sur la durée choisie dans sa fenêtre.
 const zonePts=useQuery<Compact>({queryKey:['zone-points',zone?.kind,zone?.iso,zone?.name,query,sensor,zonePeriod.start,zonePeriod.end],enabled:!!zone,placeholderData:p=>p,
  queryFn:()=>fetch('/api/map/zone-points',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({...filters,...zone,start_date:zonePeriod.start,end_date:zonePeriod.end,vegetation_only:filters.vegetation_only!=='false',sensor:sensor||undefined})})
   .then(r=>{if(!r.ok)throw new Error('API '+r.status);return r.json();})});
 const source=zone?zonePts:allPoints?all:null;
 const geo=useMemo(()=>toGeoJSON(source?.data),[source?.data]);
 const selection=useRef(onDetection);selection.current=onDetection;
 const openZone=useRef((z:Zone)=>{setZonePeriod({});setZone(z);});
 const provBox=useRef<Record<string,Box>>({});
 const fxRef=useRef(alertEffects);fxRef.current=alertEffects;
 const alertsRef=useRef<Record<string,Alert>>({});
 const before=useRef<{center:mapboxgl.LngLat;zoom:number;bearing:number;pitch:number}|null>(null);
 /** Vol vers une zone : la caméra prend de la hauteur, traverse, puis plonge sur la zone,
     cadrée dans la partie de la carte que ne couvrent ni la fenêtre de zone ni les panneaux. */
 const last=useRef<{b:Box;kind:'country'|'province'|'continent';layer:string}|null>(null);
 const zoomTo=useRef((b:Box,kind:'country'|'province'|'continent',layer:string)=>{
  const m=map.current;if(!m)return;
  if(!before.current){const c=m.getCenter();before.current={center:c,zoom:m.getZoom(),bearing:m.getBearing(),pitch:m.getPitch()};}
  const r=m.getContainer().getBoundingClientRect();
  const pad=framePadding(r);
  last.current={b,kind,layer};
  spin.current=false;
  const cam=m.cameraForBounds([[b[0],b[1]],[b[2],b[3]]],{padding:pad,maxZoom:kind==='province'?8.6:kind==='continent'?3.6:7.4});
  if(!cam)return;
  const pulse=()=>{if(calmMotion()||!m.getLayer(layer))return;const t0=performance.now();
   const step=(t:number)=>{const k=Math.min(1,(t-t0)/1100);if(!m.getLayer(layer))return;
    m.setPaintProperty(layer,'line-width',(kind==='province'?3.2:3.4)+7*(1-k)*(1-k));m.setPaintProperty(layer,'line-blur',.4+4*(1-k));
    if(k<1)requestAnimationFrame(step);else{m.setPaintProperty(layer,'line-width',kind==='province'?3.2:['interpolate',['linear'],['zoom'],2,2.4,8,4]);m.setPaintProperty(layer,'line-blur',.4);}};
   requestAnimationFrame(step);};
  if(calmMotion()){m.jumpTo(cam);return;}
  m.once('moveend',pulse);
  // Vol vers la zone : en s'approchant, le globe s'aplatit de lui-même en carte plane (zoom 5 à 6).
  m.flyTo({...cam,bearing:0,pitch:0,curve:1.6,speed:1.1,duration:Math.min(2800,Math.max(1400,1000+Math.abs((cam.zoom??m.getZoom())-m.getZoom())*280)),easing:EASE,essential:true});
 });
 // Maillage de chaque continent, calculé une fois quand la Terre entière est chargée (vue globe) :
 // zoomé sur un pays, les tuiles des autres régions ne sont plus disponibles.
 const contCells=useRef<Record<string,number[][]>>({});
 const continentCells=(m:mapboxgl.Map,key:string)=>{
  const rings:number[][][]=[];
  m.querySourceFeatures('countries',{sourceLayer:'country_boundaries',filter:['==',['get','region'],key]}).forEach(f=>{const g=f.geometry as GeoJSON.Polygon|GeoJSON.MultiPolygon;
   (g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[]).forEach(r=>rings.push(r as number[][]));});
  const cells=cellsOf(rings);if(cells.length&&m.getZoom()<=2.6)contCells.current[key]=cells;return cells;};
 // Rotation lente du globe à l'accueil, arrêtée dès que l'utilisateur prend la main.
 const spin=useRef(false);
 const spinStep=useRef(()=>{const m=map.current;if(!m||!spin.current||projRef.current!=='globe'||m.getZoom()>3.2||calmMotion())return;
  const c=m.getCenter();m.easeTo({center:[c.lng-7,c.lat],duration:2600,easing:t=>t,essential:true});});

 useEffect(()=>{
  if(!container.current)return;
  const token=import.meta.env.VITE_MAPBOX_TOKEN;
  if(!token){setError('Configurez VITE_MAPBOX_TOKEN dans .env.local.');return;}
  // Globe au départ ; l'arrivée rapproche la Terre, puis tout zoom sur une zone aplatit la vue en carte.
  const intro=!calmMotion();
  const m=new mapboxgl.Map({container:container.current,accessToken:token,style:BASEMAPS[basemap].style,projection:projRef.current,preserveDrawingBuffer:true,
   center:gabon?[14,2]:[18,6],zoom:intro?.35:gabon?5:1.55});map.current=m;
  m.on('style.load',()=>{const light=basemap==='light'||basemap==='relief';
   m.setFog(light?{color:'rgb(226,234,242)','high-color':'rgb(150,186,222)','horizon-blend':.08,'space-color':'rgb(206,218,232)','star-intensity':0}
    :{color:'rgb(22,26,32)','high-color':'rgb(44,74,108)','horizon-blend':.07,'space-color':'rgb(7,9,13)','star-intensity':.32});});
  const stop=()=>{spin.current=false;};
  (['mousedown','touchstart','wheel','dragstart'] as const).forEach(ev=>m.on(ev,stop));
  m.on('moveend',()=>spinStep.current());
  m.addControl(new mapboxgl.NavigationControl(),'top-right');m.addControl(new mapboxgl.ScaleControl(),'bottom-left');
  let raf=0;
  m.on('error',()=>setError('Fond Mapbox indisponible : vérifiez le réseau et les restrictions du token.'));
  m.on('load',()=>{
   setError('');
   const C=CONTRAST[basemap]??CONTRAST.satellite;
   if(C.water&&m.getLayer('water'))m.setPaintProperty('water','fill-color',C.water);
   // Noms de pays : en français, plus grands, épais, avec un halo net pour rester lisibles sur tout fond.
   (m.getStyle().layers||[]).filter(l=>l.type==='symbol'&&/country-label/.test(l.id)).forEach(l=>{
    m.setLayoutProperty(l.id,'text-field',['coalesce',['get','name_fr'],['get','name']]);
    m.setLayoutProperty(l.id,'text-size',['interpolate',['linear'],['zoom'],1,11,3,14,5,17,7,20]);
    m.setLayoutProperty(l.id,'text-font',['DIN Pro Bold','Arial Unicode MS Bold']);
    m.setLayoutProperty(l.id,'text-letter-spacing',.04);
    m.setPaintProperty(l.id,'text-color',C.label);m.setPaintProperty(l.id,'text-halo-color',C.halo);
    m.setPaintProperty(l.id,'text-halo-width',2);m.setPaintProperty(l.id,'text-halo-blur',.4);
    m.setPaintProperty(l.id,'text-opacity',1);
   });
   // Les libellés de pays passent au-dessus des voiles et contours ajoutés ensuite.
   const lift=()=>(m.getStyle().layers||[]).filter(l=>/country-label/.test(l.id)).forEach(l=>m.moveLayer(l.id));
   m.addSource('countries',{type:'vector',url:'mapbox://mapbox.country-boundaries-v1'});
   const worldview:any=['any',['==',['get','worldview'],'all'],['in','US',['get','worldview']]];
   m.addLayer({id:'land-tint',type:'fill',source:'countries','source-layer':'country_boundaries',filter:worldview,paint:{'fill-color':C.land??'#000','fill-opacity':C.landOpacity}});
   // Focus : quand une zone est choisie, le reste du monde s'assombrit.
   m.addLayer({id:'country-dim',type:'fill',source:'countries','source-layer':'country_boundaries',filter:['==',['get','iso_3166_1_alpha_3'],'__none__'],paint:{'fill-color':C.dim,'fill-opacity':0,'fill-opacity-transition':{duration:900,delay:150}}});
   m.addLayer({id:'country-fill',type:'fill',source:'countries','source-layer':'country_boundaries',filter:worldview,paint:{'fill-color':'#F0A04B','fill-opacity':['case',['boolean',['feature-state','hover'],false],.12,0],'fill-opacity-transition':{duration:180}}});
   m.addLayer({id:'country-line',type:'line',source:'countries','source-layer':'country_boundaries',filter:worldview,paint:{'line-color':C.border,'line-width':['interpolate',['linear'],['zoom'],2,.6,6,1.4]}});
   m.addLayer({id:'country-selected',type:'line',source:'countries','source-layer':'country_boundaries',filter:['==',['get','iso_3166_1_alpha_3'],''],paint:{'line-color':'#F0A04B','line-width':['interpolate',['linear'],['zoom'],2,2.4,8,4],'line-blur':.4}});
   m.addSource('provinces',{type:'geojson',data:'/api/map/provinces',promoteId:'name'});
   fetch('/api/map/provinces').then(r=>r.json()).then((fc:GeoJSON.FeatureCollection)=>{fc.features.forEach(f=>{const g=f.geometry as GeoJSON.Polygon|GeoJSON.MultiPolygon;
    const rings=g.type==='Polygon'?[g.coordinates[0]]:g.coordinates.map(p=>p[0]);const b=ringsBox(rings as number[][][]);if(b&&f.properties?.name)provBox.current[f.properties.name]=b;});}).catch(()=>{/* zoom par défaut */});
   m.addLayer({id:'province-fill',type:'fill',source:'provinces',paint:{'fill-color':'#4FBFAD','fill-opacity':['case',['boolean',['feature-state','hover'],false],.14,0]}});
   m.addLayer({id:'province-line',type:'line',source:'provinces',paint:{'line-color':C.province,'line-width':['interpolate',['linear'],['zoom'],4,1,8,2.2],'line-opacity':.9,'line-dasharray':[2,1.4]}});
   m.addLayer({id:'province-selected',type:'line',source:'provinces',filter:['==',['get','name'],''],paint:{'line-color':'#F0A04B','line-width':3.2}});
   m.addLayer({id:'province-label',type:'symbol',source:'provinces',minzoom:5,layout:{'text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],5,10,9,14],'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-letter-spacing':.05,'text-transform':'uppercase'},paint:{'text-color':C.label,'text-halo-color':C.halo,'text-halo-width':1.6}});
   lift();
   if(intro){m.easeTo({center:gabon?[11.5,-.6]:[18,6],zoom:gabon?5.2:1.55,duration:gabon?3200:2600,easing:EASE,essential:true});
    if(!gabon)m.once('moveend',()=>{spin.current=true;spinStep.current();});}
   m.on('idle',()=>{if(m.getZoom()<=2.6)CONTINENTS.forEach(c=>{if(!contCells.current[c.key])continentCells(m,c.key);});});
   m.addSource('fires',{type:'geojson',data:EMPTY});
   m.addLayer({id:'heat',type:'heatmap',source:'fires',layout:{visibility:'none'},paint:{
    'heatmap-weight':['interpolate',['linear'],['coalesce',['get','frp'],1],0,.2,100,1],
    'heatmap-intensity':['interpolate',['linear'],['zoom'],1,.7,9,2],'heatmap-radius':['interpolate',['linear'],['zoom'],1,4,5,10,9,20],'heatmap-opacity':.85,
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(255,231,168,0)',.15,'#FFE7A8',.35,'#FFC46B',.55,'#FF8A3D',.75,'#F2542D',1,'#C81D25']}});
   // Points lumineux : halo flou qui scintille (deux groupes en opposition de phase) + cœur net de 1,5 à 4 px.
   const glowR:any=['interpolate',['linear'],['zoom'],2,['interpolate',['linear'],['coalesce',['get','frp'],0],0,3,100,7],9,['interpolate',['linear'],['coalesce',['get','frp'],0],0,7,100,15]];
   m.addLayer({id:'glow-a',type:'circle',source:'fires',filter:['==',['get','phase'],0],paint:{'circle-color':HOT,'circle-radius':glowR,'circle-blur':1,'circle-opacity':.5}});
   m.addLayer({id:'glow-b',type:'circle',source:'fires',filter:['==',['get','phase'],1],paint:{'circle-color':HOT,'circle-radius':glowR,'circle-blur':1,'circle-opacity':.3}});
   m.addLayer({id:'core',type:'circle',source:'fires',maxzoom:8,paint:{'circle-color':HOT,'circle-radius':['interpolate',['linear'],['zoom'],2,1.4,7,2.6],'circle-stroke-width':.5,'circle-stroke-color':'rgba(255,250,235,.9)'}});
   SENSORS.forEach(s=>{if(!m.hasImage('sensor-'+s.code))m.addImage('sensor-'+s.code,shapeImage(s.shape,s.color),{pixelRatio:2})});
   if(!m.hasImage('sensor-static'))m.addImage('sensor-static',shapeImage('cross','#5B6661'),{pixelRatio:2});
   // Au zoom régional, chaque point prend la forme de son capteur (EF-07).
   m.addLayer({id:'points',type:'symbol',source:'fires',minzoom:8,layout:{'icon-image':['case',['==',['get','vegetation'],false],'sensor-static',['concat','sensor-',['get','satellite']]],'icon-allow-overlap':true,'icon-size':['interpolate',['linear'],['zoom'],8,.55,11,.9,14,1.2]}});
   const tip=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:12,className:'fw-tip',maxWidth:'270px'});
   // --- Alertes : zones (carreaux de 1°) et points, avec un effet par niveau de danger ---
   const RANK:any=['match',['get','rank'],1,'#FFD166',2,'#FF9F1C',3,'#FF4D3D','#FF1F4B'];
   m.addSource('alert-tiles',{type:'geojson',data:EMPTY});m.addSource('alert-pts',{type:'geojson',data:EMPTY});m.addSource('alert-focus',{type:'geojson',data:EMPTY});
   m.addLayer({id:'alert-tile-fill',type:'fill',source:'alert-tiles',paint:{'fill-color':RANK,'fill-opacity':['match',['get','rank'],1,.04,2,.12,3,.16,.22]}},'heat');
   m.addLayer({id:'alert-tile-lo',type:'line',source:'alert-tiles',filter:['==',['get','rank'],1],paint:{'line-color':RANK,'line-width':.8,'line-opacity':.55,'line-dasharray':[2,2]}},'heat');
   m.addLayer({id:'alert-tile-line',type:'line',source:'alert-tiles',filter:['>=',['get','rank'],2],paint:{'line-color':RANK,'line-width':['match',['get','rank'],2,1.2,3,1.8,2.6],'line-opacity':.9}},'heat');
   m.addLayer({id:'alert-pt-lo',type:'circle',source:'alert-pts',filter:['<=',['get','rank'],2],paint:{'circle-color':RANK,'circle-radius':['interpolate',['linear'],['zoom'],2,['match',['get','rank'],1,1.2,2],8,['match',['get','rank'],1,3,5]],
    'circle-opacity':['match',['get','rank'],1,.55,.8],'circle-stroke-width':['match',['get','rank'],1,0,.6],'circle-stroke-color':'rgba(255,240,220,.8)'}});
   const aGlow=(k:number):any=>['interpolate',['linear'],['zoom'],2,['*',k,['interpolate',['linear'],['get','frp'],0,3,300,6]],8,['*',k,['interpolate',['linear'],['get','frp'],0,8,300,16]]];
   m.addLayer({id:'alert-pt-hi',type:'circle',source:'alert-pts',filter:['==',['get','rank'],3],paint:{'circle-color':'#FF4D3D','circle-radius':aGlow(1),'circle-blur':.9,'circle-opacity':.7}});
   m.addLayer({id:'alert-pt-crit',type:'circle',source:'alert-pts',filter:['==',['get','rank'],4],paint:{'circle-color':'#FF1F4B','circle-radius':aGlow(1.35),'circle-blur':.85,'circle-opacity':.8}});
   m.addLayer({id:'alert-pt-core',type:'circle',source:'alert-pts',filter:['>=',['get','rank'],3],paint:{'circle-color':'#FFE3DE','circle-radius':['interpolate',['linear'],['zoom'],2,1.1,8,2.6],'circle-stroke-width':.8,'circle-stroke-color':RANK}});
   m.addLayer({id:'alert-focus-line',type:'line',source:'alert-focus',paint:{'line-color':RANK,'line-width':3.2,'line-blur':.4}});
   let araf=0,alast=0,astill=false;
   const atick=(t:number)=>{
    if(t-alast>55&&m.getLayer('alert-pt-hi')){alast=t;
     if(fxRef.current){astill=false;
      // Élevé : clignotement régulier ; critique : plus rapide et plus marqué, la zone respire aussi.
      const hi=.25+.65*Math.abs(Math.sin(t/520)),cr=.3+.7*Math.abs(Math.sin(t/260));
      m.setPaintProperty('alert-pt-hi','circle-opacity',hi);m.setPaintProperty('alert-pt-crit','circle-opacity',cr);
      m.setPaintProperty('alert-pt-crit','circle-blur',.55+.5*Math.abs(Math.sin(t/260)));
      m.setPaintProperty('alert-tile-fill','fill-opacity',['match',['get','rank'],1,.04,2,.12,3,.12+.08*Math.abs(Math.sin(t/520)),.14+.16*Math.abs(Math.sin(t/260))]);
     }else if(!astill){astill=true;
      m.setPaintProperty('alert-pt-hi','circle-opacity',.75);m.setPaintProperty('alert-pt-crit','circle-opacity',.85);m.setPaintProperty('alert-pt-crit','circle-blur',.85);
      m.setPaintProperty('alert-tile-fill','fill-opacity',['match',['get','rank'],1,.04,2,.12,3,.16,.22]);}}
    araf=requestAnimationFrame(atick);};
   araf=requestAnimationFrame(atick);m.once('remove',()=>cancelAnimationFrame(araf));
   const fmtA=(v:number,d=0)=>v.toLocaleString('fr-FR',{maximumFractionDigits:d});
   m.on('mousemove','alert-tile-fill',e=>{const id=e.features?.[0]?.properties?.id as string;const a=alertsRef.current[id];if(!a)return;
    if(m.queryRenderedFeatures(e.point,{layers:['core','points','alert-pt-core']}).length)return;
    tip.setLngLat(e.lngLat).setHTML(`<b class="tip-alert is-${a.level}">Alerte ${levelOf(a.level).label.toLowerCase()}</b><span>${fmtA(a.cells)} cellules actives · pic ${fmtA(a.max_frp,1)} MW</span><span>${fmtA(a.detections)} détections sur 24 h</span><em>Cliquez pour l’analyse de la zone</em>`).addTo(m);});
   m.on('mouseleave','alert-tile-fill',()=>tip.remove());
   const calm=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.reduceMotion==='true';
   if(!calm){let last=0;const tick=(t:number)=>{if(t-last>90){last=t;const a=.5+.5*Math.sin(t/420);
     if(m.getLayer('glow-a')){m.setPaintProperty('glow-a','circle-opacity',.2+.5*a);m.setPaintProperty('glow-b','circle-opacity',.2+.5*(1-a));}}
     raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}
   const fmt=(v:unknown,d=0)=>v==null||v===''?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
   const utc=(v?:string)=>v?new Date(v).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';
   const showTip=(e:any)=>{if(inspectRef.current)return;const p:any=e.features?.[0]?.properties;if(!p)return;m.getCanvas().style.cursor='pointer';const s=SENSORS.find(x=>x.code===p.satellite);
    tip.setLngLat(e.lngLat).setHTML(`<b>${s?s.label:'Détection'}</b><span>${utc(p.time)} · ${p.daynight==='D'?'jour':'nuit'}</span><span>Puissance : <strong>${fmt(p.frp,1)} MW</strong> · confiance ${({low:'faible',nominal:'nominale',high:'haute'} as any)[p.confidence]??'—'}</span>${p.vegetation===false||p.vegetation==='false'?'<span>Source non végétale</span>':''}<em>Cliquez pour la fiche complète</em>`).addTo(m);};
   ['core','points'].forEach(l=>{m.on('mousemove',l,showTip);m.on('mouseleave',l,()=>{m.getCanvas().style.cursor='';tip.remove();});
    m.on('click',l,e=>{if(inspectRef.current)return;const id=e.features?.[0]?.properties?.id;if(id)selection.current?.(id)});});
   // Inspecteur : le tableau suit le curseur (données demandées après une courte pause), un clic l'épingle.
   m.on('mousemove',e=>{if(!inspectRef.current||probeRef.current?.pinned)return;probeAtRef.current(e.point.x,e.point.y,e.lngLat.lng,e.lngLat.lat,false);});
   m.on('move',()=>{const p=probeRef.current;if(p?.pinned){const q=m.project([p.lon,p.lat]);setProbe(o=>o&&{...o,x:q.x,y:q.y});}});
   // Survol : provinces puis pays.
   let hovC:string|number|undefined,hovP:string|number|undefined;
   m.on('mousemove','country-fill',e=>{const f=e.features?.[0];if(!f||f.id===undefined||f.id===hovC)return;if(hovC!==undefined)m.setFeatureState({source:'countries',sourceLayer:'country_boundaries',id:hovC},{hover:false});hovC=f.id;m.setFeatureState({source:'countries',sourceLayer:'country_boundaries',id:hovC},{hover:true});});
   m.on('mouseleave','country-fill',()=>{if(hovC!==undefined)m.setFeatureState({source:'countries',sourceLayer:'country_boundaries',id:hovC},{hover:false});hovC=undefined;});
   m.on('mousemove','province-fill',e=>{const f=e.features?.[0];if(!f||f.id===undefined||f.id===hovP)return;if(hovP!==undefined)m.setFeatureState({source:'provinces',id:hovP},{hover:false});hovP=f.id;m.setFeatureState({source:'provinces',id:hovP},{hover:true});});
   m.on('mouseleave','province-fill',()=>{if(hovP!==undefined)m.setFeatureState({source:'provinces',id:hovP},{hover:false});hovP=undefined;});
   // Clic : un point -> sa fiche ; une province -> sa fenêtre ; sinon le pays.
   m.on('click',e=>{
    if(inspectRef.current){probeAtRef.current(e.point.x,e.point.y,e.lngLat.lng,e.lngLat.lat,true);return;}
    const live=['core','points'].filter(l=>m.getLayer(l)&&m.getLayoutProperty(l,'visibility')!=='none');
    if(live.length&&m.queryRenderedFeatures(e.point,{layers:live}).length)return;
    const prov=m.getLayoutProperty('province-fill','visibility')!=='none'?m.queryRenderedFeatures(e.point,{layers:['province-fill']})[0]:undefined;
    if(prov){const name=prov.properties?.name as string,iso=prov.properties?.iso as string;
     m.setFilter('province-selected',['==',['get','name'],name]);m.setFilter('country-selected',['==',['get','iso_3166_1_alpha_3'],'']);
     openZone.current({kind:'province',iso,name});
     const pb=provBox.current[name]??ringsBox(((prov.geometry as GeoJSON.Polygon).coordinates??[]) as number[][][]);if(pb)zoomTo.current(pb,'province','province-selected');return;}
    const c=m.queryRenderedFeatures(e.point,{layers:['country-fill']})[0];if(!c)return;
    const iso=c.properties?.iso_3166_1_alpha_3 as string;if(!iso)return;
    // Nom du pays en français (Intl), à défaut celui fourni par les tuiles.
    let name=(c.properties?.name_fr||c.properties?.name_en||c.properties?.name||iso) as string;
    try{const a2=c.properties?.iso_3166_1 as string;const fr=a2&&new Intl.DisplayNames(['fr'],{type:'region'}).of(a2);if(fr)name=fr;}catch{/* nom d'origine */}
    const polygons:number[][][]=[];
    m.querySourceFeatures('countries',{sourceLayer:'country_boundaries',filter:['==',['get','iso_3166_1_alpha_3'],iso]}).forEach(f=>{
     const g=f.geometry as GeoJSON.Polygon|GeoJSON.MultiPolygon;
     const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
     rings.forEach(r=>{const step=Math.max(1,Math.ceil(r.length/1500));polygons.push(r.filter((_,i)=>i%step===0).map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]));});
    });
    if(!polygons.length)return;
    m.setFilter('country-selected',['==',['get','iso_3166_1_alpha_3'],iso]);m.setFilter('province-selected',['==',['get','name'],'']);
    openZone.current({kind:'country',iso,name,name_en:(c.properties?.name_en||name) as string,polygons:polygons.slice(0,400)});
    const cb=ringsBox(polygons);if(cb)zoomTo.current(cb,'country','country-selected');
   });
   setReady(true);
  });return()=>{cancelAnimationFrame(raf);m.remove();map.current=null;};
 },[gabon,basemap]);
 // Changement de vue : courte transition en fondu, la caméra reste en place.
 useEffect(()=>{const m=map.current;if(!ready||!m)return;const cur=(m.getProjection()?.name)??'mercator';if(cur===projection)return;
  const el=m.getCanvasContainer();if(calmMotion()){m.setProjection(projection);return;}
  el.style.transition='opacity 180ms ease';el.style.opacity='0';
  const t=setTimeout(()=>{m.setProjection(projection);if(projection==='globe'&&m.getZoom()<3&&!zoneRef.current){spin.current=true;spinStep.current();}else spin.current=false;
   requestAnimationFrame(()=>{el.style.opacity='1';});},180);return()=>clearTimeout(t);},[ready,projection]);
 useEffect(()=>{if(ready&&map.current){(map.current.getSource('fires') as mapboxgl.GeoJSONSource)?.setData(source?geo:EMPTY);}},[ready,geo,source]);
 useEffect(()=>{const m=map.current;if(!ready||!m)return;
  const vis=(id:string,on:boolean)=>{if(m.getLayer(id))m.setLayoutProperty(id,'visibility',on?'visible':'none');};
  vis('heat',display==='heat');['glow-a','glow-b','core','points'].forEach(id=>vis(id,display!=='heat'));
  const color=display==='sensors'?SENSOR_COLOR:HOT;['glow-a','glow-b','core'].forEach(id=>{if(m.getLayer(id))m.setPaintProperty(id,'circle-color',color);});
 },[ready,display]);
 useEffect(()=>{const m=map.current;if(!ready||!m)return;['province-fill','province-line','province-label','province-selected'].forEach(id=>{if(m.getLayer(id))m.setLayoutProperty(id,'visibility',showProvinces?'visible':'none');});},[ready,showProvinces]);
 useEffect(()=>{const m=map.current;if(!ready||!m||!m.getLayer('country-dim'))return;
  // Le reste du monde s'assombrit progressivement, et s'éclaire de même à la fermeture.
  if(continent){m.setFilter('country-dim',['!=',['get','region'],continent]);m.setPaintProperty('country-dim','fill-opacity',.5);return;}
  if(focusIso){m.setFilter('country-dim',['!=',['get','iso_3166_1_alpha_3'],focusIso]);m.setPaintProperty('country-dim','fill-opacity',.55);return;}
  m.setPaintProperty('country-dim','fill-opacity',0);
  const t=setTimeout(()=>{if(m.getLayer('country-dim'))m.setFilter('country-dim',['==',['get','iso_3166_1_alpha_3'],'__none__']);},1100);return()=>clearTimeout(t);},[ready,focusIso,continent]);
 useEffect(()=>{const m=map.current;if(!ready||!m||!m.getSource('alert-tiles'))return;
  const list=alerts?.alerts??[];alertsRef.current=Object.fromEntries(list.map(a=>[a.id,a]));
  if(!list.length)(m.getSource('alert-focus') as mapboxgl.GeoJSONSource)?.setData(EMPTY);
  (m.getSource('alert-tiles') as mapboxgl.GeoJSONSource).setData({type:'FeatureCollection',features:list.map(a=>{const [w,s2,e,n]=a.bbox;
   return {type:'Feature',properties:{id:a.id,rank:a.rank},geometry:{type:'Polygon',coordinates:[[[w,s2],[e,s2],[e,n],[w,n],[w,s2]]]}};})});
  (m.getSource('alert-pts') as mapboxgl.GeoJSONSource).setData({type:'FeatureCollection',features:(alerts?.points?.rows??[]).map(([lon,lat,frp,rank])=>({type:'Feature',properties:{frp,rank},geometry:{type:'Point',coordinates:[lon,lat]}}))});
  // Nom du pays de chaque alerte (frontières Mapbox, en français), quand le point est à l'écran.
  if(onAlertNames&&list.length){const name=()=>{const out:Record<string,string>={};const W=m.getCanvas().clientWidth,H=m.getCanvas().clientHeight;
    list.forEach(a=>{const p=m.project([a.lon,a.lat]);if(p.x<0||p.y<0||p.x>W||p.y>H)return;const f=m.queryRenderedFeatures(p,{layers:['country-fill']})[0];if(!f)return;
     let n=(f.properties?.name_fr||f.properties?.name) as string;try{const a2=f.properties?.iso_3166_1 as string;const t=a2&&new Intl.DisplayNames(['fr'],{type:'region'}).of(a2);if(t)n=t;}catch{/* nom d'origine */}if(n)out[a.id]=n;});
    onAlertNames(out);};
   if(m.areTilesLoaded())name();else m.once('idle',name);}
 },[ready,alerts]);
 useEffect(()=>{const m=map.current;if(!ready||!m||!alertFocus)return;const a=alertFocus.alert;const [w,s2,e,n]=a.bbox;
  (m.getSource('alert-focus') as mapboxgl.GeoJSONSource)?.setData({type:'FeatureCollection',features:[{type:'Feature',properties:{rank:a.rank},geometry:{type:'Polygon',coordinates:[[[w,s2],[e,s2],[e,n],[w,n],[w,s2]]]}}]});
  // Zone en alerte : on cadre le carreau et ses abords immédiats pour situer le danger.
  zoomTo.current([w-.35,s2-.35,e+.35,n+.35],'province','alert-focus-line');
 },[ready,alertFocus?.k]);
 const fly=(center:[number,number],zoom:number)=>{const m=map.current;if(!m)return;before.current=null;spin.current=false;if(calmMotion())m.jumpTo({center,zoom});else m.flyTo({center,zoom,bearing:0,pitch:0,curve:1.5,speed:1.1,duration:1900,easing:EASE,essential:true});};
 /** Retour au globe entier : la zone se ferme, la carte se rebombe et reprend sa rotation. */
 const world=()=>{closeZone(false);setAllPointsState(false);const m=map.current;if(!m)return;if(calmMotion()){m.jumpTo({center:[18,6],zoom:1.55});return;}
  m.flyTo({center:[18,6],zoom:1.55,bearing:0,pitch:0,curve:1.4,speed:1.2,duration:2000,easing:EASE,essential:true});m.once('moveend',()=>{spin.current=true;spinStep.current();});};
 /** Continent : contours de ses pays, maillage 0,5° pour les points, cadrage sur sa partie terrestre. */
 const openContinent=async(c:typeof CONTINENTS[number])=>{const m=map.current;if(!m)return;spin.current=false;
  let cells=contCells.current[c.key]??continentCells(m,c.key);
  if(!cells.length){await new Promise(r=>{const t=setTimeout(r,3000);m.once('idle',()=>{clearTimeout(t);r(null);});});cells=continentCells(m,c.key);}
  if(!cells.length)return;
  m.setFilter('country-selected',['==',['get','region'],c.key]);m.setFilter('province-selected',['==',['get','name'],'']);
  setAllPointsState(false);setZonePeriod({});setZone({kind:'continent',name:c.label,cells});
  zoomTo.current(c.box,'continent','country-selected');};
 /** Inspecteur : demande les chiffres autour du curseur (rayon ≈ 28 px à l'écran), avec un petit cache. */
 const probeCache=useRef(new Map<string,Probe>());const probeTimer=useRef(0);const probeAbort=useRef<AbortController|null>(null);
 const filtersRef=useRef<Record<string,string>>({});filtersRef.current={...filters,...(zonePeriod.start?{start_date:zonePeriod.start}:{}),...(zonePeriod.end?{end_date:zonePeriod.end}:{}),...(sensor?{sensor}:{})};
 function probeAt(x:number,y:number,lon:number,lat:number,pinned:boolean){const m=map.current;if(!m)return;
  const kmPx=40075*Math.cos(lat*Math.PI/180)/(512*2**m.getZoom());const r=Math.max(.5,Math.min(300,+(28*kmPx).toPrecision(2)));
  const p=new URLSearchParams({lon:lon.toFixed(3),lat:lat.toFixed(3),radius_km:String(r)});
  Object.entries(filtersRef.current).forEach(([k,v])=>{if(v&&['start_date','end_date','sensor','satellite','confidence'].includes(k))p.set(k,v);});
  const key=p.toString(),hit=probeCache.current.get(key);
  setProbe(o=>({x,y,lon,lat,pinned,data:hit??(o&&!o.error?o.data:undefined),loading:!hit}));
  clearTimeout(probeTimer.current);if(hit)return;
  probeTimer.current=window.setTimeout(()=>{probeAbort.current?.abort();const ac=new AbortController();probeAbort.current=ac;
   fetch('/api/map/probe?'+key,{signal:ac.signal}).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.json();}).then((d:Probe)=>{
    probeCache.current.set(key,d);if(probeCache.current.size>200)probeCache.current.delete(probeCache.current.keys().next().value!);
    setProbe(o=>o&&Math.abs(o.lon-lon)<1e-9&&Math.abs(o.lat-lat)<1e-9?{...o,data:d,loading:false}:o);})
   .catch(e=>{if(e.name!=='AbortError')setProbe(o=>o&&{...o,loading:false,error:true});});},pinned?0:170);}
 const probeAtRef=useRef(probeAt);probeAtRef.current=probeAt;
 useEffect(()=>{if(!inspect){setProbe(null);probeAbort.current?.abort();clearTimeout(probeTimer.current);}
  const c=map.current?.getCanvas();if(c)c.style.cursor=inspect?'crosshair':'';},[inspect]);
 useEffect(()=>{if(!inspect)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(probeRef.current?.pinned)setProbe(null);else setInspect(false);}};addEventListener('keydown',k);return()=>removeEventListener('keydown',k);},[inspect]);
 useEffect(()=>{if(ready&&focus)fly(focus.center,focus.zoom);},[ready,focus?.k]);
 useEffect(()=>{const refit=()=>{const m=map.current,l=last.current;if(!m||!l||m.isMoving()||!document.querySelector('.cwin'))return;
   const cam=m.cameraForBounds([[l.b[0],l.b[1]],[l.b[2],l.b[3]]],{padding:framePadding(m.getContainer().getBoundingClientRect()),maxZoom:l.kind==='province'?8.6:7.4});
   if(cam){if(calmMotion())m.jumpTo(cam);else m.easeTo({...cam,duration:700,easing:EASE});}};
  addEventListener('fw:cwin-layout',refit);return()=>removeEventListener('fw:cwin-layout',refit);},[]);
 // --- Commandes vocales de la carte : localiser un lieu, changer l'affichage, exporter ---
 const zoneRef=useRef(zone);zoneRef.current=zone;const geoRef=useRef(geo);geoRef.current=geo;
 useEffect(()=>{const m=map.current;if(!ready||!m)return;
  const fold=(t:string)=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isoByName=(q:string)=>{const f=fold(q);if(!f)return undefined;let near:string|undefined;
   let fr:Intl.DisplayNames,en:Intl.DisplayNames;try{fr=new Intl.DisplayNames(['fr'],{type:'region'});en=new Intl.DisplayNames(['en'],{type:'region'});}catch{return undefined;}
   for(let a=65;a<91;a++)for(let b=65;b<91;b++){const c=String.fromCharCode(a,b);let n1='',n2='';try{n1=fr.of(c)??'';n2=en.of(c)??'';}catch{continue;}
    if(!n1||n1===c)continue;const F=[fold(n1),fold(n2)];if(F.includes(f))return c;if(!near&&f.length>3&&F.some(x=>x.startsWith(f)))near=c;}
   return near;};
  const save=(href:string,name:string)=>{const a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();};
  ctl.map={
   zoneName:()=>zoneRef.current?.name,
   locatePlace:async(name:string):Promise<Result>=>{
    const f=fold(name);
    const prov=Object.keys(provBox.current).find(n=>fold(n)===f)??Object.keys(provBox.current).find(n=>f.length>3&&(fold(n).includes(f)||f.includes(fold(n))));
    if(prov){m.setFilter('province-selected',['==',['get','name'],prov]);m.setFilter('country-selected',['==',['get','iso_3166_1_alpha_3'],'']);
     openZone.current({kind:'province',iso:'GAB',name:prov});zoomTo.current(provBox.current[prov],'province','province-selected');
     return {ok:true,message:`Province ${prov} (Gabon) : carte centrée, fenêtre de données ouverte.`};}
    const a2=isoByName(name);if(!a2)return {ok:false,message:`Lieu « ${name} » introuvable : donnez un pays ou une province du Gabon.`};
    const q=()=>m.querySourceFeatures('countries',{sourceLayer:'country_boundaries',filter:['==',['get','iso_3166_1'],a2]});
    let feats=q();
    if(!feats.length){m.jumpTo({center:[15,5],zoom:1.1});await new Promise(r=>{const t=setTimeout(r,4000);m.once('idle',()=>{clearTimeout(t);r(null);});});feats=q();}
    if(!feats.length)return {ok:false,message:`Le pays ${name} n'est pas chargé sur la carte pour l'instant.`};
    const iso=feats[0].properties?.iso_3166_1_alpha_3 as string;
    let label=name;try{label=new Intl.DisplayNames(['fr'],{type:'region'}).of(a2)??name;}catch{/* nom donné */}
    const polygons:number[][][]=[];
    feats.forEach(ft=>{const g=ft.geometry as GeoJSON.Polygon|GeoJSON.MultiPolygon;const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(pp=>pp[0]):[];
     rings.forEach(r=>{const step=Math.max(1,Math.ceil(r.length/1500));polygons.push(r.filter((_,i)=>i%step===0).map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]));});});
    const box=ringsBox(polygons);if(!box)return {ok:false,message:`Géométrie de ${label} indisponible.`};
    m.setFilter('country-selected',['==',['get','iso_3166_1_alpha_3'],iso]);m.setFilter('province-selected',['==',['get','name'],'']);
    openZone.current({kind:'country',iso,name:label,name_en:(feats[0].properties?.name_en||label) as string,polygons:polygons.slice(0,400)});
    zoomTo.current(box,'country','country-selected');
    return {ok:true,message:`${label} : carte centrée sur le pays, fenêtre de données ouverte.`};
   },
   setDisplay:({basemap:b,display:d,all_points:ap}):Result=>{const done:string[]=[];
    if(b&&b in BASEMAPS){setBasemap(b as Basemap);done.push(`fond ${BASEMAPS[b as Basemap].label}`);}
    if(d&&['points','heat','sensors'].includes(d)){setDisplay(d as Display);done.push(`représentation ${({points:'lumineuse',heat:'chaleur',sensors:'par capteur'} as any)[d]}`);}
    if(typeof ap==='boolean'){setAllPointsState(ap);done.push(ap?'tous les points affichés':'points masqués hors zone');}
    return done.length?{ok:true,message:`Carte : ${done.join(', ')}.`}:{ok:false,message:'Aucun réglage d’affichage reconnu.'};},
   exportFile:async(kind):Promise<Result>=>{
    const stamp=new Date().toISOString().slice(0,10);
    if(kind==='image'){try{save(m.getCanvas().toDataURL('image/png'),`firewatch-carte-${stamp}.png`);return {ok:true,message:'Image de la carte téléchargée.'};}catch{return {ok:false,message:'Capture de la carte impossible.'};}}
    const g=geoRef.current;if(!g.features.length)return {ok:false,message:'Aucun point affiché à exporter : choisissez une zone ou affichez tous les points.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(g)],{type:'application/geo+json'}));save(url,`firewatch-points-${stamp}.geojson`);setTimeout(()=>URL.revokeObjectURL(url),2000);
    return {ok:true,message:`${g.features.length.toLocaleString('fr-FR')} points exportés en GeoJSON.`};},
  };
  return()=>{ctl.map={};};
 },[ready]);
 // Capture de la carte : le tampon WebGL est conservé (preserveDrawingBuffer) pour pouvoir être lu à tout moment.
 const snapshot=async()=>{const m=map.current;if(!m)throw new Error('carte absente');return m.getCanvas().toDataURL('image/png');};
 function closeZone(back=true){setZone(null);last.current=null;const m=map.current;const b=before.current;before.current=null;
  if(m&&b&&back){if(calmMotion())m.jumpTo(b);else m.flyTo({...b,curve:1.4,speed:1.2,duration:1500,easing:EASE,essential:true});}if(m?.getLayer('country-selected')){m.setFilter('country-selected',['==',['get','iso_3166_1_alpha_3'],'']);m.setFilter('province-selected',['==',['get','name'],'']);}}
 const d=source?.data;
 const status=error?error:!source?null:source.isError?'Chargement des points impossible. Réessayez.':source.isFetching&&!d?'Chargement des points…':d?`${d.shown.toLocaleString('fr-FR')} point${d.shown>1?'s':''}${d.partial?` sur ${d.total.toLocaleString('fr-FR')} (les plus intenses)`:''}${zone?` · ${zone.name}`:' · toute la vue'}${source.isFetching?' · mise à jour…':''}`:null;
 return <div className="map" style={{height:'100%',minHeight:380}}>
  <div ref={container} style={{position:'absolute',inset:0}}/>
  <div className="map__ctrl map__ctrl--tl"><div className="map__views" role="group" aria-label="Vues de la carte">
   <button type="button" onClick={world} aria-pressed={!zone&&!allPoints}><Icon name="globe" size={14}/>Monde</button>
   <ContinentMenu current={zone?.kind==='continent'?zone.name:undefined} onPick={openContinent}/>
   <button type="button" onClick={()=>ctl.map.locatePlace?.('Gabon')} aria-pressed={zone?.name==='Gabon'}>Gabon</button>
   <span className="map__views-sep" aria-hidden="true"/>
   <button type="button" className="map__views-all" aria-pressed={allPoints&&!zone} onClick={()=>{if(allPoints&&!zone){setAllPointsState(false);return;}if(zone)closeZone(false);setAllPointsState(true);}}
    title="Afficher tous les points chauds de la vue (les plus intenses au-delà de 60 000)"><Icon name="eye" size={14}/>Tout voir</button>
   <button type="button" className="map__views-probe" aria-pressed={inspect} onClick={()=>setInspect(v=>!v)}
    title="Inspecter : un tableau MODIS / VIIRS / harmonisé suit le curseur ; cliquez pour l’épingler (Échap pour fermer)"><Icon name="table" size={14}/>Inspecter</button>
  </div></div>
  <MapDisplayControl projection={projection} onProjection={setProjection} basemap={basemap} display={display} allPoints={allPoints} provinces={showProvinces}
   onBasemap={setBasemap} onDisplay={setDisplay} onAllPoints={setAllPointsState} onProvinces={setShowProvinces}
   extra={exportTools?<MapExports query={query} sensor={sensor} geo={geo} zone={zone?.name} snapshot={snapshot}/>:undefined}/>
  {!source&&!error&&!inspect&&<div className="map-hint" role="status"><b>Choisissez une zone</b><span>Cliquez un pays ou une province, ou choisissez un continent : la carte s’y pose et ses points chauds apparaissent. « Tout voir » affiche tous les points.</span></div>}
  {probe&&<ProbeTable p={probe} onClose={()=>setProbe(null)}/>}
  {inspect&&!probe&&<div className="map-hint is-probe" role="status"><b>Inspecteur actif</b><span>Survolez la carte : les chiffres de chaque capteur et de l’harmonisation suivent le curseur. Cliquez pour épingler, Échap pour quitter.</span></div>}
  {zone&&<ZoneWindow zone={zone} query={query} sensor={sensor} onClose={closeZone} onPeriod={(start,end)=>setZonePeriod({start,end})}/>}
  <div className="map-note" role="status">{status??'Aucun point affiché'}<br/>{d&&d.shown?<>Survolez un point pour ses chiffres, cliquez pour sa fiche · </>:null}<b>Détection thermique ≠ incendie confirmé</b></div>
 </div>;
}

/** Exports de la carte (dans « Affichage ») : image PNG, points affichés en GeoJSON, données harmonisées en CSV. */
function MapExports({query,sensor,geo,zone,snapshot}:{query:string;sensor:string;geo:GeoJSON.FeatureCollection;zone?:string;snapshot:()=>Promise<string>}){
 const q=new URLSearchParams(query);if(sensor)q.set('sensor',sensor);const qs=q.toString();
 const summary=useQuery<any>({queryKey:['summary',query,''],queryFn:()=>get('/statistics/summary',query)});
 const total=summary.data?.total_detections as number|undefined, tooMany=(total??0)>200000;
 const stamp=new Date().toISOString().slice(0,10), slug=(zone||'carte').normalize('NFD').replace(/[^\w]+/g,'-').toLowerCase();
 const save=(href:string,name:string)=>{const a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();};
 const [msg,setMsg]=useState('');
 const png=async()=>{try{save(await snapshot(),`firewatch-${slug}-${stamp}.png`);setMsg('Image enregistrée.');}catch{setMsg('Capture impossible : le fond Mapbox bloque l’export d’image.');}};
 const json=()=>{if(!geo.features.length){setMsg('Aucun point affiché : choisissez une zone ou activez « tous les points ».');return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(geo)],{type:'application/geo+json'}));save(url,`firewatch-points-${slug}-${stamp}.geojson`);setTimeout(()=>URL.revokeObjectURL(url),2000);setMsg(`${geo.features.length.toLocaleString('fr-FR')} points exportés.`);};
 return <div className="map-export">
  <span className="map-display__label">Exporter</span>
  <div className="map-export__grid">
   <button type="button" className="map-export__btn" onClick={png}><Icon name="image" size={16}/><span><b>Image</b><small>PNG de la vue</small></span></button>
   <button type="button" className="map-export__btn" onClick={json}><Icon name="json" size={16}/><span><b>Points</b><small>GeoJSON affiché</small></span></button>
   {tooMany||!total?<span className="map-export__btn is-off" aria-disabled="true"><Icon name="download" size={16}/><span><b>Données</b><small>{total===0?'aucune détection':tooMany?'plus de 200 000 lignes':'calcul…'}</small></span></span>
    :<a className="map-export__btn" href={'/api/export/csv'+(qs?'?'+qs:'')} download><Icon name="download" size={16}/><span><b>Données</b><small>CSV · {total.toLocaleString('fr-FR')} lignes</small></span></a>}
  </div>
  <p className="map-display__hint" role="status">{msg||(tooMany?'Pour le CSV, réduisez la période (Chronologie) ou les capteurs.':'Le CSV reprend la sélection en cours : période, capteurs, filtres.')}</p>
 </div>;
}

/** Menu des continents : un clic pose la carte sur le continent et affiche ses points. */
function ContinentMenu({current,onPick}:{current?:string;onPick:(c:typeof CONTINENTS[number])=>void}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const off=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  addEventListener('mousedown',off);addEventListener('keydown',k);return()=>{removeEventListener('mousedown',off);removeEventListener('keydown',k);};},[open]);
 return <div className="map__continents" ref={ref}>
  <button type="button" aria-haspopup="menu" aria-expanded={open} aria-pressed={!!current} onClick={()=>setOpen(v=>!v)}>{current??'Continents'}<Icon name="chevronDown" size={13}/></button>
  {open&&<div className="map__continents-menu" role="menu">{CONTINENTS.map(c=><button key={c.key} type="button" role="menuitemradio" aria-checked={current===c.label} onClick={()=>{setOpen(false);onPick(c);}}>{c.label}</button>)}</div>}
 </div>;
}

/** Tableau de l'inspecteur : données brutes de chaque capteur, puis ce qu'en retient l'harmonisation. */
function ProbeTable({p,onClose}:{p:{x:number;y:number;pinned:boolean;data?:Probe;loading:boolean;error?:boolean};onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);const [size,setSize]=useState({w:300,h:260});
 useEffect(()=>{const el=ref.current;if(el){const r=el.getBoundingClientRect();if(Math.abs(r.width-size.w)>2||Math.abs(r.height-size.h)>2)setSize({w:r.width,h:r.height});}});
 const host=ref.current?.parentElement?.getBoundingClientRect();const W=host?.width??innerWidth,H=host?.height??innerHeight;
 const left=p.x+18+size.w>W-8?Math.max(8,p.x-18-size.w):p.x+18,top=Math.max(8,Math.min(H-size.h-8,p.y+18));
 const n=(v:number|null|undefined,d=0)=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
 const d=p.data,M=d?.sensors.MODIS,V=d?.sensors.VIIRS,empty=d&&!M&&!V;
 const rows:[string,(s:any)=>string,string?][]=[
  ['Détections reçues',s=>n(s?.raw)],['NRT remplacées par la SP',s=>n(s?.superseded),'Version scientifique préférée au temps réel'],
  ['Sources non végétales',s=>n(s?.non_vegetation),'Industries, volcans, torchères : écartées'],
  ['Retenues',s=>n(s?.kept)],['Cellules 1 km',s=>n(s?.cells)],['Rapprochées MODIS–VIIRS',s=>n(s?.linked)],
  ['Confiance haute',s=>s?.kept?`${n(s.high)} · ${Math.round(100*s.high/s.kept)} %`:'—'],['Puissance max',s=>s?.max_frp!=null?`${n(s.max_frp,1)} MW`:'—'],
 ];
 return <div ref={ref} className={`probe${p.pinned?' is-pinned':''}`} style={{left,top}} role={p.pinned?'dialog':'status'} aria-label="Données au point inspecté">
  <div className="probe__head"><b>{p.pinned?'Point épinglé':'Sous le curseur'}</b><span>{d?`rayon ${n(d.radius_km,1)} km`:''}{p.loading?' · calcul…':''}</span>
   {p.pinned&&<button type="button" onClick={onClose} aria-label="Fermer le tableau"><Icon name="x" size={14}/></button>}</div>
  {p.error?<p className="probe__msg">Données indisponibles : serveur injoignable.</p>:!d?<p className="probe__msg">Calcul…</p>:empty?<p className="probe__msg">Aucune détection dans ce rayon sur la période.</p>:<>
   <table><thead><tr><th/><th className="is-m">MODIS</th><th className="is-v">VIIRS</th></tr></thead>
    <tbody>{rows.map(([l,f,t])=><tr key={l} title={t}><th>{l}</th><td>{f(M)}</td><td>{f(V)}</td></tr>)}</tbody></table>
   <div className="probe__harmo"><span><Icon name="merge" size={13}/>Harmonisé</span><b>{n(d.harmonized.detections)}</b> détections · <b>{n(d.harmonized.cells)}</b> cellules · <b>{n(d.harmonized.groups)}</b> rapprochements</div>
  </>}
 </div>;
}
