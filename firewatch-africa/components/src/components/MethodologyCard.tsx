/* MethodologyCard — section pédagogique ancrable (sommaire). */
import type { ReactNode } from 'react';
import { Icon } from './Icon';
export const MethodologyCard = ({ id, icon, title, children }: { id: string; icon: string; title: string; children: ReactNode }) => (
  <section className="card method" id={id} style={{ scrollMarginTop: 16 }} aria-labelledby={`${id}-t`}>
    <div className="row"><span className="method__ico"><Icon name={icon} size={18} /></span><h3 id={`${id}-t`} style={{ margin: 0 }}>{title}</h3></div>
    {children}
  </section>
);
export const NASA_LINKS = [
  { href: 'https://firms.modaps.eosdis.nasa.gov/', label: 'NASA FIRMS' },
  { href: 'https://firms.modaps.eosdis.nasa.gov/content/active_fire/', label: 'Documentation des feux actifs' },
];
