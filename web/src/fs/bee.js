// FreeSewing "Bee" bikini top (https://freesewing.eu/designs/bee/, MIT, design by
// PrudenceRabbit): two lined triangle cups drafted on Bella's block, a band tie running
// through a casing along the bottom of the cups and tied at the back, and a tie from the top
// of each cup tied behind the neck. Measurements from the mannequin, options as sliders,
// seam table and placement of the cups and ties for the drape.
//
// Bee's cups are drawn in the coordinates of Bella's front (the centre front at x = 0), so
// they are laid around the torso with Bella's front map (bella.js bodiceTorso). The ties are
// what holds a triangle top on, so they are draped too (one layer of the strip folded
// lengthwise): the band tie is sewn along the cups' casings from its middle at the centre
// front and its two halves are joined where they meet at the back (the knot, for a snug band:
// the underbust girth), the rest hanging as tails; each neck tie is sewn to the top of its
// cup and the two are joined at the back of the neck, likewise.
import { upperFrame, bandRingMap } from './place.js';
import { pathEdges } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';
import { bodiceTorso } from './bella.js';

export const id = 'bee';
export const name = 'Bee bikini top';
export const short = 'Bikini top';
export const exportName = 'Bee';
export const url = 'https://freesewing.eu/designs/bee/';
export const author = 'PrudenceRabbit';
export const icon = 'M27 30C22 22 16 14 14 6l-2 1c2 8 5 16 9 23-6 2-10 7-11 14h17zm2 0c5-8 11-16 13-24l2 1c-2 8-5 16-9 23 6 2 10 7 11 14H29z';
export const stretchNote = 'Bee is made in swimwear fabric, the bottom of each cup gathered on the band tie. The 3D drape sews the cups (one layer: the lining is cut, not simulated) flat along the band tie, without gathers, and ties the band at the back (underbust girth) and the neck ties behind the neck, the rest of each tie hanging.';

export const design = {
  fit: {
    chestEase: { v: 11, range: [5, 20], type: 'float', name: 'Chest ease (%)', help: 'Controls the chest ease in the underlying Bella block Bee is based on.' },
    bustSpanEase: { v: 10, range: [0, 20], type: 'float', name: 'Bust span ease (%)', help: 'Controls the bust span ease in the underlying Bella block Bee is based on.' },
    topDepth: { v: 54, range: [50, 80], type: 'float', name: 'Top depth (%)', help: 'Controls how far the bikini cup extends upwards.' },
    bottomCupDepth: { v: 8, range: [0, 20], type: 'float', name: 'Bottom depth (%)', help: 'Controls how far the bikini cup extends downwards.' },
    sideDepth: { v: 20.6, range: [0, 30], type: 'float', name: 'Side depth (%)', help: 'Controls how far the bikini cup extends towards the side.' },
    sideCurve: { v: 0, range: [-50, 50], type: 'float', name: 'Side curve (%)', help: 'Controls the curvature of the side of the bikini cup.' },
    frontCurve: { v: 0, range: [-50, 50], type: 'float', name: 'Front curve (%)', help: 'Controls the curvature of the front of the bikini cup.' },
  },
  style: {
    neckTieLength: { v: 80, range: [70, 100], type: 'float', name: 'Neck tie length (%)', help: 'Controls the length of the neck ties.' },
    neckTieWidth: { v: 6, range: [2, 18], type: 'float', name: 'Neck tie width (%)', help: 'Controls the width of the neck ties.' },
    bandTieLength: { v: 35, range: [30, 50], type: 'float', name: 'Band (chest) tie length (%)', help: 'Controls the length of the ties around your chest.' },
    bandTieWidth: { v: 3, range: [1, 9], type: 'float', name: 'Band (chest) tie width (%)', help: 'Controls the width of the ties around your chest.' },
  },
};

// the classic Bee: ties on, tied behind the neck (the cross back variation is not offered)
export const options = (d) => ({ ...treeOptions(d), ties: true, crossBackTies: false });
const MEASUREMENTS = ['highBust', 'chest', 'underbust', 'waist', 'waistBack', 'bustSpan', 'neck', 'hpsToBust', 'hpsToWaistFront',
  'hpsToWaistBack', 'shoulderToShoulder', 'shoulderSlope', 'bustPointToUnderbust'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const len = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The cup's edges: the casing along the bottom (the long edges well below the top, from the
 * centre front out, with its length) and the top (the short edge the neck tie is sewn to).
 */
