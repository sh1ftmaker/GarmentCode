// Pattern exports at true scale.
//
// Everything is first turned into drawing primitives in cm (fabric or paper-sheet
// coordinates, y down), then written out as SVG (viewBox in cm, width/height in cm), PDF
// (jsPDF, unit mm: 1 cm = 10 units) or DXF (mm).
//
// Two kinds of drawing:
//  - the cutting layout: every piece as it lies on the fabric (bolt outline, fold, selvedges);
//  - the pattern sheet: one piece of each kind (mirror pairs and repeats once, symmetric
//    pieces as a half "on fold" when the fabric is folded), packed for printing. That is what
//    a home sewist prints, tapes together and cuts out: tiled on A4 / US Letter with
//    overlaps, alignment marks and a test square, or on A0 / a 36-inch plotter roll.
import { placed, xf, pieceSize, foldX, autoLayout, regions, fabricToBuy } from './layout.js';
import { cutText } from './pieces.js';

// Douglas-Peucker: drop points closer than tol (cm) to the simplified outline
function simplify(pts, tol = 0.03) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  const stack = [[0, pts.length - 1]];
  keep[0] = keep[pts.length - 1] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9;
    let far = -1, fd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / l;
      if (d > fd) { fd = d; far = k; }
    }
    if (far > 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// ------------------------------------------------------------------ geometry helpers
function inside(x, y, pts) {
  let o = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) o = !o;
  }
  return o;
}
function edgeDist(x, y, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return d;
}
const bboxOf = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
/** Roomiest point inside a polygon (approximate pole of inaccessibility) and its clearance. */
function anchor(pts) {
  const sp = simplify(pts, 0.2);
  const [x0, y0, x1, y1] = bboxOf(sp);
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0 };
  let cx = best.x, cy = best.y, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
  for (let pass = 0; pass < 3; pass++) {
    const N = pass ? 8 : 18;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const x = cx - hw + 2 * hw * i / N, y = cy - hh + 2 * hh * j / N;
      if (!inside(x, y, sp)) continue;
      const r = edgeDist(x, y, sp);
      if (r > best.r) best = { x, y, r };
    }
    cx = best.x; cy = best.y; hw /= 4; hh /= 4;
  }
  return best;
}
/** Interval [t0, t1] of the line p + t*dir inside the polygon, around t = 0. */
function chord(pts, p, dir) {
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
    const u = ((a[0] - p[0]) * dir[1] - (a[1] - p[1]) * dir[0]) / den;
    if (u < 0 || u > 1) continue;
    if (t >= 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
  }
  return [lo === -Infinity ? 0 : lo, hi === Infinity ? 0 : hi];
}
const textW = (s, size) => s.length * size * 0.52;   // Helvetica, rough

// ------------------------------------------------------------------ primitives
const baseName = (name) => name.replace(/\s*\((left|right)\)$/, '');
function itemLines(set, layout, it, piece, g) {
  if (layout.sheet) {
    const lines = [g ? g.name : baseName(piece.name), g ? cutText(g, { folded: layout.folded }) : 'Cut 1'];
    if (g && g.mirrored) {
      const side = (piece.name.match(/\((left|right)\)$/) || [])[1];
      lines.push(`${side ? `${side[0].toUpperCase()}${side.slice(1)} piece shown; ` : ''}flip the pattern for the other`);
    } else if (g && g.count > 1 && !g.sym) lines.push('All pieces with the pattern face up.');
    return lines;
  }
  if (it.fold) return [baseName(piece.name), 'Cut 1 on fold'];
  if (it.layers > 1) {
    const names = it.covers.map(id => set.pieces.find(p => p.id === id)?.name || id);
    const same = names.every(n => baseName(n) === baseName(names[0]));
    return [same ? baseName(names[0]) : names.map(baseName).join(' + '), (g?.sym ? 'Cut 2: both layers' : 'Cut 2: both layers (mirrored pair)')];
  }
  const lines = [piece.name, layout.folded ? 'Cut 1, single layer' : 'Cut 1'];
  if (piece.flip) lines[1] += ' (pattern turned over)';
  return lines;
}

/**
 * Drawing primitives of a layout (fabric or pattern sheet), in cm.
 * Each primitive belonging to a piece carries `id` = the layout item id.
 */
