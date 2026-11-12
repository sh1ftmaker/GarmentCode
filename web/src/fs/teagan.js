// FreeSewing "Teagan" T-shirt (https://freesewing.eu/designs/teagan/, MIT, design by
// Joost De Cock): a fitted tee with set-in sleeves. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso and arms for the drape.
import { upperFrame } from './place.js';
import { brianMeasurements, brianTorso, brianSleeves, treeOptions, pick } from './tops.js';

export const id = 'teagan';
export const name = 'Teagan T-shirt';
export const short = 'T-shirt';
export const exportName = 'Teagan';
export const url = 'https://freesewing.eu/designs/teagan/';
export const author = 'Joost De Cock';
export const icon = 'M16 8l7-3c2 4 8 4 10 0l7 3 9 9-6 7-4-4v30H17V20l-4 4-6-7z';
export const stretchNote = 'Teagan is meant for knit fabric; the 3D drape uses the pattern as drafted.';

export const design = {
  fit: {
    chestEase: { v: 12, range: [5, 25], type: 'float', name: 'Chest ease (%)', help: 'Room around the chest.' },
    hipsEase: { v: 18, range: [8, 30], type: 'float', name: 'Hips ease (%)', help: 'Room around the hips.' },
    fitWaist: { v: false, type: 'bool', name: 'Fit the waist', help: 'Shape the side seams in at the waist.' },
    waistEase: { v: 25, range: [8, 40], type: 'float', name: 'Waist ease (%)', help: 'Room at the waist when the waist is fitted.' },
    sleeveLength: { v: 30, range: [20, 100], type: 'float', name: 'Sleeve length (%)', help: 'Share of the full arm length.' },
    backNeckCutout: { v: 8, range: [4, 12], type: 'float', name: 'Back neck cutout (%)', help: 'Depth of the back neckline.' },
  },
  style: {
    lengthBonus: { v: 15, range: [-20, 60], type: 'float', name: 'Length bonus (%)', help: 'Lengthens (or shortens) the body.' },
    sleeveEase: { v: 15, range: [5, 35], type: 'float', name: 'Sleeve ease (%)', help: 'Room in the sleeves.' },
    necklineDepth: { v: 25, range: [20, 40], type: 'float', name: 'Neckline depth (%)', help: 'How low the front neckline sits.' },
    necklineWidth: { v: 30, range: [10, 50], type: 'float', name: 'Neckline width (%)', help: 'How wide the neckline is.' },
    necklineBend: { v: 30, range: [0, 70], type: 'float', name: 'Neckline bend (%)', help: 'Rounds the front neckline.' },
  },
};

export const options = (d) => treeOptions(d);
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'waist', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

/*
 * Edges: front/back (cut on the fold, 6 = centre): 0 hem (centre -> side), 1 side seam (up; with a
 *   fitted waist 1-2, and every later edge one up),
 *   2-3 armhole (side -> shoulder), 4 shoulder seam (shoulder -> neck), 5 neckline (-> centre)
 * sleeve: 0 hem (front -> back), 1 back underarm (up), 2-6 cap (back -> front), 7 front underarm (down)
 * The front's local +x, the back's mirrored half and the unmirrored sleeve are the wearer's left.
 */
export function spec(o) {
  const w = o.fitWaist ? 1 : 0;   // a fitted waist splits the side seam in two (edges 1-2), the rest move up by one
  const seams = [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), b = (k) => (s > 0 ? 'm' + k : String(k)), sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    seams.push(
      { a: [['front', f(1)], ...(w ? [['front', f(2)]] : [])], b: [['back', b(1)], ...(w ? [['back', b(2)]] : [])] },
      { a: [['front', f(4 + w)]], b: [['back', b(4 + w)]] },
      { a: [['back', b(2 + w)], ['back', b(3 + w)], ['front', f(3 + w), true], ['front', f(2 + w), true]], b: [[sl, 2], [sl, 3], [sl, 4], [sl, 5], [sl, 6]] },
      { a: [[sl, 1]], b: [[sl, 7, true]] },
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'teagan.front', fold: 6 + w, label: 'body' },
      { name: 'back', part: 'teagan.back', fold: 6 + w, label: 'body' },
      { name: 'sleeve_l', part: 'teagan.sleeve', label: 'arm', follow: 12 },
      { name: 'sleeve_r', part: 'teagan.sleeve', mirror: true, label: 'arm', follow: 12 },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = brianTorso(F, parts['teagan.front'], parts['teagan.back'], { shoulderEdge: draft.settings[0].options.fitWaist ? 5 : 4, setIn: true });
  const sleeves = brianSleeves(F, parts['teagan.sleeve'], { atCrease: true });
  return (ps) => {
    if (ps.name === 'front') return T.front;
    if (ps.name === 'back') return T.back;
    return sleeves[!!ps.mirror].map;
  };
}

export const attachLevels = () => ({});
// start just above the placement: lifted further, the armholes would rise above the arms
export const lift = 2;
