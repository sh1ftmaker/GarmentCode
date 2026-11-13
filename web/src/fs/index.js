// FreeSewing designs in the app: the whole FreeSewing collection, plus the calls main.js
// makes instead of the Pyodide bridge when a FreeSewing design is active. FreeSewing itself
// (MIT, https://freesewing.eu) is bundled by tools/build_site.sh into ./vendor/ (one chunk
// per design) and loaded on first use.
//
// Every design in catalog.js drafts from the body's measurements (measure.js), with its
// options from meta/<id>.json, and is cut from its outlines and FreeSewing's cut list
// (generic.js): pattern, cutting layout and exports. Designs with an adapter (bruce.js,
// hugo.js, ...) also know how the pieces are sewn and placed on the body, so they drape.
//
// Adding a 3D adapter for a design:
//  1. Write src/fs/<design>.js like bruce.js: id/name/icon, `design` (options as
//     { v, range, type, name, help }), options(), measurements() (GarmentCode cm ->
//     FreeSewing mm; fsMeasurements() in measure.js has them all), spec(options, draft) (pieces:
//     fold/mirror copies; seams: chains of edges by seam-path operation number; labels:
//     waist edges -> 'lower_interface'), placement() ((x, y) on the piece -> 3D;
//     hipSurface() in convert.js covers lower-body pieces, place.js the torso, arms, head
//     and bands: see hugo.js) and attachLevels(). Pieces that are hard to place alone
//     (sleeve caps, hoods, bands) can `follow` the pieces they are sewn to. Tops built on
//     Brian share tops.js (measurements, torso).
//  2. Register it in ADAPTERS below.
//  Check the seam table by drawing the converted panels with their stitches.
// Upgrading FreeSewing: bump the @freesewing/* versions in package.json, run
// `node tools/gen_fs_catalog.mjs`, and update the loaders in tools/freesewing-entry.mjs.
import { convertDraft } from './convert.js';
import { genericPieces } from './generic.js';
import { fsMeasurements, pick } from './measure.js';
import { FS_CATALOG } from './catalog.js';
import * as bruce from './bruce.js';
import * as hugo from './hugo.js';
import * as teagan from './teagan.js';
import * as sven from './sven.js';
import * as aaron from './aaron.js';
import * as simon from './simon.js';
import * as shelly from './shelly.js';
import * as diana from './diana.js';
import * as titan from './titan.js';
import * as charlie from './charlie.js';
import * as penelope from './penelope.js';
import * as uma from './uma.js';
import * as brian from './brian.js';
import * as huey from './huey.js';
import * as yuri from './yuri.js';
import * as wahid from './wahid.js';
import * as bent from './bent.js';
import * as jaeger from './jaeger.js';
import * as carlton from './carlton.js';
import * as carlita from './carlita.js';
import * as jett from './jett.js';
import * as devon from './devon.js';

/** Designs with a 3D adapter (seams + placement). */
// diana.js drapes cleanly, but its cowl settles as a high funnel neck instead of the
// design's draped neckline, so Diana stays pattern-only until that looks right.
void diana;
export const ADAPTERS = { bruce, hugo, teagan, sven, aaron, simon, shelly, titan, charlie, penelope, uma, brian, huey, yuri, wahid, bent, jaeger, carlton, carlita, jett, devon };
// Drafted but without any usable outline in the browser (Gozer draws its ghost only as text)
const UNSUPPORTED = new Set(['gozer']);
const CATALOG = Object.fromEntries(FS_CATALOG.filter(d => !UNSUPPORTED.has(d.id)).map(d => [d.id, d]));

let vendor = null;
const loadVendor = () => (vendor ||= import('./vendor/freesewing.js').catch((e) => {
  vendor = null;
  throw new Error(`FreeSewing is not available in this build (${e.message})`);
}));
const classes = new Map();
async function designClass(id) {
  if (!classes.has(id)) {
    const lib = await loadVendor();
    classes.set(id, lib.load(id).catch((e) => { classes.delete(id); throw e; }));
  }
  return classes.get(id);
}

