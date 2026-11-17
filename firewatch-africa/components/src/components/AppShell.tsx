/* AppShell · Sidebar · Topbar · BottomNav — structure responsive (container queries dans firewatch.css). */
import { cloneElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from './Icon';
import { fmt } from '../utils/format';

export interface NavItem { route: string; label: string; icon: string; badge?: ReactNode }
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Surveillance', items: [{ route: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' }, { route: 'carte', label: 'Carte mondiale', icon: 'globe' }, { route: 'gabon', label: 'Gabon', icon: 'gabon' }] },
  { group: 'Analyse', items: [{ route: 'historique', label: 'Historique', icon: 'history' }, { route: 'evenements', label: 'Événements harmonisés', icon: 'events' }, { route: 'zones', label: 'Zones sensibles', icon: 'zones' }, { route: 'comparaison', label: 'MODIS / VIIRS', icon: 'compare' }] },
  { group: 'Référence', items: [{ route: 'methodologie', label: 'Sources et méthodologie', icon: 'book' }, { route: 'assistant', label: 'Assistant IA', icon: 'sparkle' }, { route: 'parametres', label: 'Paramètres', icon: 'settings' }] },
];

export function Logo() {
  return (
    <span className="fw-logo__inner" style={{ display: 'contents' }}>
      <svg className="fw-logo__mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0F2A1F" /><circle cx="16" cy="16" r="9.5" fill="none" stroke="#2F8F62" strokeWidth="1.4" /><ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="#4CC9F0" strokeWidth="1.1" strokeDasharray="2 2.2" transform="rotate(-28 16 16)" /><circle cx="18.6" cy="13.6" r="5.6" fill="#F28C28" opacity=".22" /><circle cx="18.6" cy="13.6" r="2.8" fill="#F28C28" /><circle cx="27" cy="9.6" r="1.5" fill="#4CC9F0" /></svg>
      <span className="fw-logo__text"><span className="fw-logo__name">FIREWATCH <span>AFRICA</span></span><br /><span className="fw-logo__sub">Détections thermiques</span></span>
    </span>
  );
}

