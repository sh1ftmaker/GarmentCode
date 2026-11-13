// FreeSewing "Tina" faux wrap top (https://freesewing.eu/designs/tina/, MIT, design by
// Jonathan Haas): Toni with a crossover front. Each of the two front pieces covers its own
// side (side seam, armhole, shoulder) and crosses over the body along a diagonal neckline,
// its far end sewn into the lower part of the opposite side seam. With a long front
// (high front coverage) the overlap stops at a split and a single-layer front bottom (cut
// on the fold) is sewn below. Measurements from the mannequin, options as sliders, seam
// table and placement for the drape (the top as in toni.js).
//
// Three layers meet in the lower side seams (the back, the front's own side and the other
// front's crossover end) and, with the split, along the front bottom's top (both fronts):
// each is two seams sharing one stretch of edge, cut at the same length on every layer so
// their stitches line up (they are welded into one seam by the simulation).
//
// Not registered (pattern only): the two front layers are welded together where the
// crossover ends are sewn into the side seams, and the cloth self-collision exempts mesh
// neighbours (two rings) of shared vertices, so near those seams the layers slip through
// each other and the drape shows the under layer poking through the top one (70-200
// crossings between the fronts on the test bodies). garment.js keeps layers apart for
// pockets it detects itself (findOverlays -> g.layers), but not for pieces with their own
// placement; a pattern-level way to declare `front_r` as lying over `front_l` would fix it.
import { upperFrame, torsoMap, outlineSpan } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';
import { knitOptions, knitSeam, chain, half, toniBodyEdges, toniSleeves } from './toni.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'tina';
export const name = 'Tina wrap top';
export const short = 'Faux wrap top';
export const exportName = 'Tina';
export const url = 'https://freesewing.eu/designs/tina/';
export const author = 'Jonathan Haas';
export const settings = { expand: true };
export const icon = 'M18 6l6-1 4 9 4-9 6 1 12 9-5 9-6-4v31H17V20l-6 4-5-9zM24 5l15 46M32 5L17 51';
export const stretchNote = 'Tina is drafted for knit fabric: the diagonal neckline is cut a little short (front ease) and stretched when sewn. The 3D drape uses a relaxed copy without that (and without negative ease: the simulated cloth barely stretches); the pattern view, cutting layout and exports use the real pattern. The front crossing over from the wearer\'s right lies on top.';

