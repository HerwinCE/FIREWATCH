/* ==========================================================================
   FireWatch Africa — AppShell, routeur, état global, assistant IA
   ========================================================================== */
(function () {
  const D = window.FW_DATA, U = window.FW_UI; const { icon, esc, fmt } = U; const API = D.API;
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('fw.' + k)); localStorage.setItem('fw.' + k, JSON.stringify(v)); } catch (e) { return null; } };

  // ---------- état global ----------
  const DEFAULT_SETTINGS = { lang: 'fr', theme: 'dark', unit: 'km', tz: 'UTC', basemap: 'dark', graticule: true, cluster: true, labels: true, detail: 'standard', reduceMotion: false, contrast: 'normal', largeText: false, assistant: true };
  const ALL_SATS = D.SATS.map((s) => s.id);
  const APP = window.FW_APP = {
    settings: Object.assign({}, DEFAULT_SETTINGS, store('settings') || {}),
    filters: { range: '30d', start: null, end: null, sensors: ['MODIS', 'VIIRS'], sats: [...ALL_SATS], conf: ['low', 'nominal', 'high'], eventsOnly: false, hotspots: true, daynight: 'all' },
    route: 'dashboard', param: null, maps: [], chat: [], chatHistory: [], meta: null, health: null,
    frame: 'desktop',
  };
  const RANGES = { '24h': { label: 'Dernières 24 h', days: 2 }, '7d': { label: '7 derniers jours', days: 7 }, '30d': { label: '30 derniers jours', days: 30 }, '90d': { label: '90 derniers jours', days: D.DAYS }, custom: { label: 'Personnalisée' } };
  APP.RANGES = RANGES;
  APP.period = () => { const f = APP.filters; if (f.range === 'custom' && f.start && f.end) return { start: f.start, end: f.end }; const days = RANGES[f.range]?.days || 30; const end = D.isoDate(D.END); const start = D.isoDate(Date.UTC(2026, 10, 14) - (days - 1) * D.DAY); return { start, end }; };
  APP.params = (extra = {}) => { const f = APP.filters; const p = APP.period(); const o = { start_date: p.start, end_date: p.end }; if (f.sensors.length < 2) o.sensor = f.sensors.join(',') || 'NONE'; if (f.sats.length < ALL_SATS.length) o.satellite = f.sats.join(',') || 'NONE'; return Object.assign(o, extra); };
  APP.periodLabel = () => { const p = APP.period(); const f = (s) => s.split('-').reverse().join('/'); return `${f(p.start)} → ${f(p.end)}`; };
  APP.clientFilter = (list) => { const f = APP.filters; return list.filter((d) => f.conf.includes(d.conf_class) && (f.daynight === 'all' || d.daynight === f.daynight) && (!f.eventsOnly || d.event_id)); };
  APP.filtersActive = () => { const f = APP.filters; return (f.sensors.length < 2) + (f.sats.length < ALL_SATS.length) + (f.conf.length < 3) + f.eventsOnly + (f.daynight !== 'all') + (f.range !== '30d'); };
  APP.resetFilters = () => { Object.assign(APP.filters, { range: '30d', start: null, end: null, sensors: ['MODIS', 'VIIRS'], sats: [...ALL_SATS], conf: ['low', 'nominal', 'high'], eventsOnly: false, daynight: 'all' }); };
  APP.applySettings = () => { const s = APP.settings, r = document.documentElement; r.dataset.theme = s.theme; r.dataset.reduceMotion = s.reduceMotion; r.dataset.contrast = s.contrast; r.dataset.largeText = s.largeText; r.lang = s.lang; store('settings', s); document.querySelectorAll('[data-assistant-ui]').forEach((e) => (e.hidden = !s.assistant)); };

  // ---------- navigation ----------
  const NAV = [
    { group: 'Surveillance', items: [['dashboard', 'Dashboard', 'dashboard'], ['carte', 'Carte mondiale', 'globe'], ['gabon', 'Gabon', 'gabon']] },
    { group: 'Analyse', items: [['historique', 'Historique', 'history'], ['evenements', 'Événements harmonisés', 'events'], ['zones', 'Zones sensibles', 'zones'], ['comparaison', 'MODIS / VIIRS', 'compare']] },
    { group: 'Référence', items: [['methodologie', 'Sources et méthodologie', 'book'], ['assistant', 'Assistant IA', 'sparkle'], ['parametres', 'Paramètres', 'settings']] },
    { group: 'Maquette', items: [['design-system', 'Design system', 'palette'], ['etats', 'États & composants', 'layers']] },
  ];
  const TITLES = { dashboard: 'Dashboard', carte: 'Carte mondiale', gabon: 'Vue Gabon', historique: 'Historique temporel', evenements: 'Événements harmonisés', evenement: 'Détail d’un événement', zones: 'Zones de concentration', comparaison: 'Comparaison MODIS / VIIRS', methodologie: 'Sources et méthodologie', assistant: 'Assistant IA', parametres: 'Paramètres', 'design-system': 'Design system', etats: 'États & composants' };
  const CRUMB = { dashboard: 'Surveillance', carte: 'Surveillance', gabon: 'Surveillance', historique: 'Analyse', evenements: 'Analyse', evenement: 'Analyse › Événements harmonisés', zones: 'Analyse', comparaison: 'Analyse', methodologie: 'Référence', assistant: 'Référence', parametres: 'Référence', 'design-system': 'Maquette', etats: 'Maquette' };
  const LOGO = `<svg class="fw-logo__mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0F2A1F"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="#2F8F62" stroke-width="1.4"/><ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="#4CC9F0" stroke-width="1.1" stroke-dasharray="2 2.2" transform="rotate(-28 16 16)"/><circle cx="18.6" cy="13.6" r="5.6" fill="#F28C28" opacity=".22"/><circle cx="18.6" cy="13.6" r="2.8" fill="#F28C28"/><circle cx="27" cy="9.6" r="1.5" fill="#4CC9F0"/></svg>`;

  function shell() {
    const navHtml = NAV.map((g) => `<div class="fw-nav__group"><div class="fw-nav__label">${g.group}</div>${g.items.map(([r, l, ic]) => `<a class="fw-nav__item" href="#${r}" data-route="${r}" ${r === 'assistant' ? 'data-assistant-ui' : ''} title="${l}">${icon(ic)}<span>${l}</span>${r === 'evenements' ? `<span class="fw-nav__badge" data-badge-events>—</span>` : ''}${r === 'design-system' || r === 'etats' ? '' : ''}</a>`).join('')}</div>`).join('');
    return `<div class="fw-stage" data-frame="desktop">
      <div class="fw-stage__bar" role="toolbar" aria-label="Outils de la maquette">
        <strong>Maquette</strong>
        <label>Écran <select id="sim-route">${Object.entries(TITLES).filter(([k]) => k !== 'evenement').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}<option value="evenement-EVT-GA-0007">Détail événement EVT-GA-0007</option></select></label>
        <label>État simulé <select id="sim-state">${Object.entries(D.SIM_STATES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <span class="seg" role="group" aria-label="Aperçu"><button data-frame="desktop" aria-pressed="true">Desktop</button><button data-frame="tablet">Tablette 768</button><button data-frame="mobile">Mobile 390</button></span>
        <span class="mono" id="api-last" title="Dernier appel à l’API simulée">—</span>
        <span class="demo-tag">● Données de démonstration — ${fmt.n(D.counts.detections)} détections synthétiques</span>
      </div>
      <div class="fw-stage__viewport"><div class="fw-frame"><div class="fw-app" id="app">
        <a class="skip-link" href="#main">Aller au contenu</a>
        <aside class="fw-sidebar" aria-label="Navigation principale">
          <a class="fw-logo" href="#dashboard" aria-label="FireWatch Africa — accueil">${LOGO}<span class="fw-logo__text"><span class="fw-logo__name">FIREWATCH <span>AFRICA</span></span><br><span class="fw-logo__sub">Détections thermiques</span></span></a>
          <nav class="fw-nav">${navHtml}</nav>
          <div class="fw-sidebar__foot"><div class="row"><span class="fw-dot" id="health-dot"></span><span class="txt" id="health-txt">API —</span></div></div>
        </aside>
        <header class="fw-topbar">
          <button class="btn btn--ghost btn--icon fw-topbar__menu" data-action="nav" aria-label="Ouvrir le menu" aria-expanded="false">${icon('menu')}</button>
          <div class="fw-topbar__title"><div class="fw-crumbs" id="crumbs"></div><h1 id="page-title">Dashboard</h1></div>
          <div class="fw-topbar__spacer"></div>
          <label class="hide-mobile" style="display:flex;align-items:center;gap:6px"><span class="sr-only">Période</span>${icon('clock', 'muted')}<select class="select" id="range" style="height:32px">${Object.entries(RANGES).filter(([k]) => k !== 'custom').map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}<option value="custom">Personnalisée…</option></select></label>
          <div class="fw-fresh" id="fresh" role="status" title="Dernière mise à jour des données"><span class="fw-dot" id="fresh-dot"></span><span class="txt"><span class="txt-long">Mise à jour </span><span class="mono" id="fresh-time">—</span></span></div>
          <button class="btn btn--nasa btn--sm hide-mobile" data-action="assistant" data-assistant-ui aria-controls="assistant-panel">${icon('sparkle')}Assistant</button>
        </header>
        <div class="fw-banners" id="banners" aria-live="polite"></div>
        <main class="fw-main" id="main" tabindex="-1"></main>
        <nav class="bnav" aria-label="Navigation rapide">${[['dashboard', 'Accueil', 'dashboard'], ['carte', 'Carte', 'globe'], ['gabon', 'Gabon', 'gabon'], ['evenements', 'Événements', 'events']].map(([r, l, ic]) => `<a href="#${r}" data-route="${r}">${icon(ic)}<span>${l}</span></a>`).join('')}<button data-action="nav" aria-label="Plus de rubriques">${icon('more')}<span>Plus</span></button></nav>
        <button class="fab" data-action="assistant" data-assistant-ui aria-controls="assistant-panel" aria-label="Ouvrir l’assistant IA">${icon('sparkle')}<span>Assistant IA</span></button>
        <div class="scrim" id="scrim"></div>
        <aside class="assistant" id="assistant-panel" aria-label="Assistant IA" aria-hidden="true"></aside>
        <div class="toasts" aria-live="polite"></div>
      </div></div></div></div>`;
  }

  // ---------- bannières d'état global ----------
  function banners() {
    const st = API.state; const b = document.getElementById('banners'); let h = '';
    if (st === 'partial') h += `<div class="banner banner--warn">${icon('alert')}<span><strong>Données partielles.</strong> L’ingestion VIIRS NOAA-21 (VJ214IMGTDL_NRT) est incomplète depuis le 13/11 18:00 UTC. Les totaux affichés excluent ce satellite.</span><a class="btn btn--sm btn--ghost" href="#methodologie">Détails</a></div>`;
    if (st === 'offline') h += `<div class="banner banner--offline">${icon('wifiOff')}<span><strong>Absence de connexion.</strong> Affichage du cache local du <span class="mono">14/11/2026 06:00 UTC</span>. Les actions de mise à jour sont suspendues.</span><button class="btn btn--sm" data-action="retry">${icon('refresh')}Réessayer</button></div>`;
    if (st === 'error') h += `<div class="banner banner--err">${icon('server')}<span><strong>Service dégradé.</strong> <span class="mono">GET /api/health</span> signale un délai dépassé sur l’ingestion FIRMS.</span><button class="btn btn--sm" data-action="retry">${icon('refresh')}Réessayer</button></div>`;
    if (st === 'geoloc') h += `<div class="banner banner--info">${icon('pinOff')}<span><strong>Erreur de localisation.</strong> Votre position n’a pas pu être déterminée ; la vue Afrique est utilisée. Vous pouvez choisir une région manuellement.</span></div>`;
    b.innerHTML = h;
    const dot = document.getElementById('fresh-dot'); dot.className = 'fw-dot' + (st === 'error' ? ' fw-dot--err' : st === 'partial' || st === 'offline' ? ' fw-dot--warn' : '');
  }
  async function loadMeta() {
    document.getElementById('fresh-time').textContent = '…';
    try {
      const [h, m] = await Promise.all([API.get('/api/health'), API.get('/api/metadata')]); APP.health = h.data; APP.meta = m.data;
      const t = new Date(m.data.last_update); document.getElementById('fresh-time').textContent = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')} ${t.toISOString().slice(11, 16)} UTC${API.state === 'offline' ? ' (cache)' : ''}`;
      document.getElementById('health-dot').className = 'fw-dot' + (h.data.status === 'ok' ? (API.state === 'partial' ? ' fw-dot--warn' : '') : ' fw-dot--err');
      document.getElementById('health-txt').innerHTML = `API ${h.data.status === 'ok' ? 'opérationnelle' : 'dégradée'} · <span class="mono">v${h.data.version}</span>`;
      const ev = await API.get('/api/events', APP.params({ limit: 1 })); document.querySelectorAll('[data-badge-events]').forEach((e) => (e.textContent = fmt.n(ev.data.total)));
    } catch (e) { document.getElementById('fresh-time').textContent = 'indisponible'; document.getElementById('health-txt').textContent = 'API indisponible'; document.getElementById('health-dot').className = 'fw-dot fw-dot--err'; }
  }

  // ---------- routeur ----------
  function parseHash() { const raw = location.hash.replace(/^#\/?/, '') || 'dashboard'; const [path, q] = raw.split('?'); let parts = path.split('/'); if (/^evenement-/.test(path)) parts = ['evenements', path.slice(10)]; const qs = new URLSearchParams(q || ''); return { route: parts[0] || 'dashboard', param: parts[1] ? decodeURIComponent(parts[1]) : null, qs }; }
  async function navigate() {
    const { route, param, qs } = parseHash();
    if (qs.get('state') && D.SIM_STATES[qs.get('state')]) { API.state = qs.get('state'); document.getElementById('sim-state').value = API.state; }
    if (qs.get('frame')) setFrame(qs.get('frame'));
    if (qs.get('chrome') === '0') document.querySelector('.fw-stage__bar').style.display = 'none';
    if (qs.get('theme')) { APP.settings.theme = qs.get('theme'); APP.applySettings(); }
    if (qs.get('assistant') === 'open') setTimeout(() => openAssistant(true), 50);
    let r = route; if (r === 'evenements' && param) r = 'evenement';
    if (!window.FW_SCREENS[r]) r = 'dashboard';
    APP.route = r; APP.param = param; document.getElementById('app').dataset.route = r;
    APP.maps.forEach((m) => m.destroy?.()); APP.maps = [];
    document.querySelectorAll('[data-route]').forEach((a) => { const cur = a.dataset.route === route || (route === 'evenements' && a.dataset.route === 'evenements'); a.toggleAttribute('aria-current', false); if (cur) a.setAttribute('aria-current', 'page'); });
    document.getElementById('page-title').textContent = TITLES[r]; document.getElementById('crumbs').textContent = 'FireWatch Africa › ' + CRUMB[r];
    document.title = `${TITLES[r]} — FireWatch Africa`;
    document.getElementById('sim-route').value = route === 'evenements' && param ? `evenement-${param}` : route;
    closeNav(); banners();
    const main = document.getElementById('main'); main.scrollTop = 0; main.innerHTML = '';
    const page = document.createElement('div'); page.className = 'fw-page' + (window.FW_SCREENS[r].flush ? ' fw-page--flush' : ''); main.appendChild(page);
    try { await window.FW_SCREENS[r].render(page, param); } catch (e) { console.error(e); }
    if (API.state === 'geoloc' && (r === 'carte' || r === 'dashboard' || r === 'gabon')) U.toast('Position indisponible', 'GeolocationPositionError · code 1 (PERMISSION_DENIED). Vue Afrique utilisée.', 'warn');
    if (API.state === 'offline') U.toast('Mode hors connexion', 'Les données affichées datent du dernier cache.', 'warn', 3500);
  }
  APP.rerender = () => navigate();
  APP.go = (h) => { location.hash = h; };

  // ---------- cadre d'aperçu ----------
  function setFrame(f) { APP.frame = f; document.querySelector('.fw-stage').dataset.frame = f; document.querySelectorAll('[data-frame]').forEach((b) => b.tagName === 'BUTTON' && b.setAttribute('aria-pressed', b.dataset.frame === f)); setTimeout(() => window.dispatchEvent(new Event('resize')), 60); }
  function openNav() { document.getElementById('app').classList.add('nav-open'); document.getElementById('scrim').classList.add('is-on'); document.querySelectorAll('[data-action="nav"]').forEach((b) => b.setAttribute('aria-expanded', 'true')); }
  function closeNav() { const a = document.getElementById('app'); if (!a) return; a.classList.remove('nav-open'); if (!document.getElementById('assistant-panel').classList.contains('is-open')) document.getElementById('scrim').classList.remove('is-on'); document.querySelectorAll('[data-action="nav"]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }

  // ==========================================================================
  // Assistant IA — moteur de démonstration (réponses calculées depuis l'API)
  // ==========================================================================
  const SUGGESTIONS = ['Quelles sont les zones les plus actives aujourd’hui ?', 'Quelle est la différence entre MODIS et VIIRS ?', 'Pourquoi cet événement a-t-il un score de 0,72 ?', 'Combien de détections ont été observées au Gabon cette semaine ?', 'Résume la carte actuelle', 'Que signifie le niveau de confiance ?'];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  async function answer(q) {
    const n = norm(q); const src = []; const call = async (p, params) => { src.push(API.url(p, params)); return (await API.get(p, params)).data; };
    const last7 = { start_date: '2026-11-08', end_date: '2026-11-14' };
    if (/zone|actif|active|chaud|concentration/.test(n) && !/gabon/.test(n)) {
      const p = { start_date: '2026-11-13', end_date: '2026-11-14', limit: 3, min_count: 2 }; const hs = await call('/api/analytics/hotspots', p);
      if (!hs.length) return { html: `<p>Aucune zone ne dépasse le seuil de concentration sur les dernières 24 h pour les données disponibles. Je ne peux donc pas en citer.</p>`, src };
      return { html: `<p>Sur les dernières 24 h (13–14/11/2026, UTC), les cellules de 1° présentant la plus forte concentration de détections sont :</p><ul>${hs.map((h) => `<li><strong>${esc(h.name)}</strong> — ${fmt.n(h.count)} détections, ${h.active_days} jour(s) actif(s), FRP cumulée ${fmt.d1(h.frp_sum)} MW · score ${h.score} (${U.LEVEL[h.level].label.toLowerCase()})</li>`).join('')}</ul><p>Il s’agit de zones présentant une concentration élevée de <em>détections thermiques</em> : elles ne confirment pas à elles seules un incendie au sol.</p>`, src, actions: [['Ouvrir les zones', '#zones']] };
    }
    if (/modis|viirs|capteur|resolution/.test(n)) {
      const s = await call('/api/statistics/satellites', APP.params()); const m = s.filter((x) => x.sensor === 'MODIS'), v = s.filter((x) => x.sensor === 'VIIRS');
      const cm = m.reduce((a, x) => a + x.count, 0), cv = v.reduce((a, x) => a + x.count, 0);
      return { html: `<p><strong>MODIS</strong> (Terra, Aqua) observe des pixels d’environ <strong>1 km</strong> ; <strong>VIIRS</strong> (Suomi-NPP, NOAA-20, NOAA-21) des pixels de <strong>375 m</strong>. VIIRS détecte donc des foyers plus petits ou moins intenses, et localise plus finement.</p><ul><li>Une même source de chaleur peut produire plusieurs détections VIIRS pour une seule détection MODIS.</li><li>La confiance n’est pas exprimée de la même façon : 0–100 % pour MODIS, faible / nominale / élevée pour VIIRS.</li><li>Les heures de passage diffèrent (Terra ≈ 10 h 30 et 22 h 30 locales, les autres ≈ 13 h 30 et 01 h 30).</li></ul><p>Sur la période sélectionnée (${APP.periodLabel()}) : ${fmt.n(cv)} détections VIIRS et ${fmt.n(cm)} détections MODIS dans les données disponibles.</p>`, src, actions: [['Comparer MODIS / VIIRS', '#comparaison']] };
    }
    if (/score|0[,.]72|rapproch|harmonis/.test(n)) {
      const id = APP.route === 'evenement' && APP.param ? APP.param : 'EVT-GA-0007'; const e = await call(`/api/events/${id}`);
      const w = e.analysis.params.w; const sub = e.sub;
      return { html: `<p>L’événement <strong class="mono">${esc(e.id)}</strong> obtient un score d’harmonisation de <strong>${fmt.d2(e.score)}</strong>, moyenne pondérée de quatre composantes :</p><ul><li>Cohérence spatiale <span class="mono">${fmt.d2(sub.spatial)}</span> × ${fmt.d2(w.spatial)} — distance moyenne au centre ${fmt.d2(e.dmean)} km pour un seuil de ${fmt.d1(e.dmax)} km${e.sensors.includes('MODIS') ? ' (MODIS impliqué)' : ''}.</li><li>Cohérence temporelle <span class="mono">${fmt.d2(sub.temporel)}</span> × ${fmt.d2(w.temporel)} — écart médian ${fmt.d1(e.gapMedian)} h pour une fenêtre de 24 h.</li><li>Convergence des plateformes <span class="mono">${fmt.d2(sub.capteurs)}</span> × ${fmt.d2(w.capteurs)} — ${e.satellites.length} satellite(s) : ${e.satellites.join(', ')}.</li><li>Confiance moyenne <span class="mono">${fmt.d2(sub.confiance)}</span> × ${fmt.d2(w.confiance)}.</li></ul><p>Le score est principalement limité par la confiance moyenne et par l’écart spatial. Il mesure la cohérence du rapprochement des observations, <em>pas</em> la certitude qu’un feu ait eu lieu.</p>`, src, actions: [['Voir l’événement', `#evenement-${e.id}`]] };
    }
    if (/gabon/.test(n)) {
      const s = await call('/api/statistics/summary', { ...last7, bbox: D.REGIONS.gabon.bbox.join(',') }); const det = await call('/api/detections', { ...last7, bbox: D.REGIONS.gabon.bbox.join(','), limit: 500 });
      const byP = {}; det.items.forEach((d) => { if (d.province) byP[d.province] = (byP[d.province] || 0) + 1; }); const top = Object.entries(byP).sort((a, b) => b[1] - a[1]);
      if (!s.total) return { html: `<p>Aucune détection thermique n’est disponible pour le Gabon entre le 08/11 et le 14/11/2026.</p>`, src };
      return { html: `<p>Du <strong>08/11 au 14/11/2026</strong> (7 jours, UTC), <strong>${fmt.n(s.total)} détections thermiques</strong> ont été enregistrées sur l’emprise du Gabon : ${fmt.n(s.viirs)} VIIRS et ${fmt.n(s.modis)} MODIS, regroupées en ${fmt.n(s.events)} événement(s) probable(s).</p>${top.length ? `<p>Répartition par province : ${top.map(([p, c]) => `${esc(p)} (${c})`).join(', ')}.</p>` : ''}<p>Novembre correspond à la saison des pluies sur l’essentiel du pays, ce qui est cohérent avec une activité faible par rapport à août–septembre.</p>`, src, actions: [['Ouvrir la vue Gabon', '#gabon']] };
    }
    if (/resum|carte|synthese|periode/.test(n)) {
      const s = await call('/api/statistics/summary', APP.params()); const hs = await call('/api/analytics/hotspots', APP.params({ limit: 1 }));
      if (!s.total) return { html: `<p>La carte actuelle ne contient aucune détection pour les filtres sélectionnés.</p>`, src };
      return { html: `<p>Pour la période <strong>${APP.periodLabel()}</strong>${APP.filtersActive() ? ' et les filtres actifs' : ''} : <strong>${fmt.n(s.total)}</strong> détections (${fmt.n(s.viirs)} VIIRS, ${fmt.n(s.modis)} MODIS), dont ${Math.round((s.day / s.total) * 100)} % de jour, et <strong>${fmt.n(s.events)}</strong> événements probables.</p><p>FRP moyenne ${fmt.d1(s.frp_mean)} MW, maximale ${fmt.d1(s.frp_max)} MW. ${hs[0] ? `La zone présentant la concentration la plus élevée est <strong>${esc(hs[0].name)}</strong> (${fmt.n(hs[0].count)} détections).` : ''}</p>`, src };
    }
    if (/confiance|filtre|frp|nuit|jour/.test(n)) {
      return { html: `<p><strong>Niveau de confiance</strong> : estimation, fournie par l’algorithme FIRMS, de la probabilité qu’un pixel corresponde à une véritable anomalie thermique. MODIS l’exprime de 0 à 100 % ; VIIRS en trois classes (faible, nominale, élevée). FireWatch harmonise : &lt; 30 % → faible, 30–79 % → nominale, ≥ 80 % → élevée.</p><p><strong>FRP</strong> (Fire Radiative Power) : puissance radiative mesurée en mégawatts — indicateur d’intensité, non de surface brûlée.</p><p><strong>Jour / nuit</strong> : moment du passage satellite ; les détections nocturnes sont moins sujettes aux faux positifs liés aux surfaces chaudes.</p>`, src: [] };
    }
    return { html: `<p>Je n’ai pas de donnée permettant de répondre précisément à cette question, et je préfère ne pas extrapoler.</p><p>Je peux : résumer la carte ou une période, comparer MODIS et VIIRS, expliquer un score d’harmonisation, lister les zones de concentration ou décrire l’activité au Gabon.</p>`, src: [] };
  }
  function renderAssistant(el, page) {
    const msgs = APP.chat;
    const ctx = APP.route === 'evenement' && APP.param ? `Contexte : événement <span class="mono">${esc(APP.param)}</span>` : `Contexte : ${esc(TITLES[APP.route] || '')} · ${APP.periodLabel()}`;
    el.innerHTML = `<div class="assistant__head"><span class="assistant__avatar">${icon('sparkle')}</span><div><h2>Assistant FireWatch</h2><div class="small muted">Interprétation des données disponibles</div></div>${page ? '' : `<button class="btn btn--ghost btn--sm btn--icon" data-action="assistant-close" aria-label="Fermer l’assistant">${icon('x')}</button>`}</div>
      <div class="assistant__ctx">${icon('layers', '')}${ctx} ${U.DemoBadge('MODE DÉMO')}</div>
      <div class="assistant__msgs" role="log" aria-live="polite" aria-label="Conversation">${msgs.length ? '' : `<div class="msg msg--bot"><div class="msg__body"><p>Bonjour. Je peux expliquer les filtres et les termes scientifiques, résumer la carte ou une période, et détailler pourquoi des détections ont été — ou non — rapprochées.</p><p class="small muted" style="margin:0">Mes réponses sont calculées uniquement à partir des endpoints de l’API ; je cite toujours la source.</p></div></div>`}${msgs.map(msgHtml).join('')}</div>
      <div class="suggest" aria-label="Suggestions de questions">${SUGGESTIONS.slice(0, page ? 6 : 4).map((s) => `<button data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <p class="assistant__disclaimer">${icon('info')}<span>L’assistant fournit une interprétation des données disponibles. Il ne remplace pas une analyse scientifique, les autorités locales ou les observations terrain.</span></p>
      <form class="assistant__form"><label class="sr-only" for="q-${page ? 'p' : 'd'}">Votre question</label><textarea id="q-${page ? 'p' : 'd'}" rows="1" placeholder="Posez une question sur les données…"></textarea><button class="btn btn--primary btn--icon" type="submit" aria-label="Envoyer">${icon('send')}</button></form>`;
    const box = el.querySelector('.assistant__msgs'); box.scrollTop = box.scrollHeight;
    const send = async (q) => {
      if (!q.trim()) return; APP.chat.push({ role: 'user', text: q }); if (!APP.chatHistory.includes(q)) APP.chatHistory.unshift(q);
      box.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', text: q }) + `<div class="typing" role="status"><i></i><i></i><i></i><span>Analyse des données…</span></div>`); box.scrollTop = box.scrollHeight;
      let res; try { res = await answer(q); await new Promise((r) => setTimeout(r, 450)); APP.chat.push({ role: 'bot', ...res }); }
      catch (e) { APP.chat.push({ role: 'bot', err: true, html: `<p><strong>Je n’ai pas pu accéder aux données.</strong> ${esc(e.message)} Je ne répondrai pas sans données vérifiables.</p>`, src: [e.path] }); }
      document.querySelectorAll('.assistant__msgs').forEach(() => {}); rerenderAssistants();
    };
    el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const t = el.querySelector('textarea'); const v = t.value; t.value = ''; send(v); });
    el.querySelector('textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.querySelector('form').requestSubmit(); } });
    el.querySelectorAll('[data-suggest]').forEach((b) => b.addEventListener('click', () => send(b.dataset.suggest)));
  }
  function msgHtml(m) {
    if (m.role === 'user') return `<div class="msg msg--user">${esc(m.text)}</div>`;
    return `<div class="msg msg--bot${m.err ? ' msg--err' : ''}"><div class="msg__body">${m.html}${m.actions ? `<div class="row" style="margin-top:8px">${m.actions.map(([l, h]) => `<a class="btn btn--sm" href="${h}">${l}${icon('arrowRight')}</a>`).join('')}</div>` : ''}</div>${m.src?.length ? `<div class="msg__src">Sources : ${m.src.map((s) => `<code>GET ${esc(s)}</code>`).join('')}</div>` : m.err ? '' : `<div class="msg__src">Source : référentiel méthodologique FireWatch</div>`}</div>`;
  }
  function rerenderAssistants() { const panel = document.getElementById('assistant-panel'); if (panel.classList.contains('is-open')) renderAssistant(panel, false); const pg = document.getElementById('assistant-page'); if (pg) renderAssistant(pg, true); const h = document.getElementById('chat-history'); if (h) h.innerHTML = historyHtml(); }
  const historyHtml = () => (APP.chatHistory.length ? APP.chatHistory.map((q, i) => `<button ${i === 0 ? 'aria-current="true"' : ''}>${esc(q)}<small>Aujourd’hui</small></button>`).join('') : '<p class="small muted" style="padding:8px 10px">Aucune conversation pour le moment.</p>');
  APP.renderAssistant = renderAssistant; APP.historyHtml = historyHtml;
  function openAssistant(open) {
    const p = document.getElementById('assistant-panel'); if (open && APP.route === 'assistant') return; p.classList.toggle('is-open', open); p.setAttribute('aria-hidden', !open); document.getElementById('scrim').classList.toggle('is-on', open);
    if (open) { renderAssistant(p, false); setTimeout(() => p.querySelector('textarea')?.focus(), 230); }
  }
  APP.openAssistant = openAssistant;

  // ---------- démarrage ----------
  function boot() {
    document.body.innerHTML = shell(); APP.applySettings();
    API.onCall((e) => { const el = document.getElementById('api-last'); if (el) el.textContent = `GET ${e.url.length > 70 ? e.url.slice(0, 70) + '…' : e.url} → ${e.status}`; });
    document.getElementById('range').value = APP.filters.range;
    document.getElementById('range').addEventListener('change', (e) => { if (e.target.value === 'custom') { APP.filters.range = 'custom'; APP.filters.start = APP.filters.start || '2026-10-01'; APP.filters.end = APP.filters.end || '2026-11-14'; APP.go('#historique'); } else APP.filters.range = e.target.value; navigate(); loadMeta(); });
    document.getElementById('sim-state').addEventListener('change', (e) => { API.state = e.target.value; loadMeta(); navigate(); });
    document.getElementById('sim-route').addEventListener('change', (e) => APP.go('#' + e.target.value));
    document.querySelectorAll('.fw-stage__bar [data-frame]').forEach((b) => b.addEventListener('click', () => setFrame(b.dataset.frame)));
    document.addEventListener('click', (e) => {
      if (e.target.closest('.skip-link')) { e.preventDefault(); document.getElementById('main').focus(); return; }
      const a = e.target.closest('[data-action]'); if (!a) return; const act = a.dataset.action;
      if (act === 'nav') { document.getElementById('app').classList.contains('nav-open') ? closeNav() : openNav(); }
      if (act === 'assistant') openAssistant(true);
      if (act === 'assistant-close') openAssistant(false);
      if (act === 'retry') { if (API.state === 'error' || API.state === 'offline') { U.toast('Nouvelle tentative…', 'Le service répond toujours en erreur (état simulé). Passez l’état sur « Normal » pour revenir aux données.', 'warn'); } navigate(); }
    });
    document.getElementById('scrim').addEventListener('click', () => { closeNav(); openAssistant(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeNav(); openAssistant(false); } });
    window.addEventListener('hashchange', navigate);
    loadMeta(); navigate();
  }
  APP.syncRange = () => { const r = document.getElementById('range'); if (r) r.value = APP.filters.range; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
