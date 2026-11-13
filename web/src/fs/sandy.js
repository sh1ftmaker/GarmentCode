// FreeSewing "Sandy" circle skirt (https://freesewing.eu/designs/sandy/, MIT, design by Erica
// Alcusa Sáez): a ring sector (a quarter to a whole circle, in one or more panels cut on the
// fold) on a straight or curved waistband that sits between the waist and the hips. The
// waistband laps over itself at the centre back for a button. Measurements from the
// mannequin, options as sliders, seam table and placement for the drape: the skirt starts
// as a cone hanging from the waistband (fabric beyond a capped flare folded into even
// flutes, as garment.js does for GarmentCode's panelled skirts), the band around the body.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, fsOptions, skirtSections, skirtMap } from './lower.js';

export const id = 'sandy';
export const name = 'Sandy circle skirt';
export const short = 'Circle skirt';
export const exportName = 'Sandy';
export const url = 'https://freesewing.eu/designs/sandy/';
export const author = 'Erica Alcusa Sáez';
export const settings = { expand: true };   // draft the straight waistband too
export const icon = 'M20 8h16v6l18 30c-12 8-40 8-52 0l18-30zM20 14h16';
export const stretchNote = 'The straight waistband is draped folded in half lengthwise; its button overlap is drawn closed over the other end at the centre back.';