export function Sidebar({ current, hrefOf, health, assistantEnabled = true, collapsed = false, onToggle }: { current: string; hrefOf: (r: string) => string; health?: { status: string; version: string }; assistantEnabled?: boolean; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <aside id="fw-sidebar" className="fw-sidebar" aria-label="Navigation principale">
      <div className="fw-sidebar__head"><a className="fw-logo" href={hrefOf('dashboard')} aria-label="FireWatch Africa — accueil"><Logo /></a>{onToggle && <button className="fw-sidebar__toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Développer la navigation' : 'Réduire la navigation'} aria-pressed={collapsed} title={collapsed ? 'Développer la navigation' : 'Réduire la navigation'}><Icon name={collapsed ? 'panelExpand' : 'panelCollapse'} size={18} /></button>}</div>
      <nav className="fw-nav">{NAV.map((g) => (
        <div className="fw-nav__group" key={g.group}><div className="fw-nav__label">{g.group}</div>
          {g.items.filter((i) => assistantEnabled || i.route !== 'assistant').map((i) => (
            <a key={i.route} className="fw-nav__item" href={hrefOf(i.route)} title={i.label} aria-current={current === i.route ? 'page' : undefined}><Icon name={i.icon} size={18} /><span>{i.label}</span>{i.badge && <span className="fw-nav__badge">{i.badge}</span>}</a>
          ))}</div>))}
      </nav>
      <div className="fw-sidebar__foot"><div className="row"><span className={`fw-dot${health?.status === 'ok' ? '' : ' fw-dot--err'}`} /><span className="txt">API {health?.status === 'ok' ? 'opérationnelle' : 'indisponible'}{health && <> · <span className="mono">v{health.version}</span></>}</span></div></div>
    </aside>
  );
}

export function Topbar({ title, crumbs, lastUpdate, freshness = 'ok', onMenu, menuExpanded, onAssistant, periodControl }: { title: string; crumbs: string; lastUpdate?: string; freshness?: 'ok' | 'warn' | 'err'; onMenu: () => void; menuExpanded?: boolean; onAssistant?: () => void; periodControl?: ReactNode }) {
  return (
    <header className="fw-topbar">
      <button type="button" className="fw-topbar__menu" onClick={onMenu} aria-controls="fw-sidebar" aria-expanded={menuExpanded}
        aria-label={menuExpanded ? 'Replier le menu' : 'Déplier le menu'} title={menuExpanded ? 'Replier le menu' : 'Déplier le menu'}>
        <Icon name="menu" size={22} />
      </button>
      <div className="fw-topbar__title"><div className="fw-crumbs">{crumbs}</div><h1>{title}</h1></div>
      <div className="fw-topbar__spacer" />
      <div className="hide-mobile">{periodControl}</div>
      <div className="fw-fresh" role="status" title="Dernière mise à jour des données"><span className={`fw-dot${freshness === 'ok' ? '' : freshness === 'warn' ? ' fw-dot--warn' : ' fw-dot--err'}`} /><span className="txt"><span className="txt-long">Mise à jour </span><span className="mono">{lastUpdate ? fmt.utc(lastUpdate) : '—'}</span></span></div>
      {onAssistant && <button className="btn btn--nasa btn--sm hide-mobile" onClick={onAssistant}><Icon name="sparkle" />Assistant</button>}
    </header>
  );
}

export function BottomNav({ current, hrefOf, onMore }: { current: string; hrefOf: (r: string) => string; onMore: () => void }) {
  const items: [string, string, string][] = [['dashboard', 'Accueil', 'dashboard'], ['carte', 'Carte', 'globe'], ['gabon', 'Gabon', 'gabon'], ['evenements', 'Événements', 'events']];
  return (
    <nav className="bnav" aria-label="Navigation rapide">
      {items.map(([r, l, i]) => <a key={r} href={hrefOf(r)} aria-current={current === r ? 'page' : undefined}><Icon name={i} size={20} /><span>{l}</span></a>)}
      <button onClick={onMore} aria-label="Plus de rubriques"><Icon name="menu" size={20} /><span>Plus</span></button>
    </nav>
  );
}

/** AppShell — gère le tiroir de navigation mobile, le voile, l'échappement clavier et le lien d'évitement. */
export function AppShell({ route, sidebar, topbar, banners, children, bottomNav, overlay }: { route: string; sidebar: ReactNode; topbar: (toggleMenu: () => void, menuExpanded: boolean) => ReactNode; banners?: ReactNode; children: ReactNode; bottomNav?: (openNav: () => void) => ReactNode; overlay?: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { const saved = localStorage.getItem('firewatch.sidebar.collapsed'); return saved === null ? window.innerWidth < 1280 : saved === 'true'; } catch { return false; } });
  const toggleSidebar = () => setSidebarCollapsed((value) => !value);
  // Bouton ☰ de l'en-tête : sur mobile (≤ 767 px, menu en tiroir) il ouvre/ferme le tiroir ;
  // sinon il replie/déplie la barre latérale, comme le bouton de la barre elle-même.
  // La carte plein écran masque la barre latérale : le menu s'y ouvre toujours en tiroir.
  const isDrawer = () => route === 'carte' || (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const toggleMenu = () => (isDrawer() ? setNavOpen((v) => !v) : toggleSidebar());
  const menuExpanded = isDrawer() ? navOpen : !sidebarCollapsed;
  useEffect(() => setNavOpen(false), [route]);
  useEffect(() => { try { localStorage.setItem('firewatch.sidebar.collapsed', String(sidebarCollapsed)); } catch { /* preference not persisted */ } }, [sidebarCollapsed]);
  // Les écrans qui ont leur propre en-tête (carte plein écran) demandent l'ouverture du menu par un événement.
  useEffect(() => { const t = () => setNavOpen((v) => !v); addEventListener('fw:toggle-menu', t); return () => removeEventListener('fw:toggle-menu', t); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  return (
    <div className="fw-frame">
      <div className={`fw-app${navOpen ? ' nav-open' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`} data-route={route}>
        <a className="skip-link" href="#main">Aller au contenu</a>
        {typeof sidebar === 'object' && sidebar !== null ? (() => { const node = sidebar as ReactElement<{ collapsed?: boolean; onToggle?: () => void }>; return cloneElement(node, isDrawer() && navOpen
          // En tiroir, le bouton du menu le referme : il reste toujours un bouton visible pour fermer.
          ? { collapsed: false, onToggle: () => setNavOpen(false) }
          : { collapsed: sidebarCollapsed, onToggle: toggleSidebar }); })() : sidebar}
        {topbar(toggleMenu, menuExpanded)}
        <div className="fw-banners">{banners}</div>
        <main className="fw-main" id="main" tabIndex={-1}>{children}</main>
        {bottomNav?.(() => setNavOpen(true))}
        <div className={`scrim${navOpen ? ' is-on' : ''}`} onClick={() => setNavOpen(false)} />
        {overlay}
      </div>
    </div>
  );
}
