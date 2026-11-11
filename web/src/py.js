// RPC client for the Pyodide worker that runs GarmentCode.
const worker = new Worker(new URL('./py-worker.js', import.meta.url));
let nextId = 0;
const pending = new Map();
const progressListeners = new Set();
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'progress') { progressListeners.forEach(f => f(m.text)); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.ok ? p.resolve(m.result) : p.reject(Object.assign(new Error(m.error), { full: m.full }));
};
export function onPyProgress(f) { progressListeners.add(f); }
export function py(cmd, args) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, cmd, args });
  });
}