function cupEdges(part) {
  const ed = pathEdges(part.paths.seam);
  const ys = ed.filter(Boolean).flatMap(p => [p[0][1], p[p.length - 1][1]]);
  const top = Math.max(...ys), bottom = Math.min(...ys), h = top - bottom;
  const casing = [], neck = [];
  ed.forEach((p, k) => {
    if (!p || len(p) < 1e-3) return;
    const a = p[0][1], b = p[p.length - 1][1];
    if (Math.max(a, b) < top - 0.6 * h && len(p) > 3) casing.push(k);
    else if (Math.min(a, b) > top - 0.1 * h) neck.push(k);
  });
  const first = ed[casing[0]][0], last = ed[casing[casing.length - 1]].at(-1);
  if (first[0] > last[0]) throw new Error('Bee: the casing is drawn from the side');   // not seen: FreeSewing draws it from the centre
  const topEdge = ed[neck[0]];
  return { casing, neck, casingLen: casing.reduce((s, k) => s + len(ed[k]), 0), top: [0.5 * (topEdge[0][0] + topEdge.at(-1)[0]), 0.5 * (topEdge[0][1] + topEdge.at(-1)[1])] };
}
/**
 * A tie's edges (a strip drawn from y = 0 down, x = 0 .. width): `along`, the long edge at
 * x = 0 (from y = 0 on), `end`, the short edges at y = 0 (from the far side to x = 0), its
 * length, and the edge it is cut on the fold at (the band tie's far end).
 */
function tieEdges(part) {
  const ed = pathEdges(part.paths.seam);
  let along = null, fold = null;
  const end = [];
  ed.forEach((p, k) => {
    if (!p || len(p) < 1e-3) return;
    const a = p[0], b = p.at(-1);
    if (Math.abs(a[0]) < 0.01 && Math.abs(b[0]) < 0.01 && Math.abs(a[1]) < 0.01) along = k;
    else if (Math.abs(a[1]) < 0.01 && Math.abs(b[1]) < 0.01) end.push(k);
    else if (Math.abs(a[1] - b[1]) < 0.01) fold = k;
  });
  if (along == null || !end.length) throw new Error(`${part.name}: unexpected outline`);
  return { along, end, fold, length: len(ed[along]) };
}

/** Where the ties are knotted (cm from the sewn end / the band's middle), from the draft's measurements. */
function knots(draft, cup, band, neck) {
  const ms = draft.settings[0].measurements, hps = draft.parts[0]['bella.frontSideDart'].points.hps;
  const ring = ms.underbust / 10;
  const kb = clamp(Math.max(ring / 2, cup.casingLen + 3), 3, band.length - 2);
  const toHps = Math.hypot(cup.top[0] - hps.x / 10, cup.top[1] + hps.y / 10);
  const kn = clamp(toHps + ms.neck / 40 + 2, 3, neck.length - 2);
  return { ring, kb, kn };
}