// ------------------------------------------------------------------ catalogue
const KIND = [   // FreeSewing tags -> the app's categories (first match wins)
  ['dresses', 'Dresses'], ['onePiece', 'One-pieces'], ['overalls', 'One-pieces'], ['swimwear', 'Swim & underwear'],
  ['underwear', 'Swim & underwear'], ['coats', 'Jackets & coats'], ['skirts', 'Skirts'], ['trousers', 'Trousers & shorts'],
  ['bottoms', 'Trousers & shorts'], ['blocks', 'Blocks'], ['tops', 'Tops'], ['hats', 'Accessories'], ['bags', 'Accessories'],
  ['toys', 'Toys'], ['costumes', 'Costumes'], ['accessories', 'Accessories'], ['historical', 'Historical'],
];
const KIND_OVERRIDE = { sophie: 'Dresses', otis: 'One-pieces', jane: 'Historical', tiberius: 'Historical', lunetius: 'Historical', walburga: 'Historical', bob: 'Accessories' };
function kindOf(d) {
  if (KIND_OVERRIDE[d.id]) return KIND_OVERRIDE[d.id];
  for (const [t, k] of KIND) if (d.tags.includes(t)) return k;
  return 'Other';
}
const firstWord = (n) => n.split(' ')[0];
/**
 * Everything the template picker shows about a design:
 * { id, name, short, designers, difficulty, tags, kind, description, url, drape, icon? }
 */
export function fsInfo(id) {
  const c = CATALOG[id], A = ADAPTERS[id];
  if (!c && !A) return null;
  const name = A?.name || c.name;
  return {
    id, name,
    short: A?.short || name.replace(new RegExp(`^${firstWord(name)}\\s+`), '').replace(/^the\s+/i, '').replace(/^./, s => s.toUpperCase()),
    designer: firstWord(name),
    designers: c?.designers || (A?.author ? [A.author] : []),
    difficulty: c?.difficulty || 0,
    tags: c?.tags || [],
    kind: c ? kindOf(c) : 'Tops',
    description: c?.description || '',
    url: A?.url || `https://freesewing.eu/designs/${id}/`,
    drape: !!A,
    icon: A?.icon || null,
  };
}
export const fsList = () => Object.keys(CATALOG).map(fsInfo);
export const isFS = (id) => !!id && (id in CATALOG || id in ADAPTERS);
export const hasDrape = (id) => !!ADAPTERS[id];

// design metadata (options, measurements, part names) of designs without an adapter
const metas = new Map();
export async function ensureFS(id) {
  if (ADAPTERS[id] || metas.has(id)) return;
  const res = await fetch(new URL(`./meta/${id}.json`, import.meta.url));
  if (!res.ok) throw new Error(`Design ${id} is not available`);
  metas.set(id, await res.json());
}
const metaOf = (id) => {
  const m = metas.get(id);
  if (!m) throw new Error(`internal: ensureFS('${id}') first`);
  return m;
};

const clone = (o) => JSON.parse(JSON.stringify(o));
export const fsDefaults = (id) => clone(ADAPTERS[id] ? ADAPTERS[id].design : metaOf(id).design);

/** App parameter tree -> FreeSewing options, for designs without an adapter. */
function genericOptions(d) {
  const o = {};
  for (const grp of Object.values(d)) for (const [k, n] of Object.entries(grp)) {
    if (!n || typeof n !== 'object' || !('v' in n)) continue;
    o[k] = n.fs === 'pct' ? n.v / 100 : n.fs === 'mm' ? n.v * 10 : n.v;
  }
  return o;
}
/** The design's adapter, or a stand-in with the generic measurements and options. */
function adapterOf(id) {
  if (ADAPTERS[id]) return ADAPTERS[id];
  const meta = metaOf(id);
  const names = [...meta.measurements, ...meta.optionalMeasurements];
  return {
    id, name: fsInfo(id).name, settings: { expand: true }, generic: true, meta,
    measurements: (m, body) => pick(fsMeasurements(m, body), names),
    options: (d) => genericOptions(d),
  };
}

async function draft(id, d, m, body, { relaxed = false, complete = false, sa = 0 } = {}) {
  await ensureFS(id);
  const A = adapterOf(id), Design = await designClass(id);
  const fsm = A.measurements(m, body);
  const pattern = new Design({ ...(A.settings || {}), measurements: fsm, sa, complete, options: A.options(d, { relaxed }) }).draft();
  const logs = pattern.store.logs || {};
  return { A, pattern, fsm, warnings: [...(logs.warn || []), ...(logs.error || [])].map(String) };
}

/**
 * Pattern JSON for the app (same shape as gc_bridge's generate/pieces).
 * drape=true drafts the relaxed copy and adds 3D placement; otherwise the real pattern.
 * Designs without an adapter come back with `noDrape: true` (pieces only); `material`
 * picks which of their materials' pieces are cut (default: the main fabric).
 */
