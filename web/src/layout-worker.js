// Runs the nesting search (layout.js) off the main thread so the UI stays responsive.
import { autoLayout } from './layout.js';

self.onmessage = (e) => {
  const { id, set, opts } = e.data;
  try {
    self.postMessage({ id, layout: autoLayout(set, opts) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
