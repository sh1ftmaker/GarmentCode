// Shared adapter of FreeSewing's Carlton coat and Carlita, its bust-adapted version (both
// MIT, design by Joost De Cock): a double-breasted coat on Bent's block, with a back bodice
// to the waist, pleated tails below it, a half belt, a collar and two-part sleeves with
// turned-back cuffs. Carlita adds princess seams (a side front panel). Seam table and
// placement for the drape of the outer shell: carlton.js and carlita.js.
import { upperFrame } from './place.js';
import { pathEdges } from './convert.js';
import { sleeveEdges, sleeveSeams, sleeveMaps, finishSleeve } from './twopart.js';
import { armholeChains } from './bent.js';
import { fsOptions, edgesOf, range, seamX, jacketTorso, P } from './jacket.js';

const pct = (v, lo, hi, nm, help) => ({ v, range: [lo, hi], type: 'float', fs: 'pct', name: nm + ' (%)', help });
export const coatDesign = (maxSpacing) => ({
  fit: {
    chestEase: pct(10, 5, 20, 'Chest ease', 'The amount of ease at your chest.'),
    waistEase: pct(14, 8, 25, 'Waist ease', 'Controls the amount of ease at your waist.'),
    seatEase: pct(14, 8, 25, 'Seat ease', 'Amount of ease around your bum.'),
    bicepsEase: pct(20, 0, 50, 'Biceps ease', 'The amount of ease at your upper arm.'),
    sleeveLengthBonus: pct(7, 0, 20, 'Sleeve length bonus', 'The amount to lengthen the sleeve.'),
  },
  style: {
    length: pct(69, 35, 100, 'Length', 'Total length.'),
    buttonSpacingHorizontal: pct(43.5, 15, maxSpacing, 'Horizontal button spacing', 'Horizontal spacing of the buttons, also determines the front closure overlap.'),
    beltWidth: pct(15, 10, 20, 'Belt width', 'Width of the belt.'),
    cuffLength: pct(15, 10, 20, 'Cuff length', 'Controls the length (height if you wish) of the cuffs.'),
    collarHeight: pct(9.6, 8, 11, 'Collar height', 'Height of the collar.'),
  },
});
export const coatStretchNote = (who) => `The 3D drape shows ${who}'s outer shell as the finished coat shows it from outside, as one layer: the left front is buttoned over the right one and both end at the lapels' roll line, so the right front is draped only where it shows and the turned-back lapels are not simulated; the back pleat is folded in, the tails' centre back edges are folded under and meet edge to edge (the centre back pleat drawn closed), their other pleats gathered into the waist seam (they open up over the seat as the pleats would) and the sleeves end at the wrist (the turned-back cuffs are not simulated). The collar, collar stand, half belt, pockets, flaps, welts and facings are cut but not simulated, so the back of the neck shows without its collar. The lining, canvas and pocket bags are listed under other materials.`;
// the drape copy (relaxed) is told apart by a flag FreeSewing does not see (not enumerable)
export const coatOptions = (d, { relaxed = false } = {}) => Object.defineProperty(fsOptions(d), 'drape', { value: relaxed });

const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
const BACK_CUT = ['bpStart', 'bpTop', 'bpBottom', 'dartLeft', 'dartTip', 'dartRight', 'waist', 'armhole', 'armholeHollow', 'armholePitch', 'shoulder', 'neck', 'cbNeck'];
const BACK_FIN = ['cbWaist', 'dartLeft', 'dartTip', 'dartRight', 'waist', 'armhole', 'armholeHollow', 'armholePitch', 'shoulder', 'neck', 'cbNeck'];
// front: [side seam (carlton) or princess seam (carlita) names up to the armhole], then the rest
const FRONT_TOP = ['shoulder', 'neck'];
const FRONT_CUT = ['cfNeck', 'collarTip', 'lapelStraightEnd', 'hemEdge', 'flbHem'];
const FRONT_FIN = ['rollLineEnd', 'rollCross', 'rollLineStart', 'hemEdge', 'flbHem'];
const UNDER_FIN = ['rollLineEnd', 'rollCross', 'underTop', 'underHem'];

/**
 * The drape copy as the finished coat shows it from outside (as simon.js does for its
 * plackets): the left front ends at its lapel's roll line (the lapel is turned back over
 * it), the right front ('<id>.frontUnder', added to the draft) where it disappears under
 * the left front: its own roll line down to the centre front, then the left front's edge
 * (mirrored). The back's centre seam runs straight down to the waist (the pleat is folded
 * in) and the sleeves end at the wrist (twopart.js finishSleeve). The tails start at their
 * first pleat's fold (the centre back edge folds under); the rest of the pleats are sewn into
 * the waist as ease, and open up over the seat. Mutates the draft: for the drape copy only.
 */
