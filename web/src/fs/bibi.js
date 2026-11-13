// FreeSewing "Bibi" body block / top (https://freesewing.eu/designs/bibi/, MIT, design by
// Jonathan Haas): a fitted knit top (or dress, down to the floor) with set-in sleeves or
// straps, an optional bust dart, knit bindings at the neckline (and armholes when
// sleeveless) and optional ribbing at the hem and cuffs. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso and arms for the drape.
//
// Bibi draws its front and back as separate named paths (hem, side seam, armhole,
// shoulder, neckline, centre line), not one `seam` path: knitSeam() (toni.js) chains them.
import { PART } from '../body.js';
import { upperFrame, bandRingMap, bandOnEdge, edgeEnds } from './place.js';
import { treeOptions } from './tops.js';
import { pieceLoop } from './convert.js';
import { fsMeasurements, pick } from './measure.js';
import { knitSeam, chain, half, toniSleeves, knitTorso, seamEnds, chainEnds } from './toni.js';

export const id = 'bibi';
export const name = 'Bibi body block';
export const short = 'Body block';
export const exportName = 'Bibi';
export const url = 'https://freesewing.eu/designs/bibi/';
export const author = 'Jonathan Haas';
export const settings = { expand: true };   // draft the bindings and ribbing too
export const icon = 'M19 6l5-1c1 3 7 3 8 0l5 1 9 7-4 8-5-3v34H19V18l-5 3-4-8z';
export const stretchNote = 'Bibi is drafted for knit fabric, close to the body. The 3D drape uses a relaxed copy: ribbing cut to the length of the edge it is sewn to (not shorter and stretched), and no negative ease (the simulated cloth barely stretches). The knit bindings at the neckline and armholes are cut but not simulated. The pattern view, cutting layout and exports use the real pattern.';

