/* ==========================================================================
   FireWatch Africa — écrans (chaque écran consomme uniquement l'API simulée)
   ========================================================================== */
(function () {
  const D = window.FW_DATA, U = window.FW_UI, API = D.API; const { icon, esc, fmt, shape } = U;
  const APP = () => window.FW_APP;
  const S = (window.FW_SCREENS = {});
  const get = async (p, params) => (await API.get(p, params)).data;
  const st = () => API.state;
  const head = (over, title, desc, actions = '', badges = '') => `<div class="page-head"><div><div class="overline">${over}</div><h2>${title} ${badges}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${actions ? `<div class="page-head__actions">${actions}</div>` : ''}</div>`;
  const resetBtn = '<button class="btn btn--sm" data-reset>' + icon('reset') + 'Réinitialiser les filtres</button>';
  function bindReset(el) { el.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => { APP().resetFilters(); APP().syncRange(); API.state = st() === 'noresult' ? 'normal' : st(); document.getElementById('sim-state').value = API.state; APP().rerender(); })); }
  const card = (title, body, { sub = '', actions = '', foot = '', cls = '', id = '' } = {}) => `<section class="card ${cls}" ${id ? `id="${id}"` : ''} aria-label="${esc(title.replace(/<[^>]+>/g, ''))}"><div class="card__head"><div><h3 class="card__title">${title}</h3>${sub ? `<div class="card__sub">${sub}</div>` : ''}</div>${actions ? `<div class="card__actions">${actions}</div>` : ''}</div><div class="card__body">${body}</div>${foot ? `<div class="card__foot">${foot}</div>` : ''}</section>`;
  const endpoint = (...e) => e.map((x) => `<code class="mono" style="font-size:11px">GET ${x}</code>`).join(' ');
  const deltaHtml = (v) => (v == null ? '<span class="delta">—</span>' : `<span class="delta">${v > 0 ? '▲' : v < 0 ? '▼' : '■'} ${fmt.pct(v)}</span>`);
  const fmtDT = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${d.toISOString().slice(11, 16)}`; };
  const unusualIdx = (vals) => { const n = vals.length; if (n < 7) return []; const m = vals.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / n) || 1; return vals.map((v, i) => ((v - m) / sd > 2 ? i : -1)).filter((i) => i >= 0); };
  const distFmt = (km) => (APP().settings.unit === 'mi' ? `${fmt.d2(km * 0.621371)} mi` : `${fmt.d2(km)} km`);
  const C = { modis: 'var(--fw-color-sensor-modis)', viirs: 'var(--fw-color-sensor-viirs)', fused: 'var(--fw-color-sensor-fused)', thermal: 'var(--fw-color-thermal-500)', nasa: 'var(--fw-color-nasa-500)' };
  const legendMV = `<div class="legend"><span>${shape('MODIS', 10)} MODIS</span><span>${shape('VIIRS', 10)} VIIRS</span></div>`;

  // ======================================================================
  // 1. DASHBOARD
  // ======================================================================
  S.dashboard = {
    async render(el) {
      const A = APP(); const per = A.periodLabel();
      el.innerHTML = `<section class="hero"><div class="hero__orbit" aria-hidden="true"></div><div style="position:relative"><div class="row">${U.DemoBadge()}<span class="badge badge--nasa">${icon('satellite')}NASA FIRMS · MODIS · VIIRS</span></div>
        <h2>L’activité thermique <em>mondiale</em>, lue depuis l’Afrique et le Gabon.</h2>
        <p>FireWatch Africa transforme les observations satellitaires en informations compréhensibles pour mieux analyser l’activité thermique mondiale.</p>
        <div class="row"><a class="btn btn--primary" href="#carte">${icon('globe')}Explorer les données</a><a class="btn" href="#gabon">${icon('gabon')}Accès rapide Gabon</a><a class="btn btn--ghost" href="#methodologie">Comprendre la méthode</a></div></div>
        <div class="hero__meta" id="hero-meta">${['Dernière mise à jour', 'Période analysée', 'Plateformes', 'Méthode d’harmonisation'].map((l) => `<div class="tile"><span class="overline">${l}</span><b><span class="skel" style="display:inline-block;width:80%;height:14px"></span></b></div>`).join('')}</div></section>
        <div id="dash-stats">${U.LoadingState('stats')}</div><div id="dash-body"><div class="grid g-12"><div class="card span-8" style="height:380px">${U.LoadingState('map')}</div><div class="card span-4 card__body">${U.LoadingState('list')}</div></div></div>`;
      const p = A.params();
      try {
        const [meta, sum, tl, sats, hs, gab, prev] = await Promise.all([get('/api/metadata'), get('/api/statistics/summary', p), get('/api/statistics/timeline', { ...p, granularity: 'day' }), get('/api/statistics/satellites', p), get('/api/analytics/hotspots', { ...p, limit: 6 }), get('/api/statistics/summary', { ...p, bbox: D.REGIONS.gabon.bbox.join(',') }), get('/api/statistics/summary', prevParams(p))]);
        const lu = new Date(meta.last_update);
        el.querySelector('#hero-meta').innerHTML = [['Dernière mise à jour', `${fmtDT(lu)} UTC`], ['Période analysée', per], ['Plateformes', 'Terra · Aqua · S-NPP · N20 · N21'], ['Méthode d’harmonisation', meta.method_versions[0]]].map(([l, v]) => `<div class="tile"><span class="overline">${l}</span><b>${esc(v)}</b></div>`).join('');
        const sp = (k) => U.sparkline(tl.series.map((b) => b[k]));
        const dl = (cur, pv) => (pv ? deltaHtml((cur - pv) / pv) + ' <span>vs préc.</span>' : '');
        el.querySelector('#dash-stats').innerHTML = `<div class="stats">${[
          U.StatCard({ label: 'Détections thermiques', value: fmt.n(sum.total), foot: dl(sum.total, prev.total), sym: icon('flame', 'sym'), accent: true, spark: sp('total') }),
          U.StatCard({ label: 'Détections MODIS', value: fmt.n(sum.modis), foot: `≈ 1 km · ${sum.total ? Math.round((sum.modis / sum.total) * 100) : 0} %`, sym: shape('MODIS', 10), spark: U.sparkline(tl.series.map((b) => b.modis), 76, 26, C.modis) }),
          U.StatCard({ label: 'Détections VIIRS', value: fmt.n(sum.viirs), foot: `375 m · ${sum.total ? Math.round((sum.viirs / sum.total) * 100) : 0} %`, sym: shape('VIIRS', 10), spark: U.sparkline(tl.series.map((b) => b.viirs), 76, 26, C.viirs) }),
          U.StatCard({ label: 'Événements probables', value: fmt.n(sum.events), foot: 'rapprochements analytiques', sym: shape('EVT', 11) }),
          U.StatCard({ label: 'Zones actives', value: fmt.n(sum.active_zones), foot: 'score ≥ 40 · cellules 1°', sym: icon('zones', 'sym') }),
          U.StatCard({ label: 'Dernière mise à jour', value: `${lu.toISOString().slice(11, 16)}`, unit: 'UTC', foot: `${String(lu.getUTCDate()).padStart(2, '0')}/${String(lu.getUTCMonth() + 1).padStart(2, '0')}/${lu.getUTCFullYear()} · NRT`, sym: icon('clock', 'sym') }),
        ].join('')}</div>`;
        const body = el.querySelector('#dash-body');
        if (st() === 'noresult') { body.innerHTML = `<div class="card">${U.EmptyState('noresult', resetBtn)}</div>`; bindReset(body); return; }
        if (!sum.total) { body.innerHTML = `<div class="card">${U.EmptyState('empty', '<a class="btn btn--sm" href="#historique">Choisir une autre période</a>')}</div>`; return; }
        const gLevel = gabonLevel(gab.total, A.period());
        body.innerHTML = `<div class="grid g-12">
          ${card('Activité thermique mondiale', `<div id="dash-map" style="height:432px;border-radius:8px;overflow:hidden"></div>`, { sub: `${fmt.n(sum.total)} détections · ${per}`, actions: `<a class="btn btn--sm" href="#carte">Carte plein écran ${icon('expand')}</a>`, cls: 'span-8 span-lap-12' })}
          ${card('Principales zones de concentration', `<ol class="rank">${hs.slice(0, 6).map((h, i) => `<li><span class="rank__n">${String(i + 1).padStart(2, '0')}</span><a href="#zones"><div class="rank__name">${esc(h.name)}</div><div class="rank__sub">${h.cell_label} · ${fmt.n(h.count)} dét. · ${h.active_days} j</div><div class="rank__bar"><i style="width:${h.score}%"></i></div></a>${U.LevelBadge(h.level)}</li>`).join('')}</ol>`, { sub: 'Zones présentant une concentration élevée de détections', actions: `<a class="btn btn--ghost btn--sm" href="#zones">Tout voir</a>`, cls: 'span-4 span-lap-12' })}
          ${card('Évolution des détections', `<div id="dash-tl"></div>${U.dataAlt([{ label: 'Date', v: (r) => r.date }, { label: 'Total', r: 1, mono: 1, v: (r) => fmt.n(r.total) }, { label: 'MODIS', r: 1, mono: 1, v: (r) => fmt.n(r.modis) }, { label: 'VIIRS', r: 1, mono: 1, v: (r) => fmt.n(r.viirs) }], tl.series)}`, { sub: 'Détections quotidiennes, tous capteurs (UTC)', cls: 'span-8 span-lap-12', foot: endpoint('/api/statistics/timeline') })}
          ${card('MODIS versus VIIRS', `<div id="dash-sat"></div>${legendMV}`, { sub: 'Détections par satellite sur la période', cls: 'span-4 span-lap-12', foot: endpoint('/api/statistics/satellites') })}
          ${card(`${icon('gabon', 'ic-inline')} Gabon`, `<div class="grid g-12" style="gap:16px"><div class="span-5" id="dash-gabon" style="height:220px;border-radius:8px;overflow:hidden"></div><div class="span-7 stack" style="gap:10px"><div class="row" style="gap:24px"><div><div class="overline">Détections</div><div class="stat__value">${fmt.n(gab.total)}</div></div><div><div class="overline">Événements probables</div><div class="stat__value">${fmt.n(gab.events)}</div></div><div><div class="overline">VIIRS / MODIS</div><div class="stat__value" style="font-size:20px">${fmt.n(gab.viirs)} / ${fmt.n(gab.modis)}</div></div></div><div class="row"><span class="small secondary">Indicateur analytique :</span>${U.LevelBadge(gLevel.level, true)} ${U.ExpBadge()}</div><p class="small muted" style="margin:0">Indicateur expérimental — ne constitue pas une alerte officielle. ${gLevel.explain}</p><div><a class="btn btn--sm" href="#gabon">Ouvrir la vue Gabon ${icon('arrowRight')}</a></div></div></div>`, { sub: per, cls: 'span-12' })}
        </div>`;
        const det = await get('/api/detections', { ...p, limit: 20000 });
        A.maps.push(new U.FireMap(el.querySelector('#dash-map'), { points: A.clientFilter(det.items), view: 'world', legend: false, viewButtons: true, controls: false, emptyKind: st() === 'emptymap' ? 'emptymap' : null }));
        A.maps.push(new U.FireMap(el.querySelector('#dash-gabon'), { points: det.items.filter((d) => d.region === 'Gabon'), view: 'gabon', legend: false, viewButtons: false, controls: false, interactive: false, admin: true, labels: false, cluster: false }));
        U.TimelineChart(el.querySelector('#dash-tl'), { x: tl.series.map((b) => b.date), series: [{ name: 'Détections', color: C.thermal, values: tl.series.map((b) => b.total) }], height: 210, caption: 'Évolution quotidienne du nombre de détections thermiques', unusual: unusualIdx(tl.series.map((b) => b.total)) });
        U.BarChart(el.querySelector('#dash-sat'), { cats: sats.map((s) => s.satellite.replace('Suomi-', 'S-')), series: [{ name: 'Détections', color: C.viirs, values: sats.map((s) => s.count) }], height: 210, caption: 'Détections par satellite' });
        el.querySelectorAll('#dash-sat .chart__bar').forEach((b, i) => b.setAttribute('fill', sats[i].sensor === 'MODIS' ? C.modis : C.viirs));
      } catch (e) { el.querySelector('#dash-stats').innerHTML = ''; el.querySelector('#dash-body').innerHTML = `<div class="card">${U.ErrorState(e)}</div>`; el.querySelector('#hero-meta').innerHTML = `<div class="tile" style="grid-column:span 2"><span class="overline">Données</span><b>Indisponibles</b></div>`; }
    },
  };
  function prevParams(p) { const s = Date.parse(p.start_date + 'T00:00:00Z'), e = Date.parse(p.end_date + 'T00:00:00Z'); const len = e - s + D.DAY; return { ...p, start_date: D.isoDate(s - len), end_date: D.isoDate(s - D.DAY) }; }
  function gabonLevel(count, per) {
    const days = Math.round((Date.parse(per.end) - Date.parse(per.start)) / D.DAY) + 1; const rate = count / days; const ref = 610 / 92; const r = rate / ref; // référence : moyenne journalière sur 92 jours (démo)
    const level = r < 0.75 ? 'low' : r < 1.5 ? 'moderate' : 'high';
    return { level, ratio: r, explain: `Rapport activité/jour sur la période ÷ moyenne des 92 derniers jours = ${fmt.d2(r)} (< 0,75 faible · 0,75–1,5 modéré · > 1,5 élevé).` };
  }

  // ======================================================================
  // 2. CARTE MONDIALE
  // ======================================================================
  S.carte = {
    flush: true,
    async render(el) {
      const A = APP(); const f = A.filters;
      const satChips = D.SATS.map((s) => `<button class="chip" aria-pressed="${f.sats.includes(s.id)}" data-sat="${s.id}">${shape(s.sensor, 9)}${s.label}</button>`).join('');
      el.innerHTML = `<div class="mapscreen" id="ms"><aside class="mapscreen__panel" aria-label="Filtres de la carte"><div class="drawer-handle" aria-hidden="true"></div>
        <div class="card__head" style="padding:16px 16px 0"><div><h3 class="card__title">Filtres</h3><div class="result-count" id="rc" aria-live="polite">—</div></div><div class="card__actions"><button class="btn btn--ghost btn--sm btn--icon only-narrow" data-close-filters aria-label="Fermer les filtres">${icon('x')}</button></div></div>
        <div class="filters">
          <div class="filters__group"><span class="label">Période</span><div class="seg" role="group" aria-label="Période">${['24h', '7d', '30d', '90d'].map((k) => `<button data-range="${k}" aria-pressed="${f.range === k}">${{ '24h': '24 h', '7d': '7 j', '30d': '30 j', '90d': '90 j' }[k]}</button>`).join('')}</div>
            <div class="row" style="gap:8px;flex-wrap:nowrap"><label class="field" style="flex:1"><span>Début</span><input class="input" type="date" id="f-start" value="${A.period().start}" min="${D.isoDate(D.START)}" max="2026-11-14"></label><label class="field" style="flex:1"><span>Fin</span><input class="input" type="date" id="f-end" value="${A.period().end}" min="${D.isoDate(D.START)}" max="2026-11-14"></label></div></div>
          <div class="filters__group"><span class="label">Capteur <span class="muted small">sensor</span></span><div class="filters__chips">${['MODIS', 'VIIRS'].map((s) => `<button class="chip" aria-pressed="${f.sensors.includes(s)}" data-sensor="${s}">${shape(s, 10)}${s} <span class="muted">${s === 'MODIS' ? '1 km' : '375 m'}</span></button>`).join('')}</div></div>
          <div class="filters__group"><span class="label">Satellite <span class="muted small">satellite</span></span><div class="filters__chips">${satChips}</div></div>
          <div class="filters__group"><span class="label">Niveau de confiance <span class="badge" title="Filtre appliqué côté client : paramètre absent du contrat API">client</span></span><div class="filters__chips">${['low', 'nominal', 'high'].map((c) => `<button class="chip" aria-pressed="${f.conf.includes(c)}" data-conf="${c}"><span class="conf conf--${c}"><span class="conf__bars" aria-hidden="true"><i></i><i></i><i></i></span></span>${U.CONF[c]}</button>`).join('')}</div></div>
          <div class="filters__group"><span class="label">Jour / nuit</span><div class="seg" role="group" aria-label="Jour ou nuit">${[['all', 'Tous'], ['D', 'Jour'], ['N', 'Nuit']].map(([k, l]) => `<button data-dn="${k}" aria-pressed="${f.daynight === k}">${l}</button>`).join('')}</div></div>
          <div class="filters__group"><span class="label">Couches</span>
            <label class="toggle-row"><span>${shape('EVT', 11)} Événements probables uniquement<small>Détections rattachées à un événement harmonisé</small></span><span class="switch"><input type="checkbox" id="f-evt" ${f.eventsOnly ? 'checked' : ''}><span></span></span></label>
            <label class="toggle-row"><span>Zones de concentration (hotspots)<small>Cellules 1° · <span class="mono">/api/analytics/hotspots</span></small></span><span class="switch"><input type="checkbox" id="f-hot" ${f.hotspots ? 'checked' : ''}><span></span></span></label>
            <label class="toggle-row"><span>Regroupement automatique<small>Clustering selon le niveau de zoom</small></span><span class="switch"><input type="checkbox" id="f-cl" ${A.settings.cluster ? 'checked' : ''}><span></span></span></label></div>
          <details class="data-alt"><summary>${icon('table')}<span>Alternative textuelle : 15 détections les plus intenses</span></summary><div id="alt-list"></div></details>
        </div>
        <div class="filters__foot"><button class="btn btn--sm" data-reset>${icon('reset')}Réinitialiser</button><button class="btn btn--sm btn--primary only-narrow" data-close-filters style="margin-left:auto">Afficher les résultats</button></div></aside>
        <div class="mapscreen__map"><div id="wmap" style="position:absolute;inset:0">${U.LoadingState('map')}</div></div></div>`;
      const ms = el.querySelector('#ms');
      el.querySelectorAll('[data-close-filters]').forEach((b) => b.addEventListener('click', () => ms.classList.remove('filters-open')));
      bindReset(el);
      let map = null;
      const load = async () => {
        const rc = el.querySelector('#rc'); rc.textContent = 'Chargement…';
        try {
          const p = A.params({ limit: 20000 });
          const [det, evs, hs] = await Promise.all([get('/api/detections', p), get('/api/events', A.params({ limit: 500 })), f.hotspots ? get('/api/analytics/hotspots', A.params({ limit: 40 })) : Promise.resolve([])]);
          const pts = A.clientFilter(det.items);
          const evPts = evs.items.map((e) => ({ _isEvent: true, ev: e, longitude: e.center[0], latitude: e.center[1], frp: e.frp_max, t: e.end, instrument: 'EVT' }));
          rc.innerHTML = `<strong>${fmt.n(pts.length)}</strong> détections · ${fmt.n(evs.total)} événements${det.total !== pts.length ? ` <span class="muted">(${fmt.n(det.total - pts.length)} masquées par filtres client)</span>` : ''}`;
          el.querySelector('#alt-list').innerHTML = U.DataTable({ cols: [{ label: 'Lat / lon', mono: 1, v: (d) => `${d.latitude.toFixed(2)}, ${d.longitude.toFixed(2)}` }, { label: 'Date', mono: 1, v: (d) => d.acq_date.slice(5) }, { label: 'Sat.', v: (d) => d.satellite }, { label: 'FRP', r: 1, mono: 1, v: (d) => fmt.d1(d.frp) }], rows: [...pts].sort((a, b) => b.frp - a.frp).slice(0, 15), caption: 'Détections les plus intenses' });
          const emptyKind = st() === 'noresult' || (!pts.length && det.total) ? 'noresult' : st() === 'empty' ? 'empty' : st() === 'emptymap' ? 'emptymap' : null;
          const data = { points: emptyKind ? [] : [...pts, ...(f.eventsOnly ? evPts : [])], hotspots: emptyKind ? [] : hs, cluster: A.settings.cluster, emptyKind };
          if (!map) {
            el.querySelector('#wmap').innerHTML = '';
            map = new U.FireMap(el.querySelector('#wmap'), Object.assign(data, {
              view: A.pendingView || (st() === 'geoloc' ? 'africa' : 'world'), labels: A.settings.labels, showGraticule: A.settings.graticule, legendOpts: { hotspots: true },
              extraTL: `<button class="btn btn--sm only-narrow" data-open-filters style="background:rgba(17,25,34,.92)">${icon('filter')}Filtres${A.filtersActive() ? ` <span class="badge">${A.filtersActive()}</span>` : ''}</button><button class="btn btn--sm" data-reset style="background:rgba(17,25,34,.92)" title="Réinitialiser les filtres">${icon('reset')}<span class="only-wide">Réinitialiser</span></button>`,
              onLocate: () => (st() === 'geoloc' ? U.toast('Localisation impossible', 'Autorisation refusée par le navigateur (code 1). Utilisez les vues prédéfinies.', 'warn') : (map.setView([11.5, -0.4, 4.5, 3]), U.toast('Position simulée', 'Centrage sur Libreville (démo, aucune géolocalisation réelle).', 'info'))),
              onSelect: async (pt, slot) => {
                if (pt._isEvent) { const e = pt.ev; slot.innerHTML = `<div class="popup" role="dialog" aria-label="Événement ${e.id}" style="top:56px;right:58px"><div class="popup__head">${shape('EVT', 12)}<div><h3>Événement probable</h3><div class="mono small muted">${e.id}</div></div><button class="btn btn--ghost btn--sm btn--icon" data-close aria-label="Fermer">${icon('x')}</button></div><dl class="kv"><dt>Position centrale</dt><dd>${e.center[1].toFixed(3)}, ${e.center[0].toFixed(3)}</dd><dt>Détections</dt><dd>${e.n}</dd><dt>Durée estimée</dt><dd>${fmt.d1(e.duration_h)} h</dd><dt>Satellites</dt><dd class="sans">${e.satellites.map(U.SatelliteBadge).join(' ')}</dd><dt>Score</dt><dd>${fmt.d2(e.score)}</dd></dl><div class="popup__foot"><a class="btn btn--sm btn--nasa" href="#evenement-${e.id}">Ouvrir le détail</a></div></div>`; }
                else { slot.innerHTML = U.DetectionPopup(pt, A.settings.detail === 'expert'); try { await get(`/api/detections/${pt.id}`); } catch (e) { /* fiche déjà affichée depuis la liste */ } }
                slot.querySelector('[data-close]')?.addEventListener('click', () => map.select(null));
              },
            }));
            A.maps.push(map); A.pendingView = null;
            el.querySelectorAll('#wmap [data-reset]').forEach((b) => b.addEventListener('click', () => { A.resetFilters(); A.syncRange(); A.rerender(); }));
            el.querySelector('[data-open-filters]')?.addEventListener('click', () => ms.classList.add('filters-open'));
            map.el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === (st() === 'geoloc' ? 'africa' : 'world')));
          } else map.setData(data);
        } catch (e) { el.querySelector('#wmap').innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center">${U.ErrorState(e)}</div>`; rc.textContent = 'Erreur de chargement'; map = null; }
      };
      const upd = () => { load(); };
      el.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { f.range = b.dataset.range; A.syncRange(); el.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', x === b)); el.querySelector('#f-start').value = A.period().start; el.querySelector('#f-end').value = A.period().end; upd(); }));
      ['#f-start', '#f-end'].forEach((s) => el.querySelector(s).addEventListener('change', () => { f.range = 'custom'; f.start = el.querySelector('#f-start').value; f.end = el.querySelector('#f-end').value; A.syncRange(); el.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', false)); upd(); }));
      const tog = (arr, v) => (arr.includes(v) ? arr.splice(arr.indexOf(v), 1) : arr.push(v));
      el.querySelectorAll('[data-sensor]').forEach((b) => b.addEventListener('click', () => { tog(f.sensors, b.dataset.sensor); b.setAttribute('aria-pressed', f.sensors.includes(b.dataset.sensor)); upd(); }));
      el.querySelectorAll('[data-sat]').forEach((b) => b.addEventListener('click', () => { tog(f.sats, b.dataset.sat); b.setAttribute('aria-pressed', f.sats.includes(b.dataset.sat)); upd(); }));
      el.querySelectorAll('[data-conf]').forEach((b) => b.addEventListener('click', () => { tog(f.conf, b.dataset.conf); b.setAttribute('aria-pressed', f.conf.includes(b.dataset.conf)); upd(); }));
      el.querySelectorAll('[data-dn]').forEach((b) => b.addEventListener('click', () => { f.daynight = b.dataset.dn; el.querySelectorAll('[data-dn]').forEach((x) => x.setAttribute('aria-pressed', x === b)); upd(); }));
      el.querySelector('#f-evt').addEventListener('change', (e) => { f.eventsOnly = e.target.checked; upd(); });
      el.querySelector('#f-hot').addEventListener('change', (e) => { f.hotspots = e.target.checked; upd(); });
      el.querySelector('#f-cl').addEventListener('change', (e) => { A.settings.cluster = e.target.checked; A.applySettings(); upd(); });
      await load();
    },
  };

  // ======================================================================
  // 3. VUE GABON
  // ======================================================================
  S.gabon = {
    async render(el) {
      const A = APP(); const bbox = D.REGIONS.gabon.bbox.join(','); const p = A.params({ bbox }); const per = A.period();
      el.innerHTML = head('Surveillance · Afrique centrale', 'Gabon', `Détections thermiques sur l’emprise du Gabon, par province, pour la période ${A.periodLabel()}.`, `<a class="btn" href="#carte">${icon('globe')}Voir sur la carte mondiale</a>`, U.DemoBadge()) +
        `<div class="notice notice--exp" style="margin-bottom:16px">${icon('alert')}<div><strong>Indicateur analytique expérimental</strong>Le niveau faible / modéré / élevé compare l’activité de la période à la moyenne récente. Il est fourni à titre d’aide à l’analyse et <u>ne constitue pas une alerte officielle</u>. Les limites provinciales affichées sont schématiques.</div></div><div id="gb">${U.LoadingState('stats')}<div class="grid g-12"><div class="card span-8" style="height:460px">${U.LoadingState('map')}</div><div class="card span-4 card__body">${U.LoadingState('list')}</div></div></div>`;
      const box = el.querySelector('#gb');
      try {
        const [sum, det, evs, tl90, hs, prev] = await Promise.all([get('/api/statistics/summary', p), get('/api/detections', { ...p, limit: 5000 }), get('/api/events', { ...p, limit: 50 }), get('/api/statistics/timeline', { bbox, start_date: D.isoDate(D.START), end_date: '2026-11-14', granularity: 'week' }), get('/api/analytics/hotspots', { ...p, cell: 0.25, limit: 6, min_count: 2 }), get('/api/statistics/summary', prevParams(p))]);
        if (st() === 'noresult') { box.innerHTML = `<div class="card">${U.EmptyState('noresult', resetBtn)}</div>`; bindReset(box); return; }
        if (!sum.total && st() === 'empty') { box.innerHTML = `<div class="card">${U.EmptyState('empty')}</div>`; return; }
        const items = A.clientFilter(det.items); const lvl = gabonLevel(sum.total, per);
        const byP = {}; D.FW = 1; window.FW_GEO.PROVINCES.forEach((pr) => (byP[pr.name] = { name: pr.name, capital: pr.capital, n: 0, modis: 0, viirs: 0, frp: 0, ev: 0 }));
        items.forEach((d) => { if (!d.province) return; const b = byP[d.province]; b.n++; b[d.instrument === 'MODIS' ? 'modis' : 'viirs']++; b.frp = Math.max(b.frp, d.frp); });
        evs.items.forEach((e) => { if (e.province && byP[e.province]) byP[e.province].ev++; });
        const rows = Object.values(byP).sort((a, b) => b.n - a.n); const mx = Math.max(1, ...rows.map((r) => r.n));
        const pl = (r) => (r.n === 0 ? 'low' : r.n / mx > 0.66 && r.n >= 10 ? 'high' : r.n / mx > 0.33 && r.n >= 4 ? 'moderate' : 'low');
        const steps = ['rgba(242,140,40,.04)', 'rgba(242,140,40,.12)', 'rgba(242,140,40,.22)', 'rgba(242,140,40,.34)', 'rgba(242,140,40,.48)'];
        const choro = Object.fromEntries(rows.map((r) => [r.name, { fill: steps[r.n === 0 ? 0 : Math.min(4, 1 + Math.floor((r.n / mx) * 3.99))], label: `${r.n} détections` }]));
        box.innerHTML = `<div class="stats">${[
          U.StatCard({ label: 'Détections thermiques', value: fmt.n(sum.total), foot: prev.total ? deltaHtml((sum.total - prev.total) / prev.total) + ' vs période préc.' : '', sym: icon('flame', 'sym'), accent: true }),
          U.StatCard({ label: 'VIIRS', value: fmt.n(sum.viirs), foot: '375 m', sym: shape('VIIRS', 10) }), U.StatCard({ label: 'MODIS', value: fmt.n(sum.modis), foot: '≈ 1 km', sym: shape('MODIS', 10) }),
          U.StatCard({ label: 'Événements probables', value: fmt.n(sum.events), foot: 'score moyen ' + (evs.items.length ? fmt.d2(evs.items.reduce((a, e) => a + e.score, 0) / evs.items.length) : '—'), sym: shape('EVT', 11) }),
          U.StatCard({ label: 'Provinces concernées', value: `${rows.filter((r) => r.n).length}<small>/ 9</small>`, foot: rows[0]?.n ? `Max : ${rows[0].name}` : '—', sym: icon('gabon', 'sym') }),
          U.StatCard({ label: 'FRP maximale', value: fmt.d1(sum.frp_max), unit: 'MW', foot: `moyenne ${fmt.d1(sum.frp_mean)} MW`, sym: icon('zones', 'sym') }),
        ].join('')}</div>
        <div class="grid g-12">
          ${card('Carte détaillée du Gabon', `<div id="gmap" style="height:470px;border-radius:8px;overflow:hidden"></div>`, { sub: 'Limites provinciales schématiques · teinte = nombre de détections', cls: 'span-8 span-lap-12', foot: `${endpoint('/api/detections?bbox=8.5,-4.1,14.6,2.4')}<span style="margin-left:auto">Source limites (production) : OCHA COD-AB / GADM niveau 1</span>` })}
          <div class="span-4 span-lap-12 stack">
            ${card('Indicateur analytique', `<div class="row" style="justify-content:space-between"><div>${U.LevelBadge(lvl.level, true)}</div>${U.ExpBadge()}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:14px 0 6px" aria-hidden="true">${['low', 'moderate', 'high'].map((k) => `<div style="height:6px;border-radius:3px;background:${k === lvl.level ? `var(--fw-color-level-${k})` : 'var(--fw-color-bg-surface3)'}"></div>`).join('')}</div><div class="row small muted" style="justify-content:space-between"><span>▽ Faible</span><span>◆ Modéré</span><span>▲ Élevé</span></div><p class="small secondary" style="margin:12px 0 0">${lvl.explain}</p><p class="small" style="margin:8px 0 0;color:var(--fw-color-feedback-warning)">Ne constitue pas une alerte officielle.</p>`)}
            ${card('Comparaison MODIS / VIIRS', `<div id="gcmp"></div>`, { sub: 'Détections par province (top 5)', foot: legendMV })}
          </div>
          ${card('Détections par province', U.DataTable({ cols: [{ label: 'Province', v: (r) => `<strong style="font-weight:500">${r.name}</strong> <span class="muted small">${r.capital}</span>` }, { label: 'Détections', r: 1, mono: 1, v: (r) => fmt.n(r.n) }, { label: 'VIIRS', r: 1, mono: 1, v: (r) => fmt.n(r.viirs) }, { label: 'MODIS', r: 1, mono: 1, v: (r) => fmt.n(r.modis) }, { label: 'FRP max (MW)', r: 1, mono: 1, v: (r) => (r.n ? fmt.d1(r.frp) : '—') }, { label: 'Évén.', r: 1, mono: 1, v: (r) => r.ev }, { label: 'Indicateur', v: (r) => U.LevelBadge(pl(r)) }], rows, caption: 'Détections par province' }), { sub: 'Répartition par limite schématique', cls: 'span-7 span-lap-12' })}
          ${card('Évolution récente', `<div id="gtl"></div>`, { sub: 'Détections hebdomadaires — 92 derniers jours (fenêtre fixe)', cls: 'span-5 span-lap-12', foot: 'Saison sèche (juin–sept.) puis retour des pluies : baisse attendue de l’activité en octobre–novembre.' })}
          ${card('Événements probables', evs.items.length ? `<div class="stack" style="gap:8px">${evs.items.slice(0, 5).map(eventCard).join('')}</div>` : U.EmptyState('empty'), { sub: `${fmt.n(evs.total)} sur la période`, actions: `<a class="btn btn--ghost btn--sm" href="#evenements">Tous les événements</a>`, cls: 'span-7 span-lap-12' })}
          ${card('Principales zones de concentration', hs.length ? `<ol class="rank">${hs.map((h, i) => `<li><span class="rank__n">${String(i + 1).padStart(2, '0')}</span><div><div class="rank__name">${esc(h.province || h.name)}</div><div class="rank__sub">${h.cell_label} · ${fmt.n(h.count)} dét. · ${h.active_days} j actifs</div></div>${U.LevelBadge(h.level)}</li>`).join('')}</ol>` : `<p class="small muted">Aucune cellule de 0,25° ne dépasse le seuil de 2 détections sur la période.</p>`, { sub: 'Cellules de 0,25° (≈ 28 km)', cls: 'span-5 span-lap-12' })}
        </div>`;
        A.maps.push(new U.FireMap(box.querySelector('#gmap'), { points: [...items, ...evs.items.map((e) => ({ _isEvent: true, ev: e, longitude: e.center[0], latitude: e.center[1], frp: e.frp_max, t: e.end }))], view: 'gabon', admin: true, cluster: false, choropleth: choro, hotspots: [], legendOpts: { admin: true, hotspots: false, collapsed: true }, viewButtons: false, emptyKind: st() === 'emptymap' ? 'emptymap' : null, onSelect: (pt, slot, m) => { slot.innerHTML = pt._isEvent ? `<div class="popup" style="top:12px;left:12px"><div class="popup__head">${shape('EVT', 12)}<h3>${pt.ev.id}</h3><button class="btn btn--ghost btn--sm btn--icon" data-close aria-label="Fermer">${icon('x')}</button></div><div class="popup__foot"><a class="btn btn--sm btn--nasa" href="#evenement-${pt.ev.id}">Ouvrir le détail</a></div></div>` : U.DetectionPopup(pt, A.settings.detail === 'expert'); slot.querySelector('[data-close]')?.addEventListener('click', () => m.select(null)); } }));
        const top5 = rows.slice(0, 5);
        U.BarChart(box.querySelector('#gcmp'), { horizontal: true, cats: top5.map((r) => r.name), series: [{ name: 'VIIRS', color: C.viirs, values: top5.map((r) => r.viirs) }, { name: 'MODIS', color: C.modis, values: top5.map((r) => r.modis) }], caption: 'Détections VIIRS et MODIS par province' });
        U.TimelineChart(box.querySelector('#gtl'), { x: tl90.series.map((b) => b.date), series: [{ name: 'VIIRS', color: C.viirs, values: tl90.series.map((b) => b.viirs) }, { name: 'MODIS', color: C.modis, values: tl90.series.map((b) => b.modis) }], gran: 'week', height: 200, caption: 'Évolution hebdomadaire au Gabon', area: false });
        box.querySelector('#gtl').insertAdjacentHTML('beforeend', `<div style="margin-top:8px">${legendMV}</div>`);
      } catch (e) { box.innerHTML = `<div class="card">${U.ErrorState(e)}</div>`; }
    },
  };
  const zoneLabel = (e) => (e.province && !e.zone.startsWith(e.province) ? `${e.province} — ${e.zone}` : e.zone);
  function eventCard(e) {
    const d = new Date(e.start);
    return `<a class="card evcard" href="#evenement-${e.id}">${U.HarmonizationScore(e.score, 44, false)}<div style="min-width:0"><div class="evcard__id">${e.id}</div><div class="evcard__name">${esc(zoneLabel(e))}</div><div class="evcard__meta"><span>${icon('clock', '')}${fmtDT(d)} UTC · ${fmt.d1(e.duration_h)} h</span><span>${e.n} détections</span><span>FRP max ${fmt.d1(e.frp_max)} MW</span></div></div><div class="evcard__badges">${e.satellites.map(U.SatelliteBadge).join('')}</div></a>`;
  }

  // ======================================================================
  // 4a. LISTE DES ÉVÉNEMENTS
  // ======================================================================
  S.evenements = {
    async render(el) {
      const A = APP(); let region = 'world', minScore = 0, sort = 'score', offset = 0, items = [];
      el.innerHTML = head('Analyse', 'Événements harmonisés', 'Rapprochements analytiques de plusieurs détections thermiques proches dans l’espace et dans le temps, éventuellement issues de capteurs différents. Un événement probable n’est pas un incendie confirmé.', '', U.DemoBadge()) +
        `<div class="card" style="margin-bottom:16px"><div class="card__body row" style="gap:16px"><label class="field"><span>Région (bbox)</span><select class="select" id="ev-region">${Object.entries(D.REGIONS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label><label class="field" style="min-width:200px"><span>Score minimal : <b class="mono" id="ev-ms-v">0,00</b></span><input type="range" id="ev-ms" min="0" max="0.9" step="0.05" value="0"></label><label class="field"><span>Trier par</span><select class="select" id="ev-sort"><option value="score">Score d’harmonisation</option><option value="recent">Plus récents</option><option value="n">Nombre de détections</option><option value="frp">FRP maximale</option></select></label><div class="field"><span>Méthode</span><span class="badge badge--nasa" style="height:36px">method_version = ${D.METHOD}</span></div></div></div>
        <div class="grid g-12"><div class="span-8 span-lap-12"><div id="ev-list" class="stack" style="gap:8px">${U.LoadingState('list')}</div><div id="ev-more" style="text-align:center;margin-top:12px"></div></div><div class="span-4 span-lap-12 stack" id="ev-side"></div></div>`;
      const load = async (append) => {
        const list = el.querySelector('#ev-list'); if (!append) { list.innerHTML = U.LoadingState('list'); offset = 0; items = []; }
        try {
          const p = A.params({ limit: 500, method_version: D.METHOD }); if (region !== 'world') p.bbox = D.REGIONS[region].bbox.join(',');
          const r = await get('/api/events', p);
          let all = r.items.filter((e) => e.score >= minScore);
          all.sort((a, b) => (sort === 'score' ? b.score - a.score : sort === 'recent' ? b.start - a.start : sort === 'n' ? b.n - a.n : b.frp_max - a.frp_max));
          items = all.slice(0, offset + 20); offset = items.length;
          if (st() === 'noresult' || (!all.length && r.total)) { list.innerHTML = `<div class="card">${U.EmptyState('noresult', resetBtn)}</div>`; bindReset(list); el.querySelector('#ev-more').innerHTML = ''; }
          else if (!all.length) { list.innerHTML = `<div class="card">${U.EmptyState('empty')}</div>`; el.querySelector('#ev-more').innerHTML = ''; }
          else { list.innerHTML = items.map(eventCard).join(''); el.querySelector('#ev-more').innerHTML = offset < all.length ? `<button class="btn" id="ev-load">Afficher 20 de plus <span class="muted mono">(${offset}/${all.length})</span></button>` : `<span class="small muted">${all.length} événements affichés</span>`; el.querySelector('#ev-load')?.addEventListener('click', () => load(true)); }
          const bins = [0, 0, 0, 0, 0]; all.forEach((e) => bins[Math.min(4, Math.floor(e.score * 5))]++);
          el.querySelector('#ev-side').innerHTML = card('Répartition des scores', `<div id="ev-hist"></div>`, { sub: `${fmt.n(all.length)} événements · ${A.periodLabel()}` }) + card('Comment lire un événement', `<p class="small secondary" style="margin-top:0">Chaque événement regroupe des détections situées à moins de <b>1 km</b> (VIIRS) ou <b>2 km</b> (si MODIS est impliqué), enchaînées avec moins de <b>48 h</b> d’écart.</p><p class="small secondary">Le <b>score d’harmonisation</b> (0–1) mesure la cohérence du rapprochement : spatiale, temporelle, nombre de plateformes et confiance.</p><a class="btn btn--sm" href="#methodologie">Méthode détaillée</a>`);
          U.BarChart(el.querySelector('#ev-hist'), { cats: ['0–0,2', '0,2–0,4', '0,4–0,6', '0,6–0,8', '0,8–1'], series: [{ name: 'Événements', color: C.fused, values: bins }], height: 170, caption: 'Distribution des scores d’harmonisation' });
        } catch (e) { list.innerHTML = `<div class="card">${U.ErrorState(e)}</div>`; }
      };
      el.querySelector('#ev-region').addEventListener('change', (e) => { region = e.target.value; load(); });
      el.querySelector('#ev-ms').addEventListener('input', (e) => { minScore = +e.target.value; el.querySelector('#ev-ms-v').textContent = fmt.d2(minScore); });
      el.querySelector('#ev-ms').addEventListener('change', () => load());
      el.querySelector('#ev-sort').addEventListener('change', (e) => { sort = e.target.value; load(); });
      await load();
    },
  };

  // ======================================================================
  // 4b. DÉTAIL D'UN ÉVÉNEMENT HARMONISÉ
  // ======================================================================
  S.evenement = {
    async render(el, id) {
      const A = APP();
      el.innerHTML = `<a class="btn btn--ghost btn--sm" href="#evenements" style="margin-bottom:8px">${icon('arrowLeft')}Événements harmonisés</a><div id="evd">${U.LoadingState('block', 120)}<div class="grid g-12" style="margin-top:16px"><div class="card span-7" style="height:420px">${U.LoadingState('map')}</div><div class="card span-5 card__body">${U.LoadingState('list')}</div></div></div>`;
      const box = el.querySelector('#evd');
      try {
        const e = await get(`/api/events/${id}`); const obs = e.detections; const an = e.analysis;
        const lat = `${Math.abs(e.center[1]).toFixed(4)}° ${e.center[1] >= 0 ? 'N' : 'S'}`, lon = `${Math.abs(e.center[0]).toFixed(4)}° ${e.center[0] >= 0 ? 'E' : 'O'}`;
        const t0 = obs[0].t, t1 = obs.at(-1).t; const span = Math.max(1, t1 - t0);
        const prevD = obs.map((o, i) => (i ? D.distKm([o.longitude, o.latitude], [obs[i - 1].longitude, obs[i - 1].latitude]) : null));
        const subRow = (k, l, w, why) => `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between;gap:8px"><span class="small">${l} <span class="muted">× ${fmt.d2(w)}</span></span><span class="mono small">${fmt.d2(e.sub[k])}</span></div><div class="hbar" style="margin-top:5px"><i style="width:${e.sub[k] * 100}%"></i></div><div class="small muted" style="margin-top:4px">${why}</div></div>`;
        box.innerHTML = head('Événement harmonisé', `<span class="mono" style="font-weight:500">${e.id}</span>`, `${esc(zoneLabel(e))} · ${esc(e.region)}`, `<button class="btn btn--nasa" data-action="assistant">${icon('sparkle')}Expliquer ce score</button><button class="btn" id="copy-id">${icon('copy')}Copier l’identifiant</button>`, U.DemoBadge()) +
          `<div class="notice notice--sci" style="margin-bottom:16px">${icon('info')}<div><strong>Avertissement scientifique</strong>Cet événement est un rapprochement analytique de plusieurs observations satellitaires. Il ne constitue pas une confirmation terrain.</div></div>
          <div class="grid g-12">
            ${card('Carte rapprochée', `<div id="emap" style="height:400px;border-radius:8px;overflow:hidden"></div>`, { sub: `Rayon de rapprochement : ${distFmt(e.dmax)} autour du centre`, cls: 'span-7 span-lap-12' })}
            <div class="span-5 span-lap-12 stack">
              ${card('Synthèse', `<div class="row" style="gap:20px;align-items:center;flex-wrap:nowrap">${U.HarmonizationScore(e.score, 96, false)}<dl class="kv" style="padding:0;flex:1"><dt>Position centrale</dt><dd>${lat}<br>${lon}</dd><dt>Durée estimée</dt><dd>${fmt.d1(e.duration_h)} h</dd><dt>Détections associées</dt><dd>${e.n}</dd><dt>FRP maximale</dt><dd>${fmt.d1(e.frp_max)} MW</dd></dl></div><div class="row" style="margin-top:14px"><span class="small muted">Capteurs</span>${e.sensors.map(U.SensorBadge).join('')}</div><div class="row" style="margin-top:8px"><span class="small muted">Satellites</span>${e.satellites.map(U.SatelliteBadge).join('')}</div>`, { sub: `Fenêtre : ${fmtDT(e.start)} → ${fmtDT(e.end)} UTC` })}
              ${card('Décomposition du score d’harmonisation', subRow('spatial', 'Cohérence spatiale', an.params.w.spatial, `Distance moyenne au centre ${distFmt(e.dmean)} · seuil ${distFmt(e.dmax)}`) + subRow('temporel', 'Cohérence temporelle', an.params.w.temporel, `Écart médian entre observations ${fmt.d1(e.gapMedian)} h · fenêtre 24 h`) + subRow('capteurs', 'Convergence des plateformes', an.params.w.capteurs, `${e.satellites.length} satellite(s) distinct(s) / 4`) + subRow('confiance', 'Confiance moyenne', an.params.w.confiance, 'MODIS % ÷ 100 ; VIIRS faible 0,3 · nominale 0,6 · élevée 0,9'), { foot: `Score = Σ (composante × poids) = <b class="mono">${fmt.d2(e.score)}</b>` })}
            </div>
            ${card('Timeline des observations', `<div class="otl" id="otl"></div>`, { sub: 'Position = heure d’acquisition (UTC) · forme = capteur', cls: 'span-12' })}
            ${card('Détections originales', U.DataTable({ cols: [{ label: '#', mono: 1, v: (o, i) => i + 1 }, { label: 'Identifiant', mono: 1, v: (o) => `<span class="small">${o.id}</span>` }, { label: 'Date / heure UTC', mono: 1, v: (o) => `${o.acq_date.slice(5).split('-').reverse().join('/')} ${o.acq_time.slice(0, 2)}:${o.acq_time.slice(2)}` }, { label: 'Satellite', v: (o) => U.SatelliteBadge(o.satellite) }, { label: 'Lat', r: 1, mono: 1, v: (o) => o.latitude.toFixed(4) }, { label: 'Lon', r: 1, mono: 1, v: (o) => o.longitude.toFixed(4) }, { label: 'Confiance', v: (o) => U.ConfidenceBadge(o) }, { label: 'FRP (MW)', r: 1, mono: 1, v: (o) => fmt.d1(o.frp) }, { label: 'J/N', v: (o) => (o.daynight === 'D' ? 'Jour' : 'Nuit') }, { label: 'Dist. au centre', r: 1, mono: 1, v: (o, i) => distFmt(an.dists[i]) }, { label: 'Dist. obs. préc.', r: 1, mono: 1, v: (o, i) => (prevD[i] == null ? '—' : distFmt(prevD[i])) }, { label: 'Écart temporel', r: 1, mono: 1, v: (o, i) => (i ? `${fmt.d1(an.gaps_h[i - 1])} h` : '—') }], rows: obs, caption: 'Détections originales rattachées à l’événement' }), { sub: `${obs.length} lignes · ${endpoint(`/api/events/${e.id}`)}`, cls: 'span-12', actions: `<button class="btn btn--sm" id="csv">${icon('download')}Exporter CSV</button>` })}
            ${card('Méthode utilisée', `<ol class="small secondary" style="margin:0;padding-left:18px;line-height:1.7"><li>Sélection des détections (période, emprise, confiance ≥ faible).</li><li>Graphe de voisinage : arête si distance ≤ ${an.params.dmax_viirs} km (VIIRS–VIIRS) ou ≤ ${an.params.dmax_modis} km (si MODIS) <b>et</b> écart ≤ ${an.params.chain_h} h.</li><li>Composantes connexes → événements probables.</li><li>Calcul des 4 composantes et du score pondéré.</li></ol><div class="row" style="margin-top:12px"><span class="badge badge--nasa">method_version ${e.method_version}</span><a class="btn btn--sm btn--ghost" href="#methodologie">Documentation</a></div>`, { cls: 'span-6 span-lap-12' })}
            ${card('Avertissement scientifique', `<ul class="small secondary" style="margin:0;padding-left:18px;line-height:1.7"><li>Une détection thermique signale une anomalie de température dans un pixel ; elle peut provenir d’un feu de végétation, d’un brûlage agricole, d’une torchère, d’une activité industrielle ou d’une surface très chaude.</li><li>L’absence de détection ne prouve pas l’absence de feu (nuages, fumée épaisse, canopée, heure de passage).</li><li>La position correspond au centre du pixel, non au foyer exact.</li></ul>`, { cls: 'span-6 span-lap-12' })}
          </div>`;
        // carte rapprochée
        const pad = 0.03; const lons = obs.map((o) => o.longitude), lats = obs.map((o) => o.latitude); const x0 = Math.min(...lons) - pad, x1 = Math.max(...lons) + pad, y0 = Math.min(...lats) - pad, y1 = Math.max(...lats) + pad; const w = Math.max(x1 - x0, y1 - y0);
        const m = new U.FireMap(box.querySelector('#emap'), { points: obs, view: [e.center[0] - w / 2, -e.center[1] - w / 2, w, w], cluster: false, viewButtons: false, labels: false, showGraticule: false, legendOpts: { events: true, hotspots: false, collapsed: true }, onSelect: (pt, slot, mm) => { slot.innerHTML = U.DetectionPopup(pt, true); slot.querySelector('[data-close]')?.addEventListener('click', () => mm.select(null)); } });
        A.maps.push(m);
        const g = m.svg.querySelector('.g-hot'); const rDeg = e.dmax / 111.32; const ring = () => `<circle cx="${e.center[0]}" cy="${-e.center[1]}" r="${rDeg}" fill="rgba(179,157,250,.06)" stroke="var(--fw-color-sensor-fused)" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M${e.center[0] - rDeg * 0.08} ${-e.center[1]}h${rDeg * 0.16}M${e.center[0]} ${-e.center[1] - rDeg * 0.08}v${rDeg * 0.16}" stroke="var(--fw-color-sensor-fused)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
        const orig = m.render.bind(m); m.render = () => { orig(); g.innerHTML = ring() + obs.map((o, i) => `<text x="${o.longitude}" y="${-o.latitude}" dx="0" class="map__label" font-size="${11 * (m.vb[2] / m.W)}" style="stroke-width:${3 * (m.vb[2] / m.W)}px" transform="translate(${8 * (m.vb[2] / m.W)} ${-6 * (m.vb[2] / m.W)})">${i + 1}</text>`).join(''); }; m.render();
        // timeline observations
        const otl = box.querySelector('#otl'); const hours = []; const h0 = Math.floor(t0 / 21600000) * 21600000; for (let t = h0; t <= t1 + 21600000; t += 21600000) hours.push(t);
        const X = (t) => ((t - h0) / (hours.at(-1) - h0)) * 100;
        otl.innerHTML = `<div class="otl__track">${hours.map((t) => `<span class="otl__tick" style="left:${X(t)}%"></span><span class="otl__ticklbl" style="left:${X(t)}%">${fmtDT(t)}</span>`).join('')}${obs.map((o, i) => `<button class="otl__obs" style="left:${X(o.t)}%;top:${-28 + (i % 2) * 52}px" title="${o.satellite} · ${o.acq_time.slice(0, 2)}:${o.acq_time.slice(2)} UTC · FRP ${fmt.d1(o.frp)} MW" aria-label="Observation ${i + 1} : ${o.satellite}, ${o.acq_date} ${o.acq_time} UTC">${i % 2 ? '<span class="otl__stem"></span>' : ''}${shape(o.instrument, 13)}<span class="lbl">${i + 1} · ${D.SAT[o.satellite].short}</span>${i % 2 ? '' : '<span class="otl__stem"></span>'}</button>`).join('')}</div><div class="row small muted" style="justify-content:space-between;margin-top:34px"><span>Première observation : ${fmtDT(t0)} UTC</span><span>Durée estimée ${fmt.d1(span / 3600000)} h · écart médian ${fmt.d1(e.gapMedian)} h</span><span>Dernière : ${fmtDT(t1)} UTC</span></div>`;
        box.querySelector('#copy-id').addEventListener('click', () => { try { navigator.clipboard.writeText(e.id); } catch (x) {} U.toast('Identifiant copié', e.id, 'ok', 2500); });
        box.querySelector('#csv').addEventListener('click', () => U.toast('Export préparé (démo)', `En production : GET /api/events/${e.id}?format=csv`, 'info'));
      } catch (err) { box.innerHTML = err.status === 404 ? `<div class="card">${U.EmptyState('empty', '<a class="btn btn--sm" href="#evenements">Retour à la liste</a>')}</div>` : `<div class="card">${U.ErrorState(err)}</div>`; }
    },
  };

  // ======================================================================
  // 5. COMPARAISON MODIS / VIIRS
  // ======================================================================
  S.comparaison = {
    async render(el) {
      const A = APP(); let region = 'central';
      el.innerHTML = head('Analyse', 'Comparaison MODIS / VIIRS', 'Deux familles de capteurs, deux résolutions, des heures de passage différentes : comprendre pourquoi les cartes ne se superposent pas exactement.', `<div class="seg" role="group" aria-label="Région de comparaison">${[['central', 'Afrique centrale'], ['gabon', 'Gabon'], ['africa', 'Afrique']].map(([k, l]) => `<button data-reg="${k}" aria-pressed="${k === region}">${l}</button>`).join('')}</div>`, U.DemoBadge()) + `<div id="cmp">${U.LoadingState('block', 300)}</div>`;
      const run = async () => {
        const box = el.querySelector('#cmp'); box.innerHTML = U.LoadingState('block', 300); A.maps.forEach((m) => m.destroy()); A.maps = [];
        try {
          const bb = { central: [5, -8, 31, 12], gabon: D.REGIONS.gabon.bbox, africa: D.REGIONS.africa.bbox }[region]; const p = A.params({ bbox: bb.join(',') });
          const [det, sats, tl, evs] = await Promise.all([get('/api/detections', { ...p, limit: 20000 }), get('/api/statistics/satellites', p), get('/api/statistics/timeline', { ...p, granularity: A.filters.range === '90d' ? 'week' : 'day' }), get('/api/events', { ...p, limit: 1000 })]);
          if (st() === 'noresult') { box.innerHTML = `<div class="card">${U.EmptyState('noresult', resetBtn)}</div>`; bindReset(box); return; }
          if (!det.total && st() !== 'emptymap') { box.innerHTML = `<div class="card">${U.EmptyState('empty')}</div>`; return; }
          const pts = A.clientFilter(det.items); const M = pts.filter((d) => d.instrument === 'MODIS'), V = pts.filter((d) => d.instrument === 'VIIRS');
          const agg = (l, ss) => ({ n: l.length, frpMean: l.length ? l.reduce((a, d) => a + d.frp, 0) / l.length : 0, frpMax: l.length ? Math.max(...l.map((d) => d.frp)) : 0, first: l[0]?.t, last: l.at(-1)?.t, night: l.filter((d) => d.daynight === 'N').length, sats: ss });
          const am = agg(M, 'Terra, Aqua'), av = agg(V, 'Suomi-NPP, NOAA-20, NOAA-21');
          const vb = { central: [5, -12, 26, 20], gabon: U.VIEWS.gabon, africa: U.VIEWS.africa }[region];
          const row = (l, a, b) => `<tr><th scope="row" style="position:static;background:none;font-weight:500;color:var(--fw-color-text-secondary)">${l}</th><td class="num">${a}</td><td class="num">${b}</td></tr>`;
          const evPts = evs.items.map((e) => ({ _isEvent: true, ev: e, longitude: e.center[0], latitude: e.center[1], frp: e.frp_max, t: e.end }));
          box.innerHTML = `<div class="compare-maps" style="margin-bottom:16px">
            <section class="card"><div class="card__head" style="padding-bottom:12px">${shape('MODIS', 12)}<h3 class="card__title">MODIS uniquement</h3><span class="card__sub mono">${fmt.n(am.n)}</span></div><div id="m-modis" class="map"></div></section>
            <section class="card"><div class="card__head" style="padding-bottom:12px">${shape('VIIRS', 12)}<h3 class="card__title">VIIRS uniquement</h3><span class="card__sub mono">${fmt.n(av.n)}</span></div><div id="m-viirs" class="map"></div></section>
            <section class="card"><div class="card__head" style="padding-bottom:12px">${shape('EVT', 12)}<h3 class="card__title">Carte fusionnée</h3><span class="card__sub mono">+ ${fmt.n(evs.total)} évén.</span></div><div id="m-fused" class="map"></div></section></div>
            <div class="grid g-12">
              ${card('Tableau de comparaison', `<div class="table-wrap"><table class="table"><caption class="sr-only">Comparaison des capteurs MODIS et VIIRS</caption><thead><tr><th scope="col">Indicateur</th><th scope="col">${shape('MODIS', 9)} MODIS</th><th scope="col">${shape('VIIRS', 9)} VIIRS</th></tr></thead><tbody>${row('Résolution au nadir', '≈ 1 km', '375 m')}${row('Satellites', am.sats, av.sats)}${row('Nombre de détections', fmt.n(am.n), fmt.n(av.n))}${row('Part nocturne', am.n ? Math.round((am.night / am.n) * 100) + ' %' : '—', av.n ? Math.round((av.night / av.n) * 100) + ' %' : '—')}${row('FRP moyenne', fmt.d1(am.frpMean) + ' MW', fmt.d1(av.frpMean) + ' MW')}${row('FRP maximale', fmt.d1(am.frpMax) + ' MW', fmt.d1(av.frpMax) + ' MW')}${row('Couverture temporelle', am.first ? `${fmtDT(am.first)} → ${fmtDT(am.last)}` : '—', av.first ? `${fmtDT(av.first)} → ${fmtDT(av.last)}` : '—')}${row('Heures de passage (locales)', '≈ 10:30 / 13:30 · 22:30 / 01:30', '≈ 13:30 · 01:30')}${row('Expression de la confiance', '0–100 %', 'faible / nominale / élevée')}${row('Produit FIRMS (NRT)', 'MCD14DL C6.1', 'VNP14IMGTDL · VJ114 · VJ214')}</tbody></table></div>`, { cls: 'span-7 span-lap-12', foot: endpoint('/api/statistics/satellites') })}
              ${card('Détections par capteur dans le temps', `<div id="c-tl"></div><div style="margin-top:8px">${legendMV}</div>`, { sub: 'Deux séries, un seul axe', cls: 'span-5 span-lap-12' })}
              ${card('Avant / après harmonisation', `<div class="ba" id="ba" style="--ba:50%"><div class="ba__layer"><div id="ba-before" class="map"></div></div><div class="ba__layer ba__layer--after"><div id="ba-after" class="map"></div></div><span class="ba__tag ba__tag--l badge">Avant · ${fmt.n(pts.length)} détections brutes</span><span class="ba__tag ba__tag--r badge badge--fused">${shape('EVT', 9)}Après · ${fmt.n(evs.total)} événements probables</span><input class="ba__range" type="range" min="0" max="100" value="50" aria-label="Curseur avant / après harmonisation"><div class="ba__divider" aria-hidden="true"></div></div><p class="small muted" style="margin:10px 0 0">Faites glisser le curseur (ou utilisez les flèches du clavier). À gauche : chaque détection telle que publiée par FIRMS. À droite : les rapprochements analytiques. Les détections isolées ne forment pas d’événement.</p>`, { cls: 'span-12' })}
              ${card('Pourquoi les capteurs diffèrent', `<div class="grid g-12" style="gap:16px">${[['ruler', 'Résolution', 'Un pixel MODIS couvre ≈ 7 fois la surface d’un pixel VIIRS. VIIRS détecte des feux plus petits ; un même foyer peut produire plusieurs détections VIIRS pour une seule détection MODIS.'], ['clock', 'Heures de passage', 'Terra passe en fin de matinée, Aqua et les VIIRS en début d’après-midi. Les feux ayant un cycle diurne marqué, les comptages diffèrent selon l’heure.'], ['satellite', 'Nombre de plateformes', 'Trois VIIRS contre deux MODIS : la fréquence de revisite VIIRS est plus élevée. Comparer des comptages bruts surestime VIIRS.'], ['cloud', 'Géométrie et nuages', 'En bord de fauchée, les pixels s’agrandissent (surtout MODIS). Nuages et fumée masquent différemment selon l’angle et l’heure.']].map(([ic, t, d]) => `<div class="span-3 span-tab-6"><div class="method__ico">${icon(ic)}</div><h3 style="font-size:14px;margin:10px 0 6px">${t}</h3><p class="small secondary" style="margin:0;line-height:1.6">${d}</p></div>`).join('')}</div>`, { cls: 'span-12' })}
            </div>`;
          const base = { cluster: false, markerPx: 2.4, viewButtons: false, controls: false, legend: false, labels: false, view: vb, showGraticule: false, emptyKind: st() === 'emptymap' ? 'emptymap' : null };
          A.maps.push(new U.FireMap(box.querySelector('#m-modis'), { ...base, points: M }), new U.FireMap(box.querySelector('#m-viirs'), { ...base, points: V }), new U.FireMap(box.querySelector('#m-fused'), { ...base, points: [...pts, ...evPts] }));
          A.maps.push(new U.FireMap(box.querySelector('#ba-before'), { ...base, interactive: false, points: pts }), new U.FireMap(box.querySelector('#ba-after'), { ...base, interactive: false, points: evPts }));
          const ba = box.querySelector('#ba'); box.querySelector('.ba__range').addEventListener('input', (e) => ba.style.setProperty('--ba', e.target.value + '%'));
          U.TimelineChart(box.querySelector('#c-tl'), { x: tl.series.map((b) => b.date), series: [{ name: 'MODIS', color: C.modis, values: tl.series.map((b) => b.modis) }, { name: 'VIIRS', color: C.viirs, values: tl.series.map((b) => b.viirs) }], height: 230, gran: tl.granularity, area: false, caption: 'Détections MODIS et VIIRS dans le temps' });
        } catch (e) { box.innerHTML = `<div class="card">${U.ErrorState(e)}</div>`; }
      };
      el.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', () => { region = b.dataset.reg; el.querySelectorAll('[data-reg]').forEach((x) => x.setAttribute('aria-pressed', x === b)); run(); }));
      await run();
    },
  };

  // ======================================================================
  // 6. HISTORIQUE TEMPOREL
  // ======================================================================
  S.historique = {
    async render(el) {
      const A = APP(); const f = A.filters; const per = A.period();
      const q = { start: per.start, end: per.end, region: 'world', sensor: '', sat: '', gran: 'day' };
      el.innerHTML = head('Analyse', 'Historique temporel', 'Explorer l’activité thermique dans le temps, repérer les jours inhabituels et comparer deux périodes.', '', U.DemoBadge()) +
        `<form class="card" id="h-form" style="margin-bottom:16px"><div class="card__body row" style="gap:14px;align-items:flex-end">
          <label class="field"><span>Date de début</span><input class="input" type="date" name="start" value="${q.start}" min="${D.isoDate(D.START)}" max="2026-11-14"></label>
          <label class="field"><span>Date de fin</span><input class="input" type="date" name="end" value="${q.end}" min="${D.isoDate(D.START)}" max="2026-11-14"></label>
          <label class="field"><span>Région</span><select class="select" name="region">${Object.entries(D.REGIONS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
          <label class="field"><span>Capteur</span><select class="select" name="sensor"><option value="">Tous</option><option>MODIS</option><option>VIIRS</option></select></label>
          <label class="field"><span>Satellite</span><select class="select" name="sat"><option value="">Tous</option>${D.SATS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>
          <div class="field"><span>Granularité</span><div class="seg" role="radiogroup" aria-label="Granularité">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([k, l]) => `<button type="button" role="radio" data-gran="${k}" aria-checked="${k === q.gran}">${l}</button>`).join('')}</div></div>
          <button class="btn btn--primary" type="submit">${icon('search')}Analyser</button></div><div class="card__foot">Couverture des données de démonstration : <span class="mono">${D.isoDate(D.START)} → 2026-11-14</span> · paramètres API : <span class="mono">start_date, end_date, bbox, sensor, satellite</span></div></form><div id="h-out"></div>`;
      const form = el.querySelector('#h-form');
      form.querySelectorAll('[data-gran]').forEach((b) => b.addEventListener('click', () => { q.gran = b.dataset.gran; form.querySelectorAll('[data-gran]').forEach((x) => x.setAttribute('aria-checked', x === b)); run(); }));
      form.addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(form); Object.assign(q, { start: fd.get('start'), end: fd.get('end'), region: fd.get('region'), sensor: fd.get('sensor'), sat: fd.get('sat') }); if (q.start > q.end) { U.toast('Période invalide', 'La date de début doit précéder la date de fin.', 'err'); return; } f.range = 'custom'; f.start = q.start; f.end = q.end; A.syncRange(); run(); });
      const run = async () => {
        const out = el.querySelector('#h-out'); out.innerHTML = `<div class="grid g-12"><div class="card span-8 card__body">${U.LoadingState('chart', 240)}</div><div class="card span-4 card__body">${U.LoadingState('list')}</div></div>`;
        try {
          const p = { start_date: q.start, end_date: q.end, sensor: q.sensor || undefined, satellite: q.sat || undefined, bbox: q.region !== 'world' ? D.REGIONS[q.region].bbox.join(',') : undefined };
          const len = Date.parse(q.end) - Date.parse(q.start) + D.DAY; const pB = { ...p, start_date: D.isoDate(Date.parse(q.start) - len), end_date: D.isoDate(Date.parse(q.start) - D.DAY) };
          const [tl, daily, sA, sB, tlB] = await Promise.all([get('/api/statistics/timeline', { ...p, granularity: q.gran }), get('/api/statistics/timeline', { ...p, granularity: 'day' }), get('/api/statistics/summary', p), get('/api/statistics/summary', pB), get('/api/statistics/timeline', { ...pB, granularity: 'day' })]);
          if (st() === 'noresult') { out.innerHTML = `<div class="card">${U.EmptyState('noresult', resetBtn)}</div>`; bindReset(out); return; }
          if (!sA.total) { out.innerHTML = `<div class="card">${U.EmptyState('empty')}</div>`; return; }
          const dv = daily.series.map((b) => b.total); const un = unusualIdx(dv); const unDates = new Set(un.map((i) => daily.series[i].date)); const ndays = daily.series.length;
          const unG = q.gran === 'day' ? un : [];
          const evTotal = tl.series.reduce((a, b) => a + b.events, 0);
          const covB = Date.parse(pB.start_date) >= D.START;
          out.innerHTML = `<div class="stats">${[
            U.StatCard({ label: 'Activité moyenne', value: fmt.d1(sA.total / ndays), unit: '/ jour', foot: `${fmt.n(sA.total)} détections sur ${ndays} j`, sym: icon('flame', 'sym'), accent: true }),
            U.StatCard({ label: 'Période précédente', value: covB ? fmt.d1(sB.total / ndays) : '—', unit: covB ? '/ jour' : '', foot: covB ? deltaHtml((sA.total - sB.total) / Math.max(1, sB.total)) : 'Hors couverture des données', sym: icon('history', 'sym') }),
            U.StatCard({ label: 'Jours inhabituels', value: fmt.n(un.length), foot: 'écart > 2σ à la moyenne', sym: '<span aria-hidden="true">▲</span>' }),
            U.StatCard({ label: 'FRP moyenne', value: fmt.d1(sA.frp_mean), unit: 'MW', foot: `max ${fmt.d1(sA.frp_max)} MW`, sym: icon('zones', 'sym') }),
            U.StatCard({ label: 'Événements harmonisés', value: fmt.n(evTotal), foot: D.METHOD, sym: shape('EVT', 11) }),
            U.StatCard({ label: 'Part nocturne', value: Math.round((sA.night / sA.total) * 100), unit: '%', foot: `${fmt.n(sA.night)} détections de nuit`, sym: icon('moon', 'sym') }),
          ].join('')}</div>
          <div class="grid g-12">
            ${card('Courbe temporelle', `<div id="h-tl"></div><div class="row" style="justify-content:space-between;margin-top:8px">${legendMV}<span class="small muted">▲ jour inhabituel</span></div>${U.dataAlt([{ label: 'Période', v: (r) => r.date }, { label: 'MODIS', r: 1, mono: 1, v: (r) => fmt.n(r.modis) }, { label: 'VIIRS', r: 1, mono: 1, v: (r) => fmt.n(r.viirs) }, { label: 'Événements', r: 1, mono: 1, v: (r) => fmt.n(r.events) }], tl.series)}`, { sub: `Détections empilées par capteur · granularité ${{ day: 'jour', week: 'semaine', month: 'mois' }[q.gran]}`, cls: 'span-8 span-lap-12', foot: endpoint(`/api/statistics/timeline?granularity=${q.gran}`) })}
            ${card('Heatmap calendrier', `<div id="h-cal"></div>`, { sub: 'Détections quotidiennes', cls: 'span-4 span-lap-12' })}
            ${card('Comparaison de deux périodes', covB ? `<div id="h-cmp"></div><div class="legend" style="margin-top:6px"><span><i class="sw" style="background:${C.thermal}"></i>Période A · ${q.start.slice(5).split('-').reverse().join('/')} → ${q.end.slice(5).split('-').reverse().join('/')}</span><span><i class="sw" style="background:var(--fw-color-text-muted);height:2px;border-top:2px dashed var(--fw-color-text-muted);background:none"></i>Période B · précédente</span></div>` : `<p class="small muted">La période précédente (${pB.start_date} → ${pB.end_date}) sort de la couverture des données de démonstration.</p>`, { sub: 'Jour par jour, alignées sur le premier jour', cls: 'span-6 span-lap-12' })}
            ${card('Évolution de la FRP', `<div id="h-frp"></div>`, { sub: 'FRP cumulée par période (MW)', cls: 'span-6 span-lap-12' })}
            ${card('Jours inhabituels', un.length ? U.DataTable({ cols: [{ label: 'Date', mono: 1, v: (i) => daily.series[i].date }, { label: 'Détections', r: 1, mono: 1, v: (i) => fmt.n(daily.series[i].total) }, { label: 'Moyenne', r: 1, mono: 1, v: () => fmt.d1(sA.total / ndays) }, { label: 'Écart', r: 1, mono: 1, v: (i) => '×' + fmt.d1(daily.series[i].total / (sA.total / ndays)) }, { label: 'FRP max', r: 1, mono: 1, v: (i) => fmt.d1(daily.series[i].frp_max) }], rows: un, caption: 'Jours inhabituels' }) : '<p class="small muted">Aucun jour ne dépasse 2 écarts-types au-dessus de la moyenne sur cette période.</p>', { sub: 'Écart > 2σ — à interpréter avec la couverture nuageuse et le nombre de passages', cls: 'span-6 span-lap-12' })}
            ${card('Événements harmonisés', `<div id="h-ev"></div>`, { sub: 'Nombre d’événements démarrant dans chaque période', cls: 'span-6 span-lap-12' })}
          </div>`;
          const x = tl.series.map((b) => b.date);
          U.TimelineChart(out.querySelector('#h-tl'), { x, series: [{ name: 'MODIS', color: C.modis, values: tl.series.map((b) => b.modis) }, { name: 'VIIRS', color: C.viirs, values: tl.series.map((b) => b.viirs) }], stacked: true, height: 250, gran: q.gran, unusual: unG, caption: 'Courbe temporelle des détections' });
          U.HeatmapCalendar(out.querySelector('#h-cal'), { days: daily.series.map((b) => ({ date: b.date, value: b.total })), unusual: unDates });
          if (covB) U.TimelineChart(out.querySelector('#h-cmp'), { x: daily.series.map((b) => b.date), series: [{ name: 'Période A', color: C.thermal, values: dv }, { name: 'Période B', color: 'var(--fw-color-text-muted)', values: tlB.series.map((b) => b.total).slice(0, dv.length), dash: '4 4' }], height: 200, area: false, caption: 'Comparaison de deux périodes' });
          U.TimelineChart(out.querySelector('#h-frp'), { x, series: [{ name: 'FRP cumulée', color: C.thermal, values: tl.series.map((b) => b.frp_sum) }], height: 200, gran: q.gran, yFormat: (v) => (v >= 1000 ? fmt.d1(v / 1000) + ' k' : fmt.n(Math.round(v))), caption: 'Évolution de la FRP cumulée' });
          U.BarChart(out.querySelector('#h-ev'), { cats: x.map((k) => U.shortDate(k, q.gran)).map((s, i, a) => (a.length > 16 && i % Math.ceil(a.length / 10) ? '' : s)), series: [{ name: 'Événements', color: C.fused, values: tl.series.map((b) => b.events) }], height: 200, caption: 'Événements harmonisés par période' });
        } catch (e) { out.innerHTML = `<div class="card">${U.ErrorState(e)}</div>`; }
      };
      await run();
    },
  };

  // ======================================================================
  // 7. ZONES DE CONCENTRATION
  // ======================================================================
  S.zones = {
    async render(el) {
      const A = APP(); let region = 'world', cell = 1, sel = null;
      el.innerHTML = head('Analyse', 'Zones de concentration', 'Classement des cellules présentant une concentration élevée de détections thermiques. Une zone de concentration n’est pas une zone d’incendie confirmée.', `<div class="seg" role="group" aria-label="Taille de cellule">${[[1, '1° (≈ 110 km)'], [0.5, '0,5°'], [0.25, '0,25°']].map(([k, l]) => `<button data-cell="${k}" aria-pressed="${k === cell}">${l}</button>`).join('')}</div>`, U.DemoBadge()) +
        `<div class="row" style="margin-bottom:14px" role="group" aria-label="Filtres régionaux">${Object.entries(D.REGIONS).map(([k, v]) => `<button class="chip" data-zr="${k}" aria-pressed="${k === region}">${v.label}</button>`).join('')}</div><div id="z-out"></div>`;
      const run = async () => {
        const out = el.querySelector('#z-out'); out.innerHTML = `<div class="grid g-12"><div class="card span-5" style="height:520px">${U.LoadingState('map')}</div><div class="card span-7 card__body">${U.LoadingState('list')}</div></div>`; A.maps.forEach((m) => m.destroy()); A.maps = [];
        try {
          const p = A.params({ cell, limit: 25 }); if (region !== 'world') p.bbox = D.REGIONS[region].bbox.join(',');
          const [hs, det] = await Promise.all([get('/api/analytics/hotspots', p), get('/api/detections', { ...A.params(), bbox: p.bbox, limit: 20000 })]);
          if (st() === 'noresult') { out.innerHTML = `<div class="card">${U.EmptyState('noresult', resetBtn)}</div>`; bindReset(out); return; }
          if (!hs.length) { out.innerHTML = `<div class="card">${U.EmptyState('empty')}</div>`; return; }
          out.innerHTML = `<div class="grid g-12"><div class="span-12" id="z-detail"></div>${card('Carte de densité', `<div id="zmap" style="height:400px;border-radius:8px;overflow:hidden"></div>`, { sub: 'Cellules classées (contour pointillé) + détections regroupées', cls: 'span-12' })}
            ${card('Classement des zones', U.DataTable({ cols: [{ label: '#', mono: 1, v: (h, i) => i + 1 }, { label: 'Zone', v: (h) => `<div style="font-weight:500;max-width:240px;overflow:hidden;text-overflow:ellipsis">${esc(h.province ? 'Gabon · ' + h.province : h.name)}</div><div class="mono small muted">${h.cell_label}</div>` }, { label: 'Détections', r: 1, mono: 1, v: (h) => fmt.n(h.count) }, { label: 'Jours actifs', r: 1, mono: 1, v: (h) => h.active_days }, { label: 'FRP cumulée', r: 1, mono: 1, v: (h) => fmt.d1(h.frp_sum) + ' MW' }, { label: 'Variation', r: 1, v: (h) => deltaHtml(h.variation) }, { label: 'Score', v: (h) => `<div style="display:flex;align-items:center;gap:8px"><span class="mono small" style="width:22px">${h.score}</span><div class="hbar" style="width:60px"><i style="width:${h.score}%;background:var(--fw-color-level-${h.level})"></i></div></div>` }, { label: 'Niveau', v: (h) => U.LevelBadge(h.level) }], rows: hs, caption: 'Classement des zones de concentration', rowAttr: (h, i) => `class="is-link" tabindex="0" data-hs="${i}" aria-label="Explorer ${esc(h.name)}"` }), { sub: `${hs.length} zones · cliquez une ligne pour l’explorer · variation vs période précédente de même durée`, cls: 'span-12', foot: `Score de concentration = 50 % détections + 30 % jours actifs + 20 % FRP cumulée (normalisés) · ${endpoint('/api/analytics/hotspots')}` })}
            </div>`;
          const view = region === 'world' ? 'world' : (() => { const b = D.REGIONS[region].bbox; return [b[0], -b[3], b[2] - b[0], b[3] - b[1]]; })();
          const map = new U.FireMap(out.querySelector('#zmap'), { points: A.clientFilter(det.items), hotspots: hs, view, viewButtons: region === 'world', legendOpts: { hotspots: true, collapsed: true } }); A.maps.push(map);
          const open = (i) => { const h = hs[i]; sel = h; const [a, b, c, d] = h.bbox; const w = (c - a) * 3; map.setView([a - w / 3, -d - w / 3, w, w]); out.querySelectorAll('[data-hs]').forEach((r) => r.style.background = +r.dataset.hs === i ? 'var(--fw-color-bg-surface3)' : '');
            out.querySelector('#z-detail').innerHTML = card(`Zone ${String(i + 1).padStart(2, '0')} — ${esc(h.name)}`, `<div class="row" style="gap:28px"><div><div class="overline">Cellule</div><div class="mono">${h.cell_label}</div></div><div><div class="overline">Détections</div><div class="mono">${fmt.n(h.count)} <span class="muted">(${h.viirs} VIIRS · ${h.modis} MODIS)</span></div></div><div><div class="overline">Jours actifs</div><div class="mono">${h.active_days}</div></div><div><div class="overline">FRP max</div><div class="mono">${fmt.d1(h.frp_max)} MW</div></div><div><div class="overline">Score</div><div class="mono">${h.score} / 100</div></div>${U.LevelBadge(h.level, true)}<div style="margin-left:auto" class="row"><button class="btn btn--sm" data-zgo>${icon('globe')}Explorer sur la carte</button><a class="btn btn--sm btn--ghost" href="#evenements">Événements de la zone</a></div></div><p class="small muted" style="margin:12px 0 0">Zone présentant une concentration élevée de détections. Interprétation à croiser avec l’occupation du sol, les pratiques agricoles et les observations de terrain.</p>`, {});
            out.querySelector('[data-zgo]').addEventListener('click', () => { A.pendingView = [a - 1, -d - 1, c - a + 2, d - b + 2]; A.go('#carte'); }); };
          out.querySelectorAll('[data-hs]').forEach((r) => { r.addEventListener('click', () => open(+r.dataset.hs)); r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(+r.dataset.hs); } }); });
        } catch (e) { out.innerHTML = `<div class="card">${U.ErrorState(e)}</div>`; }
      };
      el.querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => { cell = +b.dataset.cell; el.querySelectorAll('[data-cell]').forEach((x) => x.setAttribute('aria-pressed', x === b)); run(); }));
      el.querySelectorAll('[data-zr]').forEach((b) => b.addEventListener('click', () => { region = b.dataset.zr; if (region === 'gabon' && cell === 1) { cell = 0.25; el.querySelectorAll('[data-cell]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.cell === cell)); } el.querySelectorAll('[data-zr]').forEach((x) => x.setAttribute('aria-pressed', x === b)); run(); }));
      await run();
    },
  };

  // ======================================================================
  // 8. SOURCES ET MÉTHODOLOGIE
  // ======================================================================
  S.methodologie = {
    async render(el) {
      const P = D.PARAMS; const sec = (id, ic, t, body) => `<section class="card method" id="${id}" style="scroll-margin-top:16px"><div class="row"><span class="method__ico">${icon(ic)}</span><h3 style="margin:0">${t}</h3></div>${body}</section>`;
      const toc = [['firms', 'NASA FIRMS'], ['capteurs', 'MODIS et VIIRS'], ['resolution', 'Résolution des capteurs'], ['nrt', 'NRT et données standard'], ['harmonisation', 'Méthode d’harmonisation'], ['score', 'Calcul du score'], ['limites', 'Limites des données'], ['nuages', 'Nuages et fumée'], ['detection', 'Détection ≠ feu confirmé'], ['api', 'Contrat API'], ['liens', 'Liens NASA']];
      el.innerHTML = head('Référence', 'Sources et méthodologie', 'Ce que mesurent les satellites, ce que FireWatch calcule, et ce que les données ne permettent pas d’affirmer.') +
        `<div class="grid g-12"><nav class="span-3 toc-col" aria-label="Sommaire"><div class="toc card" style="padding:10px 0">${toc.map(([id, l]) => `<a href="#methodologie" data-jump="${id}">${l}</a>`).join('')}</div></nav><div class="span-9 stack">
        ${sec('firms', 'satellite', 'NASA FIRMS', `<p>FIRMS (<em>Fire Information for Resource Management System</em>) diffuse les détections d’anomalies thermiques actives issues des instruments MODIS et VIIRS. Chaque enregistrement correspond au centre d’un pixel dans lequel l’algorithme a détecté une ou plusieurs sources de chaleur, avec sa date et son heure d’acquisition (UTC), sa luminosité, son niveau de confiance et sa puissance radiative (FRP).</p>`)}
        ${sec('capteurs', 'compare', 'MODIS et VIIRS', `<div class="grid g-12" style="gap:14px;margin-top:6px"><div class="span-6"><div class="row">${U.SensorBadge('MODIS')}</div><ul><li>À bord de <b>Terra</b> et <b>Aqua</b>.</li><li>Produit FIRMS : MCD14DL, Collection 6.1.</li><li>Confiance exprimée de 0 à 100 %.</li></ul></div><div class="span-6"><div class="row">${U.SensorBadge('VIIRS')}</div><ul><li>À bord de <b>Suomi-NPP</b>, <b>NOAA-20</b> et <b>NOAA-21</b>.</li><li>Produits I-band 375 m : VNP14IMG, VJ114IMG, VJ214IMG.</li><li>Confiance : faible, nominale, élevée.</li></ul></div></div>`)}
        ${sec('resolution', 'ruler', 'Résolution des capteurs', `<div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>Capteur</th><th>Plateformes</th><th class="r">Pixel au nadir</th><th>Conséquence</th></tr></thead><tbody><tr><td>${shape('MODIS', 9)} MODIS</td><td>Terra, Aqua</td><td class="r num">≈ 1 km</td><td>Feux plus petits moins détectés ; pixels agrandis en bord de fauchée.</td></tr><tr><td>${shape('VIIRS', 9)} VIIRS</td><td>S-NPP, NOAA-20, NOAA-21</td><td class="r num">375 m</td><td>Meilleure sensibilité aux petits feux ; localisation plus fine.</td></tr></tbody></table></div>`)}
        ${sec('nrt', 'clock', 'Différence entre NRT et données standard', `<p><b>NRT (Near Real-Time)</b> : produites rapidement après le passage du satellite, en général dans les trois heures, avec des données auxiliaires provisoires. Elles servent au suivi opérationnel.</p><p><b>Données standard (Standard Processing)</b> : retraitées ultérieurement avec des paramètres définitifs ; elles remplacent les NRT dans les archives et sont préférables pour les analyses historiques. FireWatch affiche la version du produit (<span class="mono">6.1NRT</span>, <span class="mono">2.0NRT</span>…) dans chaque fiche.</p>`)}
        ${sec('harmonisation', 'events', 'Méthode d’harmonisation', `<p>L’harmonisation rapproche des détections qui décrivent probablement la même activité thermique.</p><ol style="color:var(--fw-color-text-secondary);font-size:13.5px;line-height:1.7"><li>Filtrage par période, emprise (<span class="mono">bbox</span>) et version de méthode (<span class="mono">method_version</span>).</li><li>Construction d’un graphe : deux détections sont reliées si leur distance est ≤ <b>${P.dmax_viirs} km</b> (VIIRS–VIIRS) ou ≤ <b>${P.dmax_modis} km</b> (dès qu’un pixel MODIS est en jeu), et si leur écart temporel est ≤ <b>${P.chain_h} h</b>.</li><li>Chaque composante connexe d’au moins deux détections devient un <b>événement probable</b>.</li><li>Position centrale = barycentre ; durée estimée = première → dernière observation.</li></ol><div class="notice notice--sci" style="margin-top:8px">${icon('info')}<div>Les seuils tiennent compte de la taille des pixels : un pixel MODIS en bord de fauchée peut dépasser 2 km de côté.</div></div>`)}
        ${sec('score', 'sparkle', 'Calcul du score d’harmonisation', `<div class="formula">S = ${P.w.spatial} · S_spatial + ${P.w.temporel} · S_temporel + ${P.w.capteurs} · S_plateformes + ${P.w.confiance} · S_confiance

S_spatial     = max(0, 1 − d̄ / d_max)        d̄ : distance moyenne au barycentre
S_temporel    = max(0, 1 − Δt_méd / ${P.dt_max_h} h)    Δt_méd : écart médian entre observations
S_plateformes = min(1, n_satellites / 4)
S_confiance   = moyenne(MODIS % ÷ 100 ; VIIRS l=0,3 · n=0,6 · h=0,9)</div><p>Exemple : <a href="#evenement-EVT-GA-0007">EVT-GA-0007</a> → 0,35 × 0,73 + 0,25 × 0,77 + 0,25 × 0,75 + 0,15 × 0,55 = <b>0,72</b>. Le score mesure la cohérence du rapprochement, pas la probabilité d’un feu.</p>`)}
        ${sec('limites', 'alert', 'Limites des données', `<ul><li>Un seul passage par jour et par plateforme, environ, de jour et de nuit : les feux brefs peuvent ne pas être observés.</li><li>Faux positifs possibles : surfaces très chaudes, torchères, sites industriels, reflets.</li><li>La FRP est une mesure instantanée, non une surface brûlée.</li><li>Les comptages dépendent du nombre de satellites actifs (ex. : panne ou ingestion incomplète d’une plateforme).</li></ul>`)}
        ${sec('nuages', 'cloud', 'Influence des nuages et de la fumée', `<p>Les nuages bloquent le signal infrarouge : une zone couverte ne produit aucune détection, même en présence de feu. La fumée dense peut atténuer le signal. En Afrique centrale, la saison des pluies réduit fortement le nombre d’observations exploitables ; une baisse des détections ne signifie donc pas nécessairement une baisse de l’activité.</p>`)}
        ${sec('detection', 'flame', 'Différence entre détection thermique et feu confirmé', `<div class="grid g-12" style="gap:12px"><div class="span-6 card" style="padding:14px;background:var(--fw-color-bg-surface2)"><div class="overline">Ce que FireWatch affiche</div><ul><li>Détection thermique</li><li>Événement probable</li><li>Activité thermique</li><li>Zone de concentration</li><li>Niveau de confiance, score d’harmonisation</li></ul></div><div class="span-6 card" style="padding:14px;background:var(--fw-color-bg-surface2)"><div class="overline">Ce qui exige des données terrain</div><ul><li>Confirmation qu’un feu a eu lieu</li><li>Cause, surface brûlée, dégâts</li><li>Alerte officielle — rôle des autorités compétentes</li></ul></div></div>`)}
        ${sec('api', 'server', 'Contrat API', `${U.DataTable({ cols: [{ label: 'Endpoint', mono: 1, v: (r) => r[0] }, { label: 'Usage dans l’interface', v: (r) => r[1] }], rows: [['GET /api/health', 'Pastille d’état (barre latérale), bannière service dégradé'], ['GET /api/metadata', 'Dernière mise à jour, couverture, satellites, méthodes'], ['GET /api/detections', 'Cartes, alternative textuelle, comparaisons'], ['GET /api/detections/{id}', 'Fiche détection (popup carte)'], ['GET /api/events', 'Liste des événements, couche carte'], ['GET /api/events/{id}', 'Détail d’un événement'], ['GET /api/statistics/summary', 'Indicateurs (StatCard)'], ['GET /api/statistics/timeline', 'Courbes, heatmap, comparaison de périodes'], ['GET /api/statistics/satellites', 'MODIS vs VIIRS'], ['GET /api/analytics/hotspots', 'Zones de concentration']], caption: 'Endpoints' })}<p class="small muted" style="margin-top:10px">Filtres : <span class="mono">start_date, end_date, sensor, satellite, bbox, limit, offset, method_version</span>. Les filtres <em>confiance</em>, <em>jour/nuit</em> et <em>granularity / cell</em> sont appliqués côté client ou proposés comme extensions — voir REACT-INTEGRATION.md.</p>`)}
        ${sec('liens', 'external', 'Liens NASA', `<ul><li><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener">NASA FIRMS — firms.modaps.eosdis.nasa.gov</a></li><li><a href="https://firms.modaps.eosdis.nasa.gov/content/active_fire/" target="_blank" rel="noopener">Documentation des feux actifs — firms.modaps.eosdis.nasa.gov/content/active_fire/</a></li></ul>`)}
        </div></div>`;
      el.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); el.querySelector('#' + a.dataset.jump).scrollIntoView({ behavior: 'smooth' }); }));
    },
  };

  // ======================================================================
  // 9. ASSISTANT IA (page)
  // ======================================================================
  S.assistant = {
    async render(el) {
      const A = APP();
      if (!A.settings.assistant) { el.innerHTML = `<div class="card">${`<div class="state"><div class="state__ico">${icon('sparkle')}</div><h3>Assistant désactivé</h3><p>L’assistant IA est désactivé dans vos paramètres.</p><a class="btn btn--sm" href="#parametres">Ouvrir les paramètres</a></div>`}</div>`; return; }
      el.innerHTML = head('Référence', 'Assistant IA', 'Questions en langage naturel sur les filtres, les termes scientifiques, la carte et les événements. Les réponses sont construites uniquement à partir de l’API.', `<button class="btn btn--ghost" id="clear">${icon('reset')}Nouvelle conversation</button>`) +
        `<div class="assistant__layout" style="height:calc(100vh - 260px);min-height:560px"><section class="card history-card"><div class="card__head"><h3 class="card__title">Historique</h3></div><div class="history" id="chat-history">${A.historyHtml()}</div><div class="card__foot">Conservé localement pour la session</div></section><aside class="assistant assistant--page" id="assistant-page" aria-label="Assistant IA"></aside></div>`;
      A.renderAssistant(el.querySelector('#assistant-page'), true);
      el.querySelector('#clear').addEventListener('click', () => { A.chat = []; A.renderAssistant(el.querySelector('#assistant-page'), true); });
    },
  };

  // ======================================================================
  // 10. PARAMÈTRES
  // ======================================================================
  S.parametres = {
    async render(el) {
      const A = APP(); const s = A.settings;
      const sw = (k, l, d) => `<label class="toggle-row"><span>${l}${d ? `<small>${d}</small>` : ''}</span><span class="switch"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}><span></span></span></label>`;
      const sel = (k, l, opts) => `<label class="field"><span>${l}</span><select class="select" data-set="${k}">${opts.map(([v, t]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
      const segm = (k, l, opts) => `<div class="field"><span>${l}</span><div class="seg" role="radiogroup" aria-label="${l}">${opts.map(([v, t]) => `<button type="button" role="radio" data-seg="${k}" data-val="${v}" aria-checked="${s[k] === v}">${t}</button>`).join('')}</div></div>`;
      el.innerHTML = head('Référence', 'Paramètres', 'Préférences d’affichage, de carte et d’accessibilité. Enregistrées dans ce navigateur.') + `<div class="grid g-12">
        ${card('Langue et région', `<div class="stack">${sel('lang', 'Langue de l’interface', [['fr', 'Français'], ['en', 'English (à venir)']])}${segm('unit', 'Unité de distance', [['km', 'Kilomètres'], ['mi', 'Miles']])}${sel('tz', 'Fuseau horaire d’affichage', [['UTC', 'UTC (référence FIRMS)'], ['Africa/Libreville', 'Africa/Libreville (WAT, UTC+1)']])}<p class="small muted" style="margin:0">Les heures d’acquisition restent toujours affichées en UTC ; l’heure locale est ajoutée entre parenthèses.</p></div>`, { cls: 'span-6 span-lap-12' })}
        ${card('Apparence', `<div class="stack">${segm('theme', 'Thème', [['dark', 'Sombre'], ['light', 'Clair']])}${segm('detail', 'Niveau de détail', [['simple', 'Simplifié'], ['standard', 'Standard'], ['expert', 'Expert']])}<p class="small muted" style="margin:0">Expert : affiche les champs bruts FIRMS (brightness, scan, track, version) dans les fiches.</p></div>`, { cls: 'span-6 span-lap-12' })}
        ${card('Préférences de carte', `<div class="stack" style="gap:0">${sel('basemap', 'Fond cartographique', [['dark', 'Sombre (défaut)'], ['relief', 'Relief sombre (production)'], ['satellite', 'Imagerie (production)']])}${sw('cluster', 'Regroupement automatique', 'Agrège les détections selon le niveau de zoom')}${sw('labels', 'Libellés de villes et provinces')}${sw('graticule', 'Graticule (méridiens et parallèles)')}</div>`, { cls: 'span-6 span-lap-12' })}
        ${card('Accessibilité', `<div class="stack" style="gap:0">${sw('reduceMotion', 'Réduire les animations', 'Désactive pulsations, transitions et tracés progressifs')}<label class="toggle-row"><span>Contraste renforcé<small>Textes secondaires et bordures plus contrastés</small></span><span class="switch"><input type="checkbox" data-contrast ${s.contrast === 'high' ? 'checked' : ''}><span></span></span></label>${sw('largeText', 'Texte agrandi', 'Corps de texte à 16 px')}<p class="small muted" style="margin:8px 0 0">Les couleurs sont toujours doublées d’une forme (carré MODIS, rond VIIRS, losange événement) ou d’un libellé (▽ faible · ◆ modéré · ▲ élevé).</p></div>`, { cls: 'span-6 span-lap-12' })}
        ${card('Assistant IA', `${sw('assistant', 'Activer l’assistant IA', 'Affiche le bouton flottant, le panneau latéral et la page Assistant')}<p class="small muted" style="margin:6px 0 0">Les questions sont envoyées au service d’assistant avec le contexte de l’écran (filtres, identifiant d’événement). Aucune donnée personnelle n’est transmise.</p>`, { cls: 'span-6 span-lap-12' })}
        ${card('À propos', `<dl class="kv" style="padding:0"><dt>Version interface</dt><dd>maquette 1.0</dd><dt>API</dt><dd>${A.health ? 'v' + A.health.version : '—'}</dd><dt>Méthode</dt><dd>${D.METHOD}</dd><dt>Jeu de données</dt><dd class="sans">${U.DemoBadge('DÉMONSTRATION')}</dd></dl>`, { cls: 'span-6 span-lap-12' })}
      </div>`;
      const saved = () => U.toast('Préférences enregistrées', '', 'ok', 1800);
      el.querySelectorAll('input[data-set]').forEach((i) => i.addEventListener('change', () => { s[i.dataset.set] = i.checked; A.applySettings(); saved(); }));
      el.querySelectorAll('select[data-set]').forEach((i) => i.addEventListener('change', () => { s[i.dataset.set] = i.value; A.applySettings(); saved(); if (i.dataset.set === 'lang' && i.value === 'en') U.toast('Traduction anglaise', 'Prévue : clés i18n dans /components/i18n (voir REACT-INTEGRATION.md).', 'info'); }));
      el.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () => { s[b.dataset.seg] = b.dataset.val; el.querySelectorAll(`[data-seg="${b.dataset.seg}"]`).forEach((x) => x.setAttribute('aria-checked', x === b)); A.applySettings(); saved(); }));
      el.querySelector('[data-contrast]').addEventListener('change', (e) => { s.contrast = e.target.checked ? 'high' : 'normal'; A.applySettings(); saved(); });
    },
  };

  // ======================================================================
  // ANNEXES MAQUETTE : design system & états
  // ======================================================================
  S['design-system'] = {
    async render(el) {
      const cs = getComputedStyle(document.documentElement); const v = (n) => cs.getPropertyValue('--fw-color-' + n).trim();
      const sw = (n, l) => `<div class="swatch"><i style="background:var(--fw-color-${n})"></i><div><b style="font-weight:600">${l}</b><code>--fw-color-${n}</code><code>${v(n)}</code></div></div>`;
      el.innerHTML = head('Maquette', 'Design system', 'Tokens et composants de référence. Source unique : design-tokens/tokens.json (format W3C DTCG).') + `<div class="stack">
        ${card('Couleurs — surfaces et texte', `<div class="swatches">${[['bg-sunken', 'Fond carte'], ['bg-base', 'Fond principal'], ['bg-surface1', 'Surface 1'], ['bg-surface2', 'Surface 2'], ['bg-surface3', 'Surface 3'], ['border-default', 'Bordure'], ['text-primary', 'Texte principal'], ['text-secondary', 'Texte secondaire'], ['text-muted', 'Texte discret']].map(([n, l]) => sw(n, l)).join('')}</div>`)}
        ${card('Couleurs — sémantique', `<div class="swatches">${[['thermal-300', 'Thermique faible FRP'], ['thermal-500', 'Thermique (détections)'], ['high-500', 'Élevé (réservé)'], ['forest-500', 'Forêt'], ['forest-300', 'Forêt clair'], ['nasa-500', 'NASA / technique'], ['sensor-modis', 'MODIS'], ['sensor-viirs', 'VIIRS'], ['sensor-fused', 'Événement harmonisé'], ['level-low', 'Niveau faible ▽'], ['level-moderate', 'Niveau modéré ◆'], ['level-high', 'Niveau élevé ▲']].map(([n, l]) => sw(n, l)).join('')}</div><p class="small muted" style="margin:12px 0 0">Paire MODIS/VIIRS validée daltonisme (ΔE CVD ≈ 21, sombre et clair). Le rouge n’est jamais utilisé seul : toujours avec ▲ et le libellé « Élevé ».</p>`)}
        ${card('Typographie', `${[['5xl · 48', '48px', 600, 'Chiffre héros'], ['3xl · 28', '28px', 650, 'Titre de page'], ['xl · 18', '18px', 600, 'Titre de section'], ['md · 14', '14px', 400, 'Corps de texte de l’interface — Inter'], ['sm · 13', '13px', 400, 'Texte de tableau, chips'], ['xs · 12', '12px', 500, 'Légendes, métadonnées']].map(([k, s, w, t]) => `<div class="typo-row"><span class="mono small muted">${k}</span><span style="font-size:${s};font-weight:${w};letter-spacing:${parseInt(s) > 20 ? '-0.02em' : '0'}">${t}</span></div>`).join('')}<div class="typo-row"><span class="mono small muted">mono · 13</span><span class="mono">-1.8600° S  13.6200° E · 2026-11-12 09:42 UTC · 41,2 MW</span></div><div class="typo-row"><span class="mono small muted">overline · 11</span><span class="overline">Libellé de section</span></div>`)}
        <div class="grid g-12">${card('Espacements (base 4 px)', [1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((k) => `<div class="space-row"><span style="width:60px">space-${k}</span><i style="width:${k * 4}px"></i><span>${k * 4}px</span></div>`).join(''), { cls: 'span-4 span-lap-12' })}
        ${card('Rayons et élévations', `<div class="row" style="gap:12px">${[['xs', 4], ['sm', 6], ['md', 10], ['lg', 14]].map(([k, r]) => `<div style="width:64px;height:64px;border-radius:${r}px;background:var(--fw-color-bg-surface3);display:grid;place-items:center" class="mono small">${k}<br>${r}px</div>`).join('')}</div><div class="row" style="gap:12px;margin-top:16px">${[1, 2, 3].map((k) => `<div style="width:90px;height:60px;border-radius:10px;background:var(--fw-color-bg-surface2);box-shadow:var(--fw-shadow-${k});display:grid;place-items:center" class="mono small">shadow-${k}</div>`).join('')}</div>`, { cls: 'span-4 span-lap-12' })}
        ${card('Mouvement', `<dl class="kv" style="padding:0"><dt>fast</dt><dd>140 ms — survol, focus</dd><dt>base</dt><dd>220 ms — tiroirs, périodes</dd><dt>slow</dt><dd>420 ms — apparition données</dd><dt>pulse</dt><dd>2 400 ms — détections &lt; 24 h</dd><dt>standard</dt><dd>cubic-bezier(.2,.7,.2,1)</dd></dl><div class="row" style="margin-top:12px"><svg width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="5" fill="var(--fw-color-thermal-500)"/><circle class="mk__pulse" cx="20" cy="20" r="5"/></svg><span class="small muted">prefers-reduced-motion respecté</span></div>`, { cls: 'span-4 span-lap-12' })}</div>
        ${card('Composants de base', `<div class="stack"><div class="row"><button class="btn btn--primary">${icon('globe')}Explorer les données</button><button class="btn">Secondaire</button><button class="btn btn--nasa">${icon('sparkle')}Assistant</button><button class="btn btn--ghost">Fantôme</button><button class="btn btn--sm">Petit</button><button class="btn btn--icon" aria-label="Exemple icône">${icon('filter')}</button><button class="btn" disabled>Désactivé</button></div>
          <div class="row"><button class="chip" aria-pressed="true">${shape('VIIRS', 10)}VIIRS</button><button class="chip" aria-pressed="false">${shape('MODIS', 10)}MODIS</button><span class="seg"><button aria-pressed="true">7 j</button><button>30 j</button><button>90 j</button></span><span class="switch"><input type="checkbox" checked aria-label="Exemple interrupteur"><span></span></span></div>
          <div class="row">${U.SatelliteBadge('Terra')}${U.SatelliteBadge('NOAA-20')}${U.SensorBadge('VIIRS')}${U.DemoBadge()}${U.ExpBadge()}<span class="badge badge--nasa">NASA</span>${U.LevelBadge('low', true)}${U.LevelBadge('moderate', true)}${U.LevelBadge('high', true)}</div>
          <div class="row" style="gap:24px">${U.ConfidenceBadge({ instrument: 'VIIRS', confidence: 'l', conf_class: 'low' })}${U.ConfidenceBadge({ instrument: 'VIIRS', confidence: 'n', conf_class: 'nominal' })}${U.ConfidenceBadge({ instrument: 'MODIS', confidence: 91, conf_class: 'high' })}${U.HarmonizationScore(0.72)}${U.HarmonizationScore(0.41)}</div>
          <div class="row" style="gap:18px"><span class="small muted">Marqueurs carte :</span>${shape('VIIRS', 12, 'var(--fw-color-thermal-300)')} ${shape('VIIRS', 12, 'var(--fw-color-thermal-500)')} ${shape('VIIRS', 12, 'var(--fw-color-high-500)')} ${shape('MODIS', 12, 'var(--fw-color-thermal-500)')} ${shape('EVT', 14)}</div></div>`)}
        ${card('Iconographie', `<div class="row" style="gap:18px">${['dashboard', 'globe', 'gabon', 'history', 'events', 'zones', 'compare', 'book', 'sparkle', 'settings', 'satellite', 'flame', 'filter', 'crosshair', 'clock', 'cloud', 'alert', 'info', 'wifiOff', 'server', 'pinOff'].map((n) => `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:64px" class="small muted"><span style="width:20px;height:20px;color:var(--fw-color-text-primary)">${icon(n)}</span>${n}</span>`).join('')}</div><p class="small muted" style="margin:10px 0 0">Trait 1,75 px, grille 24 px, terminaisons arrondies (compatible lucide-react).</p>`)}
      </div>`;
    },
  };
  S.etats = {
    async render(el) {
      el.innerHTML = head('Maquette', 'États & composants', 'Tous les états obligatoires, rendus par les composants partagés. Chaque écran peut aussi être basculé dans un état via « État simulé » dans la barre de maquette.') + `<div class="states-grid">
        ${card('Chargement — indicateurs', `<div class="stats" style="grid-template-columns:1fr 1fr;margin:0" aria-busy="true">${[0, 1, 2, 3].map(() => `<div class="card stat"><div class="skel" style="height:12px;width:60%"></div><div class="skel" style="height:26px;width:70%;margin-top:12px"></div><div class="skel" style="height:10px;width:40%;margin-top:10px"></div></div>`).join('')}</div>`, { sub: 'LoadingState variant="stats"' })}
        ${card('Chargement — carte', `<div style="height:200px;border-radius:8px;overflow:hidden">${U.LoadingState('map')}</div>`, { sub: 'LoadingState variant="map"' })}
        ${card('Chargement — graphique', U.LoadingState('chart', 180), { sub: 'LoadingState variant="chart"' })}
        ${card('Absence de données', U.EmptyState('empty'), { sub: 'EmptyState kind="empty"' })}
        ${card('Erreur API', U.ErrorState({ message: 'Le service d’ingestion FIRMS ne répond pas (délai dépassé).', status: 503, code: 'UPSTREAM_TIMEOUT', path: '/api/statistics/summary' }), { sub: 'ErrorState' })}
        ${card('Filtre sans résultat', U.EmptyState('noresult', '<button class="btn btn--sm">Réinitialiser les filtres</button>'), { sub: 'EmptyState kind="noresult"' })}
        ${card('Absence de connexion', U.EmptyState('offline', '<button class="btn btn--sm">Réessayer</button>'), { sub: 'EmptyState kind="offline" + bannière globale' })}
        ${card('Carte vide', U.EmptyState('emptymap', '<button class="btn btn--sm">Vue mondiale</button>'), { sub: 'EmptyState kind="emptymap" (superposé à la carte)' })}
        ${card('Erreur de localisation', U.EmptyState('geoloc', '<button class="btn btn--sm">Choisir une région</button>'), { sub: 'EmptyState kind="geoloc" + toast' })}
        ${card('Données partielles', `<div class="banner banner--warn" style="border-radius:8px;border:1px solid rgba(242,181,58,.3)">${icon('alert')}<span><strong>Données partielles.</strong> NOAA-21 indisponible depuis le 13/11 18:00 UTC.</span></div><div class="stat" style="padding:14px 0 0"><div class="stat__label">${shape('VIIRS', 10)}Détections VIIRS</div><div class="stat__value">821 <small>partiel</small></div><div class="stat__foot">${icon('alert', '')} hors NOAA-21</div></div>`, { sub: 'Bannière + valeurs marquées' })}
        ${card('Notifications (ToastNotification)', `<div class="stack" style="gap:8px"><button class="btn btn--sm" data-t="info">Info</button><button class="btn btn--sm" data-t="ok">Succès</button><button class="btn btn--sm" data-t="warn">Avertissement</button><button class="btn btn--sm" data-t="err">Erreur</button></div>`, { sub: 'Cliquer pour afficher' })}
        ${card('Affichage mobile', `<p class="small secondary" style="margin-top:0">Utilisez « Mobile 390 » dans la barre de maquette : navigation compacte + barre inférieure, carte prioritaire, filtres en tiroir bas, statistiques en 2 colonnes, assistant via bouton flottant (feuille modale).</p><button class="btn btn--sm" id="go-mobile">Basculer en mobile</button>`, { sub: 'Container queries · 390 / 768 / 1280 / 1440' })}
      </div>`;
      el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => U.toast({ info: 'Nouvelles détections disponibles', ok: 'Préférences enregistrées', warn: 'Données partielles', err: 'Échec du chargement' }[b.dataset.t], { info: '142 détections depuis 12:00 UTC (démo).', ok: '', warn: 'NOAA-21 indisponible.', err: 'GET /api/events → 503' }[b.dataset.t], b.dataset.t)));
      el.querySelector('#go-mobile').addEventListener('click', () => document.querySelector('.fw-stage__bar [data-frame="mobile"]').click());
    },
  };
})();
