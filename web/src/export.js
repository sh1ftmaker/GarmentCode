// Pattern exports: drawing primitives -> SVG, PDF (full size or tiled), DXF.
import { placed, xf, pieceSize } from './layout.js';

// Douglas-Peucker: drop points closer than tol (cm) to the simplified outline
function simplify(pts, tol = 0.03, closed = true) {
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
  void closed;
  return pts.filter((_, k) => keep[k]);
}

/** Drawing primitives of the whole cutting layout, in fabric cm. */
export function primitives(set, layout, { sewLines = true, title = '' } = {}) {
  const prims = [];
  for (const p of set.pieces) {
    const pl = layout.placements[p.id];
    if (!pl) continue;
    prims.push({ k: 'cut', pts: simplify(placed(p, pl)), id: p.id, closed: true });
    if (sewLines && set.sa > 0) prims.push({ k: 'sew', pts: simplify(placed(p, pl, 'sew')), closed: true });
    // grainline with arrow heads
    const [a, b] = p.grain.map(q => xf(p, pl, q));
    prims.push({ k: 'grain', pts: [a, b] });
    const gl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / gl, uy = (b[1] - a[1]) / gl;
    for (const [tip, s] of [[a, -1], [b, 1]]) {
      const bx = tip[0] - s * ux * 2, by = tip[1] - s * uy * 2;
      prims.push({ k: 'grain', pts: [[bx - uy * 1.2, by + ux * 1.2], tip, [bx + uy * 1.2, by - ux * 1.2]] });
    }
    if (sewLines) {
      for (const n of p.notches) {
        const q = xf(p, pl, n.p), q2 = xf(p, pl, [n.p[0] + n.n[0] * Math.max(set.sa, 0.8), n.p[1] + n.n[1] * Math.max(set.sa, 0.8)]);
        prims.push({ k: 'notch', pts: [q, q2] });
      }
      for (const s of p.seamLabels) { const q = xf(p, pl, s.p); prims.push({ k: 'text', x: q[0], y: q[1], s: String(s.seam), size: 1.6, anchor: 'middle' }); }
    }
    const mid = xf(p, pl, [(p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2]);
    const [w, h] = pieceSize(p);
    const sz = Math.max(1.4, Math.min(2.6, w / 12));
    prims.push({ k: 'text', x: mid[0] + 1.5, y: mid[1] - sz * 0.4, s: p.name, size: sz, anchor: 'start', bold: true });
    prims.push({ k: 'text', x: mid[0] + 1.5, y: mid[1] + sz * 0.9, s: `Cut 1 · ${title}`.trim().replace(/·\s*$/, ''), size: sz * 0.7, anchor: 'start' });
  }
  return prims;
}

const STYLE = {
  cut: { stroke: '#1d1b18', width: 0.18, dash: null },
  sew: { stroke: '#8e877d', width: 0.1, dash: [0.8, 0.5] },
  grain: { stroke: '#b5532f', width: 0.14, dash: null },
  notch: { stroke: '#1d1b18', width: 0.18, dash: null },
};

export function toSVG(prims, W, L, { units = true, bg = true } = {}) {
  const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${L}"${units ? ` width="${W}cm" height="${L}cm"` : ''} font-family="Helvetica, Arial, sans-serif">`];
  if (bg) out.push(`<rect width="${W}" height="${L}" fill="#fffdf9"/>`);
  for (const p of prims) {
    if (p.k === 'text') {
      out.push(`<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" font-size="${p.size}" text-anchor="${p.anchor}"${p.bold ? ' font-weight="bold"' : ''} fill="#1d1b18">${esc(p.s)}</text>`);
      continue;
    }
    const st = STYLE[p.k];
    const d = p.pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('') + (p.closed ? 'Z' : '');
    out.push(`<path d="${d}" fill="${p.k === 'cut' ? 'rgba(181,83,47,0.06)' : 'none'}" stroke="${st.stroke}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash.join(' ')}"` : ''} stroke-linejoin="round"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------------ PDF
let jspdfPromise = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  jspdfPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf);
    s.onerror = () => rej(new Error('Could not load the PDF library.'));
    document.head.appendChild(s);
  });
  return jspdfPromise;
}

