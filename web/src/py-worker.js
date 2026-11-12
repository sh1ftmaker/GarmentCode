/* Runs the original GarmentCode Python code inside Pyodide, off the main thread. */
const PYODIDE_VERSION = '0.26.4';
importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

let py = null;

async function init() {
  postMessage({ type: 'progress', text: 'Loading Python runtime…' });
  py = await loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/` });
  postMessage({ type: 'progress', text: 'Loading numpy, scipy…' });
  await py.loadPackage(['numpy', 'scipy', 'pyyaml', 'micropip']);
  postMessage({ type: 'progress', text: 'Installing svgpathtools…' });
  const micropip = py.pyimport('micropip');
  await micropip.install(['svgwrite', 'svgpathtools'], { deps: false });
  postMessage({ type: 'progress', text: 'Loading GarmentCode…' });
  const zip = await (await fetch(new URL('../gc_py.zip', self.location.href))).arrayBuffer();
  py.FS.mkdirTree('/gc');
  py.unpackArchive(zip, 'zip', { extractDir: '/gc' });
  py.runPython(`
import os, sys, warnings
warnings.filterwarnings('ignore')
os.chdir('/gc'); sys.path.insert(0, '/gc')
from gc_bridge import gc
`);
}

const ready = init();

const call = (expr) => py.runPython(expr);
const s = (v) => JSON.stringify(JSON.stringify(v)); // python string literal of JSON

const handlers = {
  async init() { await ready; return true; },
  design() { return JSON.parse(call('gc.design_json()')); },
  body() { return JSON.parse(call('gc.body_json()')); },
  generate({ resolution }) { return JSON.parse(call(`gc.generate(${+resolution || 1.5})`)); },
  setParam({ path, value }) { call(`gc.set_param(${s(path)}, ${s(value)})`); return true; },
  setBody({ name }) { call(`gc.set_body(${JSON.stringify(name)})`); return true; },
  setBodyParam({ key, value }) { call(`gc.set_body_param(${JSON.stringify(key)}, ${+value})`); return true; },
  randomize({ locked }) { call(`gc.randomize_locked(${s(locked || [])})`); return true; },
  setDesign({ design }) { call(`gc.set_design(${s(design)})`); return true; },
  setBodyParams({ params }) { call(`gc.set_body_params(${s(params)})`); return true; },
  presetBody({ name }) { return JSON.parse(call(`gc.preset_body(${JSON.stringify(name)})`)); },
  defaultDesign() { return JSON.parse(call('gc.default_design_json()')); },
  pieces({ res }) { return JSON.parse(call(`gc.pieces(${+res || 0.5})`)); },
  reset() { call('gc.reset()'); return true; },
  loadDesign({ text }) { call(`gc.load_design_yaml(${JSON.stringify(text)})`); return true; },
  designYaml() { return call('gc.design_yaml()'); },
  bodyYaml() { return call('gc.body_yaml()'); },
  specJson() { return call('gc.spec_json()'); },
  svg({ grains }) { return call(`gc.svg(${s(grains || {})})`); },
};

onmessage = async (e) => {
  const { id, cmd, args } = e.data;
  try {
    await ready;
    const result = await handlers[cmd](args || {});
    postMessage({ id, ok: true, result });
  } catch (err) {
    let msg = String(err && err.message || err);
    // keep the last meaningful line of a Python traceback
    const lines = msg.trim().split('\n').filter(Boolean);
    postMessage({ id, ok: false, error: lines[lines.length - 1] || msg, full: msg });
  }
};
