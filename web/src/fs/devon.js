// FreeSewing "Devon" denim jacket (https://freesewing.eu/designs/devon/, MIT, design by
// Wouter van Wageningen): a trucker-style jacket on Bent's block with front and back yokes,
// front and side panels with in-seam pockets, a buttoned front, two-part sleeves with cuffs
// and a waistband. Measurements from the mannequin, options as sliders, seam table and
// placement around the torso and arms for the drape (the outer shell).
import { upperFrame, bandRingMap } from './place.js';
import { pathEdges } from './convert.js';
import { fsMeasurements, pick } from './measure.js';
import { sleeveEdges, sleeveSeams, sleeveMaps } from './twopart.js';
import { fsOptions, edgesOf, range, seamX, jacketTorso, P } from './jacket.js';

export const id = 'devon';
export const name = 'Devon denim jacket';
export const short = 'Denim jacket';
export const exportName = 'Devon';
export const url = 'https://freesewing.eu/designs/devon/';
export const author = 'Wouter van Wageningen';
export const settings = { expand: true };   // draft the waistband and cuffs too
export const icon = 'M19 5l5-1 4 5 4-5 5 1 9 9 5 30-5 2-4-18v24h1v5H14v-5h1V24l-4 18-5-2 5-30zM12 20h32M28 9v41';
export const stretchNote = 'The 3D drape shows the outer shell as the finished jacket shows it from outside, as one layer: the fronts are buttoned edge to edge at the centre front (the button stand, about 2 cm a side, is not overlapped), and the front panels and side panels end at the seam between them (the parts of each that make the in-seam pockets lie behind it: cut, not simulated). The collar, front facings, patch pockets and flaps are cut but not simulated.';

const pct = (v, lo, hi, nm, help) => ({ v, range: [lo, hi], type: 'float', fs: 'pct', name: nm + ' (%)', help });
export const design = {
  fit: {
    chestEase: pct(20, 0, 35, 'Chest ease', 'Controls the amount of ease at the chest.'),
    hemEase: pct(12, 0, 20, 'Hem ease', 'The amount of ease at the hem.'),
    bicepsEase: pct(15, 0, 50, 'Biceps ease', 'The amount of ease at your upper arm.'),
    cuffEase: pct(40, 0, 200, 'Cuff ease', 'The amount of ease at your wrist.'),
    shoulderEase: pct(20, -2, 26, 'Shoulder ease', 'The amount of ease at your shoulder.'),
  },
  style: {
    lengthBonus: pct(9, 0, 40, 'Length bonus', 'The amount to lengthen the garment.'),
    sleeveLengthBonus: pct(3, -10, 10, 'Sleeve length bonus', 'The amount to lengthen the sleeve. A negative value will shorten it.'),
    yokeDrop: pct(33.5, 17, 45, 'Yoke drop', 'How far the yoke will drop down.'),   // lower, FreeSewing drops the side panel
    neckDrop: pct(6, 0, 10, 'Neck drop', 'The amount the front of the neck will drop.'),
    waistbandWidth: pct(4.67, 1, 10, 'Waistband width', 'The width of the waistband.'),
    cuffWidth: pct(7.5, 0, 10, 'Cuff width', 'The width of the cuff.'),
  },
};

// the drape copy (relaxed) is told apart by a flag FreeSewing does not see (not enumerable)
export const options = (d, { relaxed = false } = {}) => Object.defineProperty(fsOptions(d), 'drape', { value: relaxed });
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'highBust', 'hips', 'seat', 'seatBack', 'waist', 'waistBack', 'shoulderToElbow', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
/**
 * The drape copy as the jacket shows it from outside: the front panel and the side panel
 * end at the seam between them (the pocket parts of each lie behind the other). Mutates
 * the parts: for the drape copy only.
 */
function finishParts(parts) {
  const fp = parts['devon.frontPanel'], sp = parts['devon.frontSidePanel'];
  if (!fp?.paths.seam || !sp?.paths.seam) throw new Error('Devon: FreeSewing drafted no front panels with these options (try a smaller yoke drop)');
  if (fp.finished3d) return;
  fp.finished3d = true;
  const q = fp.points;
  if (q.panelPocketTop && q.frontHemSidePanel && q.frontYokeSidePanel)
    fp.paths.seam.ops = [{ type: 'move', to: q.frontHemSidePanel }, { type: 'line', to: q.panelPocketTop }, { type: 'line', to: q.frontYokeSidePanel },
      { type: 'line', to: q.frontYokePanel }, { type: 'line', to: q.frontHemPanel }, { type: 'line', to: q.frontHemSidePanel }];
  const r = sp.points, ops = sp.paths.seam.ops, i = ops.findIndex(op => same(op.to, r.hem));
  if (r.panelPocketTop && i > 0) sp.paths.seam.ops = [{ type: 'move', to: r.panelPocketTop }, { type: 'line', to: r.frontHemSidePanel }, ...ops.slice(i)];
}

