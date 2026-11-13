// FreeSewing "Tamiko" zero-waste top (https://freesewing.eu/designs/tamiko/, MIT, design by
// Joost De Cock): one rectangle cut on the fold. Folded, the fold runs down the wearer's
// left side with the left armhole cut into it; the two layers are sewn together along three
// short lines marked on the pattern (the right shoulder at the top edge, the left shoulder
// from the top of the armhole, and the right side seam running diagonally down to the hem).
// The rest stays open: the neckline across the top, the right armhole and, beyond the side
// seam, a flap of both layers. Measurements from the mannequin, options as sliders, seam
// table and placement around the torso for the drape.
import { fsMeasurements, pick } from './measure.js';
import { fsOptions } from './lower.js';
import { bodyColumns, torsoBox, curtainMap } from './curtain.js';
import { PART } from '../body.js';

export const id = 'tamiko';
export const name = 'Tamiko zero-waste top';
export const short = 'Zero-waste top';
export const exportName = 'Tamiko';
export const url = 'https://freesewing.eu/designs/tamiko/';
export const author = 'Joost De Cock';
export const icon = 'M10 8h36l4 6-6 4v32l6 2-6 2H12l-4-2 4-2V18l-6-4zM20 8c3 5 13 5 16 0';
export const stretchNote = 'Tamiko is cut as one piece on the fold and sewn along three lines through both layers. For the drape the folded piece is split along those lines (and the lines carried on to the edges) into pieces that are welded together again, so the cloth is the same; the pattern and cutting layout show the single piece.';

