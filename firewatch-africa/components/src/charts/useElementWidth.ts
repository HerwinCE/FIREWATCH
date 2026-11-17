import { useEffect, useRef, useState } from 'react';
/** Largeur observée d'un élément (ResizeObserver) — les graphiques se redessinent au redimensionnement. */
export function useElementWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null); const [w, setW] = useState(initial);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width)))); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
