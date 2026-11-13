// FreeSewing "Breanna" body block (https://freesewing.eu/designs/breanna/, MIT, design by
// Joost De Cock): a close-fitting block for people with breasts, its bust shaping split
// between a primary and a secondary bust dart (by default from the waist and from the side
// at the armhole), a waist dart in the back and a set-in sleeve. Measurements from the
// mannequin, options as sliders, seam table and placement around the torso and arms.
//
// Breanna is not built on Brian. Its front is drafted with the darts rotated into place
// around the bust point, its centre front off x = 0. The torso placement (bodice.js
// dartedTorso) lays it around the torso as if the darts were sewn: the side panel between
// the two darts is turned up about the secondary dart's tip until that dart closes (the
// rotation that drafted it, undone), then the widened waist dart is closed by moving the
// cloth beside it in (bodice.js sewnFlat). The sleeves are Bella's (bella.js bellaSleeves).
import { upperFrame } from './place.js';
import { measureGirth, PART } from '../body.js';
import { pathEdges } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';
import { edgesOf, sewnFlat, dartedTorso, range, P } from './bodice.js';
import { bellaSleeves } from './bella.js';

export const id = 'breanna';
export const name = 'Breanna body block';
export const short = 'Body block';
export const exportName = 'Breanna';
export const url = 'https://freesewing.eu/designs/breanna/';
export const author = 'Joost De Cock';
export const icon = 'M19 6l5-1c2 4 6 4 8 0l5 1 9 9 5 31-5 1-6-24-1 28H20l-1-28-6 24-5-1 5-31zm3 24l4 4 2-8m8 8l-5-4 6-2';
export const stretchNote = 'Breanna is a block: the starting point other designs are drafted from, without hems or closures. The 3D drape sews it up as drafted: bust darts and back waist darts closed, back in two halves with a centre back seam, front cut on the fold, set-in sleeves. The darts stay where Breanna puts them by default (from the waist and from the side), and the back has no shoulder dart.';

export const design = {
  fit: {
    chestEase: { v: 10, range: [5, 20], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    waistEase: { v: 10, range: [5, 20], type: 'float', name: 'Waist ease (%)', help: 'The amount of ease at the waist.' },
    collarEase: { v: 3.5, range: [0, 10], type: 'float', name: 'Collar ease (%)', help: 'The amount of ease around your neck.' },
    shoulderEase: { v: 0, range: [0, 4], type: 'float', name: 'Shoulder ease (%)', help: 'The amount of ease at your shoulder. This increases the shoulder to shoulder distance.' },
    bicepsEase: { v: 15, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    cuffEase: { v: 20, range: [0, 50], type: 'float', name: 'Cuff ease (%)', help: 'The amount of ease at your wrist.' },
    verticalEase: { v: 2, range: [0, 8], type: 'float', name: 'Vertical ease (%)', help: 'The amount of ease to distribute along the length of the garment.' },
  },
  style: {
    primaryBustDartShaping: { v: 50, range: [25, 75], type: 'float', name: 'Bust darts shaping (%)', help: 'Controls the balance between the main and secondary bust darts.' },
    primaryBustDartLength: { v: 85, range: [65, 95], type: 'float', name: 'Bust dart length (%)', help: 'The length of the bust dart.' },
    secondaryBustDartLength: { v: 85, range: [65, 95], type: 'float', name: 'Secondary bust dart length (%)', help: 'The length of the secondary bust dart.' },
    waistDart: { v: true, type: 'bool', name: 'Waist dart', help: 'Whether or not to include a dart at the waist to round the back.' },
    waistDartSize: { v: 10, range: [4, 15], type: 'float', name: 'Waist dart size (%)', help: 'The size of the back waist dart.' },
    sleeveLengthBonus: { v: 0, range: [-40, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'The amount to lengthen the sleeve. A negative value will shorten it.' },
  },
};

// the default dart positions (other positions rotate the front's outline around in ways the
// placement does not follow; the back's shoulder dart draws a self-crossing outline)
export const options = (d) => ({ ...treeOptions(d), primaryBustDart: '06:00', secondaryBustDart: '13:30', shoulderDart: false });
const MEASUREMENTS = ['biceps', 'bustFront', 'bustSpan', 'highBust', 'highBustFront', 'hpsToBust', 'hpsToWaistBack', 'hpsToWaistFront',
  'waist', 'waistToHips', 'neck', 'shoulderToShoulder', 'shoulderSlope', 'shoulderToWrist', 'wrist'];
/**
 * The front's arc over the bust (cm): the front half of the torso's convex section from side to
 * side, at height y.
 */
function frontArc(body, y) {
  const pts = [];
  for (let v = 0; v < body.part.length; v++) if (body.part[v] === PART.BODY && Math.abs(body.pos[3 * v + 1] - y) < 0.8) pts.push([body.pos[3 * v], body.pos[3 * v + 2]]);
  pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cr = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const hi = [];
  for (const p of pts) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) >= 0) hi.pop(); hi.push(p); }
  let L = 0;
  for (let i = 1; i < hi.length; i++) L += Math.hypot(hi[i][0] - hi[i - 1][0], hi[i][1] - hi[i - 1][1]);
  return L;
}
/**
 * As fsMeasurements, but the bust front arc is measured on the mannequin (at its fullest
 * girth below the armpits) rather than estimated from the bust and underbust, which
 * overestimates it by several cm on the mannequins here and gives Breanna's front far more
 * cup than the body has; the high bust front keeps the estimate's difference to it.
 */