// (the yoke seams cross the armhole above or below its pitch point and hollow, by the yoke
// drop: the armholes are found between the seams, see armhole())
const YOKE_F = ['s3ArmholeSplit', 's3CollarSplit', 'frontYoke', 'frontArmholeYoke'];
const INSIDE = ['frontYokePanel', 'frontYoke', 'frontHem', 'frontHemPanel'];
const PANEL = ['panelPocketTop', 'frontYokeSidePanel', 'frontYokePanel', 'frontHemPanel', 'frontHemSidePanel'];
const SIDE = ['frontHemSidePanel', 'hem', 'armhole', 'frontArmholeYoke', 'frontYokeSidePanel', 'panelPocketTop'];
const YOKE_B = ['backArmholeYoke', 's3ArmholeSplit', 's3CollarSplit', 'cbYoke'];

/**
 * A seam chain split where it passes closest to point pt (FreeSewing mm): [before, after].
 * items: [piece, edge, rev] in sewing order; partOf(piece) -> FreeSewing part.
 */
function splitChain(items, partOf, pt) {
  const q = P(pt);
  let best = { d: Infinity };
  items.forEach(([piece, id, rev], i) => {
    const poly = pathEdges(partOf(piece).paths.seam)[Number(String(id).replace('m', ''))];
    const mir = String(id).startsWith('m');
    const cum = [0];
    for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
    poly.forEach(([x, y], k) => {
      const d = Math.hypot((mir ? -x : x) - q[0], y - q[1]);
      if (d < best.d) best = { d, i, f: cum[k] / (cum.at(-1) || 1) };
    });
  });
  const { i, f } = best, [piece, id, rev] = items[i];
  const head = items.slice(0, i), tail = items.slice(i + 1);
  // the item's part before the split in sewing order: canonical [0, f] (or [f, 1] when reversed)
  const a = rev ? [piece, id, true, f, 1] : [piece, id, false, 0, f], b = rev ? [piece, id, true, 0, f] : [piece, id, false, f, 1];
  if ((rev ? 1 - f : f) > 0.02) head.push(a);
  if ((rev ? f : 1 - f) > 0.02) tail.unshift(b);
  return [head, tail];
}
const BPANEL = ['backHemPanel', 'backYokePanel', 'cbYoke', 'cbHem'];

/** Edges by the points they end at. */
function edges(parts, drape) {
  const g = (p, names) => edgesOf(parts[p], names);
  const bs = edgesOf(parts['devon.backSide'], ['backYokePanel', 'backHemPanel', 'hemBack', 'backYokeArmhole', 'backArmholeYoke']);
  return {
    yf: g('devon.frontYoke', YOKE_F), ins: g('devon.frontInside', INSIDE),
    pan: drape ? g('devon.frontPanel', PANEL) : null, side: drape ? g('devon.frontSidePanel', SIDE) : null,
    yb: g('devon.backYoke', YOKE_B), bp: g('devon.backPanel', BPANEL), bs,
  };
}

