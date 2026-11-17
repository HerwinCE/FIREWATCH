# FireWatch Africa — Design system

> Source unique : `design-tokens/tokens.json` (format W3C DTCG). `tokens.css`, `tokens.ts` et `tailwind.preset.js` sont **générés** par `node scripts/build-tokens.mjs`. Ne jamais modifier ces trois fichiers à la main.

## 1. Principes

| Principe | Traduction concrète |
|---|---|
| **Centre de contrôle scientifique, pas militaire** | Fond noir bleuté, surfaces étagées, aucun effet néon ; un seul halo autorisé (détections < 24 h). |
| **La couleur n'est jamais seule** | Capteur = forme (● VIIRS, ■ MODIS, ◆ événement). Niveau = icône + libellé (▽ Faible, ◆ Modéré, ▲ Élevé). |
| **Le rouge est réservé** | Uniquement pour le niveau *élevé* et FRP ≥ 100 MW, toujours avec ▲. |
| **Vocabulaire prudent** | « Détection thermique », « Événement probable », « Zone de concentration » — jamais « incendie confirmé » (voir `components/src/utils/glossary.ts`). |
| **Donnée traçable** | Chaque graphique cite son endpoint ; chaque donnée synthétique porte le badge **DÉMO**. |
| **Performance perçue** | Squelettes à la forme du contenu, données précédentes conservées pendant le rechargement (`keepPreviousData`). |

## 2. Couleurs

### 2.1 Thème sombre (défaut)

| Rôle | Token CSS | Valeur |
|---|---|---|
| Fond de carte / encastré | `--fw-color-bg-sunken` | `#070B10` |
| Fond principal | `--fw-color-bg-base` | `#0A0F15` |
| Surface 1 (cartes) | `--fw-color-bg-surface1` | `#111922` |
| Surface 2 (survol, champs, en-têtes) | `--fw-color-bg-surface2` | `#17212C` |
| Surface 3 (actif, sélection) | `--fw-color-bg-surface3` | `#1E2A37` |
| Bordure discrète / défaut / forte | `--fw-color-border-subtle/default/strong` | `#1F2B38` / `#2A3A4B` / `#3B5068` |
| Focus clavier | `--fw-color-border-focus` | `#4CC9F0` |
| Texte principal (blanc cassé) | `--fw-color-text-primary` | `#ECE7DE` |
| Texte secondaire (gris bleuté) | `--fw-color-text-secondary` | `#9DACBD` |
| Texte discret | `--fw-color-text-muted` | `#8193A5` |
| Thermique (détections) | `--fw-color-thermal-500` | `#F28C28` |
| Thermique faible FRP | `--fw-color-thermal-300` | `#FFB067` |
| Élevé (réservé) | `--fw-color-high-500` | `#F0585D` |
| Forêt | `--fw-color-forest-500` / `-300` / `-900` | `#2F8F62` / `#6CC79A` / `#0F2A1F` |
| NASA / technique / liens | `--fw-color-nasa-500` | `#4CC9F0` |
| Capteur MODIS | `--fw-color-sensor-modis` | `#C2851F` |
| Capteur VIIRS | `--fw-color-sensor-viirs` | `#2E97C6` |
| Événement harmonisé | `--fw-color-sensor-fused` | `#B39DFA` |
| Niveaux faible / modéré / élevé | `--fw-color-level-low/moderate/high` | `#6CC79A` / `#F2B53A` / `#F0585D` |

### 2.2 Contrastes vérifiés (WCAG 2.1)

Thème sombre — texte ou marque sur fond :