export function measurements(m, body) {
  const all = fsMeasurements(m, body);
  if (body) {
    const Yarm = m.height - m.head_l - m.armscye_depth;
    let best = 0, yb = Yarm - 8;
    for (let y = Yarm - 22; y <= Yarm; y += 0.5) { const g = measureGirth(body.pos, body.part, y); if (g > best) { best = g; yb = y; } }
    const arc = frontArc(body, yb);
    if (arc > 0.42 * m.bust && arc < 0.62 * m.bust) {
      const d = all.bustFront - all.highBustFront;
      all.bustFront = Math.round(arc * 10);
      all.highBustFront = all.bustFront - d;
    }
  }
  return pick(all, MEASUREMENTS);
}

const live = (part, ks) => { const ed = pathEdges(part.paths.seam); return ks.filter(k => ed[k] && ed[k].length > 1 && Math.hypot(ed[k][0][0] - ed[k].at(-1)[0], ed[k][0][1] - ed[k].at(-1)[1]) > 1e-3); };

/*
 * Edges, in drawing order (by the points they end at):
 *  front (cut on the fold, the centre front -> cfWaist first): waist, primary bust dart (pd:
 *    -> tip, -> waist), waist (-> waist: the side), side seam, secondary bust dart (sd: -> tip,
 *    -> the armhole's bottom), armhole (-> armholePitch -> shoulder), shoulder seam (-> hps),
 *    neckline (-> cfNeck)
 *  back (cut twice, centre back seam -> cbWaist first): waist, [waist dart (wd)], waist, side
 *    seam (-> armhole), armhole (-> armholePitch -> shoulder), shoulder seam (-> hps), neckline
 */
function frontEdges(part) {
  const E = edgesOf(part, ['cfWaist', 'primaryBustDartTip', 'waist', 'secondaryBustDartTip', 'armholePitch', 'hps', 'cfNeck']);
  return {
    fold: E.cfWaist, pd: [E.primaryBustDartTip, E.primaryBustDartTip + 1], sd: [E.secondaryBustDartTip, E.secondaryBustDartTip + 1],
    side: live(part, range(E.waist + 1, E.secondaryBustDartTip - 1)), armhole: live(part, range(E.secondaryBustDartTip + 2, E.armholePitch + 1)),
    shoulder: E.hps, neck: E.cfNeck,
  };
}
function backEdges(part) {
  const E = edgesOf(part, ['cbWaist', 'waistDartTip', 'armhole', 'armholePitch', 'hps', 'cbNeck'], ['waistDartTip']);
  return {
    cb: E.cbWaist, wd: E.waistDartTip != null ? [E.waistDartTip, E.waistDartTip + 1] : null,
    side: [E.armhole], armhole: live(part, range(E.armhole + 1, E.armholePitch + 1)), shoulder: E.hps, neck: E.cbNeck,
  };
}

