// FreeSewing "Shelly" swim shirt (https://freesewing.eu/designs/shelly/, MIT, design by
// Thrunic): a raglan shirt for stretch fabric with a folded neckband. Measurements from
// the mannequin, options as sliders, seam table and placement around the torso and arms
// for the drape.
//
// Shelly drafts its own block (not Brian): the pattern's origin is the "raglan centre"
// at the height of the high point of the shoulder, the neckline a circle below it and the
// raglan seams run from that circle to the armpits. The torso placement uses place.js's
// torsoMap with that origin as the shoulder line; the sleeves start as tubes around the
// arms and are snapped onto the raglan seams (follow), as Hugo's.
import { upperFrame, torsoMap, outlineSpan, sleeveMap, bandRingMap } from './place.js';
import { pieceLoop } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'shelly';
export const name = 'Shelly swim shirt';
export const short = 'Swim shirt';
export const exportName = 'Shelly';
export const url = 'https://freesewing.eu/designs/shelly/';
export const author = 'Thrunic';
export const icon = 'M22 6c2 3 10 3 12 0l7 3 11 13-6 6-6-6v29H16V22l-6 6-6-6L15 9z';
export const stretchNote = 'Shelly is meant for stretch fabric, and its neckband is cut shorter than the neckline and stretched to fit. The 3D drape uses a relaxed copy (an unstretched neckband); the pattern view, cutting layout and exports use the real pattern.';