function drawPrims(doc, prims, ox, oy) {   // ox/oy in cm; PDF unit = mm
  for (const p of prims) {
    if (p.k === 'text') {
      doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
      doc.setFontSize(p.size * 10 * 2.835);   // cm -> pt (1 cm = 28.35 pt)
      doc.setTextColor(29, 27, 24);
      doc.text(p.s, (p.x - ox) * 10, (p.y - oy) * 10, { align: p.anchor === 'middle' ? 'center' : 'left', baseline: 'middle' });
      continue;
    }
    const st = STYLE[p.k];
    const [r, g, b] = st.stroke.match(/\w\w/g).map(h => parseInt(h, 16));
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(st.width * 10);
    doc.setLineDashPattern(st.dash ? st.dash.map(v => v * 10) : [], 0);
    const pts = p.pts.map(([x, y]) => [(x - ox) * 10, (y - oy) * 10]);
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    if (p.closed) segs.push([pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'S', false);
  }
  doc.setLineDashPattern([], 0);
}

/** One page per <= 5 m of fabric, at full size. */
export async function layoutPDF(prims, W, L, meta) {
  const { jsPDF } = await loadJsPDF();
  const maxL = 500, pages = Math.max(1, Math.ceil(L / maxL));
  const pw = (W + 4) * 10;
  let doc = null;
  for (let i = 0; i < pages; i++) {
    const segL = Math.min(maxL, L - i * maxL);
    const ph = (segL + 4) * 10;
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'l' : 'p' });
    else doc.addPage([pw, ph], pw > ph ? 'l' : 'p');
    doc.setDrawColor(150); doc.setLineWidth(0.3);
    doc.rect(20, 20, W * 10, segL * 10);
    drawPrims(doc, prims, -2, -2 + i * maxL);
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`${meta.title} · fabric ${W} cm wide · page ${i + 1}/${pages} · GarmentCode 3D Studio (unofficial)`, 22, 14);
  }
  return doc.output('blob');
}

