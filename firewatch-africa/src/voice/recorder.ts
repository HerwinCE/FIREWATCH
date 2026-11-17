/* Micro autonome : enregistre une phrase, détecte le début et la fin de la parole,
   mesure le niveau sonore en direct et produit un WAV 16 kHz mono pour la transcription.

   Points délicats (Chrome) :
   - le moteur audio doit être créé/relancé PENDANT le clic de l'utilisateur, sinon il reste « suspendu »
     et le micro ne renvoie que du silence : `primeAudio()` est appelé de façon synchrone dans le clic ;
   - le bruit de fond ne doit pas être mesuré sur les premières millisecondes (l'utilisateur parle souvent
     tout de suite) : on suit le niveau le plus BAS observé, pas le plus haut. */

export class MicError extends Error{constructor(public code:'denied'|'nomic'|'busy'|'insecure'|'other',msg:string){super(msg);}}

let shared:AudioContext|null=null;
export function audioCtx():AudioContext{
 if(!shared||shared.state==='closed'){const AC=(window.AudioContext||(window as any).webkitAudioContext);shared=new AC();}
 return shared;
}
/** À appeler DANS le gestionnaire de clic : réveille le moteur audio et autorise la lecture du son. */
export function primeAudio(){
 try{const ctx=audioCtx();ctx.resume().catch(()=>{});
  const b=ctx.createBuffer(1,1,22050),s=ctx.createBufferSource();s.buffer=b;s.connect(ctx.destination);s.start(0);}catch{/* rien */}
 try{const a=new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');a.volume=0;a.play().catch(()=>{});}catch{/* rien */}
}

/** raw = sans annulation d'écho ni réduction de bruit : certains micros d'ordinateur portable n'envoient que du silence sinon. */
export async function openMic(deviceId?:string,raw=false):Promise<MediaStream>{
 if(!window.isSecureContext)throw new MicError('insecure','Le micro exige une adresse sécurisée (https ou localhost).');
 if(!navigator.mediaDevices?.getUserMedia)throw new MicError('other','Ce navigateur ne donne pas accès au micro.');
 const audio:MediaTrackConstraints={echoCancellation:!raw,noiseSuppression:!raw,autoGainControl:true,channelCount:1,...(deviceId?{deviceId:{exact:deviceId}}:{})};
 try{return await navigator.mediaDevices.getUserMedia({audio});}
 catch(e){const n=(e as DOMException).name;
  if(n==='OverconstrainedError'&&deviceId)return openMic(undefined,raw);   // micro choisi débranché : micro par défaut
  if(n==='NotAllowedError'||n==='SecurityError')throw new MicError('denied','Le micro est refusé : cliquez sur l’icône à gauche de l’adresse, autorisez le micro, puis réessayez.');
  if(n==='NotFoundError')throw new MicError('nomic','Aucun micro détecté : branchez un micro ou un casque, puis réessayez.');
  if(n==='NotReadableError'||n==='AbortError')throw new MicError('busy','Le micro est déjà utilisé par une autre application (Teams, Zoom…). Fermez-la puis réessayez.');
  throw new MicError('other',`Micro inaccessible (${n}).`);}
}

/** Micros disponibles (les noms n'apparaissent qu'après la première autorisation). */
export async function listMics():Promise<{id:string;label:string}[]>{
 try{const d=await navigator.mediaDevices.enumerateDevices();return d.filter(x=>x.kind==='audioinput').map((x,i)=>({id:x.deviceId,label:x.label||`Micro ${i+1}`}));}catch{return [];}
}

export type Take={wav:Blob|null;heard:boolean;ms:number;peak:number;device:string;stalled:boolean;muted:boolean};
export type Recording={stop:()=>void;done:Promise<Take>};

/** Enregistre jusqu'au silence qui suit la parole (ou jusqu'à l'arrêt manuel). */
export function record(stream:MediaStream,onLevel:(v:number)=>void,opt={maxMs:15000,silenceMs:1300,waitMs:8000}):Recording{
 const ctx=audioCtx();ctx.resume().catch(()=>{});
 const src=ctx.createMediaStreamSource(stream);const proc=ctx.createScriptProcessor(2048,1,1);
 const mute=ctx.createGain();mute.gain.value=0;                       // le traitement tourne sans renvoyer le micro dans les haut-parleurs
 const chunks:Float32Array[]=[];const t0=performance.now();const track=stream.getAudioTracks()[0];const device=track?.label||'micro par défaut';
 let muted=!!track?.muted;if(track)track.onmute=()=>{muted=true;};   // muted = coupé par le système ou le matériel
 let floor=1,frames=0,peak=0,heard=false,voiced=0,lastVoice=0,stopped=false,resolve!:(v:Take)=>void;
 const done=new Promise<Take>(r=>resolve=r);
 proc.onaudioprocess=e=>{
  if(stopped)return;
  const d=e.inputBuffer.getChannelData(0);chunks.push(new Float32Array(d));
  let sum=0;for(let i=0;i<d.length;i++)sum+=d[i]*d[i];const rms=Math.sqrt(sum/d.length);
  frames++;peak=Math.max(peak,rms);
  floor=Math.min(floor,Math.max(rms,0.0008));                         // niveau le plus bas observé = bruit de fond
  const thr=Math.min(0.03,Math.max(0.006,floor*3));
  const now=performance.now()-t0;
  onLevel(Math.min(1,rms/0.08));
  if(rms>thr){voiced++;if(voiced>=2)heard=true;lastVoice=now;}       // deux trames de suite : pas un simple clic
  if((heard&&now-lastVoice>opt.silenceMs)||(!heard&&now>opt.waitMs)||now>opt.maxMs)stop(false);
 };
 src.connect(proc);proc.connect(mute);mute.connect(ctx.destination);
 // Si le moteur audio ne tourne pas (bloqué par le navigateur), on le signale au lieu d'attendre en silence.
 const watchdog=setTimeout(()=>{if(!frames)stop(true);},2500);
 function stop(stalled:boolean){
  if(stopped)return;stopped=true;clearTimeout(watchdog);onLevel(0);
  try{proc.disconnect();src.disconnect();mute.disconnect();}catch{/* déjà déconnecté */}
  stream.getTracks().forEach(t=>t.stop());
  // Un arrêt manuel garde ce qui a été dit, même si la détection n'a rien déclenché.
  const keep=heard||(!stalled&&peak>0.004&&chunks.length>4&&manual);
  resolve({wav:keep?toWav(chunks,ctx.sampleRate):null,heard:keep,ms:Math.round(performance.now()-t0),peak,device,stalled,muted});
 }
 let manual=false;
 return {stop:()=>{manual=true;stop(false);},done};
}

/** Concatène, rééchantillonne à 16 kHz et encode en WAV 16 bits mono. */
function toWav(chunks:Float32Array[],rate:number):Blob{
 const len=chunks.reduce((n,c)=>n+c.length,0);const all=new Float32Array(len);let o=0;for(const c of chunks){all.set(c,o);o+=c.length;}
 const out=16000,ratio=rate/out,n=Math.floor(len/ratio);const pcm=new Int16Array(n);
 for(let i=0;i<n;i++){const a=Math.floor(i*ratio),b=Math.min(len,Math.floor((i+1)*ratio));let s=0;for(let j=a;j<b;j++)s+=all[j];const v=Math.max(-1,Math.min(1,s/Math.max(1,b-a)));pcm[i]=v<0?v*0x8000:v*0x7FFF;}
 const buf=new ArrayBuffer(44+pcm.length*2),v=new DataView(buf);const w=(p:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
 w(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,out,true);v.setUint32(28,out*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,pcm.length*2,true);
 new Int16Array(buf,44).set(pcm);
 return new Blob([buf],{type:'audio/wav'});
}

export const toBase64=(b:Blob)=>new Promise<string>((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]??'');r.onerror=()=>ko(r.error);r.readAsDataURL(b);});

