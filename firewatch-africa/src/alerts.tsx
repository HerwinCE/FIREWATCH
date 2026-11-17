/* Alertes thermiques : niveaux, centre d'alertes, bandeau, voile critique.
   Elles peuvent être coupées entièrement (Paramètres) ; leurs effets visuels, séparément. */
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Icon} from '../components/src/components/Icon';
import {useSettings} from '../components/src/state/settings';

export type Level='faible'|'modere'|'eleve'|'critique';
export type Alert={id:string;level:Level;label:string;rank:number;lon:number;lat:number;bbox:[number,number,number,number];cells:number;detections:number;max_frp:number;total_frp:number;modis:number;viirs:number;last_seen:string;province:string|null};
export type AlertData={window:{from:string;to:string;hours:number}|null;scope:string;counts:Record<Level,number>;total:number;top:Level|null;alerts:Alert[];points:{fields:string[];rows:number[][]};rules:Record<Level,{cells:number;frp:number|null}>};

export const LEVELS:{key:Level;label:string;color:string;icon:string;hint:string}[]=[
 {key:'faible',label:'Faible',color:'#FFD166',icon:'info',hint:'Signalement discret : activité à surveiller.'},
 {key:'modere',label:'Modéré',color:'#FF9F1C',icon:'alert',hint:'Zone mise en évidence en orange.'},
 {key:'eleve',label:'Élevé',color:'#FF4D3D',icon:'flame',hint:'Alerte rouge, points de chaleur clignotants.'},
 {key:'critique',label:'Critique',color:'#FF1F4B',icon:'siren',hint:'Alerte rouge renforcée, l’interface scintille brièvement.'},
];
export const levelOf=(k:Level|null|undefined)=>LEVELS.find(l=>l.key===k)??LEVELS[0];

/** Alertes de la vue. Désactivées dans les Paramètres : aucune requête, aucune donnée. */
export function useAlerts(scope:'world'|'africa'|'gabon',sensor?:string){
 const enabled=useSettings(s=>s.alerts!==false);
 const p=new URLSearchParams({scope});if(sensor)p.set('sensor',sensor);
 const q=useQuery<AlertData>({queryKey:['alerts',p.toString()],queryFn:()=>fetch('/api/alerts?'+p).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.json();}),
  refetchInterval:10*60_000,staleTime:5*60_000,enabled});
 return {enabled,data:enabled?q.data:undefined,isPending:enabled&&q.isPending};
}

const coord=(a:Alert)=>`${Math.abs(a.lat).toLocaleString('fr-FR',{maximumFractionDigits:1})}° ${a.lat>=0?'N':'S'} · ${Math.abs(a.lon).toLocaleString('fr-FR',{maximumFractionDigits:1})}° ${a.lon>=0?'E':'O'}`;
export const placeOf=(a:Alert,names:Record<string,string>)=>[a.province?`${a.province} (Gabon)`:names[a.id],coord(a)].filter(Boolean).join(' · ');
const fr=(v:number,d=0)=>v.toLocaleString('fr-FR',{maximumFractionDigits:d});
const utc=(v?:string)=>v?new Date(v).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';

function Switch({on,label,sub,onChange}:{on:boolean;label:string;sub:string;onChange:(v:boolean)=>void}){
 return <label className="map-display__switch"><span className="switch"><input type="checkbox" role="switch" checked={on} onChange={e=>onChange(e.target.checked)}/><span/></span><span><b>{label}</b><small>{sub}</small></span></label>;
}