| Token | Valeur | sur `bg.base` | sur `surface1` | sur `surface2` |
|---|---|---|---|---|
| `text.primary` | `#ECE7DE` | 15.6:1 | 14.4:1 | 13.2:1 |
| `text.secondary` | `#9DACBD` | 8.3:1 | 7.6:1 | 7.0:1 |
| `text.muted` | `#8193A5` | 6.1:1 | 5.6:1 | 5.2:1 |
| `thermal.500` | `#F28C28` | 7.8:1 | 7.2:1 | 6.6:1 |
| `thermal.300` | `#FFB067` | 10.7:1 | 9.8:1 | 9.0:1 |
| `high.500` | `#F0585D` | 5.7:1 | 5.3:1 | 4.9:1 |
| `nasa.500` | `#4CC9F0` | 10.0:1 | 9.2:1 | 8.5:1 |
| `forest.300` | `#6CC79A` | 9.4:1 | 8.7:1 | 8.0:1 |
| `level.moderate` | `#F2B53A` | 10.5:1 | 9.7:1 | 8.9:1 |
| `sensor.modis` | `#C2851F` | 6.1:1 | 5.6:1 | 5.2:1 |
| `sensor.viirs` | `#2E97C6` | 5.8:1 | 5.4:1 | 4.9:1 |
| `sensor.fused` | `#B39DFA` | 8.4:1 | 7.7:1 | 7.1:1 |

Thème clair :

| Token | Valeur | sur `bg.base` `#F5F2EC` | sur `surface1` `#FFFFFF` |
|---|---|---|---|
| `text.primary` | `#14202B` | 14.8:1 | 16.5:1 |
| `text.secondary` | `#4A5A6A` | 6.3:1 | 7.1:1 |
| `text.muted` | `#5E6B78` | 4.9:1 | 5.5:1 |
| `thermal.500` | `#A04B06` | 5.4:1 | 6.0:1 |
| `high.500` | `#B4232A` | 5.8:1 | 6.5:1 |
| `nasa.500` | `#0B6E99` | 5.1:1 | 5.7:1 |
| `level.low` | `#1E6B47` | 5.8:1 | 6.5:1 |
| `level.moderate` | `#8A5A00` | 5.3:1 | 5.9:1 |

Règles : `forest.500` (4.8:1) n'est jamais utilisé pour du texte de petite taille ; le texte n'emprunte jamais la couleur d'une série (les valeurs restent en `text.*`, la marque colorée à côté porte l'identité).

### 2.3 Palette des capteurs (graphiques)

La paire MODIS / VIIRS a été validée avec un outil de simulation de daltonisme : ΔE CVD ≈ 21 (protanopie, pire cas), ΔE vision normale ≈ 25, contraste ≥ 3:1 sur la surface, en thème sombre **et** clair. Le violet « événement » n'est jamais placé dans le même graphique que VIIRS sans encodage de forme (◆ vs ●).

### 2.4 Rampes séquentielles

- **Calendrier / densité** : orange mono-teinte `chart.seq1 → seq5` (`#2A1A0E → #FFC98A`), toujours accompagné d'une échelle « Moins → Plus ».
- **Choroplèthe provinces (Gabon)** : orange thermique en opacité croissante (4 → 48 %).
- Jamais d'arc-en-ciel ; jamais de double axe Y.

## 3. Typographie

| Usage | Famille | Taille / graisse | Interlignage |
|---|---|---|---|
| Chiffre héros | Inter | 48 / 600 | 1.15 |
| Titre de page (H2) | Inter | 28 / 650, -0.02em | 1.15 |
| Titre de hero | Inter | 30 / 650 | 1.12 |
| Chiffre clé (StatCard) | Inter, chiffres tabulaires | 28 / 600 | 1.1 |
| Titre de section / carte | Inter | 14 / 600 | 1.3 |
| Corps d'interface | Inter | 14 / 400 | 1.5 |
| Tableau, chips | Inter | 13 / 400–500 | 1.5 |
| Légende, métadonnée | Inter | 12 / 500 | 1.5 |
| Libellé de section (overline) | Inter capitales | 11 / 600, +0.12em | — |
| Coordonnées, heures UTC, identifiants, FRP | JetBrains Mono (repli : IBM Plex Mono, ui-monospace) | 12–13 / 400–500 | — |

