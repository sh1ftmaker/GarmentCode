// FreeSewing "Crux" climbing pants (https://freesewing.eu/designs/crux/, MIT, design by
// Wouter Van Wageningen, built on Cornelius): a front and a back per leg, a diamond gusset
// between the legs, a zip fly, a straight waistband, back waist darts and pockets.
// Measurements from the mannequin, options as sliders, seam table and placement around the
// hips and legs for the drape (legwear.js); the pocket bags, facings and fly shield are cut but
// not simulated.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, waistBandMap } from './lower.js';
import { loc, rigid, opsPoly, legPairPlacement } from './legwear.js';

export const id = 'crux';
export const name = 'Crux climbing pants';
export const short = 'Climbing pants';
export const exportName = 'Crux';
export const url = 'https://freesewing.eu/designs/crux/';
export const author = 'Wouter Van Wageningen';
export const settings = { expand: true };
export const icon = 'M14 5h28v5l4 42H35l-6-30h-2l-6 30H10l4-42zM14 10h28M24 22l4 4 4-4';
export const stretchNote = 'The legs, the gusset and the waistband drape; the pocket bags, pocket facings and fly shield are cut but not simulated, and the fly is drawn closed (the left front over the right). The knee darts of the articulated knee are marked on the pattern but not sewn in the drape.';