function finishParts(parts, id) {
  const fp = parts[id + '.front'], bp = parts[id + '.back'], tp = parts['carlton.tail'];
  if (fp.finished3d) return;
  fp.finished3d = true;
  const q = fp.points, Pt = q.cfNeck.constructor, Path = fp.paths.seam.constructor;
  const ops = fp.paths.seam.ops;
  const iN = ops.findIndex(op => same(op.to, q.neck)), iC = ops.findIndex(op => same(op.to, q.cfNeck));
  const iH = ops.findIndex(op => same(op.to, q.hemEdge)), iF = ops.findIndex(op => same(op.to, q.flbHem));
  const c = ops[iC];
  const neck = c.type === 'curve' ? new Path().move(q.neck).curve(c.cp1, c.cp2, c.to).split(q.rollLineEnd)[0].ops[1] : { type: 'line', to: q.rollLineEnd };
  const a = q.rollLineStart, b = q.rollLineEnd, t = a.x / (a.x - b.x);
  q.rollCross = new Pt(0, a.y + (b.y - a.y) * t);        // the roll line at the centre front
  const top = [...ops.slice(0, iN + 1), neck, { type: 'line', to: q.rollCross }];
  fp.paths.seam.ops = [...top, { type: 'line', to: a }, ...ops.slice(iH)];
  // the right front: an extra part with its own outline (same points)
  const under = { name: id + '.frontUnder', points: { ...q }, paths: { seam: { ops: [] } } };
  under.points.underTop = new Pt(-a.x, a.y);
  under.points.underHem = new Pt(-a.x, q.hemEdge.y);
  under.paths.seam.ops = [...top, { type: 'line', to: under.points.underTop }, { type: 'line', to: under.points.underHem }, ...ops.slice(iF + 1)];
  parts[id + '.frontUnder'] = under;
  // back: the centre back seam straight down to the waist
  const bq = bp.points, bo = bp.paths.seam.ops, iD = bo.findIndex(op => same(op.to, bq.dartLeft));
  bp.paths.seam.ops = [bo[0], { type: 'line', to: bq.cbWaist }, ...bo.slice(iD)];
  // tail: from its first pleat's fold (the strip beyond it is folded under, its edge aligned
  // with the second fold line: FreeSewing's 'fold under to align')
  const tq = tp.points;
  tp.paths.seam.ops = [{ type: 'move', to: tq.fold1Top }, { type: 'line', to: tq.fold1Bottom }, { type: 'line', to: tq.waistBottom },
    { type: 'line', to: tq.waistTop }, { type: 'line', to: tq.fold1Top }];
  finishSleeve(parts['carlton.topsleeve'], 'ts');
  finishSleeve(parts['carlton.undersleeve'], 'us');
}

/**
 * cfg: { id, side: null (Carlton) or { part, seam: names up the side seam, princess: names
 * down the princess seam, armhole: names below the pitch } , front: names up to the armhole
 * pitch (side or princess seam, armhole below the pitch) }
 */
function edges(parts, cfg, drape) {
  const fp = parts[cfg.id + '.front'], bp = parts[cfg.id + '.back'];
  const Ef = edgesOf(fp, [...cfg.front, ...FRONT_TOP, ...(drape ? FRONT_FIN : FRONT_CUT)]);
  const Eu = drape ? edgesOf(parts[cfg.id + '.frontUnder'], [...cfg.front, ...FRONT_TOP, ...UNDER_FIN]) : null;
  const Eb = edgesOf(bp, drape ? BACK_FIN : BACK_CUT);
  const Es = cfg.side ? edgesOf(parts[cfg.side.part], cfg.side.names) : null;
  return { Ef, Eu, Eb, Es };
}

/*
 * Edges (by the point each ends at): front: Carlton's side seam (hem -> seat, waist, armhole)
 *   or Carlita's princess seam (hem -> bustPoint, armholePitch), the armhole (-> pitch,
 *   shoulder), shoulder seam (-> neck), neckline; in the drape copy then the roll line
 *   (-> rollCross, rollLineStart) and the front edge (-> hemEdge), hem; the right front's
 *   copy: the roll line to rollCross, the left front's edge (-> underTop, underHem), hem.
 * Carlita's side panel: side seam (hem -> seat, waist, armhole: up), armhole (-> hollow,
 *   pitch), princess seam (-> bustPoint, psWaist, psHem: down), hem.
 * back: centre back (-> cbWaist in the drape copy), waist (-> dartLeft), dart (-> dartTip,
 *   dartRight), waist (-> waist), side seam (-> armhole), armhole, shoulder seam, neck.
 * tail: 0 centre back (down), 1 hem, 2 side seam (up), 3 waist (side -> centre back).
 * The unmirrored front, side panel and sleeve pieces (twopart.js) and the mirrored back and
 * tail are the wearer's left.
 */
