// FreeSewing "Bella" body block (https://freesewing.eu/designs/bella/, MIT, design by Joost
// De Cock): the close-fitting womenswear block Bee, Noble and others are drafted from, with
// a side bust dart and a waist dart in the front, a waist dart and a centre back seam in the
// back, and an optional set-in sleeve. Measurements from the mannequin, options as sliders,
// seam table and placement around the torso and arms for the drape.
//
// Bella is not built on Brian: its front is drafted around the bust point. The torso
// placement (bodice.js dartedTorso) lays front and back around the torso as if their darts
// were already sewn; the sleeves start as tubes around the arms and are snapped onto the
// armholes (follow), as Brian's.
import { upperFrame, outlineSpan, sleeveMap } from './place.js';
import { pieceLoop } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';
import { edgesOf, sewnFlat, dartedTorso, polysOf, range, P } from './bodice.js';

export const id = 'bella';
export const name = 'Bella body block';
export const short = 'Body block';
export const exportName = 'Bella';
export const url = 'https://freesewing.eu/designs/bella/';
export const author = 'Joost De Cock';
export const icon = 'M19 6l5-1c2 4 6 4 8 0l5 1 9 9 5 31-5 1-6-24c-2 4-2 8 0 12l1 15H20l1-15c2-4 2-8 0-12l-6 24-5-1 5-31z';
export const stretchNote = 'Bella is a block: the starting point other designs are drafted from, without hems or closures. The 3D drape sews it up as drafted: darts closed, back in two halves with a centre back seam, front cut on the fold, set-in sleeves.';

