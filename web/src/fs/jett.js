// FreeSewing "Jett" jacket (https://freesewing.eu/designs/jett/, MIT, design by Jonathan
// Haas): a bomber-style jacket on Brian's block with a back yoke, a placket closed with
// buttons or snaps, welt pockets, set-in sleeves and a ribbed collar, waistband and cuffs.
// Measurements from the mannequin, options as sliders, seam table and placement around the
// torso and arms for the drape (the outer shell).
import { upperFrame, bandRingMap, bandOnEdge, edgeEnds } from './place.js';
import { fsMeasurements, pick } from './measure.js';
import { brianSleeves } from './tops.js';
import { fsOptions, edgesOf, seamX, jacketTorso, P } from './jacket.js';
import { pathEdges } from './convert.js';

export const id = 'jett';
export const name = 'Jett jacket';
export const short = 'Bomber jacket';
export const exportName = 'Jett';
export const url = 'https://freesewing.eu/designs/jett/';
export const author = 'Jonathan Haas';
export const settings = { expand: true };   // draft the waistband, cuffs and pocket parts too
export const icon = 'M20 5h16l3 5 8 4 6 30-6 2-4-20v26l2 4H15l2-4V26l-4 20-6-2 6-30 8-4zM28 11v41';
export const stretchNote = 'The waistband, cuffs and collar are ribbing, cut shorter than the seams they are sewn to and stretched to fit: the 3D drape uses a relaxed copy (unstretched ribbing). The drape shows the outer shell as the closed jacket shows it from outside, as one layer: the left front\'s placket is buttoned over the right front, which is draped only where it shows. The ribbed collar, the waistband extensions under the placket, the pocket welts and bags are cut but not simulated. FreeSewing lists some pieces under lining too (the lining is cut, not simulated).';

const pct = (v, lo, hi, nm, help) => ({ v, range: [lo, hi], type: 'float', fs: 'pct', name: nm + ' (%)', help });
export const design = {
  fit: {
    chestEase: pct(15, 0, 50, 'Chest ease', 'The amount of ease at your chest.'),
    hipsEase: pct(8, 0, 50, 'Hips ease', 'The amount of ease at your hips.'),
    bicepsEase: pct(15, 0, 50, 'Biceps ease', 'The amount of ease at your upper arm.'),
    cuffEase: pct(60, -8, 100, 'Cuff ease', 'The amount of ease at your wrist.'),
    ribbingStretch: pct(15, 0, 30, 'Ribbing stretch', 'Use this to adapt the pattern to how stretchy the ribbing is.'),
  },
  style: {
    lengthBonus: pct(8, -4, 30, 'Length bonus', 'The amount to lengthen the garment. A negative value will shorten it.'),
    sleeveLengthBonus: pct(6, -60, 20, 'Sleeve length bonus', 'The amount to lengthen the sleeve. A negative value will shorten it.'),
    ribbingHeight: pct(10, 5, 15, 'Ribbing height', 'Controls the height of the ribbing.'),
    yokesplit: pct(30, 5, 80, 'Yoke height', 'How tall to make the yoke.'),
    placketwidth: pct(3, 0.5, 4, 'Placket width', 'How wide to make the button placket.'),
    frontWeltPockets: { v: true, type: 'bool', fs: 'bool', name: 'Front welt pockets', help: 'Diagonal welt pockets on the front.' },
  },
};

// the drape copy (relaxed: unstretched ribbing) is told apart by a flag FreeSewing does not see
export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) o.ribbingStretch = 0;
  return Object.defineProperty(o, 'drape', { value: relaxed });
}
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'highBust', 'hips', 'hpsToWaistFront', 'bustSpan', 'waist', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);
export const others = { lining: ['Front lining × 2', 'Back lining × 1 (on the fold)', 'Sleeve × 2', 'Front pocket bag × 2'] };

const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
/**
 * The drape copy of the right front ('jett.frontUnder', added to the draft): only where it
 * shows, i.e. up to the left front's placket edge (at the placket's width right of the centre
 * front) and, at the top, its own neckline then the left front's neckline height.
 */