/** Centre d'alertes (panneau du rail) : synthèse par niveau, réglages, liste localisable. */
export function AlertCenter({enabled=true,onEnabled,data,loading,names,effects,autoZoom,onEffects,onAutoZoom,onLocate}:{enabled?:boolean;onEnabled?:(v:boolean)=>void;data?:AlertData;loading:boolean;names:Record<string,string>;effects:boolean;autoZoom:boolean;onEffects:(v:boolean)=>void;onAutoZoom:(v:boolean)=>void;onLocate:(a:Alert)=>void}){
 const [only,setOnly]=useState<Level|null>(null);
 const master=onEnabled&&<div className="al-switches"><Switch on={enabled} onChange={onEnabled} label="Alertes thermiques" sub={enabled?'Calcul automatique, signal sur la carte et dans l’en-tête.':'Désactivées : aucun calcul, aucun signal, aucun effet.'}/></div>;
 if(!enabled)return <>{master}<p>Les alertes sont désactivées. Les points chauds restent consultables normalement sur la carte.</p></>;
 if(loading&&!data)return <p role="status">Analyse de l’activité thermique…</p>;
 if(!data)return <p role="alert">Alertes indisponibles : le serveur ne répond pas.</p>;
 const list=data.alerts.filter(a=>!only||a.level===only);
 return <>
  <p>Calcul automatique sur les <b>{data.window?.hours??24} dernières heures de données</b>{data.window?<> (jusqu’au {utc(data.window.to)})</>:null}, par carreau de 1°. Niveau = étendue (cellules actives) ou intensité (puissance maximale).</p>
  <div className="al-levels" role="group" aria-label="Filtrer par niveau">
   {[...LEVELS].reverse().map(l=><button key={l.key} type="button" className={`al-level is-${l.key}`} aria-pressed={only===l.key} onClick={()=>setOnly(o=>o===l.key?null:l.key)}>
    <span><Icon name={l.icon} size={14}/>{l.label}</span><b>{fr(data.counts[l.key]??0)}</b></button>)}
  </div>
  {master}
  <div className="al-switches">
   <Switch on={effects} onChange={onEffects} label="Effets visuels" sub="Clignotement et scintillement. La détection et la liste restent actives."/>
   <Switch on={autoZoom} onChange={onAutoZoom} label="Zoom automatique" sub="La carte se centre sur toute nouvelle alerte élevée ou critique."/>
  </div>
  {!list.length?<p>Aucune alerte {only?`de niveau ${levelOf(only).label.toLowerCase()}`:''} sur la période.</p>:
  <ol className="al-list">{list.slice(0,40).map(a=>{const l=levelOf(a.level);return <li key={a.id} className={`is-${a.level}`}>
   <button type="button" onClick={()=>onLocate(a)} aria-label={`Localiser l’alerte ${l.label.toLowerCase()} : ${placeOf(a,names)}`}>
    <span className="al-chip"><Icon name={l.icon} size={12}/>{l.label}</span>
    <span className="al-place">{placeOf(a,names)}</span>
    <span className="al-metrics">{fr(a.cells)} cellules · pic {fr(a.max_frp,1)} MW · {fr(a.detections)} détections</span>
    <Icon name="locate" size={16}/>
   </button></li>;})}</ol>}
  {data.total>list.length&&!only&&<p className="al-more">{fr(data.total-Math.min(list.length,40))} autres alertes, surtout de niveau faible, restent visibles sur la carte.</p>}
  <details className="al-rules"><summary>Seuils utilisés</summary><table className="nx-table"><thead><tr><th>Niveau</th><th className="num">Cellules ≥</th><th className="num">ou pic ≥</th></tr></thead>
   <tbody>{LEVELS.map(l=><tr key={l.key}><td><span className={`al-dot is-${l.key}`}/>{l.label}</td><td className="num">{data.rules[l.key]?.cells}</td><td className="num">{data.rules[l.key]?.frp?`${data.rules[l.key].frp} MW`:'—'}</td></tr>)}</tbody></table>
   <p>Une alerte signale une activité thermique forte à vérifier, pas un incendie confirmé.</p></details>
 </>;
}

/** Bandeau d'alerte : apparaît pour une alerte élevée ou critique, sans masquer la carte. */
export function AlertBanner({alert,place,effects,onLocate,onDetails,onDismiss}:{alert:Alert;place:string;effects:boolean;onLocate:()=>void;onDetails:()=>void;onDismiss:()=>void}){
 const l=levelOf(alert.level);
 return <div className={`al-banner is-${alert.level}${effects?' has-fx':''}`} role="alert">
  <span className="al-banner__icon"><Icon name={l.icon} size={20}/></span>
  <div className="al-banner__text"><b>Alerte {l.label.toLowerCase()} · {place}</b><span>{fr(alert.cells)} cellules actives · pic {fr(alert.max_frp,1)} MW · dernière détection {utc(alert.last_seen)}</span></div>
  <button type="button" onClick={onLocate}><Icon name="locate" size={15}/>Localiser</button>
  <button type="button" onClick={onDetails}><Icon name="siren" size={15}/>Toutes les alertes</button>
  <button type="button" className="al-banner__x" onClick={onDismiss} aria-label="Masquer le bandeau d’alerte"><Icon name="x" size={16}/></button>
 </div>;
}
