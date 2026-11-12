// Fabric grain: one direction per pattern piece, decided here and used by both the cloth
// simulation (garment.js: stretch compliance per edge) and the cutting layout (pieces.js:
// every piece is turned so that its grain runs along the selvedge).
//
// The grain is a 2D unit vector in the piece's own pattern coordinates (cm, y up), along
// the warp (lengthwise grain). Defaults:
//  - GarmentCode torso, skirt and trouser panels: local y (the garment's vertical);
//  - GarmentCode sleeve panels ('arm'): local x, which runs along the arm; it points
//    towards the sleeve cap (the end sewn to the bodice), so the cut piece has its cap up;
//  - FreeSewing pieces: their own grainline if the draft has one (panel.grain), else the
//    piece's vertical.
// Cutting a piece on the cross grain turns that vector a quarter turn, on the bias by 45°.
// Mirrored left/right pieces get mirrored bias directions, so a pair still hangs (and is
// cut) as mirror images. The piece outline is never changed.

export const GRAIN_MODES = ['straight', 'cross', 'bias'];
export const GRAIN_NAMES = { straight: 'Straight grain', cross: 'Cross grain', bias: 'Bias (45°)' };
export const GRAIN_HELP = {
  straight: 'Warp (lengthwise threads) runs down the garment: the most stable.',
  cross: 'Weft runs down the garment: a little stretchier; borders and wide pieces.',
  bias: 'Threads at 45°: the fabric shears, so the piece stretches, clings and drapes softly.',
};

/** Pieces the garment-wide choice applies to: skirt (incl. tiers and godets) and bodice panels. */
export const garmentGrainApplies = (name) => /skirt|torso/.test(name) && !/^wb_|waistband|cuff|collar/.test(name);

/** Grain choice of one piece: per-piece override, then the garment-wide choice, else straight. */
export function grainMode(name, grain) {
  const own = grain?.pieces?.[name];
  if (own && GRAIN_MODES.includes(own)) return own;
  if (grain?.all && GRAIN_MODES.includes(grain.all) && garmentGrainApplies(name)) return grain.all;
  return 'straight';
}

const norm2 = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const rot2 = ([x, y], deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c * x - s * y, s * x + c * y]; };
/** Placed in 3D by GarmentCode (a real rotation); FreeSewing pieces carry a zero third row. */
export const gcFrame = (p) => Array.isArray(p.rotation) && Array.isArray(p.rotation[2]) && p.rotation[2].some(v => v !== 0);
const centroid = (pts) => { let x = 0, y = 0; for (const q of pts) { x += q[0]; y += q[1]; } return [x / pts.length, y / pts.length]; };

/** Which end of a sleeve panel is sewn to the bodice: +1 when it is towards local +x. */
function capSide(p, data) {
  const panels = Object.fromEntries(data.panels.map(q => [q.name, q]));
  let sx = 0, n = 0;
  for (const s of data.stitches || []) {
    for (const [me, other, idx] of [[s.a, s.b, s.ia], [s.b, s.a, s.ib]]) {
      if (me !== p.name || !panels[other] || panels[other].label === 'arm') continue;
      for (const i of idx) if (p.boundary[i]) { sx += p.boundary[i][0]; n++; }
    }
  }
  if (!n) return 1;
  return sx / n >= centroid(p.boundary)[0] ? 1 : -1;
}

/** Straight (lengthwise) grain of a panel in its pattern coordinates. */
export function straightGrain(p, data) {
  if (Array.isArray(p.grain) && (p.grain[0] || p.grain[1])) return norm2(p.grain);
  if (p.label === 'arm' && gcFrame(p)) return [capSide(p, data), 0];
  return [0, 1];
}

/**
 * The cross / bias direction is picked so that mirrored pieces get mirrored vectors: a
 * score that a left/right mirror image (world x -> -x, on the other side of the body)
 * leaves unchanged.
 */
function pick(p, cands) {
  let toWorld, side;
  if (gcFrame(p)) {
    const R = p.rotation, [mx, my] = centroid(p.boundary);
    toWorld = ([x, y]) => [R[0][0] * x + R[0][1] * y, R[1][0] * x + R[1][1] * y, R[2][0] * x + R[2][1] * y];
    const cx = R[0][0] * mx + R[0][1] * my + (p.translation?.[0] || 0);
    side = Math.abs(cx) < 2 ? 1 : Math.sign(cx);
  } else {   // FreeSewing: drafted as the wearer's right half, mirrored copies flipped in x
    toWorld = ([x, y]) => [x, y, 0];
    side = p.mirror ? -1 : 1;
  }
  let best = cands[0], bs = -Infinity;
  for (const c of cands) {
    const w = toWorld(c);
    const s = side * w[0] + 0.6 * w[1] + 0.35 * w[2];
    if (s > bs + 1e-9) { bs = s; best = c; }
  }
  return best;
}

/** Grain vector of a panel for a mode ('straight' | 'cross' | 'bias'). */
export function panelGrain(p, mode, data) {
  const g = straightGrain(p, data);
  if (mode === 'cross') return norm2(pick(p, [rot2(g, 90), rot2(g, -90)]));
  if (mode === 'bias') return norm2(pick(p, [rot2(g, 45), rot2(g, -45)]));
  return g;
}

/**
 * Grain of every panel of a pattern export ({ panels, stitches }) for the design's grain
 * state { all: mode for skirt/bodice pieces, pieces: { name: mode } }.
 * @returns {Object<string, {mode, vec: [x, y]}>}
 */
export function pieceGrains(data, grain) {
  const out = {};
  for (const p of data.panels) {
    // a cut-only extra layer (FreeSewing lining) follows its piece
    const base = p.name.replace(/_lining$/, '');
    const mode = grainMode(grain?.pieces?.[p.name] ? p.name : base, grain);
    out[p.name] = { mode, vec: panelGrain(p, mode, data) };
  }
  return out;
}

/**
 * Where each stretch edge sits between warp and weft: cos² of its angle to the grain
 * (1 = along the warp, 0 = along the weft, 0.5 = on the bias).
 */
export const edgeWarp = (g, dx, dy) => { const l2 = dx * dx + dy * dy; if (l2 < 1e-12) return 1; const c = dx * g[0] + dy * g[1]; return c * c / l2; };

/**
 * Stretch compliance of an edge from its warp share t (see edgeWarp): warp, weft and bias
 * compliances blended with the usual orthotropic weights (bias weight sin²2θ = 4t(1-t)).
 */
export function edgeCompliance(t, cw, cf, cb) {
  const s = 4 * t * (1 - t);
  return (1 - s) * (t * cw + (1 - t) * cf) + s * cb;
}