export function primitives(set, layout, { sewLines = true, title = '', note = set.note || '', dy = 0 } = {}) {
  const prims = [];
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  const groups = Object.fromEntries((set.groups || []).map(g => [g.id, g]));
  const sa = set.sa || 0;
  for (const it0 of layout.items) {
    const piece = byId[it0.piece];
    if (!piece) continue;
    const it = dy ? { ...it0, y: it0.y + dy } : it0;
    const id = it.id;
    const g = groups[piece.group];
    const outline = placed(piece, it);
    prims.push({ k: 'cut', pts: simplify(outline), id, closed: true });
    if (sewLines && sa > 0) prims.push({ k: 'sew', pts: simplify(placed(piece, it, 'sew')), id, closed: true });
    const fx = it.fold ? foldX(piece, it) : null;
    const keep = (q) => fx == null || q[0] >= fx - 0.01;

    // place-on-fold marking: the fold edge, a bracket with arrows and the words
    if (fx != null) {
      const ys = outline.filter(([x]) => Math.abs(x - fx) < 0.02).map(q => q[1]);
      const y1 = Math.min(...ys), y2 = Math.max(...ys);
      prims.push({ k: 'fold', pts: [[fx, y1], [fx, y2]], id });
      const L = y2 - y1;
      if (L > 8) {
        const inset = Math.min(6, L * 0.15), bx = fx + Math.min(3, sa + 2);
        const a = y1 + inset, b = y2 - inset;
        prims.push({ k: 'foldbr', pts: [[fx + 0.3, a], [bx, a], [bx, b], [fx + 0.3, b]], id });
        for (const y of [a, b]) prims.push({ k: 'foldbr', pts: [[fx + 1.1, y - 0.5], [fx + 0.3, y], [fx + 1.1, y + 0.5]], id });
        const fs = Math.min(1.1, L / 14);
        prims.push({ k: 'text', x: bx + 0.4 + fs * 0.75, y: (a + b) / 2, s: 'PLACE ON FOLD', size: fs, anchor: 'middle', rot: -90, bold: true, id });
      }
    }

    // grainline + label block around the roomiest point of the piece
    const an = anchor(outline);
    const up = (() => { const a = xf(piece, it, [0, 0]), b = xf(piece, it, [0, 1]); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; })();
    const lines = itemLines(set, layout, it, piece, g);
    const extra = [];
    if (piece.grainMode === 'bias') extra.push('Cut on the bias (45°)');
    else if (piece.grainMode === 'cross') extra.push('Cut on the cross grain');
    if (note) extra.push(note);
    if (layout.sheet) extra.push(sa > 0 ? `Seam allowance ${sa} cm included` : 'No seam allowance included');
    const sizes = [1, 0.62, 0.5, 0.5, 0.5, 0.5].slice(0, lines.length + extra.length);
    const all = [...lines, ...extra];
    const [hl, hr] = chord(outline, [an.x, an.y], [1, 0]);
    const span = hr - hl;
    let size = Math.max(0.6, Math.min(2.0, an.r * 0.32, span / 9));
    const widest = () => Math.max(...all.map((s, i) => textW(s, size * sizes[i])));
    const cross = Math.abs(up[0]) > 0.5;
    let gx = an.x, tx;
    if (!cross) {
      gx = Math.max(an.x + hl + Math.min(2, span * 0.1), an.x - widest() / 2 - 0.6, fx != null ? Math.min(fx + 6, an.x + hr - 2) : -Infinity);
      tx = gx + 0.8;
      const room = an.x + hr - 0.6 - tx;
      if (widest() > room) size = Math.max(0.45, size * room / widest());
    } else tx = an.x + 0.8;
    // grainline
    const gp = [gx, an.y];
    const [g0, g1] = chord(outline, gp, up);
    const len = (g1 - g0) * 0.72, mid = (g0 + g1) / 2;
    const A = [gp[0] + up[0] * (mid - len / 2), gp[1] + up[1] * (mid - len / 2)], B = [gp[0] + up[0] * (mid + len / 2), gp[1] + up[1] * (mid + len / 2)];
    prims.push({ k: 'grain', pts: [A, B], id });
    const ah = Math.min(1.6, len * 0.12), aw = ah * 0.55;
    for (const [tip, s] of [[A, -1], [B, 1]]) {
      const bx = tip[0] - s * up[0] * ah, by = tip[1] - s * up[1] * ah;
      prims.push({ k: 'grain', pts: [[bx - up[1] * aw, by + up[0] * aw], tip, [bx + up[1] * aw, by - up[0] * aw]], id });
    }
    if (len > 12 && !cross) prims.push({ k: 'text', x: gx - 0.35, y: an.y, s: 'GRAIN', size: Math.min(0.7, size * 0.5), anchor: 'middle', rot: -90, id, muted: true });
    // text block, vertically centred on the anchor
    const hs = all.map((_, i) => size * sizes[i] * 1.25);
    let y = (cross ? an.y + 1.5 : an.y) - hs.reduce((a, b) => a + b, 0) / 2 + hs[0] * 0.75;
    const block = [tx - 0.4, y - hs[0], tx + widest() + 0.4, y];
    all.forEach((s, i) => {
      prims.push({ k: 'text', x: tx, y, s, size: size * sizes[i], anchor: 'start', bold: i === 0, id, role: i === 0 ? 'name' : 'info' });
      block[3] = y + 0.4;
      y += hs[i + 1] ?? 0;
    });

    // notches and seam numbers
    if (sewLines) {
      for (const n of piece.notches) {
        const a0 = [n.p[0] + n.n[0] * sa, n.p[1] + n.n[1] * sa];
        const a1 = [n.p[0] + n.n[0] * (sa - Math.min(0.8, sa > 0 ? sa * 0.6 : 0.6)), n.p[1] + n.n[1] * (sa - Math.min(0.8, sa > 0 ? sa * 0.6 : 0.6))];
        const q0 = xf(piece, it, a0), q1 = xf(piece, it, a1);
        if (keep(q0) && keep(q1)) prims.push({ k: 'notch', pts: [q0, q1], id });
      }
      const useGroup = g && g.seamLabels && (layout.sheet || it.layers > 1) && g.members[0].id === piece.id;
      const labels = useGroup ? g.seamLabels.map(s => ({ p: s.p, s: s.seams.join('/') })) : piece.seamLabels.map(s => ({ p: s.p, s: String(s.seam) }));
      for (const s of labels) { const q = xf(piece, it, s.p); if (!keep(q)) continue; if (fx != null && q[0] < fx + 1.5) q[0] = fx + 1.5;
        if (q[0] > block[0] - 1 && q[0] < block[2] + 1 && q[1] > block[1] - 0.9 && q[1] < block[3] + 0.9) {   // keep clear of the label block
          q[1] = q[1] - block[1] < block[3] - q[1] ? block[1] - 1 : block[3] + 1.1;
        }
        prims.push({ k: 'text', x: q[0], y: q[1], s: s.s, size: 0.9, anchor: 'middle', id, role: 'seam' }); }
    }
  }
  return prims;
}

