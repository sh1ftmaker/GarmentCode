// FreeSewing "Carlton" coat (https://freesewing.eu/designs/carlton/, MIT, design by Joost
// De Cock): a double-breasted coat after the one Benedict Cumberbatch wears as Sherlock,
// on Bent's block: back bodice and pleated tails, half belt, collar and two-part sleeves
// with turned-back cuffs. Measurements from the mannequin, options as sliders; the seam
// table and placement (the outer shell) are shared with Carlita in coat.js.
import { fsMeasurements, pick } from './measure.js';
import { coatDesign, coatStretchNote, coatOptions, coatSpec, coatPlacement, coatOthers } from './coat.js';

export const id = 'carlton';
export const name = 'Carlton coat';
export const short = 'Coat';
export const exportName = 'Carlton';
export const url = 'https://freesewing.eu/designs/carlton/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the tail, belt and pocket parts too
export const icon = 'M19 4l5-1 4 13 4-13 5 1 9 9 5 32-5 1-4-15v34l-11 2-3-24-3 24-11-2V20l-4 15-5-1 5-32z';
export const stretchNote = coatStretchNote('Carlton');
export const design = coatDesign(60);
export const options = coatOptions;
export const others = coatOthers;

const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'waist', 'waistToFloor', 'waistToSeat', 'seat', 'shoulderToElbow', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const CFG = { id: 'carlton', front: ['seat', 'waist', 'armhole', 'armholeHollow', 'armholePitch'], side: null };
export const spec = (o, draft) => coatSpec(CFG, o, draft);
export const placement = (draft, m, body) => coatPlacement(CFG, draft, m, body);
export const attachLevels = () => ({});
export const lift = 2;
