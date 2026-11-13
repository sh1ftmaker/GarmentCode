// FreeSewing "Otis" baby romper (https://freesewing.eu/designs/otis/, MIT, design by Natalia
// Sayang): a front and a back cut on the fold, with short or long sleeves, bound neck and leg
// openings and a snap placket at the crotch. Otis drafts from the waist alone (its shapes are
// a newborn's, scaled by the waist), so on the mannequin it is a romper in adult size, with
// a baby's proportions: a wide neck, short shoulders and a roomy body.
// Measurements from the mannequin, options as sliders, seam table and placement around the
// torso and arms for the drape.
//
// The front and back are joined by a short shoulder seam: the first 15% of each armhole (from
// the neck), FreeSewing's shoulder notch; the sleeve cap is sewn to the rest. The crotch closes
// with snaps on overlapping plackets: the drape uses a relaxed copy with the plackets closed
// (no overlap, snap placket 0), the front's crotch edge sewn to the back's.
import { upperFrame, torsoMap, outlineSpan, sleeveMap } from './place.js';
import { pieceLoop } from './convert.js';
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions } from './lower.js';

export const id = 'otis';
export const name = 'Otis romper';
export const short = 'Romper';
export const exportName = 'Otis';
export const url = 'https://freesewing.eu/designs/otis/';
export const author = 'Natalia Sayang';
export const settings = { expand: true };   // the bindings are rectangles
export const icon = 'M18 6c3 5 17 5 20 0l8 4 8 12-7 4-5-6v20l-5 12h-8l-1-6-1 6h-8l-5-12V20l-5 6-7-4 8-12z';
export const stretchNote = 'Otis drafts from the waist alone (a newborn\'s shapes scaled to it), so on an adult body it is an adult-sized romper with a baby\'s proportions. The 3D drape uses a relaxed copy with the crotch snaps closed (the plackets overlapping, so no placket); the bindings round the neck and leg openings are cut but not simulated, and the sleeve hems are draped unturned.';