export const design = {
  fit: {
    chestEase: { v: 5, range: [-10, 25], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your upper body' },
    waistEase: { v: 12, range: [-20, 40], type: 'float', name: 'Waist ease (%)', help: 'The amount of ease at your waist' },
    seatEase: { v: 8, range: [-20, 40], type: 'float', name: 'Seat ease (%)', help: 'The amount of ease at your seat' },
    frontEase: { v: -6, range: [-30, 0], type: 'float', name: 'Front ease (%)', help: 'Select a lower value to increase stretch along the diagonal seams by rotating the shorter side upwards. This can prevent gaping.' },
    bicepsEase: { v: 15, range: [-10, 30], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm. Note that while we try to respect this, fitting the sleeve to the armhole takes precedence over respecting the exact amount of ease.' },
  },
  style: {
    frontCoverage: { v: 25, range: [-75, 100], type: 'float', name: 'Front coverage (%)', help: 'Adjust the angle the wrap around part is cut. A lower value exposes more skin at the front.' },
    splitFrontPart: { v: true, type: 'bool', name: 'Allow splitting the front part', help: 'With high front coverage, it can make sense to split the front part into an overlapping piece at the top and a single layer part on the bottom to reduce bulk. Select if you want to allow this.' },
    lengthBelowWaist: { v: 75, range: [-15, 100], type: 'float', name: 'Length (%)', help: 'The length of the top, measured from the waist down' },
    sleeveLength: { v: 30, range: [10, 120], type: 'float', name: 'Sleeve length (%)', help: 'The length of the sleeve as a percentage of the distance from the shoulder to the wrist' },
    sleeveWidth: { v: 30, range: [-10, 200], type: 'float', name: 'Sleeve width (%)', help: 'The width of the sleeve opening' },
    armholeDepth: { v: 10, range: [0, 40], type: 'float', name: 'Armhole depth (%)', help: 'Controls the depth of the armhole. Higher values make a deeper armhole.' },
  },
};

export function options(d, opts = {}) {
  const o = knitOptions(d, opts);
  o.ribbingHeight = 0;   // no ribbing: the wrap's three-layer hem isn't modelled
  if (opts.relaxed) o.frontEase = 0;
  return o;
}
const MEASUREMENTS = ['head', 'biceps', 'chest', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope', 'waistToArmpit',
  'waistToSeat', 'seat', 'waist', 'shoulderToWrist', 'waistToUnderbust', 'wrist', 'waistBack', 'seatBack', 'highBust', 'bustFront',
  'hips', 'waistToHips', 'hpsToBust', 'bustSpan', 'hpsToWaistFront'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
const lens = (part) => pathEdges(part.paths.seam).map(p => (p ? polyLen(p) : 0));

/** Op boundaries of a chain (cumulative lengths) strictly inside [a, b], relative to a. */
function opBreaks(ids, L, a, b) {
  const out = [];
  let acc = 0;
  for (const i of ids) { acc += L[i]; if (acc > a + 1e-6 && acc < b - 1e-6) out.push(acc - a); }
  return out;
}
/**
 * Seam-table items for the stretch [a, b] (cumulative length along the chain of edges `ids`,
 * canonical direction), cut at a + each of `rel`: [piece, id, false, from, to].
 */
function range(piece, ids, L, a, b, rel = [], m = false) {
  const cuts = [...new Set([a, ...rel.map(r => a + r), b])].sort((x, y) => x - y);
  const out = [];
  let acc = 0;
  for (const i of ids) {
    const len = L[i], e0 = acc, e1 = acc + len;
    acc = e1;
    for (let k = 1; k < cuts.length; k++) {
      const lo = Math.max(cuts[k - 1], e0), hi = Math.min(cuts[k], e1);
      if (hi - lo > 1e-6) out.push([piece, m ? 'm' + i : String(i), false, (lo - e0) / len, (hi - e0) / len]);
    }
  }
  return out;
}
const reversed = (items) => [...items].reverse().map(([p, i, r, f, t]) => [p, i, !r, f, t]);

/** Tina's edges by FreeSewing path (see knitSeam). */
function tinaEdges(draft) {
  const parts = draft.parts[0], front = parts['tina.front'], bottom = parts['tina.frontBottom'];
  const split = !!bottom && !bottom.hidden && !!front.paths.topSplit;
  const store = draft.setStores[0];
  const upper = (store.get('upperPathsFront') || []).map(u => u.p).filter(p => p !== 'frontCollar');
  const dart = !!front.paths.dart;
  let names;
  if (split) names = ['upperSide', ...(dart ? ['dart', 'sideSeam2'] : []), ...upper, 'tinaDiagonalSeam', 'mirroredUpperSide', 'topSplit'];
  else names = ['easeHemBase', ...(dart ? ['sideSeam1', 'dart', 'sideSeam2'] : ['sideSeam']), ...upper, 'tinaDiagonalSeam', ...(front.paths.easeMirroredSide ? ['easeMirroredSide'] : [])];
  const E = knitSeam(front, names);
  const F = {
    side: split ? [...E.upperSide, ...(E.sideSeam2 || [])] : dart ? [...E.sideSeam1, ...E.sideSeam2] : E.sideSeam,
    dart: E.dart || null, armhole: E.armhole, shoulder: E.shoulder,
    cross: split ? E.mirroredUpperSide : E.easeMirroredSide || [], top: split ? E.topSplit : [],
    L: lens(front),
  };
  let Bt = null;
  if (split) {
    const Eb = knitSeam(bottom, ['hemBaseHalf', 'lowerSide', 'bottomTop', 'bottomCenter']);
    Bt = { side: Eb.lowerSide, top: Eb.bottomTop, center: Eb.bottomCenter[0], L: lens(bottom) };
  }
  const B = toniBodyEdges(draft, parts['tina.back'], false);
  B.L = lens(parts['tina.back']);
  return { split, F, Bt, B };
}

/*
 * Edges (by FreeSewing path): front (cut twice, not on the fold): its own side seam, armhole,
 *   shoulder, the diagonal neckline, the crossover end (down the opposite side seam) and,
 *   with the split, the split line (opposite side -> own side); front bottom (on the fold):
 *   lower side, top, centre; back as Toni's.
 * front_l (unmirrored) has its own side on the wearer's left and crosses to the right,
 *   under front_r (mirrored), which crosses to the left.
 */
export function spec(o, draft) {
  const { split, F, Bt, B } = tinaEdges(draft);
  const sum = (L, ids) => ids.reduce((s, i) => s + L[i], 0);
  const Lc = sum(F.L, F.cross), Llow = split ? sum(Bt.L, Bt.side) : 0;
  const seams = [];
  for (const s of [1, -1]) {
    const own = s > 0 ? 'front_l' : 'front_r', other = s > 0 ? 'front_r' : 'front_l';
    const bm = s > 0, sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    // side seam (hem -> armhole): the front bottom's side (split), then the stretch where
    // three layers meet (own side + the other front's crossover end), then the own side
    const LB = sum(B.L, B.side), LF = sum(F.L, F.side);
    if (split) seams.push({ a: range('back', B.side, B.L, 0, Llow, [], bm), b: chain('front_bottom', half(Bt.side, s < 0)) });
    if (Lc > 0) {
      // the same cuts on all three, so the two seams' stitches line up
      const crossBreaks = opBreaks(F.cross, F.L, 0, Lc).map(u => Lc - u);
      const rel = [...opBreaks(B.side, B.L, Llow, Llow + Lc), ...opBreaks(F.side, F.L, 0, Lc), ...crossBreaks];
      const seg = range('back', B.side, B.L, Llow, Llow + Lc, rel, bm);
      seams.push({ a: seg, b: range(own, F.side, F.L, 0, Lc, rel) });
      seams.push({ a: seg, b: reversed(range(other, F.cross, F.L, 0, Lc, rel.map(u => Lc - u))) });
    }
    seams.push({ a: range('back', B.side, B.L, Llow + Lc, LB, [], bm), b: range(own, F.side, F.L, Lc, LF) });
    seams.push({ a: chain(own, F.shoulder), b: chain('back', half(B.shoulder, bm)) });
    if (F.dart) seams.push({ a: [[own, F.dart[0]]], b: [[own, F.dart[1], true]] });
    seams.push(
      { a: [...chain(own, F.armhole), ...chain('back', half(B.armhole, bm), true)], b: chain(sl, [4, 5, 6, 7, 8]) },
      { a: [[sl, 0]], b: [[sl, 3, true]] },
    );
  }
  if (split) {
    // the split line: front_l's runs from the right side to the left, front_r's (mirrored) the other way
    const fb = [...chain('front_bottom', half(Bt.top, true)), ...chain('front_bottom', half(Bt.top, false), true)];
    seams.push({ a: chain('front_l', F.top), b: fb }, { a: chain('front_r', F.top), b: reversed(fb.map(([p, i, r]) => [p, i, r, 0, 1])) });
  }
  const pieces = [
    { name: 'back', part: 'tina.back', fold: B.center, label: 'body' },
    { name: 'front_l', part: 'tina.front', label: 'body' },
    { name: 'front_r', part: 'tina.front', mirror: true, label: 'body' },
  ];
  if (split) pieces.push({ name: 'front_bottom', part: 'tina.frontBottom', fold: Bt.center, label: 'body' });
  pieces.push(
    { name: 'sleeve_l', part: 'toni.sleeve', mirror: true, label: 'arm', follow: 12 },
    { name: 'sleeve_r', part: 'toni.sleeve', label: 'arm', follow: 12 },
  );
  return { pieces, seams, labels: {} };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const { split, F: Ef, Bt } = tinaEdges(draft);
  const front = parts['tina.front'], back = parts['tina.back'], bottom = parts['tina.frontBottom'];
  const Eb = toniBodyEdges(draft, back, false);
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const sf = outlineSpan(pieceLoop(front)), sb = outlineSpan(pieceLoop(back, { fold: Eb.center }));
  const sbt = split ? outlineSpan(pieceLoop(bottom, { fold: Bt.center })) : null;
  const halfOf = (s, y) => { const r = s && s(y); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  // no lower than the bottom of the side seams (see toni.js knitTorso)
  const sideBottomY = pathEdges(back.paths.seam)[Eb.side[0]][0][1];
  const girth = (y) => { const yy = Math.max(y, sideBottomY); return Math.max(halfOf(sbt, yy), (sf(yy) || [0, 0])[1]) + halfOf(sb, yy); };
  const fp = front.points, bp = back.points;
  const armholeY = Math.min(P(fp.armhole)[1], P(bp.armhole)[1]);
  const line = (part, edge) => {
    const e = pathEdges(part.paths.seam)[edge], a = e[0], b = e[e.length - 1];
    const [n, s] = a[0] < b[0] ? [a, b] : [b, a];
    return { hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])), shoulderX: s[0], armholeX: P(part.points.armhole)[0] };
  };
  const lf = line(front, Ef.shoulder[0]), lb = line(back, Eb.shoulder[0]);
  // the two fronts in layers: front_r on top
  const under = torsoMap(F, { side: 1, xSign: 1, ...lf, girth, armholeY, gap: 1.5 });
  // the top layer: the same surface, lifted off the one below by up to `lift` over the
  // front, fading out towards the side seams (where both layers are sewn to the back)
  const liftMax = 3;
  const over = (x, y) => {
    const p = under(x, y), G = Math.max(1, girth(y)), t = Math.min(1, Math.abs(x) / Math.max(1, G - 8));
    const d = liftMax * (1 - t * t * (3 - 2 * t));
    const S = F.sec(p[1]), dx = p[0] - S.xc, dz = p[2] - S.zc, r = Math.hypot(dx, dz) || 1;
    return [p[0] + d * dx / r, p[1], p[2] + d * dz / r];
  };
  const backMap = torsoMap(F, { side: -1, xSign: -1, ...lb, girth, armholeY, gap: 1.5 });
  const sleeves = toniSleeves(F, parts['toni.sleeve']);
  return (ps) => {
    if (ps.name === 'back') return backMap;
    if (ps.name === 'front_l' || ps.name === 'front_bottom') return under;
    if (ps.name === 'front_r') return over;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror].map;
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