export const design = {
  fit: {
    fullness: { v: 0, range: [0, 25], type: 'float', fs: 'pct', name: 'Fullness (%)', help: 'Adds extra fullness to the legs.' },
    waistReduction: { v: 0, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist reduction (%)', help: 'Makes the waistband smaller than calculated.' },
    hipsShift: { v: 0, range: [-10, 10], type: 'float', fs: 'pct', name: 'Hip shift (%)', help: 'Shifts fabric from the front to the back.' },
    gussetDepth: { v: 20, range: [5, 25], type: 'float', fs: 'pct', name: 'Gusset depth (%)', help: 'How far down the legs the gusset extends.' },
    gussetWidthFront: { v: 25, range: [20, 50], type: 'float', fs: 'pct', name: 'Gusset width in the front (%)', help: 'How far up the front seam the gusset extends.' },
    gussetWidthBack: { v: 15, range: [5, 20], type: 'float', fs: 'pct', name: 'Gusset width in the back (%)', help: 'How far up the back seam the gusset extends.' },
    gussetExtraSpace: { v: 0, range: [0, 100], type: 'float', fs: 'pct', name: 'Extra gusset space (%)', help: 'Adds extra space between the front and the back in the gusset.' },
  },
  style: {
    legLength: { v: 'long', range: ['long', 'capris', 'shorts'], type: 'select', fs: 'list', name: 'Leg length', help: 'Long pants, capris or shorts.' },
    articulatedKnee: { v: true, type: 'bool', fs: 'bool', name: 'Articulated knee', help: 'Knee darts for a bent knee.' },
    waistbandLower: { v: 80, range: [0, 100], type: 'float', fs: 'pct', name: 'Waistband position (%)', help: 'Where the waistband sits between the waist (0%) and the hips (100%).' },
    waistBandWidth: { v: 3.2, range: [1, 10], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
    hemLength: { v: 3, range: [1, 10], type: 'float', fs: 'pct', name: 'Hem length (%)', help: 'Length of the hem allowance.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['waist', 'hips', 'inseam', 'seat', 'waistToKnee', 'waistToHips', 'waistToFloor', 'knee', 'waistBack', 'seatBack', 'waistToSeat', 'heel'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

// pockets and their facings draw their outlines under other names; convert.js reads `seam`
const OUTLINE = { 'crux.frontpocket': 'frontPocketSeam', 'crux.frontpocketfacing': 'frontPocketFacing', 'crux.backpocket': 'backPocketSeam', 'crux.backpocketfacing': 'backPocketFacing' };
function outlines(draft) {
  for (const [p, path] of Object.entries(OUTLINE)) {
    const part = draft.parts[0][p];
    if (part && !part.hidden && !part.paths.seam && part.paths[path]) part.paths.seam = part.paths[path];
  }
}
const has = (draft, k) => { const p = draft.parts[0][k]; return !!(p && !p.hidden && p.paths.seam); };

/*
 * Edges by point name (@freesewing/crux; y = 0 at the natural waist; both parts have the
 * centre seam towards -x and the side seam near x = 0, so the front is drafted as the
 * wearer's left leg and the back as the right):
 *  front: waist frontWaistCenter -> flyTopCenter, fly extension top -> flyTop, its edge ->
 *    flyBottom, its lower curve -> pZ, crotch seam -> gussetFront, gusset seam ->
 *    gussetFrontLeg, inseam -> hemIn, hem -> hemSide, outseam -> frontWaistCenter.
 *  back: waist p4 -> dartOpeningRight, dart -> dartOpeningLeft, waist -> p2, centre back ->
 *    gussetBack, gusset seam -> gussetBackLeg, inseam -> hemInBack, hem -> hemSideBack,
 *    outseam -> p4.
 *  gusset (a diamond): 0 right inseam tip -> front tip, 1 -> left inseam tip, 2 -> back tip,
 *    3 -> right inseam tip.
 *  waistband (on the fold at the centre back, 3, folded lengthwise): 2 the sewn edge from the
 *    fly end to the centre back.
 */
function edges(draft) {
  const parts = draft.parts[0], fp = parts['crux.front'], bp = parts['crux.back'];
  // FreeSewing's Crux fails to draft some combinations (e.g. shorts with the waistband near the waist)
  if (!fp?.paths.seam || !bp?.paths.seam) throw new Error('Crux could not draft the legs with these options (FreeSewing); try another leg length or waistband position');
  const F = fp.points, B = bp.points;
  const dart = opsBetween(bp, B.dartOpeningRight, B.dartOpeningLeft);
  return {
    fp, bp, F, B,
    fWaist: opsBetween(fp, F.frontWaistCenter, F.flyTopCenter), flyTop: opsBetween(fp, F.flyTopCenter, F.flyTop),
    flyEdge: opsBetween(fp, F.flyTop, F.flyBottom), flyCurve: opsBetween(fp, F.flyBottom, F.pZ),
    fCrotch: opsBetween(fp, F.pZ, F.gussetFront), fGusset: opsBetween(fp, F.gussetFront, F.gussetFrontLeg),
    fIn: opsBetween(fp, F.gussetFrontLeg, F.hemIn), fOut: opsBetween(fp, F.hemSide, F.frontWaistCenter),
    bWaistOut: opsBetween(bp, B.p4, B.dartOpeningRight), dartA: dart.slice(0, dart.length >> 1), dartB: dart.slice(dart.length >> 1),
    bWaistIn: opsBetween(bp, B.dartOpeningLeft, B.p2), bCentre: opsBetween(bp, B.p2, B.gussetBack),
    bGusset: opsBetween(bp, B.gussetBack, B.gussetBackLeg), bIn: opsBetween(bp, B.gussetBackLeg, B.hemInBack),
    bOut: opsBetween(bp, B.hemSideBack, B.p4),
  };
}

export function spec(o, draft) {
  outlines(draft);
  const E = edges(draft);
  const seams = [];
  for (const s of ['_r', '_l']) {
    const f = 'front' + s, b = 'back' + s;
    seams.push(
      { a: chain(f, E.fOut), b: chain(b, E.bOut) },   // outseam, hem up
      { a: chain(f, E.fIn), b: chain(b, E.bIn) },     // inseam, gusset down
      { a: chain(b, E.dartA), b: chain(b, E.dartB, true) },   // back waist dart, down to its tip
    );
  }
  seams.push(
    // the fly: the right front's extension carries on under the left front, the left's is
    // folded back under it, and the zip joins their edges; below it the crotch seam
    { a: chain('front_r', E.flyEdge), b: chain('front_l', E.flyEdge) },
    { a: chain('front_r', E.flyCurve), b: chain('front_l', E.flyCurve) },
    { a: chain('front_r', E.fCrotch), b: chain('front_l', E.fCrotch) },
    { a: chain('back_r', E.bCentre), b: chain('back_l', E.bCentre) },   // centre back, waist down
    // gusset: front tip -> inseam tips, back tip -> inseam tips
    { a: [...chain('front_r', E.fGusset), ...chain('back_r', E.bGusset, true)], b: [['gusset', 0, true], ['gusset', 3, true]] },
    { a: [...chain('front_l', E.fGusset), ...chain('back_l', E.bGusset, true)], b: [['gusset', 1], ['gusset', 2]] },
    // waistband: from the end of the right fly extension (under the left front) round the
    // right, the back and the left to the left centre front
    { a: [...chain('front_r', E.flyTop, true), ...chain('front_r', E.fWaist, true), ...chain('back_r', E.bWaistOut), ...chain('back_r', E.bWaistIn),
          ...chain('back_l', E.bWaistIn, true), ...chain('back_l', E.bWaistOut, true), ...chain('front_l', E.fWaist)],
      b: [['waistband', 2], ['waistband', 'm2', true]] },
  );
  // the waist, and the waistband's folded top edge (held up at its designed height)
  const lab = [['waistband', 0], ['waistband', 'm0']];
  for (const s of ['_r', '_l']) lab.push(...[...E.fWaist, ...E.flyTop].map(i => ['front' + s, i]), ...[...E.bWaistOut, ...E.bWaistIn].map(i => ['back' + s, i]));
  // cut only: four of each pocket bag and facing (FreeSewing: 2 + 2), the fly shield
  const four = (name, part) => (has(draft, part) ? [1, 2].flatMap(k => [
    { name: `${name}_r${k}`, part, cutOnly: true }, { name: `${name}_l${k}`, part, mirror: true, cutOnly: true }]) : []);
  return {
    pieces: [
      { name: 'front_r', part: 'crux.front', mirror: true },
      { name: 'front_l', part: 'crux.front' },
      { name: 'back_r', part: 'crux.back' },
      { name: 'back_l', part: 'crux.back', mirror: true },
      { name: 'gusset', part: 'crux.gusset', label: 'body', follow: 8 },
      { name: 'waistband', part: 'crux.waistband', label: 'body', fold: 3, doubled: 'x', follow: 6 },
      ...(has(draft, 'crux.flyshield') ? [{ name: 'fly_shield', part: 'crux.flyshield', fold: 1, cutOnly: true }] : []),
      ...four('bag_front', 'crux.frontpocket'), ...four('facing_front', 'crux.frontpocketfacing'),
      ...four('bag_back', 'crux.backpocket'), ...four('facing_back', 'crux.backpocketfacing'),
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;
const DROP = 2;   // start below the designed waist; the waist attachment brings it back up (garment.js)

export function placement(draft, m, body) {
  outlines(draft);
  const W = waistY(m), E = edges(draft), F = E.F, B = E.B, parts = draft.parts[0];
  const TF = rigid({ sx: -1 }), TB = rigid();
  // the front's centre line runs down the fly fold to the start of the crotch curve
  const fCentre = [TF(loc(F.flyTopCenter)), TF(loc(F.pZ)), ...opsPoly(E.fp, E.fCrotch, TF)];
  const front = { part: E.fp, T: TF, cs: TF(loc(F.pZ)), forkY: loc(F.gussetFrontLeg)[1], centre: fCentre };
  const back = { part: E.bp, T: TB, cs: TB(loc(B.p5)), forkY: loc(B.gussetBackLeg)[1], centre: opsPoly(E.bp, E.bCentre, TB) };
  // the crotch extensions either side of the gusset (its width front to back)
  const G = parts['crux.gusset'].points;
  const gp = Object.values(G).filter(p => Math.abs(p.x) < 1e5);
  const gw = (Math.max(...gp.map(p => p.x)) - Math.min(...gp.map(p => p.x))) / 10;
  const crotch = { front: Math.abs(TF(loc(F.gussetFront))[0] - front.cs[0]), back: Math.abs(TB(loc(B.gussetBack))[0] - back.cs[0]), gusset: gw };
  const legs = legPairPlacement(body, W, { front, back, crotch });
  const M = legs.maps;
  // the fly extensions (beyond the fold above pZ) lie under the left front: the right one
  // carried on past the centre front, the left one folded back, a little further in
  const foldX = TF(loc(F.flyTopCenter))[0], flyY = loc(F.pZ)[1];
  const inward = (p, d) => {
    const S = legs.sections(p[1]), dx = (p[0] < 0 ? S.cx : -S.cx) - p[0], dz = S.cz - p[2], l = Math.hypot(dx, dz) || 1;
    return [p[0] + d * dx / l, p[1], p[2] + d * dz / l];
  };
  const frontMap = (ps) => {
    const sx = ps.mirror ? -1 : 1, left = ps.name.endsWith('_l');
    return (x, y) => {
      const [X, Y] = TF([sx * x, y]);
      if (Y > flyY && X > foldX) {   // fly extension: on the left front, mirrored about the fold
        const p = M.front(2 * foldX - X, Y);
        return inward([-p[0], p[1], p[2]], left ? 0.5 : 1.0);
      }
      const p = M.front(X, Y);
      return left ? [-p[0], p[1], p[2]] : p;
    };
  };
  // gusset: between the legs, its tips down the inseams
  const gx = (Math.min(...gp.map(p => p.x)) + Math.max(...gp.map(p => p.x))) / 20, gy = (Math.min(...gp.map(p => p.y)) + Math.max(...gp.map(p => p.y))) / -20;
  const crotchY = W + loc(F.gussetFront)[1], S0 = legs.sections(crotchY + 2);
  const gusset = (x, y) => {
    const t = y - gy, a = Math.abs(t);
    return [Math.sign(t) * Math.min(a, 4), crotchY - 1 - Math.max(0, a - 4), S0.cz + (x - gx)];
  };
  // waistband: round the waist from the end of the right fly extension
  const wb = parts['crux.waistband'].points;
  const half = Math.abs(wb.bottomLeft.y) / 10, fly = Math.abs(TF(loc(F.flyTop))[0] - foldX);
  const len = 2 * half - fly;
  const top = W + Math.max(...[F.frontWaistCenter, F.flyTopCenter, B.p4, B.p2].map(p => loc(p)[1]));
  const bm = waistBandMap(body, legs.sections, { Y: top, len });
  const band = (x, y) => bm(((-y - fly) % len + len) % len, x);
  const drop = (f) => (x, y) => { const p = f(x, y); return [p[0], p[1] - DROP, p[2]]; };
  return (ps) => {
    if (ps.name === 'gusset') return drop(gusset);
    if (ps.name === 'waistband') return drop(band);
    if (ps.name.startsWith('front')) return drop(frontMap(ps));
    return drop(legs(ps));
  };
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], F = parts['crux.front'].points, B = parts['crux.back'].points;
  const band = parts['crux.waistband'].points.topMiddle.x / 10;   // the top of the folded band
  return { lower_interface: waistY(m) + band + Math.max(...[F.frontWaistCenter, F.flyTopCenter, B.p4, B.p2].map(p => loc(p)[1])) };
}
export const lift = 0;