export const design = {
  fit: {
    chestEase: { v: 0, range: [-40, 50], type: 'float', name: 'Chest ease (%)', help: 'Room around the chest (negative for a snug fit in stretch fabric).' },
    armpitEase: { v: 15, range: [-20, 50], type: 'float', name: 'Armpit ease (%)', help: 'Lowers the armpits.' },
    sleeveEase: { v: 0, range: [-30, 50], type: 'float', name: 'Sleeve ease (%)', help: 'Room in the sleeves.' },
    wristEase: { v: 0, range: [-30, 50], type: 'float', name: 'Wrist ease (%)', help: 'Room at the sleeve hem (long sleeves).' },
    neckEase: { v: 50, range: [-30, 150], type: 'float', name: 'Neck ease (%)', help: 'Widens the neck opening.' },
    neckbandLength: { v: 80, range: [50, 100], type: 'float', name: 'Neckband length (%)', help: 'Length of the neckband, as a share of the neckline it is stretched along.' },
    neckbandWidth: { v: 7.5, range: [0, 50], type: 'float', name: 'Neckband width (%)', help: 'Width of the finished neckband.' },
  },
  style: {
    bodyLength: { v: 120, range: [20, 300], type: 'float', name: 'Body length (%)', help: 'Length of the body, from the shoulder to the waist and hips.' },
    sleeveLength: { v: 20, range: [0, 125], type: 'float', name: 'Sleeve length (%)', help: 'Length of the sleeves (100% reaches the wrist).' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d);
  if (relaxed) o.neckbandLength = 1;
  return o;
}
const MEASUREMENTS = ['biceps', 'neck', 'chest', 'hips', 'waistToHips', 'hpsToWaistBack', 'waistToArmpit', 'wrist', 'shoulderToWrist', 'highBust'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges (seam path operations):
 *  front / back (cut on the fold, 4 = centre): 0 side seam (hem -> armpit), 1 armpit scoop,
 *    2 raglan (-> neck), 3 neckline (raglan -> centre), 5 hem (centre -> side)
 *  raglanSleeve (local -x = front): 0 back underarm (up), 1 back scoop, 2 back raglan (-> neck),
 *    3 neck (back -> front), 4 front raglan (down), 5 front scoop, 6 front underarm (down), 7 hem
 *  neckband (cut on the fold, 3 = the fold at the centre front; folded lengthwise, the drape
 *    uses one layer): 2 / m2 the long edge sewn on (end -> centre), 1 / m1 the ends, sewn together
 * The front's local +x, the back's mirrored half ('m'), the unmirrored sleeve and the
 * neckband's local +x are the wearer's left.
 */
export function spec() {
  const seams = [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), b = (k) => (s > 0 ? 'm' + k : String(k));
    const sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    seams.push(
      { a: [['front', f(0)]], b: [['back', b(0)]] },                                         // side seam
      { a: [['front', f(1)], ['front', f(2)]], b: [[sl, 5, true], [sl, 4, true]] },             // front raglan
      { a: [['back', b(1)], ['back', b(2)]], b: [[sl, 1], [sl, 2]] },                           // back raglan
      { a: [[sl, 0]], b: [[sl, 6, true]] },                                                    // underarm
      // neckline (centre back -> centre front) to the neckband (end -> centre)
      { a: [['back', b(3), true], [sl, 3], ['front', f(3)]], b: [['neckband', s > 0 ? '2' : 'm2']] },
    );
  }
  seams.push({ a: [['neckband', 1]], b: [['neckband', 'm1']] });
  return {
    pieces: [
      { name: 'front', part: 'shelly.front', fold: 4, label: 'body' },
      { name: 'back', part: 'shelly.back', fold: 4, label: 'body' },
      { name: 'sleeve_l', part: 'shelly.raglanSleeve', label: 'arm', follow: 14 },
      { name: 'sleeve_r', part: 'shelly.raglanSleeve', mirror: true, label: 'arm', follow: 14 },
      { name: 'neckband', part: 'shelly.neckband', fold: 3, doubled: 'y', label: 'body', follow: 50 },
    ],
    seams,
    labels: {},
  };
}

/**
 * Torso maps for Shelly's front and back (both cut on the fold at x = 0, pattern origin at
 * shoulder height): the shoulder line runs out from where the neck circle crosses the
 * origin's height, with the body's shoulder slope.
 */
function raglanTorso(F, front, back, slopeDeg, gap = 1.5) {
  const sf = outlineSpan(pieceLoop(front, { fold: 4 })), sb = outlineSpan(pieceLoop(back, { fold: 4 }));
  const half = (s, y) => { const r = s(y); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  const girth = (y) => half(sf, y) + half(sb, y);
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const armholeY = Math.min(P(front.points.armpitCornerScooped)[1], P(back.points.armpitCornerScooped)[1]);
  const slope = Math.tan(slopeDeg * Math.PI / 180);
  // the neck circle (the front's: the back's neckline is shallower, the circle the same)
  const c = P(front.points.neckCenter), r = c[1] - P(front.points.cfNeck)[1];
  const hx = Math.sqrt(Math.max(1, r * r - c[1] * c[1]));
  // as for set-in sleeves (place.js torsoMap), the armpits start below the arm's crease, the
  // drop fading out up the raglan seam towards the neck
  const line = (part) => ({ hps: [hx, 0], slope, shoulderX: hx, armholeX: P(part.points.armpitCornerScooped)[0] });
  return {
    armholeY,
    front: torsoMap(F, { side: 1, xSign: 1, ...line(front), girth, armholeY, gap }),
    back: torsoMap(F, { side: -1, xSign: -1, ...line(back), girth, armholeY, gap }),
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const front = parts['shelly.front'], back = parts['shelly.back'], sleeve = parts['shelly.raglanSleeve'];
  const T = raglanTorso(F, front, back, fsMeasurements(m, body).shoulderSlope);
  // sleeves: tubes around the arms from the armpit down, the raglan part continuing up the arm
  const bicepsY = -Math.max(sleeve.points.frontArmhole.y, sleeve.points.backArmhole.y) / 10;
  const sleeves = {};
  for (const mirror of [false, true]) {
    const loop = pieceLoop(sleeve, { mirror });
    sleeves[mirror] = sleeveMap(F, { sx: mirror ? -1 : 1, span: outlineSpan(loop), bicepsY, frontSign: mirror ? 1 : -1, atCrease: true });
  }
  // the neckband: a ring around the neck at the neckline's height, standing up from it
  // (then snapped onto the neckline)
  const nf = T.front(0, -front.points.cfNeck.y / 10), nb = T.back(0, -back.points.cfNeck.y / 10);
  const len = 2 * parts['shelly.neckband'].points.topRightCorner.x / 10;
  const ring = bandRingMap(F, { Y: 0.5 * (nf[1] + nb[1]), len, phi0: 0, dir: 1, gap: 1.5 });
  return (ps) => {
    if (ps.name === 'front') return T.front;
    if (ps.name === 'back') return T.back;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror];
    if (ps.name === 'neckband') return (x, y) => ring(x, y);
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
