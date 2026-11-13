// FreeSewing "Jaeger" jacket (https://freesewing.eu/designs/jaeger/, MIT, design by Joost
// De Cock): a single-breasted tailored jacket on Bent's block, with a side panel, notched
// lapels, a back vent, two-part sleeves with vents, and a lining. Measurements from the
// mannequin, options as sliders, seam table and placement around the torso and arms for
// the drape (the outer shell).
import { upperFrame } from './place.js';
import { pathEdges } from './convert.js';
import { fsMeasurements, pick } from './measure.js';
import { sleeveEdges, sleeveSeams, sleeveMaps, finishSleeve } from './twopart.js';
import { armholeChains } from './bent.js';
import { fsOptions, edgesOf, range, seamX, jacketTorso, spanOf, P } from './jacket.js';

export const id = 'jaeger';
export const name = 'Jaeger jacket';
export const short = 'Jacket';
export const exportName = 'Jaeger';
export const url = 'https://freesewing.eu/designs/jaeger/';
export const author = 'Joost De Cock';
export const settings = { expand: true };
export const icon = 'M19 5l5-1 4 14 4-14 5 1 9 9 5 33-5 1-4-17v26l-8 2-6-15-6 15-8-2V22l-4 17-5-1 5-33z';
export const stretchNote = 'The 3D drape shows the outer shell: fronts, side panels, backs and two-part sleeves. It is draped as the finished jacket shows it from outside, as one layer: the fronts are buttoned edge to edge at the centre front (the overlap is not doubled up) and end at the lapel roll line, so the turned-back lapels themselves are not simulated; the back and sleeve vents are closed and the sleeve hems turned up, their folded-in layers cut but not simulated. The collar, collar stand, front facings, pockets and welts are cut but not simulated, so the drape shows the neckline without its collar; the small front waist darts are not sewn. The lining, canvas and pocket bags are listed under other materials.';

const pct = (v, lo, hi, nm, help) => ({ v, range: [lo, hi], type: 'float', fs: 'pct', name: nm + ' (%)', help });
export const design = {
  fit: {
    chestEase: pct(8, -4, 20, 'Chest ease', 'The amount of ease at your chest.'),
    waistEase: pct(14, 8, 25, 'Waist ease', 'Controls the amount of ease at your waist.'),
    hipsEase: pct(12, 8, 20, 'Hips ease', 'Controls the amount of ease at your hips.'),
    bicepsEase: pct(20, 10, 40, 'Biceps ease', 'The amount of ease at your upper arm.'),
    lengthBonus: pct(19, 10, 25, 'Length bonus', 'The amount to lengthen the garment.'),
    sleeveLengthBonus: pct(0, -20, 15, 'Sleeve length bonus', 'The amount to lengthen the sleeve. A negative value will shorten it.'),
  },
  style: {
    buttons: { v: '2', range: ['1', '2', '3'], type: 'select', fs: 'list', name: 'Number of buttons', help: 'Controls the amount of buttons.' },
    lapelStart: pct(10, 0, 35, 'Lapel start', 'Location where the center front goes over into the lapels.'),
    frontCutawayStart: pct(30, 10, 70, 'Front cutaway start', 'The location at which the front starts opening up towards the hem.'),
    hemRadius: pct(100, 35, 100, 'Hem radius', 'The amount by which the hem is rounded.'),
    backVentLength: pct(35, 15, 100, 'Back vent length', 'The length of the back vent.'),
    sleeveVentLength: pct(35, 25, 55, 'Sleeve vent length', 'Length of the sleeve vent.'),
  },
};

// the drape copy (relaxed) is told apart by a flag FreeSewing does not see (not enumerable)
export const options = (d, { relaxed = false } = {}) => Object.defineProperty(fsOptions(d), 'drape', { value: relaxed });
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'waist', 'shoulderToElbow', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

export const others = {
  lining: ['Front lining × 2', 'Side × 2', 'Top sleeve × 2', 'Under sleeve × 2', 'Pocket lining × 2', 'Chest pocket bag × 2', 'Inner pocket bag × 2'],
  canvas: ['Chest piece × 2', 'Under collar × 1'],
  specialty: ['Under collar × 1'],
};

const FRONT = ['hips', 'waist', 'split|fsArmhole', 'armholeHollow', 'armholePitch', 'shoulder', 'neck', 'collarCorner',
  '?notch', '?notchEdge', '?lapelStraightEnd', '?shoulderRoll', '?lapelBreakPoint', 'cutawayPoint'];
