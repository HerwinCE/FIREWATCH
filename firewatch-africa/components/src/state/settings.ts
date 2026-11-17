/* Préférences utilisateur persistées (localStorage, tolérant aux erreurs). */
import { create } from 'zustand';

export interface Settings {
  lang: 'fr' | 'en'; theme: 'dark' | 'light'; unit: 'km' | 'mi'; tz: 'UTC' | 'Africa/Libreville';
  basemap: 'dark' | 'relief' | 'satellite'; cluster: boolean; labels: boolean; graticule: boolean;
  detail: 'simple' | 'standard' | 'expert'; reduceMotion: boolean; highContrast: boolean; largeText: boolean; assistant: boolean;
  /** Effets visuels des alertes (clignotement, scintillement) ; la détection reste active. */ alertEffects: boolean; alertAutoZoom: boolean;
}
const DEFAULTS: Settings = { lang: 'fr', theme: 'dark', unit: 'km', tz: 'UTC', basemap: 'satellite', cluster: true, labels: true, graticule: true, detail: 'standard', reduceMotion: false, highContrast: false, largeText: false, assistant: true, alertEffects: true, alertAutoZoom: true };
const KEY = 'fw.settings';
const EARTH_OPERATIONS_RELEASE = 'fw.earth-operations.v1';
const OPERATIONS_RELEASE = 'fw.operations-map.v1';
const NUIT_RELEASE = 'fw.theme-nuit.v1';
const load = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Migration unique : les anciens réglages provenaient de la maquette nocturne.
    // Ensuite, le choix explicite de l'utilisateur reste intégralement respecté.
    // Migration unique vers le thème « Nuit futuriste » : mode nuit par défaut.
    // Ensuite, le choix explicite de l'utilisateur (Paramètres, panneau Repères) reste respecté.
    if (!localStorage.getItem(NUIT_RELEASE)) {
      localStorage.setItem(NUIT_RELEASE, '1');
      localStorage.setItem(EARTH_OPERATIONS_RELEASE, '1');
      localStorage.setItem(OPERATIONS_RELEASE, '1');
      return { ...DEFAULTS, ...saved, theme: 'dark', basemap: 'satellite' };
    }
    return { ...DEFAULTS, ...saved };
  } catch { return DEFAULTS; }
};

export const useSettings = create<Settings & { update: (p: Partial<Settings>) => void }>((set, get) => ({
  ...load(),
  update: (p) => { set(p); const { update, ...s } = { ...get(), ...p }; void update; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ } applySettingsToDocument(s); },
}));

export function applySettingsToDocument(s: Settings) {
  const r = document.documentElement;
  r.dataset.theme = s.theme; r.dataset.reduceMotion = String(s.reduceMotion); r.dataset.contrast = s.highContrast ? 'high' : 'normal'; r.dataset.largeText = String(s.largeText); r.lang = s.lang; r.dataset.alertFx = String(s.alertEffects !== false);
}