/*
 * Pieces: cup_l (unmirrored: Bella's front coordinates, the wearer's left) and cup_r, each
 * with a lining layer (cut only); band_tie, cut on the fold at its middle (its original half,
 * local y from 0 to the fold, on the wearer's left); neck_tie_l and neck_tie_r (mirrored).
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  const C = cupEdges(parts['bee.cup']), B = tieEdges(parts['bee.bandTie']), N = tieEdges(parts['bee.neckTie']);
  const { kb, kn } = knots(draft, C, B, N);
  const seams = [];
  const fb = (d) => clamp(1 - d / B.length, 0, 1);   // canonical fraction of the band's edge at d cm from its middle
  for (const [cup, band, tie] of [['cup_l', String(B.along), 'neck_tie_l'], ['cup_r', 'm' + B.along, 'neck_tie_r']]) {
    // the casing (centre front -> side) along the band (middle -> end)
    seams.push({ a: C.casing.map(k => [cup, k]), b: [['band_tie', band, true, fb(C.casingLen), 1]] });
    // the neck tie's end on the top of the cup
    seams.push({ a: C.neck.map(k => [cup, k]), b: N.end.map(k => [tie, k]) });
  }
  // knots: the band's halves where they meet at the back, the neck ties behind the neck
  // (overlapping head-on, 2 cm)
  seams.push({ a: [['band_tie', String(B.along), false, fb(kb + 1), fb(kb - 1)]], b: [['band_tie', 'm' + B.along, true, fb(kb + 1), fb(kb - 1)]] });
  const fn = (d) => clamp(d / N.length, 0, 1);
  seams.push({ a: [['neck_tie_l', N.along, false, fn(kn - 1), fn(kn + 1)]], b: [['neck_tie_r', N.along, true, fn(kn - 1), fn(kn + 1)]] });
  return {
    pieces: [
      { name: 'cup_l', part: 'bee.cup', label: 'body', lining: true },
      { name: 'cup_r', part: 'bee.cup', mirror: true, label: 'body', lining: true },
      { name: 'band_tie', part: 'bee.bandTie', fold: B.fold, doubled: 'x', label: 'body', follow: 6 },
      { name: 'neck_tie_l', part: 'bee.neckTie', doubled: 'x', label: 'body', follow: 4 },
      { name: 'neck_tie_r', part: 'bee.neckTie', mirror: true, doubled: 'x', label: 'body', follow: 4 },
    ],
    seams,
    labels: {},
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A strip along a 3D polyline: s (cm along the strip) -> point; w (across) offsets it sideways. */
function stripAlong(pts, total) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  const L = cum.at(-1), k = L / total;   // the path is stretched to the strip's length
  return (s, w, zc) => {
    const t = clamp(s * k, 0, L);
    let i = 1;
    while (i < pts.length - 1 && cum[i] < t) i++;
    const f = (t - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = pts[i - 1], b = pts[i];
    const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const side = nrm(cross(nrm(sub(b, a)), nrm([p[0], 0, p[2] - zc])));
    return [p[0] + w * side[0], p[1] + w * side[1], p[2] + w * side[2]];
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = bodiceTorso(F, parts['bella.frontSideDart'], parts['bella.back']);
  // the cups lie over the bust dart's wedge, which is cloth for them: no dart closing
  const cup = T.frontWith((x, y) => [x, y]);
  const C = cupEdges(parts['bee.cup']), B = tieEdges(parts['bee.bandTie']), N = tieEdges(parts['bee.neckTie']);
  const { ring, kb, kn } = knots(draft, C, B, N);
  // band: a ring at the height of the casing's centre front end, the tails hanging from the knot
  const ed = pathEdges(parts['bee.cup'].paths.seam), cf = ed[C.casing[0]][0];
  const Y = cup(cf[0] + 0.01, cf[1])[1];
  const R = bandRingMap(F, { Y, len: 2 * kb, phi0: 0, dir: 1, gap: 1.2 });
  const yMid = (B.fold != null ? pathEdges(parts['bee.bandTie'].paths.seam)[B.fold][0][1] : -B.length);
  const band = (x, y) => {
    const u = y - yMid, au = Math.abs(u), s = Math.sign(u) || 1;
    if (au <= kb) return R(u, Math.abs(x));
    const k = R(s * kb, 0);   // the tails: down from the knot, one behind the other
    return [k[0] + s * 0.6 + Math.abs(x), k[1] - (au - kb), k[2] - (s > 0 ? 1 : 2.2)];
  };
  // neck ties: from the top of the cup up beside the neck and round to the back of the neck
  const Xn = F.m.neck_w / 2 + 1, Yb = F.Yhps - 2, S = F.sec(Yb), zb = S.zc - S.r[S.r.length >> 1] - 1.2;
  const ties = {};
  for (const sx of [1, -1]) {
    const P0 = cup(sx * C.top[0], C.top[1]);
    const P1 = [sx * Xn, F.ridgeY(Xn) + 1.5, F.ridgeZ(Xn)];
    const P2 = [sx * 1, Yb, zb];
    const along = stripAlong([P0, P1, P2], kn);
    ties[sx] = (x, y) => {
      const s = -y, w = Math.abs(x);
      if (s <= kn) return along(s, w, S.zc);
      return [P2[0] + sx * (0.6 + w), P2[1] - (s - kn), P2[2] - (sx > 0 ? 1 : 2.2)];
    };
  }
  return (ps) => {
    if (/^cup_/.test(ps.name)) return cup;
    if (ps.name === 'band_tie') return band;
    if (ps.name === 'neck_tie_l') return ties[1];
    if (ps.name === 'neck_tie_r') return ties[-1];
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 1;