const SIDE = ['bsHips', 'bsWaist', 'bsArmholeHollow', 'sideArmhole', 'split|fsArmhole', 'sideWaist', 'sideHips', 'sideHem'];
const BACK = ['hips', 'waist', 'armholeHollow', 'armholePitch', 'shoulder', 'neck', 'cbNeck', 'cbChest', 'cbWaist', 'ventSlopeStart|cbHips', '?cbHips', '?cbHem'];

const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
/**
 * The drape copy as the finished jacket shows it from outside (as simon.js does for its
 * plackets): the front ends at the lapel's roll line (the lapel is turned back over it; the
 * gorge runs on to where the roll line meets it), the back's centre seam runs straight on to
 * the hem (the vent's extensions are folded in behind it) and the sleeves end at their hem
 * line, vents closed (twopart.js finishSleeve). Mutates the parts: for the drape copy only.
 */
function finishParts(parts) {
  const fp = parts['jaeger.front'], bp = parts['jaeger.back'];
  if (fp.finished3d) return;
  fp.finished3d = true;
  const f = fp.paths.seam.ops, fq = fp.points;
  const i = f.findIndex(op => same(op.to, fq.collarCorner)), j = f.findIndex(op => same(op.to, fq.cutawayPoint));
  if (i >= 0 && j > i) fp.paths.seam.ops = [...f.slice(0, i + 1), { type: 'line', to: fq.shoulderRoll }, { type: 'line', to: fq.lapelBreakPoint }, ...f.slice(j)];
  const b = bp.paths.seam.ops, bq = bp.points;
  const k = b.findIndex(op => same(op.to, bq.ventSlopeStart));
  if (k >= 0) bp.paths.seam.ops = [...b.slice(0, k + 1), { type: 'line', to: bq.cbHips }, { type: 'line', to: bq.cbHem }, { type: 'line', to: bq.hem }];
  finishSleeve(parts['jaeger.topsleeve'], 'ts');
  finishSleeve(parts['jaeger.undersleeve'], 'us');
}

