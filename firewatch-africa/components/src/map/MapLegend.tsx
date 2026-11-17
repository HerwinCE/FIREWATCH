/* MapLegend — légende repliable ; chaque entrée combine forme + couleur + texte. */
import { useState } from 'react';
import { ShapeSymbol } from '../components/Icon';
import { FRP_CLASSES } from './layers';

export function MapLegend({ hotspots = true, events = true, admin = false, defaultCollapsed = false }: { hotspots?: boolean; events?: boolean; admin?: boolean; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={`map-legend${collapsed ? ' is-collapsed' : ''}`} role="region" aria-label="Légende de la carte">
      <h4>Légende <button aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>{collapsed ? 'Afficher' : 'Masquer'}</button></h4>
      <ul>
        <li><ShapeSymbol kind="VIIRS" size={11} fill="var(--fw-color-thermal-500)" /> VIIRS · 375 m <span className="muted">(rond)</span></li>
        <li><ShapeSymbol kind="MODIS" size={11} fill="var(--fw-color-thermal-500)" /> MODIS · ≈ 1 km <span className="muted">(carré)</span></li>
        {events && <li><ShapeSymbol kind="EVENT" size={12} /> Événement probable harmonisé</li>}
      </ul>
      <div className="sep" />
      <ul>
        {FRP_CLASSES.map((c) => <li key={c.label}><span className="sw sw--sq" style={{ background: c.color }} /> {c.label}{c.max === Infinity && <span className="lvl lvl--high" style={{ fontSize: 11 }}>▲</span>}</li>)}
        <li><svg width={14} height={14} aria-hidden="true"><circle cx={7} cy={7} r={3} fill="var(--fw-color-thermal-500)" /><circle cx={7} cy={7} r={6} fill="none" stroke="var(--fw-color-thermal-300)" /></svg> Détection &lt; 24 h (pulsation)</li>
        {hotspots && <li><span className="sw sw--sq" style={{ background: 'rgba(242,140,40,.13)', border: '1px dashed rgba(242,140,40,.6)' }} /> Zone de concentration</li>}
        {admin && <li><svg width={22} height={8} aria-hidden="true"><line x1={0} y1={4} x2={22} y2={4} stroke="var(--fw-color-map-admin)" strokeDasharray="4 3" /></svg> Limite provinciale</li>}
      </ul>
    </div>
  );
}
