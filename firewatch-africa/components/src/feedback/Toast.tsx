/* ToastNotification — file de notifications (aria-live), auto-fermeture. */
import { create } from 'zustand';
import { Icon } from '../components/Icon';

export type ToastKind = 'info' | 'ok' | 'warn' | 'err';
interface Toast { id: number; title: string; body?: string; kind: ToastKind }
const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id'>, ms?: number) => void; remove: (id: number) => void }>((set, get) => ({
  items: [],
  push: (t, ms = 5200) => { const id = Date.now() + Math.random(); set({ items: [...get().items, { ...t, id }] }); setTimeout(() => get().remove(id), ms); },
  remove: (id) => set({ items: get().items.filter((x) => x.id !== id) }),
}));
export const toast = (title: string, body?: string, kind: ToastKind = 'info', ms?: number) => useToasts.getState().push({ title, body, kind }, ms);

export function ToastViewport() {
  const { items, remove } = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'ok' ? 'arrowRight' : t.kind === 'info' ? 'info' : 'alert'} />
          <div><strong>{t.title}</strong>{t.body && <span className="secondary">{t.body}</span>}</div>
          <button className="btn btn--ghost btn--sm btn--icon" aria-label="Fermer la notification" onClick={() => remove(t.id)}><Icon name="x" /></button>
        </div>
      ))}
    </div>
  );
}
