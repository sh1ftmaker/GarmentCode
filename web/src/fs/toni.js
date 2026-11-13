// FreeSewing "Toni" T-shirt / top (https://freesewing.eu/designs/toni/, MIT, design by
// Jonathan Haas): a knit top on its own block (not Brian) with set-in sleeves, an optional
// bust dart and optional ribbing at the hem and cuffs. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso and arms for the drape.
//
// Toni (and the designs built on it: Tina, Hannah) draws its front and back without a
// closed `seam` path: the outline is a list of named paths (hem, side seam, armhole,
// shoulder, collar, centre) joined by FreeSewing's sa macro. knitSeam() chains those named
// paths into a `seam` path on the drafted part, so the seam table can name its edges by
// FreeSewing path name instead of by operation number (which changes with the dart and
// the construction).
import { upperFrame, sleeveMap, outlineSpan, bandRingMap, bandOnEdge, edgeEnds, torsoMap } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'toni';
export const name = 'Toni T-shirt';
export const short = 'T-shirt';
export const exportName = 'Toni';
export const url = 'https://freesewing.eu/designs/toni/';
export const author = 'Jonathan Haas';
export const settings = { expand: true };   // draft the ribbing too
export const icon = 'M18 6l6-1c1 4 7 4 8 0l6 1 12 9-5 9-6-4v31H17V20l-6 4-5-9z';
export const stretchNote = 'Toni is drafted for knit fabric. The 3D drape uses a relaxed copy: ribbing cut to the length of the edge it is sewn to (not shorter and stretched), and no negative ease (the simulated cloth barely stretches). The pattern view, cutting layout and exports use the real pattern.';

