// FreeSewing "Uma" underwear (https://freesewing.eu/designs/uma/, MIT, design by Joost De
// Cock): a front, a back and a (double) gusset, drafted with negative ease for stretch
// knits. Measurements from the mannequin, options as sliders, seam table and placement
// around the hips and under the crotch for the drape.
import { fsMeasurements, pick } from './measure.js';
import { fsOptions, skirtSections } from './lower.js';

export const id = 'uma';
export const name = 'Uma underwear';
export const short = 'Underwear';
export const exportName = 'Uma';
export const url = 'https://freesewing.eu/designs/uma/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // whole front and back (not on the fold)
export const icon = 'M8 12c10 2 30 2 40 0l-3 12c-6 3-11 10-12 20h-10c-1-10-6-17-12-20z';
export const stretchNote = 'Uma is drafted with negative ease for stretch knits. The 3D drape uses a relaxed copy (about a third of the horizontal and half the vertical stretch) because the simulated cloth barely stretches; the pattern view, cutting layout and exports use the real pattern. The gusset is cut twice; the drape shows one layer.';

export const design = {
  fit: {
    xStretch: { v: 15, range: [0, 30], type: 'float', fs: 'pct', name: 'Horizontal fabric stretch (%)', help: 'Adjust this for more or less stretchy fabric in the horizontal direction.' },
    yStretch: { v: 5, range: [0, 15], type: 'float', fs: 'pct', name: 'Vertical fabric stretch (%)', help: 'Adjust this for more or less stretchy fabric in the vertical direction.' },
    gussetWidth: { v: 15, range: [5, 24], type: 'float', fs: 'pct', name: 'Gusset width (%)', help: 'Controls the width of the gusset.' },
    gussetLength: { v: 12.7, range: [10, 16], type: 'float', fs: 'pct', name: 'Gusset length (%)', help: 'Controls the length of the gusset.' },
    gussetPosition: { v: 70, range: [5, 95], type: 'float', fs: 'pct', name: 'Gusset position (%)', help: 'Shifts the gusset more to the front or back.' },
  },
  style: {
    rise: { v: 50, range: [30, 100], type: 'float', fs: 'pct', name: 'Rise (%)', help: 'Controls the height of the waist.' },
    legRise: { v: 54, range: [5, 95], type: 'float', fs: 'pct', name: 'Leg rise (%)', help: 'Controls how high the leg is cut out.' },
    frontDip: { v: 10, range: [0, 25], type: 'float', fs: 'pct', name: 'Front waist dip (%)', help: 'Controls how much the front waist curves.' },
    frontExposure: { v: 70, range: [5, 100], type: 'float', fs: 'pct', name: 'Front exposure (%)', help: 'Controls the amount of exposed skin on the front.' },
    backDip: { v: -5, range: [-15, 10], type: 'float', fs: 'pct', name: 'Back waist dip (%)', help: 'Controls how much the back waist curves.' },
    backExposure: { v: 30, range: [0, 115], type: 'float', fs: 'pct', name: 'Back exposure (%)', help: 'Controls the amount of exposed skin on the back (over 80%: a thong).' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) { o.xStretch *= 0.35; o.yStretch *= 0.6; }
  return o;
}

const MEASUREMENTS = ['waist', 'seat', 'waistToSeat', 'waistToUpperLeg'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges (seam path operations; the parts are drawn whole and symmetric, local x < 0 is the
 * wearer's right on all three):
 *  front: 0 waist (centre -> right), 1 right side seam (down), 2 right leg opening, 3 gusset
 *    seam (right -> left), 4 left leg, 5 left side (up), 6 waist (left -> centre)
 *  back (drawn upside down, waist up): 0 waist (centre -> left), 1 left side (down), 2 left
 *    leg, 3 gusset seam (left -> centre), 4 (centre -> right), 5 right leg, 6 right side
 *    (up), 7 waist (right -> centre)
 *  gusset: 0 front seam (centre -> right), 1-2 right leg, 3 back seam (right -> left),
 *    4-5 left leg, 6 front seam (left -> centre)
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  const n = (p) => parts[p].paths.seam.ops.filter(op => op.type !== 'move').length;
  if (n('uma.front') !== 7 && n('uma.front') !== 8) throw new Error(`Uma: unexpected front outline (${n('uma.front')} edges)`);
  return {
    pieces: [
      { name: 'front', part: 'uma.front' },
      { name: 'back', part: 'uma.back' },
      { name: 'gusset', part: 'uma.gusset', lining: true },   // FreeSewing: cut 2
    ],
    seams: [
      { a: [['front', 1]], b: [['back', 6, true]] },                    // right side seam, waist down
      { a: [['front', 5]], b: [['back', 1, true]] },                    // left side seam, leg up
      { a: [['front', 3]], b: [['gusset', 0, true], ['gusset', 6, true]] },   // front to gusset, right -> left
      { a: [['gusset', 3]], b: [['back', 4, true], ['back', 3, true]] },      // gusset to back, right -> left
    ],
    labels: { lower_interface: [['front', 0], ['front', 6], ['back', 0], ['back', 7]] },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's y = 0: the natural waist

/**
 * Placement: the three parts are drafted as one strip down the front, under the crotch and
 * up the back (the back drawn turned over: its local y is the distance down that strip).
 * Above the crotch a point lies on the lower body's section at its height (u around the
 * girth from the centre front); under the crotch it folds in towards the body's centre.
 */
export function placement(draft, m, body) {
  const parts = draft.parts[0], F = parts['uma.front'].points;
  const W = waistY(m), crotchH = -(m.hips_line + m.crotch_hip_diff);
  const sections = skirtSections(body, W + 4);
  const sMid = F.cfMiddle.y / 10;
  // the pattern's girth at its top (front + back), around the body section
  const span = (part) => { let a = Infinity, b = -Infinity; for (const p of Object.values(part.points)) { a = Math.min(a, p.x); b = Math.max(b, p.x); } return (b - a) / 10; };
  const C = span(parts['uma.front']) + span(parts['uma.back']);
  const gap = 1.2;
  const at = (u, s) => {   // u: cm around from the centre front (back: from the centre back), s: cm down the strip
    const back = s > sMid, h = back ? s - 2 * sMid : -s;
    const hh = Math.max(h, crotchH + 1);
    const S = sections(W + hh);
    const k = Math.max(1, C / S.L);
    const f = back ? 0.5 - u / C : u / C;   // fraction of the girth from the centre front (towards +x)
    const [x, z, nx, nz] = S.at(f * S.L);
    let X = S.cx + k * (x - S.cx) + gap * nx, Z = S.cz + k * (z - S.cz) + gap * nz, Y = W + hh;
    if (h < crotchH + 1) {   // under the crotch: fold in towards the centre, between the legs
      const e = crotchH + 1 - h, zc = S.cz;
      Z = zc + Math.sign(Z - zc) * Math.max(0.6, Math.abs(Z - zc) - 1.6 * e);
      Y = W + crotchH - 0.5;
    }
    return [X, Y - DROP, Z];
  };
  return (ps) => {
    if (ps.name === 'front') return (x, y) => at(x, -y);
    if (ps.name === 'back') return (x, y) => at(x, y);
    return (x, y) => at(x, -y);   // gusset: in the front's coordinates
  };
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], F = parts['uma.front'].points, B = parts['uma.back'].points;
  const sMid = F.cfMiddle.y / 10;
  // above the waist edges' highest point: garment.js then caps each waist vertex's floor at
  // its own start height + 2 cm, i.e. at its designed height (see DROP)
  const front = [F.cfWaistbandDip, F.sideWaistband].map(p => -p.y / 10);
  const back = [B.cfWaistbandDipBack, B.sideWaistbandBack].map(p => -p.y / 10 - 2 * sMid);
  return { lower_interface: waistY(m) + Math.max(...front, ...back) };
}
// Nothing else holds the relaxed (unstretched) copy up, so the waist is attached at its
// designed height point by point: the pieces start DROP cm below it and the attachment
// floors (start + 2 cm) bring the waist back up to it.
const DROP = 2;
export const lift = 0;