export const design = {
  fit: {
    waistbandPosition: { v: 50, range: [0, 100], type: 'float', fs: 'pct', name: 'Waistband position (%)', help: 'Where the top of the waistband sits: 0% at the waist, 100% at the hips.' },
    waistbandShape: { v: 'straight', range: ['straight', 'curved'], type: 'select', fs: 'list', name: 'Waistband shape', labels: { straight: 'Straight waistband', curved: 'Curved waistband' }, help: 'Whether you want a straight or shaped waistband.' },
  },
  style: {
    circleRatio: { v: 50, range: [20, 100], type: 'float', fs: 'pct', name: 'Circle ratio (%)', help: 'The percentage of a circle you want the skirt to be.' },
    lengthBonus: { v: 50, range: [10, 100], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Determines how long the skirt will be (100% reaches the floor).' },
    waistbandWidth: { v: 4, range: [1, 8], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'Controls the width of the waistband, as a percentage of the waist to floor measurement.' },
    waistbandOverlap: { v: 3, range: [0, 15], type: 'float', fs: 'pct', name: 'Waistband overlap (%)', help: 'The amount by which the waistband overlaps.' },
    gathering: { v: 0, range: [0, 200], type: 'float', fs: 'pct', name: 'Gathering (%)', help: 'The percent by which the top of the skirt is longer than the bottom of the waistband.' },
  },
  construction: {
    panels: { v: 1, range: [1, 8], type: 'int', fs: 'count', name: 'Panels', help: 'Number of panels (each cut on the fold).' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['waist', 'waistToFloor', 'waistToHips', 'hips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const loc = (p) => [p.x / 10, -p.y / 10];
const nPanels = (o) => Math.max(1, Math.round(o.panels || 1));
const panelName = (o, k) => (nPanels(o) === 1 ? 'skirt' : `panel_${k + 1}`);

/*
 * The polar frame of a skirt panel (local cm): centre c, unit fold direction fd (from the
 * centre down the fold), waist radius rW, hem radius rH, half angle A, and phi(x, y): the angle
 * from the fold, positive towards the piece's local right (as seen from outside: towards the
 * wearer's left on the front). s: the sign of phi on the drafted half.
 */
function ring(sp) {
  const P = sp.points, c = loc(P.center), f = loc(P.in2Flipped);
  const rW = Math.hypot(f[0] - c[0], f[1] - c[1]), fd = [(f[0] - c[0]) / rW, (f[1] - c[1]) / rW];
  const e2 = loc(P.ex2), i2 = loc(P.in2);
  const phi = (x, y) => { const dx = x - c[0], dy = y - c[1]; return Math.atan2(fd[0] * dy - fd[1] * dx, fd[0] * dx + fd[1] * dy); };
  const pm = phi((e2[0] + i2[0]) / 2, (e2[1] + i2[1]) / 2);
  return { c, fd, rW, rH: Math.hypot(e2[0] - c[0], e2[1] - c[1]), A: Math.abs(pm), s: pm >= 0 ? 1 : -1, phi };
}

/*
 * Skirt (seam path as FreeSewing's ringsector draws it): hem ex2Flipped -> ex1 -> ex2, side
 * ex2 -> in2 (hem up), waist in2 -> in1 -> in2Flipped, fold in2Flipped -> ex2Flipped. Panel k
 * is centred at k turns of its angle from the centre front; each panel's +A side seam meets the
 * next panel's -A side. The waist runs from the centre back once round (u increasing) and is
 * sewn to the waistband's lower edge from its left end (centre back) up to the overlap.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], sp = parts['sandy.skirt'], wp = parts['sandy.waistband'];
  const P = sp.points, N = nPanels(o), R = ring(sp);
  const side = opsBetween(sp, P.ex2, P.in2), waist = opsBetween(sp, P.in2, P.in2Flipped);
  const fold = opsBetween(sp, P.in2Flipped, P.ex2Flipped)[0];
  const m = (ids) => ids.map(i => 'm' + i);
  // the edge at phi = +A / -A (both drawn hem -> waist)
  const plus = R.s > 0 ? side : m(side), minus = R.s > 0 ? m(side) : side;
  // waist halves in increasing phi: [-A, 0] then [0, A]
  const half = (k, h) => {
    const p = panelName(o, k);
    const drafted = (h === 1) === (R.s > 0);   // the drafted half is [0, A] when s > 0
    if (drafted) return R.s > 0 ? waist.slice().reverse().map(i => [p, i, true]) : waist.map(i => [p, i]);
    return R.s > 0 ? m(waist).map(i => [p, i]) : m(waist).reverse().map(i => [p, i, true]);
  };
  const seams = [];
  for (let k = 0; k < N; k++) seams.push({ a: plus.map(i => [panelName(o, k), i]), b: minus.map(i => [panelName(o, (k + 1) % N), i]) });
  // half j spans [(j - 1) A, j A] of the whole ring; the centre back is at N A
  const wchain = [];
  for (let n = 0; n < 2 * N; n++) { const j = (N + 1 + n) % (2 * N); wchain.push(...half(Math.floor(j / 2), j % 2)); }
  const pieces = [];
  for (let k = 0; k < N; k++) pieces.push({ name: panelName(o, k), part: 'sandy.skirt', fold });
  const labels = {};
  if (wp && !wp.hidden && wp.paths.seam) {
    const W = wp.points, st = draft.setStores[0];
    const curved = o.waistbandShape === 'curved';
    const bottom = curved ? opsBetween(wp, W.ex2Flipped, W.ex2) : opsBetween(wp, W.bottomLeft, W.bottomRight);
    const top = curved ? opsBetween(wp, W.in2, W.in2Flipped) : opsBetween(wp, W.topRight, W.topLeft);
    const sewn = curved ? st.get('bottomCircumference') : st.get('topCircumference');
    const f = sewn / (sewn + st.get('waistbandOverlap'));
    // the bottom edge as one chain over the sewn part (a curve may be drawn as two ops)
    const lens = bottom.map(i => opLen(wp, i)), tot = lens.reduce((a, b) => a + b, 0);
    const bchain = [];
    let acc = 0;
    for (let n = 0; n < bottom.length; n++) {
      const a0 = acc / tot, a1 = (acc + lens[n]) / tot;
      acc += lens[n];
      if (a0 >= f - 1e-6) break;
      bchain.push(['waistband', bottom[n], false, 0, Math.min(1, (f - a0) / (a1 - a0))]);
    }
    pieces.push({ name: 'waistband', part: 'sandy.waistband', label: 'body', follow: 6, ...(curved ? {} : { doubled: 'y' }) });
    seams.push({ a: wchain, b: bchain });
    labels.lower_interface = top.map(i => ['waistband', i]);
  } else labels.lower_interface = wchain.map(([p, i]) => [p, i]);
  return { pieces, seams, labels };
}

// length (mm) of seam op i, by sampling
function opLen(part, i) {
  let cur = null, k = -1;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { cur = op.to; continue; }
    k++;
    if (k === i) {
      if (op.type !== 'curve') return Math.hypot(op.to.x - cur.x, op.to.y - cur.y);
      let L = 0, p = cur;
      for (let t = 1; t <= 32; t++) {
        const u = t / 32, v = 1 - u;
        const q = { x: v * v * v * cur.x + 3 * v * v * u * op.cp1.x + 3 * v * u * u * op.cp2.x + u * u * u * op.to.x,
          y: v * v * v * cur.y + 3 * v * v * u * op.cp1.y + 3 * v * u * u * op.cp2.y + u * u * u * op.to.y };
        L += Math.hypot(q.x - p.x, q.y - p.y); p = q;
      }
      return L;
    }
    if (op.to) cur = op.to;
  }
  return 0;
}

/** World heights (cm): the top of the waistband and the skirt's waist (the band's lower edge). */
function levels(draft, m) {
  const o = draft.settings[0].options, M = draft.settings[0].measurements;
  const W0 = m.height - m.head_l - m.waist_line;
  const top = W0 - (o.waistbandPosition ?? 0.5) * M.waistToHips / 10;
  const wp = draft.parts[0]['sandy.waistband'];
  let wb = 0;
  if (wp && !wp.hidden && wp.paths.seam) {
    const P = wp.points;
    wb = o.waistbandShape === 'curved' ? Math.hypot(P.ex2.x, P.ex2.y) / 10 - Math.hypot(P.in2.x, P.in2.y) / 10 : -P.topLeft.y / 10;
  }
  return { top, skirt: top - wb, wb };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], sp = parts['sandy.skirt'], wp = parts['sandy.waistband'];
  const o = draft.settings[0].options, st = draft.setStores[0];
  const N = nPanels(o), R = ring(sp), L = levels(draft, m);
  const sections = skirtSections(body, L.top + 10);
  const Cw = st.get('bottomCircumference') / 10;   // the band's lower edge (the skirt's waist once sewn)
  const Ttot = 2 * N * R.A;                         // the whole skirt's angle
  const sinB = Math.min(Math.sin(0.5), Ttot / (2 * Math.PI)), cosB = Math.sqrt(1 - sinB * sinB);
  const hemLen = R.rH * Ttot, flutes = Math.max(4, Math.round(hemLen / 45));
  const gap = 1.5;
  const S0 = sections(L.skirt), k0 = Math.max(1, Cw / S0.L);
  const skirt = (k) => (x, y) => {
    const s = Math.max(0, Math.hypot(x - R.c[0], y - R.c[1]) - R.rW);
    const f = (k * 2 * R.A + R.phi(x, y)) / Ttot;   // share of the turn from the centre front
    const [px, pz, nx, nz] = S0.at(f * S0.L);
    const wx = S0.cx + k0 * (px - S0.cx) + gap * nx - S0.cx, wz = S0.cz + k0 * (pz - S0.cz) + gap * nz - S0.cz;
    const R0 = Math.hypot(wx, wz) || 1, dx = wx / R0, dz = wz / R0;
    const r0 = Cw / (2 * Math.PI) + gap + s * sinB, len = (R.rW + s) * Ttot;
    let r = R0 + s * sinB;
    if (len > 2 * Math.PI * r0 * 1.02) {   // more fabric than the cone holds: even radial flutes
      const A = Math.min(0.8 * r0, Math.max(Math.sqrt(2 * ((len / (2 * Math.PI)) ** 2 - r0 * r0)) / flutes,
        (len - 2 * Math.PI * r0) / (4 * flutes)));
      r += A * Math.cos(flutes * 2 * Math.PI * f);
    }
    const Y = L.skirt - s * cosB, Sb = sections(Y);
    const [bx, bz] = Sb.at(f * Sb.L);
    r = Math.max(r, (dx * (bx - S0.cx) + dz * (bz - S0.cz)) + 2 * gap);   // clear of the hips and legs
    return [S0.cx + r * dx, Y, S0.cz + r * dz];
  };
  // the band: u along its lower edge from the centre back (towards the wearer's right), v up
  let band = null;
  if (wp && !wp.hidden && wp.paths.seam) {
    const curved = o.waistbandShape === 'curved', W = wp.points;
    const sewn = (curved ? st.get('bottomCircumference') : st.get('topCircumference')) / 10;
    const B = skirtMap(sections, { waistY: L.skirt, girth: () => Cw, gap });
    const at = (u, v) => B(Cw * (0.5 + u / sewn), Math.max(0, Math.min(L.wb, v)), u > sewn ? 0.8 : 0);
    if (curved) {
      const rO = Math.hypot(W.ex2.x, W.ex2.y) / 10, a0 = Math.atan2(-W.ex2Flipped.y, W.ex2Flipped.x);
      band = (x, y) => {
        const a = Math.atan2(y, x), r = Math.hypot(x, y);
        return at((a - a0) * rO, rO - r);   // the arc runs anticlockwise from ex2Flipped (left) to ex2
      };
    } else {
      const x0 = W.bottomLeft.x / 10;
      band = (x, y) => at(x - x0, y);   // folded in half: lower edge at y = 0
    }
  }
  return (ps) => {
    if (ps.name === 'waistband') return band;
    const k = ps.name === 'skirt' ? 0 : Number(ps.name.split('_')[1]) - 1;
    return skirt(k);
  };
}

export function attachLevels(draft, m) {
  return { lower_interface: levels(draft, m).top };
}
export const lift = 2;