function finishParts(parts) {
  const fp = parts['jett.front'];
  if (parts['jett.frontUnder']) return;
  const q = fp.points, Pt = q.cfNeck.constructor, Path = fp.paths.seam.constructor;
  const ops = fp.paths.seam.ops, X = -q.outerPlacketTop.x;
  const iN = ops.findIndex(op => same(op.to, q.neck)), c = ops[iN + 1];
  const curve = new Path().move(q.neck).curve(c.cp1, c.cp2, c.to);
  const hit = curve.intersectsX(X)[0];
  const under = { name: 'jett.frontUnder', points: { ...q }, paths: { seam: { ops: [] } } };
  const u = under.points;
  u.underHem = new Pt(X, q.outerPlacketBottom.y);
  u.underTop = new Pt(X, q.outerPlacketTop.y);
  u.underNeck = hit || u.underTop;
  under.paths.seam.ops = [{ type: 'move', to: u.underHem }, ...ops.slice(1, iN + 1),
    hit ? curve.split(hit)[0].ops[1] : { type: 'line', to: u.underTop }, { type: 'line', to: u.underTop }, { type: 'line', to: u.underHem }];
  parts['jett.frontUnder'] = under;
}

const FRONT = ['hem', 'armhole', 'armholeHollow', 'armholePitch', 'shoulder', 'neck'];
// the back's centre line is drawn in one or two pieces (cbHips, cbHem) depending on the length
const BACK = ['cbHips', '?cbHem', 'hem', 'armhole', 'armholeHollow', 'armholePitch', 'armholesplit', 'centertop'];
/*
 * Edges: front: 0 hem (placket edge -> side), 1 side seam (up), 2-4 armhole (-> shoulder),
 *   5 shoulder seam (-> neck), 6 neckline, 7 placket top, 8 placket edge (down); the right
 *   front's drape copy: 6 neckline (to the left placket's edge), 7 down to the left front's
 *   neckline height, 8 the line under the left placket's edge (down)
 * back (cut on the fold, 0 = centre back from the yoke seam; by the points they end at): the
 *   rest of the centre line (-> cbHem, when drawn: sewn to its mirror image), hem (-> hem),
 *   side seam (-> armhole), armhole (-> armholeHollow, armholePitch, armholesplit), yoke seam
 *   (-> centertop)
 * yoke (cut on the fold, 0 = centre back): 1 yoke seam (centre -> armhole), 2 armhole
 *   (-> shoulder), 3 shoulder seam (-> neck), 4 neckline
 * sleeve: 0 front underarm (down), 1 wrist, 2 back underarm (up), 3-7 cap (back -> front)
 * waistband / cuff (ribbing, folded in half lengthwise): 2 the long edge sewn on, 1 / 3 the
 *   short ends (the cuff's sewn into a ring; the waistband's meet under the placket)
 * The unmirrored front and sleeve and the back's and yoke's mirrored halves are the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  if (o.drape) finishParts(parts);
  const E = edgesOf(parts['jett.back'], BACK);
  const seams = E.cbHem != null ? [{ a: [['back', E.cbHem]], b: [['back', 'm' + E.cbHem]] }] : [];
  for (const s of [1, -1]) {
    const L = s > 0, fr = L ? 'front_l' : 'front_r', b = (k) => (L ? 'm' + k : String(k));
    const sl = L ? 'sleeve_l' : 'sleeve_r', cf = L ? 'cuff_l' : 'cuff_r';
    seams.push(
      { a: [[fr, 1]], b: [['back', b(E.armhole)]] },                                                   // side seam
      { a: [[fr, 5]], b: [['yoke', b(3)]] },                                                   // shoulder seam
      { a: [['back', b(E.centertop)]], b: [['yoke', b(1), true]] },                                      // yoke seam
      { a: [['back', b(E.armholeHollow)], ['back', b(E.armholePitch)], ['back', b(E.armholesplit)], ['yoke', b(2)], [fr, 4, true], [fr, 3, true], [fr, 2, true]],
        b: [[sl, 3], [sl, 4], [sl, 5], [sl, 6], [sl, 7]] },                                    // armhole
      { a: [[sl, 2, true]], b: [[sl, 0]] },                                                    // underarm
      { a: [[sl, 1]], b: [[cf, 2]] }, { a: [[cf, 1]], b: [[cf, 3, true]] },                      // cuff
    );
  }
  seams.push({ a: [['front_l', 0], ['back', 'm' + E.hem, true], ['back', String(E.hem)], ['front_r', 0, true]], b: [['waistband', 2]] });   // waistband
  if (o.drape) seams.push(
    { a: [['waistband', 1]], b: [['waistband', 3, true]] },                                    // its ends meet under the placket
    { a: [['front_l', 8]], b: [['front_r', 8]] },                                              // buttoned: the left placket over the right front
  );
  const pair = (nm, part, extra = {}) => [{ name: nm + '_l', part, ...extra }, { name: nm + '_r', part, mirror: true, ...extra }];
  return {
    pieces: [
      { name: 'front_l', part: 'jett.front', label: 'body' },
      { name: 'front_r', part: o.drape ? 'jett.frontUnder' : 'jett.front', mirror: true, label: 'body' },
      { name: 'back', part: 'jett.back', fold: 0, label: 'body' },
      { name: 'yoke', part: 'jett.yoke', fold: 0, label: 'body' },
      { name: 'sleeve_l', part: 'jett.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'jett.sleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'waistband', part: 'jett.waistband', label: 'body', doubled: 'x', follow: 6 },
      { name: 'cuff_l', part: 'jett.cuff', label: 'arm', doubled: 'x', follow: 6 },
      { name: 'cuff_r', part: 'jett.cuff', mirror: true, label: 'arm', doubled: 'x', follow: 6 },
      { name: 'collar', part: 'jett.collar_ribbing', fold: 4, cutOnly: true },
      ...pair('waistband_end', 'jett.waistband_ends', { cutOnly: true }),
      ...(o.frontWeltPockets ? [...pair('welt', 'jett.pocket_welt', { cutOnly: true }), ...pair('welt_bag', 'jett.pocket_bag_front', { cutOnly: true })] : []),
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['jett.front'], bp = parts['jett.back'], yp = parts['jett.yoke'];
  const F = upperFrame(body, m);
  const Ef = edgesOf(fp, FRONT), ef = pathEdges(fp.paths.seam), eb = pathEdges(bp.paths.seam);
  const T = jacketTorso(F, {
    front: { part: fp, cx: 0, shoulder: Ef.neck, hi: seamX([ef[1]]) },
    back: { part: yp, cb: () => 0, hi: seamX([eb[edgesOf(bp, BACK).armhole]]), shoulder: 3 },
    armhole: P(fp.points.armhole),
    // a long jacket hangs as a cone below the hips (front and back share Brian's heights)
    skirt: { front: P(fp.points.cfHips)[1], back: P(fp.points.cfHips)[1] },
  });
  const sleeves = brianSleeves(F, parts['jett.sleeve'], { atCrease: true });
  const hemY = T.front(0, P(fp.points.hem)[1])[1];
  return (ps, loop) => {
    if (/^front_[lr]$/.test(ps.name)) return ps.mirror ? (x, y) => T.front(-x, y, -1) : (x, y) => T.front(x, y, 1);
    if (ps.name === 'back' || ps.name === 'yoke') return (x, y) => T.Tb(x, y);
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror].map;
    if (ps.name === 'waistband') {
      // from the left placket's edge (right of the centre front) around the left side, the
      // back and the right side, back to it
      const len = -parts['jett.waistband'].points.bottomLeft.y / 10, ext = -P(fp.points.outerPlacketTop)[0];
      const ring = bandRingMap(F, { Y: hemY, len, phi0: -2 * Math.PI * ext / len, dir: 1 });
      return (x, y) => ring(-y, x);
    }
    if (/^cuff/.test(ps.name)) {
      const S = sleeves[!!ps.mirror];
      return bandOnEdge(S.map, edgeEnds(S.loop, 1), edgeEnds(loop, 2));
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
