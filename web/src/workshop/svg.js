// The 2D pattern drawing of an editor design (the Pattern card): every panel laid flat in a
// row with its name, grain line and seam numbers.
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function patternSVG(pat) {
  const panels = pat.panels;
  if (!panels.length) return '';
  const gap = 6;
  let x = 0, H = 0;
  const placed = panels.map((p) => {
    const xs = p.boundary.map(q => q[0]), ys = p.boundary.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const o = { p, dx: x - x0, y0, y1, w: x1 - x0, h: y1 - y0 };
    x += x1 - x0 + gap; H = Math.max(H, y1 - y0);
    return o;
  });
  const W = x - gap, pad = 4;
  const seamNo = new Map();
  pat.stitches.forEach(s => { if (!seamNo.has(s.seam)) seamNo.set(s.seam, seamNo.size + 1); });
  let out = `<svg xmlns="http://www.w3.org/2000/svg" class="custom-pattern" viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad + 6}" width="100%">`;
  for (const o of placed) {
    const { p } = o;
    const T = ([px, py]) => [px + o.dx, (H - (py - o.y0)) - (H - o.h)];
    const d = p.boundary.map((q, i) => `${i ? 'L' : 'M'}${T(q).map(v => v.toFixed(2)).join(' ')}`).join('') + 'Z';
    out += `<path d="${d}" fill="#f6efe2" stroke="#3b2f25" stroke-width="0.35"/>`;
    // seam numbers at the middle of each stitched run
    for (const s of pat.stitches) for (const [nm, idx] of [[s.a, s.ia], [s.b, s.ib]]) {
      if (nm !== p.name || idx.length < 2) continue;
      const m = T(p.boundary[idx[Math.floor(idx.length / 2)]]);
      out += `<circle cx="${m[0].toFixed(2)}" cy="${m[1].toFixed(2)}" r="1.8" fill="#b5532f"/><text x="${m[0].toFixed(2)}" y="${(m[1] + 0.9).toFixed(2)}" font-size="2.4" text-anchor="middle" fill="#fff" font-family="sans-serif">${seamNo.get(s.seam)}</text>`;
    }
    const cx = o.dx + (Math.min(...p.boundary.map(q => q[0])) + o.w / 2), g = p.grain || [0, 1];
    const c = T([cx - o.dx, o.y0 + o.h / 2]);
    out += `<line x1="${(c[0] - g[0] * o.h * 0.25).toFixed(2)}" y1="${(c[1] + g[1] * o.h * 0.25).toFixed(2)}" x2="${(c[0] + g[0] * o.h * 0.25).toFixed(2)}" y2="${(c[1] - g[1] * o.h * 0.25).toFixed(2)}" stroke="#3b2f25" stroke-width="0.3" stroke-dasharray="1.5 0.8"/>`;
    out += `<text x="${c[0].toFixed(2)}" y="${(c[1] - 2).toFixed(2)}" font-size="${Math.max(2, Math.min(3.4, o.w / 8)).toFixed(2)}" text-anchor="middle" fill="#2a211a" font-family="sans-serif">${esc(p.title || p.name)}${p.fold ? ' (unfolded)' : ''}</text>`;
  }
  return out + '</svg>';
}
