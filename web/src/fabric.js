// Fabric presets: simulation behaviour + look.
// Stretch is given per thread direction (0..1 sliders): `stretch` along the warp (lengthwise
// grain, parallel to the selvedge), `weft` across it (crosswise grain) and `bias` at 45°,
// where a woven fabric shears and gives the most. Knits stretch mostly crosswise.
export const FABRICS = [
  { id: 'cotton', name: 'Cotton', note: 'Medium, crisp', bend: 0.55, stretch: 0.05, weft: 0.5, bias: 0.65, friction: 0.5, roughness: 0.92, sheen: 0.2, weave: 'plain' },
  { id: 'jersey', name: 'Jersey knit', note: 'Soft, stretchy', bend: 0.3, stretch: 0.45, weft: 0.92, bias: 0.8, friction: 0.55, roughness: 0.95, sheen: 0.15, weave: 'plain' },
  { id: 'linen', name: 'Linen', note: 'Airy, crisp', bend: 0.65, stretch: 0.03, weft: 0.46, bias: 0.62, friction: 0.55, roughness: 0.97, sheen: 0.1, weave: 'plain' },
  { id: 'denim', name: 'Denim', note: 'Heavy, stiff', bend: 0.85, stretch: 0.02, weft: 0.42, bias: 0.58, friction: 0.6, roughness: 0.9, sheen: 0.1, weave: 'twill' },
  { id: 'silk', name: 'Silk', note: 'Fluid, slippery', bend: 0.12, stretch: 0.05, weft: 0.54, bias: 0.85, friction: 0.25, roughness: 0.45, sheen: 0.9, weave: 'plain' },
  { id: 'chiffon', name: 'Chiffon', note: 'Sheer, floaty', bend: 0.05, stretch: 0.08, weft: 0.58, bias: 0.87, friction: 0.3, roughness: 0.6, sheen: 0.5, weave: 'plain', opacity: 0.82 },
];
/** Rib knit, used for ribbing bands (cuffs and waistbands of knit tops) whatever the main fabric. */
export const RIB = { stretch: 0.45, weft: 0.95, bias: 0.8 };
export const SWATCHES = ['#c9d6ea', '#e9e4da', '#2f3b52', '#b5532f', '#7d9a7b', '#d9b44a', '#a8485f', '#1f1f22', '#f4f1ea', '#8c6ad8'];

const compliance = (s) => 4e-8 * Math.pow(10, 3 * s) * (s > 0.01 ? 1 : 0);
// Weft and bias span a wider range, never stiffer than the warp. Hung by one edge, an 80 cm
// strip of cotton stretches ~1% on the straight grain and ~2% on the bias, silk ~8% on the bias.
const grainCompliance = (s, warp) => Math.max(compliance(warp), 4e-8 * Math.pow(10, 3.6 * s));
/** Weft / bias stretch of a fabric state; older saves without them take the preset's. */
export function grainStretch(f) {
  const p = FABRICS.find(x => x.id === f.id);
  return { weft: f.weft ?? p?.weft ?? f.stretch, bias: f.bias ?? p?.bias ?? f.stretch };
}
/** UI slider values (0..1) -> simulation options */
export function simParams(f) {
  const { bend, stretch, friction } = f, { weft, bias } = grainStretch(f);
  return {
    bendCompliance: 2e-4 * Math.pow(10, -4 * bend),
    stretchCompliance: compliance(stretch),     // along the warp
    weftCompliance: grainCompliance(weft, stretch),
    biasCompliance: grainCompliance(bias, stretch),
    ribCompliance: [compliance(RIB.stretch), grainCompliance(RIB.weft, RIB.stretch), grainCompliance(RIB.bias, RIB.stretch)],
    friction,
  };
}
