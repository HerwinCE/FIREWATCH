import {useQuery} from '@tanstack/react-query';
import {get} from './api';
import {SENSORS} from './harmonized';

const fr=(v:unknown)=>typeof v==='number'?v.toLocaleString('fr-FR'):'—';

/** Page « Méthode et limites » : ce que fait l'application, sur quelles données, et ce qu'elle ne dit pas. */
export function Methodology(){
 const run=useQuery({queryKey:['harmonization-status'],queryFn:()=>get('/harmonization/status')});
 const stats=useQuery({queryKey:['summary','',''],queryFn:()=>get('/statistics/summary','')});  // même requête (et même cache) que le tableau de bord
 const p=run.data?.parameters;
 return <article className="method">
  <header className="method__intro">
   <h2>Rendre MODIS et VIIRS comparables, puis situer chaque mois face à sa normale.</h2>
   <p>FireWatch Africa transforme les détections thermiques brutes de la NASA en une série cohérente de 2000 à aujourd’hui. Objectif : savoir si l’activité d’une zone est normale, au moment où MODIS s’arrête et où VIIRS prend le relais.</p>
   <dl className="method__facts">
    <div><dt>Détections de végétation</dt><dd>{fr(stats.data?.total_detections)}</dd></div>
    <div><dt>Historique</dt><dd>2000–2026</dd></div>
    <div><dt>Grille commune</dt><dd>0,01° ≈ 1,1 km</dd></div>
    <div><dt>Version</dt><dd>{run.data?.version?`v${run.data.version}`:'—'}</dd></div>
   </dl>
  </header>

  <section className="method__block">
   <h3>1. Les données</h3>
   <p>Toutes proviennent de <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS</a>. Les lignes d’origine sont conservées telles quelles ; l’harmonisation produit une couche dérivée, versionnée et recalculable.</p>
   <div className="table-wrap"><table>
    <thead><tr><th scope="col">Capteur</th><th scope="col">Résolution</th><th scope="col">Données utilisées</th><th scope="col">Rôle</th></tr></thead>
    <tbody>
     <tr><th scope="row"><span style={{color:SENSORS[0].color}} aria-hidden="true">■ </span>MODIS Terra et Aqua</th><td>1 km</td><td>Archives 2000–2025 · temps réel</td><td>Série historique longue, arrêt annoncé fin 2026</td></tr>
     <tr><th scope="row"><span style={{color:SENSORS[4].color}} aria-hidden="true">◆ </span>VIIRS Suomi-NPP</th><td>375 m</td><td>Archives 2012–2025</td><td>Historique VIIRS ; production arrêtée le 2 novembre 2026</td></tr>
     <tr><th scope="row"><span style={{color:SENSORS[2].color}} aria-hidden="true">● </span>VIIRS NOAA-20</th><td>375 m</td><td>Archives 2018–2025 · temps réel</td><td>Source temps réel principale</td></tr>
     <tr><th scope="row"><span style={{color:SENSORS[3].color}} aria-hidden="true">▲ </span>VIIRS NOAA-21</th><td>375 m</td><td>Temps réel (pas encore d’archive)</td><td>Source temps réel principale</td></tr>
    </tbody>
   </table></div>
   <p className="method__note">Temps réel : les 5 derniers jours disponibles dans FIRMS. Archives : fichiers annuels par pays, en qualité scientifique, avec l’attribut <code>type</code> qui distingue végétation, volcan, industrie et offshore.</p>
  </section>

  <section className="method__block">
   <h3>2. L’harmonisation, en six règles</h3>
   <ol className="method__steps">
    <li><b>Un format commun.</b> Satellites normalisés, horodatage UTC, famille de capteur et résolution d’origine renseignées.</li>
    <li><b>Une confiance unifiée.</b> MODIS 0–29 / 30–79 / 80–100 % et VIIRS l / n / h deviennent « faible », « nominale », « haute ». La valeur d’origine reste affichée à côté.</li>
    <li><b>Les sources non végétales écartées.</b> Torchères, sites industriels, volcans et plateformes offshore sont exclus des statistiques : par l’attribut FIRMS dans les archives, par un masque d’environ 1 km autour des sites connus pour le temps réel{stats.data?.static_mask_cells?` (${fr(stats.data.static_mask_cells)} cellules)`:''}.</li>
    <li><b>Une grille de 1 km.</b> Chaque détection est rattachée à une cellule de 0,01°. On compare les <em>cellules actives</em>, pas les points : VIIRS produit mécaniquement plus de points que MODIS pour une même activité.</li>
    <li><b>La meilleure version disponible.</b> Une détection temps réel est remplacée par sa version scientifique dès qu’elle existe (même satellite, ≤ 0,01°, ≤ 10 min).</li>
    <li><b>Des rapprochements, jamais des fusions.</b> Deux satellites différents à ≤ {p?.cluster_max_km??2} km et ≤ {p?.cluster_max_hours??3} h forment un « rapprochement possible ». Ce n’est pas la preuve d’un même incendie.</li>
   </ol>
  </section>

  <section className="method__block">
   <h3>3. Mesurer l’écart à la normale</h3>
   <p>Pour une zone et un mois, on compte les cellules actives de végétation de chaque année de référence, puis on calcule la <b>médiane</b> et l’intervalle <b>P25–P75</b>.</p>
   <ul className="method__list">
    <li><b>Chaque famille face à sa propre référence</b> : MODIS 2001–2025, VIIRS 2012–2025. Jamais VIIRS contre une médiane MODIS.</li>
    <li><b>Mois en cours : mêmes jours.</b> Du 10 au 14 novembre, on compare aux 10–14 novembre des années passées, pas au mois complet.</li>
    <li><b>Même territoire.</b> Les archives ne couvrent que le pays : le mois en cours est restreint aux mêmes carreaux de 0,1°.</li>
    <li><b>Années incomplètes exclues</b> au-delà de 20 % de jours sans données.</li>
    <li><b>Lecture</b> : au-dessus de P75, « au-dessus de la normale » ; sous P25, « en dessous » ; entre les deux, « dans la normale ».</li>
   </ul>
   <p className="method__note">Pourquoi la médiane ? Une année exceptionnelle, comme l’épisode El Niño de 2015-2016, déplace la moyenne mais pas la médiane.</p>
  </section>

  <section className="method__block">
   <h3>4. Lire le calendrier de feu</h3>
   <ul className="method__legend">
    <li><i className="firecal__swatch is-l3"/> <span><b>Couleur</b> : nombre de cellules actives, en 5 classes calculées par quantiles.</span></li>
    <li><i className="firecal__swatch is-l0"/> <span><b>Zéro</b> : des données ont été reçues, aucune détection de végétation.</span></li>
    <li><i className="firecal__swatch is-gap"/> <span><b>Trou de données</b> : aucun fichier reçu. Ce n’est pas une absence de feu.</span></li>
    <li><i className="firecal__swatch is-unavailable"/> <span><b>Capteur indisponible</b> : avant son lancement ou dans le futur.</span></li>
   </ul>
  </section>

  <section className="method__block method__block--limits">
   <h3>5. Ce que l’outil ne dit pas</h3>
   <ul className="method__list">
    <li><b>Une détection thermique n’est pas un incendie confirmé.</b> Elle peut signaler un brûlis agricole, un feu de savane ou une source industrielle non répertoriée.</li>
    <li><b>Pas de mesure de la température de l’air.</b> Une canicule se lit indirectement, par une activité anormalement forte.</li>
    <li><b>Couverture imparfaite.</b> Nuages, fumée et heures de passage des satellites masquent une partie de l’activité.</li>
    <li><b>FRP = puissance, en mégawatts.</b> Sa somme sur des passages répétés n’est ni une énergie ni une surface brûlée.</li>
    <li><b>Biais entre satellites VIIRS mesuré, non corrigé.</b> Ratio NOAA-20 / Suomi-NPP ≈ 1,03 sur 2019–2025 ; la correction reste à valider.</li>
    <li><b>Zone rectangulaire.</b> Le Gabon est sélectionné par emprise, sans limites provinciales.</li>
   </ul>
  </section>
 </article>;
}
