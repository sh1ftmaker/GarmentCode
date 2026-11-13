// FreeSewing "Brian" body block (https://freesewing.eu/designs/brian/, MIT, design by Joost
// De Cock): the block Hugo, Sven, Teagan and the other tops start from, a close-fitting
// front, back and set-in sleeve. Measurements from the mannequin, options as sliders, seam
// table and placement around the torso and arms for the drape.
import { upperFrame, torsoMap, outlineSpan } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';
import { brianMeasurements, brianSleeves, treeOptions, pick } from './tops.js';

export const id = 'brian';
export const name = 'Brian body block';
export const short = 'Body block';
export const exportName = 'Brian';
export const url = 'https://freesewing.eu/designs/brian/';
export const author = 'Joost De Cock';
export const icon = 'M18 7l6-2c2 3 6 3 8 0l6 2 9 9 5 32-5 1-7-27v29H20V22l-7 27-5-1 5-32z';
export const stretchNote = 'Brian is a block: the starting point other designs are drafted from, without hems or closures. The 3D drape sews it up as drafted (front and back cut on the fold, set-in sleeves).';

export const design = {
  fit: {
    chestEase: { v: 15, range: [-4, 35], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    bicepsEase: { v: 15, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    cuffEase: { v: 20, range: [0, 200], type: 'float', name: 'Cuff ease (%)', help: 'The amount of ease at your wrist.' },
    collarEase: { v: 5, range: [0, 10], type: 'float', name: 'Collar ease (%)', help: 'The amount of ease around your neck.' },
    shoulderEase: { v: 0, range: [-2, 6], type: 'float', name: 'Shoulder ease (%)', help: 'Increases the shoulder to shoulder distance.' },
  },
  style: {
    lengthBonus: { v: 0, range: [-4, 60], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body. A negative value shortens it.' },
    sleeveLengthBonus: { v: 0, range: [-40, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves. A negative value shortens them.' },
    s3Collar: { v: 0, range: [-100, 100], type: 'float', name: 'Shoulder seam shift: collar side (%)', help: 'Shifts the shoulder seam forward (or back) at the collar.' },
    s3Armhole: { v: 0, range: [-100, 100], type: 'float', name: 'Shoulder seam shift: armhole side (%)', help: 'Shifts the shoulder seam forward (or back) at the armhole.' },
  },
};

export const options = (d) => treeOptions(d);
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

/**
 * Armhole, shoulder seam and neckline edges of a Brian-family front or back, starting at the
 * armhole's first edge. The shoulder seam shift options (s3Collar, s3Armhole) move the seam
 * and can split the armhole or the neckline in two, so the edges are found by shape: the
 * armhole curves up to the straight shoulder seam, then the neckline curves.
 */
export function blockEdges(part, first) {
  const ops = part.paths.seam.ops.filter(o => o.type !== 'move');
  let i = first;
  const armhole = [], neck = [];
  while (i < ops.length && ops[i].type === 'curve') armhole.push(i++);
  if (i >= ops.length || ops[i].type !== 'line') throw new Error(`${part.name}: no shoulder seam after the armhole`);
  const shoulder = i++;
  while (i < ops.length && ops[i].type === 'curve') neck.push(i++);
  return { armhole, shoulder, neck };
}

/**
 * Torso maps for a Brian-family front and back with set-in sleeves (as tops.js brianTorso),
 * whose shoulder seams can sit at different edge numbers (Ef, Eb: blockEdges): each piece's
 * own shoulder seam gives its high shoulder point and slope. fold: the pieces' fold edges
 * (null: not cut on the fold); girth(y) defaults to the two pieces' outline widths.
 */
export function blockTorso(F, front, back, Ef, Eb, { fold = [null, null], girth = null, gap = 1.5 } = {}) {
  const P = (pt) => [pt.x / 10, -pt.y / 10];
  const sf = outlineSpan(pieceLoop(front, { fold: fold[0] })), sb = outlineSpan(pieceLoop(back, { fold: fold[1] }));
  const side = (s, y) => { const r = s(Math.max(s.y0, Math.min(s.y1, y))); return r ? r[1] : 0; };
  girth ||= (y) => side(sf, y) + side(sb, y);
  const armholeY = Math.min(P(front.points.armhole)[1], P(back.points.armhole)[1]);
  const line = (part, E) => {
    const e = pathEdges(part.paths.seam)[E.shoulder], a = e[0], b = e[e.length - 1];
    const [n, s] = a[0] < b[0] ? [a, b] : [b, a];
    return { hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])), shoulderX: s[0], armholeX: P(part.points.armhole)[0] };
  };
  return {
    armholeY, girth, side: (y) => side(sf, y), lo: (y) => { const r = sf(Math.max(sf.y0, Math.min(sf.y1, y))); return r ? r[0] : 0; },
    front: torsoMap(F, { side: 1, xSign: 1, ...line(front, Ef), girth, armholeY, gap }),
    back: torsoMap(F, { side: -1, xSign: -1, ...line(back, Eb), girth, armholeY, gap }),
  };
}

/*
 * Edges: front/back (cut on the fold, 0 = centre): 1 hem (centre -> side), 2 side seam (up)
 *   (the back with a length bonus: 1 the rest of the centre line, every later edge one up),
 *   then (blockEdges) the armhole (side -> shoulder; 3-5 by default), the shoulder seam
 *   (shoulder -> neck; 6) and the neckline (-> centre; 7)
 * sleeve: 0 front underarm (down), 1 wrist (front -> back), 2 back underarm (up), 3-7 cap (back -> front)
 * The front's local +x, the back's mirrored half and the unmirrored sleeve are the wearer's left.
 */
/**
 * With a length bonus, Brian draws the back's centre line in two pieces (neck -> waist, waist
 * -> hem): the fold is the first, and the second (lying on the fold) is sewn to its own mirror
 * image. Returns how many edges the back's outline has more than the front's (0 or 1).
 */
function backSplit(back) {
  const ops = back.paths.seam.ops.filter(o => o.type !== 'move');
  return ops[1].type === 'line' && Math.abs(ops[1].to.x) < 0.5 ? 1 : 0;
}

export function spec(o, draft) {
  const parts = draft.parts[0], k = backSplit(parts['brian.back']);
  const Ef = blockEdges(parts['brian.front'], 3), Eb = blockEdges(parts['brian.back'], 3 + k);
  const seams = k ? [{ a: [['back', 1]], b: [['back', 'm1']] }] : [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), b = (k) => (s > 0 ? 'm' + k : String(k)), sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    seams.push(
      { a: [['front', f(2)]], b: [['back', b(2 + k)]] },                                   // side seam
      { a: [['front', f(Ef.shoulder)]], b: [['back', b(Eb.shoulder)]] },                   // shoulder seam
      { a: [...Eb.armhole.map(k => ['back', b(k)]), ...Ef.armhole.slice().reverse().map(k => ['front', f(k), true])],
        b: [[sl, 3], [sl, 4], [sl, 5], [sl, 6], [sl, 7]] },                                // armhole (back side -> front side)
      { a: [[sl, 2, true]], b: [[sl, 0]] },                                                // underarm seam
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'brian.front', fold: 0, label: 'body' },
      { name: 'back', part: 'brian.back', fold: 0, label: 'body' },
      { name: 'sleeve_l', part: 'library.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'library.sleeve', mirror: true, label: 'arm', follow: 12 },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], front = parts['brian.front'], back = parts['brian.back'];
  const F = upperFrame(body, m);
  const T = blockTorso(F, front, back, blockEdges(front, 3), blockEdges(back, 3 + backSplit(back)), { fold: [0, 0] });
  const sleeves = brianSleeves(F, parts['library.sleeve'], { atCrease: true });
  return (ps) => {
    if (ps.name === 'front') return T.front;
    if (ps.name === 'back') return T.back;
    return sleeves[!!ps.mirror].map;
  };
}

export const attachLevels = () => ({});
// start just above the placement: lifted further, the armholes would rise above the arms
export const lift = 2;
