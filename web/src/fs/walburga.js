// FreeSewing "Walburga" wappenrock (https://freesewing.eu/designs/walburga/, MIT, design by
// Bart Cumps): a medieval tabard of a front and a back, each cut on the fold, sewn together
// along the shoulders on either side of the head opening, with open sides and a pointed hem.
// Measurements from the mannequin, options as sliders, seam table and placement: each panel
// hangs from the shoulder ridge, straight down over the most forward (or backward) point of
// the body above, as a sheet hung from the shoulders falls.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions } from './lower.js';
import { upperFrame } from './place.js';
import { PART } from '../body.js';

export const id = 'walburga';
export const name = 'Walburga wappenrock';
export const short = 'Wappenrock';
export const exportName = 'Walburga';
export const url = 'https://freesewing.eu/designs/walburga/';
export const author = 'Bart Cumps';
export const icon = 'M14 6h10c1 3 7 3 8 0h10v40l-14 8-14-8z';
export const stretchNote = 'The wappenrock is sewn only at the shoulders: its sides hang open (unbelted).';

export const design = {
  fit: {
    headRatio: { v: 100, range: [80, 120], type: 'float', fs: 'pct', name: 'Head ratio (%)', help: 'Controls the size of the head opening.' },
  },
  style: {
    length: { v: 'toKnee', range: ['toKnee', 'toMidLeg', 'toFloor'], type: 'select', fs: 'list', name: 'Length', labels: { toKnee: 'To the knee', toMidLeg: 'To the middle of the leg', toFloor: 'To the floor' }, help: 'Controls the length of the garment.' },
    lengthBonus: { v: 85, range: [60, 130], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Allows variation of the length of the garment.' },
    widthBonus: { v: 95, range: [50, 130], type: 'float', fs: 'pct', name: 'Width bonus (%)', help: 'Allows variation of the width of the garment.' },
    neckline: { v: true, type: 'bool', fs: 'bool', name: 'Neckline', help: 'Controls whether or not to draft a neck opening in the front.' },
    neckoRatio: { v: 100, range: [10, 190], type: 'float', fs: 'pct', name: 'Neck opening shape (%)', help: 'Controls the shape of the neck opening.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['head', 'shoulderToShoulder', 'hpsToWaistBack', 'waistToKnee', 'waistToHips', 'waistToFloor', 'waistToUpperLeg', 'neck'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Walburga's seam line draws the shoulder as top -> topLeft, then back to headLeft and out
 * again (a zero-width spike), so the outline of each half is rebuilt from its named points:
 * (neck) -> headLeft, shoulder headLeft -> topLeft, side topLeft -> triangleLeft, point
 * triangleLeft -> bottomMiddle -> triangle, fold triangle -> top (or -> neckomid).
 */
const mv = (to) => ({ type: 'move', to }), ln = (to) => ({ type: 'line', to });
function buildSeam(part, front) {
  if (part.__walburga) return;
  const P = part.points, neck = front && P.neckomid && P.neckotop;
  const start = neck ? P.neckomid : P.top;
  part.paths.seam = { ops: [
    mv(start), ...(neck ? [ln(P.neckotop)] : []),
    ...(neck && Math.abs(P.neckotop.x) >= Math.abs(P.headLeft.x) - 0.5 ? [] : [ln(P.headLeft)]),
    ln(P.topLeft), ln(P.triangleLeft), ln(P.bottomMiddle), ln(P.triangle), { type: 'close' },
  ] };
  part.__walburga = true;
}

export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['walburga.front'], bp = parts['walburga.back'];
  buildSeam(fp, true); buildSeam(bp, false);
  const F = fp.points, B = bp.points;
  const sh0 = (P) => (P.neckotop && Math.abs(P.neckotop.x) >= Math.abs(P.headLeft.x) - 0.5 ? P.neckotop : P.headLeft);
  const fSh = opsBetween(fp, sh0(F), F.topLeft), bSh = opsBetween(bp, B.headLeft, B.topLeft);
  const fFold = opsBetween(fp, F.triangle, F.neckomid && o.neckline ? F.neckomid : F.top)[0];
  const bFold = opsBetween(bp, B.triangle, B.top)[0];
  const m = (ids) => ids.map(i => 'm' + i);
  return {
    pieces: [
      { name: 'front', part: 'walburga.front', fold: fFold, label: 'body' },
      { name: 'back', part: 'walburga.back', fold: bFold, label: 'body' },
    ],
    // the front's drafted half (local x < 0) is the wearer's right; the back's, the left
    seams: [
      { a: chain('front', fSh), b: chain('back', m(bSh)) },
      { a: chain('front', m(fSh)), b: chain('back', bSh) },
    ],
    labels: {},
  };
}

/*
 * Hanging profiles, one per cm of lateral offset X: from the shoulder ridge (clear of it)
 * forward (back) and down, at each height as far forward (back) as the body reaches anywhere
 * between there and the shoulders, plus a gap. Arc length along a profile = distance below
 * the panel's top edge.
 */
function profiles(body, F, sign, gap) {
  const { pos, part } = body;
  const NX = 40, Ytop = Math.ceil(F.Yhps + 2);
  const ext = Array.from({ length: NX }, () => new Float32Array(Ytop + 1).fill(NaN));
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (p !== PART.BODY && p !== PART.L_LEG && p !== PART.R_LEG) continue;
    const y = pos[3 * v + 1];
    if (y < 0 || y > Ytop) continue;
    const z = pos[3 * v + 2] * sign, ax = Math.abs(pos[3 * v]), k = Math.round(y);
    for (let X = Math.max(0, Math.floor(ax - 1.5)); X <= Math.min(NX - 1, Math.ceil(ax + 1.5)); X++) {
      if (Math.abs(ax - X) > 1.5) continue;
      const A = ext[X];
      if (!(A[k] >= z)) A[k] = z;
    }
  }
  const out = [];
  for (let X = 0; X < NX; X++) {
    const top = F.ridgeY(X) + gap, z0 = F.ridgeZ(X) * sign;
    const pts = [[top, z0]];
    let run = z0 - gap;
    for (let Y = Math.floor(F.ridgeY(X)); Y >= 0; Y--) {
      const z = ext[X][Y];
      if (isFinite(z)) run = Math.max(run, z);
      pts.push([Y, run + gap]);
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    out.push((s) => {
      if (s >= cum[cum.length - 1]) { const q = pts[pts.length - 1]; return [q[0] - (s - cum[cum.length - 1]), q[1]]; }
      let i = 1;
      while (cum[i] < s) i++;
      const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = pts[i - 1], b = pts[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    });
  }
  return (X, s) => {
    const x = Math.min(NX - 1.001, Math.abs(X)), i = Math.floor(x), f = x - i;
    const a = out[i](Math.max(0, s)), b = out[i + 1](Math.max(0, s));
    return [a[0] * (1 - f) + b[0] * f, (a[1] * (1 - f) + b[1] * f) * sign];
  };
}

export function placement(draft, m, body) {
  const F = upperFrame(body, m);
  const prof = { front: profiles(body, F, 1, 1.5), back: profiles(body, F, -1, 1.5) };
  return (ps) => {
    const sx = ps.name === 'front' ? 1 : -1, P = prof[ps.name];
    return (x, y) => { const X = sx * x, [Y, Z] = P(X, -y); return [X, Y, Z]; };
  };
}

export const attachLevels = () => ({});
export const lift = 1;
