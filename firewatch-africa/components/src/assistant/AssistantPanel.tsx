/* AssistantPanel — panneau latéral / page / feuille mobile.
   États : vide (suggestions), chargement (saisie), réponse (avec sources), erreur.
   Règle : une réponse sans source API vérifiable est refusée côté serveur ET signalée côté client. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { DemoBadge } from '../components/Badges';
import { DISCLAIMERS } from '../utils/glossary';

export interface AssistantMessage { id: string; role: 'user' | 'assistant'; text?: string; html?: string; sources?: string[]; actions?: { label: string; href: string }[]; error?: boolean }
export interface AssistantContext { route: string; filters: Record<string, unknown>; eventId?: string }
/** Contrat du service assistant (backend LLM avec appel d'outils sur les endpoints FireWatch). */
export type AskFn = (question: string, ctx: AssistantContext, history: AssistantMessage[]) => Promise<Omit<AssistantMessage, 'id' | 'role'>>;

export const SUGGESTIONS = [
  'Quelles sont les zones les plus actives aujourd’hui ?',
  'Quelle est la différence entre MODIS et VIIRS ?',
  'Pourquoi cet événement a-t-il un score de 0,72 ?',
  'Combien de détections ont été observées au Gabon cette semaine ?',
];

export function AssistantPanel({ ask, context, variant = 'drawer', open = true, onClose, demo }: { ask: AskFn; context: AssistantContext; variant?: 'drawer' | 'page'; open?: boolean; onClose?: () => void; demo?: boolean }) {
  const [msgs, setMsgs] = useState<AssistantMessage[]>([]); const [pending, setPending] = useState(false); const [q, setQ] = useState('');
  const log = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, pending]);
  useEffect(() => { if (open && variant === 'drawer') setTimeout(() => input.current?.focus(), 230); }, [open, variant]);
  const send = async (text: string) => {
    if (!text.trim() || pending) return; const user: AssistantMessage = { id: crypto.randomUUID(), role: 'user', text };
    setMsgs((m) => [...m, user]); setQ(''); setPending(true);
    try { const r = await ask(text, context, [...msgs, user]); setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', ...r }]); }
    catch (e) { setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', error: true, text: `Je n’ai pas pu accéder aux données (${(e as Error).message}). Je ne répondrai pas sans données vérifiables.` }]); }
    finally { setPending(false); }
  };
  return (
    <aside className={`assistant${variant === 'page' ? ' assistant--page' : ''}${open ? ' is-open' : ''}`} aria-label="Assistant IA" aria-hidden={!open}>
      <div className="assistant__head"><span className="assistant__avatar"><Icon name="sparkle" /></span><div><h2>Assistant FireWatch</h2><div className="small muted">Interprétation des données disponibles</div></div>
        {onClose && <button className="btn btn--ghost btn--sm btn--icon" onClick={onClose} aria-label="Fermer l’assistant"><Icon name="x" /></button>}</div>
      <div className="assistant__ctx">Contexte : {context.eventId ? <span className="mono">{context.eventId}</span> : context.route} {demo && <DemoBadge label="MODE DÉMO" />}</div>
      <div className="assistant__msgs" ref={log} role="log" aria-live="polite" aria-label="Conversation">
        {!msgs.length && <div className="msg msg--bot"><div className="msg__body"><p>Je peux expliquer les filtres et les termes scientifiques, résumer la carte ou une période, et détailler pourquoi des détections ont été — ou non — rapprochées.</p></div></div>}
        {msgs.map((m) => m.role === 'user' ? <div key={m.id} className="msg msg--user">{m.text}</div> : (
          <div key={m.id} className={`msg msg--bot${m.error ? ' msg--err' : ''}`}>
            <div className="msg__body">{m.html ? <div dangerouslySetInnerHTML={{ __html: m.html }} /> : <p>{m.text}</p>}
              {m.actions && <div className="row" style={{ marginTop: 8 }}>{m.actions.map((a) => <a key={a.href} className="btn btn--sm" href={a.href}>{a.label}<Icon name="arrowRight" /></a>)}</div>}</div>
            {m.sources?.length ? <div className="msg__src">Sources : {m.sources.map((s) => <code key={s}>GET {s}</code>)}</div> : !m.error && <div className="msg__src">Source : référentiel méthodologique FireWatch</div>}
          </div>))}
        {pending && <div className="typing" role="status"><i /><i /><i /><span>Analyse des données…</span></div>}
      </div>
      <div className="suggest" aria-label="Suggestions de questions">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
      <p className="assistant__disclaimer"><Icon name="info" size={14} /><span>{DISCLAIMERS.assistant}</span></p>
      <form className="assistant__form" onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <label className="sr-only" htmlFor="fw-assistant-q">Votre question</label>
        <textarea id="fw-assistant-q" ref={input} rows={1} value={q} placeholder="Posez une question sur les données…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q); } }} />
        <button className="btn btn--primary btn--icon" type="submit" aria-label="Envoyer" disabled={pending}><Icon name="send" /></button>
      </form>
    </aside>
  );
}

/** Bouton flottant (mobile + desktop). */
export const AssistantFab = ({ onClick }: { onClick: () => void }) => (
  <button className="fab" onClick={onClick} aria-label="Ouvrir l’assistant IA"><Icon name="sparkle" size={20} /><span>Assistant IA</span></button>
);
