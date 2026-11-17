/* ==========================================================================
   FireWatch Africa — composants d'interface (vanilla JS, rendus en chaînes)
   Chaque fonction correspond à un composant React de /components (même nom).
   ========================================================================== */
(function () {
  const D = window.FW_DATA;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR'); const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }); const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const fmt = { n: (v) => (v == null ? '—' : nf.format(v)), d1: (v) => (v == null ? '—' : nf1.format(v)), d2: (v) => (v == null ? '—' : nf2.format(v)), pct: (v) => (v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v * 100) + ' %') };

  // ---------- icônes (trait 1.75, 24×24) ----------
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    gabon: '<path d="M7 4l5 1 4-1 2 4-1 4 2 4-3 3-4-1-3 2-3-3 1-4-2-3z"/><circle cx="12" cy="11" r="1.6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    events: '<path d="M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',
    zones: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
    compare: '<path d="M12 3v18"/><rect x="3" y="6" width="6" height="12" rx="1.5"/><circle cx="18" cy="12" r="3.5"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7M8 11h5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>', reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>', expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
    wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', pinOff: '<path d="M2 2l20 20"/><path d="M9.2 4.2A7 7 0 0 1 19 9.5c0 1.7-.7 3.4-1.7 5M14.6 17.8C13.2 19.6 12 21 12 21s-7-6.2-7-11.5c0-.9.2-1.8.5-2.6"/>',
    satellite: '<path d="M13 7l4 4-6 6-4-4z"/><path d="M15 5l2-2 4 4-2 2M5 15l-2 2 4 4 2-2"/><path d="M16 16a4 4 0 0 1-4 4"/>',
    flame: '<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5.6-2.6 1.4-3.5.2 1.3.9 2 1.6 2.3C11 8 11 5.5 12 3z"/><path d="M8.5 15.5A4 4 0 0 0 12 21a5.5 5.5 0 0 0 5.5-5.5"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>', arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>', chevronRight: '<path d="M9 6l6 6-6 6"/>', chevronDown: '<path d="M6 9l6 6 6-6"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>', download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>', external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18z"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M9 4v16"/>', ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>',
  };
  const icon = (name, cls = '') => `<svg class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;

  // symboles de forme (capteur / événement) — la forme double toujours la couleur
  const shape = (kind, size = 12, fillVar) => {
    const s = size, h = s / 2; const fill = fillVar || (kind === 'MODIS' ? 'var(--fw-color-sensor-modis)' : kind === 'VIIRS' ? 'var(--fw-color-sensor-viirs)' : 'var(--fw-color-sensor-fused)');
    const body = kind === 'MODIS' ? `<rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="1.5" fill="${fill}"/>` : kind === 'VIIRS' ? `<circle cx="${h}" cy="${h}" r="${h - 1}" fill="${fill}"/>` : `<path d="M${h} 0.5 L${s - 0.5} ${h} L${h} ${s - 0.5} L0.5 ${h}Z" fill="${fill}"/>`;
    return `<svg class="sym" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${body}</svg>`;
  };

  // ---------- badges ----------
  const LEVEL = { low: { label: 'Faible', ico: '▽' }, moderate: { label: 'Modéré', ico: '◆' }, high: { label: 'Élevé', ico: '▲' } };
  const LevelBadge = (lv, pill = false) => `<span class="lvl lvl--${lv}${pill ? ' pill' : ''}"><span class="lvl__ico" aria-hidden="true">${LEVEL[lv].ico}</span>${LEVEL[lv].label}</span>`;
  const CONF = { low: 'Faible', nominal: 'Nominale', high: 'Élevée' };
  const ConfidenceBadge = (d) => { const raw = d.instrument === 'MODIS' ? `${d.confidence} %` : String(d.confidence).toUpperCase(); return `<span class="conf conf--${d.conf_class}" title="Valeur brute FIRMS : ${esc(raw)}"><span class="conf__bars" aria-hidden="true"><i></i><i></i><i></i></span>${CONF[d.conf_class]} <span class="muted mono small">(${esc(raw)})</span></span>`; };
  const SatelliteBadge = (satId) => { const s = D.SAT[satId]; return `<span class="badge badge--${s.sensor.toLowerCase()}">${shape(s.sensor, 9)}${esc(s.label)}</span>`; };
  const SensorBadge = (sensor) => `<span class="badge badge--${sensor.toLowerCase()}">${shape(sensor, 9)}${sensor} <span class="muted" style="font-weight:500">${sensor === 'MODIS' ? '≈1 km' : '375 m'}</span></span>`;
  const DemoBadge = (txt = 'DÉMO') => `<span class="badge badge--demo" title="Données de démonstration générées localement — non issues d'observations réelles">${txt}</span>`;
  const ExpBadge = () => `<span class="badge badge--exp">${icon('alert')}Expérimental</span>`;
  const HarmonizationScore = (score, size = 44, label = true) => {
    const r = size / 2 - 4, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, score));
    return `<span class="hscore${size > 60 ? ' hscore--lg' : ''}" role="img" aria-label="Score d'harmonisation ${fmt.d2(score)} sur 1"><span class="hscore__ring"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fw-color-bg-surface3)" stroke-width="${size > 60 ? 7 : 4}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fw-color-sensor-fused)" stroke-width="${size > 60 ? 7 : 4}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" style="transition: stroke-dashoffset .6s var(--fw-motion-easing-standard)"/></svg><b>${fmt.d2(score)}</b></span>${label ? `<span class="small muted">${v >= 0.75 ? 'Rapprochement fort' : v >= 0.5 ? 'Rapprochement modéré' : 'Rapprochement faible'}</span>` : ''}</span>`;
  };

  // ---------- états ----------
  const STATE_COPY = {
    empty: { ico: 'inbox', t: 'Aucune donnée disponible', p: 'Aucune détection thermique n’a été enregistrée pour cette période et cette zone. Essayez une période plus longue.' },
    noresult: { ico: 'filter', t: 'Aucun résultat pour ces filtres', p: 'Les filtres actifs excluent toutes les détections. Élargissez la période, réactivez un capteur ou abaissez le niveau de confiance.' },
    offline: { ico: 'wifiOff', t: 'Vous êtes hors connexion', p: 'Les données affichées proviennent du cache local. Elles seront actualisées dès le retour de la connexion.' },
    geoloc: { ico: 'pinOff', t: 'Position indisponible', p: 'Votre position n’a pas pu être déterminée (autorisation refusée ou signal insuffisant). La vue Afrique est utilisée par défaut.' },
    emptymap: { ico: 'globe', t: 'Aucune détection dans cette vue', p: 'La zone visible ne contient aucune détection pour les filtres actuels. Dézoomez ou revenez à la vue mondiale.' },
  };
  const EmptyState = (kind = 'empty', actions = '') => { const c = STATE_COPY[kind]; return `<div class="state state--${kind === 'noresult' ? 'filter' : kind}" role="status"><div class="state__ico">${icon(c.ico)}</div><h3>${c.t}</h3><p>${c.p}</p>${actions ? `<div class="row" style="justify-content:center;margin-top:6px">${actions}</div>` : ''}</div>`; };
  const ErrorState = (err) => `<div class="state state--error" role="alert"><div class="state__ico">${icon('server')}</div><h3>Les données n’ont pas pu être chargées</h3><p>${esc(err?.message || 'Erreur inconnue.')} Vos filtres sont conservés ; réessayez dans quelques instants.</p><code>${esc(err?.status || 'ERR')} · ${esc(err?.code || '')} · GET ${esc((err?.path || '').split('?')[0])}</code><div class="row" style="justify-content:center;margin-top:6px"><button class="btn btn--sm" data-action="retry">${icon('refresh')}Réessayer</button><a class="btn btn--sm btn--ghost" href="#methodologie">État des sources</a></div></div>`;
  const LoadingState = (variant = 'block', h = 220) => {
    if (variant === 'stats') return `<div class="stats" aria-busy="true" aria-label="Chargement des indicateurs">${Array.from({ length: 6 }, () => `<div class="card stat"><div class="skel" style="height:12px;width:60%"></div><div class="skel" style="height:28px;width:70%;margin-top:12px"></div><div class="skel" style="height:10px;width:40%;margin-top:10px"></div></div>`).join('')}</div>`;
    if (variant === 'chart') return `<div aria-busy="true" style="height:${h}px;display:flex;align-items:flex-end;gap:6px;padding:10px 0">${Array.from({ length: 28 }, (_, i) => `<div class="skel" style="flex:1;height:${25 + 60 * Math.abs(Math.sin(i / 3))}%"></div>`).join('')}</div>`;
    if (variant === 'list') return `<div aria-busy="true">${Array.from({ length: 5 }, () => `<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--fw-color-border-subtle)"><div class="skel" style="width:22px;height:14px"></div><div style="flex:1"><div class="skel" style="height:12px;width:70%"></div><div class="skel" style="height:8px;width:40%;margin-top:8px"></div></div></div>`).join('')}</div>`;
    if (variant === 'map') return `<div class="map" aria-busy="true" aria-label="Chargement de la carte" style="display:grid;place-items:center"><div style="text-align:center"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--fw-color-border-default)" stroke-width="1"/><circle cx="32" cy="32" r="16" fill="none" stroke="var(--fw-color-border-subtle)" stroke-width="1"/><path d="M32 6 A26 26 0 0 1 58 32" fill="none" stroke="var(--fw-color-nasa-500)" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="1.6s" repeatCount="indefinite"/></path></svg><div class="small muted" style="margin-top:8px">Chargement des détections…</div></div></div>`;
    return `<div aria-busy="true" style="padding:4px 0"><div class="skel" style="height:${h}px"></div></div>`;
  };

  // ---------- StatCard ----------
  const StatCard = ({ label, value, unit, foot, sym, accent, spark, demo }) => `<div class="card stat${accent ? ' stat--accent' : ''}"><div class="stat__label">${sym || ''}${esc(label)}${demo ? DemoBadge() : ''}</div><div class="stat__row"><div class="stat__value">${value}${unit ? `<small>${unit}</small>` : ''}</div>${spark ? `<div class="stat__spark">${spark}</div>` : ''}</div><div class="stat__foot">${foot || ''}</div></div>`;
  const sparkline = (vals, w = 76, h = 26, color = 'var(--fw-color-thermal-500)') => { if (!vals.length) return ''; const mx = Math.max(1, ...vals); const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - 2 - (v / mx) * (h - 4)}`).join(' '); return `<svg width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`; };

  // ---------- tableau ----------
  const DataTable = ({ cols, rows, caption, rowAttr, max }) => `<div class="table-wrap"${max ? ` style="max-height:${max}px"` : ''}><table class="table">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}<thead><tr>${cols.map((c) => `<th scope="col" class="${c.r ? 'r' : ''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr ${rowAttr ? rowAttr(r, i) : ''}>${cols.map((c) => `<td class="${c.r ? 'r' : ''}${c.mono ? ' num' : ''}">${c.v(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  // ---------- toasts ----------
  function toast(title, body, kind = 'info', ms = 5200) {
    const box = document.querySelector('.toasts'); if (!box) return;
    const el = document.createElement('div'); el.className = `toast toast--${kind}`; el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = `${icon(kind === 'err' ? 'alert' : kind === 'warn' ? 'alert' : kind === 'ok' ? 'check' : 'info')}<div><strong>${esc(title)}</strong>${body ? `<span class="secondary">${esc(body)}</span>` : ''}</div><button class="btn btn--ghost btn--sm btn--icon" aria-label="Fermer la notification">${icon('x')}</button>`;
    el.querySelector('button').onclick = () => el.remove(); box.appendChild(el); setTimeout(() => el.remove(), ms);
  }

  // ==========================================================================
  // Graphiques SVG (TimelineChart, BarChart, HeatmapCalendar)
  // ==========================================================================
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  const shortDate = (k, gran) => { const [y, m, d] = k.split('-'); const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']; return gran === 'month' ? `${mois[+m - 1]} ${y}` : `${+d} ${mois[+m - 1]}`; };

  function TimelineChart(el, { x, series, height = 220, gran = 'day', unusual = [], yFormat = fmt.n, caption, stacked = false, area = true }) {
    const W = Math.max(280, el.clientWidth || 600), H = height, m = { t: 12, r: 12, b: 26, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b; const n = x.length;
    const ymax = niceMax(Math.max(1, ...x.map((_, i) => (stacked ? series.reduce((s, se) => s + se.values[i], 0) : Math.max(...series.map((se) => se.values[i]))))));
    const X = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw), Y = (v) => m.t + ih - (v / ymax) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
    let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(caption || 'Graphique temporel')}"><g class="grid">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`).join('')}</g><g class="axis">${ticks.map((t) => `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${yFormat(t)}</text>`).join('')}${x.map((k, i) => (i % every === 0 ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${shortDate(k, gran)}</text>` : '')).join('')}</g>`;
    const base = new Array(n).fill(0);
    series.forEach((se, si) => {
      const top = se.values.map((v, i) => (stacked ? base[i] + v : v));
      const pts = top.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
      if (area) { const bottom = stacked ? base.map((v, i) => `${X(i)},${Y(v)}`).reverse().join(' ') : `${X(n - 1)},${Y(0)} ${X(0)},${Y(0)}`; s += `<polygon class="chart__area" points="${pts} ${bottom}" fill="${se.color}"/>`; }
      s += `<polyline class="chart__line chart__draw" points="${pts}" stroke="${se.color}" ${se.dash ? `stroke-dasharray="${se.dash}" style="animation:none;stroke-dashoffset:0"` : ''} style="animation-delay:${si * 120}ms"/>`;
      if (stacked) top.forEach((v, i) => (base[i] = v));
    });
    unusual.forEach((i) => { const v = stacked ? base[i] : Math.max(...series.map((se) => se.values[i])); s += `<g><path d="M${X(i)} ${Y(v) - 14} l5 8 h-10z" fill="var(--fw-color-text-primary)"/><title>Jour inhabituel : ${shortDate(x[i])}</title></g>`; });
    s += `<line class="chart__rule" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="display:none"/>`;
    s += `<rect class="chart__hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/></svg><div class="tooltip" aria-hidden="true"></div>`;
    el.innerHTML = s; el.classList.add('chart');
    const svg = el.querySelector('svg'), rule = el.querySelector('.chart__rule'), tip = el.querySelector('.tooltip');
    el.querySelector('.chart__hit').addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect(); const px = ev.clientX - r.left; const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      rule.setAttribute('x1', X(i)); rule.setAttribute('x2', X(i)); rule.style.display = '';
      tip.innerHTML = `<b>${shortDate(x[i], gran)}${gran === 'week' ? ' (semaine)' : ''}</b>${series.map((se) => `<div class="tr"><span><i class="sw" style="background:${se.color}"></i>${esc(se.name)}</span><em>${yFormat(se.values[i])}</em></div>`).join('')}${stacked ? `<div class="tr"><span>Total</span><em>${yFormat(series.reduce((a, se) => a + se.values[i], 0))}</em></div>` : ''}`;
      tip.classList.add('is-on'); const tx = X(i) + 14 + 170 > W ? X(i) - 184 : X(i) + 14; tip.style.left = tx + 'px'; tip.style.top = m.t + 'px';
    });
    el.querySelector('.chart__hit').addEventListener('pointerleave', () => { rule.style.display = 'none'; tip.classList.remove('is-on'); });
  }
  function BarChart(el, { cats, series, height = 200, yFormat = fmt.n, caption, horizontal = false }) {
    const W = Math.max(260, el.clientWidth || 500);
    if (horizontal) {
      const rowH = 30, H = cats.length * rowH * series.length * 0.75 + 10 + cats.length * 8; const m = { l: 96, r: 54 };
      const mx = niceMax(Math.max(1, ...series.flatMap((s) => s.values))); const bw = 10; let y = 6; let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(caption)}">`;
      cats.forEach((c, ci) => { s += `<text x="0" y="${y + (series.length * (bw + 2)) / 2 + 4}" fill="var(--fw-color-text-secondary)" font-size="12">${esc(c)}</text>`; series.forEach((se, si) => { const w = ((W - m.l - m.r) * se.values[ci]) / mx; s += `<rect class="chart__bar" x="${m.l}" y="${y}" width="${Math.max(2, w)}" height="${bw}" rx="2" fill="${se.color}"><title>${esc(c)} · ${esc(se.name)} : ${yFormat(se.values[ci])}</title></rect><text x="${m.l + w + 6}" y="${y + bw - 1}" fill="var(--fw-color-text-secondary)" font-size="11" font-family="var(--fw-font-family-mono)">${yFormat(se.values[ci])}</text>`; y += bw + 2; }); y += 12; });
      el.innerHTML = s + '</svg>'; el.classList.add('chart'); return;
    }
    const H = height, m = { t: 10, r: 8, b: 30, l: 40 }; const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const mx = niceMax(Math.max(1, ...series.flatMap((s) => s.values))); const gw = iw / cats.length; const bw = Math.min(26, (gw - 12) / series.length);
    const Y = (v) => m.t + ih - (v / mx) * ih; const ticks = [0, 0.5, 1].map((f) => f * mx);
    let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(caption)}"><g class="grid">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`).join('')}</g><g class="axis">${ticks.map((t) => `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${yFormat(t)}</text>`).join('')}</g>`;
    cats.forEach((c, ci) => { const gx = m.l + ci * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2; series.forEach((se, si) => { const v = se.values[ci]; const h = Math.max(1, ih - (Y(v) - m.t)); const x = gx + si * (bw + 2); s += `<path class="chart__bar" d="M${x} ${m.t + ih} V${m.t + ih - h + 3} q0 -3 3 -3 h${bw - 6} q3 0 3 3 V${m.t + ih} Z" fill="${se.color}"><title>${esc(c)} · ${esc(se.name)} : ${yFormat(v)}</title></path>`; }); s += `<text x="${m.l + ci * gw + gw / 2}" y="${H - 10}" text-anchor="middle" fill="var(--fw-color-text-secondary)" font-size="11.5">${esc(c)}</text>`; });
    el.innerHTML = s + '</svg>'; el.classList.add('chart');
  }
  function HeatmapCalendar(el, { days, unusual = new Set() }) {
    // days: [{date, value}] → colonnes = semaines, lignes = lun..dim
    const mx = Math.max(1, ...days.map((d) => d.value)); const steps = ['var(--fw-color-bg-surface2)', 'var(--fw-color-chart-seq1)', 'var(--fw-color-chart-seq2)', 'var(--fw-color-chart-seq3)', 'var(--fw-color-chart-seq4)', 'var(--fw-color-chart-seq5)'];
    const lvl = (v) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / mx) * 4.999)));
    const first = new Date(days[0].date + 'T00:00:00Z'); const offset = (first.getUTCDay() + 6) % 7; const cells = [...Array(offset).fill(null), ...days];
    const weeks = Math.ceil(cells.length / 7);
    const lbl = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const cs = Math.max(12, Math.min(22, Math.floor(((el.clientWidth || 300) - 30) / weeks) - 3));
    let s = `<div style="display:grid;grid-template-columns:16px auto;gap:6px;justify-content:start"><div class="cal" style="grid-template-rows:repeat(7,${cs}px);font-size:10px;color:var(--fw-color-text-muted)">${lbl.map((l) => `<span style="display:grid;align-items:center">${l}</span>`).join('')}</div><div class="cal" role="grid" aria-label="Calendrier de l’activité thermique quotidienne" style="grid-template-columns:repeat(${weeks},${cs}px);grid-template-rows:repeat(7,${cs}px);grid-auto-flow:column">`;
    cells.forEach((c) => { if (!c) { s += '<span></span>'; return; } const l = lvl(c.value); s += `<span role="gridcell" class="cal__cell${unusual.has(c.date) ? ' is-unusual' : ''}" style="background:${steps[l]}" title="${shortDate(c.date)} : ${fmt.n(c.value)} détections${unusual.has(c.date) ? ' — jour inhabituel' : ''}" aria-label="${shortDate(c.date)} : ${c.value} détections${unusual.has(c.date) ? ', jour inhabituel' : ''}"></span>`; });
    s += `</div></div><div class="row" style="justify-content:space-between;margin-top:10px"><div class="cal__scale">Moins ${steps.map((c) => `<i style="background:${c}"></i>`).join('')} Plus</div><span class="small muted">▲ jour inhabituel (écart &gt; 2σ)</span></div>`;
    el.innerHTML = s;
  }
  const dataAlt = (cols, rows, label = 'Voir les données (tableau)') => `<details class="data-alt"><summary>${icon('table', '')}<span>${label}</span></summary>${DataTable({ cols, rows, caption: label, max: 240 })}</details>`;

  // ==========================================================================
  // FireMap — carte SVG équirectangulaire avec clustering par niveau de zoom
  // (prototype : en production → MapLibre GL + supercluster / deck.gl)
  // ==========================================================================
  const G = window.FW_GEO;
  const polyPath = (pts) => 'M' + pts.map(([x, y]) => `${x},${-y}`).join('L') + 'Z';
  const LAND_PATHS = Object.entries(G.LAND).map(([k, pts]) => `<path class="map__land${k === 'africa' || k === 'madagascar' ? ' map__land--focus' : ''}" d="${polyPath(pts)}"/>`).join('') + Object.values(G.WATER).map((pts) => `<path class="map__water" d="${polyPath(pts)}"/>`).join('');
  const GRAT = (() => { let s = ''; for (let x = -180; x <= 180; x += 30) s += `M${x},-85V85`; for (let y = -60; y <= 80; y += 30) s += `M-180,${-y}H180`; return `<path class="map__grat" d="${s}"/>`; })();
  const CITIES = [['Libreville', 9.45, 0.39], ['Port-Gentil', 8.78, -0.72], ['Franceville', 13.58, -1.63], ['Oyem', 11.58, 1.6], ['Makokou', 12.86, 0.57], ['Lambaréné', 10.24, -0.7], ['Mouila', 11.06, -1.87], ['Tchibanga', 11.03, -2.85], ['Koulamoutou', 12.47, -1.13]];
  const VIEWS = { world: [-180, -84, 360, 142], africa: [-22, -39, 78, 76], gabon: [8.2, -2.7, 6.8, 7.0], central: [5, -12, 30, 24] };
  const frpClass = (f) => (f >= 100 ? 3 : f >= 15 ? 2 : 1);

  class FireMap {
    constructor(el, opts) {
      this.el = el; this.o = Object.assign({ points: [], events: [], hotspots: [], view: 'world', interactive: true, cluster: true, admin: false, labels: true, legend: true, choropleth: null, recentT: D.LAST_UPDATE - D.DAY, onSelect: null, controls: true, viewButtons: true, emptyKind: null, showGraticule: true }, opts);
      if (this.o.view === 'world' && el.clientWidth && el.clientWidth < 520) this.o.view = 'africa';
      this.vb = [...(Array.isArray(this.o.view) ? this.o.view : VIEWS[this.o.view])]; this.selected = null;
      this.build(); this.fit(); this.render();
      this.ro = new ResizeObserver(() => { this.fit(); this.render(); }); this.ro.observe(el);
    }
    build() {
      const o = this.o; const prov = o.admin ? G.PROVINCES.map((p) => { const ch = o.choropleth?.[p.name]; return `<path class="map__prov${ch ? ' is-choro' : ''}" d="${polyPath(p.poly)}" ${ch ? `style="fill:${ch.fill}"` : ''} data-prov="${esc(p.name)}"><title>${esc(p.name)}${ch ? ` — ${ch.label}` : ''}</title></path>`; }).join('') : '';
      this.el.classList.add('map'); this.el.setAttribute('data-kbd', '');
      this.el.innerHTML = `<svg class="map__svg" role="application" aria-roledescription="carte" aria-label="Carte des détections thermiques. Flèches pour déplacer, + et − pour zoomer, 0 pour réinitialiser." tabindex="${o.interactive ? 0 : -1}" preserveAspectRatio="xMidYMid meet"><g class="g-base">${o.showGraticule ? GRAT : ''}${LAND_PATHS}<path class="map__gabon" d="${polyPath(G.GABON)}"/>${prov}</g><g class="g-hot"></g><g class="g-pts"></g><g class="g-lbl"></g></svg>
        ${o.controls ? `<div class="map__ctrl map__ctrl--tr"><div class="map__btngroup"><button data-z="in" aria-label="Zoom avant">${icon('plus')}</button><button data-z="out" aria-label="Zoom arrière">${icon('minus')}</button><button data-z="locate" aria-label="Centrer sur ma position">${icon('crosshair')}</button></div></div>` : ''}
        ${o.viewButtons ? `<div class="map__ctrl map__ctrl--tl"><div class="map__views" role="group" aria-label="Vues prédéfinies"><button data-view="world">Monde</button><button data-view="africa">Afrique</button><button data-view="gabon">Gabon</button></div>${o.extraTL || ''}</div>` : (o.extraTL ? `<div class="map__ctrl map__ctrl--tl">${o.extraTL}</div>` : '')}
        <div class="map__ctrl map__ctrl--bl"><div class="map__scale"><span class="scale-txt">—</span><i class="scale-bar" style="width:80px"></i></div>${o.interactive ? '<div class="map__readout" aria-hidden="true">— , —</div>' : ''}</div>
        ${o.legend ? `<div class="map__ctrl map__ctrl--br">${MapLegend({ ...(o.legendOpts || {}), collapsed: o.legendOpts?.collapsed || (this.el.clientWidth && this.el.clientWidth < 560) })}</div>` : ''}
        <div class="popup-slot"></div><div class="empty-slot"></div>`;
      this.svg = this.el.querySelector('svg'); this.gPts = this.el.querySelector('.g-pts'); this.gHot = this.el.querySelector('.g-hot'); this.gLbl = this.el.querySelector('.g-lbl');
      if (o.interactive) this.bind();
      this.el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.view)));
      this.el.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => { const z = b.dataset.z; if (z === 'locate') return this.o.onLocate ? this.o.onLocate() : null; this.zoom(z === 'in' ? 0.6 : 1 / 0.6); }));
      const lg = this.el.querySelector('.map-legend [data-collapse]'); if (lg) lg.addEventListener('click', () => { const L = this.el.querySelector('.map-legend'); L.classList.toggle('is-collapsed'); lg.textContent = L.classList.contains('is-collapsed') ? 'Afficher' : 'Masquer'; lg.setAttribute('aria-expanded', !L.classList.contains('is-collapsed')); });
    }
    bind() {
      let drag = null; const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.mk,.cl')) return; drag = { x: e.clientX, y: e.clientY, vb: [...this.vb], moved: false }; svg.setPointerCapture(e.pointerId); svg.classList.add('is-dragging'); });
      svg.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect(); const k = this.vb[2] / r.width; const lon = this.vb[0] + (e.clientX - r.left - this.padX) * k, lat = -(this.vb[1] + (e.clientY - r.top - this.padY) * k);
        const ro = this.el.querySelector('.map__readout'); if (ro) ro.textContent = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'O'}`;
        if (!drag) return; const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
        this.vb[0] = drag.vb[0] - dx; this.vb[1] = drag.vb[1] - dy; this.apply(); this.schedule();
      });
      const end = () => { if (drag) { svg.classList.remove('is-dragging'); drag = null; this.render(); } };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); const k = this.vb[2] / r.width; const cx = this.vb[0] + (e.clientX - r.left - this.padX) * k, cy = this.vb[1] + (e.clientY - r.top - this.padY) * k; this.zoom(e.deltaY > 0 ? 1.18 : 1 / 1.18, cx, cy); }, { passive: false });
      svg.addEventListener('keydown', (e) => { const s = this.vb[2] * 0.12; const map = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }; if (map[e.key]) { e.preventDefault(); this.vb[0] += map[e.key][0]; this.vb[1] += map[e.key][1]; this.apply(); this.render(); } else if (e.key === '+' || e.key === '=') this.zoom(0.7); else if (e.key === '-') this.zoom(1 / 0.7); else if (e.key === '0') this.setView(this.o.view); else if (e.key === 'Escape') this.select(null); });
      svg.addEventListener('click', (e) => {
        const mk = e.target.closest('.mk'); const cl = e.target.closest('.cl');
        if (mk) { const p = this.visible[+mk.dataset.i]; this.select(p); }
        else if (cl) { const c = this.clusters[+cl.dataset.i]; const b = c.bbox; const w = Math.max(0.3, (b[2] - b[0]) * 1.6), h = Math.max(0.3, (b[3] - b[1]) * 1.6); const cx = (b[0] + b[2]) / 2, cy = -(b[1] + b[3]) / 2; const ww = Math.max(w, h * this.aspect); this.animateTo([cx - ww / 2, cy - ww / this.aspect / 2, ww, ww / this.aspect]); }
      });
    }
    fit() { const r = this.el.getBoundingClientRect(); this.W = r.width || 600; this.H = r.height || 400; this.aspect = this.W / this.H; const cx = this.vb[0] + this.vb[2] / 2, cy = this.vb[1] + this.vb[3] / 2; let w = this.vb[2], h = this.vb[3]; if (w / h < this.aspect) w = h * this.aspect; else h = w / this.aspect; this.vb = [cx - w / 2, cy - h / 2, w, h]; this.padX = 0; this.padY = 0; this.apply(); }
    apply() { this.svg.setAttribute('viewBox', this.vb.join(' ')); const k = this.vb[2] / this.W; const km = 80 * k * 111.32 * Math.cos(((-(this.vb[1] + this.vb[3] / 2)) * Math.PI) / 180); const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((v) => v >= km * 0.5) || 5000; const px = (nice / km) * 80; const unitMi = window.FW_APP?.settings?.unit === 'mi'; const sb = this.el.querySelector('.scale-bar'); const st = this.el.querySelector('.scale-txt'); if (sb) { sb.style.width = px + 'px'; st.textContent = unitMi ? `${Math.round(nice * 0.621)} mi` : `${nice} km`; } }
    schedule() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = null; this.render(); }); }
    zoom(f, cx, cy) { const [x, y, w, h] = this.vb; cx = cx ?? x + w / 2; cy = cy ?? y + h / 2; const nw = Math.min(400, Math.max(0.15, w * f)); const nh = nw / this.aspect; const rx = (cx - x) / w, ry = (cy - y) / h; this.animateTo([cx - rx * nw, cy - ry * nh, nw, nh]); }
    setView(v) { this.o.view = typeof v === 'string' ? v : this.o.view; const t = [...(typeof v === 'string' ? VIEWS[v] : v)]; let [x, y, w, h] = t; const cx = x + w / 2, cy = y + h / 2; if (w / h < this.aspect) w = h * this.aspect; else h = w / this.aspect; this.animateTo([cx - w / 2, cy - h / 2, w, h]); this.el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === v)); this.o.onView?.(v); }
    animateTo(target) { const from = [...this.vb]; const t0 = performance.now(); const dur = document.documentElement.dataset.reduceMotion === 'true' ? 0 : 320; cancelAnimationFrame(this._anim); const step = (t) => { const p = dur ? Math.min(1, (t - t0) / dur) : 1; const e = 1 - Math.pow(1 - p, 3); this.vb = from.map((v, i) => v + (target[i] - v) * e); this.apply(); if (p < 1) { this._anim = requestAnimationFrame(step); if (Math.round(p * 10) % 3 === 0) this.render(); } else this.render(); }; this._anim = requestAnimationFrame(step); }
    setData(d) { Object.assign(this.o, d); this.render(); }
    select(p) { this.selected = p; this.render(); const slot = this.el.querySelector('.popup-slot'); if (!p) { slot.innerHTML = ''; return; } if (this.o.onSelect) this.o.onSelect(p, slot, this); }
    render() {
      const o = this.o; const [x, y, w, h] = this.vb; const k = w / this.W; // degrés par pixel
      const inView = (p) => p.longitude >= x - 1 && p.longitude <= x + w + 1 && -p.latitude >= y - 1 && -p.latitude <= y + h + 1;
      const vis = o.points.filter(inView); this.visible = vis;
      // hotspots
      this.gHot.innerHTML = (o.hotspots || []).map((hs) => { const [a, b, c, d] = hs.bbox; return `<rect class="map__hot lv-${hs.level}" x="${a}" y="${-d}" width="${c - a}" height="${d - b}" rx="${(c - a) * 0.12}"><title>${esc(hs.name)} — score ${hs.score}</title></rect>`; }).join('');
      // clustering en espace écran
      const individual = !o.cluster || k < 0.012 || vis.length < 60;
      let s = '';
      if (individual) {
        this.clusters = [];
        const r = (o.markerPx || 3.6) * k; const recent = o.recentT;
        vis.forEach((p, i) => {
          const cx = p.longitude, cy = -p.latitude; const isEvt = p._isEvent; const fc = frpClass(p.frp); const sel = this.selected === p;
          const shp = isEvt ? `<path class="mk__shape" d="M${cx} ${cy - r * 1.5}L${cx + r * 1.5} ${cy}L${cx} ${cy + r * 1.5}L${cx - r * 1.5} ${cy}Z"/>` : p.instrument === 'MODIS' ? `<rect class="mk__shape" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.25}"/>` : `<circle class="mk__shape" cx="${cx}" cy="${cy}" r="${r}"/>`;
          const pulse = !isEvt && p.t >= recent ? `<circle class="mk__pulse" cx="${cx}" cy="${cy}" r="${r}"/>` : '';
          s += `<g class="mk ${isEvt ? 'mk--evt' : 'mk--f' + fc}${sel ? ' is-selected' : ''}" data-i="${i}">${pulse}<circle cx="${cx}" cy="${cy}" r="${r * 2.4}" fill="transparent"/>${shp}</g>`;
        });
      } else {
        const cell = 46 * k; const bins = new Map();
        for (const p of vis) { const key = Math.floor((p.longitude - x) / cell) + '|' + Math.floor((-p.latitude - y) / cell); let b = bins.get(key); if (!b) { b = { n: 0, hi: 0, sx: 0, sy: 0, fmax: 0, bbox: [1e9, 1e9, -1e9, -1e9] }; bins.set(key, b); } b.n++; if (p.frp >= 100) b.hi++; b.sx += p.longitude; b.sy += p.latitude; b.fmax = Math.max(b.fmax, p.frp); b.bbox[0] = Math.min(b.bbox[0], p.longitude); b.bbox[1] = Math.min(b.bbox[1], p.latitude); b.bbox[2] = Math.max(b.bbox[2], p.longitude); b.bbox[3] = Math.max(b.bbox[3], p.latitude); }
        this.clusters = [...bins.values()];
        this.clusters.forEach((b, i) => { const cx = b.sx / b.n, cy = -b.sy / b.n; const rpx = Math.min(22, 7 + Math.log2(b.n) * 2.6); const r = rpx * k; const hi = b.hi >= 3 && b.hi / b.n >= 0.08; s += `<g class="cl${hi ? ' lv-high' : ''}" data-i="${i}" role="button" aria-label="${b.n} détections regroupées"><circle class="cl__halo" cx="${cx}" cy="${cy}" r="${r * 1.45}"/><circle class="cl__core" cx="${cx}" cy="${cy}" r="${r}"/>${b.n > 1 ? `<text x="${cx}" y="${cy}" font-size="${(b.n > 999 ? 9.5 : 11) * k}">${b.n > 999 ? (b.n / 1000).toFixed(1) + 'k' : b.n}</text>` : ''}</g>`; });
      }
      this.gPts.innerHTML = s;
      // étiquettes
      let lb = '';
      if (o.labels && k < 0.03) CITIES.forEach(([n, lo, la]) => { lb += `<circle cx="${lo}" cy="${-la}" r="${2 * k}" fill="var(--fw-color-text-secondary)"/><text class="map__label map__label--city" x="${lo + 5 * k}" y="${-la + 4 * k}" font-size="${11 * k}" style="stroke-width:${3 * k}px">${n}</text>`; });
      if (o.labels && o.admin && k < 0.03) G.PROVINCES.forEach((p) => { const pts = p.poly; const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length; lb += `<text class="map__label" x="${cx}" y="${-cy + 14 * k}" font-size="${10.5 * k}" text-anchor="middle" style="stroke-width:${3 * k}px;letter-spacing:.06em;text-transform:uppercase">${esc(p.name)}</text>`; });
      if (o.labels && k > 0.06 && k < 0.5) lb += `<text class="map__label" x="11.2" y="${0.9}" font-size="${10 * k}" text-anchor="middle" style="stroke-width:${3 * k}px">Gabon</text>`;
      this.gLbl.innerHTML = lb;
      // vide
      const es = this.el.querySelector('.empty-slot'); const emptyKind = o.emptyKind || (o.points.length && !vis.length ? 'emptymap' : null);
      es.innerHTML = emptyKind ? `<div class="map__empty">${EmptyState(emptyKind, emptyKind === 'emptymap' ? '<button class="btn btn--sm" data-map-world>Vue mondiale</button>' : '')}</div>` : '';
      const bw = es.querySelector('[data-map-world]'); if (bw) bw.onclick = () => this.setView('world');
    }
    destroy() { this.ro?.disconnect(); }
  }
  function MapLegend(opts = {}) {
    const o = Object.assign({ hotspots: true, events: true, admin: false }, opts);
    return `<div class="map-legend${o.collapsed ? ' is-collapsed' : ''}" role="region" aria-label="Légende de la carte"><h4>Légende <button data-collapse aria-expanded="${!o.collapsed}">${o.collapsed ? 'Afficher' : 'Masquer'}</button></h4><ul>
      <li>${shape('VIIRS', 11, 'var(--fw-color-thermal-500)')} VIIRS · 375 m <span class="muted">(rond)</span></li>
      <li>${shape('MODIS', 11, 'var(--fw-color-thermal-500)')} MODIS · ≈ 1 km <span class="muted">(carré)</span></li>
      ${o.events ? `<li>${shape('EVT', 12)} Événement probable harmonisé</li>` : ''}
      <li><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="rgba(242,140,40,.16)"/><circle cx="11" cy="11" r="7" fill="#2B1A0D" stroke="var(--fw-color-thermal-500)"/><text x="11" y="14" font-size="8" fill="var(--fw-color-text-primary)" text-anchor="middle" font-family="monospace">12</text></svg> Regroupement (nombre)</li>
      </ul><div class="sep"></div><ul>
      <li><span class="sw sw--sq" style="background:var(--fw-color-thermal-300)"></span> FRP &lt; 15 MW</li>
      <li><span class="sw sw--sq" style="background:var(--fw-color-thermal-500)"></span> FRP 15–100 MW</li>
      <li><span class="sw sw--sq" style="background:var(--fw-color-high-500)"></span> FRP ≥ 100 MW <span class="lvl lvl--high" style="font-size:11px">▲ élevé</span></li>
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="3" fill="var(--fw-color-thermal-500)"/><circle cx="7" cy="7" r="6" fill="none" stroke="var(--fw-color-thermal-300)"/></svg> Détection &lt; 24 h (pulsation)</li>
      ${o.hotspots ? `<li><span class="sw sw--sq" style="background:rgba(242,140,40,.13);border:1px dashed rgba(242,140,40,.6)"></span> Zone de concentration</li>` : ''}
      ${o.admin ? `<li><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--fw-color-map-admin)" stroke-dasharray="4 3"/></svg> Limite provinciale (schématique)</li>` : ''}
      </ul></div>`;
  }
  // DetectionPopup — fiche détaillée d'une détection
  function DetectionPopup(p, expert) {
    const s = D.SAT[p.satellite]; const lat = `${Math.abs(p.latitude).toFixed(4)}° ${p.latitude >= 0 ? 'N' : 'S'}`, lon = `${Math.abs(p.longitude).toFixed(4)}° ${p.longitude >= 0 ? 'E' : 'O'}`;
    const tz = window.FW_APP?.settings?.tz; const local = tz === 'Africa/Libreville' ? ` <span class="muted">(${new Date(p.t + 3600000).toISOString().slice(11, 16)} WAT)</span>` : '';
    return `<div class="popup" role="dialog" aria-label="Détail de la détection ${esc(p.id)}" style="top:56px;right:58px"><div class="popup__head">${shape(p.instrument, 12, 'var(--fw-color-thermal-500)')}<div><h3>Détection thermique</h3><div class="mono small muted">${esc(p.id)}</div></div><button class="btn btn--ghost btn--sm btn--icon" data-close aria-label="Fermer">${icon('x')}</button></div>
      <dl class="kv"><dt>Latitude</dt><dd>${lat}</dd><dt>Longitude</dt><dd>${lon}</dd><dt>Date</dt><dd>${p.acq_date.split('-').reverse().join('/')}</dd><dt>Heure UTC</dt><dd>${p.acq_time.slice(0, 2)}:${p.acq_time.slice(2)} UTC${local}</dd>
      <dt>Satellite</dt><dd class="sans">${SatelliteBadge(p.satellite)}</dd><dt>Capteur</dt><dd class="sans">${p.instrument} · ${p.instrument === 'MODIS' ? '≈ 1 km' : '375 m'}</dd><dt>Confiance</dt><dd class="sans">${ConfidenceBadge(p)}</dd>
      <dt>FRP</dt><dd>${fmt.d1(p.frp)} MW ${p.frp >= 100 ? '<span class="lvl lvl--high">▲</span>' : ''}</dd><dt>Jour / nuit</dt><dd class="sans">${p.daynight === 'D' ? `${icon('sun', 'ic-inline')} Jour` : `${icon('moon', 'ic-inline')} Nuit`}</dd><dt>Produit source</dt><dd style="font-size:11px">${esc(s.product)}</dd>
      ${expert ? `<dt>Bright. ${p.instrument === 'MODIS' ? '(K)' : 'TI4 (K)'}</dt><dd>${fmt.d1(p.brightness)}</dd><dt>Scan × track</dt><dd>${p.scan} × ${p.track}</dd><dt>Version</dt><dd>${p.version}</dd>` : ''}
      ${p.province ? `<dt>Province</dt><dd class="sans">${esc(p.province)}</dd>` : ''}</dl>
      <div class="popup__foot">${p.event_id ? `<a class="btn btn--sm btn--nasa" href="#evenement-${p.event_id}">${shape('EVT', 10)} Voir l’événement ${esc(p.event_id)}</a>` : '<span>Non rattachée à un événement harmonisé</span>'}<span style="margin-left:auto">${DemoBadge()}</span></div></div>`;
  }

  window.FW_UI = { esc, fmt, icon, shape, LevelBadge, ConfidenceBadge, SatelliteBadge, SensorBadge, DemoBadge, ExpBadge, HarmonizationScore, EmptyState, ErrorState, LoadingState, StatCard, sparkline, DataTable, toast, TimelineChart, BarChart, HeatmapCalendar, dataAlt, FireMap, MapLegend, DetectionPopup, VIEWS, shortDate, frpClass, LEVEL, CONF };
})();
