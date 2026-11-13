// FreeSewing "Simon" button-down shirt (https://freesewing.eu/designs/simon/, MIT, design
// by Joost De Cock): a Brian-based shirt with a back yoke, set-in sleeves, cut-on plackets,
// collar stand, collar and cuffs. Measurements from the mannequin, options as sliders,
// seam table and placement around the torso and arms for the drape.
//
// The drape shows the shirt buttoned: one layer as seen from outside. The plackets are cut
// on and folded under, and the right front lies under the buttonhole placket of the left
// front. The drape copy of each front therefore ends where the closed shirt shows it end:
// the left front at the folded edge of its buttonhole placket, the right front where it
// disappears under that edge, and the two are sewn there (the folded-under layers and the
// hidden strip of the right front are cut, not simulated).
import { upperFrame } from './place.js';
import { brianTorso, brianSleeves, treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'simon';
export const name = 'Simon shirt';
export const short = 'Button-down shirt';
export const exportName = 'Simon';
export const url = 'https://freesewing.eu/designs/simon/';
export const author = 'Joost De Cock';
export const icon = 'M18 6l6-2 4 6 4-6 6 2 10 9 4 33-6 1-5-27v30H18V21l-5 27-6-1 4-33zM28 10v40';
export const stretchNote = 'The 3D drape shows the shirt buttoned, as one layer seen from outside: the cut-on plackets are folded under and the right front disappears under the buttonhole placket, so those hidden layers are cut but not simulated. The collar, collar stand, cuffs and sleeve plackets are cut, not draped. The pattern view, cutting layout and exports use the full pattern.';

const SELECTS = new Set(['hemStyle', 'sleeveStyle']);
export const design = {
  fit: {
    chestEase: { v: 15, range: [-4, 35], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    waistEase: { v: 15, range: [10, 35], type: 'float', name: 'Waist ease (%)', help: 'The amount of ease at your (natural) waist.' },
    hipsEase: { v: 15, range: [10, 35], type: 'float', name: 'Hips ease (%)', help: 'The amount of ease at the hips.' },
    bicepsEase: { v: 15, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    shoulderEase: { v: 2, range: [0, 15], type: 'float', name: 'Shoulder ease (%)', help: 'Widens the shoulders, e.g. to wear layers underneath.' },
  },
  style: {
    lengthBonus: { v: 25, range: [-4, 60], type: 'float', name: 'Length bonus (%)', help: 'Lengthens (or shortens) the body.' },
    hemStyle: { v: 'straight', range: ['straight', 'baseball', 'slashed'], type: 'select', name: 'Hem style', labels: { straight: 'Straight hem', baseball: 'Baseball hem', slashed: 'Slashed hem' }, help: 'The style of the shirt hem.' },
    hemCurve: { v: 50, range: [25, 100], type: 'float', name: 'Hem curve (%)', help: 'The height of the curve on a curved hem.' },
    sleeveStyle: { v: 'long', range: ['short', 'long'], type: 'select', name: 'Sleeve style', labels: { short: 'Short sleeves', long: 'Long sleeves' }, help: 'Long sleeves with cuffs, or short sleeves.' },
    sleeveLengthBonus: { v: 3.5, range: [-40, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens (or shortens) the sleeves.' },
    yokeHeight: { v: 70, range: [40, 90], type: 'float', name: 'Yoke height (%)', help: 'Height of the back yoke.' },
    buttonholePlacketWidth: { v: 8, range: [4, 12], type: 'float', name: 'Buttonhole placket width (%)', help: 'Width of the buttonhole placket.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d, SELECTS);
  // marks the drape copy for spec() (not enumerable: FreeSewing never sees it)
  if (relaxed) Object.defineProperty(o, 'drape', { value: true, enumerable: false });
  return o;
}
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'waist', 'hips', 'shoulderToWrist', 'wrist', 'highBust'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

// ------------------------------------------------------------------ outlines
const near = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
const cubicAt = (a, b, c, d, t) => {
  const s = 1 - t;
  return { x: s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t * t * t * d.x, y: s * s * s * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t * t * t * d.y };
};
const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
/** The part of cubic a-b-c-d from its start to where it crosses x = X: [cp1, cp2, end]. */
function cubicToX(a, b, c, d, X) {
  let lo = 0, hi = 1;
  const f = (t) => cubicAt(a, b, c, d, t).x - X;
  const s0 = Math.sign(f(0));
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (Math.sign(f(m)) === s0) lo = m; else hi = m; }
  const t = (lo + hi) / 2;
  const ab = lerp(a, b, t), bc = lerp(b, c, t), cd = lerp(c, d, t), abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t);
  return [ab, abc, lerp(abc, bcd, t)];
}


/**
 * The fronts as the buttoned shirt shows them (FreeSewing mm, y down; both fronts share
 * Brian's centre front at x = 0, the left front's side at +x, the right front's at -x):
 * the left front ends at the folded edge of its seamless buttonhole placket (x = -w/2), the
 * right front where it goes under that edge (the same line). Operation numbers up to the
 * neckline stay as drafted (see spec()).
 */
function finishedFronts(parts) {
  const L = parts['simon.frontLeft'], R = parts['simon.frontRight'];
  const X = L.points.placketTopFold1.x;   // the folded edge of the buttonhole placket
  const top = L.points.cfNeck.y, hem = L.points.cfHem.y;
  const lops = L.paths.seam.ops.slice();
  // ... collar -> cfNeck, then out along the neckline to the folded edge, down it, and back along the hem
  const k = lops.findIndex(op => op.type === 'line' && near(op.to, L.points.placketTopEdge));
  lops.splice(k, lops.length - k, { type: 'line', to: { x: X, y: top } }, { type: 'line', to: { x: X, y: hem } }, { type: 'close' });
  const rops = R.paths.seam.ops.slice();
  rops[0] = { type: 'move', to: { x: X, y: R.points.cfHem.y } };
  const kc = rops.findIndex(op => op.type === 'curve' && near(op.to, R.points.cfNeck));
  let cur = null;
  for (let i = 0; i < kc; i++) if (rops[i].to) cur = rops[i].to;
  const c = rops[kc], [cp1, cp2, to] = cubicToX(cur, c.cp1, c.cp2, c.to, X);
  rops.splice(kc, rops.length - kc, { type: 'curve', cp1, cp2, to }, { type: 'line', to: { x: X, y: R.points.cfHem.y } }, { type: 'close' });
  return { L: lops, R: rops };
}

/** A short sleeve as finished: its hem turned up (the outline ends at the hem fold line). */
function finishedShortSleeve(part) {
  const p = part.points;
  return [
    { type: 'move', to: p.wristRight }, { type: 'line', to: p.bicepsRight },
    ...part.paths.seam.ops.filter(op => op.type === 'curve'),   // the cap, back -> front
    { type: 'line', to: p.wristLeft }, { type: 'line', to: p.wristRight }, { type: 'close' },
  ];
}

// ------------------------------------------------------------------ seams
/*
 * Edges (seam path operations), h = 0 for a straight hem, 1 for a baseball or slashed hem
 * (drawn in two operations):
 *  front_l / front_r: 0..h hem (centre -> side), 1+h..3+h side seam (up), 4+h..6+h armhole
 *    (side -> shoulder), 7+h shoulder seam (-> neck), 8+h neckline (-> centre front); in the
 *    drape copy then the closure: front_l 9+h out to the placket's folded edge, 10+h down
 *    it; front_r 9+h down the line under that edge
 *  back (cut on the fold, 8+h = centre back): 0..h hem, 1+h..3+h side seam (up), 4+h..6+h
 *    armhole (side -> yoke), 7+h yoke seam (-> centre back)
 *  yoke (drawn whole, in the back's coordinates: local +x = the wearer's right): 0 yoke seam
 *    (centre -> right), 1 armhole (up), 2 shoulder (-> neck), 3-4 back neck (right -> left),
 *    5 shoulder (neck -> left), 6 armhole (down), 7 yoke seam (left -> centre)
 *  sleeve: 0 back underarm (up), 1-5 cap (back -> front), 6 front underarm (down), 7.. wrist
 *    (the drape copy of a short sleeve is drawn the same way, see finishedShortSleeve)
 * The left front's local +x, the back's mirrored half ('m'), the yoke's -x half and the
 * unmirrored sleeve are the wearer's left.
 */
export function spec(o) {
  const h = o.hemStyle === 'straight' ? 0 : 1;
  const r = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const side = r(1 + h, 3 + h), armhole = r(4 + h, 6 + h), shoulder = 7 + h, yokeSeam = 7 + h;
  const seams = [];
  for (const s of [1, -1]) {
    const fr = s > 0 ? 'front_l' : 'front_r', sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    const b = (k) => (s > 0 ? 'm' + k : String(k));
    seams.push(
      { a: side.map(k => [fr, k]), b: side.map(k => ['back', b(k)]) },                              // side seam
      { a: [[fr, shoulder]], b: [s > 0 ? ['yoke', 5, true] : ['yoke', 2]] },                         // shoulder seam
      { a: [['back', b(yokeSeam)]], b: [s > 0 ? ['yoke', 7] : ['yoke', 0, true]] },                   // yoke seam
      { a: [...armhole.map(k => ['back', b(k)]), s > 0 ? ['yoke', 6, true] : ['yoke', 1], ...armhole.slice().reverse().map(k => [fr, k, true])],
        b: [1, 2, 3, 4, 5].map(k => [sl, k]) },                                                       // armhole
      { a: [[sl, 0]], b: [[sl, 6, true]] },                                                          // underarm
    );
  }
  // the buttoned closure (drape copy only: the drafted fronts end elsewhere)
  if (o.drape) seams.push({ a: [['front_l', 10 + h]], b: [['front_r', 9 + h]] });
  const long = o.sleeveStyle !== 'short';
  return {
    pieces: [
      { name: 'front_l', part: 'simon.frontLeft', label: 'body' },
      { name: 'front_r', part: 'simon.frontRight', label: 'body' },
      { name: 'back', part: 'simon.back', fold: 8 + h, label: 'body' },
      // FreeSewing cuts two yokes (outer and inner); the drape uses one
      { name: 'yoke', part: 'simon.yoke', label: 'body', lining: true },
      { name: 'sleeve_l', part: 'simon.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'simon.sleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'collar_stand', part: 'simon.collarStand', cutOnly: true, lining: true },
      { name: 'collar', part: 'simon.collar', cutOnly: true, lining: true },   // collar + undercollar
      ...(long ? [
        { name: 'cuff_l', part: 'simon.cuff', cutOnly: true, lining: true },
        { name: 'cuff_r', part: 'simon.cuff', mirror: true, cutOnly: true, lining: true },
        { name: 'sleeve_placket_overlap_l', part: 'simon.sleevePlacketOverlap', cutOnly: true },
        { name: 'sleeve_placket_overlap_r', part: 'simon.sleevePlacketOverlap', mirror: true, cutOnly: true },
        { name: 'sleeve_placket_underlap_l', part: 'simon.sleevePlacketUnderlap', cutOnly: true },
        { name: 'sleeve_placket_underlap_r', part: 'simon.sleevePlacketUnderlap', mirror: true, cutOnly: true },
      ] : []),
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  // the drape copy as the finished shirt shows it (called for the drape only, before conversion)
  const fin = finishedFronts(parts);
  parts['simon.frontLeft'].paths.seam.ops = fin.L;
  parts['simon.frontRight'].paths.seam.ops = fin.R;
  if (parts['simon.sleeve'].points.foldShortLeft) parts['simon.sleeve'].paths.seam.ops = finishedShortSleeve(parts['simon.sleeve']);
  const F = upperFrame(body, m);
  // the torso from Brian's (symmetric) front and the back below the yoke; the yoke is drawn
  // in the back's coordinates and continues the back over the shoulders
  const T = brianTorso(F, parts['simon.front'], parts['simon.back'], { setIn: true });
  const sleeves = brianSleeves(F, parts['simon.sleeve'], { atCrease: true });
  return (ps) => {
    if (/^front/.test(ps.name)) return T.front;
    if (ps.name === 'back' || ps.name === 'yoke') return T.back;
    if (/^sleeve_[lr]$/.test(ps.name)) return sleeves[!!ps.mirror].map;
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
