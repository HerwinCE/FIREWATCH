// Génère tokens.css, tokens.ts et tailwind.preset.js à partir de tokens.json
// Usage : node scripts/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'design-tokens');
const t = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));

const isToken = (o) => o && typeof o === 'object' && '$value' in o;
const fmt = (tok) => {
  const v = tok.$value;
  if (tok.$type === 'fontFamily') return v.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ');
  if (tok.$type === 'cubicBezier') return `cubic-bezier(${v.join(', ')})`;
  return String(v);
};
function flatten(obj, prefix = [], out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    if (isToken(v)) out.push([[...prefix, k], v]);
    else if (typeof v === 'object') flatten(v, [...prefix, k], out);
  }
  return out;
}
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const varName = (path) => '--fw-' + path.map(kebab).join('-');

const { dark, light } = t.color;
const nonColor = { ...t }; delete nonColor.color; delete nonColor.$schema; delete nonColor.$description;

const darkVars = flatten(dark, ['color']);
const lightVars = flatten(light, ['color']);
const otherVars = flatten(nonColor);

let css = `/* FireWatch Africa — design tokens (généré depuis tokens.json, ne pas éditer à la main) */\n`;
css += `:root, [data-theme="dark"] {\n  color-scheme: dark;\n`;
for (const [p, tok] of darkVars) css += `  ${varName(p)}: ${fmt(tok)};\n`;
for (const [p, tok] of otherVars) css += `  ${varName(p)}: ${fmt(tok)};\n`;
css += `}\n\n[data-theme="light"] {\n  color-scheme: light;\n`;
for (const [p, tok] of lightVars) css += `  ${varName(p)}: ${fmt(tok)};\n`;
css += `}\n\n@media (prefers-reduced-motion: reduce) {\n  :root { --fw-motion-duration-fast: 0ms; --fw-motion-duration-base: 0ms; --fw-motion-duration-slow: 0ms; --fw-motion-duration-pulse: 0ms; }\n}\n`;
writeFileSync(join(root, 'tokens.css'), css);

// TS : objet typé + références CSS
const toObj = (pairs, useVar) => {
  const o = {};
  for (const [p, tok] of pairs) {
    let cur = o;
    p.slice(0, -1).forEach((k) => (cur = cur[k] ??= {}));
    cur[p.at(-1)] = useVar ? `var(${varName(p)})` : tok.$value;
  }
  return o;
};
const ts = `/* FireWatch Africa — design tokens (généré depuis tokens.json) */
export const tokens = ${JSON.stringify({ color: { dark: toObj(darkVars.map(([p, v]) => [p.slice(1), v])), light: toObj(lightVars.map(([p, v]) => [p.slice(1), v])) }, ...toObj(otherVars) }, null, 2)} as const;

/** Références aux variables CSS — à utiliser dans les styles React pour suivre le thème actif */
export const cssVar = ${JSON.stringify({ ...toObj(darkVars, true), ...toObj(otherVars, true) }, null, 2)} as const;

export type Level = 'low' | 'moderate' | 'high';
export const levelMeta: Record<Level, { label: string; icon: string; color: string }> = {
  low: { label: 'Faible', icon: '▽', color: cssVar.color.level.low },
  moderate: { label: 'Modéré', icon: '◆', color: cssVar.color.level.moderate },
  high: { label: 'Élevé', icon: '▲', color: cssVar.color.level.high },
};
export const sensorMeta = {
  MODIS: { label: 'MODIS', shape: 'square', resolution: '≈ 1 km', color: cssVar.color.sensor.modis },
  VIIRS: { label: 'VIIRS', shape: 'circle', resolution: '375 m', color: cssVar.color.sensor.viirs },
} as const;
`;
writeFileSync(join(root, 'tokens.ts'), ts);

// Tailwind preset
const tw = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: toObj(darkVars.map(([p, v]) => [p.slice(1), v]), false),
      fontFamily: { sans: t.font.family.sans.$value, mono: t.font.family.mono.$value },
      fontSize: Object.fromEntries(Object.entries(t.font.size).map(([k, v]) => [k, v.$value])),
      spacing: Object.fromEntries(Object.entries(t.space).map(([k, v]) => [k, v.$value])),
      borderRadius: Object.fromEntries(Object.entries(t.radius).map(([k, v]) => [k, v.$value])),
      boxShadow: Object.fromEntries(Object.entries(t.shadow).map(([k, v]) => [`fw-${k}`, v.$value])),
      screens: { tablet: t.breakpoint.tablet.$value, laptop: t.breakpoint.laptop.$value, desktop: t.breakpoint.desktop.$value },
      transitionDuration: Object.fromEntries(Object.entries(t.motion.duration).map(([k, v]) => [k, v.$value])),
    },
  },
};
// remplace les couleurs par des variables CSS pour garder le thème dynamique
const colorVars = (o, path = ['color']) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? colorVars(v, [...path, k]) : `var(${varName([...path, k])})`]));
tw.theme.extend.colors = { fw: colorVars(tw.theme.extend.colors) };
writeFileSync(join(root, 'tailwind.preset.js'), `/* FireWatch Africa — preset Tailwind (généré) */\nmodule.exports = ${JSON.stringify(tw, null, 2)};\n`);
console.log('tokens: css', darkVars.length + otherVars.length, 'vars; light', lightVars.length);