/** Bolt outline, selvedges, fold and a length ruler for the cutting layout. */
export function fabricPrims(set, layout, { length } = {}) {
  const W = layout.width, L = length ?? Math.ceil(layout.length + 2);
  const out = [];
  const { split } = regions(set, layout);
  const rect = (x0, y0, x1, y1) => ({ k: 'frame', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true });
  if (layout.folded && split > 0) {
    const Lf = layout.items.some(it => it.region === 'open') ? split : L;
    out.push(rect(0, 0, W / 2, Lf));
    out.push({ k: 'fold', pts: [[0, 0], [0, Lf]] });
    out.push({ k: 'text', x: -0.8, y: Lf / 2, s: `FOLD (fabric folded in half lengthwise, ${W / 2} cm wide)`, size: 1.2, anchor: 'middle', rot: -90, muted: true });
    out.push({ k: 'text', x: W / 2 + 4.6, y: Lf / 2, s: 'SELVEDGES', size: 1.2, anchor: 'middle', rot: 90, muted: true });
    if (Lf < L) {
      out.push(rect(0, split, W, L));
      out.push({ k: 'text', x: W / 2, y: split + 1.6, s: 'Open the fabric out: single layer, full width', size: 1.1, anchor: 'middle', muted: true });
      out.push({ k: 'text', x: W + 4.6, y: (split + L) / 2, s: 'SELVEDGE', size: 1.2, anchor: 'middle', rot: 90, muted: true });
    }
  } else {
    out.push(rect(0, 0, W, L));
    out.push({ k: 'text', x: -0.8, y: L / 2, s: 'SELVEDGE', size: 1.2, anchor: 'middle', rot: -90, muted: true });
    out.push({ k: 'text', x: W + 4.6, y: L / 2, s: 'SELVEDGE', size: 1.2, anchor: 'middle', rot: 90, muted: true });
  }
  for (let y = 0; y <= L; y += 10) {   // ruler along the right-hand edge, cm from the cut end
    const x = layout.folded && split > 0 && y <= split ? W / 2 : W;
    out.push({ k: 'ruler', pts: [[x, y], [x + (y % 50 ? 1 : 2), y]] });
    if (y % 50 === 0 && y) out.push({ k: 'text', x: x + 2.4, y: y + 0.4, s: `${y}`, size: 1, anchor: 'start', muted: true });
  }
  return out;
}

const STYLE = {
  cut: { stroke: '#1d1b18', width: 0.2, dash: null },
  sew: { stroke: '#8e877d', width: 0.1, dash: [0.8, 0.5] },
  grain: { stroke: '#b5532f', width: 0.15, dash: null },
  notch: { stroke: '#1d1b18', width: 0.2, dash: null },
  fold: { stroke: '#2f5fb5', width: 0.3, dash: [2, 0.6, 0.4, 0.6] },
  foldbr: { stroke: '#2f5fb5', width: 0.14, dash: null },
  frame: { stroke: '#9c8f7c', width: 0.2, dash: null },
  ruler: { stroke: '#9c8f7c', width: 0.12, dash: null },
  mark: { stroke: '#1d1b18', width: 0.08, dash: null },
  box: { stroke: '#1d1b18', width: 0.1, dash: null },
};
const INK = { normal: '#1d1b18', muted: '#8e877d' };

