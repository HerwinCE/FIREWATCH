/* ==========================================================================
   FireWatch Africa — Données de DÉMONSTRATION + simulateur d'API
   Toutes les valeurs ci-dessous sont générées localement (graine fixe).
   Elles reproduisent la FORME des réponses de l'API, pas des observations réelles.
   ========================================================================== */
(function () {
  const G = window.FW_GEO;
  // ---------- utilitaires ----------
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(20261114);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pick = (arr, w) => { let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
  const pip = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const onLand = (pt) => Object.values(G.LAND).some((p) => pip(pt, p)) && !Object.values(G.WATER).some((p) => pip(pt, p));
  const inGabon = (pt) => pip(pt, G.GABON);
  const provinceOf = (pt) => { if (!inGabon(pt)) return null; let best = null, bd = 1e9; for (const p of G.PROVINCES) { const d = (p.c[0] - pt[0]) ** 2 + (p.c[1] - pt[1]) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
  const KM_PER_DEG = 111.32;
  const distKm = (a, b) => { const dx = (a[0] - b[0]) * KM_PER_DEG * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180); const dy = (a[1] - b[1]) * KM_PER_DEG; return Math.hypot(dx, dy); };
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
  const hhmm = (t) => { const d = new Date(t); return pad(d.getUTCHours()) + pad(d.getUTCMinutes()); };

  // ---------- période couverte ----------
  const DAY = 86400000;
  const LAST_UPDATE = Date.UTC(2026, 10, 14, 13, 52); // 14/11/2026 13:52 UTC
  const END = Date.UTC(2026, 10, 14, 13, 30);
  const DAYS = 92;
  const START = Date.UTC(2026, 10, 14) - (DAYS - 1) * DAY; // 15/08/2026

  // ---------- plateformes ----------
  const SATS = [
    { id: 'Terra', sensor: 'MODIS', label: 'Terra', short: 'T', day: 10.5, night: 22.5, product: 'MODIS_NRT · MCD14DL C6.1', version: '6.1NRT', w: 11 },
    { id: 'Aqua', sensor: 'MODIS', label: 'Aqua', short: 'A', day: 13.5, night: 1.5, product: 'MODIS_NRT · MCD14DL C6.1', version: '6.1NRT', w: 11 },
    { id: 'Suomi-NPP', sensor: 'VIIRS', label: 'Suomi-NPP', short: 'N', day: 13.5, night: 1.5, product: 'VIIRS_SNPP_NRT · VNP14IMGTDL_NRT', version: '2.0NRT', w: 26 },
    { id: 'NOAA-20', sensor: 'VIIRS', label: 'NOAA-20', short: 'N20', day: 13.0, night: 1.0, product: 'VIIRS_NOAA20_NRT · VJ114IMGTDL_NRT', version: '2.0NRT', w: 26 },
    { id: 'NOAA-21', sensor: 'VIIRS', label: 'NOAA-21', short: 'N21', day: 13.25, night: 1.25, product: 'VIIRS_NOAA21_NRT · VJ214IMGTDL_NRT', version: '2.0NRT', w: 26 },
  ];
  const SAT = Object.fromEntries(SATS.map((s) => [s.id, s]));

  // ---------- foyers de génération (DÉMO) ----------
  // [nom, région, lon, lat, σlon, σlat, poids, tendance (+ : croissance vers novembre)]
  const CLUSTERS = [
    ['Haute-Guinée', 'Afrique de l’Ouest', -10.5, 10.5, 1.8, 1.2, 6, 2.2],
    ['Mali sud / Burkina Faso', 'Afrique de l’Ouest', -4.5, 11.3, 2.5, 1, 5, 2.4],
    ['Nord Ghana / Côte d’Ivoire', 'Afrique de l’Ouest', -1.5, 9, 2, 1, 6, 2.4],
    ['Nigeria — Middle Belt', 'Afrique de l’Ouest', 8, 9.3, 2.6, 1.2, 9, 2.3],
    ['Cameroun nord / RCA ouest', 'Afrique centrale', 16.5, 7.5, 3, 1.3, 10, 2.2],
    ['RCA est — Haut-Mbomou', 'Afrique centrale', 23.5, 6, 2.5, 1.2, 8, 2.0],
    ['Soudan du Sud — Bahr el Ghazal', 'Afrique de l’Est', 28.5, 7.8, 2.5, 1.3, 9, 2.0],
    ['Éthiopie ouest', 'Afrique de l’Est', 35.3, 9.2, 1, 1.2, 2.5, 1.5],
    ['RDC nord — Uele', 'Afrique centrale', 26, 3.8, 2.5, 1, 5, 1.8],
    ['Angola / Zambie', 'Afrique australe', 21, -12, 4, 2.5, 9, -2.6],
    ['Mozambique nord', 'Afrique australe', 37, -13, 2, 1.5, 3, -1.5],
    ['Madagascar ouest', 'Afrique australe', 45.5, -17, 1, 2, 3, -0.6],
    ['Plateaux Batéké (Congo)', 'Afrique centrale', 15.2, -2.6, 0.6, 0.5, 1.4, -2.5],
    ['Sénégal / Gambie', 'Afrique de l’Ouest', -15, 13.2, 1, 0.8, 2, 2],
    ['Tchad sud', 'Afrique centrale', 18, 9.5, 2, 1, 4, 2.4],
    ['Haut-Ogooué — savanes de Franceville', 'Gabon', 13.7, -1.75, 0.35, 0.35, 1.6, -2.6],
    ['Ngounié — savanes de Mouila', 'Gabon', 11.05, -1.9, 0.3, 0.3, 0.8, -2.4],
    ['Nyanga — savanes de Tchibanga', 'Gabon', 11.1, -2.9, 0.3, 0.25, 0.7, -2.4],
    ['Ogooué-Ivindo — lisières', 'Gabon', 12.8, 0.4, 0.5, 0.4, 0.25, -1],
    ['Estuaire — périphérie de Libreville', 'Gabon', 9.75, 0.35, 0.2, 0.2, 0.25, 0],
    ['Lopé — Moyen-Ogooué / Ogooué-Ivindo', 'Gabon', 11.6, -0.4, 0.3, 0.25, 0.4, -2.2],
    ['Brésil — Cerrado', 'Amérique du Sud', -47, -10, 4, 3, 7, -1.2],
    ['Bolivie — Chiquitanía', 'Amérique du Sud', -61, -16, 2.5, 1.5, 3, -1.8],
    ['Argentine — Chaco', 'Amérique du Sud', -61, -26, 2.5, 2, 2.5, 0],
    ['Amérique centrale', 'Amérique du Nord', -89, 16, 2, 1.5, 1, 0.5],
    ['États-Unis — Sud-Est', 'Amérique du Nord', -85, 33, 3, 1.5, 1.5, 0.8],
    ['Inde — Pendjab / Haryana', 'Asie', 75.6, 30.4, 1, 0.7, 5, 3.5],
    ['Asie du Sud-Est continentale', 'Asie', 100, 18, 3, 2, 1.2, 0.5],
    ['Indonésie — Kalimantan / Sumatra', 'Asie', 110, -1.5, 4, 1.5, 2, -2],
    ['Chine orientale', 'Asie', 115, 33, 3, 2, 1.2, 0.6],
    ['Australie — Top End / Kimberley', 'Océanie', 131, -15, 5, 2, 6, 0.4],
    ['Australie — Queensland', 'Océanie', 144, -20, 2.5, 3, 2, 0.8],
    ['Europe de l’Est', 'Europe', 32, 49, 4, 2, 0.7, -0.5],
    ['Sibérie méridionale', 'Asie', 105, 53, 6, 2.5, 0.8, -2],
  ];
  const TOTAL_TARGET = 7200;
  const wsum = CLUSTERS.reduce((s, c) => s + c[6], 0);

  function sampleTime(trend) {
    // densité ∝ exp(trend·(u−0.5)), rejet
    for (;;) { const u = rnd(); const w = Math.exp(trend * (u - 0.5)); if (rnd() * Math.exp(Math.abs(trend) / 2) < w) return u; }
  }
  function confFor(sat) {
    if (sat.sensor === 'MODIS') { const v = Math.round(Math.min(100, 15 + 85 * Math.pow(rnd(), 0.55))); return { confidence: v, conf_class: v < 30 ? 'low' : v < 80 ? 'nominal' : 'high' }; }
    const c = pick(['l', 'n', 'h'], [12, 73, 15]); return { confidence: c, conf_class: { l: 'low', n: 'nominal', h: 'high' }[c] };
  }
  function makeDetection(lon, lat, t, sat, region, zone, extra) {
    const c = confFor(sat);
    const frp = sat.sensor === 'MODIS' ? Math.exp(2.9 + 0.95 * gauss()) : Math.exp(1.6 + 0.95 * gauss());
    const d = new Date(t); const hour = d.getUTCHours() + d.getUTCMinutes() / 60; const local = (hour + lon / 15 + 24) % 24;
    return Object.assign({
      latitude: +lat.toFixed(4), longitude: +lon.toFixed(4), acq_date: isoDate(t), acq_time: hhmm(t), t,
      satellite: sat.id, instrument: sat.sensor, ...c,
      frp: +Math.min(frp, 1800).toFixed(1),
      brightness: +(sat.sensor === 'MODIS' ? 305 + rnd() * 90 : 300 + rnd() * 67).toFixed(2),
      scan: sat.sensor === 'MODIS' ? +(1 + rnd() * 1.8).toFixed(2) : +(0.39 + rnd() * 0.4).toFixed(2),
      track: sat.sensor === 'MODIS' ? +(1 + rnd() * 0.9).toFixed(2) : +(0.36 + rnd() * 0.3).toFixed(2),
      daynight: local > 6 && local < 18 ? 'D' : 'N', version: sat.version, product: sat.product,
      region, zone, province: null, event_id: null,
    }, extra || {});
  }
  function overpassTime(dayIdx, lon, sat, forceDay) {
    const isDay = forceDay != null ? forceDay : rnd() < 0.8;
    const localH = (isDay ? sat.day : sat.night) + gauss() * 0.45;
    let utc = localH - lon / 15; let dayOff = 0; if (utc < 0) { utc += 24; dayOff = -1; } if (utc >= 24) { utc -= 24; dayOff = 1; }
    return START + (dayIdx + dayOff) * DAY + Math.round(utc * 60) * 60000;
  }

  const detections = [];
  for (const cl of CLUSTERS) {
    const [zone, region, lon0, lat0, sx, sy, w, trend] = cl;
    const n = Math.round((w / wsum) * TOTAL_TARGET * (region === 'Gabon' ? 1.6 : 1));
    let made = 0, guard = 0;
    while (made < n && guard++ < n * 40) {
      const lon = lon0 + gauss() * sx, lat = lat0 + gauss() * sy; const pt = [lon, lat];
      if (region === 'Gabon' ? !inGabon(pt) : !onLand(pt) || inGabon(pt)) continue;
      const dayIdx = Math.min(DAYS - 1, Math.floor(sampleTime(trend) * DAYS));
      const sat = pick(SATS, SATS.map((s) => s.w));
      const t = overpassTime(dayIdx, lon, sat);
      if (t > END || t < START) continue;
      detections.push(makeDetection(lon, lat, t, sat, region, zone)); made++;
    }
  }

  // Pics ponctuels (jours inhabituels de démonstration)
  [[Date.UTC(2026, 10, 3), 'Nigeria — Middle Belt', 'Afrique de l’Ouest', 8.4, 9.6, 1.2, 0.6, 85], [Date.UTC(2026, 9, 24), 'Soudan du Sud — Bahr el Ghazal', 'Afrique de l’Est', 28.8, 7.6, 1.0, 0.7, 70], [Date.UTC(2026, 8, 6), 'Angola / Zambie', 'Afrique australe', 21.5, -12.5, 1.5, 1, 90], [Date.UTC(2026, 8, 2), 'Haut-Ogooué — savanes de Franceville', 'Gabon', 13.75, -1.7, 0.25, 0.25, 26]].forEach(([day, zone, region, lon0, lat0, sx, sy, n]) => {
    const dayIdx = Math.round((day - START) / DAY); let made = 0, guard = 0;
    while (made < n && guard++ < n * 50) { const lon = lon0 + gauss() * sx, lat = lat0 + gauss() * sy; if (region === 'Gabon' ? !inGabon([lon, lat]) : !onLand([lon, lat])) continue; const sat = pick(SATS, SATS.map((s) => s.w)); const t = overpassTime(dayIdx, lon, sat, true); if (t > END) continue; detections.push(makeDetection(lon, lat, t, sat, region, zone)); made++; }
  });

  // ---------- événements harmonisés ----------
  const METHOD = 'harmo-v0.3-demo';
  const PARAMS = { dmax_viirs: 1.0, dmax_modis: 2.0, dt_max_h: 24, chain_h: 48, w: { spatial: 0.35, temporel: 0.25, capteurs: 0.25, confiance: 0.15 } };
  const confNum = (d) => (d.instrument === 'MODIS' ? d.confidence / 100 : { l: 0.3, n: 0.6, h: 0.9 }[d.confidence]);
  function scoreEvent(obs) {
    const hasModis = obs.some((o) => o.instrument === 'MODIS');
    const dmax = hasModis ? PARAMS.dmax_modis : PARAMS.dmax_viirs;
    const cx = obs.reduce((s, o) => s + o.longitude, 0) / obs.length, cy = obs.reduce((s, o) => s + o.latitude, 0) / obs.length;
    const dists = obs.map((o) => distKm([o.longitude, o.latitude], [cx, cy]));
    const dmean = dists.reduce((a, b) => a + b, 0) / dists.length;
    const sorted = [...obs].sort((a, b) => a.t - b.t);
    const gaps = sorted.slice(1).map((o, i) => (o.t - sorted[i].t) / 3600000);
    const gs = [...gaps].sort((a, b) => a - b); const med = gs.length ? (gs.length % 2 ? gs[(gs.length - 1) / 2] : (gs[gs.length / 2 - 1] + gs[gs.length / 2]) / 2) : 0;
    const sats = [...new Set(obs.map((o) => o.satellite))];
    const s = {
      spatial: Math.max(0, 1 - dmean / dmax),
      temporel: Math.max(0, 1 - med / PARAMS.dt_max_h),
      capteurs: Math.min(1, sats.length / 4),
      confiance: obs.reduce((a, o) => a + confNum(o), 0) / obs.length,
    };
    const score = s.spatial * PARAMS.w.spatial + s.temporel * PARAMS.w.temporel + s.capteurs * PARAMS.w.capteurs + s.confiance * PARAMS.w.confiance;
    return { center: [+cx.toFixed(4), +cy.toFixed(4)], dmean, dmax, gaps, gapMedian: med, sub: s, score: Math.round(score * 100) / 100, sats, dists };
  }
  const events = [];
  let evtSeq = 0;
  function addEvent(obs, zone, region, fixedId) {
    const sc = scoreEvent(obs);
    const code = region === 'Gabon' ? 'GA' : region.startsWith('Afrique') ? 'AF' : { 'Amérique du Sud': 'SA', 'Amérique du Nord': 'NA', Asie: 'AS', Océanie: 'OC', Europe: 'EU' }[region] || 'XX';
    const id = fixedId || `EVT-${code}-${pad(++evtSeq, 4)}`;
    obs.forEach((o) => { o.event_id = id; });
    const sorted = [...obs].sort((a, b) => a.t - b.t);
    events.push({
      id, zone, region, center: sc.center, province: provinceOf(sc.center)?.name || null,
      start: sorted[0].t, end: sorted.at(-1).t, duration_h: (sorted.at(-1).t - sorted[0].t) / 3600000,
      n: obs.length, sensors: [...new Set(obs.map((o) => o.instrument))], satellites: sc.sats,
      frp_max: Math.max(...obs.map((o) => o.frp)), frp_sum: obs.reduce((a, o) => a + o.frp, 0),
      score: sc.score, sub: sc.sub, dmean: sc.dmean, dmax: sc.dmax, gapMedian: sc.gapMedian,
      method_version: METHOD, detection_ids: [], _obs: sorted, _sc: sc,
    });
  }
  // Événement de référence (score 0,72) — Haut-Ogooué
  (function featured() {
    const c = [13.62, -1.86]; const r = 0.534; // km — rayon calibré pour l'exemple
    const plan = [
      ['NOAA-21', Date.UTC(2026, 10, 12, 0, 31), 'n'], ['NOAA-20', Date.UTC(2026, 10, 12, 1, 21), 'l'],
      ['Terra', Date.UTC(2026, 10, 12, 9, 42), 55], ['NOAA-21', Date.UTC(2026, 10, 12, 12, 12), 'n'],
      ['NOAA-20', Date.UTC(2026, 10, 12, 13, 2), 'n'], ['Terra', Date.UTC(2026, 10, 12, 21, 33), 60],
      ['NOAA-20', Date.UTC(2026, 10, 13, 12, 51), 'n'],
    ];
    const frps = [6.8, 3.1, 41.2, 9.4, 12.7, 28.5, 7.9];
    const obs = plan.map(([s, t, conf], i) => {
      const a = (i / plan.length) * 2 * Math.PI; const lon = c[0] + (r * Math.cos(a)) / (KM_PER_DEG * Math.cos((c[1] * Math.PI) / 180)); const lat = c[1] + (r * Math.sin(a)) / KM_PER_DEG;
      const d = makeDetection(lon, lat, t, SAT[s], 'Gabon', 'Haut-Ogooué — savanes de Franceville');
      d.latitude = +lat.toFixed(5); d.longitude = +lon.toFixed(5);
      d.confidence = conf; d.conf_class = typeof conf === 'number' ? (conf < 30 ? 'low' : conf < 80 ? 'nominal' : 'high') : { l: 'low', n: 'nominal', h: 'high' }[conf]; d.frp = frps[i];
      return d;
    });
    detections.push(...obs); addEvent(obs, 'Haut-Ogooué — savanes de Franceville', 'Gabon', 'EVT-GA-0007');
  })();
  // Autres événements : graines tirées dans les foyers
  for (let k = 0; k < 230; k++) {
    const cl = pick(CLUSTERS, CLUSTERS.map((c) => (c[1] === 'Gabon' ? c[6] * 6 : c[6])));
    const [zone, region, lon0, lat0, sx, sy, , trend] = cl;
    let pt; let g = 0; do { pt = [lon0 + gauss() * sx, lat0 + gauss() * sy]; } while (g++ < 200 && (region === 'Gabon' ? !inGabon(pt) : !onLand(pt) || inGabon(pt)));
    if (g >= 200) continue;
    const dayIdx = Math.min(DAYS - 3, Math.floor(sampleTime(trend) * DAYS));
    const n = 3 + Math.floor(rnd() * 9); const obs = []; const spanDays = 1 + Math.floor(rnd() * 3);
    const tight = 0.25 + rnd() * 0.9;
    for (let i = 0; i < n; i++) {
      const sat = pick(SATS, [9, 9, 27, 27, 27]); const rad = (sat.sensor === 'MODIS' ? 1.2 : 0.6) * tight * Math.abs(gauss());
      const a = rnd() * 2 * Math.PI; const lon = pt[0] + (rad * Math.cos(a)) / (KM_PER_DEG * Math.cos((pt[1] * Math.PI) / 180)); const lat = pt[1] + (rad * Math.sin(a)) / KM_PER_DEG;
      const t = overpassTime(dayIdx + Math.floor(rnd() * spanDays), lon, sat, rnd() < 0.75);
      if (t > END) continue; obs.push(makeDetection(lon, lat, t, sat, region, zone));
    }
    if (obs.length < 2) continue;
    if (region === 'Gabon') obs.forEach((o) => { if (!inGabon([o.longitude, o.latitude])) { o.longitude = pt[0]; o.latitude = pt[1]; } });
    detections.push(...obs); addEvent(obs, zone, region);
  }
  // ids, tri, provinces
  detections.sort((a, b) => a.t - b.t);
  detections.forEach((d, i) => { d.id = `DET-${d.acq_date.replace(/-/g, '')}-${SAT[d.satellite].short}-${pad(i + 1, 5)}`; if (d.region === 'Gabon') d.province = provinceOf([d.longitude, d.latitude])?.name || null; });
  const byId = new Map(detections.map((d) => [d.id, d]));
  events.forEach((e) => { e.detection_ids = e._obs.map((o) => o.id); });
  const eventsById = new Map(events.map((e) => [e.id, e]));

  // ---------- régions → bbox (minLon, minLat, maxLon, maxLat) ----------
  const REGIONS = {
    world: { label: 'Monde', bbox: [-180, -60, 180, 84] },
    africa: { label: 'Afrique', bbox: [-20, -36, 53, 38] },
    west: { label: 'Afrique de l’Ouest', bbox: [-18, 4, 16, 25] },
    central: { label: 'Afrique centrale', bbox: [8, -6, 31, 12] },
    east: { label: 'Afrique de l’Est', bbox: [28, -12, 52, 18] },
    south: { label: 'Afrique australe', bbox: [10, -35, 52, -8] },
    gabon: { label: 'Gabon', bbox: [8.5, -4.1, 14.6, 2.4] },
    samerica: { label: 'Amérique du Sud', bbox: [-82, -56, -34, 13] },
    asia: { label: 'Asie', bbox: [60, -11, 150, 60] },
    oceania: { label: 'Océanie', bbox: [110, -48, 180, -8] },
  };
  const inBbox = (d, b) => d.longitude >= b[0] && d.longitude <= b[2] && d.latitude >= b[1] && d.latitude <= b[3];

  // ---------- filtrage générique (paramètres du contrat API) ----------
  function parseDate(s, endOfDay) { if (!s) return null; const [y, m, dd] = s.split('-').map(Number); return Date.UTC(y, m - 1, dd) + (endOfDay ? DAY - 1 : 0); }
  function applyFilters(list, p) {
    const s = parseDate(p.start_date), e = parseDate(p.end_date, true);
    const sensors = p.sensor ? String(p.sensor).split(',') : null; const sats = p.satellite ? String(p.satellite).split(',') : null;
    const bbox = p.bbox ? (Array.isArray(p.bbox) ? p.bbox : String(p.bbox).split(',').map(Number)) : null;
    return list.filter((d) => (!s || d.t >= s) && (!e || d.t <= e) && (!sensors || sensors.includes(d.instrument)) && (!sats || sats.includes(d.satellite)) && (!bbox || inBbox(d, bbox)));
  }
  function eventFilter(p) {
    const s = parseDate(p.start_date), e = parseDate(p.end_date, true);
    const sensors = p.sensor ? String(p.sensor).split(',') : null; const sats = p.satellite ? String(p.satellite).split(',') : null;
    const bbox = p.bbox ? (Array.isArray(p.bbox) ? p.bbox : String(p.bbox).split(',').map(Number)) : null;
    return events.filter((ev) => (!s || ev.end >= s) && (!e || ev.start <= e) && (!sensors || ev.sensors.some((x) => sensors.includes(x))) && (!sats || ev.satellites.some((x) => sats.includes(x))) && (!bbox || (ev.center[0] >= bbox[0] && ev.center[0] <= bbox[2] && ev.center[1] >= bbox[1] && ev.center[1] <= bbox[3])) && (!p.method_version || p.method_version === METHOD));
  }
  const publicEvent = (e) => { const { _obs, _sc, ...rest } = e; return rest; };

  function bucketKey(t, gran) {
    const d = new Date(t);
    if (gran === 'month') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
    if (gran === 'week') { const day = (d.getUTCDay() + 6) % 7; return isoDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY); }
    return isoDate(t);
  }
  function timeline(p) {
    const list = applyFilters(detections, p); const gran = p.granularity || 'day';
    const s = parseDate(p.start_date) ?? START, e = parseDate(p.end_date, true) ?? END;
    const keys = []; for (let t = s; t <= e; t += DAY) { const k = bucketKey(t, gran); if (keys.at(-1) !== k) keys.push(k); }
    const m = new Map(keys.map((k) => [k, { date: k, total: 0, modis: 0, viirs: 0, frp_sum: 0, frp_max: 0, events: 0, by_satellite: Object.fromEntries(SATS.map((x) => [x.id, 0])) }]));
    for (const d of list) { const b = m.get(bucketKey(d.t, gran)); if (!b) continue; b.total++; b[d.instrument === 'MODIS' ? 'modis' : 'viirs']++; b.frp_sum += d.frp; b.frp_max = Math.max(b.frp_max, d.frp); b.by_satellite[d.satellite]++; }
    for (const ev of eventFilter(p)) { const b = m.get(bucketKey(ev.start, gran)); if (b) b.events++; }
    return { granularity: gran, series: [...m.values()].map((b) => ({ ...b, frp_sum: +b.frp_sum.toFixed(1), frp_max: +b.frp_max.toFixed(1) })) };
  }
  function hotspots(p) {
    const list = applyFilters(detections, p); const cell = +(p.cell || 1);
    const s = parseDate(p.start_date) ?? START, e = parseDate(p.end_date, true) ?? END; const len = e - s + 1;
    const prev = applyFilters(detections, { ...p, start_date: isoDate(s - len), end_date: isoDate(s - 1) });
    const key = (d) => `${Math.floor(d.longitude / cell)}|${Math.floor(d.latitude / cell)}`;
    const cells = new Map();
    for (const d of list) { const k = key(d); let c = cells.get(k); if (!c) { c = { k, count: 0, days: new Set(), frp_sum: 0, frp_max: 0, zones: {}, lon: 0, lat: 0, modis: 0, viirs: 0, region: d.region }; cells.set(k, c); } c.count++; c.days.add(d.acq_date); c.frp_sum += d.frp; c.frp_max = Math.max(c.frp_max, d.frp); c.zones[d.zone] = (c.zones[d.zone] || 0) + 1; c.lon += d.longitude; c.lat += d.latitude; c[d.instrument === 'MODIS' ? 'modis' : 'viirs']++; }
    const prevCount = {}; for (const d of prev) prevCount[key(d)] = (prevCount[key(d)] || 0) + 1;
    const arr = [...cells.values()].filter((c) => c.count >= (p.min_count || 3));
    const maxC = Math.max(1, ...arr.map((c) => c.count)), maxF = Math.max(1, ...arr.map((c) => c.frp_sum)); const periodDays = Math.max(1, Math.round(len / DAY));
    const out = arr.map((c) => {
      const [ix, iy] = c.k.split('|').map(Number); const zone = Object.entries(c.zones).sort((a, b) => b[1] - a[1])[0][0];
      const score = Math.round(100 * (0.5 * (c.count / maxC) + 0.3 * Math.min(1, c.days.size / periodDays) + 0.2 * (c.frp_sum / maxF)));
      const pc = prevCount[c.k] || 0;
      const lat0 = iy * cell, lon0 = ix * cell; const fmtc = (v, pos, neg) => `${Math.abs(v).toFixed(cell < 1 ? 2 : 0)}°${v >= 0 ? pos : neg}`;
      return {
        id: `HS-${cell < 1 ? 'G' : 'W'}${ix < 0 ? 'm' : ''}${Math.abs(ix)}${iy < 0 ? 's' : 'n'}${Math.abs(iy)}`,
        name: zone, region: c.region, cell_label: `${fmtc(lat0 + cell / 2, 'N', 'S')} ${fmtc(lon0 + cell / 2, 'E', 'O')}`,
        center: [+(c.lon / c.count).toFixed(3), +(c.lat / c.count).toFixed(3)], bbox: [lon0, lat0, lon0 + cell, lat0 + cell],
        count: c.count, modis: c.modis, viirs: c.viirs, active_days: c.days.size, frp_sum: +c.frp_sum.toFixed(1), frp_max: +c.frp_max.toFixed(1),
        previous: pc, variation: pc ? (c.count - pc) / pc : null, score, level: score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low',
        province: c.region === 'Gabon' ? provinceOf([c.lon / c.count, c.lat / c.count])?.name || null : null,
      };
    }).sort((a, b) => b.score - a.score || b.count - a.count);
    return out.slice(0, p.limit || 50);
  }
  function summary(p) {
    const list = applyFilters(detections, p); const evs = eventFilter(p); const hs = hotspots({ ...p, limit: 9999 });
    const modis = list.filter((d) => d.instrument === 'MODIS');
    return {
      total: list.length, modis: modis.length, viirs: list.length - modis.length, events: evs.length,
      active_zones: hs.filter((h) => h.level !== 'low').length, frp_mean: list.length ? +(list.reduce((a, d) => a + d.frp, 0) / list.length).toFixed(1) : 0,
      frp_max: list.length ? Math.max(...list.map((d) => d.frp)) : 0, day: list.filter((d) => d.daynight === 'D').length, night: list.filter((d) => d.daynight === 'N').length,
      last_update: new Date(LAST_UPDATE).toISOString(), period: { start: p.start_date, end: p.end_date },
    };
  }
  function satellites(p) {
    const list = applyFilters(detections, p);
    return SATS.map((s) => { const l = list.filter((d) => d.satellite === s.id); return { satellite: s.id, sensor: s.sensor, product: s.product, resolution_m: s.sensor === 'MODIS' ? 1000 : 375, count: l.length, frp_mean: l.length ? +(l.reduce((a, d) => a + d.frp, 0) / l.length).toFixed(1) : 0, frp_max: l.length ? Math.max(...l.map((d) => d.frp)) : 0, first: l[0]?.t ? new Date(l[0].t).toISOString() : null, last: l.at(-1)?.t ? new Date(l.at(-1).t).toISOString() : null, day: l.filter((d) => d.daynight === 'D').length, night: l.filter((d) => d.daynight === 'N').length }; });
  }

  // ---------- simulateur d'API ----------
  const SIM_STATES = {
    normal: 'Normal', loading: 'Chargement', empty: 'Absence de données', error: 'Erreur API', partial: 'Données partielles',
    offline: 'Absence de connexion', noresult: 'Filtre sans résultat', emptymap: 'Carte vide', geoloc: 'Erreur de localisation',
  };
  class ApiError extends Error { constructor(status, path, message, code) { super(message); this.status = status; this.path = path; this.code = code; } }
  const API = {
    state: 'normal', log: [], listeners: new Set(),
    onCall(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
    _emit(entry) { this.log.unshift(entry); this.log.length = Math.min(this.log.length, 40); this.listeners.forEach((f) => f(entry)); },
    url(path, params) { const q = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`).join('&'); return path + (q ? '?' + q : ''); },
    async get(path, params = {}) {
      const st = this.state; const url = this.url(path, params); const t0 = performance.now();
      const delay = 180 + Math.random() * 420;
      if (st === 'loading') { this._emit({ url, status: '…', ms: null }); return new Promise(() => {}); }
      await new Promise((r) => setTimeout(r, delay));
      if (st === 'error' && path !== '/api/health') { const err = new ApiError(503, url, 'Le service d’ingestion FIRMS ne répond pas (délai dépassé).', 'UPSTREAM_TIMEOUT'); this._emit({ url, status: 503, ms: Math.round(performance.now() - t0) }); throw err; }
      if (st === 'offline') { this._emit({ url, status: 'cache', ms: 0 }); }
      let p = { ...params };
      if (st === 'partial') p.satellite = p.satellite ? String(p.satellite).split(',').filter((x) => x !== 'NOAA-21').join(',') || 'none' : SATS.filter((s) => s.id !== 'NOAA-21').map((s) => s.id).join(',');
      const empty = st === 'empty' || st === 'noresult';
      let body;
      try { body = this._route(path, p, empty, st); } catch (e) { this._emit({ url, status: e.status || 500, ms: 0 }); throw e; }
      const meta = { dataset: 'DEMO', method_version: METHOD, generated_at: new Date(LAST_UPDATE).toISOString() };
      if (st === 'partial') meta.partial = { missing: ['NOAA-21'], reason: 'Ingestion VJ214IMGTDL_NRT incomplète depuis le 13/11 18:00 UTC' };
      if (st === 'offline') meta.stale = { cached_at: '2026-11-14T06:00:00Z' };
      if (st === 'noresult') meta.filtered_out = true;
      if (st !== 'offline') this._emit({ url, status: 200, ms: Math.round(performance.now() - t0) });
      return { data: body, meta };
    },
    _route(path, p, empty, st) {
      const lim = +p.limit || 500, off = +p.offset || 0;
      if (path === '/api/health') return { status: st === 'error' ? 'degraded' : 'ok', version: '0.4.0', uptime_s: 412380, checks: { database: 'ok', firms_ingestion: st === 'error' ? 'timeout' : st === 'partial' ? 'partial' : 'ok', cache: 'ok' } };
      if (path === '/api/metadata') return { dataset: 'DEMO', last_update: new Date(LAST_UPDATE).toISOString(), coverage: { start: isoDate(START), end: isoDate(END) }, sensors: ['MODIS', 'VIIRS'], satellites: SATS.map((s) => ({ id: s.id, sensor: s.sensor, product: s.product, resolution_m: s.sensor === 'MODIS' ? 1000 : 375 })), method_versions: [METHOD], harmonization: PARAMS, source: 'NASA FIRMS (structure) — valeurs de démonstration' };
      if (path === '/api/detections') { const l = empty || st === 'emptymap' ? [] : applyFilters(detections, p); return { total: l.length, limit: lim, offset: off, items: l.slice(off, off + lim) }; }
      let m;
      if ((m = path.match(/^\/api\/detections\/(.+)$/))) { const d = byId.get(m[1]); if (!d) throw new ApiError(404, path, 'Détection introuvable', 'NOT_FOUND'); return d; }
      if (path === '/api/events') { const l = empty ? [] : eventFilter(p).sort((a, b) => b.score - a.score || b.start - a.start); return { total: l.length, limit: lim, offset: off, items: l.slice(off, off + lim).map(publicEvent) }; }
      if ((m = path.match(/^\/api\/events\/(.+)$/))) { const e = eventsById.get(m[1]); if (!e || empty) throw new ApiError(404, path, 'Événement introuvable', 'NOT_FOUND'); return { ...publicEvent(e), detections: e._obs, analysis: { dists: e._sc.dists, gaps_h: e._sc.gaps, params: PARAMS } }; }
      if (path === '/api/statistics/summary') return empty ? { total: 0, modis: 0, viirs: 0, events: 0, active_zones: 0, frp_mean: 0, frp_max: 0, day: 0, night: 0, last_update: new Date(LAST_UPDATE).toISOString() } : summary(p);
      if (path === '/api/statistics/timeline') { const r = timeline(p); if (empty) r.series = r.series.map((b) => ({ ...b, total: 0, modis: 0, viirs: 0, frp_sum: 0, frp_max: 0, events: 0 })); return r; }
      if (path === '/api/statistics/satellites') return empty ? satellites({ ...p, start_date: '1900-01-01', end_date: '1900-01-02' }) : satellites(p);
      if (path === '/api/analytics/hotspots') return empty ? [] : hotspots(p);
      throw new ApiError(404, path, 'Endpoint inconnu', 'NOT_FOUND');
    },
  };

  window.FW_DATA = { API, ApiError, SIM_STATES, SATS, SAT, REGIONS, METHOD, PARAMS, LAST_UPDATE, START, END, DAY, DAYS, isoDate, distKm, provinceOf, inGabon, counts: { detections: detections.length, events: events.length } };
})();