Formats : nombres en français (`3 824`, `41,2 MW`, `0,72`), dates `14/11/2026`, heures toujours suivies de « UTC ».

## 4. Espacements, tailles, rayons

- **Grille de 4 px** : `space-1…16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px.
- Gouttière de grille 16 px ; padding de page 24 px (desktop), 16 px (mobile) ; padding de carte 16 px.
- Grille 12 colonnes ; largeur max du contenu 1600 px.
- Sidebar 248 px (desktop) → 68 px (≤ 1279 px) → tiroir 284 px (mobile).
- Topbar 56 px (52 px mobile) ; barre inférieure mobile 64 px ; panneau filtres 320 px ; panneau assistant 400 px.
- Hauteur de contrôle 36 px (30 px variante `sm`) ; cible tactile minimale 44 px.
- Rayons : 4 (xs), 6 (boutons, champs), 10 (cartes), 14 (hero, feuilles mobiles), 999 (chips, badges).
- Élévations : `shadow-1` (cartes), `shadow-2` (popovers, légende), `shadow-3` (tiroirs, assistant, toasts).

## 5. Mouvement

| Token | Durée | Usage |
|---|---|---|
| `instant` | 80 ms | pression de bouton |
| `fast` | 140 ms | survol, focus, bascules |
| `base` | 220 ms | tiroirs, panneaux, changement de période |
| `slow` | 420 ms | apparition progressive des données, cartes de stats en cascade (+40 ms) |
| `pulse` | 2 400 ms | pulsation des détections < 24 h |

Courbe standard `cubic-bezier(.2,.7,.2,1)` ; entrée de panneau `cubic-bezier(.3,0,0,1)`. `prefers-reduced-motion` **et** le réglage utilisateur « Réduire les animations » ramènent toutes les durées à 0.

## 6. Encodage cartographique

| Élément | Forme | Couleur | Taille |
|---|---|---|---|
| Détection VIIRS | ● rond | classe FRP | 3,6 px (écran) |
| Détection MODIS | ■ carré | classe FRP | 3,6 px |
| Événement probable | ◆ losange | violet `sensor.fused` | 1,5× |
| Classe FRP | — | < 15 MW `thermal.300` · 15–100 `thermal.500` · ≥ 100 `high.500` + ▲ | — |
| Détection < 24 h | anneau | `thermal.300`, pulsation 2,4 s | — |
| Regroupement | disque + nombre | contour orange ; rouge seulement si ≥ 8 % de FRP ≥ 100 MW | 7–22 px selon log₂(n) |
| Zone de concentration | rectangle pointillé | orange 13 % (rouge si niveau élevé) | cellule 1°, 0,5° ou 0,25° |
| Limite provinciale | trait pointillé | `map.admin` | 1 px |
| Afrique (mise en avant) | aplat | `map.focusLand` (teinte forêt) | — |

## 7. Iconographie

Trait 1,75 px sur grille 24, terminaisons arrondies — compatible `lucide-react` (le composant `Icon` peut être remplacé). Taille par défaut 16 px, 18 px dans la navigation, 24 px dans les états vides.

## 8. Accessibilité (rappel des règles appliquées)

- Contraste AA vérifié (tableau 2.2) ; mode « contraste renforcé » disponible.
- Focus visible : anneau cyan 2 px + décalage 2 px sur tous les éléments interactifs.
- Navigation clavier : lien d'évitement, carte pilotable (flèches, +/−, 0, Échap), lignes de tableau activables (Entrée / Espace), curseur avant/après au clavier.
- Toute carte et tout graphique a une alternative textuelle (`<details>` « Voir les données » ou tableau dédié) et un `aria-label`.
- Les messages d'erreur disent **ce qui s'est passé, ce qui est conservé et quoi faire** (« Vos filtres sont conservés ; réessayez »).
- Régions `aria-live` pour le compteur de résultats, les toasts, la conversation de l'assistant.
