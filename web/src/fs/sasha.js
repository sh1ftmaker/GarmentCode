// FreeSewing "Sasha" skater dress (https://freesewing.eu/designs/sasha/, MIT, design by Anna
// Puk): a princess-seamed dress built on Noble, each bodice panel running on into a flared
// skirt panel (the flare added as godets along the princess seams), with set-in sleeves and
// optional in-seam pockets. Measurements from the mannequin, options as sliders, seam table
// and placement around the torso, the lower body and the arms for the drape.
import { fsMeasurements, pick } from './measure.js';
import { fsOptions, skirtSections, skirtMap } from './lower.js';
import { upperFrame, torsoMap, outlineSpan, sleeveMap } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';

export const id = 'sasha';
export const name = 'Sasha skater dress';
export const short = 'Skater dress';
export const exportName = 'Sasha';
export const url = 'https://freesewing.eu/designs/sasha/';
export const author = 'Anna Puk';
export const icon = 'M20 5l4 1c2 4 6 4 8 0l4-1 9 7 4 18-5 1-5-12 1 11 12 20c-10 5-34 5-44 0l12-20 1-11-5 12-5-1 4-18z';
export const stretchNote = 'The pockets are cut and sewn into the side seams but not simulated: the 3D drape uses the front side panel as FreeSewing drafts it without pockets (the same outline). The skirt flares from godets cut into the princess seams.';

export const design = {
  fit: {
    chestEase: { v: 11, range: [5, 20], type: 'float', fs: 'pct', name: 'Chest ease (%)', help: 'Controls the amount of ease at the chest.' },
    waistEase: { v: 5, range: [1, 20], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at the waist.' },
    bustSpanEase: { v: 0, range: [-5, 20], type: 'float', fs: 'pct', name: 'Bust span ease (%)', help: 'Controls the amount of ease along the bust span.' },
    cuffEase: { v: 20, range: [0, 200], type: 'float', fs: 'pct', name: 'Cuff ease (%)', help: 'The amount of ease around the wrist (or arm, for shorter sleeves).' },
  },
  style: {
    lengthBonus: { v: -10, range: [-100, 100], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Increase or decrease the skirt length with respect to knee length.' },
    skirtWidthBonus: { v: 50, range: [0, 100], type: 'float', fs: 'pct', name: 'Skirt width bonus (%)', help: 'Increase or decrease the additional skirt width with respect to hip circumference.' },
    necklineDepth: { v: 30, range: [10, 70], type: 'float', fs: 'pct', name: 'Neckline depth (%)', help: 'Control the depth of the neckline.' },
    necklineWidth: { v: 50, range: [10, 95], type: 'float', fs: 'pct', name: 'Neckline width (%)', help: 'Control the width of the neckline.' },
    necklineBend: { v: 30, range: [0, 150], type: 'float', fs: 'pct', name: 'Neckline bend (%)', help: 'Change the shape of the neckline from V-neck to rounded to boxy.' },
    sleeveLengthBonus: { v: 0, range: [-40, 10], type: 'float', fs: 'pct', name: 'Sleeve length bonus (%)', help: 'The amount to lengthen the sleeve. A negative value will shorten it.' },
    withPocket: { v: true, type: 'bool', fs: 'bool', name: 'With pocket', help: 'Splits the front outside part to add a pocket.' },
  },
};

// the drape uses the front side panel without the pocket split (same outline)
export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) o.withPocket = false;
  return o;
}