export const design = {
  fit: {
    chestEase: { v: 2, range: [1, 20], type: 'float', fs: 'pct', name: 'Chest ease (%)', help: 'Controls the amount of ease at the chest.' },
    armholeDepthFactor: { v: 50, range: [40, 60], type: 'float', fs: 'pct', name: 'Armhole depth factor (%)', help: 'Controls the armhole depth.' },
    draftForHighBust: { v: false, type: 'bool', fs: 'bool', name: 'Draft for high bust', help: 'Use the high bust measurement instead of the chest.' },
  },
  style: {
    flare: { v: 15, range: [-10, 30], type: 'float', fs: 'deg', name: 'Flare (°)', help: 'Controls the flare at the hem.' },
    lengthBonus: { v: 13, range: [0, 60], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Lengthens the top.' },
    shoulderseamLength: { v: 10, range: [5, 25], type: 'float', fs: 'pct', name: 'Shoulder seam length (%)', help: 'Controls the length of the shoulder seams.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) Object.defineProperty(o, 'drape3d', { value: true, enumerable: false });
  return o;
}

export const measurements = (m, body) => pick(fsMeasurements(m, body), ['shoulderToShoulder', 'chest', 'hpsToWaistBack', 'shoulderSlope', 'waistToHips', 'highBust']);

// ------------------------------------------------------------------ geometry (mm, y down)
const P = (x, y) => ({ x, y });
/** Where the line through a and b crosses x = X (or y = Y). */
const atX = (a, b, X) => P(X, a.y + (b.y - a.y) * (X - a.x) / (b.x - a.x));
const atY = (a, b, Y) => P(a.x + (b.x - a.x) * (Y - a.y) / (b.y - a.y), Y);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The folded piece split along the sewing lines carried on to the edges: main body, the
 * corner above the left shoulder seam (T) and the flap beyond the right side seam. Returns
 * the key points of the front layer (the drafted half; the back layer is its mirror image
 * across the fold).
 */
function geometry(draft) {
  const p = draft.parts[0]['tamiko.top'].points;
  const yT = p.topLeft.y, yF = p.bottomLeft.y, xL = p.bottomRight.x;
  // left shoulder line: from the top of the armhole (on the fold) through armholeNeck to the top edge (x = 0)
  let Q1 = atX(p.armholeTop, p.armholeNeck, 0);
  if (!(Q1.y > yT && Q1.y < yF)) Q1 = P(0, (yT + yF) / 2);
  // right side seam: from armgapBottom down through sideBottom; carried on up to the top edge
  // (x = 0) or the open side (y = yT), and down to the open side
  let Q2 = atX(p.armgapBottom, p.sideBottom, 0), Q2onTop = true;
  if (!(Q2.y > yT && Q2.y < Q1.y)) { Q2 = atY(p.armgapBottom, p.sideBottom, yT); Q2onTop = false; }
  const E = atY(p.armgapBottom, p.sideBottom, yT);   // where the line leaves the open side (FreeSewing's sideEdge)
  return { p, yT, yF, xL, Q1, Q2, Q2onTop, E };
}

function addPart(draft, name, ops) {
  const parts = draft.parts[0];
  parts[name] = { name, paths: { seam: { ops } }, points: {} };
  const cl = draft.setStores?.[0]?.cutlist;
  if (cl && cl['tamiko.top']) cl[name] = { ...cl['tamiko.top'] };
}

function buildParts(draft) {
  const G = geometry(draft), { p, yT, yF, xL, Q1, Q2, E } = G;
  const parts = draft.parts[0];
  // the armhole ops of FreeSewing's seam path (armholeTop -> pitch -> armholeBottom)
  const ops = parts['tamiko.top'].paths.seam.ops;
  const arm = ops.filter(op => op.type === 'curve');
  for (const [layer, fy] of [['F', (q) => q], ['B', (q) => P(q.x, 2 * yF - q.y)]]) {
    const c = (op) => ({ type: 'curve', cp1: fy(op.cp1), cp2: fy(op.cp2), to: fy(op.to) });
    const L = (q) => ({ type: 'line', to: fy(q) });
    addPart(draft, `tamiko.main${layer}`, [
      { type: 'move', to: fy(Q2) }, L(Q1), L(p.armholeTop), ...arm.map(c), L(P(xL, yF)), L(P(xL, yT)), L(E), { type: 'close' },
    ]);
    addPart(draft, `tamiko.corner${layer}`, [{ type: 'move', to: fy(Q1) }, L(P(0, yF)), L(p.armholeTop), { type: 'close' }]);
    addPart(draft, `tamiko.flap${layer}`, G.Q2onTop
      ? [{ type: 'move', to: fy(Q2) }, L(P(0, yT)), L(E), { type: 'close' }]
      : [{ type: 'move', to: fy(Q2) }, L(E), { type: 'close' }]);
  }
  // pattern view: the piece as drafted, the fold (with the armhole cut into it) as one line
  addPart(draft, 'tamiko.whole', [
    { type: 'move', to: P(0, yT) }, { type: 'line', to: P(0, yF) }, { type: 'line', to: P(xL, yF) },
    { type: 'line', to: P(xL, yT) }, { type: 'close' },
  ]);
  return G;
}

/*
 * Drape pieces, front and back layer alike (the back is the front's mirror image across
 * the fold):
 *  front / back (the main part): 0 neckline (top edge, from the side seam line to the left
 *    shoulder line), 1 left shoulder line (-> top of the armhole), 2-3 armhole, 4 fold
 *    (-> hem), 5 hem, 6 open side, 7 side seam line (open side -> top edge)
 *  front_corner / back_corner: 0 top edge (-> fold), 1 fold (-> top of the armhole),
 *    2 left shoulder line (-> top edge)
 *  front_flap / back_flap: 0 top edge, 1 open side, 2 side seam line (open side -> top edge)
 */
export function spec(o, draft) {
  const G = buildParts(draft), { p, Q1, Q2, E } = G;
  if (!o.drape3d) {
    // the drafted piece, cut on the fold (the armhole is cut into the fold: see the drawing)
    return { pieces: [{ name: 'top', part: 'tamiko.whole', fold: 1 }], seams: [], labels: {} };
  }
  if (!G.Q2onTop || !(E.x < G.xL)) throw new Error('with these options the side seam line runs off the piece differently than this drape expects, so it is not draped; the pattern is still available.');
  const k = (f) => Math.round(Math.max(0, Math.min(1, f)) * 1e4) / 1e4;
  // fractions along the lines
  const lenT = dist(Q1, p.armholeTop), fs = k(1 - dist(p.armholeTop, p.armholeNeck) / lenT);   // left shoulder seam: the last part of edge 1
  const lenS = dist(E, Q2), sb = k(dist(E, p.sideBottom) / lenS), sa = k(dist(E, p.armgapBottom) / lenS);   // side seam on edge 7
  const M = { F: 'front', B: 'back' };
  const seams = [];
  // consecutive pieces of an edge between breaks (breaks closer than convertDraft keeps apart merged)
  const spans = (breaks) => {
    const b = [0];
    for (const f of [...breaks].sort((x, y) => x - y)) if (f - b[b.length - 1] > 0.03 && 1 - f > 0.03) b.push(f);
    b.push(1);
    return b.slice(1).map((f, i) => [b[i], f]);
  };
  const near = (f, g) => Math.abs(f - g) <= 0.03 || (g === 1 && f > 0.97) || (g === 0 && f < 0.03);
  const snap = (f, bs) => { for (const [x, y] of bs) { if (near(f, x)) return x; if (near(f, y)) return y; } return f; };
  const tSpans = spans([fs]), sSpans = spans([sb, sa]);
  const fs2 = snap(fs, tSpans), sb2 = snap(sb, sSpans), sa2 = snap(sa, sSpans);
  for (const L of ['F', 'B']) {
    // the cuts welded again (in the same pieces as the seams through both layers)
    for (const [f0, f1] of tSpans) seams.push({ a: [[M[L], 1, false, f0, f1]], b: [[`${M[L]}_corner`, 2, true, 1 - f1, 1 - f0]] });
    for (const [f0, f1] of sSpans) seams.push({ a: [[M[L], 7, false, f0, f1]], b: [[`${M[L]}_flap`, 2, false, f0, f1]] });
  }
  seams.push(
    { a: [['front', 4]], b: [['back', 4]] },                       // the fold
    { a: [['front_corner', 1]], b: [['back_corner', 1]] },
    { a: [['front', 1, false, fs2, 1]], b: [['back', 1, false, fs2, 1]] },     // left shoulder
    { a: [['front', 7, false, sb2, sa2]], b: [['back', 7, false, sb2, sa2]] },   // right side seam
  );
  // right shoulder (top edge, armgapTop -> armgapNeck): on the main part's neckline (edge 0,
  // Q2 -> Q1) and, when the side seam line meets the top edge beyond its start, partly on the
  // flaps' top edges (edge 0, Q2 -> the open side)
  const y0 = p.armgapTop.y, y1 = p.armgapNeck.y, Y2 = Q2.y;
  if (y1 - Math.max(y0, Y2) > 3) {
    const f = (y) => k((y - Y2) / (Q1.y - Y2));
    seams.push({ a: [['front', 0, false, f(Math.max(y0, Y2)), f(y1)]], b: [['back', 0, false, f(Math.max(y0, Y2)), f(y1)]] });
  }
  if (Math.min(y1, Y2) - y0 > 3) {
    const f = (y) => k((Y2 - y) / (Y2 - G.yT));
    seams.push({ a: [['front_flap', 0, false, f(Math.min(y1, Y2)), f(y0)]], b: [['back_flap', 0, false, f(Math.min(y1, Y2)), f(y0)]] });
  }
  return {
    pieces: ['F', 'B'].flatMap(L => [
      { name: M[L], part: `tamiko.main${L}`, label: 'body' },
      { name: `${M[L]}_corner`, part: `tamiko.corner${L}`, label: 'body' },
      { name: `${M[L]}_flap`, part: `tamiko.flap${L}`, label: 'body' },
    ]),
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const G = geometry(draft), { yF } = G;
  const C = bodyColumns(body, m);
  const Yw = m.height - m.head_l - m.waist_line;
  const box = torsoBox(body, Yw - m.hips_line, C.Yhps - m.armscye_depth);
  // around the body: u = cm from the fold (the wearer's left side) along the layer; the right
  // side seam line is at u = W(x) at the depth x below the top edge
  const sl = (x) => {   // u of the side seam line at depth x (cm)
    const a = G.p.armgapBottom, b = G.p.sideBottom, X = x * 10;
    return (yF - (a.y + (b.y - a.y) * (X - a.x) / (b.x - a.x))) / 10;
  };
  const dA = G.p.armgapBottom.x / 10, W0 = sl(dA);   // half girth at the top of the side seam
  // the underside of the arms (lowest point per cm out from the centre)
  const under = new Float32Array(120).fill(Infinity);
  for (let v = 0; v < body.part.length; v++) {
    if (body.part[v] !== PART.L_ARM && body.part[v] !== PART.R_ARM) continue;
    const k = Math.round(Math.abs(body.pos[3 * v]));
    if (k < 120) under[k] = Math.min(under[k], body.pos[3 * v + 1]);
  }
  const armBottom = (X) => { const v = under[Math.min(119, Math.round(Math.abs(X)))]; return isFinite(v) ? v : Infinity; };
  const maps = {};
  for (const side of [1, -1]) maps[side] = curtainMap(C, box, { side, halfWidth: W0 / 2, xSign: 1, A: box.halfW + 2 })   // the sides under the armpits;
  return (ps) => {
    const side = ps.name.startsWith('front') ? 1 : -1;
    const M = maps[side];
    // local (x, y) = (depth below the top edge, -FreeSewing y) in cm. Across, the layer runs
    // from the fold (the wearer's left side, u = 0) around the front (back) to the right side
    // (u = W0) and on out sideways: the side seam line slants out like the underside of a
    // sleeve, and the arm comes out above it
    return (x, y) => {
      const fsy = side > 0 ? -y : 2 * yF / 10 + y;
      const u = yF / 10 - fsy;
      const d = Math.max(0, x), q = M(W0 / 2 - u, -d);
      // out beyond the right side, below the side seam line (the hem flaring out), the cloth
      // starts under the arm, not around it, so the seam is not sewn across the arm
      if (u > W0 && u <= sl(d) + 0.5) return [q[0], Math.min(q[1], armBottom(q[0]) - 2), box.zc + side * 0.5];
      // just inside the right side, the side seam starts under the arm too
      const w = sm((u - W0 + 8) / 8) * sm((d - dA + 3) / 3);
      if (w > 0) q[1] = q[1] * (1 - w) + Math.min(q[1], armBottom(q[0]) - 2) * w;
      return q;
    };
  };
}

export const attachLevels = () => ({});
export const lift = 2;