const SELECTS = new Set(['construction', 'neckBasedOn']);
export const design = {
  fit: {
    chestEase: { v: 5, range: [-10, 25], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your upper body' },
    waistEase: { v: 12, range: [-20, 40], type: 'float', name: 'Waist ease (%)', help: 'The amount of ease at your waist' },
    seatEase: { v: 8, range: [-20, 40], type: 'float', name: 'Seat ease (%)', help: 'The amount of ease at your seat' },
    bicepsEase: { v: 15, range: [-10, 30], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm. Note that while we try to respect this, fitting the sleeve to the armhole takes precedence over respecting the exact amount of ease.' },
    ribbingStretch: { v: 5, range: [0, 30], type: 'float', name: 'Ribbing stretch (%)', help: 'How much the ribbing is stretched relative to the main fabric' },
  },
  style: {
    lengthBelowWaist: { v: 75, range: [-15, 100], type: 'float', name: 'Length (%)', help: 'The length of the top, measured from the waist down' },
    sleeveLength: { v: 30, range: [10, 120], type: 'float', name: 'Sleeve length (%)', help: 'The length of the sleeve as a percentage of the distance from the shoulder to the wrist' },
    sleeveWidth: { v: 30, range: [-10, 200], type: 'float', name: 'Sleeve width (%)', help: 'The width of the sleeve opening' },
    neckOpeningSize: { v: 80, range: [65, 150], type: 'float', name: 'Neck opening size (%)', help: 'Determines the circumference of the neck opening' },
    neckWidth: { v: 60, range: [0, 130], type: 'float', name: 'Neck width (%)', help: 'Make the neck opening deep and narrow, or wide and shallow.' },
    armholeDepth: { v: 10, range: [0, 40], type: 'float', name: 'Armhole depth (%)', help: 'Controls the depth of the armhole. Higher values make a deeper armhole.' },
    ribbingHeight: { v: 0, range: [0, 1000], type: 'float', name: 'Ribbing height (%)', help: 'Width of the ribbing (as a percentage of a 1 cm seam allowance), set to 0 to disable' },
  },
};

/** Options for a Toni-family design; relaxed (the drape copy): unstretched ribbing, no negative ease. */
export function knitOptions(d, { relaxed = false } = {}, keep = SELECTS) {
  const o = treeOptions(d, keep);
  o.construction = 'set-in';
  if (relaxed) {
    o.ribbingStretch = 0;
    for (const k of ['chestEase', 'waistEase', 'seatEase', 'bicepsEase']) if (k in o) o[k] = Math.max(0, o[k]);
  }
  return o;
}
export const options = (d, opts) => knitOptions(d, opts);

const MEASUREMENTS = ['head', 'biceps', 'chest', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope', 'waistToArmpit',
  'waistToSeat', 'seat', 'waist', 'shoulderToWrist', 'wrist', 'waistBack', 'seatBack', 'highBust', 'bustFront', 'hips', 'waistToHips',
  'hpsToBust', 'bustSpan', 'hpsToWaistFront'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

// ------------------------------------------------------------------ outline as a seam path
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;   // mm
/**
 * Chain the part's named paths (in order, each continuing where the previous one ends)
 * into `part.paths.seam`. Returns { name: [op numbers] } for the edges each path became.
 * Kept on the part, so spec() and placement() (both called per draft) share it.
 */
export function knitSeam(part, names) {
  if (part.__knitEdges) return part.__knitEdges;
  const ops = [], edges = {};
  let first = null, cur = null;
  for (const n of names) {
    const p = part.paths[n];
    if (!p) throw new Error(`${part.name}: no path ${n}`);
    edges[n] = [];
    let at = null;
    for (const op of p.ops) {
      if (op.type === 'move') {
        at = op.to;
        if (!first) { first = at; ops.push({ type: 'move', to: at }); cur = at; }
        else if (!near(at, cur)) throw new Error(`${part.name}: ${n} does not continue the outline`);
        continue;
      }
      if (op.type !== 'line' && op.type !== 'curve') continue;
      if (near(op.to, cur) && (op.type === 'line' || (near(op.cp1, cur) && near(op.cp2, cur)))) continue;   // empty
      edges[n].push(ops.length - 1);
      ops.push(op);
      cur = op.to;
    }
  }
  if (!near(cur, first)) ops.push({ type: 'line', to: first });
  part.paths.seam = { ops, hidden: true, __synthetic: true };
  part.__knitEdges = edges;
  return edges;
}

/** Chain the edges of named paths (seam-table items), optionally backwards. */
export const chain = (piece, ids, rev = false) => (rev ? [...ids].reverse().map(i => [piece, i, true]) : ids.map(i => [piece, i]));
/** Edge ids on one half of a piece cut on the fold ('m' = the mirrored half). */
export const half = (ids, m) => ids.map(i => (m ? 'm' + i : String(i)));

/**
 * Edges of a Toni front or back (set-in construction): the side seam (without the dart),
 * the dart legs, armhole, shoulder, collar and centre.
 */
export function toniBodyEdges(draft, part, front) {
  const store = draft.setStores[0];
  const upper = (store.get(front ? 'upperPathsFront' : 'upperPaths') || []).map(u => u.p);
  const side = part.paths.dart ? ['sideSeam1', 'dart', 'sideSeam2'] : ['sideSeam'];
  const E = knitSeam(part, ['hem', ...side, ...upper, 'center']);
  return {
    E,
    hem: E.hem,
    side: part.paths.dart ? [...E.sideSeam1, ...E.sideSeam2] : E.sideSeam,
    dart: E.dart || null,
    armhole: E.armhole,
    shoulder: E.shoulder,
    collar: E[front ? 'frontCollar' : 'backCollar'],
    center: E.center[0],
  };
}

/*
 * Toni (set-in): front / back cut on the fold (their 'center' edge); edges by FreeSewing
 *   path (toniBodyEdges): hem (centre -> side), side seam (up, the front's around its dart),
 *   armhole (side -> shoulder), shoulder (-> neck), collar (-> centre).
 * sleeve (seam path): 0 underarm at -x (down), 1-2 hem (-x -> +x), 3 underarm at +x (up),
 *   4-8 cap from the front (+x) to the back (-x).
 * waistband / cuff (with ribbing): 2h x length, folded lengthwise (the drape uses one
 *   layer): 2 the long edge sewn on (along y), 1 and 3 the ends, sewn into a ring.
 * The front's local +x and the back's mirrored half are the wearer's left. The unmirrored
 * sleeve (front at +x) is the wearer's right sleeve.
 */
export function toniSeams(draft, { front = 'front', back = 'back', frontPart, backPart, sleeves = true, ribbing = false, hem = true } = {}) {
  const parts = draft.parts[0];
  const F = toniBodyEdges(draft, parts[frontPart], true), B = toniBodyEdges(draft, parts[backPart], false);
  const seams = [];
  for (const s of [1, -1]) {
    const fm = s < 0, bm = s > 0;   // mirrored halves: the front's on the right, the back's on the left
    const sl = s > 0 ? 'sleeve_l' : 'sleeve_r', cf = s > 0 ? 'cuff_l' : 'cuff_r';
    seams.push(
      { a: chain(front, half(F.side, fm)), b: chain(back, half(B.side, bm)) },
      { a: chain(front, half(F.shoulder, fm)), b: chain(back, half(B.shoulder, bm)) },
    );
    if (F.dart) seams.push({ a: [[front, half(F.dart, fm)[0]]], b: [[front, half(F.dart, fm)[1], true]] });
    if (sleeves) {
      seams.push(
        // armhole: front (side -> shoulder), back (shoulder -> side) to the cap (front -> back)
        { a: [...chain(front, half(F.armhole, fm)), ...chain(back, half(B.armhole, bm), true)], b: chain(sl, [4, 5, 6, 7, 8]) },
        { a: [[sl, 0]], b: [[sl, 3, true]] },
      );
      if (ribbing) seams.push({ a: chain(sl, [1, 2]), b: [[cf, 2]] }, { a: [[cf, 1]], b: [[cf, 3, true]] });
    }
  }
  if (ribbing && hem) seams.push(
    // the hem all round, from the left side seam over the back, the right side and the front
    { a: [...chain(back, half(B.hem, true), true), ...chain(back, half(B.hem, false)), ...chain(front, half(F.hem, true), true), ...chain(front, half(F.hem, false))],
      b: [['waistband', 2]] },
    { a: [['waistband', 1]], b: [['waistband', 3, true]] },
  );
  return { seams, F, B };
}

export function toniPieces(prefix, { ribbing, sleeves = true, frontPart = 'toni.front', backPart = 'toni.back', centers }) {
  const pieces = [
    { name: 'front', part: frontPart, fold: centers.front, label: 'body' },
    { name: 'back', part: backPart, fold: centers.back, label: 'body' },
  ];
  if (sleeves) pieces.push(
    { name: 'sleeve_l', part: 'toni.sleeve', mirror: true, label: 'arm', follow: 12 },
    { name: 'sleeve_r', part: 'toni.sleeve', label: 'arm', follow: 12 },
  );
  if (ribbing) {
    pieces.push({ name: 'waistband', part: 'toni.waistband', label: 'body', doubled: 'x', follow: 6 });
    if (sleeves) pieces.push(
      { name: 'cuff_l', part: 'toni.cuff', mirror: true, label: 'arm', doubled: 'x', follow: 6 },
      { name: 'cuff_r', part: 'toni.cuff', label: 'arm', doubled: 'x', follow: 6 },
    );
  }
  return pieces;
}

const ribbed = (draft) => !!draft.parts[0]['toni.waistband']?.paths?.seam && !draft.parts[0]['toni.waistband'].hidden;

export function spec(o, draft) {
  const ribbing = ribbed(draft);
  const { seams, F, B } = toniSeams(draft, { frontPart: 'toni.front', backPart: 'toni.back', ribbing });
  return { pieces: toniPieces('toni', { ribbing, centers: { front: F.center, back: B.center } }), seams, labels: {} };
}

// ------------------------------------------------------------------ placement
/** Sleeve maps for Toni's sleeve: unmirrored = the wearer's right arm (front at local +x). */
export function toniSleeves(F, part) {
  const bicepsY = -part.points.bicepsLeft.y / 10;
  const out = {};
  for (const mirror of [false, true]) {
    const loop = pieceLoop(part, { mirror });
    out[mirror] = { loop, map: sleeveMap(F, { sx: mirror ? 1 : -1, span: outlineSpan(loop), bicepsY, frontSign: mirror ? -1 : 1, atCrease: true }) };
  }
  return out;
}

/**
 * Torso maps for a front and back drawn like Brian's (centre at x = 0, side at +x), as
 * tops.js brianTorso, but with the garment's half girth taken no lower than the bottom of
 * the side seams: below it (a hem curving down to the centre) the outline narrows to a
 * point, and a girth of a few cm there would wrap the centre of the hem around to the back.
 *  loops: { front, back } outline loops (unfolded); sideBottomY: pattern height of the side
 *  seams' lower ends; shoulder: { front, back } [neck end, shoulder end] of the shoulder seams.
 */
export function knitTorso(F, { loops, sideBottomY, armholeY, shoulder, armholeX = null, gap = 1.5, frontGap = gap }) {
  const sf = outlineSpan(loops.front), sb = outlineSpan(loops.back);
  const half = (s, y) => { const r = s(y); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  const girth = (y) => { const yy = Math.max(y, sideBottomY); return half(sf, yy) + half(sb, yy); };
  const line = (n, s, ax) => ({ hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])), ...(ax != null ? { shoulderX: s[0], armholeX: ax } : {}) });
  const lf = line(...shoulder.front, armholeX && armholeX.front), lb = line(...shoulder.back, armholeX && armholeX.back);
  return {
    girth,
    front: torsoMap(F, { side: 1, xSign: 1, ...lf, girth, armholeY, gap: frontGap }),
    back: torsoMap(F, { side: -1, xSign: -1, ...lb, girth, armholeY, gap }),
    map: (side, g) => torsoMap(F, { side, xSign: side, ...(side > 0 ? lf : lb), girth, armholeY, gap: g }),
  };
}
/** [neck end, shoulder end] of a seam-path edge (the end with the smaller x is the neck end). */
export function seamEnds(part, op) {
  const e = pathEdges(part.paths.seam)[op], a = e[0], b = e[e.length - 1];
  return a[0] < b[0] ? [a, b] : [b, a];
}
/** First / last point of a chain of seam-path ops. */
export function chainEnds(part, ops) {
  const E = pathEdges(part.paths.seam), a = E[ops[0]], b = E[ops[ops.length - 1]];
  return [a[0], b[b.length - 1]];
}

/** Placement of a Toni-family top: torso, sleeves, ribbing. */
export function toniPlacement(draft, m, body, { frontPart = 'toni.front', backPart = 'toni.back', extra = null } = {}) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const front = parts[frontPart], back = parts[backPart];
  const Ef = toniBodyEdges(draft, front, true), Eb = toniBodyEdges(draft, back, false);
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const T = knitTorso(F, {
    loops: { front: pieceLoop(front, { fold: Ef.center }), back: pieceLoop(back, { fold: Eb.center }) },
    sideBottomY: Math.max(chainEnds(front, Ef.side)[0][1], chainEnds(back, Eb.side)[0][1]),
    armholeY: Math.min(P(front.points.armhole)[1], P(back.points.armhole)[1]),
    shoulder: { front: seamEnds(front, Ef.shoulder[0]), back: seamEnds(back, Eb.shoulder[0]) },
    armholeX: { front: P(front.points.armhole)[0], back: P(back.points.armhole)[0] },
  });
  const sleeves = parts['toni.sleeve'] && !parts['toni.sleeve'].hidden ? toniSleeves(F, parts['toni.sleeve']) : null;
  const cfHem = front.points.cfHem || front.points.cbHem;
  const hemY = T.front(0, -cfHem.y / 10)[1];
  const ex = extra ? extra({ F, T, sleeves, parts }) : null;
  return (ps, loop) => {
    const r = ex && ex(ps, loop);
    if (r) return r;
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
      return bandOnEdge(S.map, [edgeEnds(S.loop, 1)[0], edgeEnds(S.loop, 2)[1]], edgeEnds(loop, 2));
    }
    return null;
  };
}

export const placement = (draft, m, body) => toniPlacement(draft, m, body);
export const attachLevels = () => ({});
export const lift = 2;
