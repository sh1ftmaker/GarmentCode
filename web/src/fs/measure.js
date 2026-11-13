// Every measurement any FreeSewing design asks for (mm; shoulderSlope in degrees), from
// GarmentCode's body measurements (cm) and the morphed mannequin.
//
// GarmentCode's measurements give the lengths and the main girths directly; girths it has
// no equivalent for (hip bone, high bust, knee, ankle, biceps, head) and the crotch seam
// are measured on the mannequin. What can't be measured either (heel, bust front arc...)
// is estimated with the proportions of FreeSewing's own average measurement sets
// (@freesewing/models, neckstimate.mjs).
import { measureGirth, PART } from '../body.js';
import { brianMeasurements } from './tops.js';

const hull = (pts) => {
  if (pts.length < 3) return 0;
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const H = lo.slice(0, -1).concat(hi.slice(0, -1));
  let per = 0;
  for (let i = 0; i < H.length; i++) per += Math.hypot(H[i][0] - H[(i + 1) % H.length][0], H[i][1] - H[(i + 1) % H.length][1]);
  return per;
};

/** Girth (cm) of one leg (the wearer's left) at height y. */
function legGirth(body, y, band = 1.0) {
  const { pos, part } = body, pts = [];
  for (let v = 0; v < part.length; v++) {
    if (part[v] !== PART.L_LEG && !(part[v] === PART.BODY && pos[3 * v] > 0.5)) continue;
    if (Math.abs(pos[3 * v + 1] - y) < band) pts.push([pos[3 * v], pos[3 * v + 2]]);
  }
  return hull(pts);
}

/**
 * Crotch seam (cm): along the body's centre line from the front waist, under the crotch,
 * up to the back waist. Returns { total, front } or null.
 */
function crossSeam(body, waistY, crotchY) {
  const { pos, part } = body;
  const y0 = Math.floor(crotchY - 4), n = Math.ceil(waistY - y0) + 1;
  const front = new Array(n).fill(-Infinity), back = new Array(n).fill(Infinity);
  let zc = 0, cnt = 0;
  for (let v = 0; v < part.length; v++) {
    if (part[v] === PART.L_ARM || part[v] === PART.R_ARM) continue;   // torso and legs (the crotch is on the legs)
    const y = pos[3 * v + 1];
    if (Math.abs(pos[3 * v]) > 1.5 || y < y0 - 0.5 || y > waistY + 0.5) continue;
    const k = Math.round(y - y0), z = pos[3 * v + 2];
    front[k] = Math.max(front[k], z); back[k] = Math.min(back[k], z);
    zc += z; cnt++;
  }
  if (cnt < 20) return null;
  // the lowest bin where the centre line still has body
  let kLow = 0;
  while (kLow < n && !(isFinite(front[kLow]) && front[kLow] - back[kLow] > 0.5)) kLow++;
  if (kLow >= n - 5) return null;
  const arc = (side) => {
    let L = 0, prev = null;
    for (let k = n - 1; k >= kLow; k--) {
      const z = side[k];
      if (!isFinite(z)) continue;
      if (prev) L += Math.hypot(1 * (prev[0] - k), prev[1] - z);
      prev = [k, z];
    }
    return L;
  };
  const f = arc(front), b = arc(back);
  // under the crotch: half an ellipse-ish bridge between the lowest front and back points
  const bridge = 1.15 * (front[kLow] - back[kLow]);
  return { total: f + b + bridge, front: f + 0.5 * bridge };
}

/** All FreeSewing measurements (mm, shoulderSlope in degrees). */
export function fsMeasurements(m, body) {
  const out = brianMeasurements(m, body);
  const mm = (v) => Math.round(v * 10);
  const waistY = m.height - m.head_l - m.waist_line;
  const waistToUpperLeg = m.hips_line + m.crotch_hip_diff;
  const crotchY = waistY - waistToUpperLeg;
  const kneeY = 0.285 * m.height;
  const bustLine = 'vert_bust_line' in m ? (2 / 3) * m.vert_bust_line + (1 / 3) * m.bust_line : m.bust_line;

  // girths on the mannequin, with proportional fallbacks
  const sane = (v, lo, hi, dflt) => (v > lo && v < hi ? v : dflt);
  const knee = sane(body ? legGirth(body, kneeY) : 0, 0.45 * m.leg_circ, 0.95 * m.leg_circ, 0.65 * m.leg_circ);
  const ankle = sane(body ? legGirth(body, 0.055 * m.height) : 0, 0.25 * m.leg_circ, 0.6 * m.leg_circ, 0.41 * m.leg_circ);
  const armpitY = waistY + m.waist_line - m.armscye_depth;
  const highBust = Math.min(1.03 * m.bust, sane(body ? measureGirth(body.pos, body.part, armpitY - 2.5) : 0, 0.8 * m.bust, 1.1 * m.bust, 0.95 * m.bust));
  const cs = body ? crossSeam(body, waistY, crotchY) : null;
  const cross = sane(cs?.total, 0.55 * m.hips, 1.0 * m.hips, 0.74 * m.hips);
  const crossFront = sane(cs?.front, 0.38 * cross, 0.6 * cross, 0.48 * cross);

  // the front of the bust: the half girth plus the share the bust adds at the front
  const bustFront = 0.5 * m.bust + 0.45 * Math.max(0, m.bust - m.underbust);
  const highBustFront = Math.min(0.5 * highBust + 0.3 * Math.max(0, m.bust - m.underbust), bustFront);
  const waistToUnderbust = Math.max(3, 0.65 * (m.waist_line - bustLine));

  Object.assign(out, {
    seat: mm(m.hips),
    seatBack: mm(m.hip_back_width ?? 0.52 * m.hips),
    waistBack: mm(m.waist_back_width ?? 0.5 * m.waist),
    waistToSeat: mm(m.hips_line),
    waistToUpperLeg: mm(waistToUpperLeg),
    crotchDepth: mm(0.97 * waistToUpperLeg),
    upperLeg: mm(m.leg_circ),
    knee: mm(knee),
    ankle: mm(ankle),
    heel: mm(1.38 * ankle),
    crossSeam: mm(cross),
    crossSeamFront: mm(crossFront),
    waistToFloor: mm(waistY),
    waistToKnee: mm(waistY - kneeY),
    inseam: mm(crotchY),
    highBust: mm(highBust),
    highBustFront: mm(highBustFront),
    bustFront: mm(bustFront),
    bustSpan: mm(m.bust_points),
    underbust: mm(m.underbust),
    hpsToWaistFront: mm(m.waist_over_bust_line ?? 1.08 * m.waist_line),
    waistToUnderbust: mm(waistToUnderbust),
    bustPointToUnderbust: mm(Math.max(3, (m.waist_over_bust_line ?? m.waist_line) - m.bust_line - waistToUnderbust)),
    shoulderToElbow: mm(0.58 * m.arm_length),
  });
  return out;
}

/** The measurements a design asks for (required + optional), from fsMeasurements(). */
export function pick(all, names) {
  const o = {};
  for (const k of names) if (all[k] != null && isFinite(all[k])) o[k] = all[k];
  return o;
}
