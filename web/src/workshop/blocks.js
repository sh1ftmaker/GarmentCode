// Starter blocks for the pattern editor: simple garments drafted from body measurements
// with formulas, so they follow the body. Original drafts (the usual home-sewing block
// shapes: quarters of the girths plus ease), not copied from any pattern system.
import { uid } from './model.js';

const F = (f) => ({ f, d: 0 });
const P = (x, y, extra = {}) => ({ x: F(x), y: F(y), c: null, ...extra });

function skirt() {
  const front = {
    id: uid(), name: 'Skirt front', layer: 'front', role: 'skirt', sym: 'fold', grain: 0,
    pts: [
      P('0', 'waist_y - 1', { label: 'lower_interface', c: [[0.5, 0.02]] }),
      P('waist / 4 + waist_ease / 4', 'waist_y + 0.5', { c: [[0.45, 0.07]] }),
      P('hips / 4 + hip_ease / 4', 'hip_y'),
      P('hips / 4 + hip_ease / 4 + flare', 'waist_y - length', { c: [[0.5, -0.02]] }),
      P('0', 'waist_y - length - 1'),
    ],
  };
  const back = {
    ...front, id: uid(), name: 'Skirt back', layer: 'back',
    pts: [
      P('0', 'waist_y - 0.5', { label: 'lower_interface', c: [[0.5, 0.02]] }),
      P('waist / 4 + waist_ease / 4', 'waist_y + 0.5', { c: [[0.45, 0.07]] }),
      P('hips / 4 + hip_ease / 4', 'hip_y'),
      P('hips / 4 + hip_ease / 4 + flare', 'waist_y - length', { c: [[0.5, -0.02]] }),
      P('0', 'waist_y - length - 1'),
    ],
  };
  return {
    name: 'A-line skirt',
    params: { length: 58, waist_ease: 2, hip_ease: 4, flare: 6 },
    pieces: [front, back],
    seams: [{ id: uid(), a: { p: front.id, e: [1, 2] }, b: { p: back.id, e: [1, 2] } }],
  };
}

/** Bodice front/back (cut on the fold) with optional sleeves; dress = longer and flared. */
function top({ dress = false, sleeves = true } = {}) {
  const hemY = dress ? 'waist_y - length' : 'waist_y - length';
  const hemX = dress ? 'max(bust, hips) / 4 + ease / 4 + flare' : 'max(bust, hips) / 4 + ease / 4';
  const body = (name, layer, neckDepth) => ({
    id: uid(), name, layer, role: 'body', sym: 'fold', grain: 0,
    pts: [
      P('0', `neck_y - ${neckDepth}`, { label: 'collar', c: [[0.62, -0.38]] }),
      P('neck_w / 2 + neck_widen', 'neck_y + 0.5'),
      P('shoulder_x + shoulder_ext', 'shoulder_y'),
      P('bust / 4 + ease / 4', 'armpit_y - armhole_drop', dress ? { c: [[0.5, -0.03]] } : {}),
      P(hemX, hemY, { c: [[0.5, -0.02]] }),
      P('0', `${hemY} - 0.5`),
    ],
  });
  const f = body(dress ? 'Dress front' : 'Front', 'front', 'neck_front');
  const b = body(dress ? 'Dress back' : 'Back', 'back', 'neck_back');
  const pieces = [f, b];
  const seams = [
    { id: uid(), a: { p: f.id, e: [1] }, b: { p: b.id, e: [1] } },   // shoulders
    { id: uid(), a: { p: f.id, e: [3] }, b: { p: b.id, e: [3] } },   // sides
  ];
  const params = dress
    ? { ease: 10, length: 60, flare: 8, neck_front: 9, neck_back: 2.5, neck_widen: 2, shoulder_ext: -2, armhole_drop: 2 }
    : { ease: 14, length: 20, neck_front: 8, neck_back: 2, neck_widen: 1.5, shoulder_ext: 2, armhole_drop: 8 };
  if (sleeves) {
    Object.assign(params, { sleeve_length: 22, sleeve_angle: 10, sleeve_taper: 1 });
    // a straight (drop-shoulder) cap from the shoulder point to the underarm, sleeves drawn
    // out to the side; the drape swings them down along the arms
    const ux = 'cos(sleeve_angle)', uy = 'sin(sleeve_angle)';
    const sleeve = (name, layer) => ({
      id: uid(), name, layer, role: 'arm', sym: 'pair', grain: -(90 - 10),
      pts: [
        P('shoulder_x + shoulder_ext', 'shoulder_y'),
        P('bust / 4 + ease / 4', 'armpit_y - armhole_drop'),
        P(`bust / 4 + ease / 4 + sleeve_length * ${ux} + sleeve_taper * ${uy}`, `armpit_y - armhole_drop - sleeve_length * ${uy} + sleeve_taper * ${ux}`),
        P(`shoulder_x + shoulder_ext + sleeve_length * ${ux}`, `shoulder_y - sleeve_length * ${uy}`),
      ],
    });
    const sf = sleeve('Sleeve front', 'front'), sb = sleeve('Sleeve back', 'back');
    pieces.push(sf, sb);
    seams.push(
      { id: uid(), a: { p: sf.id, e: [0] }, b: { p: f.id, e: [2] } },    // cap to armhole
      { id: uid(), a: { p: sb.id, e: [0] }, b: { p: b.id, e: [2] } },
      { id: uid(), a: { p: sf.id, e: [1] }, b: { p: sb.id, e: [1] } },  // underarm
      { id: uid(), a: { p: sf.id, e: [3] }, b: { p: sb.id, e: [3] } },  // overarm
    );
  }
  return { name: dress ? 'Shift dress' : 'Boxy T-shirt', params, pieces, seams };
}

export const BLOCKS = [
  { id: 'skirt', name: 'A-line skirt', description: 'Front and back cut on the fold, side seams, held at the waist.', make: skirt },
  { id: 'tee', name: 'Boxy T-shirt', description: 'Drop-shoulder tee: front, back and two-part sleeves.', make: () => top() },
  { id: 'dress', name: 'Shift dress', description: 'Sleeveless, knee length, a little flare.', make: () => top({ dress: true, sleeves: false }) },
];