export type Probe={device:string;peak:number;muted:boolean;raw:boolean};
/** Test du micro : niveau en direct pendant `ms`, sans enregistrer ni rien envoyer. */
export async function probeMic(deviceId:string|undefined,onLevel:(v:number)=>void,ms=6000,raw=false):Promise<Probe>{
 const stream=await openMic(deviceId,raw);const ctx=audioCtx();await ctx.resume().catch(()=>{});
 const track=stream.getAudioTracks()[0];let muted=!!track?.muted;if(track)track.onmute=()=>{muted=true;};
 const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=1024;src.connect(an);
 const buf=new Float32Array(an.fftSize);let peak=0;const t0=performance.now();
 await new Promise<void>(res=>{const id=setInterval(()=>{an.getFloatTimeDomainData(buf);let s=0;for(let i=0;i<buf.length;i++)s+=buf[i]*buf[i];const rms=Math.sqrt(s/buf.length);
  peak=Math.max(peak,rms);onLevel(Math.min(1,rms/0.08));if(performance.now()-t0>ms){clearInterval(id);res();}},60);});
 onLevel(0);try{src.disconnect();}catch{/* rien */}stream.getTracks().forEach(t=>t.stop());
 return {device:track?.label||'micro par défaut',peak,muted,raw};
}