export function toSVG(prims, W, L, { units = true, bg = true, x0 = 0, y0 = 0 } = {}) {
  const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (v) => +v.toFixed(3);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(W)} ${f(L)}"${units ? ` width="${f(W)}cm" height="${f(L)}cm"` : ''} font-family="Helvetica, Arial, sans-serif">`];
  if (bg) out.push(`<rect x="${f(x0)}" y="${f(y0)}" width="${f(W)}" height="${f(L)}" fill="#fffdf9"/>`);
  for (const p of prims) {
    if (p.k === 'text') {
      const rot = p.rot ? ` transform="rotate(${p.rot} ${f(p.x)} ${f(p.y)})"` : '';
      out.push(`<text x="${f(p.x)}" y="${f(p.y)}" font-size="${f(p.size)}" text-anchor="${p.anchor}"${p.bold ? ' font-weight="bold"' : ''} fill="${p.muted ? INK.muted : INK.normal}"${rot}${p.role ? ` class="${p.role}"` : ''}>${esc(p.s)}</text>`);
      continue;
    }
    if (p.k === 'circle') { out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="none" stroke="#1d1b18" stroke-width="0.08"/>`); continue; }
    const st = STYLE[p.k];
    const d = p.pts.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(q[1])}`).join('') + (p.closed ? 'Z' : '');
    out.push(`<path d="${d}" fill="${p.k === 'cut' ? 'rgba(181,83,47,0.06)' : 'none'}" stroke="${st.stroke}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash.join(' ')}"` : ''} stroke-linejoin="round"${p.k === 'cut' ? ' class="cut"' : ''}/>`);
  }
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------------ PDF
let jspdfPromise = null;
function loadJsPDF() {
  if (typeof window !== 'undefined' && window.jspdf) return Promise.resolve(window.jspdf);
  jspdfPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf);
    s.onerror = () => rej(new Error('Could not load the PDF library.'));
    document.head.appendChild(s);
  });
  return jspdfPromise;
}
const PT = 28.3465;   // pt per cm
const rgb = (hex) => hex.match(/\w\w/g).map(h => parseInt(h, 16));

/** Draw primitives with the sheet point (ox, oy) cm at the page point (px, py) mm. */
function drawPrims(doc, prims, ox, oy, px = 0, py = 0) {
  const X = (x) => (x - ox) * 10 + px, Y = (y) => (y - oy) * 10 + py;
  for (const p of prims) {
    if (p.k === 'text') {
      doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
      doc.setFontSize(p.size * PT);
      doc.setTextColor(...rgb(p.muted ? INK.muted : INK.normal));
      const opt = { align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left', baseline: 'alphabetic' };
      if (p.rot) {   // jsPDF rotates counter-clockwise and ignores `align` then: shift by hand
        const w = doc.getTextWidth(p.s) / 10;   // cm
        const k = opt.align === 'center' ? 0.5 : opt.align === 'right' ? 1 : 0;
        const a = p.rot * Math.PI / 180;
        doc.text(p.s, X(p.x - Math.cos(a) * w * k), Y(p.y - Math.sin(a) * w * k), { angle: -p.rot });
      } else doc.text(p.s, X(p.x), Y(p.y), opt);
      continue;
    }
    if (p.k === 'circle') { doc.setDrawColor(29, 27, 24); doc.setLineWidth(0.8); doc.setLineDashPattern([], 0); doc.circle(X(p.x), Y(p.y), p.r * 10, 'S'); continue; }
    const st = STYLE[p.k];
    doc.setDrawColor(...rgb(st.stroke));
    doc.setLineWidth(st.width * 10);
    doc.setLineDashPattern(st.dash ? st.dash.map(v => v * 10) : [], 0);
    const pts = p.pts.map(([x, y]) => [X(x), Y(y)]);
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    if (p.closed) segs.push([pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'S', false);
  }
  doc.setLineDashPattern([], 0);
}
function primBox(p) {
  if (p.k === 'text') { const w = textW(p.s, p.size); return p.rot ? [p.x - p.size, p.y - w, p.x + p.size, p.y + w] : [p.x - w, p.y - p.size, p.x + w, p.y + p.size]; }
  if (p.k === 'circle') return [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r];
  return bboxOf(p.pts);
}

export const PAPERS = {
  a4: { w: 210, h: 297, name: 'A4', m: 10, ov: 10 },
  letter: { w: 215.9, h: 279.4, name: 'US Letter', m: 10, ov: 10 },
  a0: { w: 841, h: 1189, name: 'A0', m: 10, ov: 20 },
  roll36: { w: 914.4, h: null, name: '36-inch roll', m: 10, ov: 20 },
};
/** Content size and step of the tiles (cm). */
function tileSpec(paper, sheetL = 100) {
  const cw = (paper.w - 2 * paper.m) / 10, ov = paper.ov / 10;
  const ch = paper.h ? (paper.h - 2 * paper.m) / 10 : Math.min(480, sheetL + 0.01);
  return { m: paper.m, ov, cw, ch, sx: cw - ov, sy: ch - ov };
}
const rowName = (r) => (r < 26 ? String.fromCharCode(65 + r) : String.fromCharCode(64 + Math.floor(r / 26)) + String.fromCharCode(65 + r % 26));

function crossesBox(pts, ox, oy, tw, th) {
  const seg = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  const box = [[ox, oy], [ox + tw, oy], [ox + tw, oy + th], [ox, oy + th]];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let k = 0; k < 4; k++) if (seg(a, b, box[k], box[(k + 1) % 4])) return true;
  }
  return false;
}
/** Which tiles of a sheet hold something worth printing. */
function tilePlan(prims, W, L, spec) {
  const cols = Math.max(1, Math.ceil((W - spec.ov) / spec.sx - 1e-6)), rows = Math.max(1, Math.ceil((L - spec.ov) / spec.sy - 1e-6));
  const cuts = prims.filter(p => p.k === 'cut' || p.k === 'box');
  const boxes = cuts.map(p => bboxOf(p.pts));
  const used = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ox = c * spec.sx, oy = r * spec.sy, tw = spec.cw, th = spec.ch;
    const hit = cuts.some((p, i) => {
      const b = boxes[i];
      if (b[2] < ox || b[0] > ox + tw || b[3] < oy || b[1] > oy + th) return false;
      return p.pts.some(([x, y]) => x >= ox && x <= ox + tw && y >= oy && y <= oy + th) || inside(ox + tw / 2, oy + th / 2, p.pts) || crossesBox(p.pts, ox, oy, tw, th);
    });
    if (hit) used.add(`${r},${c}`);
  }
  return { cols, rows, used };
}
/** Alignment marks in the overlap strips, in sheet coordinates. */
function alignMarks(plan, spec) {
  const out = [];
  const mark = (x, y, label) => {
    out.push({ k: 'circle', x, y, r: 0.35 }, { k: 'mark', pts: [[x - 0.6, y], [x + 0.6, y]] }, { k: 'mark', pts: [[x, y - 0.6], [x, y + 0.6]] });
    if (label) out.push({ k: 'text', x, y: y + 1.0, s: label, size: 0.45, anchor: 'middle' });
  };
  const { cols, rows, used } = plan;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!used.has(`${r},${c}`)) continue;
    if (c + 1 < cols && used.has(`${r},${c + 1}`)) {   // vertical strip between c and c+1
      const x = (c + 1) * spec.sx + spec.ov / 2;
      for (const f of [0.3, 0.7]) mark(x, r * spec.sy + spec.ch * f, `${rowName(r)}${c + 1} | ${rowName(r)}${c + 2}`);
    }
    if (r + 1 < rows && used.has(`${r + 1},${c}`)) {   // horizontal strip between r and r+1
      const y = (r + 1) * spec.sy + spec.ov / 2;
      for (const f of [0.3, 0.7]) mark(c * spec.sx + spec.cw * f, y, `${rowName(r)}${c + 1} / ${rowName(r + 1)}${c + 1}`);
    }
  }
  return out;
}

/** Draw the tiles of a sheet onto pages of `paper` size. */
function drawTiles(doc, prims, plan, spec, paper, meta, { first = false, pageOffset = 0, pageTotal = 0 } = {}) {
  const { cols, rows, used } = plan;
  const m = spec.m, pw = paper.w, ph = paper.h || spec.ch * 10 + 2 * m;
  const boxes = prims.map(primBox);
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!used.has(`${r},${c}`)) continue;
    n++;
    if (!(first && n === 1)) doc.addPage([pw, ph], pw > ph ? 'l' : 'p');
    const ox = c * spec.sx, oy = r * spec.sy;
    const name = `${rowName(r)}${c + 1}`;
    // big faint tile name behind the drawing
    doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.min(120, spec.cw * 6)); doc.setTextColor(236, 230, 220);
    doc.text(name, pw / 2, ph / 2, { align: 'center', baseline: 'middle' });
    const sel = prims.filter((p, i) => { const b = boxes[i]; return !(b[2] < ox - 1 || b[0] > ox + spec.cw + 1 || b[3] < oy - 1 || b[1] > oy + spec.ch + 1); });
    doc.saveGraphicsState();
    doc.rect(m, m, spec.cw * 10, spec.ch * 10, null);
    doc.clip(); doc.discardPath();
    drawPrims(doc, sel, ox, oy, m, m);
    doc.restoreGraphicsState();
    // content border, overlap lines, labels
    doc.setLineDashPattern([], 0); doc.setDrawColor(170); doc.setLineWidth(0.15);
    doc.rect(m, m, spec.cw * 10, spec.ch * 10);
    doc.setLineDashPattern([2, 1.5], 0); doc.setDrawColor(120);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(110);
    if (c + 1 < cols && used.has(`${r},${c + 1}`)) {
      const x = m + spec.sx * 10;
      doc.line(x, m, x, m + spec.ch * 10);
      doc.text(`${rowName(r)}${c + 2} starts here`, x - 1, m + spec.ch * 5, { angle: 90 });
    }
    if (r + 1 < rows && used.has(`${r + 1},${c}`)) {
      const y = m + spec.sy * 10;
      doc.line(m, y, m + spec.cw * 10, y);
      doc.text(`${rowName(r + 1)}${c + 1} starts here`, m + spec.cw * 5, y - 1, { align: 'center' });
    }
    doc.setLineDashPattern([], 0);
    doc.setFontSize(9); doc.setTextColor(60);
    doc.setFont('helvetica', 'bold');
    doc.text(name, m, m - 3);
    doc.setFont('helvetica', 'normal');
    doc.text(`${meta.title || 'Sewing pattern'} · ${paper.name} · page ${pageOffset + n}${pageTotal ? ` of ${pageTotal}` : ''} · print at 100% (actual size)`, m + 10, m - 3);
    const nb = [[r, c - 1, 'left'], [r, c + 1, 'right'], [r - 1, c, 'up'], [r + 1, c, 'down']];
    doc.setFontSize(7); doc.setTextColor(120);
    for (const [rr, cc, dir] of nb) {
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || !used.has(`${rr},${cc}`)) continue;
      const t = `${dir === 'left' ? '< ' : dir === 'up' ? '^ ' : ''}${rowName(rr)}${cc + 1}${dir === 'right' ? ' >' : dir === 'down' ? ' v' : ''}`;
      if (dir === 'left') doc.text(t, m - 3, ph / 2, { angle: 90, align: 'center' });
      if (dir === 'right') doc.text(t, pw - m + 5, ph / 2, { angle: 90, align: 'center' });
      if (dir === 'up') doc.text(t, pw - m, m - 3, { align: 'right' });
      if (dir === 'down') doc.text(t, pw / 2, ph - m + 5, { align: 'center' });
    }
    // 5 cm check ruler in the bottom margin
    const ry = ph - m + 4, rx = m;
    doc.setDrawColor(29, 27, 24); doc.setLineWidth(0.25);
    doc.line(rx, ry, rx + 50, ry);
    for (let k = 0; k <= 5; k++) doc.line(rx + k * 10, ry - (k % 5 ? 1 : 2), rx + k * 10, ry);
    doc.setFontSize(6); doc.setTextColor(60); doc.text('5 cm', rx + 52, ry + 0.8);
  }
  return n;
}

/** Small overview drawing (s = mm per cm) for cover pages. */
function drawThumb(doc, prims, s, px, py) {
  const X = (x) => px + x * s, Y = (y) => py + y * s;
  doc.setLineDashPattern([], 0);
  for (const p of prims) {
    if (p.k === 'text') {
      if (!(p.role === 'name' || p.muted) || p.role === 'seam') continue;
      if (p.muted && !/FOLD|SELVEDGE|Open/.test(p.s)) continue;
      doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
      doc.setFontSize(p.muted ? 5.5 : Math.max(4.5, Math.min(7, p.size * s * 2)));
      doc.setTextColor(...rgb(p.muted ? INK.muted : INK.normal));
      doc.text(p.s, X(p.x), Y(p.y), p.rot ? { angle: -p.rot, align: 'center' } : { align: p.anchor === 'middle' ? 'center' : 'left' });
      continue;
    }
    if (!['cut', 'fold', 'frame', 'grain'].includes(p.k)) continue;
    const st = STYLE[p.k];
    doc.setDrawColor(...rgb(st.stroke));
    doc.setLineWidth(p.k === 'fold' ? 0.5 : p.k === 'cut' ? 0.25 : 0.15);
    if (p.k === 'cut') doc.setFillColor(246, 236, 226);
    const pts = p.pts.map(([x, y]) => [X(x), Y(y)]);
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], p.k === 'cut' ? 'FD' : 'S', !!p.closed);
  }
}

// ---- cover page pieces
function testSquare(doc, x, y) {   // mm: a 10 cm square inside a 4 in square, sharing the top-left corner
  doc.setLineDashPattern([], 0); doc.setDrawColor(29, 27, 24);
  doc.setLineWidth(0.3); doc.rect(x, y, 101.6, 101.6);
  doc.setLineWidth(0.5); doc.rect(x, y, 100, 100);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(29, 27, 24);
  doc.text('10 cm', x + 50, y + 45, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Inner square: 10 cm x 10 cm', x + 50, y + 52, { align: 'center' });
  doc.text('Outer square: 4 in x 4 in', x + 50, y + 57, { align: 'center' });
  doc.text('Measure before printing everything.', x + 50, y + 64, { align: 'center' });
}
export function yardText(yd) {
  const whole = Math.floor(yd + 1e-9), frac = Math.round((yd - whole) * 8);
  const f = ['', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'][frac];
  return `${whole ? whole : ''}${whole && f ? ' ' : ''}${f || (whole ? '' : '0')} yd`;
}
export function fabricLine(meta) {
  const buy = fabricToBuy(meta.fabricLength);
  return `${meta.fabricWidth} cm (${Math.round(meta.fabricWidth / 2.54)} in) wide fabric, ${meta.folded ? 'folded in half lengthwise' : 'single layer'}: buy ${buy.m.toFixed(1)} m / ${yardText(buy.yd)} (layout ${Math.ceil(meta.fabricLength)} cm long)`;
}
function cuttingTable(doc, set, folded, x, y, w, maxY) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(29, 27, 24);
  doc.text('Cutting list', x, y); y += 6;
  doc.setFontSize(8.5);
  for (const g of set.groups) {
    if (y > maxY) { doc.text('...', x, y); break; }
    doc.setFont('helvetica', 'bold'); doc.text(doc.splitTextToSize(g.name, w * 0.55)[0], x, y);
    doc.setFont('helvetica', 'normal'); doc.text(cutText(g, { folded }), x + w * 0.58, y);
    y += 4.6;
  }
  return y;
}
function assemblyMap(doc, prims, plan, spec, x, y, w, h) {
  const W = plan.cols * spec.sx + spec.ov, L = plan.rows * spec.sy + spec.ov;
  const s = Math.min(w / W, h / L);
  doc.setLineDashPattern([], 0);
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
    const u = plan.used.has(`${r},${c}`);
    doc.setDrawColor(u ? 90 : 200); doc.setLineWidth(0.15);
    if (u) doc.setFillColor(248, 244, 236);
    doc.rect(x + c * spec.sx * s, y + r * spec.sy * s, spec.cw * s, spec.ch * s, u ? 'FD' : 'S');
  }
  doc.setDrawColor(29, 27, 24); doc.setLineWidth(0.2);
  for (const p of prims) if (p.k === 'cut') {
    const segs = []; for (let i = 1; i < p.pts.length; i++) segs.push([(p.pts[i][0] - p.pts[i - 1][0]) * s, (p.pts[i][1] - p.pts[i - 1][1]) * s]);
    doc.lines(segs, x + p.pts[0][0] * s, y + p.pts[0][1] * s, [1, 1], 'S', true);
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.max(5, Math.min(9, spec.cw * s * 0.8))); doc.setTextColor(181, 83, 47);
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
    if (plan.used.has(`${r},${c}`)) doc.text(`${rowName(r)}${c + 1}`, x + (c * spec.sx + 0.8) * s, y + (r * spec.sy + 0.8) * s, { baseline: 'top' });
  }
  return y + L * s;
}

/** Pattern sheet layout (one of each piece) sized so it needs as few pages as possible. */
export function planSheet(set, { folded = false, paper = PAPERS.a4, header = 0, budget = 150 } = {}) {
  let best = null;
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  const minW = Math.max(...set.groups.map(g => { const [w, h] = pieceSize(byId[g.members[0].id]); return folded && g.sym && g.count === 1 ? w / 2 : Math.min(w, h); })) + 2;
  const spec0 = tileSpec(paper, 1000);
  const roll = !paper.h;
  const c0 = roll ? 1 : Math.max(1, Math.ceil((minW - spec0.ov) / spec0.sx - 1e-6));
  for (let cols = c0; cols <= (roll ? 1 : c0 + 3); cols++) {
    const width = roll ? Math.max(spec0.cw, minW) : cols * spec0.sx + spec0.ov;
    const layout = autoLayout(set, { sheet: true, folded, width, margin: 0.5, gap: 1.5, allowRotate: true, timeBudget: budget });
    const L = layout.length + header + 1;
    const spec = tileSpec(paper, L);
    const prims = primitives(set, layout, { dy: header });
    const plan = tilePlan(prims, width, L, spec);
    const score = plan.used.size * 1000 + cols;
    if (!best || score < best.score) best = { score, layout, width, length: L, spec, plan, header };
  }
  return best;
}

function headerPrims(set, meta, W, H) {   // title block drawn on large-format sheets (cm)
  const out = [];
  const t = (x, y, s, size, extra = {}) => out.push({ k: 'text', x, y, s, size, anchor: 'start', ...extra });
  t(1, 2.6, meta.title || 'Sewing pattern', 1.8, { bold: true });
  t(1, 4.2, `${meta.note ? meta.note + ' · ' : ''}${meta.sa > 0 ? `seam allowance ${meta.sa} cm included` : 'no seam allowance'} · ${meta.date || ''}`, 0.7);
  t(1, 5.4, 'Print at 100% / actual size, do not scale to fit. Check the test square first.', 0.7, { bold: true });
  t(1, 6.4, fabricLine(meta), 0.7);
  let y = 8.2;
  t(1, y, 'Cutting list', 0.9, { bold: true }); y += 1.3;
  for (const g of set.groups) { t(1, y, g.name, 0.6, { bold: true }); t(Math.min(30, W * 0.35), y, cutText(g, { folded: meta.folded }), 0.6); y += 0.95; if (y > H - 1) break; }
  // test squares: 10 cm inside 4 in, top-right
  const x0 = W - 12.5, y0 = 1;
  out.push({ k: 'box', pts: [[x0, y0], [x0 + 10.16, y0], [x0 + 10.16, y0 + 10.16], [x0, y0 + 10.16]], closed: true });
  out.push({ k: 'box', pts: [[x0, y0], [x0 + 10, y0], [x0 + 10, y0 + 10], [x0, y0 + 10]], closed: true });
  out.push({ k: 'text', x: x0 + 5, y: y0 + 4.8, s: '10 cm', size: 1, anchor: 'middle', bold: true });
  out.push({ k: 'text', x: x0 + 5, y: y0 + 6, s: 'outer square 4 in', size: 0.5, anchor: 'middle' });
  out.push({ k: 'ruler', pts: [[0, H - 0.5], [W, H - 0.5]] });
  return out;
}

/**
 * Printable pattern: home printer tiles (A4 / Letter) with a cover page, or large format
 * (A0 sheets / 36-inch roll) with the title block and test square on the sheet itself.
 */
export async function patternPDF(set, meta, { paper = 'a4', fabricPrims: fabPrims = null, fabricSize = null, budget = 150 } = {}) {
  const { jsPDF } = await loadJsPDF();
  const P = PAPERS[paper];
  const large = paper === 'a0' || paper === 'roll36';
  const H = large ? Math.max(14, 9.5 + set.groups.length * 0.95) : 0;
  const sheet = planSheet(set, { folded: meta.folded, paper: P, header: H, budget });
  let prims = primitives(set, sheet.layout, { dy: H, title: meta.title, note: meta.note });
  if (large) prims = [...headerPrims(set, meta, sheet.width, H), ...prims];
  const plan = tilePlan(prims, sheet.width, sheet.length, sheet.spec);
  prims = [...prims, ...alignMarks(plan, sheet.spec)];
  const spec = sheet.spec;
  const pw = P.w, ph = P.h || spec.ch * 10 + 2 * spec.m;
  const doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'l' : 'p', compress: true });
  doc.setProperties({ title: meta.title || 'Sewing pattern', creator: 'GarmentCode 3D Studio (unofficial)' });
  let extra = 0;
  if (!large) {
    // cover: title, test square, fabric, cutting list, assembly map
    const m = 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(29, 27, 24);
    doc.text(meta.title || 'Sewing pattern', m, m + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    doc.text(`${meta.note ? meta.note + ' · ' : ''}${meta.date || ''} · GarmentCode 3D Studio (unofficial)`, m, m + 12);
    testSquare(doc, pw - m - 101.6, m + 18);
    doc.setTextColor(29, 27, 24); doc.setFontSize(9);
    const tw = pw - 2 * m - 106;
    const intro = [
      `Print at 100% / "actual size" on ${P.name}; never "fit to page". Check the 10 cm square first.`,
      `${plan.used.size} pattern pages, named A1, A2, ... B1 ... as in the page map below (blank pages are left out).`,
      'Assembling: trim the top and left margins of each page, then lay it over its neighbour so the edge sits on the dashed "starts here" line and the circled crosses meet. Tape.',
      meta.sa > 0 ? `Seam allowance (${meta.sa} cm) is included: cut on the solid line, sew on the dashed line.` : 'No seam allowance is included: add it when cutting.',
      'Notches: snip into the seam allowance; numbers name the seam they belong to (3/7: seam 3 on one piece of a pair, 7 on the other).',
      'Grain arrows run parallel to the selvedge.',
    ];
    let y = m + 22;
    for (const t of intro) { const w = doc.splitTextToSize(t, tw); doc.text(w, m, y); y += w.length * 4 + 1.6; }
    y = Math.max(y, m + 18 + 101.6) + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Fabric', m, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const fl = doc.splitTextToSize(fabricLine(meta), pw - 2 * m); doc.text(fl, m, y); y += fl.length * 4 + 4;
    const yEnd = cuttingTable(doc, set, meta.folded, m, y, (pw - 2 * m) * 0.5, ph - 60);
    const mapX = m + (pw - 2 * m) * 0.52, mapW = pw - m - mapX;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Page map', mapX, y);
    assemblyMap(doc, prims, plan, spec, mapX, y + 4, mapW, ph - m - y - 8);
    void yEnd;
    // second page: cutting layout overview + sewing order
    doc.addPage([pw, ph], 'p'); extra++;
    let yy = m + 6;
    doc.setTextColor(29, 27, 24);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Cutting layout', m, yy); yy += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(`${fabricLine(meta)}. Lay the pattern pieces as shown, grain arrows parallel to the selvedge. Pieces with a dashed blue edge go on the fold.`, pw - 2 * m);
    doc.text(lines, m, yy); yy += lines.length * 3.8 + 2;
    if (fabPrims && fabricSize) {
      const [FW, FL] = fabricSize;
      const s = Math.min((pw - 2 * m - 16) / FW, (ph * 0.55) / FL);   // mm per cm
      drawThumb(doc, fabPrims, s, m + 8, yy + 2);
      yy += FL * s + 10;
    }
    if (meta.steps && meta.steps.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(29, 27, 24);
      if (yy > ph - 40) { doc.addPage([pw, ph], 'p'); extra++; yy = m + 6; }
      doc.text('Sewing order', m, yy); yy += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      for (const [i, t] of meta.steps.entries()) {
        const w = doc.splitTextToSize(`${i + 1}. ${t.replace(/<[^>]+>/g, '')}`, pw - 2 * m);
        if (yy + w.length * 3.8 > ph - m) { doc.addPage([pw, ph], 'p'); extra++; yy = m + 6; }
        doc.text(w, m, yy); yy += w.length * 3.8 + 1;
      }
    }
  }
  const total = plan.used.size + (large ? 0 : 1 + extra);
  drawTiles(doc, prims, plan, spec, { ...P, h: ph }, meta, { first: large, pageOffset: large ? 0 : 1 + extra, pageTotal: total });
  return { blob: doc.output('blob'), doc, pages: total, tiles: plan.used.size, cols: plan.cols, rows: plan.rows, paper: P.name, sheet, prims };
}

/** The whole cutting layout at full size (fabric width + margins; pages of up to 4.8 m). */
export async function layoutPDF(prims, W, L, meta) {
  const { jsPDF } = await loadJsPDF();
  const maxL = 480, pages = Math.max(1, Math.ceil(L / maxL));
  const pw = (W + 10) * 10;
  let doc = null;
  for (let i = 0; i < pages; i++) {
    const segL = Math.min(maxL, L - i * maxL);
    const ph = (segL + 8) * 10;
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'l' : 'p', compress: true });
    else doc.addPage([pw, ph], pw > ph ? 'l' : 'p');
    const oy = i * maxL;
    doc.saveGraphicsState();
    doc.rect(0, 40, pw, segL * 10 + 0.5, null); doc.clip(); doc.discardPath();
    drawPrims(doc, prims, -5, oy, 0, 40);
    doc.restoreGraphicsState();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(90);
    doc.text(`${meta.title} · ${fabricLine(meta)} · part ${i + 1}/${pages} (${oy}-${oy + Math.round(segL)} cm) · 1:1`, 50, 22);
  }
  return doc.output('blob');
}

// ------------------------------------------------------------------ DXF (R12, mm)
export function toDXF(prims) {
  const mm = (v) => (v * 10).toFixed(2);
  const L = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '9', '$MEASUREMENT', '70', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '8'];
  const layers = { cut: ['CUT', 7], sew: ['SEW', 8], grain: ['GRAIN', 1], notch: ['NOTCH', 5], text: ['TEXT', 3], fold: ['FOLD', 4], foldbr: ['FOLD', 4], frame: ['FABRIC', 9], ruler: ['FABRIC', 9], mark: ['MARKS', 9], box: ['MARKS', 9], circle: ['MARKS', 9] };
  for (const [name, color] of new Map(Object.values(layers))) L.push('0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS');
  L.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  for (const p of prims) {
    const layer = layers[p.k][0];
    if (p.k === 'text') {
      L.push('0', 'TEXT', '8', layer, '10', mm(p.x), '20', mm(-p.y), '30', '0', '40', mm(p.size * 0.7), '1', p.s);
      if (p.rot) L.push('50', String(-p.rot));
      continue;
    }
    if (p.k === 'circle') { L.push('0', 'CIRCLE', '8', layer, '10', mm(p.x), '20', mm(-p.y), '30', '0', '40', mm(p.r)); continue; }
    L.push('0', 'POLYLINE', '8', layer, '66', '1', '70', p.closed ? '1' : '0');
    for (const [x, y] of p.pts) L.push('0', 'VERTEX', '8', layer, '10', mm(x), '20', mm(-y), '30', '0');
    L.push('0', 'SEQEND');
  }
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\n');
}
