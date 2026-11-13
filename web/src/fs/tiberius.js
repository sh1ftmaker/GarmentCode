// FreeSewing "Tiberius" tunica (https://freesewing.eu/designs/tiberius/, MIT, design by
// Rika Tamaike): a Roman tunic, two big rectangles (front and back, each cut on the fold)
// sewn together over the shoulders, leaving the head opening, and down the sides below
// the armholes. Measurements from the mannequin, options as sliders, seam table and
// placement around the torso for the drape.
import { bodyColumns, torsoBox, curtainMap } from './curtain.js';
import { fsMeasurements, pick } from './measure.js';
import { fsOptions } from './lower.js';

export const id = 'tiberius';
export const name = 'Tiberius tunica';
export const short = 'Tunica';
export const exportName = 'Tiberius';
export const url = 'https://freesewing.eu/designs/tiberius/';
export const author = 'Rika Tamaike';
export const icon = 'M8 8h40l2 2-3 18-5-1v23H14V27l-5 1-3-18zM22 8c2 4 10 4 12 0';
export const stretchNote = 'The tunica is worn ungirded in the 3D drape (a belt or cingulum is not part of the pattern). The clavi are guide lines for bias tape, drawn on the pattern only.';

export const design = {
  fit: {
    headRatio: { v: 100, range: [80, 120], type: 'float', fs: 'pct', name: 'Head ratio (%)', help: 'Controls the size of the head opening.' },
    armholeDrop: { v: 110, range: [100, 150], type: 'float', fs: 'pct', name: 'Armhole drop (%)', help: 'Controls the depth of the armhole.' },
  },
  style: {
    length: { v: 'toKnee', range: ['toKnee', 'toMidLeg', 'toFloor'], type: 'select', fs: 'list', name: 'Length', labels: { toKnee: 'To the knee', toMidLeg: 'To mid-leg', toFloor: 'To the floor' }, help: 'Controls the length of the garment.' },
    lengthBonus: { v: 90, range: [60, 130], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Allows variation of the length of the garment.' },
    width: { v: 'toMidArm', range: ['toElbow', 'toShoulder', 'toMidArm'], type: 'select', fs: 'list', name: 'Width', labels: { toElbow: 'To the elbow', toShoulder: 'To the shoulder', toMidArm: 'To the midarm/biceps' }, help: 'Controls the width of the garment.' },
    widthBonus: { v: 100, range: [50, 130], type: 'float', fs: 'pct', name: 'Width bonus (%)', help: 'Allows variation of the width of the garment.' },
    clavi: { v: false, type: 'bool', fs: 'bool', name: 'Clavi', help: 'Whether or not to include guides for clavi.' },
    forceWidth: { v: false, type: 'bool', fs: 'bool', name: 'Force width', help: 'Use the width as set, even when it is narrower than the body (chest, waist, hips or seat).' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) Object.defineProperty(o, 'drape3d', { value: true, enumerable: false });   // spec() is drafting for the drape
  return o;
}

const MEASUREMENTS = ['head', 'shoulderToElbow', 'shoulderToShoulder', 'biceps', 'hpsToWaistBack', 'waistToKnee', 'waist',
  'chest', 'seat', 'hips', 'waistToFloor', 'waistToUpperLeg'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges (tunica, cut on the fold at x = 0, edge 3): 0 top (centre -> topLeft: the head
 * opening, then the shoulder seam), 1 side (topLeft -> bottomLeft: the armhole, then the
 * side seam), 2 hem. The front's original half (local -x) is the wearer's right, the back's
 * original half the wearer's left.
 */
const fractions = (part) => {
  const p = part.points;
  return {
    neck: Math.min(0.95, p.headLeft.dx(p.top) / p.topLeft.dx(p.top)),
    arm: Math.min(0.95, p.topLeft.dy(p.armholeLeft) / p.topLeft.dy(p.bottomLeft)),
  };
};

export function spec(o, draft) {
  const part = draft.parts[0]['tiberius.tunica'];
  const { neck, arm } = fractions(part);
  if (o.drape3d) {
    // a width bonus under 100% can draft a tunica narrower than the body: it can't be put on
    const ms = draft.settings[0].measurements, round = 4 * part.points.topLeft.dx(part.points.top) / 10;
    const body = Math.max(ms.chest, ms.seat, ms.hips, ms.waist) / 10;
    if (round < 0.98 * body) throw new Error(`this tunica is ${Math.round(round)} cm round, narrower than the body (${Math.round(body)} cm), so it can't be put on and is not draped. Increase the width bonus or choose a wider width; the pattern is still available.`);
  }
  const seams = [];
  for (const [f, b] of [['', 'm'], ['m', '']]) {
    seams.push(
      { a: [['front', f + '0', false, neck, 1]], b: [['back', b + '0', false, neck, 1]] },   // shoulder
      { a: [['front', f + '1', false, arm, 1]], b: [['back', b + '1', false, arm, 1]] },     // side
    );
  }
  return {
    pieces: [
      { name: 'front', part: 'tiberius.tunica', fold: 3, label: 'body' },
      { name: 'back', part: 'tiberius.tunica', fold: 3, label: 'body' },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const p = draft.parts[0]['tiberius.tunica'].points;
  const C = bodyColumns(body, m);
  const Yw = m.height - m.head_l - m.waist_line;
  const box = torsoBox(body, Yw - m.hips_line, C.Yhps - m.armscye_depth);
  const halfWidth = p.topLeft.dx(p.top) / 10;
  const front = curtainMap(C, box, { side: 1, xSign: 1, halfWidth });
  const back = curtainMap(C, box, { side: -1, xSign: -1, halfWidth });
  return (ps) => (ps.name === 'front' ? front : back);
}

export const attachLevels = () => ({});
export const lift = 2;