const SELECTS = new Set(['length']);
export const design = {
  fit: {
    chestEase: { v: 2, range: [-5, 25], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    waistEase: { v: 5, range: [-10, 20], type: 'float', name: 'Waist ease (%)', help: 'Ease at the waist (only applies when the waist is fitted).' },
    hipsEase: { v: 5, range: [-5, 50], type: 'float', name: 'Hips ease (%)', help: 'Ease at the hips.' },
    bicepsEase: { v: 5, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm. Note that while we try to respect this, fitting the sleeve to the armhole takes precedence over respecting the exact amount of ease.' },
    ribbingStretch: { v: 15, range: [0, 30], type: 'float', name: 'Ribbing stretch (%)', help: 'Use this to adapt the pattern to how stretchy the ribbing that you are using is.' },
  },
  style: {
    length: { v: 'seat', range: ['underbust', 'waist', 'hips', 'seat', 'knee', 'floor'], type: 'select', fs: 'list', name: 'Length', labels: { underbust: 'Underbust', waist: 'Waist', hips: 'Hips', seat: 'Seat', knee: 'Knee', floor: 'Floor' }, help: 'Which measurement line to use for the bottom hem. You can do fine adjustments using the bonus length option.' },
    lengthBonus: { v: 0, range: [-30, 30], type: 'float', name: 'Length bonus (%)', help: 'The amount to lengthen the garment. A negative value will shorten it.' },
    flare: { v: 0, range: [0, 150], type: 'float', name: 'Flare (%)', help: 'How much fabric to use at the bottom hem of the design. Only applies when the design goes below the waist.' },
    sleeves: { v: true, type: 'bool', name: 'Sleeves', help: 'Draft the pattern with sleeves' },
    sleeveLength: { v: 20, range: [-20, 110], type: 'float', name: 'Sleeve length (%)', help: 'Controls the length of your sleeves' },
    necklineDepth: { v: 25, range: [20, 110], type: 'float', name: 'Front neckline depth (%)', help: 'Controls how deep the neck opening plunges down at the front.' },
    useWaistRibbing: { v: false, type: 'bool', name: 'Waistband ribbing', help: 'Include ribbing on the waistband' },
    useCuffRibbing: { v: false, type: 'bool', name: 'Cuff ribbing', help: 'Include ribbing on the sleeve' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d, SELECTS);
  if (relaxed) {
    o.ribbingStretch = 0;
    for (const k of ['chestEase', 'waistEase', 'hipsEase']) o[k] = Math.max(0, o[k]);
  }
  return o;
}
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope', 'waistToArmpit',
  'waistToHips', 'shoulderToWrist', 'wrist', 'hips', 'waist', 'seat', 'seatBack', 'waistToSeat', 'hpsToWaistFront',
  'highBust', 'bustSpan', 'waistToUnderbust', 'waistToKnee', 'waistToFloor'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/** Edges of Bibi's front or back by FreeSewing path (see knitSeam). */
function bodyEdges(part, front) {
  const side = part.paths.dart ? ['sideSeam1', 'dart', 'sideSeam2'] : ['sideSeam'];
  const E = knitSeam(part, ['hem', ...side, 'armhole', 'shoulder', front ? 'frontNeck' : 'backNeck', 'centerLine']);
  return {
    hem: E.hem, side: part.paths.dart ? [...E.sideSeam1, ...E.sideSeam2] : E.sideSeam, dart: E.dart || null,
    armhole: E.armhole, shoulder: E.shoulder, center: E.centerLine[0],
  };
}
const shown = (part) => !!part && !part.hidden && !!part.paths.seam;

/*
 * Edges: front / back cut on the fold (centre line): hem (centre -> side), side seam (up,
 *   the front's around its dart), armhole (side -> shoulder), shoulder (-> neck), neckline.
 * sleeve: 0 underarm at -x (down), 1 hem (-x -> +x), 2 underarm at +x (up), 3-7 cap from
 *   the front (+x) to the back (-x).
 * waistband / cuff (ribbing): 2h x length, folded lengthwise (the drape uses one layer):
 *   2 the long edge sewn on (along y), 1 and 3 the ends, sewn into a ring.
 * The front's local +x and the back's mirrored half are the wearer's left; the unmirrored
 * sleeve (front at +x) is the wearer's right sleeve.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  const F = bodyEdges(parts['bibi.front'], true), B = bodyEdges(parts['bibi.back'], false);
  const sleeves = shown(parts['bibi.sleeve']), cuffs = sleeves && shown(parts['bibi.cuff']), band = shown(parts['bibi.waistband']);
  const seams = [];
  for (const s of [1, -1]) {
    const fm = s < 0, bm = s > 0;
    const sl = s > 0 ? 'sleeve_l' : 'sleeve_r', cf = s > 0 ? 'cuff_l' : 'cuff_r';
    seams.push(
      { a: chain('front', half(F.side, fm)), b: chain('back', half(B.side, bm)) },
      { a: chain('front', half(F.shoulder, fm)), b: chain('back', half(B.shoulder, bm)) },
    );
    if (F.dart) seams.push({ a: [['front', half(F.dart, fm)[0]]], b: [['front', half(F.dart, fm)[1], true]] });
    if (sleeves) {
      seams.push(
        { a: [...chain('front', half(F.armhole, fm)), ...chain('back', half(B.armhole, bm), true)], b: chain(sl, [3, 4, 5, 6, 7]) },
        { a: [[sl, 0]], b: [[sl, 2, true]] },
      );
      if (cuffs) seams.push({ a: [[sl, 1]], b: [[cf, 2]] }, { a: [[cf, 1]], b: [[cf, 3, true]] });
    }
  }
  if (band) seams.push(
    { a: [...chain('back', half(B.hem, true), true), ...chain('back', half(B.hem, false)), ...chain('front', half(F.hem, true), true), ...chain('front', half(F.hem, false))],
      b: [['waistband', 2]] },
    { a: [['waistband', 1]], b: [['waistband', 3, true]] },
  );
  const pieces = [
    { name: 'front', part: 'bibi.front', fold: F.center, label: 'body' },
    { name: 'back', part: 'bibi.back', fold: B.center, label: 'body' },
  ];
  if (sleeves) pieces.push(
    { name: 'sleeve_l', part: 'bibi.sleeve', mirror: true, label: 'arm', follow: 12 },
    { name: 'sleeve_r', part: 'bibi.sleeve', label: 'arm', follow: 12 },
  );
  if (band) pieces.push({ name: 'waistband', part: 'bibi.waistband', label: 'body', doubled: 'x', follow: 6 });
  if (cuffs) pieces.push(
    { name: 'cuff_l', part: 'bibi.cuff', mirror: true, label: 'arm', doubled: 'x', follow: 6 },
    { name: 'cuff_r', part: 'bibi.cuff', label: 'arm', doubled: 'x', follow: 6 },
  );
  // knit bindings wrapped around the raw edges: cut, not simulated
  if (shown(parts['bibi.neckBinding'])) pieces.push({ name: 'neck_binding', part: 'bibi.neckBinding', cutOnly: true });
  if (shown(parts['bibi.armholeBinding'])) pieces.push(
    { name: 'armhole_binding_l', part: 'bibi.armholeBinding', cutOnly: true },
    { name: 'armhole_binding_r', part: 'bibi.armholeBinding', cutOnly: true },
  );
  return { pieces, seams, labels: {} };
}

/**
 * Below the crotch (knee- and floor-length Bibi) the torso guide only knows the hips: push
 * points out of the legs too, radially from the section centre, past the outline of both
 * legs together (the skirt hangs around them as one tube).
 */
function legClearance(F, body, gap = 2) {
  const { pos, part } = body, NB = 72;
  const top = Math.ceil(F.Ycrotch + 6), rows = new Map();
  for (let v = 0; v < part.length; v++) {
    const y = pos[3 * v + 1];
    if (y > top) continue;
    const p = part[v];
    if (p !== PART.BODY && p !== PART.L_LEG && p !== PART.R_LEG) continue;
    const k = Math.round(y);
    let R = rows.get(k);
    if (!R) { R = new Float32Array(NB); rows.set(k, R); }
    const S = F.sec(k), dx = pos[3 * v] - S.xc, dz = pos[3 * v + 2] - S.zc;
    const b = Math.floor(((Math.atan2(dx, dz) / (2 * Math.PI)) + 1) % 1 * NB);
    R[b] = Math.max(R[b], Math.hypot(dx, dz));
  }
  const rad = new Map();
  for (const [k, R] of rows) {   // widen each direction by its neighbours (a rough hull)
    const Q = new Float32Array(NB);
    for (let b = 0; b < NB; b++) for (let j = -3; j <= 3; j++) Q[b] = Math.max(Q[b], R[(b + j + NB) % NB] * Math.cos(j * 2 * Math.PI / NB));
    rad.set(k, Q);
  }
  return (map) => (x, y) => {
    const p = map(x, y);
    if (p[1] > top) return p;
    let Q = null;
    for (const k of [Math.round(p[1]), Math.round(p[1]) - 1, Math.round(p[1]) + 1]) if ((Q = rad.get(k) || null)) break;
    if (!Q) return p;
    const S = F.sec(p[1]), dx = p[0] - S.xc, dz = p[2] - S.zc, r = Math.hypot(dx, dz);
    const b = Math.floor(((Math.atan2(dx, dz) / (2 * Math.PI)) + 1) % 1 * NB), lim = Q[b] + gap;
    if (r >= lim || r < 1e-6) return p;
    const w = Math.min(1, (top - p[1]) / 6);   // fade in below the crotch
    const s = 1 + w * (lim / r - 1);
    return [S.xc + dx * s, p[1], S.zc + dz * s];
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const front = parts['bibi.front'], back = parts['bibi.back'];
  const Ef = bodyEdges(front, true), Eb = bodyEdges(back, false);
  const sleeved = shown(parts['bibi.sleeve']);
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const T = knitTorso(F, {
    loops: { front: pieceLoop(front, { fold: Ef.center }), back: pieceLoop(back, { fold: Eb.center }) },
    sideBottomY: Math.max(chainEnds(front, Ef.side)[0][1], chainEnds(back, Eb.side)[0][1]),
    armholeY: Math.min(P(front.points.armhole)[1], P(back.points.armhole)[1]),
    shoulder: { front: seamEnds(front, Ef.shoulder[0]), back: seamEnds(back, Eb.shoulder[0]) },
    armholeX: sleeved ? { front: P(front.points.armhole)[0], back: P(back.points.armhole)[0] } : null,
  });
  const clear = legClearance(F, body);
  T.front = clear(T.front); T.back = clear(T.back);
  const sleeves = sleeved ? toniSleeves(F, parts['bibi.sleeve']) : null;
  const hemY = T.front(0, -front.points.cfHem.y / 10)[1];
  return (ps, loop) => {
    if (ps.name === 'front') return T.front;
    if (ps.name === 'back') return T.back;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror].map;
    if (ps.name === 'waistband') {
      const [a, b] = edgeEnds(loop, 2), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ring = bandRingMap(F, { Y: hemY, len, phi0: Math.PI / 2, dir: 1 });
      return (x, y) => ring(-y, x);
    }
    if (/^cuff/.test(ps.name)) {
      const S = sleeves[!!ps.mirror];
      return bandOnEdge(S.map, edgeEnds(S.loop, 1), edgeEnds(loop, 2));
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