/*
 * Pieces: front (on the fold), left_back (mirrored) / right_back, sleeve_l / sleeve_r
 * (breanna.sleeve, local +x = front: 0 back underarm (down), 1 wrist, 2 front underarm (up),
 * 3-7 cap (front -> back)). The front's local +x, the mirrored back and the unmirrored
 * sleeve are the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  const Ef = frontEdges(parts['breanna.front']), Eb = backEdges(parts['breanna.back']);
  const seams = [{ a: [['left_back', Eb.cb]], b: [['right_back', Eb.cb]] }];
  if (Eb.wd) for (const bk of ['left_back', 'right_back']) seams.push({ a: [[bk, Eb.wd[0]]], b: [[bk, Eb.wd[1], true]] });
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), bk = s > 0 ? 'left_back' : 'right_back', sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    seams.push(
      { a: [['front', f(Ef.pd[0])]], b: [['front', f(Ef.pd[1]), true]] },                          // primary bust dart
      { a: [['front', f(Ef.sd[0])]], b: [['front', f(Ef.sd[1]), true]] },                          // secondary bust dart
      { a: Ef.side.map(k => ['front', f(k)]), b: Eb.side.map(k => [bk, k]) },                     // side seam
      { a: [['front', f(Ef.shoulder)]], b: [[bk, Eb.shoulder]] },                                 // shoulder seam
      { a: [...Ef.armhole.map(k => ['front', f(k)]), ...Eb.armhole.slice().reverse().map(k => [bk, k, true])],
        b: [3, 4, 5, 6, 7].map(k => [sl, k]) },                                                   // armhole (front -> back)
      { a: [[sl, 0]], b: [[sl, 2, true]] },                                                       // underarm seam
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'breanna.front', fold: Ef.fold, label: 'body' },
      { name: 'left_back', part: 'breanna.back', mirror: true, label: 'body' },
      { name: 'right_back', part: 'breanna.back', label: 'body' },
      { name: 'sleeve_l', part: 'breanna.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'breanna.sleeve', mirror: true, label: 'arm', follow: 12 },
    ],
    seams,
    labels: {},
  };
}

const ang = (a, c) => Math.atan2(a[1] - c[1], a[0] - c[0]);
const wrapA = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/**
 * Rotate the sector around c from direction `from` clockwise to direction `to` by `d`
 * (counter-clockwise), fading in and out over `soft` radians at its edges.
 */
function rotSector(c, from, to, d, soft = 0.15) {
  const span = wrapA(from - to);
  return (x, y) => {
    const phi = wrapA(from - Math.atan2(y - c[1], x - c[0]));
    if (phi > span + soft && phi < 2 * Math.PI - soft) return [x, y];
    const p = phi > Math.PI ? phi - 2 * Math.PI : phi;   // just counter-clockwise of `from`: < 0
    const w = sm((p + soft) / soft) * sm((span + soft - p) / soft);
    const a = d * w, cs = Math.cos(a), sn = Math.sin(a), dx = x - c[0], dy = y - c[1];
    return [c[0] + cs * dx - sn * dy, c[1] + sn * dx + cs * dy];
  };
}

/** The front's sewn-flat transform, in coordinates from its centre front (x - cx). */
function frontFlat(part, Ef, cx) {
  const ed = pathEdges(part.paths.seam).map(p => p && p.map(([x, y]) => [x - cx, y]));
  // secondary dart: lower leg (side seam -> tip), upper leg (tip -> armhole bottom)
  const A2 = ed[Ef.sd[0]].at(-1), low = ed[Ef.sd[0]][0], up = ed[Ef.sd[1]].at(-1);
  const d2 = wrapA(ang(up, A2) - ang(low, A2));
  // the side panel: from the lower leg clockwise to the primary dart's side leg
  const pdSide = ed[Ef.pd[1]].at(-1);
  const turn = rotSector(A2, ang(low, A2), ang(pdSide, A2), d2);
  const legA = [ed[Ef.pd[0]]], legB = [ed[Ef.pd[1]].map(([x, y]) => turn(x, y))];
  const shift = sewnFlat({ vdarts: [[legA, legB]] });
  return (x, y) => shift(...turn(x, y));
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['breanna.front'], bp = parts['breanna.back'];
  const F = upperFrame(body, m);
  const Ef = frontEdges(fp), Eb = backEdges(bp);
  const cx = P(fp.points.cfWaist)[0];
  const ff = frontFlat(fp, Ef, cx);
  const bf = sewnFlat({ vdarts: Eb.wd ? [[[pathEdges(bp.paths.seam)[Eb.wd[0]]], [pathEdges(bp.paths.seam)[Eb.wd[1]]]]] : [] });
  const fe = pathEdges(fp.paths.seam), be = pathEdges(bp.paths.seam);
  const rel = ([x, y]) => [x - cx, y];
  const T = dartedTorso(F,
    { pieces: [{ part: fp, flat: ff, cx }], hps: ff(...rel(P(fp.points.hps))), shoulder: ff(...rel(fe[Ef.shoulder][0])), armhole: ff(...rel(fe[Ef.armhole[0]][0])) },
    { pieces: [{ part: bp, flat: bf }], hps: P(bp.points.hps), shoulder: be[Eb.shoulder][0], armhole: be[Eb.armhole[0]][0] });
  const front = T.front(ff), back = T.back(bf);
  const sleeves = bellaSleeves(F, parts['breanna.sleeve']);
  return (ps) => {
    if (ps.name === 'front') return (x, y) => front(x - cx, y);
    if (/_back$/.test(ps.name)) return back;
    return sleeves[!!ps.mirror];
  };
}

export const attachLevels = () => ({});
export const lift = 2;
