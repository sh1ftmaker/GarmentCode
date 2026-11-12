// Shared pieces of the adapters for FreeSewing tops built on Brian, FreeSewing's body
// block (Hugo, Teagan, Sven, Aaron): measurements from the mannequin and the torso
// placement of their front and back.
import { measureGirth, PART } from '../body.js';
import { torsoMap, outlineSpan, upperFrame, sleeveMap } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';

const hullPerimeter = (pts) => {
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

/** Upper-arm girth (cm) a little below the armpit, measured across the arm's axis. */
function bicepsGirth(F, body) {
  const A = F.arms[1] || F.arms[-1];
  if (!A) return 0;
  const pid = F.arms[1] ? PART.L_ARM : PART.R_ARM;
  const { pos, part } = body, t0 = A.tPit + 4;
  const pts = [];
  for (let v = 0; v < part.length; v++) {
    if (part[v] !== pid) continue;
    const d = [pos[3 * v] - A.c[0], pos[3 * v + 1] - A.c[1], pos[3 * v + 2] - A.c[2]];
    const t = d[0] * A.a[0] + d[1] * A.a[1] + d[2] * A.a[2];
    if (Math.abs(t - t0) > 0.8) continue;
    pts.push([d[0] * A.up[0] + d[1] * A.up[1] + d[2] * A.up[2], d[0] * A.fr[0] + d[1] * A.fr[1] + d[2] * A.fr[2]]);
  }
  return hullPerimeter(pts);
}

/**
 * GarmentCode measurements (cm) and the mannequin -> the measurements (mm) of FreeSewing's
 * Brian block. Lengths come from GarmentCode's (vertical) measurements; girths GarmentCode
 * has no direct equivalent for (hips at the hip bone, neck, biceps, head) are measured on
 * the mannequin.
 */
export function brianMeasurements(m, body, F = body ? upperFrame(body, m) : null) {
  const waistY = m.height - m.head_l - m.waist_line;
  const waistToHips = 0.5 * m.hips_line;
  let hips = body ? measureGirth(body.pos, body.part, waistY - waistToHips) : 0;
  if (!(hips > 0.6 * m.waist)) hips = 0.92 * m.hips;
  let biceps = F ? bicepsGirth(F, body) : 0;
  if (!(biceps > 0.2 * m.bust && biceps < 0.5 * m.bust)) biceps = 0.3 * m.bust;
  let head = body ? measureGirth(body.pos, body.part, m.height - 0.3 * m.head_l, 0.8) : 0;
  if (!(head > 1.6 * m.head_l && head < 2.6 * m.head_l)) head = 2.15 * m.head_l;
  const mm = (v) => Math.round(v * 10);
  return {
    chest: mm(m.bust),
    waist: mm(m.waist),
    hips: mm(hips),
    waistToHips: mm(waistToHips),
    hpsToWaistBack: mm(1.06 * m.waist_line),   // along the back, not vertical
    hpsToBust: mm(m.bust_line),
    waistToArmpit: mm(m.waist_line - m.armscye_depth),
    neck: mm(2 * m.neck_w),
    shoulderToShoulder: mm(m.shoulder_w),
    shoulderSlope: Math.round(Math.min(26, Math.max(8, m.shoulder_incl))),   // degrees
    shoulderToWrist: mm(m.arm_length),
    wrist: mm(m.wrist),
    biceps: mm(biceps),
    head: mm(head),
  };
}

/**
 * Torso maps for a Brian-based front and back (both cut on the fold at local x = 0).
 * front/back: FreeSewing parts; armholeY: pattern height (cm, y up) of the side seam top.
 * Returns { frame, front, back } where front/back are (x, y) -> [X, Y, Z]; the front's
 * local +x is the wearer's left, the back's local +x the wearer's right (both drawn as
 * seen from outside).
 * setIn: the pieces get set-in sleeves; their armhole bottoms are placed below the armpit
 * crease (see torsoMap's armholeX / shoulderX), so the sleeves start around the arm.
 */
export function brianTorso(F, front, back, { gap = 1.5, shoulderEdge = null, setIn = false } = {}) {
  const sf = outlineSpan(pieceLoop(front, { fold: foldEdge(front) }));
  const sb = outlineSpan(pieceLoop(back, { fold: foldEdge(back) }));
  const half = (s, y) => { const r = s(y); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  const girth = (y) => half(sf, y) + half(sb, y);
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const fp = front.points, bp = back.points;
  const armholeY = Math.min(P(fp.armhole)[1], P(bp.armhole)[1]);
  // the shoulder line: the shoulder seam when there is one (it can be shorter than Brian's,
  // e.g. a wide neckline), else Brian's neck point to shoulder point
  const line = (part) => {
    let n = P(part.points.neck), s = P(part.points.shoulder);
    if (shoulderEdge != null) {
      const e = pathEdges(part.paths.seam)[shoulderEdge];
      if (e) { const a = e[0], b = e[e.length - 1]; [n, s] = a[0] < b[0] ? [a, b] : [b, a]; }
    }
    return { hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])), ...(setIn ? { shoulderX: s[0], armholeX: P(part.points.armhole)[0] } : {}) };
  };
  const lf = line(front), lb = line(back);
  return {
    armholeY,
    front: torsoMap(F, { side: 1, xSign: 1, ...lf, girth, armholeY, gap }),
    back: torsoMap(F, { side: -1, xSign: -1, ...lb, girth, armholeY, gap }),
  };
}

/** The drawing operation of a part's seam path that closes it along the centre front / back (x = 0). */
export function foldEdge(part) {
  const ops = part.paths.seam.ops.filter(o => o.type !== 'move');
  let cur = null, first = null, idx = -1;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { cur = op.to; first = op.to; continue; }
    idx++;
    const to = op.type === 'close' ? first : op.to;
    if (cur && Math.abs(cur.x) < 0.5 && Math.abs(to.x) < 0.5 && Math.abs(cur.y - to.y) > 50) return idx;
    cur = to;
  }
  return ops.length - 1;
}

/** App design tree -> FreeSewing options: percentages as fractions, degrees and booleans as they are. */
export function treeOptions(d, keep = new Set()) {
  const o = {};
  for (const grp of Object.values(d)) for (const [k, n] of Object.entries(grp)) o[k] = n.type === 'bool' || keep.has(k) ? n.v : n.v / 100;
  return o;
}

/** Only the measurements a design asks for. */
export const pick = (all, keys) => Object.fromEntries(keys.map(k => [k, all[k]]));

/**
 * Sleeve maps for the left (unmirrored) and right (mirrored) copy of a Brian-family sleeve part.
 * atCrease: the biceps line starts at the real armpit crease (set-in sleeves sewn to a
 * brianTorso with setIn), else at armpit height Yarm.
 */
export function brianSleeves(F, part, { atCrease = false } = {}) {
  const bicepsY = -part.points.bicepsLeft.y / 10;
  const out = {};
  for (const mirror of [false, true]) {
    const loop = pieceLoop(part, { mirror });
    out[mirror] = { loop, map: sleeveMap(F, { sx: mirror ? -1 : 1, span: outlineSpan(loop), bicepsY, frontSign: mirror ? 1 : -1, atCrease }) };
  }
  return out;
}
