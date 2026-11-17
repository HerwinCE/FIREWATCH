/* Exécution des actions de l'assistant vocal : liste fermée, résultat constaté après coup.
   Une action n'est déclarée réussie que si l'état de l'application le confirme. */
import {ctl, waitFor, type Result} from './control';

export type Action={id?:string;name:string;args:Record<string,any>;confirm?:boolean};

const PAGE_LABEL:Record<string,string>={dashboard:'Tableau de bord',carte:'Carte opérationnelle',gabon:'Gabon',historique:'Historique',evenements:'Événements harmonisés',zones:'Zones sensibles',comparaison:'MODIS / VIIRS',methodologie:'Sources et méthodologie',assistant:'Assistant IA',parametres:'Paramètres'};
const PANEL_LABEL:Record<string,string>={layers:'Couches et période',alerts:'Alertes',stats:'Statistiques',harmo:'Harmonisation',calendar:'Calendrier',zones:'Zones actives',export:'Export',method:'Sources et limites',timeline:'Chronologie'};
const LEVEL_LABEL:Record<string,string>={critique:'critique',eleve:'élevée',modere:'modérée',faible:'faible'};

/** Libellé lisible d'une action, pour le journal et la demande de confirmation. */
export function actionLabel(a:Action):string{
 const x=a.args||{};
 switch(a.name){
  case 'navigate':return `Ouvrir « ${PAGE_LABEL[x.page]??x.page} »`;
  case 'set_sensors':return x.selection==='both'?'Capteurs : MODIS + VIIRS':`Capteurs : ${x.selection} seul`;
  case 'set_region':return `Emprise : ${({world:'monde',africa:'Afrique',gabon:'Gabon'} as any)[x.region]??x.region}`;
  case 'set_period':return x.last_days?`Période : ${x.last_days} derniers jours`:x.start||x.end?`Période : ${x.start||'…'} → ${x.end||'…'}`:'Période : tout';
  case 'locate_place':return `Localiser ${x.name}`;
  case 'show_alert':return `Localiser l’alerte ${x.level?LEVEL_LABEL[x.level]:'la plus grave'}`;
  case 'open_map_panel':return `Ouvrir le panneau « ${PANEL_LABEL[x.panel]??x.panel} »`;
  case 'set_map_display':return 'Régler l’affichage de la carte';
  case 'play_timeline':return `Lire la chronologie${x.window_days?` (${x.window_days} j)`:''}`;
  case 'set_theme':return `Mode ${x.mode}`;
  case 'run_harmonization':return `Lancer l’harmonisation MODIS + VIIRS${x.mode==='full'?' complète':''}`;
  case 'export_data':return `Télécharger ${({csv:'les données (CSV)',image:'une image de la carte',geojson:'les points (GeoJSON)'} as any)[x.kind]??x.kind}`;
  default:return a.name;
 }
}

const tick=()=>new Promise(r=>setTimeout(r,120));
const iso=(d:Date)=>d.toISOString().slice(0,10);
const DATE=/^\d{4}-\d{2}-\d{2}$/;

/** Ouvre la carte si besoin et attend qu'elle soit prête à recevoir des commandes. */
async function onMap(need:'map'|'ops'|'alerts'):Promise<Result|null>{
 if((location.hash.slice(1)||'dashboard')!=='carte'){ctl.app.navigate?.('carte');}
 const ok=await waitFor(()=>need==='map'?!!ctl.map.locatePlace:need==='ops'?!!ctl.ops.openPanel:!!ctl.ops.alertSummary?.(),15000);
 return ok?null:{ok:false,message:need==='map'?'La carte ne s’est pas chargée à temps.':'Les données de la carte ne sont pas encore prêtes.'};
}