const MEASUREMENTS = ['highBust', 'chest', 'underbust', 'waist', 'waistBack', 'bustSpan', 'neck', 'hpsToBust', 'hpsToWaistFront',
  'hpsToWaistBack', 'shoulderToShoulder', 'shoulderSlope', 'hips', 'seat', 'crossSeam', 'crossSeamFront', 'waistToHips',
  'waistToSeat', 'waistToKnee', 'shoulderToWrist', 'wrist', 'biceps', 'waistToArmpit'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/**
 * Sasha draws its outlines as `insideSeam` / `outsideSeam` (the `seam` paths are Noble's,
 * hidden): make those the seam paths. The front inside's centre front is drawn in two
 * operations (neckline to waist, waist to hem); they are one fold line.
 */
function seamPaths(draft) {
  const parts = draft.parts[0];
  if (parts.__sashaSeams) return;
  const fi = parts['sasha.frontInside'];
  const ops = fi.paths.insideSeam.ops.filter(op => op.type !== 'close');
  let cur = null;
  const kept = [];
  for (const op of ops) {   // drop the centre front line above the waist (x = 0 to x = 0)
    if (op.type === 'line' && cur && Math.abs(cur.x) < 0.5 && Math.abs(op.to.x) < 0.5 && Math.abs(cur.y - op.to.y) > 1) { cur = op.to; continue; }
    kept.push(op);
    cur = op.to || cur;
  }
  fi.paths.seam = { ops: [...kept, { type: 'close' }] };
  parts['sasha.backInside'].paths.seam = parts['sasha.backInside'].paths.insideSeam;
  parts['sasha.backOutside'].paths.seam = parts['sasha.backOutside'].paths.outsideSeam;
  Object.defineProperty(parts, '__sashaSeams', { value: true, enumerable: false });
}

const pocketed = (draft) => {
  const a = draft.parts[0]['sasha.frontOutsideAbove'];
  return !!(a && !a.hidden && a.paths.seam && a.paths.seam.ops.length > 3);
};
const edgeLen = (part, k) => {
  const e = pathEdges(part.paths.seam)[k];
  let l = 0;
  for (let i = 1; i < e.length; i++) l += Math.hypot(e[i][0] - e[i - 1][0], e[i][1] - e[i - 1][1]);
  return l;
};

/*
 * Edges (seam path operations):
 *  front inside (cut on the fold, 10 = centre front): 0-1 hem (centre -> side), 2 skirt princess
 *    seam (up to the waist), 3-4 princess seam (waist -> bust -> armhole), 5-6 armhole (up),
 *    7-8 shoulder (armhole -> neck), 9 neckline (-> centre front)
 *  front outside (no pocket): 0-1 hem, 2-3 side seam (up), 4 armhole, 5-6 princess seam
 *    (armhole -> bust -> waist), 7 skirt princess seam (down to the hem)
 *  with a pocket, front outside above: 0-1 side (up), 2 armhole, 3-5 princess (down), 6 pocket
 *    opening edge, 7-9 the pocket bag's back, 10 side; below: 0-1 hem, 2 side (up), 3 pocket
 *    opening, 4 skirt princess (down); pocket bag: 0 opening edge, 1-3 bag, 4 side, 5 opening
 *  back inside: 0-1 hem, 2 skirt princess (up), 3-4 princess (-> armhole), 5 armhole (up),
 *    6 shoulder (-> neck), 7 neckline, 8-9 centre back (down)
 *  back outside: 0-1 hem, 2-3 side (up), 4 armhole, 5-6 princess (armhole -> waist), 7 skirt princess
 *  sleeve: 0 underarm (down), 1 wrist, 2 underarm (up), 3-7 cap (front -> back)
 * The front inside's own half (local +x), the unmirrored front outside and the mirrored backs
 * and the unmirrored sleeve are on the wearer's left.
 */
export function spec(o, draft) {
  seamPaths(draft);
  const parts = draft.parts[0], pk = pocketed(draft);
  const fiShoulder = edgeLen(parts['sasha.frontInside'], 7) + edgeLen(parts['sasha.frontInside'], 8);
  const biShoulder = edgeLen(parts['sasha.backInside'], 6);
  const sh = Math.min(1, fiShoulder / biShoulder);
  const seams = [];
  for (const s of ['l', 'r']) {
    const f = (k) => (s === 'l' ? String(k) : 'm' + k);
    const fo = `front_${s}`, bi = `back_inside_${s}`, bo = `back_${s}`, sl = `sleeve_${s}`;
    const fa = `front_above_${s}`, fb = `front_below_${s}`, pb = `pocket_bag_${s}`;
    const FO = pk
      ? { side: [[fb, 2], [fa, 0], [fa, 1]], arm: [[fa, 2]], princess: [[fa, 3], [fa, 4], [fa, 5], [fb, 4]] }
      : { side: [[fo, 2], [fo, 3]], arm: [[fo, 4]], princess: [[fo, 5], [fo, 6], [fo, 7]] };
    seams.push(
      { a: [['front_inside', f(4), true], ['front_inside', f(3), true], ['front_inside', f(2), true]], b: FO.princess },
      { a: FO.side, b: [[bo, 2], [bo, 3]] },
      { a: [[bi, 4, true], [bi, 3, true], [bi, 2, true]], b: [[bo, 5], [bo, 6], [bo, 7]] },
      // the front shoulder is shorter than the back one (Sasha widens the front neckline only):
      // sewn from the armhole, the rest of the back shoulder is part of the neckline
      { a: [['front_inside', f(7)], ['front_inside', f(8)]], b: [[bi, 6, false, 0, sh]] },
      { a: [...FO.arm, ['front_inside', f(5)], ['front_inside', f(6)], [bi, 5, true], [bo, 4, true]], b: [3, 4, 5, 6, 7].map(k => [sl, k]) },
      { a: [[sl, 0]], b: [[sl, 2, true]] },
    );
    if (pk) {
      seams.push(
        { a: [[pb, 5]], b: [[fb, 3]] },
        { a: [[pb, 0]], b: [[fa, 6]] },
        { a: [[pb, 1], [pb, 2], [pb, 3]], b: [[fa, 7], [fa, 8], [fa, 9]] },
      );
    }
  }
  seams.push({ a: [['back_inside_l', 8], ['back_inside_l', 9]], b: [['back_inside_r', 8], ['back_inside_r', 9]] });   // centre back
  const front = pk
    ? [
      { name: 'front_above_l', part: 'sasha.frontOutsideAbove', label: 'body' },
      { name: 'front_above_r', part: 'sasha.frontOutsideAbove', mirror: true, label: 'body' },
      { name: 'front_below_l', part: 'sasha.frontOutsideBelow', label: 'body' },
      { name: 'front_below_r', part: 'sasha.frontOutsideBelow', mirror: true, label: 'body' },
      { name: 'pocket_bag_l', part: 'sasha.pocket', cutOnly: true },
      { name: 'pocket_bag_r', part: 'sasha.pocket', mirror: true, cutOnly: true },
    ]
    : [
      { name: 'front_l', part: 'sasha.frontOutside', label: 'body' },
      { name: 'front_r', part: 'sasha.frontOutside', mirror: true, label: 'body' },
    ];
  return {
    pieces: [
      { name: 'front_inside', part: 'sasha.frontInside', fold: 10, label: 'body' },
      ...front,
      { name: 'back_inside_l', part: 'sasha.backInside', mirror: true, label: 'body' },
      { name: 'back_inside_r', part: 'sasha.backInside', label: 'body' },
      { name: 'back_l', part: 'sasha.backOutside', mirror: true, label: 'body' },
      { name: 'back_r', part: 'sasha.backOutside', label: 'body' },
      { name: 'sleeve_l', part: 'library.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'library.sleeve', mirror: true, label: 'arm', follow: 12 },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  seamPaths(draft);
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const FI = parts['sasha.frontInside'], FO = parts['sasha.frontOutside'], BI = parts['sasha.backInside'], BO = parts['sasha.backOutside'];
  const span = (part, opt) => outlineSpan(pieceLoop(part, opt));
  const sFI = span(FI, { fold: 10 }), sFO = span(FO), sBI = span(BI), sBO = span(BO);
  const at = (sp, y) => sp(Math.max(sp.y0, Math.min(sp.y1, y))) || [0, 0];
  const yWf = -FI.points.cfHem.y / 10, yWb = -BI.points.waistCenter.y / 10;   // waists (local y)
  // a panel's position around the body at local height y: distance from the centre front
  // (front panels) or centre back (back panels) of a local x
  const wFI = (y) => at(sFI, y)[1], wBI = (y) => { const r = at(sBI, y); return r[1] - r[0]; };
  const uOf = {
    front_inside: (x) => x,
    front: (x, y) => wFI(y) + x - at(sFO, y)[0],
    back_inside: (x, y) => x - at(sBI, y)[0],
    back: (x, y) => wBI(y) + x - at(sBO, y)[0],
  };
  const Wf = (y) => wFI(y) + (at(sFO, y)[1] - at(sFO, y)[0]);
  const Wb = (y) => wBI(y) + (at(sBO, y)[1] - at(sBO, y)[0]);
  // bodice: around the torso (front and back measured from their own waists)
  const dy = yWf - yWb;   // front local y = back local y + dy at the same height
  const girthT = (yf) => Wf(yf) + Wb(yf - dy);
  const armF = -FO.points.armhole?.y / 10, hf = [FI.points.hps.x / 10, -FI.points.hps.y / 10], hb = [BI.points.hps.x / 10, -BI.points.hps.y / 10];
  const armholeY = Number.isFinite(armF) ? armF : -24;
  const tFront = torsoMap(F, { side: 1, xSign: 1, hps: hf, girth: girthT, armholeY });
  const tBack = torsoMap(F, { side: -1, xSign: -1, hps: [hb[0], hb[1] + dy], girth: girthT, armholeY });
  // skirt: around the lower body below the waist, the girth of all panels at each height
  const girthS = (yf) => 2 * (Wf(yf) + Wb(yf - dy));
  const S = skirtMap(skirtSections(body, F.Ywaist + 10), { waistY: F.Ywaist, girth: (y) => girthS(y + yWf) });
  const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const sleeves = {};
  for (const mirror of [false, true]) {
    const loop = pieceLoop(parts['library.sleeve'], { mirror });
    sleeves[mirror] = sleeveMap(F, { sx: mirror ? -1 : 1, span: outlineSpan(loop), bicepsY: -parts['library.sleeve'].points.bicepsLeft.y / 10, frontSign: mirror ? -1 : 1, atCrease: true });
  }
  return (ps) => {
    if (ps.name.startsWith('sleeve')) return sleeves[!!ps.mirror];
    const base = ps.name.replace(/_[lr]$/, '');
    const front = base.startsWith('front');
    // which side of the body: the front inside by the sign of x, the others by name
    return (x, y) => {
      const xd = ps.mirror ? -x : x;   // x as drafted
      const left = base === 'front_inside' ? x >= 0 : ps.name.endsWith('_l');
      const u = Math.max(0, uOf[base](base === 'front_inside' ? Math.abs(x) : xd, y));
      const yf = front ? y : y + dy;   // height as the front's local y
      const sgn = left ? 1 : -1;
      const top = front ? tFront(sgn * u, y) : tBack(-sgn * u, yf);
      const yy = yf - yWf;   // below the waist < 0
      const G = girthS(yf);
      const skirt = front ? S(sgn * u, yy) : S(G / 2 - sgn * u, yy);
      const w = sm((-yy + 2) / 8);
      return [top[0] * (1 - w) + skirt[0] * w, top[1] * (1 - w) + skirt[1] * w, top[2] * (1 - w) + skirt[2] * w];
    };
  };
}

export const attachLevels = () => ({});
export const lift = 2;