export async function fsPattern(id, d, m, body, { res = 1.5, drape = true, material = null } = {}) {
  const { A, pattern, fsm, warnings } = await draft(id, d, m, body, { relaxed: drape, complete: true });
  let out;
  if (A.generic) {
    out = genericPieces(pattern, A.meta, { res: drape ? Math.max(res, 0.5) : 0.5, material });
    out.noDrape = true;
  } else {
    const o = A.options(d, { relaxed: drape });
    out = convertDraft(pattern, A.spec(o, pattern), {   // spec may look up edges by point name
      res,
      place: drape ? A.placement(pattern, m, body) : null,
      attachLevels: A.attachLevels(pattern, m),
      layers: !drape,
    });
    if (A.lift != null) out.lift = A.lift;   // how far above its placement the drape starts (garment.js)
    if (A.others) out.others = A.others;   // pieces cut from other materials (listed, not laid out)
  }
  out.warnings = warnings;
  out.fs = { design: A.name, measurements: fsm, options: A.options(d) };
  return out;
}

// Scoped to the drawing: an inline SVG's <style> applies to the whole page (it used to
// restyle the cutting layout's labels)
const SVG_CSS = `path{fill:none;stroke:#555;stroke-width:.4}path.fabric{stroke:#222;stroke-width:.7}
path.sa{stroke-dasharray:2 1.5;stroke-width:.4}path.hidden,.hidden{display:none}path.note,path.mark{stroke:#2a7de1}
path.dimension{stroke:#2a7de1;stroke-width:.3}path.interfacing,path.lining{stroke:#999}
text{font-family:Inter,sans-serif;font-size:5px;fill:#333;stroke:none}text.center{text-anchor:middle}text.text-sm{font-size:4px}
text.text-lg{font-size:7px}text.text-xl{font-size:9px}text.fill-note{fill:#2a7de1}
.text-4xl{font-size:14px}.text-2xl{font-size:10px}circle{fill:none;stroke:#555;stroke-width:.4}`;
const SVG_STYLE = `<style>${SVG_CSS.replace(/(^|\})\s*([^{}]+)\{/g, (m, b, sel) => `${b}${sel.split(',').map(x => `svg.fs-pattern ${x.trim()}`).join(',')}{`)}</style>`;
/** FreeSewing's own drawing of the real pattern (with seam allowance and annotations). */
export async function fsSVG(id, d, m, body) {
  const { pattern } = await draft(id, d, m, body, { complete: true, sa: 10 });
  // FreeSewing's texts are i18n keys (translated by its web front-end): spell them out
  const words = (k) => k.replace(/([A-Z])/g, ' $1').toLowerCase();
  return pattern.render().replace(/<style[^>]*>[\s\S]*?<\/style>/, SVG_STYLE).replace(/<svg\b/, '<svg class="fs-pattern"')
    .replace(/<tspan([^>]*)>([^<]*[a-z-]+:[a-zA-Z]+[^<]*)<\/tspan>/g, (_, attrs, text) =>
      `<tspan${attrs}>${text.replace(/[a-z-]+:([a-zA-Z]+)/g, (m, k) => words(k)).replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/^ ?(\w)/, (m, c) => c.toUpperCase())}</tspan>`);
}

/** FreeSewing settings (design, measurements in mm, options) for the "specification" export. */
export async function fsSettings(id, d, m, body) {
  await ensureFS(id);
  const A = adapterOf(id), lib = await loadVendor();
  return { design: `@freesewing/${id}`, version: lib.version, ...(A.settings || {}), measurements: A.measurements(m, body), options: A.options(d), sa: 0 };
}

/** Random values inside each option's range (locked paths keep theirs). */
export function fsRandomize(d, locked = new Set()) {
  const out = clone(d);
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      const p = [...path, k];
      if (locked.has(p.join('.')) || (!path.length && k.startsWith('advanced'))) continue;   // keep expert settings
      if (v && typeof v === 'object' && v.type === 'bool') v.v = Math.random() < 0.5;
      else if (v && typeof v === 'object' && v.type === 'select') v.v = v.range[Math.floor(Math.random() * v.range.length)];
      else if (v && typeof v === 'object' && 'v' in v && 'range' in v) {
        const [lo, hi] = v.range;
        v.v = v.type === 'int' ? Math.round(lo + Math.random() * (hi - lo)) : Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
      } else if (v && typeof v === 'object') walk(v, p);
    }
  };
  walk(out, []);
  return out;
}