/*
 * Edges (by the point each ends at, see FRONT / SIDE / BACK): front: side seam (up from the
 *   hem), armhole (-> shoulder), shoulder seam (-> neck), gorge (-> collarCorner, notch,
 *   notchEdge), lapel edge (-> lapelStraightEnd), front edge (-> cutawayPoint; buttoned below
 *   the lapel's break point), then the cutaway and hem; side panel: back seam (up), armhole
 *   bottom (back -> front), front seam (down), hem; back: side seam (up), armhole, shoulder
 *   seam, neck, centre back seam (cbNeck -> the top of the vent), the vent's extension, hem.
 * top / under sleeve: twopart.js. The unmirrored front and side and the mirrored back are
 * the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['jaeger.front'], sp = parts['jaeger.side'], bp = parts['jaeger.back'];
  if (o.drape) finishParts(parts);
  const Ef = edgesOf(fp, FRONT), Es = edgesOf(sp, SIDE), Eb = edgesOf(bp, BACK);
  const E = sleeveEdges(parts['jaeger.topsleeve'], parts['jaeger.undersleeve']);
  // the buttoned part of the front edge: from the lapel's break point down to the cutaway
  const ed = pathEdges(fp.paths.seam), yBreak = P(fp.points.lapelBreakPoint)[1];
  const closure = [];
  for (const k of [Ef.lapelStraightEnd, Ef.cutawayPoint].filter(k => k != null)) {
    const p = ed[k], y0 = p[0][1], y1 = p[p.length - 1][1];
    if (yBreak <= y1) continue;                                   // entirely above the break
    const f = yBreak >= y0 ? 0 : (y0 - yBreak) / (y0 - y1);
    if (f <= 0.97) closure.push([k, f]);
  }
  const seams = [];
  const Af = { below: range(Ef.split, Ef.armholePitch), above: range(Ef.armholePitch, Ef.shoulder) };
  const Ab = { below: range(Eb.armholeHollow, Eb.armholePitch), above: range(Eb.armholePitch, Eb.shoulder) };
  for (const s of ['l', 'r']) {
    const fr = 'front_' + s, sd = 'side_' + s, bk = (s === 'l' ? 'left' : 'right') + '_back';
    const id = (k) => String(k);
    const arm = armholeChains(fr, bk, id, id, Af, Ab);
    // the side panel carries the bottom of the armhole (between the back's and the front's)
    arm.lower = [...arm.lower.slice(0, Af.below.length),
      [sd, Es.split, true], [sd, Es.sideArmhole, true], ...arm.lower.slice(Af.below.length)];
    seams.push(
      { a: range(-1, Ef.split).map(k => [fr, k]), b: range(Es.split, Es.sideHem).reverse().map(k => [sd, k, true]) },   // front - side
      { a: range(-1, Es.bsArmholeHollow).map(k => [sd, k]), b: range(-1, Eb.armholeHollow).map(k => [bk, k]) },             // side - back
      { a: [[fr, Ef.neck]], b: [[bk, Eb.neck]] },                                                                          // shoulder
      ...sleeveSeams(E, 'top_sleeve_' + s, 'under_sleeve_' + s, arm),
    );
  }
  const cb = range(Eb.cbNeck, Eb.cbHem ?? Eb.ventSlopeStart);
  seams.push(
    { a: cb.map(k => ['left_back', k]), b: cb.map(k => ['right_back', k]) },                                              // centre back
    { a: closure.map(([k, f]) => ['front_l', k, false, f, 1]), b: closure.map(([k, f]) => ['front_r', k, false, f, 1]) },   // buttoned
  );
  const pair = (nm, part, extra = {}) => [{ name: nm + '_l', part, ...extra }, { name: nm + '_r', part, mirror: true, ...extra }];
  return {
    pieces: [
      { name: 'front_l', part: 'jaeger.front', label: 'body' },
      { name: 'front_r', part: 'jaeger.front', mirror: true, label: 'body' },
      { name: 'side_l', part: 'jaeger.side', label: 'body' },
      { name: 'side_r', part: 'jaeger.side', mirror: true, label: 'body' },
      { name: 'left_back', part: 'jaeger.back', mirror: true, label: 'body' },
      { name: 'right_back', part: 'jaeger.back', label: 'body' },
      { name: 'top_sleeve_l', part: 'jaeger.topsleeve', label: 'arm', follow: 12 },
      { name: 'under_sleeve_l', part: 'jaeger.undersleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'top_sleeve_r', part: 'jaeger.topsleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'under_sleeve_r', part: 'jaeger.undersleeve', label: 'arm', follow: 12 },
      { name: 'collar', part: 'jaeger.collar', cutOnly: true },
      { name: 'collar_stand', part: 'jaeger.collarStand', cutOnly: true },
      ...pair('front_facing', 'jaeger.frontFacing', { cutOnly: true }),
      ...pair('patch', 'jaeger.pocket', { cutOnly: true }),
      ...pair('chest_welt', 'jaeger.chestPocketWelt', { cutOnly: true }),
      ...pair('inner_welt', 'jaeger.innerPocketWelt', { cutOnly: true }),
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['jaeger.front'], sp = parts['jaeger.side'], bp = parts['jaeger.back'];
  const ts = parts['jaeger.topsleeve'], us = parts['jaeger.undersleeve'];
  const F = upperFrame(body, m);
  const Ef = edgesOf(fp, FRONT), Eb = edgesOf(bp, BACK);
  const eb = pathEdges(bp.paths.seam), ef = pathEdges(fp.paths.seam);
  const cx = ef[Ef.cutawayPoint][0][0];   // the front edge (buttoned edge to edge at the centre front)
  const sF = seamX(range(-1, Ef.split).map(k => ef[k])), sS = spanOf(sp), sB = seamX(range(-1, Eb.armholeHollow).map(k => eb[k]));
  const cbX = seamX(range(Eb.cbNeck, Eb.cbHem ?? Eb.ventSlopeStart).map(k => eb[k]));
  const T = jacketTorso(F, {
    front: { part: fp, cx, shoulder: Ef.neck, hi: sF },
    side: { part: sp, lo: sS.lo, hi: sS.hi },
    back: { part: bp, cb: cbX, hi: sB, shoulder: Eb.neck },
    armhole: P(sp.points.sideArmhole),
  });
  const S = sleeveMaps(F, ts, us, sleeveEdges(ts, us));
  const flip = (fn, mirror) => (mirror ? (x, y) => fn(-x, y, -1) : (x, y) => fn(x, y, 1));
  return (ps) => {
    if (/^front_[lr]$/.test(ps.name)) return flip(T.front, ps.mirror);
    if (/^side_[lr]$/.test(ps.name)) return flip(T.side, ps.mirror);
    if (/_back$/.test(ps.name)) return flip(T.back, ps.mirror);
    if (/sleeve/.test(ps.name)) return S(ps.name.startsWith('top') ? 'top' : 'under', ps.mirror);
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