export const design = {
  fit: {
    ease: { v: 14, range: [0, 30], type: 'float', fs: 'pct', name: 'Ease (%)', help: 'The ease is a percentage of the waist measurement.' },
  },
  style: {
    sleeveType: { v: 'short', range: ['short', 'long'], type: 'select', fs: 'list', name: 'Sleeve type', help: 'Otis can be made with short or long sleeves.' },
  },
  advanced: {
    snapPlacket: { v: 5, range: [0, 30], type: 'float', fs: 'pct', name: 'Snap placket (%)', help: 'The depth of the placket that holds the snaps.' },
    hem: { v: 10, range: [0, 30], type: 'float', fs: 'pct', name: 'Hem (%)', help: 'The size of the hem on the sleeves.' },
    binding: { v: 11, range: [2, 30], type: 'float', fs: 'pct', name: 'Binding (%)', help: 'The size of the binding for the neck and leg openings.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) o.snapPlacket = 0;   // snaps closed: the plackets overlap completely
  return o;
}
export const measurements = (m, body) => pick(fsMeasurements(m, body), ['waist']);

const sleevePart = (parts) => (parts['otis.longsleeve'] && !parts['otis.longsleeve'].hidden ? 'otis.longsleeve' : 'otis.shortsleeve');
/**
 * FreeSewing closes Otis's sleeve along its fold twice (down and back up the fold, then a
 * closing line): give it a clean outline, its own outline up to the top of the fold, then the
 * fold (once per draft).
 */
function cleanSleeve(draft) {
  const parts = draft.parts[0], sl = parts[sleevePart(parts)];
  if (!sl || sl.__clean) return sl;
  sl.paths.seam = { ops: [...sl.paths.seamSA.ops, { type: 'close' }] };
  Object.defineProperty(sl, '__clean', { value: true, enumerable: false });
  return sl;
}

/*
 * Edges (by point name, see @freesewing/otis):
 *  back (cut on the fold): neck p0 -> p1, armhole p1 -> p2 (the first 15% the shoulder seam),
 *    side p2 -> p3, leg opening p3 -> p5, placket p5 -> p6, crotch edge p6 -> p7, fold.
 *  front (cut on the fold): neck, armhole, side, leg opening p3 -> p4, placket p4 -> p5,
 *    crotch edge p5 -> p6, fold.
 *  sleeve (cut on the fold, the last edge): hem p1h -> p2h, underarm p2h -> p3, cap p3 -> p0.
 * The drafted halves are the wearer's right (front) and left (back); the sleeve's drafted
 * half is its back.
 */
function edges(draft) {
  const parts = draft.parts[0], bp = parts['otis.back'], fp = parts['otis.front'], sl = cleanSleeve(draft);
  const B = bp.points, F = fp.points, S = sl.points;
  return {
    sleeve: sleevePart(parts), sl,
    bFold: opsBetween(bp, B.p7, B.p0)[0], fFold: opsBetween(fp, F.p6, F.p0)[0],
    bArm: opsBetween(bp, B.p1, B.p2), fArm: opsBetween(fp, F.p1, F.p2),
    bSide: opsBetween(bp, B.p2, B.p3), fSide: opsBetween(fp, F.p2, F.p3),
    bCrotch: opsBetween(bp, B.p6, B.p7), fCrotch: opsBetween(fp, F.p5, F.p6),
    under: opsBetween(sl, S.p2h, S.p3), cap: opsBetween(sl, S.p3, S.p0),
    slFold: sl.paths.seam.ops.filter(o => o.type !== 'move').length - 1,
  };
}

export function spec(o, draft) {
  const E = edges(draft);
  if (E.bArm.length !== 1 || E.fArm.length !== 1) throw new Error('Otis: unexpected armhole');
  const ba = E.bArm[0], fa = E.fArm[0], SH = 0.15;
  const seams = [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? 'm' + k : String(k)), b = (k) => (s > 0 ? String(k) : 'm' + k);
    const sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    seams.push(
      { a: E.fSide.map(k => ['front', f(k)]), b: E.bSide.map(k => ['back', b(k)]) },          // side seam, armpit down
      { a: [['front', f(fa), false, 0, SH]], b: [['back', b(ba), false, 0, SH]] },             // shoulder, neck out
      // armhole (back armpit -> shoulder notch -> front armpit) to the cap (back armpit -> top -> front armpit)
      { a: [['back', b(ba), true, SH, 1], ['front', f(fa), false, SH, 1]], b: [...E.cap.map(k => [sl, String(k)]), ...[...E.cap].reverse().map(k => [sl, 'm' + k, true])] },
      { a: E.under.map(k => [sl, String(k)]), b: E.under.map(k => [sl, 'm' + k]) },          // underarm, hem up
    );
  }
  // crotch (snaps closed): the front's crotch edge to the back's, across
  seams.push({ a: [...E.fCrotch.map(k => ['front', String(k)]), ...[...E.fCrotch].reverse().map(k => ['front', 'm' + k, true])],
    b: [...E.bCrotch.map(k => ['back', 'm' + k]), ...[...E.bCrotch].reverse().map(k => ['back', String(k), true])] });
  return {
    pieces: [
      { name: 'front', part: 'otis.front', fold: E.fFold, label: 'body' },
      { name: 'back', part: 'otis.back', fold: E.bFold, label: 'body' },
      { name: 'sleeve_l', part: E.sleeve, fold: E.slFold, label: 'arm', follow: 14 },
      { name: 'sleeve_r', part: E.sleeve, fold: E.slFold, mirror: true, label: 'arm', follow: 14 },
      { name: 'neck_binding_back', part: 'otis.bindingNeckBack', cutOnly: true },
      { name: 'neck_binding_front', part: 'otis.bindingNeckFront', cutOnly: true },
      { name: 'leg_binding_l', part: 'otis.bindingLeg', cutOnly: true },
      { name: 'leg_binding_r', part: 'otis.bindingLeg', mirror: true, cutOnly: true },
    ],
    seams,
    labels: {},
  };
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const P2 = (pt) => [pt.x / 10, -pt.y / 10];

export function placement(draft, m, body) {
  const parts = draft.parts[0], bp = parts['otis.back'], fp = parts['otis.front'];
  const E = edges(draft);
  const F = upperFrame(body, m);
  const sf = outlineSpan(pieceLoop(fp, { fold: E.fFold })), sb = outlineSpan(pieceLoop(bp, { fold: E.bFold }));
  const half = (s, y) => { const r = s(Math.max(s.y0, Math.min(s.y1, y))); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  // shoulder line: the neck point (p1) out to the shoulder notch
  const line = (part) => {
    const n = P2(part.points.p1), s = P2(part.points.shoulder);
    return { hps: [Math.abs(n[0]), n[1]], slope: Math.max(0, (n[1] - s[1]) / Math.max(1, Math.abs(s[0] - n[0]))) };
  };
  const lf = line(fp), lb = line(bp);
  // front and back drawn with their own origins (the neck centres): heights below the shoulder line
  const dFB = lf.hps[1] - lb.hps[1];
  // below the side seams the pieces narrow into the crotch: keep the girth of the hips there
  // (the narrow part then stays at the centre front / back instead of being spread round)
  const yLow = Math.max(P2(fp.points.p3)[1], P2(bp.points.p3)[1] + dFB);
  const girthF = (y) => { const yy = Math.max(y, yLow); return half(sf, yy) + half(sb, yy - dFB); };
  const girthB = (y) => girthF(y + dFB);
  const armholeY = Math.min(P2(fp.points.p2)[1], P2(bp.points.p2)[1] + dFB);
  const Tf = torsoMap(F, { side: 1, xSign: 1, ...lf, girth: girthF, armholeY, gap: 1.5 });
  const Tb = torsoMap(F, { side: -1, xSign: -1, ...lb, girth: girthB, armholeY: armholeY - dFB, gap: 1.5 });
  // below the crotch the front and back fold in under the body towards each other (they are
  // sewn together there), as Uma's gusset does
  // (at the crotch, or where the pieces end when they are longer than the body)
  const yBot = Math.max(Tf(0, P2(fp.points.p6)[1])[1], Tb(0, P2(bp.points.p7)[1])[1]);
  const Yc = Math.min(F.Ycrotch + 1, yBot + 6);
  const under = (T) => (x, y) => {
    const p = T(x, y);
    if (p[1] >= Yc) return p;
    const e = Yc - p[1], S = F.sec(Yc), zc = S.zc;
    const w = sm(1 - Math.abs(p[0]) / 14);
    const z = zc + Math.sign(p[2] - zc) * Math.max(0.6, Math.abs(p[2] - zc) - 1.4 * e);
    return [p[0], p[1] * (1 - w) + (Yc - 0.5) * w, p[2] * (1 - w) + z * w];
  };
  const front = under(Tf), back = under(Tb);
  // sleeves: tubes around the arms (snapped onto the armholes)
  const sl = E.sl, bicepsY = P2(sl.points.p3)[1];
  const sleeves = {};
  for (const mirror of [false, true]) {
    const loop = pieceLoop(sl, { fold: E.slFold, mirror });
    sleeves[mirror] = sleeveMap(F, { sx: mirror ? -1 : 1, span: outlineSpan(loop), bicepsY, frontSign: mirror ? 1 : -1, atCrease: true });
  }
  return (ps) => {
    if (ps.name === 'front') return front;
    if (ps.name === 'back') return back;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror];
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