export const design = {
  fit: {
    chestEase: { v: 11, range: [5, 20], type: 'float', name: 'Chest ease (%)', help: 'Controls the amount of ease at the fullest part of your chest.' },
    fullChestEaseReduction: { v: 4, range: [0, 8], type: 'float', name: 'Full chest ease reduction (%)', help: 'Reduces the ease around the full chest independently, for a tighter fit there.' },
    waistEase: { v: 5, range: [1, 20], type: 'float', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    bustSpanEase: { v: 10, range: [0, 20], type: 'float', name: 'Bust span ease (%)', help: 'Controls the amount of (horizontal) ease added to your bust span when locating the bust point.' },
    shoulderToShoulderEase: { v: -0.5, range: [-1, 5], type: 'float', name: 'Shoulder to shoulder ease (%)', help: 'Controls the amount of ease between your shoulders.' },
    bicepsEase: { v: 15, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    cuffEase: { v: 20, range: [0, 200], type: 'float', name: 'Cuff ease (%)', help: 'The amount of ease at your wrist.' },
  },
  style: {
    bellaSleeve: { v: true, type: 'bool', name: 'Sleeve', help: 'Add sleeves to the garment.' },
    sleeveLengthBonus: { v: 0, range: [-40, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves. A negative value shortens them.' },
    armholeDepth: { v: 44, range: [38, 46], type: 'float', name: 'Armhole depth (%)', help: 'Controls the depth of the armhole.' },
    bustDartLength: { v: 90, range: [75, 100], type: 'float', name: 'Bust dart length (%)', help: 'Controls the length of the bust dart.' },
    waistDartLength: { v: 90, range: [75, 95], type: 'float', name: 'Waist dart length (%)', help: 'Controls the length of the waist dart.' },
    backDartHeight: { v: 46, range: [38, 54], type: 'float', name: 'Back dart height (%)', help: 'Controls the height of the back dart.' },
  },
};

export const options = (d) => treeOptions(d);
const MEASUREMENTS = ['highBust', 'chest', 'underbust', 'waist', 'waistBack', 'bustSpan', 'neck', 'hpsToBust', 'hpsToWaistFront',
  'hpsToWaistBack', 'shoulderToShoulder', 'shoulderSlope', 'biceps', 'shoulderToWrist', 'waistToArmpit', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/**
 * Edges of a Bella-family front and back, by the points they end at (bodice.js edgesOf).
 * The waist darts disappear when the waist is as wide as the chest, and the side seam
 * below the bust dart does not always end at a named point, so the rest is found by order.
 * front (cut on the fold at the centre front): waist (with the waist dart wd, if any),
 *   side seam (sideLow: one edge up to the bust dart), bust dart (bd: [lower leg -> tip,
 *   tip -> upper leg]), side seam (sideHigh: -> armhole), armhole (-> armholePitch -> shoulder),
 *   shoulder seam (-> hps), neckline (-> cfNeck), centre front (fold)
 * back (cut twice): centre back seam (cb: -> waistCenter), waist (with the waist dart wd:
 *   [-> dartTip, -> dartBottomRight], if any), side seam (-> armhole), armhole, shoulder, neckline
 * Edge lists run in drawing order.
 */
export function frontEdges(part) {
  const E = edgesOf(part, ['waistDartTip', 'bustDartTip', 'armhole', 'armholePitch', 'shoulder', 'hps', 'cfNeck'], ['waistDartTip']);
  return {
    wd: E.waistDartTip != null ? [E.waistDartTip, E.waistDartTip + 1] : null,
    sideLow: [E.bustDartTip - 1], bd: [E.bustDartTip, E.bustDartTip + 1], sideHigh: range(E.bustDartTip + 2, E.armhole),
    armhole: range(E.armhole + 1, E.shoulder), shoulder: E.hps, neck: E.cfNeck, fold: E.cfNeck + 1,
  };
}
export function backEdges(part) {
  const E = edgesOf(part, ['waistCenter', 'dartTip', 'armhole', 'shoulder', 'hps', 'cbNeck'], ['dartTip']);
  return {
    cb: E.waistCenter, wd: E.dartTip != null ? [E.dartTip, E.dartTip + 1] : null,
    side: [E.armhole], armhole: range(E.armhole + 1, E.shoulder), shoulder: E.hps, neck: E.cbNeck,
  };
}

/*
 * Seams of a Bella-family bodice: pieces `front` (on the fold) and left_back / right_back,
 * sleeves sleeve_l / sleeve_r (bella.sleeve, local +x = front: 0 back underarm (down),
 * 1 wrist, 2 front underarm (up), 3-7 cap (front -> back)).
 * The front's local +x, the mirrored back (left_back) and the unmirrored sleeve are the
 * wearer's left.
 */
export function bodiceSeams(parts, { front = 'front', fpart, bpart, sleeves = false }) {
  const Ef = frontEdges(parts[fpart]), Eb = backEdges(parts[bpart]);
  const seams = [
    { a: [['left_back', Eb.cb]], b: [['right_back', Eb.cb]] },                                       // centre back
  ];
  if (Eb.wd) for (const bk of ['left_back', 'right_back']) seams.push({ a: [[bk, Eb.wd[0]]], b: [[bk, Eb.wd[1], true]] });
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), bk = s > 0 ? 'left_back' : 'right_back';
    const fe = (ks, rev = false) => (rev ? ks.slice().reverse() : ks).map(k => [front, f(k), rev]);
    const be = (ks, rev = false) => (rev ? ks.slice().reverse() : ks).map(k => [bk, k, rev]);
    if (Ef.wd) seams.push({ a: [[front, f(Ef.wd[0])]], b: [[front, f(Ef.wd[1]), true]] });         // waist dart
    seams.push(
      { a: [[front, f(Ef.bd[0])]], b: [[front, f(Ef.bd[1]), true]] },                               // bust dart
      { a: fe([...Ef.sideLow, ...Ef.sideHigh]), b: be(Eb.side) },                                    // side seam
      { a: [[front, f(Ef.shoulder)]], b: [[bk, Eb.shoulder]] },                                     // shoulder seam
    );
    if (sleeves) {
      const sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
      seams.push(
        { a: [...fe(Ef.armhole), ...be(Eb.armhole, true)], b: [3, 4, 5, 6, 7].map(k => [sl, k]) },   // armhole (front -> back)
        { a: [[sl, 0]], b: [[sl, 2, true]] },                                                       // underarm seam
      );
    }
  }
  return { seams, Ef, Eb };
}

export function spec(o, draft) {
  const parts = draft.parts[0], sleeve = !!parts['bella.sleeve'] && o.bellaSleeve !== false;
  const { seams } = bodiceSeams(parts, { fpart: 'bella.frontSideDart', bpart: 'bella.back', sleeves: sleeve });
  return {
    pieces: [
      { name: 'front', part: 'bella.frontSideDart', fold: frontEdges(parts['bella.frontSideDart']).fold, label: 'body' },
      { name: 'left_back', part: 'bella.back', mirror: true, label: 'body' },
      { name: 'right_back', part: 'bella.back', label: 'body' },
      ...(sleeve ? [
        { name: 'sleeve_l', part: 'bella.sleeve', label: 'arm', follow: 12 },
        { name: 'sleeve_r', part: 'bella.sleeve', mirror: true, label: 'arm', follow: 12 },
      ] : []),
    ],
    seams,
    labels: {},
  };
}

/** Sewn-flat transforms (bodice.js sewnFlat) of a Bella-family front and back. */
export function bodiceFlats(fp, bp) {
  const Ef = frontEdges(fp), Eb = backEdges(bp);
  const front = sewnFlat({
    vdarts: Ef.wd ? [[polysOf(fp, [Ef.wd[0]]), polysOf(fp, [Ef.wd[1]])]] : [],
    hdarts: [{ lower: polysOf(fp, [Ef.bd[0]]), upper: polysOf(fp, [Ef.bd[1]]), apex: P(fp.points.bustDartTip), top: P(fp.points.shoulder)[1] }],
  });
  const back = sewnFlat({ vdarts: Eb.wd ? [[polysOf(bp, [Eb.wd[0]]), polysOf(bp, [Eb.wd[1]])]] : [] });
  return { front, back };
}

export function bodiceTorso(F, fp, bp) {
  const fl = bodiceFlats(fp, bp);
  const side = (part, flat) => ({ pieces: [{ part, flat }], ...Object.fromEntries(['hps', 'shoulder', 'armhole'].map(k => [k, flat(...P(part.points[k]))])) });
  const T = dartedTorso(F, side(fp, fl.front), side(bp, fl.back));
  return { front: T.front(fl.front), back: T.back(fl.back) };
}

/** Sleeve maps (left = unmirrored, right = mirrored) for Bella's sleeve (local +x = front). */
export function bellaSleeves(F, part) {
  const out = {};
  const bicepsY = -part.points.bicepsLeft.y / 10;
  for (const mirror of [false, true]) {
    const loop = pieceLoop(part, { mirror });
    out[mirror] = sleeveMap(F, { sx: mirror ? -1 : 1, span: outlineSpan(loop), bicepsY, frontSign: mirror ? -1 : 1, atCrease: true });
  }
  return out;
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = bodiceTorso(F, parts['bella.frontSideDart'], parts['bella.back']);
  const sleeves = parts['bella.sleeve'] ? bellaSleeves(F, parts['bella.sleeve']) : null;
  return (ps) => {
    if (ps.name === 'front') return T.front;
    if (/_back$/.test(ps.name)) return T.back;
    return sleeves && sleeves[!!ps.mirror];
  };
}

export const attachLevels = () => ({});
export const lift = 2;