export function coatSpec(cfg, o, draft) {
  const parts = draft.parts[0], id = cfg.id;
  if (o.drape) finishParts(parts, id);
  const { Ef, Eu, Eb, Es } = edges(parts, cfg, o.drape);
  const E = sleeveEdges(parts['carlton.topsleeve'], parts['carlton.undersleeve']);
  const seams = [];
  for (const s of ['l', 'r']) {
    const fr = 'front_' + s, sd = 'side_' + s, bk = (s === 'l' ? 'left' : 'right') + '_back', tl = 'tail_' + s;
    const F = s === 'r' && Eu ? Eu : Ef;   // the right front's own outline in the drape copy
    const id_ = (k) => String(k);
    let lower, upper;
    const back = { below: range(Eb.armhole, Eb.armholePitch), above: range(Eb.armholePitch, Eb.shoulder) };
    if (Es) {
      // Carlita: the side panel carries the armhole below the pitch
      ({ upper, lower } = armholeChains(fr, bk, id_, id_, { below: [], above: range(F.armholePitch, F.shoulder) }, back));
      lower = [...range(Es.armhole, Es.armholePitch).reverse().map(k => [sd, k, true]), ...lower];
      seams.push(
        { a: range(-1, F.armholePitch).map(k => [fr, k]), b: range(Es.armholePitch, Es.psHem).reverse().map(k => [sd, k, true]) },   // princess seam
        { a: range(-1, Es.waist).map(k => [sd, k]), b: [[tl, 2]] },                                                                 // side seam: tail
        { a: [[sd, Es.armhole]], b: [[bk, Eb.armhole]] },                                                                           // side seam: back
      );
    } else {
      ({ upper, lower } = armholeChains(fr, bk, id_, id_, { below: range(F.armhole, F.armholePitch), above: range(F.armholePitch, F.shoulder) }, back));
      seams.push({ a: range(-1, F.waist).map(k => [fr, k]), b: [[tl, 2]] }, { a: [[fr, F.armhole]], b: [[bk, Eb.armhole]] });   // side seam (tail, back)
    }
    seams.push(
      { a: [[fr, F.neck]], b: [[bk, Eb.neck]] },                                                                          // shoulder
      { a: [[bk, Eb.dartTip]], b: [[bk, Eb.dartRight, true]] },                                                           // back dart
      { a: [[tl, 3]], b: [[bk, Eb.waist, true], [bk, Eb.dartLeft, true]] },                                               // tail to the back's waist
      ...sleeveSeams(E, 'top_sleeve_' + s, 'under_sleeve_' + s, { upper, lower }),
    );
  }
  const cbEnd = Eb.cbWaist ?? Eb.bpStart;
  seams.push({ a: range(-1, cbEnd).map(k => ['left_back', k]), b: range(-1, cbEnd).map(k => ['right_back', k]) });   // centre back
  // the tails' folded centre back edges meet in an inverted pleat: drawn closed (edge to edge)
  if (o.drape) seams.push({ a: [['tail_l', 0]], b: [['tail_r', 0]] });
  if (Eu) seams.push({ a: [['front_l', Ef.rollLineStart], ['front_l', Ef.hemEdge]], b: [['front_r', Eu.underTop], ['front_r', Eu.underHem]] });   // buttoned: the left front over the right
  const pair = (nm, part, extra = {}) => [{ name: nm + '_l', part, ...extra }, { name: nm + '_r', part, mirror: true, ...extra }];
  return {
    pieces: [
      { name: 'front_l', part: id + '.front', label: 'body' },
      { name: 'front_r', part: id + (o.drape ? '.frontUnder' : '.front'), mirror: true, label: 'body' },
      ...(cfg.side ? pair('side', cfg.side.part, { label: 'body' }) : []),
      { name: 'left_back', part: id + '.back', mirror: true, label: 'body' },
      { name: 'right_back', part: id + '.back', label: 'body' },
      { name: 'tail_l', part: 'carlton.tail', mirror: true, label: 'body' },
      { name: 'tail_r', part: 'carlton.tail', label: 'body' },
      { name: 'top_sleeve_l', part: 'carlton.topsleeve', label: 'arm', follow: 12 },
      { name: 'under_sleeve_l', part: 'carlton.undersleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'top_sleeve_r', part: 'carlton.topsleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'under_sleeve_r', part: 'carlton.undersleeve', label: 'arm', follow: 12 },
      // cut, not draped (FreeSewing cuts two collars, two stands and four belt pieces)
      { name: 'collar', part: 'carlton.collar', cutOnly: true, lining: true },
      { name: 'collar_stand', part: 'carlton.collarStand', cutOnly: true, lining: true },
      ...pair('belt', 'carlton.belt', { cutOnly: true, lining: true }),
      ...pair('front_facing', id + '.frontFacing', { cutOnly: true }),
      ...pair('cuff_facing', 'carlton.cuffFacing', { cutOnly: true }),
      ...pair('patch', 'carlton.pocket', { cutOnly: true }),
      ...pair('flap', 'carlton.pocketFlap', { cutOnly: true, lining: true }),
      ...pair('chest_welt', 'carlton.chestPocketWelt', { cutOnly: true }),
      ...pair('inner_welt', 'carlton.innerPocketWelt', { cutOnly: true }),
    ],
    seams,
    labels: {},
  };
}

