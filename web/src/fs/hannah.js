// FreeSewing "Hannah" hoodie (https://freesewing.eu/designs/hannah/, MIT, design by
// Jonathan Haas): Toni's knit top with set-in sleeves, a three-part hood (two sides and a
// centre strip) and ribbing at the hem and cuffs. Measurements from the mannequin, options
// as sliders, seam table and placement for the drape (toni.js for the top, hugo.js-style
// hood).
import { hoodSideMap, edgeEnds } from './place.js';
import { knitOptions, toniSeams, toniPieces, toniPlacement, measurements as toniMeasurements } from './toni.js';

export const id = 'hannah';
export const name = 'Hannah hoodie';
export const short = 'Hoodie';
export const exportName = 'Hannah';
export const url = 'https://freesewing.eu/designs/hannah/';
export const author = 'Jonathan Haas';
export const settings = { expand: true };   // draft the ribbing and the hood centre too
export const icon = 'M20 6c2-3 14-3 16 0l3 6 7 2 10 8-5 9-5-4v29H14V27l-5 4-5-9 10-8 7-2z';
export const stretchNote = 'Hannah is drafted for knit fabric, with ribbing at the hem and cuffs cut shorter than the edges it is sewn to and stretched to fit. The 3D drape uses a relaxed copy (unstretched ribbing); the pattern view, cutting layout and exports use the real pattern.';

export const design = {
  fit: {
    chestEase: { v: 10, range: [0, 25], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your upper body' },
    waistEase: { v: 20, range: [0, 40], type: 'float', name: 'Waist ease (%)', help: 'The amount of ease at your waist' },
    seatEase: { v: 12, range: [0, 40], type: 'float', name: 'Seat ease (%)', help: 'The amount of ease at your seat' },
    bicepsEase: { v: 18, range: [0, 35], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm. Note that while we try to respect this, fitting the sleeve to the armhole takes precedence over respecting the exact amount of ease.' },
    wristEase: { v: 15, range: [-15, 200], type: 'float', name: 'Wrist ease (%)', help: 'The amount of ease at your wrist' },
    ribbingStretch: { v: 5, range: [0, 30], type: 'float', name: 'Ribbing stretch (%)', help: 'How much the ribbing is stretched relative to the main fabric' },
  },
  style: {
    lengthBelowWaist: { v: 90, range: [-15, 100], type: 'float', name: 'Length (%)', help: 'The length of the top, measured from the waist down' },
    sleeveLength: { v: 100, range: [10, 120], type: 'float', name: 'Sleeve length (%)', help: 'The length of the sleeve as a percentage of the distance from the shoulder to the wrist' },
    neckOpeningSize: { v: 100, range: [85, 150], type: 'float', name: 'Neck opening size (%)', help: 'Determines the circumference of the neck opening' },
    armholeDepth: { v: 10, range: [0, 40], type: 'float', name: 'Armhole depth (%)', help: 'Controls the depth of the armhole. Higher values make a deeper armhole.' },
    ribbingHeight: { v: 15, range: [0, 20], type: 'float', name: 'Ribbing height (%)', help: 'Width of the ribbing, set to 0 to disable' },
  },
};

export const options = (d, opts) => knitOptions(d, opts);
export const measurements = toniMeasurements;

const ribbed = (draft) => { const w = draft.parts[0]['toni.waistband']; return !!w && !w.hidden && !!w.paths.seam; };

/*
 * The top as Toni (toni.js). The hood as Hugo's (the same FreeSewing library parts):
 *  hood side: 0-1 face opening, 2-3 centre seam (forehead -> top -> back of neck), 4 neck (back -> front)
 *  hood centre (x along it, 0 = face): 1 one side (face -> neck), 2 neck end, 3 other side (neck -> face)
 * The mirrored hood side is on the wearer's left.
 */
export function spec(o, draft) {
  const ribbing = ribbed(draft);
  const { seams, F, B } = toniSeams(draft, { frontPart: 'toni.front', backPart: 'toni.back', ribbing });
  for (const s of [1, -1]) {
    const fm = s < 0, bm = s > 0, hood = s > 0 ? 'hood_l' : 'hood_r';
    const f = (ids) => ids.map(i => (fm ? 'm' + i : String(i))), b = (ids) => ids.map(i => (bm ? 'm' + i : String(i)));
    seams.push(
      // neckline (centre back -> centre front) to the hood centre's half neck end and the hood side
      { a: [...b(B.collar).reverse().map(i => ['back', i, true]), ...f(F.collar).map(i => ['front', i])],
        b: [s > 0 ? ['hood_center', 2, true, 0, 0.5] : ['hood_center', 2, false, 0.5, 1], [hood, 4]] },
      { a: [[hood, 2], [hood, 3]], b: [s > 0 ? ['hood_center', 1] : ['hood_center', 3, true]] },
    );
  }
  const pieces = toniPieces('hannah', { ribbing, centers: { front: F.center, back: B.center } });
  pieces.splice(4, 0,
    { name: 'hood_l', part: 'hannah.hood', mirror: true, label: 'hood', lining: true, follow: 8 },
    { name: 'hood_r', part: 'hannah.hood', label: 'hood', lining: true, follow: 8 },
    { name: 'hood_center', part: 'library.hoodCenter', label: 'hood', lining: true, follow: 50 },
  );
  return { pieces, seams, labels: {} };
}

export function placement(draft, m, body) {
  return toniPlacement(draft, m, body, {
    extra: ({ F }) => (ps, loop) => {
      if (/^hood_[lr]$/.test(ps.name)) {
        const seam = loop.edges.filter(e => e.id === '2' || e.id === '3').map(e => e.poly);
        return hoodSideMap(F, { sx: ps.mirror ? 1 : -1, anchor: edgeEnds(loop, 4)[0], seam, zSign: ps.mirror ? -1 : 1 });
      }
      if (ps.name === 'hood_center') {
        const [, cy, cz] = F.head.c;
        return (x) => [0, cy + 6, cz - 6 + 0.1 * x];
      }
      return null;
    },
  });
}

export const attachLevels = () => ({});
export const lift = 2;
