/* Registre des commandes de l'application : chaque écran y déclare ce qu'il sait faire.
   L'assistant vocal n'agit QUE par ces fonctions (liste fermée) et lit leur résultat réel. */

export type AppState={route:string;sensor:string;region:string;start:string;end:string;zone?:string;alerts?:string};
export type Result={ok:boolean;message:string};

type AppCtl={navigate:(page:string)=>void;setSensor:(v:string)=>void;setRegion:(r:string)=>void;setPeriod:(start:string,end:string)=>void;setTheme:(mode:'nuit'|'jour')=>void;getState:()=>AppState;lastDataDay:()=>string|undefined};
type MapCtl={locatePlace:(name:string)=>Promise<Result>;setDisplay:(a:{basemap?:string;display?:string;all_points?:boolean})=>Result;exportFile:(kind:'image'|'geojson')=>Promise<Result>;zoneName:()=>string|undefined};
type OpsCtl={openPanel:(p:string)=>Result;showAlert:(level?:string,rank?:number)=>Result;playTimeline:(days?:number)=>Result;exportCsv:()=>Promise<Result>;alertSummary:()=>string|undefined};

export const ctl:{app:Partial<AppCtl>;map:Partial<MapCtl>;ops:Partial<OpsCtl>}={app:{},map:{},ops:{}};

/** Attend qu'une condition devienne vraie (écran chargé, carte prête…), sans bloquer l'interface. */
export async function waitFor(pred:()=>boolean,ms=9000,step=150):Promise<boolean>{
 const t0=Date.now();
 while(Date.now()-t0<ms){if(pred())return true;await new Promise(r=>setTimeout(r,step));}
 return pred();
}
