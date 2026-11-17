/* Graphiques Recharts : courbes lissées, infobulle en verre, un seul axe, couleur = entité (capteur). */
import {ResponsiveContainer,AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,Legend,BarChart,Bar,Cell,ComposedChart,Line,ReferenceDot} from 'recharts';

const fr=(v:unknown,d=0)=>typeof v==='number'?v.toLocaleString('fr-FR',{maximumFractionDigits:d}):'—';
const MONTHS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const shortDay=(d:string)=>{const [,m,j]=d.split('-');return `${Number(j)} ${MONTHS[Number(m)-1]??''}`;};
const monthYear=(d:string)=>{const [y,m]=d.split('-');return `${MONTHS[Number(m)-1]??''} ${y.slice(2)}`;};
const spanDays=(x:string[])=>x.length<2?0:(Date.parse(x[x.length-1])-Date.parse(x[0]))/864e5;

function Tip({active,payload,label,unit='',fmtLabel}:{active?:boolean;payload?:any[];label?:any;unit?:string;fmtLabel?:(l:any)=>string}){
 if(!active||!payload?.length)return null;
 return <div className="nx-tip"><b>{fmtLabel?fmtLabel(label):label}</b>{payload.filter(p=>p.value!=null&&!String(p.dataKey).startsWith('_')).map(p=><div key={p.dataKey}><i style={{background:p.color||p.payload?.fill}}/>{p.name} : <strong>{fr(p.value,1)}</strong>{unit}</div>)}</div>;
}

