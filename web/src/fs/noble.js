// FreeSewing "Noble" body block (https://freesewing.eu/designs/noble/, MIT, design
// by Wouter Van Wageningen): Bella's block with its darts turned into princess seams, front and
// back each cut as an inside (centre) and an outside (side) panel, the front princess seam
// running to the shoulder or into the armhole. Sleeveless. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso for the drape.
//
// Noble is not built on Brian. Its back panels are Bella's back cut apart along the waist
// dart; its front outside panel is drawn with the bust dart rotated into the princess seam,
// so it lies elsewhere on the sheet. For the placement each outside panel is slid onto the
// inside panel's princess seam (bodice.js slideFlat), and the joined front and back are laid
// around the torso with place.js's torsoMap (bodice.js dartedTorso), as Bella's.
import { upperFrame } from './place.js';
import { pathEdges } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';
import { edgesOf, slideFlat, dartedTorso, polysOf, range, P } from './bodice.js';

export const id = 'noble';
export const name = 'Noble body block';
export const short = 'Princess block';
export const exportName = 'Noble';
export const url = 'https://freesewing.eu/designs/noble/';
export const author = 'Wouter Van Wageningen';
export const icon = 'M19 6l5-1c2 4 6 4 8 0l5 1 3 14-1 30H12l-1-30 3-14zM24 5c-3 10-2 25 1 45M32 5c3 10 2 25-1 45';
export const stretchNote = 'Noble is a block: the starting point other designs are drafted from, without hems, closures or sleeves. The 3D drape sews it up as drafted: princess seams front and back, the centre front panel cut on the fold, the back in two halves with a centre back seam.';

const KEEP = new Set(['dartPosition']);
export const design = {
  fit: {
    chestEase: { v: 11, range: [5, 20], type: 'float', name: 'Chest ease (%)', help: 'Controls the amount of ease at the chest.' },
    fullChestEaseReduction: { v: 4, range: [0, 8], type: 'float', name: 'Full chest ease reduction (%)', help: 'Reduces the ease around the full chest independently, for a tighter fit there.' },
    waistEase: { v: 5, range: [1, 20], type: 'float', name: 'Waist ease (%)', help: 'Controls the amount of ease at the waist.' },
    bustSpanEase: { v: 0, range: [-5, 20], type: 'float', name: 'Bust span ease (%)', help: 'Controls the amount of ease along the bust span.' },
    shoulderToShoulderEase: { v: -0.5, range: [-1, 5], type: 'float', name: 'Shoulder to shoulder ease (%)', help: 'Controls the amount of ease along the shoulder to shoulder measurement.' },
  },
  style: {
    dartPosition: { v: 'shoulder', range: ['shoulder', 'armhole'], type: 'select', name: 'Dart position', help: 'Whether the front princess seam runs to the shoulder or into the armhole.' },
    shoulderDartPosition: { v: 50, range: [10, 90], type: 'float', name: 'Shoulder dart position (%)', help: 'Where along the shoulder the princess seam starts (shoulder position).' },
    armholeDartPosition: { v: 50, range: [10, 90], type: 'float', name: 'Armhole dart position (%)', help: 'Where along the armhole the princess seam starts (armhole position).' },
    armholeDepth: { v: 44, range: [38, 46], type: 'float', name: 'Armhole depth (%)', help: 'Controls the depth of the armhole.' },
    waistDartLength: { v: 90, range: [75, 95], type: 'float', name: 'Waist dart length (%)', help: 'Controls the length of the waist dart.' },
    upperDartLength: { v: 90, range: [80, 95], type: 'float', name: 'Upper dart length (%)', help: 'Controls the length of the upper dart.' },
  },
};

