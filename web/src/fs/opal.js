// FreeSewing "Opal" overalls (https://freesewing.eu/designs/opal/, MIT, design by Thrunic):
// trouser legs, a front bib, and backs that rise into a back bib whose straps cross over the
// centre back (forming a hexagon) and run over the shoulders to the top of the bib.
// Measurements from the mannequin, options as sliders, seam table and placement around the
// legs (lower.js trouserMaps) and the torso (place.js torsoMap) for the drape.
//
// Opal draws its outlines as open paths (the front's seam without the hem, the back as a
// centre seam, an outseam, a leg hem and a hem round the back bib and strap), so closed
// seam paths are put together here (closeSeams) before the pieces are converted.
//
// Construction, from FreeSewing's instructions: the waistband is folded in layers and
// topstitched on the inside over the bib-to-front seam, and the bib placket on the inside
// of the bib's top; both are cut but not simulated, as are the pockets. The two backs
// overlap in the hexagon (the left back's strap crosses over the right's) and are
// topstitched round it; the drape sews them along the hexagon's sides. The straps are
// buckled to the bib's top corners; FreeSewing cuts them longer (strap length, 160%) for
// adjusting, and the drape uses straps at their buckled length (100%).
import { upperFrame, torsoMap } from './place.js';
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, trouserMaps, fsOptions, partOutline } from './lower.js';
import { partOutline as cutOutline } from './generic.js';

export const id = 'opal';
export const name = 'Opal overalls';
export const short = 'Overalls';
export const exportName = 'Opal';
export const url = 'https://freesewing.eu/designs/opal/';
export const author = 'Thrunic';
export const settings = { expand: true };
export const icon = 'M17 4h4v14h14V4h4v20h3l3 30H34l-6-24-6 24H11l3-30h3z';
export const stretchNote = 'The legs, bib, back bib and straps drape. The straps are draped buckled at their designed length (FreeSewing cuts them longer, by the strap length option, for adjusting); the slash pockets are drawn closed. The waistband and bib placket (topstitched on the inside) and the pockets and hammer loop are cut but not simulated.';

