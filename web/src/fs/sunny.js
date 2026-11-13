// FreeSewing "Sunny" split-side skirt (https://freesewing.eu/designs/sunny/, MIT, design by
// halbmoki): an 18th-century petticoat of two rectangular panels (front and back), each
// pleated to half the waist and finished with a fabric binding, sewn together at the sides
// below the side openings and tied on with ribbons. Measurements from the mannequin, options
// as sliders, seam table and placement: the bindings round the waist, the panels hanging
// from them in deep, even folds that take up the pleated fullness.
import { fsMeasurements, pick } from './measure.js';
import { fsOptions, skirtSections, skirtMap } from './lower.js';

export const id = 'sunny';
export const name = 'Sunny split-side skirt';
export const short = 'Split-side skirt';
export const exportName = 'Sunny';
export const url = 'https://freesewing.eu/designs/sunny/';
export const author = 'halbmoki';
export const settings = { expand: true };   // the panels and bindings are plain rectangles
export const icon = 'M18 8h20v5c6 10 12 22 14 36-12 4-36 4-48 0 2-14 8-26 14-36zM18 13h20';
export const stretchNote = 'The pleats are draped as gathers (the knife pleats themselves are not folded in). Each binding is draped as one layer of its finished width above the pleats instead of wrapped over them, and the ribbon ties are drawn as the front and back bindings meeting at the sides; the side openings hang open.';

