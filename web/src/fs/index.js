// FreeSewing designs in the app: registry + the calls main.js makes instead of the
// Pyodide bridge when a FreeSewing design is active. FreeSewing itself (MIT,
// https://freesewing.eu) is bundled by tools/build_site.sh into ./vendor/ and loaded
// on first use.
//
// Adding a design:
//  1. cd web && npm install --save-dev --save-exact @freesewing/<design>@<version>, and
//     export its class from tools/freesewing-entry.mjs.
//  2. Write src/fs/<design>.js like bruce.js: id/name/icon, `design` (options as
//     { v, range, type, name, help }), options(), measurements() (GarmentCode cm ->
//     FreeSewing mm), spec() (pieces: fold/mirror copies; seams: chains of edges by
//     seam-path operation number; labels: waist edges -> 'lower_interface'),
//     placement() ((x, y) on the piece -> 3D; hipSurface() in convert.js covers lower-body
//     pieces, place.js the torso, arms, head and bands: see hugo.js) and attachLevels().
//     Pieces that are hard to place alone (sleeve caps, hoods, bands) can `follow` the
//     pieces they are sewn to. Tops built on Brian share tops.js (measurements, torso).
//  3. Register it in FS_DESIGNS below. A template card appears under "FreeSewing".
//  Check the seam table by drawing the converted panels with their stitches.
import { convertDraft } from './convert.js';
import * as bruce from './bruce.js';
import * as hugo from './hugo.js';
import * as teagan from './teagan.js';
import * as sven from './sven.js';
import * as aaron from './aaron.js';

export const FS_DESIGNS = { bruce, hugo, teagan, sven, aaron };
let vendor = null;
const loadVendor = () => (vendor ||= import('./vendor/freesewing.js').catch((e) => {
  vendor = null;
  throw new Error(`FreeSewing is not available in this build (${e.message})`);
}));

const clone = (o) => JSON.parse(JSON.stringify(o));
export const fsDefaults = (id) => clone(FS_DESIGNS[id].design);
export const isFS = (id) => !!id && id in FS_DESIGNS;

async function draft(id, d, m, body, { relaxed = false, complete = false, sa = 0 } = {}) {
  const A = FS_DESIGNS[id], lib = await loadVendor();
  const Design = lib[A.exportName];
  const fsm = A.measurements(m, body);
  const pattern = new Design({ ...(A.settings || {}), measurements: fsm, sa, complete, options: A.options(d, { relaxed }) }).draft();
  const logs = pattern.store.logs || {};
  return { pattern, fsm, warnings: [...(logs.warn || []), ...(logs.error || [])] };
}

/**
 * Pattern JSON for the app (same shape as gc_bridge's generate/pieces).
 * drape=true drafts the relaxed copy and adds 3D placement; otherwise the real pattern.
 */
export async function fsPattern(id, d, m, body, { res = 1.5, drape = true } = {}) {
  const A = FS_DESIGNS[id];
  const { pattern, fsm, warnings } = await draft(id, d, m, body, { relaxed: drape, complete: true });   // complete: grainlines (same outlines)
  const o = A.options(d, { relaxed: drape });
  const out = convertDraft(pattern, A.spec(o), {
    res,
    place: drape ? A.placement(pattern, m, body) : null,
    attachLevels: A.attachLevels(pattern, m),
    layers: !drape,
  });
  out.warnings = warnings;
  if (A.lift != null) out.lift = A.lift;   // how far above its placement the drape starts (garment.js)
  out.fs = { design: A.name, measurements: fsm, options: o };
  return out;
}

const SVG_STYLE = `<style>path{fill:none;stroke:#555;stroke-width:.4}path.fabric{stroke:#222;stroke-width:.7}
path.sa{stroke-dasharray:2 1.5;stroke-width:.4}path.hidden,.hidden{display:none}path.note,path.mark{stroke:#2a7de1}
path.dimension{stroke:#2a7de1;stroke-width:.3}path.interfacing,path.lining{stroke:#999}
text{font-family:Inter,sans-serif;font-size:5px;fill:#333;stroke:none}text.center{text-anchor:middle}text.text-sm{font-size:4px}
text.text-lg{font-size:7px}text.text-xl{font-size:9px}text.fill-note{fill:#2a7de1}
.text-4xl{font-size:14px}.text-2xl{font-size:10px}circle{fill:none;stroke:#555;stroke-width:.4}</style>`;
/** FreeSewing's own drawing of the real pattern (with seam allowance and annotations). */
export async function fsSVG(id, d, m, body) {
  const { pattern } = await draft(id, d, m, body, { complete: true, sa: 10 });
  // FreeSewing's texts are i18n keys (translated by its web front-end): spell them out
  const words = (k) => k.replace(/([A-Z])/g, ' $1').toLowerCase();
  return pattern.render().replace(/<style[^>]*>[\s\S]*?<\/style>/, SVG_STYLE)
    .replace(/<tspan([^>]*)>([^<]*[a-z-]+:[a-zA-Z]+[^<]*)<\/tspan>/g, (_, attrs, text) =>
      `<tspan${attrs}>${text.replace(/[a-z-]+:([a-zA-Z]+)/g, (m, k) => words(k)).replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/^ ?(\w)/, (m, c) => c.toUpperCase())}</tspan>`);
}

/** FreeSewing settings (design, measurements in mm, options) for the "specification" export. */
export async function fsSettings(id, d, m, body) {
  const A = FS_DESIGNS[id], lib = await loadVendor();
  return { design: `@freesewing/${id}`, version: lib.version, ...(A.settings || {}), measurements: A.measurements(m, body), options: A.options(d), sa: 0 };
}

/** Random values inside each option's range (locked paths keep theirs). */
export function fsRandomize(d, locked = new Set()) {
  const out = clone(d);
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      const p = [...path, k];
      if (v && typeof v === 'object' && v.type === 'bool') {
        if (!locked.has(p.join('.'))) v.v = Math.random() < 0.5;
      } else if (v && typeof v === 'object' && 'v' in v && 'range' in v) {
        if (locked.has(p.join('.'))) continue;
        const [lo, hi] = v.range;
        v.v = v.type === 'int' ? Math.round(lo + Math.random() * (hi - lo)) : Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
      } else if (v && typeof v === 'object') walk(v, p);
    }
  };
  walk(out, []);
  return out;
}
