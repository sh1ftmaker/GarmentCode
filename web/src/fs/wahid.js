// FreeSewing "Wahid" waistcoat (https://freesewing.eu/designs/wahid/, MIT, design by Joost
// De Cock): a classic fitted waistcoat on Brian's block, with waist darts, a buttoned front,
// welt pockets, facings and a lining. Measurements from the mannequin, options as sliders,
// seam table and placement around the torso for the drape (the shell: fronts and backs).
import { upperFrame, torsoMap, outlineSpan } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';
import { brianMeasurements, treeOptions, pick } from './tops.js';

export const id = 'wahid';
export const name = 'Wahid waistcoat';
export const short = 'Waistcoat';
export const exportName = 'Wahid';
export const url = 'https://freesewing.eu/designs/wahid/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the pocket parts too
export const icon = 'M19 6h6l3 14 3-14h6l3 9c-2 6-1 12 3 16l-1 19-12 2-12-2-1-19c4-4 5-10 3-16z';
export const stretchNote = 'The 3D drape shows the shell (fronts and backs, darts sewn) buttoned edge to edge at the centre front: the button stand, about 1 cm a side, is not overlapped. Facings, linings and the welt pocket parts are cut but not simulated.';

export const design = {
  fit: {
    chestEase: { v: 2, range: [1, 10], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    waistEase: { v: 8, range: [2, 15], type: 'float', name: 'Waist ease (%)', help: 'The amount of ease at the waist.' },
    hipsEase: { v: 8, range: [2, 15], type: 'float', name: 'Hips ease (%)', help: 'The amount of ease at the hips.' },
    lengthBonus: { v: 1, range: [0, 8], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the waistcoat.' },
    centerBackDart: { v: 2, range: [0, 5], type: 'float', name: 'Center back dart (%)', help: 'Shapes the centre back seam to fit a rounded back.' },
  },
  style: {
    necklineDrop: { v: 50, range: [35, 85], type: 'float', name: 'Neckline drop (%)', help: 'How low the neckline drops at the front.' },
    frontStyle: { v: 'classic', range: ['classic', 'rounded'], type: 'select', name: 'Neck opening style', help: 'Style of the neck opening.' },
    hemStyle: { v: 'classic', range: ['classic', 'rounded', 'square'], type: 'select', name: 'Hem style', help: 'Style of the front hem.' },
    hemRadius: { v: 6, range: [2, 12], type: 'float', name: 'Hem radius (%)', help: 'Radius by which the hem is rounded (rounded hem).' },
    buttons: { v: 6, range: [4, 12], type: 'int', name: 'Buttons', help: 'The number of buttons.' },
  },
};

export const options = (d) => treeOptions(d, new Set(['frontStyle', 'hemStyle', 'buttons']));
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'waist'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

/**
 * Wahid's outlines change with its options (hem style, front style), so its edges are found
 * by the FreeSewing points they end at, in drawing order: returns { name: edgeIndex }.
 */
function edgesOf(part, names) {
  const ends = [];
  let first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { first = op.to; continue; }
    ends.push(op.type === 'close' ? first : op.to);
  }
  const out = {};
  let k = -1;
  for (const nm of names) {
    const p = part.points[nm];
    let j = k + 1;
    while (j < ends.length && !(p && Math.abs(ends[j].x - p.x) < 0.01 && Math.abs(ends[j].y - p.y) < 0.01)) j++;
    if (j >= ends.length) throw new Error(`Wahid: no seam edge ends at ${nm}`);
    out[nm] = k = j;
  }
  return out;
}
const FRONT = ['hips', 'waist', 'armhole', 'armholeHollow', 'armholePitch', 'shoulder', 'neck', 'closureTop',
  'dartHipLeft', 'dartWaistLeft', 'dartTop', 'dartWaistRight', 'dartHipRight', 'dartEnd'];
const BACK = ['hips', 'waist', 'armhole', 'armholeHollow', 'armholePitch', 'shoulder', 'neck', 'cbNeck', 'cbArmhole', 'cbHem',
  'dartHipLeft', 'dartWaistLeft', 'dartTop', 'dartWaistRight', 'dartHipRight', 'dartEnd'];

/*
 * Edges (by the point each ends at): front and back: side seam (-> hips, waist, armhole: up),
 *   armhole (-> armholeHollow, armholePitch, shoulder), shoulder seam (-> neck), then the front's
 *   neckline (-> closureTop) and closure (from closureTop down: the button stand's edge),
 *   the back's neckline (-> cbNeck) and centre back seam (-> cbArmhole, cbHem); the waist dart,
 *   one leg up (-> dartHipLeft, dartWaistLeft, dartTop) and the other down (-> dartWaistRight,
 *   dartHipRight, dartEnd).
 * The unmirrored front and the mirrored back are the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['wahid.front'], bp = parts['wahid.back'];
  const F = edgesOf(fp, FRONT), B = edgesOf(bp, BACK);
  const closure = F.closureTop + 1;
  const seams = [];
  const dart = (piece, E) => ({ a: [[piece, E.dartHipLeft], [piece, E.dartWaistLeft], [piece, E.dartTop]],
    b: [[piece, E.dartEnd, true], [piece, E.dartHipRight, true], [piece, E.dartWaistRight, true]] });
  for (const s of ['l', 'r']) {
    const fr = 'front_' + s, bk = (s === 'l' ? 'left' : 'right') + '_back';   // left_back_lining reads 'Back lining (left)'
    seams.push(
      { a: [[fr, F.hips], [fr, F.waist], [fr, F.armhole]], b: [[bk, B.hips], [bk, B.waist], [bk, B.armhole]] },   // side seam
      { a: [[fr, F.neck]], b: [[bk, B.neck]] },                                                                    // shoulder seam
      dart(fr, F), dart(bk, B),
    );
  }
  seams.push(
    { a: [['left_back', B.cbArmhole], ['left_back', B.cbHem]], b: [['right_back', B.cbArmhole], ['right_back', B.cbHem]] },     // centre back
    { a: [['front_l', closure]], b: [['front_r', closure]] },                                                      // buttoned
  );
  const pair = (name, part, extra = {}) => [{ name: name + '_l', part, ...extra }, { name: name + '_r', part, mirror: true, ...extra }];
  return {
    pieces: [
      { name: 'front_l', part: 'wahid.front', label: 'body' },
      { name: 'front_r', part: 'wahid.front', mirror: true, label: 'body' },
      // FreeSewing cuts the back twice in fabric and twice in lining
      { name: 'left_back', part: 'wahid.back', mirror: true, label: 'body', lining: true },
      { name: 'right_back', part: 'wahid.back', label: 'body', lining: true },
      ...pair('front_facing', 'wahid.frontFacing', { cutOnly: true }),
      ...pair('front_lining', 'wahid.frontLining', { cutOnly: true }),
      ...pair('welt', 'wahid.pocketWelt', { cutOnly: true }),
      ...pair('welt_facing', 'wahid.pocketFacing', { cutOnly: true }),
      ...pair('welt_bag', 'wahid.pocketBag', { cutOnly: true }),
      ...pair('welt_interfacing', 'wahid.pocketInterfacing', { cutOnly: true }),
    ],
    seams,
    labels: {},
  };
}

/** x where a set of polylines crosses height y (the first crossing found), or null. */
function xAt(polys, y) {
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  return null;
}

/**
 * Where a Wahid front or back lies around the torso (toSewn: x -> girth from the centre). The piece is laid around
 * the torso as if its dart were already sewn (the cloth beyond the dart moves in by the
 * dart's width) and, for the front, with the button stand's edge (cx) at the centre front.
 */
function piecemap(part, E, cx) {
  const ed = pathEdges(part.paths.seam);
  const legA = [ed[E.dartHipLeft], ed[E.dartWaistLeft], ed[E.dartTop]], legB = [ed[E.dartWaistRight], ed[E.dartHipRight], ed[E.dartEnd]];
  const span = outlineSpan(pieceLoop(part));
  const dartAt = (y) => {
    const a = xAt(legA, y), b = xAt(legB, y);
    return a != null && b != null && b > a ? [a, b] : null;
  };
  const toSewn = (x, y) => {
    const d = dartAt(y);
    let u = x - cx;
    if (d) u -= x >= d[1] ? d[1] - d[0] : x > d[0] ? x - d[0] : 0;
    return u;
  };
  const half = (y) => { const r = span(Math.max(span.y0, Math.min(span.y1, y))); return r ? toSewn(r[1], y) : 0; };
  return { toSewn, half };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['wahid.front'], bp = parts['wahid.back'];
  const F = upperFrame(body, m);
  const Ef = edgesOf(fp, FRONT), Eb = edgesOf(bp, BACK);
  const cx = pathEdges(fp.paths.seam)[Ef.closureTop + 1][0][0];   // the button stand's edge
  const pf = piecemap(fp, Ef, cx), pb = piecemap(bp, Eb, 0);
  const girth = (y) => pf.half(y) + pb.half(y);
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const armholeY = Math.min(P(fp.points.armhole)[1], P(bp.points.armhole)[1]);
  const line = (part, E, shift) => {
    const e = pathEdges(part.paths.seam)[E.neck], a = e[0], b = e[e.length - 1];
    const [n, s] = a[0] < b[0] ? [a, b] : [b, a];
    // shoulderX / armholeX: start the armhole below the armpit crease (torsoMap), so the side
    // seam's top is not caught between the arm and the body
    return { hps: [n[0] - shift, n[1]], slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])),
      shoulderX: s[0] - shift, armholeX: P(part.points.armhole)[0] - shift };
  };
  const Tf = torsoMap(F, { side: 1, xSign: 1, ...line(fp, Ef, cx), girth, armholeY, gap: 1.5 });
  const Tb = torsoMap(F, { side: -1, xSign: -1, ...line(bp, Eb, 0), girth, armholeY, gap: 1.5 });
  // pieces are mapped in FreeSewing's (unmirrored) coordinates: a mirrored copy's local x is -x
  const wrap = (T, pm, sx) => (x, y) => T(sx * pm.toSewn(sx * x, y), y);
  return (ps) => {
    const sx = ps.mirror ? -1 : 1;
    return /^front_[lr]$/.test(ps.name) ? wrap(Tf, pf, sx) : /^(left|right)_back$/.test(ps.name) ? wrap(Tb, pb, sx) : null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
