/* Vocabulaire contrôlé — une détection n'est jamais présentée comme un feu confirmé. */
export const TERMS = {
  detection: 'Détection thermique',
  event: 'Événement probable',
  activity: 'Activité thermique',
  hotspot: 'Zone de concentration',
  hotspotLong: 'Zone présentant une concentration élevée de détections',
  confidence: 'Niveau de confiance',
  score: 'Score d’harmonisation',
} as const;
export const DISCLAIMERS = {
  event: 'Cet événement est un rapprochement analytique de plusieurs observations satellitaires. Il ne constitue pas une confirmation terrain.',
  assistant: 'L’assistant fournit une interprétation des données disponibles. Il ne remplace pas une analyse scientifique, les autorités locales ou les observations terrain.',
  indicator: 'Indicateur expérimental — ne constitue pas une alerte officielle.',
  pedagogy: 'FireWatch Africa transforme les observations satellitaires en informations compréhensibles pour mieux analyser l’activité thermique mondiale.',
} as const;
/** Termes interdits dans l'interface (à vérifier en CI : grep sur les fichiers de traduction). */
export const FORBIDDEN = ['incendie confirmé', 'feu confirmé détecté', 'alerte incendie'];