const pct = (v, range, name, help) => ({ v, range, type: 'float', fs: 'pct', name, help });
export const design = {
  fit: {
    waistEase: pct(15, [0, 40], 'Waist ease (%)', 'Controls how wide the garment will be around the waist.'),
    seatEase: pct(10, [0, 40], 'Seat ease (%)', 'Controls how wide the garment will be around the seat.'),
    legHemEase: pct(20, [0, 100], 'Leg hem ease (%)', 'Controls how much ease there is at the bottom of the legs.'),
    crotchDrop: pct(5, [0, 20], 'Crotch drop (%)', 'Controls vertical ease at the crotch fork.'),
  },
  style: {
    legLength: pct(30, [10, 120], 'Leg length (%)', 'Controls how long the legs of the garment will be.'),
    waistPosition: pct(0, [-50, 50], 'Waist position (%)', 'Controls where the waistband is on the front of the overalls. 0 is at the natural waist and -100% is at the seat.'),
    outseamHeight: pct(5, [1, 20], 'Outseam height (%)', 'Controls how far up past the waist the outseam extends, and thus how far up the front and back bibs start.'),
    bibHeight: pct(70, [20, 90], 'Bib height (%)', 'Controls how tall the front bib is.'),
    bibWidth: pct(50, [20, 100], 'Bib width (%)', 'Controls how wide the top of the front bib is.'),
    backBibHexagonVerticalPosition: pct(50, [10, 90], 'Back bib hexagon vertical position (%)', 'Controls how far up the hexagon formed by the straps crossing is.'),
    strapWidth: pct(4, [2, 10], 'Strap width (%)', 'Controls how wide the straps are.'),
    strapLength: pct(160, [100, 200], 'Strap length (%)', 'Controls how long the straps are (the extra length is for adjusting them at the buckles).'),
    pocketSlash: { v: true, type: 'bool', fs: 'bool', name: 'Slash pocket', help: 'Toggles whether or not to include slash (front) pockets in the pattern.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) { o.strapLength = 1; o.pocketSlash = false; }   // buckled straps, pocket openings drawn closed
  return o;
}
const MEASUREMENTS = ['waist', 'waistBack', 'seat', 'seatBack', 'waistToSeat', 'upperLeg', 'hpsToWaistFront', 'hpsToWaistBack',
  'waistToUpperLeg', 'waistToArmpit', 'waistToFloor', 'inseam', 'ankle'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

// ------------------------------------------------------------------ closed outlines
const opsOf = (path) => path.ops.filter(o => o.type !== 'move');
/** Give the parts Opal draws with open paths a closed `seam` (once per draft). */
function closeSeams(draft) {
  const parts = draft.parts[0];
  if (parts.__opalClosed) return;
  const fp = parts['opal.front'], bib = parts['opal.bib'], bp = parts['opal.back'];
  // front: outseam hem -> waist -> centre front -> crotch -> fork -> inseam hem, then the hem
  fp.paths.seam = { ops: [...fp.paths.seam.ops.filter(o => o.type !== 'close'), { type: 'close' }] };
  // bib: side, waist (two curves), side, then the hem round the top
  bib.paths.seam = { ops: [...bib.paths.seam.ops, ...opsOf(bib.paths.hem).slice(0, -1), { type: 'close' }] };
  // back: centre seam (hexagon bottom -> waist -> fork -> inseam hem), leg hem, outseam, hem round the bib and strap
  const B = bp.points;
  bp.paths.seam = { ops: [{ type: 'move', to: B.bibHexagonBottom }, ...opsOf(bp.paths.centerSeam), { type: 'line', to: B.outseamHem },
    { type: 'line', to: B.waist }, ...opsOf(bp.paths.hem), { type: 'close' }] };
  // the cut-only pieces: their cutting outline (as generic.js finds it), as straight lines
  for (const [n, part] of Object.entries(parts)) {
    if (part === fp || part === bib || part === bp || part.hidden) continue;
    if (part.paths.seam && part.paths.seam.ops.some(o => o.type === 'close')) continue;
    const out = cutOutline(part);
    if (!out) continue;
    const pt = ([x, y]) => ({ x: 10 * x, y: -10 * y });
    part.paths.seam = { ops: [{ type: 'move', to: pt(out[0]) }, ...out.slice(1).map(p => ({ type: 'line', to: pt(p) })), { type: 'close' }] };
    void n;
  }
  Object.defineProperty(parts, '__opalClosed', { value: true, enumerable: false });
}

const P2 = (pt) => [pt.x / 10, -pt.y / 10];
const near = (p, q) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
/** Lengths (cm) of a part's seam ops, by op number. */
function opLengths(part) {
  const L = [];
  let cur = null, first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { cur = first = op.to; continue; }
    const to = op.type === 'close' ? first : op.to;
    if (op.type === 'curve') {
      let l = 0, p = cur;
      for (let i = 1; i <= 32; i++) {
        const t = i / 32, s = 1 - t;
        const q = { x: s ** 3 * cur.x + 3 * s * s * t * op.cp1.x + 3 * s * t * t * op.cp2.x + t ** 3 * to.x, y: s ** 3 * cur.y + 3 * s * s * t * op.cp1.y + 3 * s * t * t * op.cp2.y + t ** 3 * to.y };
        l += Math.hypot(q.x - p.x, q.y - p.y); p = q;
      }
      L.push(l / 10);
    } else L.push(Math.hypot(to.x - cur.x, to.y - cur.y) / 10);
    cur = to;
  }
  return L;
}

/*
 * Edges (found by point name; bib by op number, its shape is fixed):
 *  front (one leg; the drafted one is the wearer's right, the mirrored one the left): outseam
 *    outseamHem -> waist (or -> slashSide, the pocket opening above it), waist (-> cfWaist),
 *    crotch seam cfWaist -> fork, inseam fork -> inseamHem, hem.
 *  back (one leg, as the front): centre seam bibHexagonBottom -> cfWaist -> fork, inseam
 *    fork -> inseamHem, leg hem, outseam outseamHem -> waist (above the front's waist by the
 *    outseam height), then the hem: back bib side, hexagon inside, strap, hexagon outside.
 *  bib (x grows towards the wearer's right): 0 left side (top -> waist), 1-2 waist (left ->
 *    centre -> right), 3 right side (waist -> top), 4-6 hem (right top corner -> top -> left).
 */
function edges(draft) {
  const parts = draft.parts[0], fp = parts['opal.front'], bp = parts['opal.back'], bib = parts['opal.bib'];
  const F = fp.points, B = bp.points;
  const slash = !!fp.points.slashSide && fp.paths.seam.ops.some(o => o.to && near(o.to, fp.points.slashSide));
  const e = {
    fp, bp, bib, slash,
    fOut: opsBetween(fp, F.outseamHem, slash ? F.slashSide : F.waist),
    fWaist: opsBetween(fp, slash ? F.slashTop : F.waist, F.cfWaist),
    fCrotch: opsBetween(fp, F.cfWaist, F.fork),
    fIn: opsBetween(fp, F.fork, F.inseamHem),
    bCentre: opsBetween(bp, B.bibHexagonBottom, B.fork),
    bIn: opsBetween(bp, B.fork, B.inseamHem),
    bOut: opsBetween(bp, B.outseamHem, B.waist),
    hexOut: opsBetween(bp, B.bibHexagonUpperOutside, B.bibHexagonLowerOutside),   // down
    hexIn: opsBetween(bp, B.bibHexagonLowerInside, B.bibHexagonUpperInside),      // up
    strapEnd: opsBetween(bp, B.strapEndInside, B.strapEndOutside),
  };
  return e;
}

export function spec(o, draft) {
  closeSeams(draft);
  const E = edges(draft), parts = draft.parts[0];
  const Lb = opLengths(E.bp), Lf = opLengths(E.fp), Lbib = opLengths(E.bib);
  const sum = (L, ids) => ids.reduce((s, i) => s + L[i], 0);
  const bOutLen = sum(Lb, E.bOut), ext = Lbib[3];
  const seams = [];
  for (const s of ['_r', '_l']) {
    const f = 'front' + s, b = 'back' + s, right = s === '_r';
    const bibSide = right ? [['bib', 3]] : [['bib', 0, true]];
    const fOut = chain(f, E.fOut);
    if (E.bOut.length === 1) {
      // the back's outseam: below the front's top (or its pocket opening, which is unsewn)
      // to the front's outseam, above the front's waist (the outseam extension) to the bib's
      // side, as separate seams (a short extension would otherwise be snapped away)
      const k = E.bOut[0], hi = 1 - ext / bOutLen, lo = E.slash ? sum(Lf, E.fOut) / bOutLen : hi;
      seams.push({ a: fOut, b: [[b, k, false, 0, lo]] }, { a: bibSide, b: [[b, k, false, hi, 1]] });
    } else seams.push({ a: [...fOut, ...bibSide], b: chain(b, E.bOut) });   // outseam, hem up
    seams.push(
      { a: chain(f, E.fIn), b: chain(b, E.bIn) },                              // inseam, fork down
      // waist: the front's (centre -> side) to the bib's
      { a: chain(f, E.fWaist, true), b: right ? [['bib', 2, false, 1 - sum(Lf, E.fWaist) / Lbib[2], 1]] : [['bib', 1, true, 0, sum(Lf, E.fWaist) / Lbib[1]]] },
    );
  }
  seams.push(
    { a: chain('front_r', E.fCrotch), b: chain('front_l', E.fCrotch) },         // centre front, waist down
    { a: chain('back_r', E.bCentre), b: chain('back_l', E.bCentre) },           // centre back, hexagon down
    // the overlapping backs, sewn along the hexagon's sides
    { a: chain('back_r', E.hexOut), b: chain('back_l', E.hexIn, true) },
    { a: chain('back_l', E.hexOut), b: chain('back_r', E.hexIn, true) },
  );
  // straps (crossing: the right back's goes over the left shoulder) to the bib's top corners
  const top = E.bib.points.cfTop.dist(E.bib.points.topSide) * 2 / 10, w = Math.min(0.45, sum(Lb, E.strapEnd) / top);
  seams.push(
    { a: chain('back_l', E.strapEnd, true), b: [['bib', 5, false, 0, w]] },     // right corner (outer -> inner)
    { a: chain('back_r', E.strapEnd), b: [['bib', 5, false, 1 - w, 1]] },        // left corner (inner -> outer)
  );
  // the slash pocket bags (cut 2), shields (cut 2), back pockets (one per back), and the
  // one-offs; parts switched off by the options are hidden
  const has = (n) => parts[n] && !parts[n].hidden && parts[n].paths.seam;
  const extra = [];
  const pair = (nm, part) => { if (has(part)) extra.push({ name: nm + '_r', part, cutOnly: true }, { name: nm + '_l', part, mirror: true, cutOnly: true }); };
  const one = (nm, part) => { if (has(part)) extra.push({ name: nm, part, cutOnly: true }); };
  one('waistband', 'opal.waistband');
  one('bib_placket', 'opal.bibPlacket');
  pair('slash_bag', 'opal.pocketSlash');
  pair('slash_shield', 'opal.pocketSlashShield');
  one('bib_patch', 'opal.pocketBib');
  pair('back_patch', 'opal.pocketBack');
  one('carpenter_patch', 'opal.pocketCarpenter');
  one('carpenter_patch_extra', 'opal.pocketCarpenterExtra');
  one('hammer_loop', 'opal.hammerLoop');
  return {
    pieces: [
      { name: 'front_r', part: 'opal.front', label: 'leg' },
      { name: 'front_l', part: 'opal.front', mirror: true, label: 'leg' },
      { name: 'back_r', part: 'opal.back', label: 'body' },
      { name: 'back_l', part: 'opal.back', mirror: true, label: 'body' },
      { name: 'bib', part: 'opal.bib', label: 'body' },
      ...extra,
    ],
    seams,
    labels: {},
  };
}

// ------------------------------------------------------------------ placement
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's y = 0 (the front's natural waist)

export function placement(draft, m, body) {
  closeSeams(draft);
  const parts = draft.parts[0], fp = parts['opal.front'], bp = parts['opal.back'], bib = parts['opal.bib'];
  const B = bp.points;
  const W = waistY(m), gap = 1.5;
  // legs (the wearer's right leg pieces as drafted; Opal's front has its outseam at x = 0, like the back)
  const sections = lowerSections(body, W + 8);
  const legs = trouserMaps(sections, {
    waistY: W, gap: 1.2,
    front: { loop: partOutline(fp), outSign: 1, cs: P2(fp.points.crossSeamCurveStart), forkY: P2(fp.points.fork)[1] },
    back: { loop: partOutline(bp), outSign: 1, cs: P2(bp.points.crossSeamCurveStart), forkY: P2(bp.points.fork)[1] },
  });
  // trouserMaps lays the crotch extensions of both legs in the body's centre plane (and, for
  // wide legs, scales each leg's ring up about its centre, so the rings cross between the
  // thighs): keep each leg on its own side of the centre plane, below where the crotch
  // curve starts. Sewn edges there meet when the seams are welded.
  const ownSide = (f, y0) => (x, y) => {
    const p = f(x, y), t = sm((y0 + 2 - y) / 4);
    if (t > 0 && p[0] > -0.8) p[0] = p[0] * (1 - t) - 0.8 * t;
    return p;
  };
  // the sections are one per cm and their landmarks (front-most point, centre front) jump
  // from one to the next: average the legs' maps over a few cm of height
  const smoothY = (f) => (x, y) => {
    const q = [0, 0, 0];
    for (const dy of [-1.5, -0.75, 0, 0.75, 1.5]) { const p = f(x, y + dy); q[0] += p[0] / 5; q[1] += (p[1] - dy) / 5; q[2] += p[2] / 5; }
    return q;
  };
  legs.front = smoothY(legs.front); legs.back = smoothY(legs.back);
  legs.front = ownSide(legs.front, P2(fp.points.crossSeamCurveStart)[1]);
  legs.back = ownSide(legs.back, P2(bp.points.crossSeamCurveStart)[1]);
  // Opal's crotch extensions (front and back together) are longer than the body is deep
  // between the legs: where they would run past each other under the crotch, they hang down
  // instead, each on its own side of where they meet
  const ext = (part) => Math.abs(P2(part.points.fork)[0] - P2(part.points.crossSeamCurveStart)[0]);
  const fFrac = ext(fp) / (ext(fp) + ext(bp));
  const hang = (f, sgn) => (x, y) => {
    const p = f(x, y);
    if (p[0] < -2.5) return p;
    const S = sections(p[1]), zf = S.at(S.sCF)[1], zb = S.at(S.sCB)[1];
    const zs = zf - (zf - zb) * fFrac + 0.6 * sgn, e = sgn * (zs - p[2]);
    if (e <= 0) return p;
    const w = sm((p[0] + 2.5) / 1.5);
    return [p[0], p[1] - e * w, p[2] + (zs - p[2]) * w];
  };
  legs.front = hang(legs.front, 1);
  legs.back = hang(legs.back, -1);
  // torso: bib and back bib, in coordinates from the centre front / back and the shoulder line
  const F = upperFrame(body, m);
  const S36 = (S) => 0.5 * (S.arcP[S.arcP.length - 1] + S.arcN[S.arcN.length - 1]);
  const girth = (y) => S36(F.sec(F.Yhps + y)) + Math.PI * gap;   // the body's own half girth: arcs as drafted
  const xn = Math.max(4, F.m.neck_w / 2), slope = Math.tan(clamp(m.shoulder_incl ?? 20, 8, 26) * Math.PI / 180);
  const topY = (ax) => -slope * Math.max(0, ax - xn);
  const mk = (side, g) => torsoMap(F, { side, xSign: -1, hps: [xn, 0], slope, girth, armholeY: 0, gap: g });
  const Tf = mk(1, gap), Tb = mk(-1, gap), Tb2 = mk(-1, gap + 0.9);
  // the pattern's waist (y = 0) at the body's waist: the torso coordinates' y = y - H
  const H = Tf(0, -30)[1] + 30 - W;
  // bib: x from its centre, growing towards the wearer's right (torsoMap xSign -1)
  const bc = P2(bib.points.cfTop)[0];
  const bibMap = (x, y) => Tf(x - bc, y - H);
  // back: x from the centre back line (the centre seam's top, the hexagon's middle above it)
  const cw = P2(B.cfWaist), hb = P2(B.bibHexagonBottom), ht = P2(B.bibHexagonTop);
  const hw = Math.abs(P2(B.bibHexagonLowerInside)[0] - hb[0]);
  const xCB = (y) => (y >= hb[1] ? hb[0] : cw[0] + (hb[0] - cw[0]) * clamp(y / (hb[1] || 1), 0, 1));
  const backUpper = (x, y, top) => {
    const xt = x - xCB(y), yt = y - H, d = topY(Math.abs(xt)) - yt;
    // over the shoulder the strap carries on down the front (as the bib's coordinates)
    if (d < 0) return Tf(xt, topY(Math.abs(xt)) + d);
    const p = Tb(xt, yt);
    if (!top) return p;
    // the left back lies over the right one in the hexagon
    const w = sm((1 - Math.abs(xt) / hw) / 0.35) * sm((y - hb[1]) / 3) * sm((ht[1] + 4 - y) / 4);
    if (w <= 0) return p;
    const q = Tb2(xt, yt);
    return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w];
  };
  const lift = (L, U, y0, y1) => (x, y) => {   // legs below y0, torso above y1
    const a = sm((y - y0) / (y1 - y0));
    if (a <= 0) return L(x, y);
    const u = U(x, y);
    if (a >= 1) return u;
    const l = L(x, y);
    return [l[0] + (u[0] - l[0]) * a, l[1] + (u[1] - l[1]) * a, l[2] + (u[2] - l[2]) * a];
  };
  const mirrorX = (f) => (x, y) => { const p = f(-x, y); return [-p[0], p[1], p[2]]; };
  const backR = lift(legs.back, (x, y) => backUpper(x, y, false), -2, 6);
  const backL = mirrorX(lift(legs.back, (x, y) => backUpper(x, y, true), -2, 6));   // the left back, mirrored
  return (ps) => {
    if (ps.name === 'front_r') return legs.front;
    if (ps.name === 'front_l') return mirrorX(legs.front);
    if (ps.name === 'back_r') return backR;
    if (ps.name === 'back_l') return backL;
    if (ps.name === 'bib') return bibMap;
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