/*
 * Edges (by the point each ends at): front yoke: armhole (-> armholePitch, s3ArmholeSplit),
 *   shoulder seam (-> s3CollarSplit), neckline (-> cfNeck, frontNeck), front edge
 *   (-> frontYoke), yoke seam (-> frontArmholeYoke): its armhole is the edges before the shoulder seam; front inside panel: yoke seam
 *   (-> frontYoke), front edge (-> frontHem), hem, panel seam (up); front panel (drape copy):
 *   side panel seam (-> panelPocketTop, frontYokeSidePanel: up), yoke seam, inside seam
 *   (down), hem; front side panel (drape copy): panel seam (-> frontHemSidePanel: down), hem,
 *   side seam (-> armhole), armhole (-> frontArmholeYoke), yoke seam, panel
 *   seam (-> panelPocketTop); back yoke (cut on the fold, last = centre back): yoke seam
 *   (-> backArmholeYoke), armhole (-> s3ArmholeSplit), shoulder seam,
 *   neckline; back panel (cut on the fold at its centre back edge): hem, side back seam (up),
 *   yoke seam; back side: yoke seam (-> backYokePanel), panel seam (down), hem, side seam
 *   (up), armhole. Sleeves: twopart.js. Waistband and cuffs (cut on the fold at their x = 0
 *   edge): 0 the edge sewn on (towards the fold), 3 the end.
 * The unmirrored front pieces, the back pieces' mirrored halves (and the mirrored back side)
 * and the unmirrored top sleeve are the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  if (o.drape) finishParts(parts);
  const E = edges(parts, o.drape), S = sleeveEdges(parts['devon.topSleeve'], parts['devon.underSleeve']);
  const seams = [];
  const hem = { l: [], r: [] };
  for (const s of ['l', 'r']) {
    const L = s === 'l', b = (k) => (L ? 'm' + k : String(k)), id = (k) => String(k);
    const yf = 'front_yoke_' + s, fi = 'front_inside_' + s, fp = 'front_panel_' + s, fs = 'front_side_' + s, bs = (L ? 'left' : 'right') + '_back_side';
    seams.push(
      { a: [[yf, E.yf.s3CollarSplit]], b: [['back_yoke', b(E.yb.s3CollarSplit)]] },                                     // shoulder seam
      { a: [[bs, E.bs.backYokePanel], ['back_panel', b(E.bp.cbYoke)]], b: [['back_yoke', b(E.yb.backArmholeYoke), true]] },   // back yoke seam
      { a: [[bs, E.bs.backHemPanel]], b: [['back_panel', b(E.bp.backYokePanel), true]] },                                // back panel seam
    );
    if (o.drape) {
      // the armhole: down the front (yoke, side panel) and up the back (side, yoke), split at
      // the pitch points (FreeSewing's notches, matched to the sleeve's)
      const partOf = (piece) => parts[{ [yf]: 'devon.frontYoke', [fs]: 'devon.frontSidePanel', [bs]: 'devon.backSide', back_yoke: 'devon.backYoke' }[piece]];
      const front = [...range(-1, E.yf.s3ArmholeSplit).reverse().map(k => [yf, id(k), true]), ...range(E.side.armhole, E.side.frontArmholeYoke).reverse().map(k => [fs, id(k), true])];
      const back = [...range(E.bs.backYokeArmhole, E.bs.backArmholeYoke).map(k => [bs, id(k)]), ...range(E.yb.backArmholeYoke, E.yb.s3ArmholeSplit).map(k => ['back_yoke', b(k)])];
      const [fA, fB] = splitChain(front, partOf, parts['devon.frontYoke'].points.armholePitch);
      const [bB, bA] = splitChain(back, partOf, parts['devon.backYoke'].points.armholePitch);
      seams.push(
        { a: [[fi, E.ins.frontYokePanel]], b: [[fp, E.pan.frontHemPanel, true]] },                                       // inside - panel
        { a: [[fp, E.pan.panelPocketTop], [fp, E.pan.frontYokeSidePanel]], b: [[fs, E.side.frontHemSidePanel, true], [fs, E.side.panelPocketTop, true]] },   // panel - side
        { a: [[yf, E.yf.frontArmholeYoke]], b: [[fi, E.ins.frontYoke, true], [fp, E.pan.frontYokePanel, true], [fs, E.side.frontYokeSidePanel, true]] },   // front yoke seam
        { a: [[fs, E.side.armhole]], b: [[bs, E.bs.backYokeArmhole]] },                                                  // side seam
        ...sleeveSeams(S, 'top_sleeve_' + s, 'under_sleeve_' + s, { upper: [...bA, ...fA], lower: [...fB, ...bB] }),
      );
      hem[s] = [[fi, E.ins.frontHemPanel], [fp, E.pan.frontHemSidePanel], [fs, E.side.hem], [bs, E.bs.hemBack, true], ['back_panel', b(E.bp.backHemPanel), true]];
    }
  }
  if (o.drape) {
    // the sleeves' cuff seams (front seam -> back seam)
    const W = { ts: edgesOf(parts['devon.topSleeve'], ['tsCuffLeft', 'tsCuffRight']).tsCuffRight,
      us: edgesOf(parts['devon.underSleeve'], ['usCuffLeft', 'usCuffRight']).usCuffRight };
    seams.push(
      { a: [['front_yoke_l', E.yf.frontYoke], ['front_inside_l', E.ins.frontHem]], b: [['front_yoke_r', E.yf.frontYoke], ['front_inside_r', E.ins.frontHem]] },   // buttoned, edge to edge
      // waistband: from the right front edge around the back to the left front edge
      { a: [...hem.r, ...hem.l.slice().reverse().map(([p, k, rv]) => [p, k, !rv])].map(([p, k, rv]) => [p, k, !!rv]), b: [['waistband', 0], ['waistband', 'm0', true]] },
    );
    for (const s of ['l', 'r'])
      seams.push({ a: [['top_sleeve_' + s, W.ts, true], ['under_sleeve_' + s, W.us]], b: [['cuff_' + s, 0], ['cuff_' + s, 'm0', true]] });   // cuff
  }
  const pair = (nm, part, extra = {}) => [{ name: nm + '_l', part, ...extra }, { name: nm + '_r', part, mirror: true, ...extra }];
  return {
    pieces: [
      ...pair('front_yoke', 'devon.frontYoke', { label: 'body' }),
      ...pair('front_inside', 'devon.frontInside', { label: 'body' }),
      ...pair('front_panel', 'devon.frontPanel', { label: 'body' }),
      ...pair('front_side', 'devon.frontSidePanel', { label: 'body' }),
      { name: 'back_yoke', part: 'devon.backYoke', fold: E.yb.cbYoke, label: 'body' },
      { name: 'back_panel', part: 'devon.backPanel', fold: E.bp.cbHem, label: 'body' },
      { name: 'left_back_side', part: 'devon.backSide', mirror: true, label: 'body' },
      { name: 'right_back_side', part: 'devon.backSide', label: 'body' },
      { name: 'top_sleeve_l', part: 'devon.topSleeve', label: 'arm', follow: 12 },
      { name: 'under_sleeve_l', part: 'devon.underSleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'top_sleeve_r', part: 'devon.topSleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'under_sleeve_r', part: 'devon.underSleeve', label: 'arm', follow: 12 },
      { name: 'waistband', part: 'devon.waistband', fold: 1, label: 'body', doubled: 'y', follow: 6 },
      { name: 'cuff_l', part: 'devon.cuff', fold: 1, label: 'arm', follow: 6 },
      { name: 'cuff_r', part: 'devon.cuff', fold: 1, mirror: true, label: 'arm', follow: 6 },
      { name: 'upper_collar', part: 'devon.upperCollar', fold: 4, cutOnly: true },
      { name: 'under_collar', part: 'devon.underCollar', fold: 4, cutOnly: true },
      ...pair('front_facing', 'devon.frontFacing', { cutOnly: true }),
      ...pair('patch', 'devon.pocket', { cutOnly: true }),
      ...pair('flap', 'devon.pocketflap', { cutOnly: true, lining: true }),
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], yf = parts['devon.frontYoke'], yb = parts['devon.backYoke'];
  const sp = parts['devon.frontSidePanel'], bs = parts['devon.backSide'];
  const ts = parts['devon.topSleeve'], us = parts['devon.underSleeve'];
  const F = upperFrame(body, m);
  const E = edges(parts, true), es = pathEdges(sp.paths.seam), eb = pathEdges(bs.paths.seam);
  const cx = P(yf.points.frontYoke)[0];   // the front edge (buttoned edge to edge at the centre front)
  const T = jacketTorso(F, {
    front: { part: yf, cx, shoulder: E.yf.s3CollarSplit, hi: seamX([es[E.side.armhole]]) },
    back: { part: yb, cb: () => 0, hi: seamX([eb[E.bs.backYokeArmhole]]), shoulder: E.yb.s3CollarSplit },
    armhole: P(sp.points.armhole),
  });
  const Sm = sleeveMaps(F, ts, us, sleeveEdges(ts, us));
  const hemY = T.front(0, P(sp.points.hem)[1])[1];
  return (ps) => {
    const sg = ps.mirror ? -1 : 1;
    if (/^front_/.test(ps.name)) return (x, y) => T.front(sg * x, y, sg);
    if (/^(back_yoke|back_panel)$/.test(ps.name)) return (x, y) => T.Tb(x, y);
    if (/back_side$/.test(ps.name)) return (x, y) => T.back(-sg * x, y, -sg);
    if (/sleeve/.test(ps.name)) return Sm(ps.name.startsWith('top') ? 'top' : 'under', ps.mirror);
    if (ps.name === 'waistband') {
      // from the right front edge (x = len / 2) round the back (x = 0) to the left front edge
      const wb = parts['devon.waistband'].points, half = P(wb.topRight)[0], top = P(wb.topRight)[1];
      const ring = bandRingMap(F, { Y: hemY, len: 2 * half, phi0: 0, dir: -1 });
      return (x, y) => ring(half - x, top - y);
    }
    if (/^cuff/.test(ps.name)) {
      // round the wrist from the back seam (x = the cuff's half length) towards the front
      const c = parts['devon.cuff'].points, half = P(c.topRight)[0];
      const back = P(ts.points.tsCuffRight), map = Sm('top', ps.mirror);
      return (x, y) => { const xf = sg * x, xt = back[0] - (half - xf); return map(sg * xt, back[1] + y); };
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