/** Home-printer tiles with overlap marks, a test square and an assembly map. */
export async function tiledPDF(prims, W, L, meta) {
  const { jsPDF } = await loadJsPDF();
  const letter = /^en-(US|CA)|^es-(MX|US)/.test(navigator.language || '');
  const paper = letter ? { w: 215.9, h: 279.4, name: 'US Letter' } : { w: 210, h: 297, name: 'A4' };
  const m = 10;                                   // printer margin, mm
  const tw = (paper.w - 2 * m) / 10, th = (paper.h - 2 * m) / 10;   // tile size in cm
  const cols = Math.ceil(W / tw), rows = Math.ceil(L / th);
  const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h] });
  // cover page
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(29, 27, 24);
  doc.text(meta.title || 'Sewing pattern', m, m + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const lines = [
    `Printed on ${paper.name}, ${cols} × ${rows} pages. Print at 100% / "actual size"; don't scale to fit.`,
    'Check the 10 cm test square below before printing everything.',
    `Fabric: ${meta.fabricWidth} cm wide, about ${meta.fabricLength} cm long. Seam allowance ${meta.sa} cm is included.`,
    'Tape pages edge to edge by matching the row/column labels and the corner crosses.',
    'Unofficial tool, not affiliated with the GarmentCode authors.',
  ];
  lines.forEach((t, i) => doc.text(t, m, m + 18 + i * 6, { maxWidth: paper.w - 2 * m }));
  doc.setLineWidth(0.4); doc.setDrawColor(29, 27, 24);
  doc.rect(m, m + 54, 100, 100);
  doc.text('10 cm × 10 cm test square', m + 2, m + 60);
  // assembly map
  const mapW = paper.w - 2 * m - 110, s = Math.min(mapW / W, 90 / L);
  const mx = m + 110, my = m + 54;
  doc.setLineWidth(0.15);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    doc.rect(mx + c * tw * s, my + r * th * s, tw * s, th * s);
    doc.setFontSize(6); doc.setTextColor(29, 27, 24); doc.text(`${String.fromCharCode(65 + r)}${c + 1}`, mx + c * tw * s + 1, my + r * th * s + 3);
  }
  for (const p of prims) if (p.k === 'cut') {
    const segs = []; for (let i = 1; i < p.pts.length; i++) segs.push([(p.pts[i][0] - p.pts[i - 1][0]) * s, (p.pts[i][1] - p.pts[i - 1][1]) * s]);
    doc.lines(segs, mx + p.pts[0][0] * s, my + p.pts[0][1] * s, [1, 1], 'S', true);
  }
  if (meta.steps && meta.steps.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    let y = m + 54 + 110;
    doc.text('Sewing order', m, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    for (const [i, t] of meta.steps.entries()) {
      const txt = `${i + 1}. ${t.replace(/<[^>]+>/g, '')}`;
      const wrapped = doc.splitTextToSize(txt, paper.w - 2 * m);
      if (y + 5 + wrapped.length * 4 > paper.h - m) { doc.addPage([paper.w, paper.h]); y = m; }
      y += 5; doc.text(wrapped, m, y); y += (wrapped.length - 1) * 4;
    }
  }
  // tiles (skipping ones that touch no piece)
  const cuts = prims.filter(p => p.k === 'cut');
  const labels = prims.filter(p => p.k === 'text' && p.bold);
  const inside = (x, y, pts) => { let o = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) o = !o; } return o; };
  let printed = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ox = c * tw, oy = r * th;
    const hit = cuts.findIndex(p => spans(p.pts, ox, oy, tw, th) && (p.pts.some(([x, y]) => x >= ox && x <= ox + tw && y >= oy && y <= oy + th) || inside(ox + tw / 2, oy + th / 2, p.pts) || crosses(p.pts, ox, oy, tw, th)));
    if (hit < 0) continue;
    printed++;
    doc.addPage([paper.w, paper.h]);
    const host = cuts.find(p => inside(ox + tw / 2, oy + th / 2, p.pts));
    if (host) {   // faint piece name so interior tiles can be identified
      const lab = labels[cuts.indexOf(host)];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(225, 218, 205);
      if (lab) doc.text(lab.s, paper.w / 2, paper.h / 2, { align: 'center', baseline: 'middle', maxWidth: paper.w - 2 * m });
    }
    const tilePrims = prims.filter(p => p.k === 'text'
      ? p.x > ox - 10 && p.x < ox + tw + 10 && p.y > oy - 3 && p.y < oy + th + 3
      : p.pts.some(([x, y]) => x > ox - 1 && x < ox + tw + 1 && y > oy - 1 && y < oy + th + 1) || spans(p.pts, ox, oy, tw, th));
    doc.saveGraphicsState();
    doc.rect(m, m, tw * 10, th * 10, null);
    doc.clip(); doc.discardPath();
    drawPrims(doc, tilePrims, ox - m / 10, oy - m / 10);
    doc.restoreGraphicsState();
    doc.setLineDashPattern([], 0); doc.setDrawColor(170); doc.setLineWidth(0.1);
    doc.rect(m, m, tw * 10, th * 10);
    for (const [x, y] of [[m, m], [m + tw * 10, m], [m, m + th * 10], [m + tw * 10, m + th * 10]]) {
      doc.setDrawColor(29, 27, 24); doc.setLineWidth(0.2);
      doc.line(x - 4, y, x + 4, y); doc.line(x, y - 4, x, y + 4);
    }
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`${String.fromCharCode(65 + r)}${c + 1}  (row ${r + 1}/${rows}, column ${c + 1}/${cols})`, m, m - 3);
  }
  return { blob: doc.output('blob'), paper: paper.name, pages: printed + 1 };
}
function crosses(pts, ox, oy, tw, th) {   // any polygon edge crossing the tile's border
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
function spans(pts, ox, oy, tw, th) {   // polyline crossing a tile without a vertex inside it
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return !(maxX < ox || minX > ox + tw || maxY < oy || minY > oy + th);
}

// ------------------------------------------------------------------ DXF (R12, cm)
export function toDXF(prims) {
  const L = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '5', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '4'];
  const layers = { cut: ['CUT', 7], sew: ['SEW', 8], grain: ['GRAIN', 1], notch: ['NOTCH', 5], text: ['TEXT', 3] };
  for (const [name, color] of Object.values(layers)) L.push('0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS');
  L.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  for (const p of prims) {
    const layer = layers[p.k][0];
    if (p.k === 'text') {
      L.push('0', 'TEXT', '8', layer, '10', p.x.toFixed(3), '20', (-p.y).toFixed(3), '30', '0', '40', p.size.toFixed(2), '1', p.s);
      continue;
    }
    L.push('0', 'POLYLINE', '8', layer, '66', '1', '70', p.closed ? '1' : '0');
    for (const [x, y] of p.pts) L.push('0', 'VERTEX', '8', layer, '10', x.toFixed(3), '20', (-y).toFixed(3), '30', '0');
    L.push('0', 'SEQEND');
  }
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\n');
}
