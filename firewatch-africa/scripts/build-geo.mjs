import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { Delaunay } = require('d3-delaunay');
const { LAND, WATER, GABON, PROVINCES } = await import('../mockup/src/geo-source.js');
const pts = PROVINCES.map(p => p.c);
const vor = Delaunay.from(pts).voronoi([7, -6, 16, 4]);
// Sutherland–Hodgman : sujet quelconque, découpeur convexe
function clip(subject, clipper) {
  let out = subject;
  const area = (p)=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0);
  const ccw = area(clipper) > 0;
  const inside = (p, a, b) => { const c = (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]); return ccw ? c >= 0 : c <= 0; };
  const inter = (p, q, a, b) => { const A1=q[1]-p[1],B1=p[0]-q[0],C1=A1*p[0]+B1*p[1],A2=b[1]-a[1],B2=a[0]-b[0],C2=A2*a[0]+B2*a[1],d=A1*B2-A2*B1; return [(B2*C1-B1*C2)/d,(A1*C2-A2*C1)/d]; };
  for (let i = 0; i < clipper.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length], inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      if (inside(q, a, b)) { if (!inside(p, a, b)) out.push(inter(p, q, a, b)); out.push(q); }
      else if (inside(p, a, b)) out.push(inter(p, q, a, b));
    }
  }
  return out.map(([x,y])=>[+x.toFixed(3),+y.toFixed(3)]);
}
const provinces = PROVINCES.map((p, i) => { const cell = vor.cellPolygon(i).slice(0, -1); return { ...p, poly: clip(GABON, cell) }; });
writeFileSync('mockup/src/geo.js', `/* Géométries schématiques (générées par scripts/build-geo.mjs) */\nwindow.FW_GEO = ${JSON.stringify({ LAND, WATER, GABON, PROVINCES: provinces })};\n`);
console.log(provinces.map(p => p.name + ':' + p.poly.length).join(' '));