export async function runAction(a:Action):Promise<Result>{
 const x=a.args||{};
 try{
  switch(a.name){
   case 'navigate':{
    if(!PAGE_LABEL[x.page])return {ok:false,message:`Page « ${x.page} » inconnue.`};
    ctl.app.navigate?.(x.page);
    const ok=await waitFor(()=>(location.hash.slice(1)||'dashboard')===x.page,3000);
    return ok?{ok:true,message:`Page « ${PAGE_LABEL[x.page]} » ouverte.`}:{ok:false,message:'La page ne s’est pas ouverte.'};}
   case 'set_sensors':{
    const v=x.selection==='both'?'':x.selection;if(!['','MODIS','VIIRS'].includes(v))return {ok:false,message:'Capteur inconnu.'};
    ctl.app.setSensor?.(v);await tick();await tick();
    return ctl.app.getState?.().sensor===v?{ok:true,message:v?`Seules les données ${v} sont affichées.`:'MODIS et VIIRS sont affichés ensemble.'}:{ok:false,message:'Le choix des capteurs n’a pas pris effet.'};}
   case 'set_region':{
    if(!['world','africa','gabon'].includes(x.region))return {ok:false,message:'Emprise inconnue.'};
    ctl.app.setRegion?.(x.region);await tick();await tick();
    return ctl.app.getState?.().region===x.region?{ok:true,message:`Emprise : ${({world:'monde',africa:'Afrique',gabon:'Gabon'} as any)[x.region]}.`}:{ok:false,message:'L’emprise n’a pas changé.'};}
   case 'set_period':{
    let s='',e='';
    if(x.last_days){const last=ctl.app.lastDataDay?.()??iso(new Date());const d=new Date(last+'T12:00:00Z');e=last;d.setUTCDate(d.getUTCDate()-(Math.min(3650,x.last_days)-1));s=iso(d);}
    else{s=DATE.test(x.start??'')?x.start:'';e=DATE.test(x.end??'')?x.end:'';if(s&&e&&e<s)return {ok:false,message:'La date de fin précède la date de début.'};}
    ctl.app.setPeriod?.(s,e);await tick();await tick();const st=ctl.app.getState?.();
    return st&&st.start===s&&st.end===e?{ok:true,message:s||e?`Période appliquée : du ${s||'début'} au ${e||'dernier jour'}.`:'Toute la période est affichée.'}:{ok:false,message:'La période n’a pas été appliquée.'};}
   case 'locate_place':{
    if(!x.name)return {ok:false,message:'Aucun lieu indiqué.'};
    const wait=await onMap('map');if(wait)return wait;
    return await ctl.map.locatePlace!(x.name);}
   case 'show_alert':{
    const wait=await onMap('alerts');if(wait)return wait;
    return ctl.ops.showAlert!(x.level,x.rank??1);}
   case 'open_map_panel':{
    const wait=await onMap('ops');if(wait)return wait;
    return ctl.ops.openPanel!(x.panel);}
   case 'set_map_display':{
    const wait=await onMap('map');if(wait)return wait;
    return ctl.map.setDisplay!(x);}
   case 'play_timeline':{
    const wait=await onMap('ops');if(wait)return wait;
    return ctl.ops.playTimeline!(x.window_days);}
   case 'set_theme':{
    ctl.app.setTheme?.(x.mode==='jour'?'jour':'nuit');await tick();
    const want=x.mode==='jour'?'light':'dark';
    return document.documentElement.dataset.theme===want?{ok:true,message:`Mode ${x.mode==='jour'?'jour':'nuit'} activé.`}:{ok:false,message:'Le thème n’a pas changé.'};}
   case 'run_harmonization':return await harmonize(x.mode==='full'?'full':'incremental');
   case 'export_data':{
    if(x.kind==='csv'){const wait=await onMap('ops');if(wait)return wait;return await ctl.ops.exportCsv!();}
    if(x.kind==='image'||x.kind==='geojson'){const wait=await onMap('map');if(wait)return wait;return await ctl.map.exportFile!(x.kind);}
    return {ok:false,message:'Format d’export inconnu.'};}
   default:return {ok:false,message:`Action « ${a.name} » non autorisée.`};
  }
 }catch(err){return {ok:false,message:`Échec : ${(err as Error).message||'erreur inattendue'}.`};}
}