export const options = (d) => treeOptions(d, KEEP);
const MEASUREMENTS = ['highBust', 'chest', 'underbust', 'waist', 'waistBack', 'bustSpan', 'neck', 'hpsToBust', 'hpsToWaistFront',
  'hpsToWaistBack', 'shoulderToShoulder', 'shoulderSlope'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 3;
function opEnds(part) {   // [start, end] FreeSewing points of every drawing operation (null for empty closes)
  const out = [];
  let cur = null, first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { cur = first = op.to; continue; }
    const to = op.type === 'close' ? first : op.to;
    out.push(op.type === 'close' && near(cur, first) ? null : [cur, to]);
    cur = to;
  }
  return out;
}
const lastEdge = (part) => { const e = pathEdges(part.paths.seam); let k = e.length - 1; while (k >= 0 && !e[k]) k--; return k; };

/**
 * The back panels' cutting outlines are their insideSeam / outsideSeam paths (their `seam`
 * is Bella's whole back, hidden): use those as the seam path. Idempotent.
 */
function useOutlines(parts) {
  for (const [nm, k] of [['noble.backInside', 'insideSeam'], ['noble.backOutside', 'outsideSeam']]) {
    const p = parts[nm];
    if (p && p.paths[k] && p.paths.seam !== p.paths[k]) p.paths.seam = p.paths[k];
  }
}

/*
 * Edges, in drawing order (found by the points they end at; the princess seams by order):
 *  front inside (fi, on the fold): princess seam (up from the waist to the shoulder or
 *    armhole), [armhole (armhole position)], shoulder seam (-> hps), neckline (-> cfNeck),
 *    centre front (fold), waist
 *  front outside (fo): waist, side seam (-> armhole), armhole, [shoulder seam (shoulder
 *    position)], princess seam (down)
 *  back inside (bi): centre back (-> waistCenter), waist, princess seam (up), [armhole],
 *    shoulder seam (-> hps), neckline (-> cbNeck)
 *  back outside (bo): waist, side seam (-> armhole), armhole, [shoulder seam], princess seam
 *    (down): its edges start on the back inside panel's outline (both are Bella's back)
 */
function edges(parts, v) {
  const fi = parts['noble.frontInside'], fo = parts['noble.frontOutside'], bi = parts['noble.backInside'], bo = parts['noble.backOutside'];
  const sh = v !== 'armhole';
  const Ei = edgesOf(fi, [sh ? 'shoulderDartInside' : 'armholeDartInside', 'hps', 'cfNeck']);
  const ti = sh ? Ei.shoulderDartInside : Ei.armholeDartInside;
  const Eo = edgesOf(fo, ['armhole', sh ? 'shoulderDartOutside' : 'armholeDartOutside']);
  const to = sh ? Eo.shoulderDartOutside : Eo.armholeDartOutside;
  const front = {
    in: { princess: range(0, ti), armhole: range(ti + 1, Ei.hps - 1), shoulder: [Ei.hps], neck: Ei.cfNeck, fold: Ei.cfNeck + 1 },
    out: { hem: range(0, Eo.armhole - 1), side: [Eo.armhole], armhole: range(Eo.armhole + 1, sh ? to - 1 : to), shoulder: sh ? [to] : [], princess: range(to + 1, lastEdge(fo)) },
  };
  const ie = opEnds(bi), oe = opEnds(bo);
  const onIn = (p) => ie.some(e => e && (near(e[0], p) || near(e[1], p)));
  const onOut = (p) => oe.some(e => e && (near(e[0], p) || near(e[1], p)));
  const Ebo = edgesOf(bo, ['armhole']), Ebi = edgesOf(bi, ['hps', 'cbNeck']);
  const bp = range(Ebo.armhole + 1, lastEdge(bo)).filter(k => oe[k] && onIn(oe[k][0]));
  const ip = range(1, Ebi.hps - 1).filter(k => ie[k] && onOut(ie[k][1]));
  const back = {
    in: { cb: 0, princess: ip, armhole: range(ip[ip.length - 1] + 1, Ebi.hps - 1), shoulder: [Ebi.hps], neck: Ebi.cbNeck },
    out: { side: [Ebo.armhole], armhole: range(Ebo.armhole + 1, bp[0] - (sh ? 2 : 1)), shoulder: sh ? [bp[0] - 1] : [], princess: bp },
  };
  return { front, back };
}

