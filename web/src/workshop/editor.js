// The Draft workshop: a pattern editor drawn over the mannequin, seen from the front or the
// back, on a cutting mat. Pieces are outlines of points joined by straight or curved edges;
// edges are sewn together with the Sew tool. See model.js for the design format.
import * as M from './model.js';
import { BLOCKS } from './blocks.js';

const NS = 'http://www.w3.org/2000/svg';
const SWATCH = ['#e9b8a4', '#a9c6b8', '#e8cf95', '#b5bfdc', '#d9b3cf', '#b9d49b', '#f0b98c', '#a7cdd6', '#d6c1a6', '#c9a9a3'];
const THREAD = ['#c2410c', '#1d4ed8', '#15803d', '#a21caf', '#b45309', '#0e7490', '#be123c', '#4d7c0f', '#6d28d9', '#0f766e'];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const clone = (o) => JSON.parse(JSON.stringify(o));
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };

const ICON = {
  select: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
  draw: '<path d="M4 20 14.5 9.5"/><path d="m14 4 6 6-3 3-6-6z"/>',
  sew: '<path d="M3 17c4-6 6 2 9-4s5 2 9-4"/><circle cx="20" cy="5" r="1.4"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

export class Workshop {
  /**
   * ctx: { measurements(), body() -> { pos, idx } | null, apply(design | null, { commit }),
   *        canImport() -> bool, importCurrent() -> Promise<design>, toast(text), len(cm) -> text,
   *        saveToLibrary(design), split(on) }
   */
  constructor(panel, view, ctx) {
    this.panel = panel; this.view = view; this.ctx = ctx;
    this.d = null;
    this.layer = 'front';
    this.tool = 'select';
    this.sel = null;          // { p } | { p, pt } | { p, e, side } | { seam }
    this.drawPts = [];        // Draw tool: points of the piece being drawn
    this.sew = null;          // Sew tool: { a: { p, e: [], side } , last: seam id }
    this.vb = null;
    this.bodyImg = null; this.bodyKey = '';
    this.showOther = true;
    this.split = true;
    this.buildView();
  }

  // ------------------------------------------------------------ public
  /** Show a design (null: the start screen). Called by the app on open / undo / redo. */
  setDesign(d) {
    this.d = d ? clone(d) : null;
    if (this.sel && !this.findSel()) this.sel = null;
    this.render();
  }
  bodyChanged() { this.bodyKey = ''; this.render(); }
  shown() {
    this.ctx.split?.(this.split && !!this.d);
    requestAnimationFrame(() => { if (!this.vb) this.fit(); this.render(); });
  }

  // ------------------------------------------------------------ editing helpers
  piece(id) { return this.d?.pieces.find(p => p.id === id); }
  findSel() {
    const s = this.sel;
    if (!s || !this.d) return null;
    if (s.seam) return this.d.seams.find(x => x.id === s.seam);
    const pc = this.piece(s.p);
    if (!pc) return null;
    if (s.pt != null && s.pt >= pc.pts.length) return null;
    if (s.e != null && s.e >= pc.pts.length) return null;
    return pc;
  }
  /** Something changed: redraw now; commit = record history + re-drape. */
  changed(commit = true) {
    this.render();
    if (commit) this.ctx.apply(clone(this.d), { commit: true });
  }
  m() { return this.ctx.measurements(); }
  solved() {
    if (!this.d) return { pieces: [], errors: [] };
    try { return M.solve(this.d, this.m()); } catch (e) { return { pieces: [], errors: [e.message] }; }
  }

  // ------------------------------------------------------------ view (SVG on the cutting mat)
  buildView() {
    this.view.innerHTML = `
      <div class="ws-toolbar" role="toolbar" aria-label="Pattern tools">
        <div class="ws-tools">
          <button class="ws-tool" data-tool="select" title="Select and move (V)">${icon('select')}<span>Move</span></button>
          <button class="ws-tool" data-tool="draw" title="Draw a new piece (P)">${icon('draw')}<span>Draw</span></button>
          <button class="ws-tool" data-tool="sew" title="Sew two edges together (S)">${icon('sew')}<span>Sew</span></button>
        </div>
        <div class="seg ws-layer" role="group" aria-label="Side of the body">
          <button class="seg-btn" data-layer="front">Front</button>
          <button class="seg-btn" data-layer="back">Back</button>
        </div>
        <div class="ws-tools">
          <button class="ws-tool icon-only" data-act="zoomin" title="Zoom in" aria-label="Zoom in">${icon('plus')}</button>
          <button class="ws-tool icon-only" data-act="zoomout" title="Zoom out" aria-label="Zoom out">${icon('minus')}</button>
          <button class="ws-tool icon-only" data-act="fit" title="Fit to the body" aria-label="Fit to the body">${icon('fit')}</button>
          <button class="ws-tool" data-act="split" title="Show the 3D drape beside the pattern">${icon('cube')}<span>3D</span></button>
        </div>
      </div>
      <svg class="ws-svg" tabindex="0" aria-label="Pattern drafting board"></svg>
      <div class="ws-hint" aria-live="polite"></div>
      <div class="ws-empty" hidden></div>`;
    this.svg = this.view.querySelector('.ws-svg');
    this.hint = this.view.querySelector('.ws-hint');
    this.view.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => this.setTool(b.dataset.tool); });
    this.view.querySelectorAll('[data-layer]').forEach(b => { b.onclick = () => { this.layer = b.dataset.layer; this.render(); }; });
    this.view.querySelector('[data-act="zoomin"]').onclick = () => this.zoom(0.8);
    this.view.querySelector('[data-act="zoomout"]').onclick = () => this.zoom(1.25);
    this.view.querySelector('[data-act="fit"]').onclick = () => { this.fit(); this.render(); };
    this.view.querySelector('[data-act="split"]').onclick = () => { this.split = !this.split; this.ctx.split?.(this.split && !!this.d); setTimeout(() => { this.fit(); this.render(); }, 60); };
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e));
    this.svg.addEventListener('dblclick', (e) => this.onDbl(e));
    this.svg.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, this.world(e)); }, { passive: false });
    this.svg.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => { if (this.view.offsetParent) this.render(); }).observe(this.view);
  }
  setTool(t) {
    this.tool = t; this.drawPts = []; this.sew = null;
    this.render();
  }
  fit() {
    const r = this.svg.getBoundingClientRect();
    const m = this.m();
    const H = (m?.height || 175) + 12, W = 160;
    const asp = (r.width || 600) / (r.height || 600);
    let vw = W, vh = H;
    if (vw / vh < asp) vw = vh * asp; else vh = vw / asp;
    this.vb = [-vw / 2, -(H - 4) - (vh - H) / 2, vw, vh];
  }
  zoom(f, at = null) {
    if (!this.vb) this.fit();
    const [x, y, w, h] = this.vb;
    const c = at ? [this.flipX(at[0]), -at[1]] : [x + w / 2, y + h / 2];
    const nw = Math.min(600, Math.max(8, w * f)), k = nw / w;
    this.vb = [c[0] - (c[0] - x) * k, c[1] - (c[1] - y) * k, w * k, h * k];
    this.render();
  }
  flipX(x) { return this.layer === 'back' ? -x : x; }
  scr([x, y]) { return [this.flipX(x), -y]; }
  /** Pointer event -> body coordinates (cm). */
  world(e) {
    const r = this.svg.getBoundingClientRect(), [x, y, w, h] = this.vb;
    const sx = x + (e.clientX - r.left) / r.width * w, sy = y + (e.clientY - r.top) / r.height * h;
    return [this.flipX(sx), -sy];
  }
  px() { const r = this.svg.getBoundingClientRect(); return this.vb[2] / (r.width || 1); }   // cm per screen pixel

  /** Display position of a solved point of piece pc (imported 3D pieces sit at their translation). */
  disp(pc, p) { return pc.place ? [p[0] + pc.place.T[0], p[1] + pc.place.T[1]] : p; }

  // ------------------------------------------------------------ body silhouette
  silhouette() {
    const b = this.ctx.body();
    if (!b) return null;
    const key = `${b.pos.length}:${b.pos[0]}:${b.pos[1]}:${b.pos[300] || 0}`;
    if (key === this.bodyKey && this.bodyImg) return this.bodyImg;
    const S = 3, X0 = -95, X1 = 95, Y1 = 200;
    const c = document.createElement('canvas');
    c.width = (X1 - X0) * S; c.height = Y1 * S;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    const { pos, idx } = b;
    g.beginPath();
    for (let t = 0; t < idx.length; t += 3) {
      const a = 3 * idx[t];
      let bb = 3 * idx[t + 1], cc = 3 * idx[t + 2];
      // one winding for every triangle (front- and back-facing ones would cancel in the fill)
      if ((pos[bb] - pos[a]) * (pos[cc + 1] - pos[a + 1]) - (pos[bb + 1] - pos[a + 1]) * (pos[cc] - pos[a]) < 0) [bb, cc] = [cc, bb];
      g.moveTo((pos[a] - X0) * S, (Y1 - pos[a + 1]) * S);
      g.lineTo((pos[bb] - X0) * S, (Y1 - pos[bb + 1]) * S);
      g.lineTo((pos[cc] - X0) * S, (Y1 - pos[cc + 1]) * S);
      g.closePath();
    }
    g.fill();
    this.bodyImg = { url: c.toDataURL('image/png'), X0, X1, Y1 };
    this.bodyKey = key;
    return this.bodyImg;
  }

  // ------------------------------------------------------------ render
  render() {
    this.renderPanel();
    const empty = this.view.querySelector('.ws-empty');
    this.view.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === this.tool));
    this.view.querySelectorAll('[data-layer]').forEach(b => b.classList.toggle('active', b.dataset.layer === this.layer));
    this.view.querySelector('[data-act="split"]').classList.toggle('on', this.split);
    if (!this.view.offsetParent) return;
    if (!this.vb) this.fit();
    const svg = this.svg, [vx, vy, vw, vh] = this.vb, px = this.px();
    svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    svg.classList.toggle('back', this.layer === 'back');
    svg.dataset.tool = this.tool;
    svg.innerHTML = '';
    // mat grid
    const defs = svg.appendChild(svgEl('defs'));
    defs.innerHTML = `
      <pattern id="ws-g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" class="ws-grid1" stroke-width="${0.6 * px}"/></pattern>
      <pattern id="ws-g10" width="10" height="10" patternUnits="userSpaceOnUse" x="0" y="0"><rect width="10" height="10" fill="url(#ws-g1)"/><path d="M10 0H0V10" fill="none" class="ws-grid10" stroke-width="${1 * px}"/></pattern>
      <marker id="ws-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ws-arrowhead"/></marker>`;
    svg.append(svgEl('rect', { x: vx - 50, y: vy - 50, width: vw + 100, height: vh + 100, class: 'ws-mat' }));
    svg.append(svgEl('rect', { x: vx - 50, y: vy - 50, width: vw + 100, height: vh + 100, fill: vw / (svg.clientWidth || 1) < 0.25 ? 'url(#ws-g10)' : 'url(#ws-g10)', class: 'ws-gridfill' }));
    // body + landmarks
    const sil = this.silhouette();
    if (sil) {
      const im = svgEl('image', { href: sil.url, x: this.layer === 'back' ? -sil.X1 : sil.X0, y: -sil.Y1, width: sil.X1 - sil.X0, height: sil.Y1, class: 'ws-body', preserveAspectRatio: 'none' });
      if (this.layer === 'back') im.setAttribute('transform', `scale(-1,1)`), im.setAttribute('x', sil.X0);
      svg.append(im);
    }
    const vars = M.bodyVars(this.m());
    const lm = svg.appendChild(svgEl('g', { class: 'ws-landmarks' }));
    for (const [k, name] of M.LANDMARKS) {
      const y = -vars[k];
      lm.append(svgEl('line', { x1: vx, x2: vx + vw, y1: y, y2: y, 'stroke-width': px, 'stroke-dasharray': `${4 * px} ${4 * px}` }));
      const t = svgEl('text', { x: vx + 6 * px, y: y - 3 * px, 'font-size': 10 * px });
      t.textContent = `${name} · ${k}`;
      lm.append(t);
    }
    lm.append(svgEl('line', { x1: 0, x2: 0, y1: vy, y2: vy + vh, 'stroke-width': px, class: 'ws-centre', 'stroke-dasharray': `${10 * px} ${3 * px} ${2 * px} ${3 * px}` }));
    const ct = svgEl('text', { x: 3 * px, y: vy + 14 * px, 'font-size': 10 * px, class: 'ws-centre-t' });
    ct.textContent = this.layer === 'front' ? 'centre front' : 'centre back';
    lm.append(ct);

    if (!this.d) { empty.hidden = false; empty.innerHTML = '<p>Start a pattern from the panel: a starter block, a blank board, or a copy of the current design.</p>'; this.setHint(''); return; }
    empty.hidden = true;
    const solved = this.solved();
    this.lastSolved = solved;
    const { panels } = M.expand(solved);
    this.lastPanels = panels;
    const insts = M.seamInstances(this.d, panels);
    const seamColor = new Map(this.d.seams.map((s, i) => [s.id, THREAD[i % THREAD.length]]));
    const seamNo = new Map(this.d.seams.map((s, i) => [s.id, i + 1]));

    const other = svg.appendChild(svgEl('g', { class: 'ws-other' }));
    const main = svg.appendChild(svgEl('g', { class: 'ws-main' }));
    const over = svg.appendChild(svgEl('g', { class: 'ws-over' }));
    const pathOf = (pts, edges) => {
      let d = '';
      edges.forEach((ed, i) => {
        const s = this.scr(ed.s), e = this.scr(ed.e);
        if (i === 0) d += `M${s[0]} ${s[1]}`;
        if (!ed.c || !ed.c.length) d += `L${e[0]} ${e[1]}`;
        else {
          const cs = ed.c.map(r => this.scr(M.relToAbs(ed.s, ed.e, r)));
          d += cs.length === 1 ? `Q${cs[0][0]} ${cs[0][1]} ${e[0]} ${e[1]}` : `C${cs[0][0]} ${cs[0][1]} ${cs[1][0]} ${cs[1][1]} ${e[0]} ${e[1]}`;
        }
      });
      return d + 'Z';
    };
    const edgeD = (ed) => {
      const s = this.scr(ed.s), e = this.scr(ed.e);
      if (!ed.c || !ed.c.length) return `M${s[0]} ${s[1]}L${e[0]} ${e[1]}`;
      const cs = ed.c.map(r => this.scr(M.relToAbs(ed.s, ed.e, r)));
      return cs.length === 1 ? `M${s[0]} ${s[1]}Q${cs[0][0]} ${cs[0][1]} ${e[0]} ${e[1]}` : `M${s[0]} ${s[1]}C${cs[0][0]} ${cs[0][1]} ${cs[1][0]} ${cs[1][1]} ${e[0]} ${e[1]}`;
    };
    const dispEdges = (pc, edges) => (pc.place ? edges.map(ed => ({ ...ed, s: this.disp(pc, ed.s), e: this.disp(pc, ed.e) })) : edges);

    const seamOn = new Map();   // `${panel name}:${edge}` -> seam id
    for (const it of insts) for (const sd of [it.A, it.B]) for (const { panel, edge } of sd) seamOn.set(`${panel.name}:${edge}`, it.seam.id);

    // panels: the drawn piece is editable; mirror copies / other layer are shown lighter
    for (const P of panels) {
      const pc = P.piece, pi = this.d.pieces.findIndex(x => x.id === pc.id);
      const onLayer = pc.layer === this.layer;
      if (!onLayer && !this.showOther) continue;
      const isMain = P.side === undefined ? true : P.side === 0;
      const g = svgEl('g', { class: `ws-piece ${onLayer ? '' : 'ghost'} ${isMain ? '' : 'mirror'} ${this.sel?.p === pc.id ? 'sel' : ''}`, 'data-p': pc.id });
      (onLayer ? main : other).append(g);
      const edges = dispEdges(pc, P.edges);
      const body = svgEl('path', { d: pathOf(null, edges), class: 'ws-fill', fill: SWATCH[pi % SWATCH.length], 'data-kind': 'piece', 'data-p': pc.id, 'stroke-width': 1.2 * px });
      g.append(body);
      if (P.fold) {   // fold line
        const a = this.scr([0, Math.max(...edges.map(e => e.s[1]))]), b = this.scr([0, Math.min(...edges.map(e => e.s[1]))]);
        g.append(svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'ws-fold', 'stroke-width': 1.4 * px, 'stroke-dasharray': `${8 * px} ${3 * px} ${2 * px} ${3 * px}` }));
      }
      // edges: seams in thread colours, hit areas
      edges.forEach((ed, k) => {
        // which drawn-piece edge this panel edge is
        const key = Object.entries(P.map).find(([, v]) => v === k)?.[0];
        if (!key) return;
        const [side, e] = key.split(':').map(Number);
        const sid = seamOn.get(`${P.name}:${k}`);
        const d = edgeD(ed);
        if (sid) g.append(svgEl('path', { d, class: 'ws-seam', stroke: seamColor.get(sid), 'stroke-width': 3 * px, fill: 'none', 'stroke-dasharray': `${5 * px} ${2.5 * px}` }));
        if (ed.label) {
          const mid = this.scr(M.edgePoint(ed.s, ed.e, ed.c, 0.5));
          const t = svgEl('text', { x: mid[0], y: mid[1] - 4 * px, 'font-size': 9 * px, class: 'ws-elabel', 'text-anchor': 'middle' });
          t.textContent = { lower_interface: 'waist', strapless_top: 'top', collar: 'neck' }[ed.label] || '';
          g.append(t);
        }
        const selE = this.sel && this.sel.p === pc.id && this.sel.e === e && (this.sel.side || 0) === side;
        const inPend = this.sew?.a && this.sew.a.p === pc.id && (this.sew.a.side || 0) === side && this.sew.a.e.includes(e);
        if (selE || inPend) g.append(svgEl('path', { d, class: 'ws-edge-sel', 'stroke-width': 4 * px, fill: 'none' }));
        const canHit = onLayer ? (isMain || this.tool === 'sew') : this.tool === 'sew';
        if (canHit) g.append(svgEl('path', { d, class: 'ws-edge-hit', 'stroke-width': 14 * px, fill: 'none', 'data-kind': 'edge', 'data-p': pc.id, 'data-e': e, 'data-side': side }));
      });
      if (isMain && onLayer) {
        // grain arrow + name
        const C = this.centroid(edges.map(e => e.s));
        const ga = (pc.grain || 0) * Math.PI / 180, L = 6;
        const a = this.scr([C[0] - Math.sin(ga) * L, C[1] - Math.cos(ga) * L]), b = this.scr([C[0] + Math.sin(ga) * L, C[1] + Math.cos(ga) * L]);
        g.append(svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'ws-grain', 'stroke-width': 1.2 * px, 'marker-start': 'url(#ws-arrow)', 'marker-end': 'url(#ws-arrow)' }));
        const cs = this.scr(C);
        const t = svgEl('text', { x: cs[0], y: cs[1] - 8 * px, 'font-size': 11 * px, class: 'ws-pname', 'text-anchor': 'middle' });
        t.textContent = pc.name + (pc.sym === 'pair' ? ' ×2' : '') + (pc.cutOnly || pc.role === 'flat' ? ' (cut only)' : '');
        g.append(t);
      }
    }
    // seam numbers (one badge per seam, on its first side)
    const badged = new Set();
    for (const it of insts) {
      if (badged.has(it.seam.id)) continue;
      for (const sd of [it.A, it.B]) {
        const { panel, edge } = sd[Math.floor(sd.length / 2)];
        if (panel.piece.layer !== this.layer) continue;
        const ed = dispEdges(panel.piece, [panel.edges[edge]])[0];
        const mid = this.scr(M.edgePoint(ed.s, ed.e, ed.c, 0.5));
        const g = over.appendChild(svgEl('g', { class: 'ws-badge', 'data-kind': 'seam', 'data-seam': it.seam.id }));
        g.append(svgEl('circle', { cx: mid[0], cy: mid[1], r: 7 * px, fill: seamColor.get(it.seam.id) }));
        const t = svgEl('text', { x: mid[0], y: mid[1] + 3.5 * px, 'font-size': 9.5 * px, 'text-anchor': 'middle' });
        t.textContent = seamNo.get(it.seam.id);
        g.append(t);
      }
      badged.add(it.seam.id);
    }
    // points + curve handles of the selected piece (or all pieces on this layer, smaller)
    for (const pc of solved.pieces) {
      if (pc.layer !== this.layer) continue;
      const selP = this.sel?.p === pc.id;
      const n = pc.P.length;
      if (selP && this.sel.e != null && !this.sel.side) {
        const i = this.sel.e, s = this.disp(pc, pc.P[i]), e = this.disp(pc, pc.P[(i + 1) % n]);
        const c = pc.pts[i].c || [];
        c.forEach((r, k) => {
          const q = this.scr(M.relToAbs(s, e, r)), anchor = this.scr(k === 0 ? s : e);
          over.append(svgEl('line', { x1: anchor[0], y1: anchor[1], x2: q[0], y2: q[1], class: 'ws-handle-line', 'stroke-width': px }));
          over.append(svgEl('circle', { cx: q[0], cy: q[1], r: 5 * px, class: 'ws-handle', 'data-kind': 'handle', 'data-p': pc.id, 'data-e': i, 'data-k': k }));
        });
      }
      pc.P.forEach((p0, i) => {
        const p = this.scr(this.disp(pc, p0));
        const f = M.isFormula(pc.pts[i].x) || M.isFormula(pc.pts[i].y);
        const on = selP && this.sel.pt === i;
        const r = (selP ? 5 : 3.6) * px;
        const attrs = { class: `ws-pt ${f ? 'formula' : ''} ${on ? 'on' : ''}`, 'data-kind': 'pt', 'data-p': pc.id, 'data-i': i, 'stroke-width': 1.3 * px };
        over.append(f ? svgEl('rect', { ...attrs, x: p[0] - r, y: p[1] - r, width: 2 * r, height: 2 * r, transform: `rotate(45 ${p[0]} ${p[1]})` }) : svgEl('circle', { ...attrs, cx: p[0], cy: p[1], r }));
      });
    }
    // drawing in progress
    if (this.tool === 'draw' && this.drawPts.length) {
      const pts = this.drawPts.map(p => this.scr(p));
      const cur = this.cursor ? this.scr(this.cursor) : pts[pts.length - 1];
      over.append(svgEl('polyline', { points: [...pts, cur].map(p => p.join(',')).join(' '), class: 'ws-drawline', 'stroke-width': 1.6 * px, fill: 'none' }));
      pts.forEach((p, i) => over.append(svgEl('circle', { cx: p[0], cy: p[1], r: (i === 0 ? 6 : 3.5) * px, class: i === 0 ? 'ws-pt first' : 'ws-pt', 'stroke-width': 1.3 * px })));
    }
    // measuring readout while dragging
    if (this.readout) {
      const [x, y, text] = this.readout, p = this.scr([x, y]);
      const t = svgEl('text', { x: p[0] + 10 * px, y: p[1] - 10 * px, 'font-size': 11 * px, class: 'ws-readout' });
      t.textContent = text;
      over.append(t);
    }
    this.updateHint();
  }
  centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; }
  setHint(t) { this.hint.textContent = t; this.hint.hidden = !t; }
  updateHint() {
    if (!this.d) return this.setHint('');
    if (this.tool === 'draw') return this.setHint(this.drawPts.length ? 'Click to add points · click the first point (or press Enter) to close the piece · Esc cancels' : `Click on the ${this.layer} of the body to place the first point of a new piece.`);
    if (this.tool === 'sew') return this.setHint(!this.sew?.a ? 'Click the first edge to sew (Shift+click to add the next edge along).' : this.sew.last ? 'Sewn. Shift+click to extend the second side, or click another edge to start a new seam.' : 'Now click the edge it is sewn to (other layer’s edges show faintly; Shift+click adds more edges to the first side).');
    if (this.sel?.pt != null) return this.setHint('Drag the point · Shift: no snapping · Delete removes it.');
    if (this.sel?.e != null) return this.setHint('Drag the edge to curve it · double-click to add a point · the panel has more options.');
    this.setHint('Drag points, edges or whole pieces · double-click an edge to add a point · scroll to zoom, drag the mat to pan.');
  }

  // ------------------------------------------------------------ pointer interaction
  hit(e) {
    const t = e.target.closest?.('[data-kind]');
    if (!t) return null;
    return { kind: t.dataset.kind, p: t.dataset.p, i: t.dataset.i != null ? +t.dataset.i : null, e: t.dataset.e != null ? +t.dataset.e : null, side: +(t.dataset.side || 0), k: t.dataset.k != null ? +t.dataset.k : null, seam: t.dataset.seam };
  }
  snap(p, e, exclude = null) {
    if (e.shiftKey) return p;
    const px = this.px();
    let [x, y] = p;
    // other points
    let best = 9 * px, bp = null;
    for (const pc of this.lastSolved?.pieces || []) pc.P.forEach((q0, i) => {
      if (exclude && exclude.p === pc.id && exclude.i === i) return;
      const q = this.disp(pc, q0), d = Math.hypot(q[0] - x, q[1] - y);
      if (d < best) { best = d; bp = q; }
    });
    if (bp) return [bp[0], bp[1]];
    if (Math.abs(x) < 8 * px) x = 0;
    const st = px > 0.3 ? 1 : 0.5;
    return [Math.round(x / st) * st, Math.round(y / st) * st];
  }
  onDown(e) {
    if (!this.d) return;
    this.svg.focus({ preventScroll: true });
    const w = this.world(e), h = this.hit(e);
    this.downAt = { x: e.clientX, y: e.clientY, w };
    if (this.tool === 'draw') return this.drawClick(e, w);
    if (this.tool === 'sew') return this.sewClick(e, h);
    if (!h || h.kind === 'seam') {
      if (h?.kind === 'seam') { this.sel = { seam: h.seam }; this.render(); return; }
      this.drag = { kind: 'pan', vb: [...this.vb], sx: e.clientX, sy: e.clientY };
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    const pc = this.piece(h.p);
    if (!pc) return;
    if (pc.layer !== this.layer) return;
    const sv = this.lastSolved.pieces.find(x => x.id === pc.id);
    this.svg.setPointerCapture(e.pointerId);
    if (h.kind === 'pt') {
      this.sel = { p: pc.id, pt: h.i };
      this.drag = { kind: 'pt', pc, i: h.i, start: clone(pc.pts[h.i]), at: this.disp(sv, sv.P[h.i]), w0: w };
    } else if (h.kind === 'handle') {
      this.drag = { kind: 'handle', pc, e: h.e, k: h.k };
    } else if (h.kind === 'edge' && h.side === 0) {
      this.sel = { p: pc.id, e: h.e };
      this.drag = { kind: 'bend', pc, e: h.e, start: clone(pc.pts[h.e].c || null), w0: w, moved: false };
    } else if (h.kind === 'piece' || h.kind === 'edge') {
      this.sel = { p: pc.id };
      this.drag = { kind: 'move', pc, start: clone(pc.pts), w0: w };
    }
    this.render();
  }
  onMove(e) {
    if (this.tool === 'draw') { this.cursor = this.snap(this.world(e), e); if (this.drawPts.length) this.render(); return; }
    const D = this.drag;
    if (!D) return;
    const w = this.world(e);
    if (D.kind === 'pan') {
      const r = this.svg.getBoundingClientRect();
      const k = D.vb[2] / r.width;
      this.vb = [D.vb[0] - (e.clientX - D.sx) * k, D.vb[1] - (e.clientY - D.sy) * k, D.vb[2], D.vb[3]];
      this.render();
      return;
    }
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 3 && !D.moved) return;
    D.moved = true;
    const off = D.pc.place ? D.pc.place.T : [0, 0];
    if (D.kind === 'pt') {
      const target = this.snap([D.at[0] + w[0] - D.w0[0], D.at[1] + w[1] - D.w0[1]], e, { p: D.pc.id, i: D.i });
      const local = [target[0] - (D.pc.place ? off[0] : 0), target[1] - (D.pc.place ? off[1] : 0)];
      this.setPoint(D.pc, D.i, D.start, local);
      this.readout = [target[0], target[1], `${fmt(Math.abs(target[0]))} cm ${target[0] >= 0 ? '' : '(right)'} · ${fmt(target[1])} cm high`];
    } else if (D.kind === 'move') {
      let dx = w[0] - D.w0[0], dy = w[1] - D.w0[1];
      if (!e.shiftKey) { dx = Math.round(dx * 2) / 2; dy = Math.round(dy * 2) / 2; }
      D.pc.pts = D.start.map(pt => ({ ...pt, x: shift(pt.x, dx), y: shift(pt.y, dy) }));
    } else if (D.kind === 'bend' || D.kind === 'handle') {
      const sv = M.solve({ ...this.d, pieces: [D.pc] }, this.m()).pieces[0];
      const n = sv.P.length, s = this.disp(sv, sv.P[D.e]), en = this.disp(sv, sv.P[(D.e + 1) % n]);
      const pt = D.pc.pts[D.e];
      if (D.kind === 'bend') {
        // the curve passes through the pointer at its middle
        if (!pt.c || pt.c.length !== 2) {
          const q = [2 * w[0] - (s[0] + en[0]) / 2, 2 * w[1] - (s[1] + en[1]) / 2];
          pt.c = [M.absToRel(s, en, q).map(v => Math.round(v * 1000) / 1000)];
        } else {
          const mid0 = M.edgePoint(s, en, D.start || pt.c, 0.5), d = [w[0] - mid0[0], w[1] - mid0[1]];
          pt.c = (D.start || pt.c).map(r => { const a = M.relToAbs(s, en, r); return M.absToRel(s, en, [a[0] + d[0] * 4 / 3, a[1] + d[1] * 4 / 3]); });
        }
        const L = M.edgeLength(s, en, pt.c);
        this.readout = [w[0], w[1], `edge ${fmt(L)} cm`];
      } else {
        pt.c[D.k] = M.absToRel(s, en, w).map(v => Math.round(v * 1000) / 1000);
      }
    }
    this.render();
  }
  onUp(e) {
    const D = this.drag;
    this.drag = null; this.readout = null;
    try { this.svg.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!D) return;
    if (D.kind === 'pan') {
      if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 4) { this.sel = null; this.render(); }
      return;
    }
    if (D.moved) this.changed(true); else this.render();
  }
  onDbl(e) {
    if (!this.d || this.tool !== 'select') return;
    const h = this.hit(e);
    if (h?.kind !== 'edge' || h.side) return;
    const pc = this.piece(h.p), sv = this.lastSolved.pieces.find(x => x.id === pc.id);
    const n = sv.P.length, s = this.disp(sv, sv.P[h.e]), en = this.disp(sv, sv.P[(h.e + 1) % n]);
    // parameter of the closest point on the edge
    const w = this.world(e);
    let bt = 0.5, bd = Infinity;
    for (let k = 1; k < 40; k++) { const q = M.edgePoint(s, en, pc.pts[h.e].c, k / 40), d = Math.hypot(q[0] - w[0], q[1] - w[1]); if (d < bd) { bd = d; bt = k / 40; } }
    const P2 = sv.P.map(p => this.disp(sv, p));
    const ni = M.insertPoint(this.d, pc, h.e, bt, P2);
    if (pc.place) { pc.pts[ni].x -= pc.place.T[0]; pc.pts[ni].y -= pc.place.T[1]; }
    this.sel = { p: pc.id, pt: ni };
    this.changed(true);
  }
  setPoint(pc, i, start, [x, y]) {
    const sv = M.solve({ ...this.d, pieces: [{ ...pc, pts: pc.pts.map((p, k) => (k === i ? start : p)) }] }, this.m()).pieces[0];
    const cur = sv.P[i];
    const pt = pc.pts[i];
    pt.x = M.isFormula(start.x) ? { f: start.x.f, d: Math.round(((+start.x.d || 0) + x - cur[0]) * 10) / 10 } : this.ungrade(pc, x, y, 'x');
    pt.y = M.isFormula(start.y) ? { f: start.y.f, d: Math.round(((+start.y.d || 0) + y - cur[1]) * 10) / 10 } : this.ungrade(pc, x, y, 'y');
  }
  /** A number entered on the current body, stored on the reference body (inverse grading). */
  ungrade(pc, x, y, axis) {
    if (this.d.grade === false || !this.d.ref || pc.place) return M.round1(axis === 'x' ? x : y);
    // invert the grading numerically (few Newton steps on the solved position)
    let gx = x, gy = y;
    for (let k = 0; k < 6; k++) {
      const s = M.solve({ ...this.d, pieces: [{ ...pc, pts: [{ x: gx, y: gy }, { x: gx + 1, y: gy }, { x: gx, y: gy + 1 }] }] }, this.m()).pieces[0].P;
      const J = [[s[1][0] - s[0][0], s[2][0] - s[0][0]], [s[1][1] - s[0][1], s[2][1] - s[0][1]]];
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0] || 1;
      const rx = x - s[0][0], ry = y - s[0][1];
      gx += (J[1][1] * rx - J[0][1] * ry) / det; gy += (-J[1][0] * rx + J[0][0] * ry) / det;
      if (Math.hypot(rx, ry) < 0.02) break;
    }
    return Math.round((axis === 'x' ? gx : gy) * 100) / 100;
  }
  drawClick(e, w) {
    const p = this.snap(w, e);
    const first = this.drawPts[0];
    if (first && this.drawPts.length >= 3 && Math.hypot(first[0] - p[0], first[1] - p[1]) < 10 * this.px()) return this.finishDraw();
    this.drawPts.push(p);
    this.render();
  }
  finishDraw() {
    const pts = this.drawPts;
    this.drawPts = [];
    if (pts.length < 3) { this.render(); return; }
    // counter-clockwise as seen from the front, like GarmentCode panels
    let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    if (a < 0) pts.reverse();
    const vars = M.bodyVars(this.m());
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length, cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const onCentre = pts.some((p, i) => Math.abs(p[0]) < 0.3 && Math.abs(pts[(i + 1) % pts.length][0]) < 0.3);
    const role = Math.abs(cx) > vars.shoulder_x + 4 && cy > vars.waist_y ? 'arm' : cy < vars.waist_y - 4 ? 'skirt' : 'body';
    const n = this.d.pieces.length + 1;
    const pc = {
      id: M.uid(), name: `Piece ${n}`, layer: this.layer, role, sym: onCentre ? 'fold' : Math.abs(cx) > 3 ? 'pair' : 'one', grain: 0,
      pts: pts.map(([x, y]) => ({ x: this.ungrade({}, x, y, 'x'), y: this.ungrade({}, x, y, 'y'), c: null })),
    };
    this.d.pieces.push(pc);
    this.sel = { p: pc.id };
    this.tool = 'select';
    this.changed(true);
    this.ctx.toast(`Added “${pc.name}”. Name it and sew its edges in the panel.`);
  }
  sewClick(e, h) {
    // edges on top of each other (a front and a back side seam): prefer one not on the first side's piece
    const cands = document.elementsFromPoint(e.clientX, e.clientY).filter(n => n.dataset?.kind === 'edge').map(n => this.hit({ target: n }));
    if (this.sew?.a && !this.sew.last && !e.shiftKey) {
      const other = cands.find(c => !(c.p === this.sew.a.p && !!c.side === !!this.sew.a.side));
      if (other) h = other;
    } else if (cands.length && (!h || h.kind !== 'edge')) h = cands[0];
    if (!h || h.kind !== 'edge') { this.sew = null; this.render(); return; }
    const ref = { p: h.p, e: [h.e], ...(h.side ? { side: 1 } : {}) };
    const S = this.sew;
    const sameSide = (r) => r.p === ref.p && !!r.side === !!ref.side;
    if (S?.last && e.shiftKey) {   // extend the second side of the seam just made
      const sm = this.d.seams.find(x => x.id === S.last);
      if (sm && sameSide(sm.b) && !sm.b.e.includes(h.e)) { sm.b.e.push(h.e); this.changed(true); return; }
    }
    if (!S?.a || S.last) { this.sew = { a: ref }; this.render(); return; }
    if (e.shiftKey && sameSide(S.a)) { if (!S.a.e.includes(h.e)) S.a.e.push(h.e); this.render(); return; }
    if (sameSide(S.a) && S.a.e.includes(h.e)) { this.sew = null; this.render(); return; }
    // an edge sewn already is unpicked first
    for (const r of [S.a, ref]) for (const ed of r.e) {
      const used = M.seamOfEdge(this.d, r.p, ed, r.side);
      if (used) this.d.seams = this.d.seams.filter(x => x !== used.seam);
    }
    // a seam to a piece's own mirror copy: the first side is the drawn one
    let a = S.a, b = ref;
    if (a.side && !b.side) [a, b] = [b, a];
    const sm = { id: M.uid(), a: clone(a), b: clone(b) };
    this.d.seams.push(sm);
    this.sew = { a: null, last: sm.id };
    this.sel = { seam: sm.id };
    this.changed(true);
  }
  onKey(e) {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key;
    if (k === 'v' || k === 'V') this.setTool('select');
    else if (k === 'p' || k === 'P') this.setTool('draw');
    else if (k === 's' || k === 'S') { if (!(e.ctrlKey || e.metaKey)) this.setTool('sew'); }
    else if (k === 'Escape') { this.drawPts = []; this.sew = null; this.sel = null; this.render(); }
    else if (k === 'Enter' && this.tool === 'draw') this.finishDraw();
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.deleteSel(); }
  }
  deleteSel() {
    const s = this.sel;
    if (!s || !this.d) return;
    if (s.seam) { this.d.seams = this.d.seams.filter(x => x.id !== s.seam); this.sel = null; return this.changed(true); }
    const pc = this.piece(s.p);
    if (!pc) return;
    if (s.pt != null) {
      if (!M.deletePoint(this.d, pc, s.pt)) return this.ctx.toast('A piece needs at least three points.');
      this.sel = { p: pc.id };
    } else if (s.e == null) {
      this.d.pieces = this.d.pieces.filter(x => x !== pc);
      this.d.seams = this.d.seams.filter(x => x.a.p !== pc.id && x.b.p !== pc.id);
      this.sel = null;
    } else return;
    this.changed(true);
  }

  // ------------------------------------------------------------ side panel
  renderPanel() {
    const P = this.panel;
    if (!this.d) { this.renderStart(P); return; }
    const d = this.d, sel = this.sel, pc = sel?.p ? this.piece(sel.p) : null;
    const solved = this.lastSolved || this.solved();
    const { panels } = M.expand(solved);
    const insts = M.seamInstances(d, panels);
    const problems = this.problems(solved, panels, insts);
    P.innerHTML = `
      <div class="ws-card ws-head">
        <input class="ws-name" value="${esc(d.name)}" aria-label="Pattern name">
        <div class="ws-head-row">
          <button class="btn small" data-a="new">New…</button>
          <button class="btn small" data-a="save" title="Keep this pattern in My designs">Save to My designs</button>
          <button class="btn small ghost" data-a="download" title="Download the pattern file">Download</button>
        </div>
      </div>
      ${problems.length ? `<div class="ws-card ws-problems"><b>Check</b><ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <div class="ws-card ws-inspect">${this.inspector(pc, solved, insts)}</div>
      <details class="ws-card" open><summary>Pieces <span class="muted">(${d.pieces.length})</span></summary>
        <ul class="ws-list">${d.pieces.map((p, i) => `<li class="${p.id === sel?.p ? 'on' : ''}" data-pick="${p.id}"><i style="background:${SWATCH[i % SWATCH.length]}"></i><span>${esc(p.name)}</span><small>${p.layer}${p.sym === 'pair' ? ' · ×2' : p.sym === 'fold' ? ' · on fold' : ''}${p.role === 'flat' || p.cutOnly ? ' · cut only' : ''}</small></li>`).join('')}</ul>
        <div class="ws-row"><button class="btn small" data-a="addrect">+ Rectangle</button><button class="btn small ghost" data-a="drawtool">Draw a piece</button></div>
      </details>
      <details class="ws-card" ${d.seams.length ? 'open' : ''}><summary>Seams <span class="muted">(${d.seams.length})</span></summary>
        ${d.seams.length ? `<ul class="ws-list">${d.seams.map((s, i) => {
    const it = insts.find(x => x.seam.id === s.id);
    const L = it ? M.seamLengths(it) : null;
    const diff = L ? L[0] - L[1] : 0;
    return `<li class="${sel?.seam === s.id ? 'on' : ''}" data-seam="${s.id}"><i class="dot" style="background:${THREAD[i % THREAD.length]}">${i + 1}</i><span>${esc(this.sideName(s.a))} ↔ ${esc(this.sideName(s.b))}</span><small class="${Math.abs(diff) > 1 ? 'bad' : ''}">${L ? `${fmt(L[0])} / ${fmt(L[1])} cm` : 'not sewn'}</small></li>`;
  }).join('')}</ul>` : '<p class="muted small">Use the Sew tool: click one edge, then the edge it joins.</p>'}
      </details>
      <details class="ws-card"><summary>Measurements &amp; numbers</summary>
        <p class="muted small">Type a formula into any point’s position to make it follow the body, e.g. <code>waist / 4 + ease</code>. Points drawn with the mouse keep their size relative to the body${d.grade === false ? ' only when grading is on' : ''}.</p>
        <label class="ws-check"><input type="checkbox" data-a="grade" ${d.grade !== false ? 'checked' : ''}> Drawn sizes follow the body (grade from the body it was drawn on)</label>
        <div class="ws-params">${Object.entries(d.params || {}).map(([k, v]) => `<div class="ws-param"><code>${esc(k)}</code><input type="number" step="0.5" value="${v}" data-param="${esc(k)}" aria-label="${esc(k)}"><button class="icon-btn" data-delparam="${esc(k)}" aria-label="Remove ${esc(k)}">✕</button></div>`).join('')}</div>
        <div class="ws-row"><input class="ws-newparam" placeholder="new_number" aria-label="New number name"><button class="btn small" data-a="addparam">Add number</button></div>
        <details class="ws-names"><summary class="small">Names you can use</summary><div class="ws-names-grid">${Object.entries(M.bodyVars(this.m())).filter(([k, v]) => typeof v === 'number' && !k.startsWith('_')).map(([k, v]) => `<code title="${fmt(v)}">${k}</code><span>${fmt(v)}</span>`).join('')}</div><p class="muted small">Also <code>min max abs sqrt round</code> and <code>sin cos tan</code> (degrees).</p></details>
      </details>`;
    this.bindPanel(P, pc, solved);
  }
  sideName(r) {
    const pc = this.piece(r.p);
    if (!pc) return '?';
    return `${pc.name}${r.side ? ' (mirror)' : ''} ${r.e.length > 1 ? `edges ${r.e.map(e => e + 1).join('+')}` : `edge ${r.e[0] + 1}`}`;
  }
  inspector(pc, solved, insts) {
    const sel = this.sel;
    if (sel?.seam) {
      const s = this.d.seams.find(x => x.id === sel.seam);
      if (!s) return '';
      const it = insts.find(x => x.seam.id === s.id), L = it ? M.seamLengths(it) : [0, 0];
      const diff = L[0] - L[1];
      return `<h3>Seam ${this.d.seams.indexOf(s) + 1}</h3>
        <p>${esc(this.sideName(s.a))}<br>sewn to ${esc(this.sideName(s.b))}</p>
        <p class="${Math.abs(diff) > 1 ? 'bad' : 'muted'} small">Lengths ${fmt(L[0])} and ${fmt(L[1])} cm${Math.abs(diff) > 1 ? ` — ${fmt(Math.abs(diff))} cm apart: the longer side will be eased or gathered in.` : ', matching.'}</p>
        <div class="ws-row"><button class="btn small" data-a="flipseam" title="Sew the edges the other way round (if the drape shows a twist)">Swap ends</button><button class="btn small ghost" data-a="unpick">Unpick seam</button></div>`;
    }
    if (!pc) return `<h3>Nothing selected</h3><p class="muted small">Click a piece, an edge or a point on the board. Diamonds are points that follow a formula; circles are drawn points.</p>`;
    const sv = solved.pieces.find(x => x.id === pc.id);
    if (sel.pt != null && sv) {
      const pt = pc.pts[sel.pt], val = sv.P[sel.pt];
      const field = (ax) => {
        const c = pt[ax], f = M.isFormula(c);
        return `<label class="ws-field"><span>${ax === 'x' ? 'Across (from centre)' : 'Height (from floor)'}</span>
          <input data-coord="${ax}" value="${esc(f ? c.f : fmt(c))}" spellcheck="false" aria-label="${ax === 'x' ? 'Across' : 'Height'} formula or number">
          <small>${f ? `= ${fmt(val[ax === 'x' ? 0 : 1])} cm${c.d ? ` (incl. ${c.d > 0 ? '+' : ''}${fmt(c.d)} dragged <button class="linkish" data-zero="${ax}">reset</button>)` : ''}` : `${fmt(val[ax === 'x' ? 0 : 1])} cm on this body`}</small></label>`;
      };
      return `<h3>${esc(pc.name)} · point ${sel.pt + 1}</h3>${field('x')}${field('y')}
        <p class="muted small">Enter a number, or a formula with body measurements like <code>hips / 4 + 2</code>.</p>
        <div class="ws-row"><button class="btn small ghost" data-a="delpt">Delete point</button></div>`;
    }
    if (sel.e != null && sv) {
      const n = sv.P.length, ed = M.pieceEdge(sv, sel.e);
      const L = M.edgeLength(ed.s, ed.e, ed.c);
      const used = M.seamOfEdge(this.d, pc.id, sel.e, 0);
      const ck = !ed.c || !ed.c.length ? 'line' : ed.c.length === 1 ? 'curve' : 's';
      return `<h3>${esc(pc.name)} · edge ${sel.e + 1}</h3>
        <p class="muted small">From point ${sel.e + 1} to ${(sel.e + 1) % n + 1} · ${fmt(L)} cm</p>
        <div class="seg ws-seg" role="group" aria-label="Edge shape">
          <button class="seg-btn ${ck === 'line' ? 'active' : ''}" data-curve="line">Straight</button>
          <button class="seg-btn ${ck === 'curve' ? 'active' : ''}" data-curve="curve">Curve</button>
          <button class="seg-btn ${ck === 's' ? 'active' : ''}" data-curve="s">S-curve</button>
        </div>
        <label class="ws-field"><span>This edge</span><select data-elabel>${Object.entries(M.EDGE_LABELS).map(([k, v]) => `<option value="${k}" ${ed.label === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <p class="small">${used ? `Sewn: seam ${this.d.seams.indexOf(used.seam) + 1}` : '<span class="muted">Not sewn. Use the Sew tool to join it to another edge.</span>'}</p>
        <div class="ws-row"><button class="btn small ghost" data-a="split">Add a point in the middle</button></div>`;
    }
    return `<h3>Piece</h3>
      <label class="ws-field"><span>Name</span><input data-pf="name" value="${esc(pc.name)}"></label>
      <label class="ws-field"><span>Sits on</span><select data-pf="layer"><option value="front" ${pc.layer === 'front' ? 'selected' : ''}>Front of the body</option><option value="back" ${pc.layer === 'back' ? 'selected' : ''}>Back of the body</option></select></label>
      <label class="ws-field"><span>Kind</span><select data-pf="role">${Object.entries(M.ROLES).map(([k, v]) => `<option value="${k}" ${pc.role === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <label class="ws-field"><span>Cut</span><select data-pf="sym">${Object.entries(M.SYMS).map(([k, v]) => `<option value="${k}" ${pc.sym === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="ws-field"><span>Grain (°)</span><input type="range" min="-90" max="90" step="5" data-pf="grain" value="${pc.grain || 0}"><small>${pc.grain ? `${pc.grain}° from the length of the piece` : 'Along the length (straight grain)'}</small></label>
      <label class="ws-check"><input type="checkbox" data-pf="rib" ${pc.rib ? 'checked' : ''}> Rib knit (stretches crosswise)</label>
      ${pc.place ? '<p class="muted small">Placed in 3D as in the original design.</p>' : ''}
      <div class="ws-row">
        <button class="btn small" data-a="dup">Duplicate</button>
        <button class="btn small" data-a="otherlayer" title="Copy this piece to the ${pc.layer === 'front' ? 'back' : 'front'}">Copy to ${pc.layer === 'front' ? 'back' : 'front'}</button>
        <button class="btn small ghost" data-a="delpiece">Delete</button>
      </div>`;
  }
  problems(solved, panels, insts) {
    const out = [...(solved.errors || [])];
    out.push(...M.expand(solved).errors);
    for (const it of insts) {
      const L = M.seamLengths(it);
      if (Math.abs(L[0] - L[1]) > Math.max(2, 0.15 * Math.max(...L))) out.push(`Seam ${this.d.seams.indexOf(it.seam) + 1}: one side is ${fmt(Math.abs(L[0] - L[1]))} cm longer (it will be gathered).`);
    }
    for (const pc of this.d.pieces) {
      if (pc.role === 'flat' || pc.cutOnly) continue;
      if (this.d.pieces.length > 1 && !this.d.seams.some(s => s.a.p === pc.id || s.b.p === pc.id)) out.push(`${pc.name} isn’t sewn to anything, so it will fall off. Sew it, or set its kind to “Not draped”.`);
    }
    return [...new Set(out)].slice(0, 8);
  }
  bindPanel(P, pc, solved) {
    const on = (sel, ev, f) => P.querySelectorAll(sel).forEach(n => n.addEventListener(ev, f));
    on('.ws-name', 'change', (e) => { this.d.name = e.target.value.trim() || 'My pattern'; this.changed(true); });
    on('[data-a]', 'click', (e) => this.action(e.currentTarget.dataset.a, e));
    on('[data-a="grade"]', 'change', (e) => { this.d.grade = e.target.checked; this.changed(true); });
    on('[data-pick]', 'click', (e) => { const p = this.piece(e.currentTarget.dataset.pick); if (p) { this.layer = p.layer; this.sel = { p: p.id }; this.render(); } });
    on('[data-seam]', 'click', (e) => { this.sel = { seam: e.currentTarget.dataset.seam }; this.render(); });
    on('[data-param]', 'change', (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { this.d.params[e.target.dataset.param] = v; this.changed(true); } });
    on('[data-delparam]', 'click', (e) => { delete this.d.params[e.currentTarget.dataset.delparam]; this.changed(true); });
    if (!pc) return;
    on('[data-pf]', 'change', (e) => {
      const k = e.target.dataset.pf;
      if (k === 'grain') pc.grain = +e.target.value;
      else if (k === 'rib') pc.rib = e.target.checked;
      else pc[k] = e.target.value;
      if (k === 'layer') { this.layer = pc.layer; delete pc.z; }
      if (k === 'role') delete pc.z;
      this.changed(true);
    });
    on('[data-coord]', 'change', (e) => {
      const ax = e.target.dataset.coord, v = e.target.value.trim(), pt = pc.pts[this.sel.pt];
      if (/^-?\d+(\.\d+)?$/.test(v)) {
        const sv = solved.pieces.find(x => x.id === pc.id), cur = sv.P[this.sel.pt];
        const xy = ax === 'x' ? [+v, cur[1]] : [cur[0], +v];
        pt[ax] = this.ungrade(pc, xy[0], xy[1], ax);
      } else {
        try { M.coordValue({ f: v, d: 0 }, { ...M.bodyVars(this.m()), ...this.d.params }); }
        catch (err) { e.target.classList.add('bad'); this.ctx.toast(`Formula: ${err.message}`); return; }
        pt[ax] = { f: v, d: 0 };
      }
      this.changed(true);
    });
    on('[data-zero]', 'click', (e) => { const pt = pc.pts[this.sel.pt]; pt[e.target.dataset.zero].d = 0; this.changed(true); });
    on('[data-curve]', 'click', (e) => {
      const pt = pc.pts[this.sel.e], k = e.currentTarget.dataset.curve;
      pt.c = k === 'line' ? null : k === 'curve' ? [[0.5, 0.12]] : [[0.3, 0.12], [0.7, -0.12]];
      this.changed(true);
    });
    on('[data-elabel]', 'change', (e) => { pc.pts[this.sel.e].label = e.target.value; this.changed(true); });
  }
  action(a, e) {
    const d = this.d, sel = this.sel, pc = sel?.p ? this.piece(sel.p) : null;
    if (a === 'new') { this.renderStart(this.panel, true); return; }
    if (a === 'save') return this.ctx.saveToLibrary(clone(d));
    if (a === 'download') return this.ctx.download(clone(d));
    if (a === 'drawtool') return this.setTool('draw');
    if (a === 'addrect') {
      const v = M.bodyVars(this.m());
      const x0 = 4, y0 = v.waist_y - 30;
      const npc = { id: M.uid(), name: `Piece ${d.pieces.length + 1}`, layer: this.layer, role: 'flat', sym: 'one', grain: 0,
        pts: [[x0, y0], [x0 + 20, y0], [x0 + 20, y0 + 15], [x0, y0 + 15]].map(([x, y]) => ({ x, y, c: null })) };
      d.pieces.push(npc); this.sel = { p: npc.id };
      return this.changed(true);
    }
    if (a === 'addparam') {
      const inp = this.panel.querySelector('.ws-newparam');
      const name = inp.value.trim().replace(/\W+/g, '_');
      if (!/^[A-Za-z_]\w*$/.test(name)) return this.ctx.toast('Use a name with letters, digits and _, like sleeve_ease.');
      if (name in M.bodyVars(this.m())) return this.ctx.toast(`“${name}” is a body measurement already.`);
      d.params[name] = 0; return this.changed(true);
    }
    if (a === 'flipseam' && sel?.seam) {
      const s = d.seams.find(x => x.id === sel.seam);
      if (s.dir) s.dir = s.dir === 'same' ? 'reverse' : 'same'; else s.flip = !s.flip;
      return this.changed(true);
    }
    if (a === 'unpick' && sel?.seam) { d.seams = d.seams.filter(x => x.id !== sel.seam); this.sel = null; return this.changed(true); }
    if (!pc) return;
    if (a === 'delpt') return this.deleteSel();
    if (a === 'split' && sel.e != null) {
      const sv = this.lastSolved.pieces.find(x => x.id === pc.id);
      const ni = M.insertPoint(d, pc, sel.e, 0.5, sv.P);
      this.sel = { p: pc.id, pt: ni };
      return this.changed(true);
    }
    if (a === 'delpiece') { this.sel = { p: pc.id }; return this.deleteSel(); }
    if (a === 'dup' || a === 'otherlayer') {
      const c = clone(pc);
      c.id = M.uid();
      if (a === 'dup') { c.name = `${pc.name} copy`; c.pts.forEach(p => { p.x = shift(p.x, 3); p.y = shift(p.y, -3); }); }
      else { c.layer = pc.layer === 'front' ? 'back' : 'front'; c.name = pc.name.replace(/front/i, m => (m[0] === 'F' ? 'Back' : 'back')) || pc.name; delete c.z; if (c.name === pc.name) c.name = `${pc.name} (${c.layer})`; this.layer = c.layer; }
      d.pieces.push(c); this.sel = { p: c.id };
      return this.changed(true);
    }
  }

  // ------------------------------------------------------------ start screen
  renderStart(P, fromDesign = false) {
    const canImport = this.ctx.canImport();
    P.innerHTML = `
      <div class="ws-card">
        <h3>Start a pattern</h3>
        <p class="muted small">Pieces are drawn over the dress form, front and back, in real centimetres. Starter blocks are drafted from your measurements, so they follow the body as you change it.</p>
        <div class="ws-blocks">
          ${BLOCKS.map(b => `<button class="ws-block" data-block="${b.id}"><b>${esc(b.name)}</b><small>${esc(b.description)}</small></button>`).join('')}
          <button class="ws-block" data-block="blank"><b>Blank board</b><small>Draw your own pieces from scratch.</small></button>
          <button class="ws-block" data-block="import" ${canImport ? '' : 'disabled'}><b>Copy the current design</b><small>${canImport ? 'Every piece of the GarmentCode design you are looking at, ready to change.' : 'Pick a GarmentCode design first (FreeSewing designs can’t be copied yet).'}</small></button>
        </div>
        ${fromDesign ? '<div class="ws-row"><button class="btn small ghost" data-block="cancel">Back to my pattern</button></div>' : ''}
      </div>
      <div class="ws-card ws-howto">
        <h3>How it works</h3>
        <ol class="small">
          <li><b>Draw</b> pieces where they sit on the body (the Front/Back switch flips the dress form).</li>
          <li><b>Shape</b> them: drag points and edges; type formulas like <code>waist / 4 + 2</code> to tie a point to a measurement.</li>
          <li><b>Sew</b> edges together, then watch the drape in 3D.</li>
          <li><b>Cut</b>: the Cutting tab lays your pieces out on the fabric.</li>
        </ol>
      </div>`;
    P.querySelectorAll('[data-block]').forEach(b => { b.onclick = () => this.start(b.dataset.block); });
  }
  async start(kind) {
    if (kind === 'cancel') return this.render();
    const m = this.m();
    let d;
    if (kind === 'blank') d = M.emptyDesign(m, 'My pattern');
    else if (kind === 'import') {
      try { d = await this.ctx.importCurrent(); } catch (e) { this.ctx.toast(`Could not copy the design: ${e.message}`); return; }
    } else {
      const b = BLOCKS.find(x => x.id === kind);
      d = { ...M.emptyDesign(m, b.name), ...b.make() };
    }
    this.d = d; this.sel = null; this.layer = 'front'; this.tool = kind === 'blank' ? 'draw' : 'select';
    this.ctx.split?.(this.split);
    setTimeout(() => { this.fit(); this.render(); }, 60);
    this.changed(true);
  }
}

function shift(c, dv) {
  if (M.isFormula(c)) return { f: c.f, d: Math.round(((+c.d || 0) + dv) * 10) / 10 };
  return Math.round((+c + dv) * 100) / 100;
}
