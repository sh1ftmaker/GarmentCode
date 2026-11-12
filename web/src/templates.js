// Starter designs: overrides applied on top of the start design (GarmentCode's t-shirt example).
export const TEMPLATES = [
  { id: 'tee', name: 'Classic T-shirt', set: {} },
  { id: 'longsleeve', name: 'Long-sleeve top', set: {
    'sleeve.sleeveless': false, 'sleeve.length': 1.0, 'sleeve.end_width': 0.6, 'shirt.length': 1.3 } },
  { id: 'hoodie', name: 'Hoodie (GarmentCode)', set: {
    'sleeve.sleeveless': false, 'sleeve.length': 1.0, 'sleeve.end_width': 0.7, 'sleeve.cuff.type': 'CuffBand',
    'sleeve.cuff.cuff_len': 0.1, 'collar.component.style': 'Hood2Panels', 'shirt.length': 1.75, 'shirt.width': 1.1,
    'shirt.hem_band.enable': true, 'shirt.pocket.type': 'KangarooPocket' } },
  { id: 'ziphoodie', name: 'Zip hoodie, open (GarmentCode)', set: {
    'sleeve.sleeveless': false, 'sleeve.length': 1.0, 'sleeve.end_width': 0.7, 'sleeve.cuff.type': 'CuffBand',
    'sleeve.cuff.cuff_len': 0.1, 'collar.component.style': 'Hood2Panels', 'shirt.length': 1.75, 'shirt.width': 1.1,
    'shirt.hem_band.enable': true, 'shirt.pocket.type': 'KangarooPocket', 'shirt.open_front': true } },
  { id: 'sweatshirt', name: 'Sweatshirt (GarmentCode)', set: {
    'sleeve.sleeveless': false, 'sleeve.length': 1.0, 'sleeve.end_width': 0.7, 'sleeve.cuff.type': 'CuffBand',
    'sleeve.cuff.cuff_len': 0.1, 'shirt.length': 1.6, 'shirt.width': 1.1, 'shirt.hem_band.enable': true } },
  { id: 'aline', name: 'A-line dress', set: {
    'meta.upper': 'FittedShirt', 'meta.wb': null, 'meta.bottom': 'SkirtCircle', 'flare-skirt.suns': 0.45,
    'flare-skirt.length': 0.55, 'sleeve.sleeveless': true, 'collar.f_collar': 'VNeckHalf', 'collar.fc_depth': 0.8 } },
  { id: 'sundress', name: 'Square-neck sundress', set: {
    'meta.upper': 'FittedShirt', 'meta.wb': 'FittedWB', 'meta.bottom': 'SkirtCircle', 'sleeve.sleeveless': true,
    'collar.f_collar': 'SquareNeckHalf', 'flare-skirt.suns': 0.75, 'flare-skirt.length': 0.4 } },
  { id: 'maxi', name: 'Hooded maxi dress', set: {
    'meta.upper': 'Shirt', 'meta.wb': null, 'meta.bottom': 'Skirt2', 'skirt.length': 0.9, 'skirt.flare': 8,
    'collar.component.style': 'Hood2Panels', 'sleeve.sleeveless': false, 'sleeve.length': 0.7 } },
  { id: 'pencil', name: 'Pencil skirt', set: {
    'meta.upper': null, 'meta.wb': 'FittedWB', 'meta.bottom': 'PencilSkirt', 'pencil-skirt.length': 0.55,
    'pencil-skirt.back_slit': 0.3 } },
  { id: 'tiered', name: 'Tiered skirt', set: {
    'meta.upper': null, 'meta.wb': 'StraightWB', 'meta.bottom': 'SkirtLevels', 'levels-skirt.num_levels': 3,
    'levels-skirt.level_ruffle': 1.4, 'levels-skirt.length': 0.8, 'levels-skirt.base': 'Skirt2' } },
  { id: 'trousers', name: 'Wide-leg trousers', set: {
    'meta.upper': null, 'meta.wb': 'StraightWB', 'meta.bottom': 'Pants', 'pants.width': 1.4, 'pants.length': 0.9,
    'pants.flare': 1.15 } },
  { id: 'joggers', name: 'Joggers', set: {
    'meta.upper': null, 'meta.wb': 'StraightWB', 'meta.bottom': 'Pants', 'pants.length': 0.95, 'pants.width': 1.1,
    'pants.flare': 0.6, 'pants.cuff.type': 'CuffBand', 'pants.cuff.cuff_len': 0.08, 'pants.cuff.top_ruffle': 1.6 } },
  { id: 'shorts', name: 'Shorts', set: {
    'meta.upper': null, 'meta.wb': 'StraightWB', 'meta.bottom': 'Pants', 'pants.length': 0.3, 'pants.width': 1.1 } },
];

export function applyTemplate(base, tpl) {
  const d = JSON.parse(JSON.stringify(base));
  for (const [path, v] of Object.entries(tpl.set)) {
    let node = d;
    for (const k of path.split('.')) node = node[k];
    node.v = v;
  }
  return d;
}