export const coatOthers = {
  lining: ['Front lining × 2', 'Back × 2', 'Tail × 2', 'Top sleeve × 2', 'Under sleeve × 2', 'Pocket lining × 2', 'Chest pocket bag × 2', 'Inner pocket bag × 2', 'Inner pocket tab × 1'],
  canvas: ['Collar × 1', 'Collar stand × 1', 'Cuff facing × 2', 'Pocket flap × 2', 'Chest pocket welt × 2', 'Inner pocket welt × 2', 'Back stay × 1 (on the fold)'],
};

export function coatPlacement(cfg, draft, m, body) {
  const parts = draft.parts[0], id = cfg.id, fp = parts[id + '.front'], bp = parts[id + '.back'], tp = parts['carlton.tail'];
  const ts = parts['carlton.topsleeve'], us = parts['carlton.undersleeve'];
  const F = upperFrame(body, m);
  const { Ef, Eb, Es } = edges(parts, cfg, true);
  const ef = pathEdges(fp.paths.seam), eb = pathEdges(bp.paths.seam);
  const sp = cfg.side ? parts[cfg.side.part] : null, es = sp ? pathEdges(sp.paths.seam) : null;
  // the front's outer seam: Carlton's side seam, Carlita's princess seam
  const frontHi = seamX(range(-1, cfg.side ? Ef.armholePitch : Ef.armhole).map(k => ef[k]));
  const side = sp ? { part: sp, lo: seamX(range(Es.armholePitch, Es.psHem).map(k => es[k])), hi: seamX(range(-1, Es.armhole).map(k => es[k])) } : null;
  // the tails: their pleats take up 2 x cbToDart at the waist (the back's waist width); laid
  // gathered to that width at the waist, opening up to their full width 25 cm below
  const yW = P(bp.points.cbWaist)[1], f1 = tp.points.fold1Top.x / 10, tailFull = tp.points.waistTop.x / 10 - f1;
  const waistW = tailFull + f1 - 2 * tp.points.fold2Top.x / 10;
  const tScale = (y) => { const t = Math.max(0, Math.min(1, (yW - y) / 25)); return (waistW + (tailFull - waistW) * t * t * (3 - 2 * t)) / tailFull; };
  const bSide = seamX([eb[Eb.armhole]]);
  const T = jacketTorso(F, {
    front: { part: fp, cx: 0, shoulder: Ef.neck, hi: frontHi },
    side,
    back: { part: bp, cb: () => 0, hi: (y) => (y >= yW ? bSide(y) : tailFull * tScale(y)), shoulder: Eb.neck },
    armhole: P((sp || fp).points.armhole),
    // below the seat the coat hangs as a cone (in the back's coordinates: as far below its waist)
    skirt: { front: P(fp.points.cfSeat)[1], back: yW - (P(fp.points.cfWaist)[1] - P(fp.points.cfSeat)[1]) },
  });
  const tail = (x, y, sg) => T.Tb(sg * (x - f1) * tScale(yW + y), yW + y);
  const S = sleeveMaps(F, ts, us, sleeveEdges(ts, us));
  const flip = (fn, mirror) => (mirror ? (x, y) => fn(-x, y, -1) : (x, y) => fn(x, y, 1));
  return (ps) => {
    if (/^front_[lr]$/.test(ps.name)) return flip(T.front, ps.mirror);
    if (/^side_[lr]$/.test(ps.name)) return flip(T.side, ps.mirror);
    if (/_back$/.test(ps.name)) return flip(T.back, ps.mirror);
    if (/^tail_[lr]$/.test(ps.name)) return flip(tail, ps.mirror);
    if (/sleeve/.test(ps.name)) return S(ps.name.startsWith('top') ? 'top' : 'under', ps.mirror);
    return null;
  };
}