/** Harmonisation : lance le pipeline puis attend son résultat réel (jusqu'à 6 minutes). */
async function harmonize(mode:'incremental'|'full'):Promise<Result>{
 const r=await fetch('/api/harmonization/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});
 if(r.status===409)return {ok:false,message:'Une harmonisation est déjà en cours.'};
 if(!r.ok){const d=await r.json().catch(()=>({}));return {ok:false,message:d.detail||`Lancement refusé (${r.status}).`};}
 const t0=Date.now();
 while(Date.now()-t0<360000){
  await new Promise(z=>setTimeout(z,3000));
  const s=await fetch('/api/harmonization/status').then(z=>z.json()).catch(()=>null);
  if(s&&s.status!=='running'){
   dispatchEvent(new Event('fw:data-changed'));
   return s.status==='success'?{ok:true,message:s.rows_processed?`Harmonisation terminée : ${Number(s.rows_processed).toLocaleString('fr-FR')} nouvelles lignes traitées.`:'Harmonisation terminée : les données étaient déjà à jour.'}
    :{ok:false,message:`Harmonisation en échec${s.error_message?` : ${s.error_message}`:''}.`};
  }
 }
 return {ok:false,message:'Harmonisation toujours en cours après 6 minutes ; elle continue en arrière-plan.'};
}

/* ---------------- Compréhension locale (secours sans Gemini) ---------------- */
const f=(t:string)=>t.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const PAGES:[RegExp,string][]=[[/tableau de bord|dashboard|accueil/,'dashboard'],[/historique|histoire|mediane/,'historique'],[/evenement/,'evenements'],[/zones? (sensibles?|actives?|chaudes?)|zones de concentration/,'zones'],
 [/comparaison|comparer/,'comparaison'],[/methodo|methode|sources?/,'methodologie'],[/parametre|reglage/,'parametres'],[/assistant ecrit|discussion|chat/,'assistant'],[/carte|mode operationnel/,'carte']];

/** Commandes courantes reconnues sans IA ; renvoie null si c'est une question à transmettre. */
export function localPlan(text:string):Action[]|null{
 const t=f(text),acts:Action[]=[];
 if(/mode nuit|theme sombre|passe en sombre/.test(t))acts.push({name:'set_theme',args:{mode:'nuit'}});
 if(/mode jour|theme clair/.test(t))acts.push({name:'set_theme',args:{mode:'jour'}});
 if(/harmonis/.test(t)&&/lance|demarre|fais|execute|relance/.test(t))acts.push({name:'run_harmonization',args:{},confirm:true});
 if(/(modis|viirs)/.test(t)&&/seul|uniquement|que les|seulement|affiche|montre|selectionne/.test(t)){
  const m=/modis/.test(t),v=/viirs/.test(t);acts.push({name:'set_sensors',args:{selection:m&&v?'both':m?'MODIS':'VIIRS'}});}
 else if(/les deux capteurs|tous les capteurs|modis et viirs|viirs et modis/.test(t))acts.push({name:'set_sensors',args:{selection:'both'}});
 const days=t.match(/(\d+)\s*(derniers?|dernieres?)\s*jours|derniers?\s*(\d+)\s*jours/);if(days)acts.push({name:'set_period',args:{last_days:Number(days[1]||days[3])}});
 else if(/cette semaine|7 jours/.test(t))acts.push({name:'set_period',args:{last_days:7}});
 else if(/toute la periode|tout l historique|reinitialise la periode/.test(t))acts.push({name:'set_period',args:{}});
 if(/alerte/.test(t)){const lvl=/critique/.test(t)?'critique':/elevee?|eleve/.test(t)?'eleve':/modere/.test(t)?'modere':/faible/.test(t)?'faible':undefined;
  if(/localise|montre|zoom|ou est|ou sont|va sur|affiche/.test(t))acts.push({name:'show_alert',args:{level:lvl}});else acts.push({name:'open_map_panel',args:{panel:'alerts'}});}
 if(/chronologie|lecture|rejoue|anime/.test(t)){const w=t.match(/(\d+)\s*jours?/);acts.push({name:'play_timeline',args:{window_days:w?Number(w[1]):1}});}
 if(/export|telecharge/.test(t))acts.push({name:'export_data',args:{kind:/image|capture|png/.test(t)?'image':/geojson|points/.test(t)?'geojson':'csv'},confirm:true});
 if(/carte de chaleur|chaleur/.test(t)&&/affiche|montre|passe/.test(t))acts.push({name:'set_map_display',args:{display:'heat'}});
 if(/tous les points/.test(t))acts.push({name:'set_map_display',args:{all_points:!/masque|cache|retire/.test(t)}});
 const place=t.match(/(?:zoome?r?|localise[rz]?|va|aller|centre[rz]?|montre(?:-moi)?|affiche)\s+(?:sur|vers|a|au|en|la|le|les|l')?\s*(?:pays|province|region|zone)?\s*(?:du|de la|de l'|des|de)?\s*([a-z' -]{3,40})$/);
 if(place&&!/alerte|chronologie|page|tableau|historique|statistique|carte$|tous les points|chaleur|modis|viirs/.test(place[1]))acts.push({name:'locate_place',args:{name:place[1].trim()}});
 if(/statistique/.test(t)&&/carte/.test(t))acts.push({name:'open_map_panel',args:{panel:'stats'}});
 if(!acts.some(a=>a.name==='locate_place'||a.name==='show_alert')&&/ouvre|va|affiche|montre|aller|emmene|passe/.test(t)){for(const [re,p] of PAGES)if(re.test(t)){acts.push({name:'navigate',args:{page:p}});break;}}
 if(/^(zoome?|localise)/.test(t)&&!acts.length&&/gabon/.test(t))acts.push({name:'locate_place',args:{name:'Gabon'}});
 return acts.length?acts:null;
}
