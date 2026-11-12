// FreeSewing "Aaron" A-shirt (https://freesewing.eu/designs/aaron/, MIT, design by Joost
// De Cock): a tank top finished with knit bindings. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso for the drape.
import { upperFrame } from './place.js';
import { brianMeasurements, brianTorso, treeOptions, pick } from './tops.js';

export const id = 'aaron';
export const name = 'Aaron A-shirt';
export const short = 'Tank top';
export const exportName = 'Aaron';
export const url = 'https://freesewing.eu/designs/aaron/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the bindings too
export const icon = 'M19 5h5c1 7 7 7 8 0h5l1 12c0 6 5 8 5 14v20H13V31c0-6 5-8 5-14z';
export const stretchNote = 'Aaron is drafted for stretch knit (a little negative ease and bindings cut shorter than the edges). The 3D drape uses a relaxed copy without the stretch allowance; the pattern view, cutting layout and exports use the real pattern. The bindings are cut but not simulated.';

export const design = {
  fit: {
    chestEase: { v: 8, range: [0, 20], type: 'float', name: 'Chest ease (%)', help: 'Room around the chest.' },
    hipsEase: { v: 8, range: [0, 20], type: 'float', name: 'Hips ease (%)', help: 'Room around the hips.' },
    stretchFactor: { v: 5, range: [0, 15], type: 'float', name: 'Fabric stretch (%)', help: 'How much the knit stretches. More stretch drafts a smaller pattern.' },
  },
  style: {
    lengthBonus: { v: 10, range: [-20, 60], type: 'float', name: 'Length bonus (%)', help: 'Lengthens (or shortens) the body.' },
    armholeDrop: { v: 10, range: [0, 75], type: 'float', name: 'Armhole drop (%)', help: 'Lowers the armholes.' },
    necklineDrop: { v: 20, range: [10, 35], type: 'float', name: 'Neckline drop (%)', help: 'Lowers the front neckline.' },
    necklineBend: { v: 100, range: [40, 100], type: 'float', name: 'Neckline bend (%)', help: 'Rounds the front neckline.' },
    backlineBend: { v: 50, range: [25, 100], type: 'float', name: 'Back neckline bend (%)', help: 'Rounds the back neckline.' },
    shoulderStrapWidth: { v: 15, range: [10, 40], type: 'float', name: 'Strap width (%)', help: 'Width of the shoulder straps.' },
    shoulderStrapPlacement: { v: 40, range: [20, 80], type: 'float', name: 'Strap placement (%)', help: 'Where the straps sit between neck and shoulder.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d);
  if (relaxed) o.stretchFactor = 0;
  return o;
}
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

/*
 * Edges: front/back (cut on the fold, 0 = centre): 1 hem (centre -> side), 2 side seam (up),
 *   3 armhole (side -> strap), 4 shoulder seam (strap), then the neckline (front 5, back 6)
 */
export function spec() {
  const f = (s, k) => (s > 0 ? String(k) : 'm' + k), b = (s, k) => (s > 0 ? 'm' + k : String(k));
  const seams = [];
  for (const s of [1, -1]) seams.push(
    { a: [['front', f(s, 2)]], b: [['back', b(s, 2)]] },
    { a: [['front', f(s, 4)]], b: [['back', b(s, 4)]] },
  );
  return {
    pieces: [
      { name: 'front', part: 'aaron.front', fold: 0, label: 'body' },
      { name: 'back', part: 'aaron.back', fold: 0, label: 'body' },
      { name: 'neck_binding', part: 'aaron.neckBinding', cutOnly: true },
      { name: 'arm_binding_l', part: 'aaron.armBinding', cutOnly: true },
      { name: 'arm_binding_r', part: 'aaron.armBinding', cutOnly: true },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = brianTorso(F, parts['aaron.front'], parts['aaron.back'], { shoulderEdge: 4 });
  return (ps) => (ps.name === 'front' ? T.front : ps.name === 'back' ? T.back : null);
}

export const attachLevels = () => ({});
export const lift = 2;
