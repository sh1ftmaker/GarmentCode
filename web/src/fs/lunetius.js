// FreeSewing "Lunetius" lacerna (https://freesewing.eu/designs/lunetius/, MIT, design by
// Rika Tamaike): a Roman cloak, one big piece cut on the fold at the centre back with rounded
// front corners, hemmed all round and fastened with a fibula. Measurements from the
// mannequin, options as sliders, the fastening and placement around the shoulders for the drape.
import { PART } from '../body.js';
import { fsMeasurements, pick } from './measure.js';
import { fsOptions } from './lower.js';

export const id = 'lunetius';
export const name = 'Lunetius lacerna';
export const short = 'Lacerna';
export const exportName = 'Lunetius';
export const url = 'https://freesewing.eu/designs/lunetius/';
export const author = 'Rika Tamaike';
export const icon = 'M28 6c-6 0-9 2-12 4L8 16 4 48c8 3 16 4 24 4s16-1 24-4l-4-32-8-6c-3-2-6-4-12-4zM24 10l4 6 4-6';
export const stretchNote = 'FreeSewing has the lacerna fastened with a fibula on the right shoulder or in the middle; the 3D drape pins it in the middle, where its front corners meet. With the mannequin\'s arms held out, the cloak drapes over them.';

export const design = {
  style: {
    length: { v: 'toBelowKnee', range: ['toKnee', 'toBelowKnee', 'toHips', 'toUpperLeg', 'toFloor'], type: 'select', fs: 'list', name: 'Length', labels: { toKnee: 'To the knee', toBelowKnee: 'Below the knee', toHips: 'To the hips', toUpperLeg: 'To the upper leg', toFloor: 'To the floor' }, help: 'Choose from the different length styles.' },
    lengthRatio: { v: 105, range: [60, 130], type: 'float', fs: 'pct', name: 'Length ratio (%)', help: 'Controls the length of the garment.' },
    widthRatio: { v: 100, range: [50, 130], type: 'float', fs: 'pct', name: 'Width ratio (%)', help: 'Controls the width of the garment.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['waistToKnee', 'waistToUpperLeg', 'waistToFloor', 'hpsToWaistBack', 'neck', 'shoulderToShoulder',
  'shoulderToElbow', 'waistToHips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const PIN = 3;   // cm of the front corners pinned together (the fibula)

/*
 * Edges (lacerna, cut on the fold at the centre back, edge 4): 0 top (centre back -> front
 * corner; the shoulder notch on it), 1 front edge (down), 2 rounded corner, 3 hem (-> centre
 * back). The mirrored half (local +x) is the wearer's left.
 */
export function spec(o, draft) {
  const p = draft.parts[0]['lunetius.lacerna'].points;
  const W = p.topLeft.dx(p.top) / 10, f = Math.max(0.5, 1 - PIN / W);
  return {
    pieces: [{ name: 'lacerna', part: 'lunetius.lacerna', fold: 4, label: 'body' }],
    // the fibula: the front corners pinned to each other, at the front of the neck
    seams: [{ a: [['lacerna', 'm0', false, f, 1]], b: [['lacerna', '0', true, f, 1]] }],
    labels: {},
  };
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NT = 144;

/**
 * Radial reach of the mannequin (torso and arms) around the vertical axis through (0, zc):
 * per direction θ = atan2(x, z - zc) and 2 cm of height, the furthest any part at or above
 * that height reaches (the outline a cloak hanging from the shoulders drapes over).
 */
function radialCurtain(body, top, zc) {
  const { pos, part } = body;
  const NY = Math.ceil(top / 2) + 2, R = new Float32Array(NT * NY);
  for (let v = 0; v < part.length; v++) {
    const pp = part[v];
    if (pp !== PART.BODY && pp !== PART.L_ARM && pp !== PART.R_ARM) continue;
    const y = pos[3 * v + 1];
    if (y > top) continue;
    const x = pos[3 * v], z = pos[3 * v + 2] - zc, r = Math.hypot(x, z);
    const k = ((Math.round(Math.atan2(x, z) / (2 * Math.PI) * NT) % NT) + NT) % NT, j = clamp(Math.round(y / 2), 0, NY - 1);
    for (const kk of [k - 1, k, k + 1]) { const q = ((kk % NT) + NT) % NT; R[q * NY + j] = Math.max(R[q * NY + j], r); }
  }
  for (let k = 0; k < NT; k++) for (let j = NY - 2; j >= 0; j--) R[k * NY + j] = Math.max(R[k * NY + j], R[k * NY + j + 1]);
  return (th, Y) => {
    const k = ((Math.round(th / (2 * Math.PI) * NT) % NT) + NT) % NT;
    return R[k * NY + clamp(Math.round(Y / 2), 0, NY - 1)];
  };
}

export function placement(draft, m, body) {
  const p = draft.parts[0]['lunetius.lacerna'].points;
  const W = p.topLeft.dx(p.top) / 10, notch = p.topShoulder.dx(p.top) / 10, flap = W - notch;
  const Yhps = m.height - m.head_l, gap = 2;
  // centre of the shoulders (front-back), from the torso a little below the shoulders
  const { pos, part } = body;
  let z0 = Infinity, z1 = -Infinity;
  for (let v = 0; v < part.length; v++) {
    if (part[v] !== PART.BODY) continue;
    const y = pos[3 * v + 1];
    if (y < Yhps - 12 || y > Yhps - 4) continue;
    z0 = Math.min(z0, pos[3 * v + 2]); z1 = Math.max(z1, pos[3 * v + 2]);
  }
  const zc = (z0 + z1) / 2;
  const reach = radialCurtain(body, Yhps + 1, zc);
  // the neck ring: an ellipse around the shoulders, as wide as the shoulders and arms reach
  // at the top; its back quarter as long as the top edge from the centre back to the shoulder
  // notch, its front quarter as long as the flap to a little short of the corner (the
  // corners overlap in front, where they are pinned)
  const Yr = Yhps - 4;
  const a = Math.max(reach(Math.PI / 2, Yr), reach(-Math.PI / 2, Yr)) + gap;
  const quarter = (b) => 0.5 * Math.PI * Math.sqrt((a * a + b * b) / 2);
  const solveB = (len, min) => { let b = min; while (quarter(b) < len && b < 60) b += 0.25; return b; };
  const bb = solveB(notch, reach(Math.PI, Yr) + gap), bf = solveB(flap - PIN, reach(0, Yr) + gap);
  const ringR = (th) => { const c = Math.cos(th), sn = Math.sin(th), b = c > 0 ? bf : bb; return 1 / Math.sqrt((sn / a) ** 2 + (c / b) ** 2); };
  // Lower down the cloak hangs around everything above it (shoulders, arms). Its width is
  // the same at every height, so where the outline it hangs around is wider it reaches less
  // far round, and the front opening widens: per 2 cm of height, the outline (the ring or
  // the reach, whichever is further out) and its arc length from the centre back each way.
  const NTH = 180, rows = new Map();
  const row = (Y) => {
    const key = Math.round(Y / 2);
    if (rows.has(key)) return rows.get(key);
    const r = new Float32Array(NTH + 1);
    for (let i = 0; i <= NTH; i++) {
      const th = Math.PI * (1 - i / NTH);   // one side, back (π) -> front (0)
      r[i] = Math.max(ringR(th), Math.max(reach(th, Y), reach(-th, Y)) + gap);
    }
    // smooth (no sharp corners around the arms)
    const q = Float32Array.from(r);
    for (let it = 0; it < 3; it++) for (let i = 1; i < NTH; i++) q[i] = Math.max(r[i], (q[i - 1] + q[i] + q[i + 1]) / 3);
    const cum = new Float32Array(NTH + 1);
    for (let i = 1; i <= NTH; i++) {
      const t0 = Math.PI * (1 - (i - 1) / NTH), t1 = Math.PI * (1 - i / NTH);
      cum[i] = cum[i - 1] + Math.hypot(q[i] * Math.sin(t1) - q[i - 1] * Math.sin(t0), q[i] * Math.cos(t1) - q[i - 1] * Math.cos(t0));
    }
    const R = { r: q, cum };
    rows.set(key, R);
    return R;
  };
  const Ytop = Yhps + gap;
  return () => (x, y) => {
    const sx = x >= 0 ? 1 : -1, s = Math.abs(x);
    const d = Math.max(0, -y), Y = Ytop - d;
    const R = row(Y);
    // the back part (to the shoulder notch) spread over the back quarter at the top
    const top = 1 - sm(d / 20), q = R.cum[NTH / 2];
    let arc = s <= notch ? s * (top * q / notch + 1 - top) : (top * q + (1 - top) * notch) + (s - notch);
    let th, rr;
    if (arc >= R.cum[NTH]) {   // past the centre front (the overlapping corners)
      rr = R.r[NTH]; th = -(arc - R.cum[NTH]) / rr;
    } else {
      let i = 1;
      while (i < NTH && R.cum[i] < arc) i++;
      const f = (arc - R.cum[i - 1]) / ((R.cum[i] - R.cum[i - 1]) || 1);
      th = Math.PI * (1 - (i - 1 + f) / NTH); rr = R.r[i - 1] + (R.r[i] - R.r[i - 1]) * f;
    }
    // the left flap lies over the right one in front
    rr += sx > 0 ? 3 * sm((s - notch) / 10) : 0;
    th *= sx;
    return [rr * Math.sin(th), Y, zc + rr * Math.cos(th)];
  };
}

export const attachLevels = () => ({});
export const lift = 2;