const variant = (draft) => draft.settings?.[0]?.options?.dartPosition || 'shoulder';

/*
 * Pieces: front (inside, on the fold), left/right_side_front (outside), left/right_back
 * (inside), left/right_side_back (outside). The front's local +x, the unmirrored side front
 * and the mirrored backs are the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  useOutlines(parts);
  const { front: F, back: B } = edges(parts, o.dartPosition || variant(draft));
  const seams = [{ a: [['left_back', B.in.cb]], b: [['right_back', B.in.cb]] }];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), sd = s > 0 ? 'left' : 'right';
    const sf = `${sd}_side_front`, bk = `${sd}_back`, sb = `${sd}_side_back`;
    const ch = (piece, ks, map = String, rev = false) => (rev ? ks.slice().reverse() : ks).map(k => [piece, map(k), rev]);
    seams.push(
      { a: ch('front', F.in.princess, f), b: ch(sf, F.out.princess, String, true) },                 // front princess seam (up)
      { a: ch(sf, F.out.side), b: ch(sb, B.out.side) },                                             // side seam
      { a: ch(bk, B.in.princess), b: ch(sb, B.out.princess, String, true) },                        // back princess seam (up)
      { a: [...ch(sf, F.out.shoulder), ...ch('front', F.in.shoulder, f)], b: [...ch(sb, B.out.shoulder), ...ch(bk, B.in.shoulder)] },   // shoulder (-> neck)
    );
  }
  const pair = (nm, part, mirrorLeft) => [{ name: `left_${nm}`, part, mirror: mirrorLeft, label: 'body' }, { name: `right_${nm}`, part, mirror: !mirrorLeft, label: 'body' }];
  return {
    pieces: [
      { name: 'front', part: 'noble.frontInside', fold: F.in.fold, label: 'body' },
      ...pair('side_front', 'noble.frontOutside', false),
      ...pair('back', 'noble.backInside', true),
      ...pair('side_back', 'noble.backOutside', true),
    ],
    seams,
    labels: {},
  };
}

/** A chain of edges as polylines in reverse (drawn the other way). */
const reversed = (polys) => polys.slice().reverse().map(p => p.slice().reverse());

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  useOutlines(parts);
  const fi = parts['noble.frontInside'], fo = parts['noble.frontOutside'], bi = parts['noble.backInside'], bo = parts['noble.backOutside'];
  const v = variant(draft), { front: Fe, back: Be } = edges(parts, v);
  const id = (x, y) => [x, y];
  const fof = slideFlat(reversed(polysOf(fo, Fe.out.princess)), polysOf(fi, Fe.in.princess));
  const bof = slideFlat(reversed(polysOf(bo, Be.out.princess)), polysOf(bi, Be.in.princess));
  const F = upperFrame(body, m);
  // the shoulder point: the outer end of the shoulder seam (on the outside panel, or the
  // inside one when the princess seam runs into the armhole)
  const startOf = (part, k) => pathEdges(part.paths.seam)[k][0];
  const fShoulder = Fe.out.shoulder.length ? fof(...startOf(fo, Fe.out.shoulder[0])) : startOf(fi, Fe.in.shoulder[0]);
  const bShoulder = Be.out.shoulder.length ? bof(...startOf(bo, Be.out.shoulder[0])) : startOf(bi, Be.in.shoulder[0]);
  const T = dartedTorso(F,
    { pieces: [{ part: fi, flat: id }, { part: fo, flat: fof }], hps: P(fi.points.hps), shoulder: fShoulder, armhole: fof(...P(fo.points.armhole)) },
    { pieces: [{ part: bi, flat: id }, { part: bo, flat: bof }], hps: P(bi.points.hps), shoulder: bShoulder, armhole: bof(...P(bo.points.armhole)) });
  const maps = { front: T.front(id), side_front: T.front(fof), back: T.back(id), side_back: T.back(bof) };
  return (ps) => maps[ps.name.replace(/^(left|right)_/, '')];
}

export const attachLevels = () => ({});
export const lift = 2;
