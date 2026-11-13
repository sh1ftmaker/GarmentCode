// FreeSewing "Carlita" coat (https://freesewing.eu/designs/carlita/, MIT, design by Joost
// De Cock): Carlton adapted for the bust, with princess seams (a side front panel) instead
// of Carlton's front. Measurements from the mannequin, options as sliders; the seam table
// and placement (the outer shell) are shared with Carlton in coat.js.
import { fsMeasurements, pick } from './measure.js';
import { coatDesign, coatStretchNote, coatOptions, coatSpec, coatPlacement, coatOthers } from './coat.js';

export const id = 'carlita';
export const name = 'Carlita coat';
export const short = 'Coat';
export const exportName = 'Carlita';
export const url = 'https://freesewing.eu/designs/carlita/';
export const author = 'Joost De Cock';
export const settings = { expand: true };
export const icon = 'M20 4l5-1 3 13 3-13 5 1 9 9 5 32-5 1-4-15v8l3 26-12 2-4-22-4 22-12-2 3-26v-8l-4 15-5-1 5-32z';
export const stretchNote = coatStretchNote('Carlita') + ' The princess seams are sewn.';
// wider button spacing would put the right front's hidden edge past its princess seam
export const design = coatDesign(50);
export const options = coatOptions;
export const others = { ...coatOthers, lining: [...coatOthers.lining, 'Side × 2'] };

const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'waist', 'waistToFloor', 'waistToSeat', 'seat', 'highBust', 'bustSpan',
  'shoulderToElbow', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const CFG = {
  id: 'carlita', front: ['bustPoint', 'armholePitch'],
  side: { part: 'carlita.side', names: ['seat', 'waist', 'armhole', 'armholeHollow', 'armholePitch', 'bustPoint', 'psWaist', 'psHem'] },
};
export const spec = (o, draft) => coatSpec(CFG, o, draft);
export const placement = (draft, m, body) => coatPlacement(CFG, draft, m, body);
export const attachLevels = () => ({});
export const lift = 2;