export type Series={name:string;color:string;values:number[]};
/** Activité dans le temps : une courbe lissée par famille de capteur, aire en dégradé. */
export function TrendChart({x,series,caption,height=260}:{x:string[];series:Series[];caption:string;height?:number}){
 if(!x.length)return <p className="muted">Aucune donnée sur cette période.</p>;
 const long=spanDays(x)>120;
 // Plus de 400 jours : cumul mensuel (courbe lisible, rendu léger) ; sinon jour par jour.
 const monthly=x.length>400;
 let data:any[]=x.map((d,i)=>Object.fromEntries([['day',d],...series.map(s=>[s.name,s.values[i]])]));
 if(monthly){const acc=new Map<string,any>();data.forEach(r=>{const k=r.day.slice(0,7);const o=acc.get(k)??Object.fromEntries([['day',k],...series.map(s=>[s.name,0])]);series.forEach(s=>{o[s.name]+=Number(r[s.name]||0)});acc.set(k,o);});data=[...acc.values()];}
 return <figure className="nx-chart" style={{margin:0}}>
  <div style={{height}} role="img" aria-label={caption}>
   <ResponsiveContainer>
    <AreaChart data={data} margin={{top:8,right:12,left:0,bottom:0}}>
     <defs>{series.map(s=><linearGradient key={s.name} id={'g-'+s.name} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={.35}/><stop offset="100%" stopColor={s.color} stopOpacity={0}/></linearGradient>)}</defs>
     <CartesianGrid vertical={false} strokeDasharray="3 4"/>
     <XAxis dataKey="day" tickFormatter={long?monthYear:shortDay} tickLine={false} axisLine={false} minTickGap={28}/>
     <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={v=>fr(v)}/>
     <Tooltip content={<Tip fmtLabel={(l:string)=>monthly?`${monthYear(l)} · cumul du mois`:`${shortDay(l)} ${l.slice(0,4)} · UTC`}/>} cursor={{stroke:'var(--br-primary)',strokeWidth:1,strokeDasharray:'4 3'}}/>
     <Legend iconType="circle" iconSize={8} verticalAlign="top" align="right" height={24}/>
     {series.map(s=><Area key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.name})`} dot={false} activeDot={{r:4,strokeWidth:2,stroke:'var(--fw-color-bg-surface1)'}}/>)}
    </AreaChart>
   </ResponsiveContainer>
  </div>
  <figcaption className="nx-chart__cap">{caption}{monthly?' · Période longue : valeurs cumulées par mois.':''}</figcaption>
 </figure>;
}

/** Comparaison par satellite : barres horizontales, valeur lisible au bout de chaque barre. */
export function SatelliteChart({items,colorOf,caption,height}:{items:{label:string;value:number}[];colorOf:(i:number)=>string;caption:string;height?:number}){
 if(!items.length)return <p className="muted">Aucun satellite sur cette sélection.</p>;
 const h=height??Math.max(140,items.length*40+20);
 return <figure className="nx-chart" style={{margin:0}}>
  <div style={{height:h}} role="img" aria-label={caption}>
   <ResponsiveContainer>
    <BarChart data={items} layout="vertical" margin={{top:4,right:48,left:4,bottom:0}} barCategoryGap={10}>
     <CartesianGrid horizontal={false} strokeDasharray="3 4"/>
     <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={v=>fr(v)}/>
     <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={118}/>
     <Tooltip content={<Tip/>} cursor={{fill:'rgba(91,213,240,.06)'}}/>
     <Bar dataKey="value" name="Cellules actives" radius={[0,4,4,0]} label={{position:'right',formatter:(v:number)=>fr(v),fill:'var(--fw-color-text-secondary)',fontSize:11.5}}>
      {items.map((_,i)=><Cell key={i} fill={colorOf(i)}/>)}
     </Bar>
    </BarChart>
   </ResponsiveContainer>
  </div>
  <figcaption className="nx-chart__cap">{caption}</figcaption>
 </figure>;
}

/** Référence historique : bande P25–P75, médiane lissée et point du mois en cours. */
export function MedianCurve({data,height=240}:{data:any;height?:number}){
 const curve:any[]=data?.monthly_reference||[];
 if(!curve.length)return <p className="muted">Courbe de référence indisponible.</p>;
 const m=Number(data.period.month.split('-')[1]);
 const rows=curve.map((c,i)=>({mois:MONTHS[i],_base:c.p25??0,_band:Math.max(0,(c.p75??0)-(c.p25??0)),p25:c.p25,p75:c.p75,Médiane:c.median}));
 const up=data.position==='above_normal',down=data.position==='below_normal';
 const color=up?'#FF8547':down?'#8AA8FF':'#5EE6A8';
 return <figure className="nx-chart" style={{margin:0}}>
  <div style={{height}} role="img" aria-label={`Médiane mensuelle ${data.sensor_family} ${data.reference.years}, bande P25–P75 et mois en cours`}>
   <ResponsiveContainer>
    <ComposedChart data={rows} margin={{top:10,right:12,left:0,bottom:0}}>
     <CartesianGrid vertical={false} strokeDasharray="3 4"/>
     <XAxis dataKey="mois" tickLine={false} axisLine={false}/>
     <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={v=>fr(v)}/>
     <Tooltip content={({active,payload,label})=>active&&payload?.length?<div className="nx-tip"><b>{label}</b><div>Médiane : <strong>{fr(payload[0].payload.Médiane,1)}</strong></div><div>Plage habituelle P25–P75 : {fr(payload[0].payload.p25,1)} – {fr(payload[0].payload.p75,1)}</div></div>:null}/>
     <Area type="monotone" dataKey="_base" stackId="b" stroke="none" fill="transparent" isAnimationActive={false}/>
     <Area type="monotone" dataKey="_band" stackId="b" stroke="none" fill="rgba(138,168,255,.22)" name="P25–P75"/>
     <Line type="monotone" dataKey="Médiane" stroke="#AFC3FF" strokeWidth={2} dot={false}/>
     {data.current_value!=null&&<ReferenceDot x={MONTHS[m-1]} y={data.current_value} r={7} fill={color} stroke="var(--fw-color-bg-surface1)" strokeWidth={2}/>}
    </ComposedChart>
   </ResponsiveContainer>
  </div>
  <figcaption className="nx-chart__cap">Ligne : médiane mensuelle {data.sensor_family} ({data.reference.years}) · bande : plage habituelle P25–P75 · point : mois en cours ({data.period.partial?`jours ${data.period.days_compared} seulement, comparés aux mêmes jours`:'mois complet'}). Métrique : {data.metric==='active_cells'?'cellules actives de 0,01°':'détections'}, végétation présumée.</figcaption>
 </figure>;
}
