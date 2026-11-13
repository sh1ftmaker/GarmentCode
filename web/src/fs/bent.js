// FreeSewing "Bent" body block (https://freesewing.eu/designs/bent/, MIT, design by Joost
// De Cock): Brian's front and back with a two-part sleeve (top sleeve and under sleeve),
// the block FreeSewing's jackets and coats start from. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso and arms for the drape.
import { upperFrame } from './place.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';
import { blockEdges, blockTorso } from './brian.js';
import { edgeEndingAt, sleeveEdges, sleeveSeams, sleeveMaps } from './twopart.js';

export const id = 'bent';
export const name = 'Bent body block';
export const short = 'Body block';
export const exportName = 'Bent';
export const url = 'https://freesewing.eu/designs/bent/';
export const author = 'Joost De Cock';
export const icon = 'M18 7l6-2c2 3 6 3 8 0l6 2 8 9 6 31-5 2-6-14 1-7-3-4v31H20V24l-3 4 1 7-6 14-5-2 6-31z';
export const stretchNote = 'Bent is a block: the starting point other designs are drafted from, without hems or closures. The 3D drape sews it up as drafted (front and back cut on the fold, two-part sleeves set in).';

export const design = {
  fit: {
    chestEase: { v: 8, range: [-4, 20], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    bicepsEase: { v: 20, range: [10, 40], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    cuffEase: { v: 40, range: [2, 100], type: 'float', name: 'Cuff ease (%)', help: 'The amount of ease at your wrist.' },
    collarEase: { v: 3.5, range: [0, 10], type: 'float', name: 'Collar ease (%)', help: 'The amount of ease around your neck.' },
    shoulderEase: { v: 0, range: [-2, 6], type: 'float', name: 'Shoulder ease (%)', help: 'Increases the shoulder to shoulder distance.' },
    sleeveBend: { v: 10, range: [0, 20], type: 'float', name: 'Sleeve bend (°)', help: 'How far the sleeve bends forward at the elbow.' },
  },
  style: {
    lengthBonus: { v: 0, range: [-4, 60], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body. A negative value shortens it.' },
    sleeveLengthBonus: { v: 0, range: [-20, 15], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves. A negative value shortens them.' },
  },
};

export const options = (d) => treeOptions(d, new Set(['sleeveBend']));
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'shoulderToElbow', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/** As brian.js: 1 when a length bonus splits the back's centre line in two. */
function backSplit(back) {
  const ops = back.paths.seam.ops.filter(o => o.type !== 'move');
  return ops[1].type === 'line' && Math.abs(ops[1].to.x) < 0.5 ? 1 : 0;
}

/**
 * The armhole of a Brian-family front or back (blockEdges) split at its pitch point:
 * { below: edges side -> pitch, above: edges pitch -> shoulder }.
 */
export function armholeAtPitch(part, armhole) {
  const j = edgeEndingAt(part, part.points.armholePitch);
  const k = armhole.indexOf(j);
  if (k < 0) {   // no edge ends at the pitch point: split the armhole in the middle
    const h = Math.ceil(armhole.length / 2);
    return { below: armhole.slice(0, h), above: armhole.slice(h) };
  }
  return { below: armhole.slice(0, k + 1), above: armhole.slice(k + 1) };
}

/**
 * The armhole chains of one side (see twopart.js sleeveSeams): f / b name the front / back
 * edge on that side (e.g. k / 'm' + k), Af / Ab the armholes split at the pitch points.
 */
export function armholeChains(front, back, f, b, Af, Ab) {
  const fw = (piece, ids, n) => ids.map(k => [piece, n(k)]);
  const rv = (piece, ids, n) => ids.slice().reverse().map(k => [piece, n(k), true]);
  return {
    upper: [...fw(back, Ab.above, b), ...rv(front, Af.above, f)],
    lower: [...rv(front, Af.below, f), ...fw(back, Ab.below, b)],
  };
}

/*
 * Edges: front/back (Brian's, cut on the fold, 0 = centre): 1 hem (centre -> side), 2 side
 *   seam (up) (the back with a length bonus: 1 the rest of the centre line, every later edge
 *   one up), then (blockEdges) the armhole (side -> shoulder; 3-5), the shoulder seam (6) and
 *   the neckline (7).
 * top / under sleeve: see twopart.js.
 * The front's local +x and the back's mirrored half are the wearer's left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], front = parts['brian.front'], back = parts['brian.back'], k = backSplit(back);
  const Ef = blockEdges(front, 3), Eb = blockEdges(back, 3 + k);
  const Af = armholeAtPitch(front, Ef.armhole), Ab = armholeAtPitch(back, Eb.armhole);
  const E = sleeveEdges(parts['library.topsleeve'], parts['library.undersleeve']);
  const seams = k ? [{ a: [['back', 1]], b: [['back', 'm1']] }] : [];
  for (const s of [1, -1]) {
    const f = (i) => (s > 0 ? String(i) : 'm' + i), b = (i) => (s > 0 ? 'm' + i : String(i)), L = s > 0 ? 'l' : 'r';
    seams.push(
      { a: [['front', f(2)]], b: [['back', b(2 + k)]] },                       // side seam
      { a: [['front', f(Ef.shoulder)]], b: [['back', b(Eb.shoulder)]] },       // shoulder seam
      ...sleeveSeams(E, 'top_sleeve_' + L, 'under_sleeve_' + L, armholeChains('front', 'back', f, b, Af, Ab)),
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'brian.front', fold: 0, label: 'body' },
      { name: 'back', part: 'brian.back', fold: 0, label: 'body' },
      { name: 'top_sleeve_l', part: 'library.topsleeve', label: 'arm', follow: 12 },
      { name: 'under_sleeve_l', part: 'library.undersleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'top_sleeve_r', part: 'library.topsleeve', mirror: true, label: 'arm', follow: 12 },
      { name: 'under_sleeve_r', part: 'library.undersleeve', label: 'arm', follow: 12 },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], front = parts['brian.front'], back = parts['brian.back'];
  const ts = parts['library.topsleeve'], us = parts['library.undersleeve'];
  const F = upperFrame(body, m);
  const T = blockTorso(F, front, back, blockEdges(front, 3), blockEdges(back, 3 + backSplit(back)), { fold: [0, 0] });
  const S = sleeveMaps(F, ts, us, sleeveEdges(ts, us));
  return (ps) => {
    if (ps.name === 'front') return T.front;
    if (ps.name === 'back') return T.back;
    return S(ps.name.startsWith('top') ? 'top' : 'under', ps.mirror);
  };
}

export const attachLevels = () => ({});
export const lift = 2;