export const design = {
  fit: {
    waistEase: { v: 20, range: [-30, 30], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Ease added to the waistline.' },
    sideOpeningLength: { v: 75, range: [0, 100], type: 'float', fs: 'pct', name: 'Side opening length (%)', help: 'Length of the openings in the side seams, as a percentage of the waist to seat measurement.' },
  },
  style: {
    length: { v: 100, range: [25, 400], type: 'float', fs: 'pct', name: 'Length (%)', help: 'Skirt length, as a percentage of the waist measurement.' },
    numPleats: { v: 10, range: [5, 25], type: 'int', fs: 'count', name: 'Number of pleats', help: 'Number of pleats per side.' },
    pleatOverlap: { v: 0, range: [0, 20], type: 'float', fs: 'pct', name: 'Pleat overlap (%)', help: 'Percentage overlap with the previous pleat (more fabric per pleat).' },
  },
  advanced: {
    bindingWidth: { v: 25, range: [10, 100], type: 'float', fs: 'pct', name: 'Binding width (%)', help: 'Width of the fabric binding (folded in four over the pleats).' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  // the fabric binding finishes the pleats (FreeSewing's default); the drape needs it
  o.fabricBinding = true;
  Object.defineProperty(o, 'drape', { value: relaxed, enumerable: false });
  return o;
}

const MEASUREMENTS = ['waist', 'waistToSeat', 'seat'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const mv = (to) => ({ type: 'move', to }), ln = (to) => ({ type: 'line', to });
/*
 * Seam outlines (Sunny draws its rectangles as open paths): panel tl -> bl (left side),
 * bl -> br (hem), br -> tr (right side), tr -> tl (top, pleated); binding tl -> bbl, bbl -> bbr
 * (sewn to the pleats), bbr -> btr, btr -> tl. For the drape the binding is its finished
 * width: folded in four, a quarter of it shows.
 */
function buildSeams(draft, drape) {
  const parts = draft.parts[0], pp = parts['sunny.panel'], bp = parts['sunny.binding'];
  const P = pp.points;
  pp.paths.seam = { ops: [mv(P.tl), ln(P.bl), ln(P.br), ln(P.tr), ln(P.tl), { type: 'close' }] };
  if (bp && !bp.hidden) {
    const B = bp.points;
    if (drape) {
      const q = (B.bbl.y - B.tl.y) / 4;
      bp.paths.seam = { ops: [mv(B.tl), ln({ x: B.tl.x, y: B.tl.y + q }), ln({ x: B.btr.x, y: B.btr.y + q }), ln(B.btr), ln(B.tl), { type: 'close' }] };
    } else bp.paths.seam = { ops: [mv(B.tl), ln(B.bbl), ln(B.bbr), ln(B.btr), ln(B.tl), { type: 'close' }] };
  }
  return { pp, bp: bp && !bp.hidden ? bp : null };
}

/*
 * Front and back panel (each seen from outside, local x from the wearer's right / left):
 * the front's left side (wearer's right) meets the back's right side, below the openings.
 * Bindings: sewn to the panel tops, their ends joined at the sides (the ties).
 */
export function spec(o, draft) {
  const { pp, bp } = buildSeams(draft, !!o.drape);
  const P = pp.points, f = Math.min(0.999, (P.lNotch.y - P.tl.y) / (P.bl.y - P.tl.y));
  const seams = [
    { a: [['front', 0, false, f, 1]], b: [['back', 2, true, 0, 1 - f]] },   // wearer's right: notch -> hem
    { a: [['back', 0, false, f, 1]], b: [['front', 2, true, 0, 1 - f]] },   // wearer's left
  ];
  const pieces = [
    { name: 'front', part: 'sunny.panel' },
    { name: 'back', part: 'sunny.panel' },
  ];
  const labels = {};
  if (bp) {
    pieces.push({ name: 'binding_front', part: 'sunny.binding', label: 'body' }, { name: 'binding_back', part: 'sunny.binding', label: 'body' });
    for (const s of ['front', 'back']) seams.push({ a: [[s, 3, true]], b: [[`binding_${s}`, 1]] });
    seams.push({ a: [['binding_front', 2]], b: [['binding_back', 0, true]] }, { a: [['binding_back', 2]], b: [['binding_front', 0, true]] });
    labels.lower_interface = [['binding_front', 3], ['binding_back', 3]];
  } else labels.lower_interface = [['front', 3], ['back', 3]];
  return { pieces, seams, labels };
}

export function placement(draft, m, body) {
  const o = draft.settings[0].options;
  const { pp, bp } = buildSeams(draft, true);
  const P = pp.points, w = (P.tr.x - P.tl.x) / 10;
  const Yw = m.height - m.head_l - m.waist_line;
  const bh = bp ? (bp.points.bbl.y - bp.points.tl.y) / 40 : 0, bl = bp ? (bp.points.btr.x - bp.points.tl.x) / 10 : w / 3;
  const Ytop = Yw - bh;   // the panels' top edge
  const sections = skirtSections(body, Yw + 6);
  const Cb = 2 * bl, gap = 1.5;
  const S0 = sections(Ytop), k0 = Math.max(1, Cb / S0.L);
  const sinB = 0.3, cosB = Math.sqrt(1 - sinB * sinB);
  const nfl = Math.max(6, Math.min(2 * Math.round(o.numPleats || 10), Math.round(Cb / 10)));
  const panel = (back) => (x, y) => {
    const s = Math.max(0, -y), fr = Math.max(0, Math.min(1, x / w));
    const f = back ? 0.25 + fr / 2 : fr / 2 - 0.25;   // share of the turn from the centre front
    const [px, pz, nx, nz] = S0.at(((f % 1) + 1) % 1 * S0.L);
    const wx = k0 * (px - S0.cx) + gap * nx, wz = k0 * (pz - S0.cz) + gap * nz;
    const R0 = Math.hypot(wx, wz) || 1, dx = wx / R0, dz = wz / R0;
    const r0 = Cb / (2 * Math.PI) + gap + s * sinB, len = 2 * w;
    let r = R0 + s * sinB;
    if (len > 2 * Math.PI * r0 * 1.02) {
      const A = Math.min(0.8 * r0, Math.max(Math.sqrt(2 * ((len / (2 * Math.PI)) ** 2 - r0 * r0)) / nfl, (len - 2 * Math.PI * r0) / (4 * nfl)));
      r += A * Math.cos(nfl * 2 * Math.PI * f);
    }
    const Y = Ytop - s * cosB, Sb = sections(Y);
    const [bx, bz] = Sb.at(((f % 1) + 1) % 1 * Sb.L);
    r = Math.max(r, dx * (bx - S0.cx) + dz * (bz - S0.cz) + 2 * gap);
    return [S0.cx + r * dx, Y, S0.cz + r * dz];
  };
  const B = skirtMap(sections, { waistY: Yw, girth: () => Cb, gap });
  const binding = (back) => (x, y) => B((back ? 0.25 + x / bl / 2 : x / bl / 2 - 0.25) * Cb, y);
  return (ps) => (ps.name === 'front' ? panel(false) : ps.name === 'back' ? panel(true)
    : binding(ps.name === 'binding_back'));
}

export function attachLevels(draft, m) {
  return { lower_interface: m.height - m.head_l - m.waist_line };
}
export const lift = 2;
