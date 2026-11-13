// FreeSewing "Yuri" hooded sweater (https://freesewing.eu/designs/yuri/, MIT, design by Biou):
// a zipless sweater built on Brian, with wrap-over fronts that cross below the hood, side
// gussets that flare the body out to the hem and a three-part hood. Measurements from the
// mannequin, options as sliders, seam table and placement around the torso, arms and head
// for the drape.
import { upperFrame, torsoMap, outlineSpan, hoodSideMap, edgeEnds } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';
import { brianMeasurements, brianSleeves, foldEdge, treeOptions, pick } from './tops.js';
import { blockEdges } from './brian.js';

export const id = 'yuri';
export const name = 'Yuri sweater';
export const short = 'Hooded sweater';
export const exportName = 'Yuri';
export const url = 'https://freesewing.eu/designs/yuri/';
export const author = 'Biou';
export const icon = 'M20 6c2-3 14-3 16 0l3 6 8 3 6 31-6 1-4-21 5 26H12l5-26-4 21-6-1 6-31 8-3zM22 20l14 14';
export const stretchNote = 'The fronts wrap over each other: the tip of the left front buttons onto the right front near the neck. The 3D drape lays the left front over the right one, buttoned.';

export const design = {
  fit: {
    chestEase: { v: 15, range: [-4, 35], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    hipsEase: { v: 0, range: [0, 10], type: 'float', name: 'Hips ease (%)', help: 'The amount of ease at the hips.' },
    bicepsEase: { v: 15, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    cuffEase: { v: 30, range: [20, 60], type: 'float', name: 'Cuff ease (%)', help: 'The amount of ease at your wrist.' },
    collarEase: { v: 20, range: [10, 30], type: 'float', name: 'Collar ease (%)', help: 'The amount of ease around your neck.' },
    lengthBonus: { v: 10, range: [5, 15], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body.' },
  },
  style: {
    sleeveLengthBonus: { v: 1, range: [0, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves.' },
    s3Collar: { v: 0, range: [-100, 100], type: 'float', name: 'Shoulder seam shift: collar side (%)', help: 'Shifts the shoulder seam forward (or back) at the collar.' },
    s3Armhole: { v: 0, range: [-100, 100], type: 'float', name: 'Shoulder seam shift: armhole side (%)', help: 'Shifts the shoulder seam forward (or back) at the armhole.' },
  },
};

export const options = (d) => treeOptions(d);
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'shoulderToWrist', 'wrist', 'head'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

const LAYER = 3;   // cm the left front starts outside the right one
const GUSSET = 36 * Math.PI / 180;   // half the gusset's angle at the armpit (yuri/src/gusset.mjs)
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const P = (pt) => [pt.x / 10, -pt.y / 10];
const cubicLen = (a, b, c, d) => {
  let L = 0, prev = a;
  for (let i = 1; i <= 64; i++) {
    const t = i / 64, s = 1 - t;
    const q = [0, 1].map(k => s * s * s * a[k] + 3 * s * s * t * b[k] + 3 * s * t * t * c[k] + t * t * t * d[k]);
    L += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q;
  }
  return L;
};

/**
 * Share of the front's diagonal edge (from the neck down to the button) that the hood is
 * sewn to: Yuri drafts the hood's neck seam to Brian's front neckline (yuri/src/front.mjs
 * neckOpeningLenFront); the rest of the diagonal is the free edge of the wrap-over.
 */
function hoodShare(draft) {
  const f = draft?.parts?.[0]?.['yuri.front'];
  if (!f) return 0.35;
  const p = f.points, neck = cubicLen(P(p.neck), P(p.neckCp2Front), P(p.cfNeckCp1), P(p.cfNeck));
  return Math.max(0.1, Math.min(0.85, neck / edgeLen(draft)));
}

/** The front's diagonal edge (neck -> button): right after the shoulder seam (blockEdges). */
const diagonal = (front) => blockEdges(front, 1).shoulder + 1;
/** Length (cm) of the front's diagonal edge. */
function edgeLen(draft) {
  const f = draft?.parts?.[0]?.['yuri.front'];
  if (!f) return 38;
  const e = pathEdges(f.paths.seam)[diagonal(f)];
  return Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]);
}

/*
 * Edges (seam path operations):
 *  front (a left and a right piece): 0 side seam (hem -> armpit), then (brian.js blockEdges;
 *    the shoulder seam shift options can add an edge) 1-3 armhole (side -> shoulder), 4 shoulder
 *    seam (shoulder -> neck), 5 diagonal front edge D (neck -> button), 6 lower front edge
 *    (button -> centre front at the hem), 7 hem (centre -> side)
 *  back (cut on the fold, centre back after the neckline): 0-4 as the front, 5 neckline (-> centre)
 *  gusset (cut on the fold, 1 = centre): 0 / m0 its sides (hem corner -> armpit), 2 / m2 hem
 *  sleeve: 0 back underarm (up), 1-5 cap (back -> front), 6 front underarm (down), 7 wrist
 *  hoodSide: 0-1 face opening, 2-3 centre seam (forehead -> top -> back of neck), 4 neck (back -> front)
 *  hoodCenter (x along it, 0 = face): 1 one side (face -> neck), 2 neck end, 3 other side (neck -> face)
 * The unmirrored front, the back's mirrored half, the unmirrored gusset and sleeve and the
 * mirrored hood side are the wearer's left. Each gusset's edge 0 is sewn to the back, m0 to the front.
 */
export function spec(o, draft) {
  const share = hoodShare(draft);
  const parts = draft.parts[0], Ef = blockEdges(parts['yuri.front'], 1), Eb = blockEdges(parts['yuri.back'], 1), D = Ef.shoulder + 1;
  const seams = [];
  for (const s of [1, -1]) {
    const L = s > 0, fr = L ? 'front_l' : 'front_r', b = (k) => (L ? 'm' + k : String(k));
    const sl = L ? 'sleeve_l' : 'sleeve_r', gu = L ? 'gusset_l' : 'gusset_r', hood = L ? 'hood_l' : 'hood_r';
    seams.push(
      { a: [[fr, 0]], b: [[gu, 'm0']] },                                                     // front to gusset
      { a: [['back', b(0)]], b: [[gu, 0]] },                                                  // back to gusset
      { a: [[fr, Ef.shoulder]], b: [['back', b(Eb.shoulder)]] },                              // shoulder seam
      { a: [...Eb.armhole.map(k => ['back', b(k)]), ...Ef.armhole.slice().reverse().map(k => [fr, k, true])],
        b: [[sl, 1], [sl, 2], [sl, 3], [sl, 4], [sl, 5]] },                                   // armhole
      { a: [[sl, 0, true]], b: [[sl, 6]] },                                                   // underarm
      // neckline (centre back -> front) to the hood
      { a: [...Eb.neck.slice().reverse().map(k => ['back', b(k), true]), [fr, D, false, 0, share]],
        b: [L ? ['hood_center', 2, true, 0, 0.5] : ['hood_center', 2, false, 0.5, 1], [hood, 4]] },
      { a: [[hood, 2], [hood, 3]], b: [L ? ['hood_center', 1] : ['hood_center', 3, true]] },   // hood centre seam
    );
  }
  // the button: the left front's tip (buttonhole) crosses over and buttons onto the right
  // front's diagonal edge where the hood ends (FreeSewing marks the button 3 cm in from there)
  seams.push({ a: [['front_l', D, false, 0.97, 1]], b: [['front_r', D, false, share, share + 1.2 / edgeLen(draft)]] });
  return {
    pieces: [
      { name: 'front_l', part: 'yuri.front', label: 'body' },
      { name: 'front_r', part: 'yuri.front', mirror: true, label: 'body' },
      { name: 'back', part: 'yuri.back', fold: Eb.neck[Eb.neck.length - 1] + 1, label: 'body' },
      { name: 'gusset_l', part: 'yuri.gusset', fold: 1, label: 'body' },
      { name: 'gusset_r', part: 'yuri.gusset', fold: 1, mirror: true, label: 'body' },
      { name: 'sleeve_l', part: 'yuri.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'yuri.sleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'hood_l', part: 'library.hoodSide', mirror: true, label: 'hood', lining: true, follow: 8 },
      { name: 'hood_r', part: 'library.hoodSide', label: 'hood', lining: true, follow: 8 },
      { name: 'hood_center', part: 'library.hoodCenter', label: 'hood', lining: true, follow: 50 },
    ],
    seams,
    labels: {},
  };
}

const NB = 72;   // directions of a torso section (place.js upperFrame: F.sec(Y).r[j] at angle 2πj/NB from the front towards +x)
const radius = (S, ph) => { let f = ((ph / (2 * Math.PI)) % 1 + 1) % 1 * NB; const j = Math.min(NB - 1, Math.floor(f)); f -= j; return S.r[j] * (1 - f) + S.r[j + 1] * f; };
/**
 * Below the chest, the gussets make Yuri far wider than the body. torsoMap's rings put
 * extra girth into the body's front-to-back depth, which magnifies every bump of the body
 * at this much flare; instead the cloth starts on a smooth cone: the chest section (plus a
 * gap) scaled up to the garment's girth at each height, never inside the body and never
 * narrowing downwards. torsoMap still places everything from the chest up (blended over 12 cm).
 */
function flare(F, T, { side, xSign, girth, armholeY, gap = 2 }) {
  const S0 = F.sec(F.Yarm), n = NB / 2;
  const shape = {};
  for (const sx of [1, -1]) {   // half ring from the front (0) round side sx to the back: angles + arc fractions
    const ph = [], cum = [0];
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const a = sx * Math.PI * k / n, r = radius(S0, a) + gap, p = [r * Math.sin(a), r * Math.cos(a)];
      if (prev) cum.push(cum[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
      ph.push(a); prev = p;
    }
    shape[sx] = { ph, cum, half: cum[n] };
  }
  const half0 = 0.5 * (shape[1].half + shape[-1].half);
  const need = new Map();   // world height -> smallest scale that clears the body there and above
  const sReq = (Y) => {
    const k = Math.round(Y);
    if (!need.has(k)) {
      let s = 1;
      for (let y = Math.round(F.Yarm); y >= k; y--) {
        const S = F.sec(y);
        for (let j = 0; j < NB; j++) { const a = 2 * Math.PI * j / NB; s = Math.max(s, (S.r[j] + gap) / (radius(S0, a) + gap)); }
      }
      need.set(k, s);
    }
    return need.get(k);
  };
  const cone = (x, y, Y) => {
    const ax = Math.abs(x), sx = (x >= 0 ? 1 : -1) * xSign, G = Math.max(1, girth(y));
    const f = Math.max(0, Math.min(1, side > 0 ? ax / G : 1 - ax / G));
    const sc = Math.max(sReq(Y), G / half0), sh = shape[sx], a = f * sh.half;
    let k = 1;
    while (k < n && sh.cum[k] < a) k++;
    const t = (a - sh.cum[k - 1]) / ((sh.cum[k] - sh.cum[k - 1]) || 1), ph = sh.ph[k - 1] + (sh.ph[k] - sh.ph[k - 1]) * t;
    const r = sc * (radius(S0, ph) + gap);
    return [S0.xc + r * Math.sin(ph), Y, S0.zc + r * Math.cos(ph)];
  };
  return (x, y) => {
    const p = T(x, y), w = sm((armholeY - 3 - y) / 12);
    if (w <= 0) return p;
    const q = cone(x, y, p[1]);
    return [p[0] + w * (q[0] - p[0]), p[1], p[2] + w * (q[2] - p[2])];
  };
}

/**
 * Torso maps for Yuri's front and back (like tops.js brianTorso, which needs fronts cut on
 * the fold): the garment's girth at each height includes the gusset sewn between front and
 * back, so the side seams start that far apart. Returns { front, frontOver (the left front, over the right one), back, gusset(mirror) }.
 */
function yuriTorso(F, front, back, share) {
  const sf = outlineSpan(pieceLoop(front)), sb = outlineSpan(pieceLoop(back, { fold: foldEdge(back) }));
  const side = (s, y) => { const r = s(Math.max(s.y0, Math.min(s.y1, y))); return r ? r[1] : 0; };
  const armholeY = Math.min(P(front.points.armhole)[1], P(back.points.armhole)[1]);
  const gArc = (y) => 2 * GUSSET * Math.max(0, armholeY - y);
  const girth = (y) => side(sf, y) + side(sb, y) + gArc(y);
  const line = (part) => {
    const e = pathEdges(part.paths.seam)[blockEdges(part, 1).shoulder], a = e[0], b = e[e.length - 1];
    const [n, s] = a[0] < b[0] ? [a, b] : [b, a];
    return { hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])), shoulderX: s[0], armholeX: P(part.points.armhole)[0] };
  };
  const Tf = flare(F, torsoMap(F, { side: 1, xSign: 1, ...line(front), girth, armholeY, gap: 1.5 }), { side: 1, xSign: 1, girth, armholeY });
  const Tb = flare(F, torsoMap(F, { side: -1, xSign: -1, ...line(back), girth, armholeY, gap: 1.5 }), { side: -1, xSign: -1, girth, armholeY });
  // the left front lies over the right one where they overlap (the right front reaches
  // -lo(y) past the centre front onto the left side)
  const lo = (y) => { const r = sf(Math.max(sf.y0, Math.min(sf.y1, y))); return r ? r[0] : 0; };
  const over = (x, y) => {
    const p = Tf(x, y), k = LAYER * (1 - sm((x + lo(y)) / 3));
    if (k <= 0) return p;
    const S = F.sec(p[1]), dx = p[0] - S.xc, dz = p[2] - S.zc, r = Math.hypot(dx, dz) || 1;
    return [p[0] + k * dx / r, p[1], p[2] + k * dz / r];
  };
  // buttoned: the tip of the left front starts at its button on the right front (on top of
  // it), and the cloth around the tip moves with it (fading out over ~10 cm of the piece), so
  // the drape does not have to drag the tip up through the right front
  const e5 = pathEdges(front.paths.seam)[diagonal(front)], tip = e5[e5.length - 1];
  const at = [-(e5[0][0] + share * (tip[0] - e5[0][0])), e5[0][1] + share * (tip[1] - e5[0][1])];
  const radial = (p, k) => {
    const S = F.sec(p[1]), dx = p[0] - S.xc, dz = p[2] - S.zc, r = Math.hypot(dx, dz) || 1;
    return [p[0] + k * dx / r, p[1], p[2] + k * dz / r];
  };
  const pt = over(tip[0], tip[1]), pa = radial(Tf(at[0], at[1]), 2.5);
  const D = [pa[0] - pt[0], pa[1] - pt[1], pa[2] - pt[2]];
  const buttoned = (x, y) => {
    const p = over(x, y), w = Math.exp(-((x - tip[0]) ** 2 + (y - tip[1]) ** 2) / (2 * 10 * 10));
    return w < 1e-3 ? p : radial([p[0] + w * D[0], p[1] + w * D[1], p[2] + w * D[2]], 1.5 * w);
  };
  // a gusset point at distance s from its armpit tip and angle th from its centre line lies
  // on the ring beyond the front's side seam, a share of the gusset's arc there
  const gusset = (mirror) => (x, y) => {
    const s = Math.hypot(x, y), th = Math.atan2(x, -y);
    const f = Math.max(0, Math.min(1, (mirror ? GUSSET - th : th + GUSSET) / (2 * GUSSET)));
    const yp = armholeY - s;
    return Tf((mirror ? -1 : 1) * (side(sf, yp) + f * gArc(yp)), yp);
  };
  return { front: Tf, frontOver: buttoned, back: Tb, gusset };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = yuriTorso(F, parts['yuri.front'], parts['yuri.back'], hoodShare(draft));
  const sleeves = brianSleeves(F, parts['yuri.sleeve'], { atCrease: true });
  return (ps, loop) => {
    if (ps.name === 'front_l') return T.frontOver;
    if (ps.name === 'front_r') return T.front;
    if (ps.name === 'back') return T.back;
    if (/^gusset/.test(ps.name)) return T.gusset(!!ps.mirror);
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror].map;
    if (/^hood_[lr]$/.test(ps.name)) {
      const seam = loop.edges.filter(e => e.id === '2' || e.id === '3').map(e => e.poly);
      return hoodSideMap(F, { sx: ps.mirror ? 1 : -1, anchor: edgeEnds(loop, 4)[0], seam, zSign: ps.mirror ? -1 : 1 });
    }
    if (ps.name === 'hood_center') {
      const [, cy, cz] = F.head.c;
      return (x) => [0, cy + 6, cz - 6 + 0.1 * x];
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
