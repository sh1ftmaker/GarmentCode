// Sketchbook: mix-and-match builder for GarmentCode's MetaGarment.
// Steps through the modular parts (top, neckline, collar, sleeves, cuffs, waistband, bottom,
// extras) as rows of choice cards with small line drawings. A choice is applied through the
// app's normal parameter path (main.js passes `commit`), so undo/redo and the drape follow.
import { valueName } from './labels.js';

// ---------------------------------------------------------------- icons (48×48 line drawings)
const mirror = (pts) => pts.map(([x, y]) => [48 - x, y]);
const poly = (pts, close = true) => 'M' + pts.map(p => p.join(' ')).join(' L') + (close ? 'Z' : '');
const sleeve = (tip) => {   // right sleeve: shoulder (34,8) -> outer tip -> inner tip -> underarm (34,18)
  const r = [[34, 8], ...tip, [34, 18]];
  return poly(r, false) + ' ' + poly(mirror(r), false);
};
const TORSO = 'M18 6Q24 10 30 6L34 8V42H14V8Z';
const SHOULDERS = 'M4 15L16 10M44 15L32 10M4 15Q6 30 8 42M44 15Q42 30 40 42';
const neck = (d) => `${SHOULDERS}M${d}`;
const TEE = 'M17 8L21 6Q24 10 27 6L31 8L38 14L35 18L32 16V42H16V16L13 18L10 14Z';
const ICONS = {
  // top
  'top:none': { d: TEE, dash: true },
  'top:FittedShirt': 'M17 8L21 6Q24 10 27 6L31 8Q33 13 32 18Q29 26 31 42H17Q19 26 16 18Q15 13 17 8ZM20 25L21 32M28 25L27 32',
  'top:Shirt': 'M16 8L21 6Q24 10 27 6L32 8L40 15L36 20L33 17V42H15V17L12 20L8 15Z',
  // neckline (front / back)
  'neck:CircleNeckHalf': neck('16 10A8 8 0 0 0 32 10'),
  'neck:CurvyNeckHalf': neck('16 10C22 12 18 22 24 22C30 22 26 12 32 10'),
  'neck:VNeckHalf': neck('16 10L24 27L32 10'),
  'neck:SquareNeckHalf': neck('16 10V22H32V10'),
  'neck:TrapezoidNeckHalf': neck('16 10L20 22H28L32 10'),
  'neck:CircleArcNeckHalf': neck('16 10Q24 17 32 10'),
  'neck:Bezier2NeckHalf': neck('16 10C16 22 20 28 24 28C26 28 30 20 32 10'),
  'neck:strapless': 'M9 18Q16 13 24 18Q32 13 39 18M9 18Q10 30 11 42M39 18Q38 30 37 42',
  // collar
  'collar:none': neck('16 10A8 8 0 0 0 32 10'),
  'collar:Turtle': `${SHOULDERS}M17 2V13Q24 17 31 13V2M17 2Q24 6 31 2M17 7Q24 11 31 7`,
  'collar:SimpleLapel': `${SHOULDERS}M16 10L24 30L32 10M16 10L13 19L21 23M32 10L35 19L27 23`,
  'collar:Hood2Panels': `${SHOULDERS}M14 20C9 1 39 1 34 20M19 19C17 9 31 9 29 19M14 20Q24 26 34 20`,
  // sleeves
  'sleeve:none': 'M18 6Q24 10 30 6L33 7Q31 13 34 18V42H14V18Q17 13 15 7Z',
  'sleeve:short': TORSO + sleeve([[41, 14], [37, 19]]),
  'sleeve:elbow': TORSO + sleeve([[42, 23], [37, 25]]),
  'sleeve:threequarter': TORSO + sleeve([[43, 30], [38, 31]]),
  'sleeve:long': TORSO + sleeve([[44, 38], [39, 39]]),
  // cuffs (close-up of a sleeve end)
  'cuff:none': 'M14 4L18 36M34 4L30 36M18 36Q24 38 30 36',
  'cuff:CuffBand': 'M14 4L18 30M34 4L30 30M17 30H31V40H17ZM21 30V40M25 30V40',
  'cuff:CuffSkirt': 'M14 4L18 30M34 4L30 30M18 30H30L37 42Q24 45 11 42Z',
  'cuff:CuffBandSkirt': 'M14 4L18 26M34 4L30 26M17 26H31V32H17ZM17 32L11 43Q24 46 37 43L31 32',
  // waistband
  'wb:none': { d: 'M10 18H38M10 18L8 42M38 18L40 42M10 8V18M38 8V18', dashIdx: true },
  'wb:StraightWB': 'M10 15H38V24H10ZM10 24L8 42M38 24L40 42M10 6V15M38 6V15',
  'wb:FittedWB': 'M10 16Q24 11 38 16L37 25Q24 21 11 25ZM11 25L8 42M37 25L40 42M10 6V16M38 6V16',
  // bottom
  'bottom:none': { d: 'M17 8H31L35 42H13Z', dash: true },
  'bottom:SkirtCircle': 'M18 8H30L44 39Q24 46 4 39ZM21 8L14 42M27 8L34 42',
  'bottom:AsymmSkirtCircle': 'M18 8H30L44 28Q30 40 4 42ZM21 8L12 41M27 8L34 35',
  'bottom:GodetSkirt': 'M17 8H31L32 27L37 42H11L16 27ZM19 42L24 27L29 42',
  'bottom:Pants': 'M16 8H32L35 44H27L24 20L21 44H13Z',
  'bottom:Skirt2': 'M17 8H31L35 42H13Z',
  'bottom:SkirtManyPanels': 'M18 8H30L41 42H7ZM20.5 8L14 42M23 8L21 42M25 8L27 42M27.5 8L34 42',
  'bottom:PencilSkirt': 'M16 8H32Q35 22 31 42H17Q13 22 16 8ZM24 42V35',
  'bottom:SkirtLevels': 'M18 8H30L32 18H16ZM15 18H33L36 29H12ZM12 29H36L40 42H8Z',
  // extras
  'x:pocket': TEE + 'M18 31L21 25H27L30 31V37H18Z',
  'x:hemband': TEE + 'M16 36H32',
  'x:open': 'M17 8L21 6L23.5 9V42H16V16L13 18L10 14ZM31 8L27 6L24.5 9V42H32V16L35 18L38 14Z',
  'x:pantcuff': 'M16 8H32L34 36H27L24 20L21 36H14ZM14 36H21V42H14ZM27 36H34V42H27Z',
  'x:pantflare': 'M16 8H32L36 30H27L24 20L21 30H12ZM12 30H21L22 42H8ZM27 30H36L40 42H26Z',
};
function icon(key) {
  const ic = ICONS[key];
  if (!ic) return '';
  const d = typeof ic === 'string' ? ic : ic.d;
  const dash = typeof ic === 'object' ? ' stroke-dasharray="3 3"' : '';
  return `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="${d}"${dash}/></svg>`;
}

// ---------------------------------------------------------------- steps
const get = (d, path) => path.split('.').reduce((n, k) => n?.[k], d)?.v;
const HEAVY = new Set(['SkirtCircle', 'AsymmSkirtCircle', 'SkirtManyPanels']);   // GarmentCode hangs these from a waistband or a top
const SLEEVES = [
  { id: 'short', name: 'Short', len: 0.3 },
  { id: 'elbow', name: 'Elbow', len: 0.55 },
  { id: 'threequarter', name: '¾', len: 0.8 },
  { id: 'long', name: 'Long', len: 1.0 },
];
const NECKS = ['CircleNeckHalf', 'CurvyNeckHalf', 'VNeckHalf', 'SquareNeckHalf', 'TrapezoidNeckHalf', 'CircleArcNeckHalf', 'Bezier2NeckHalf'];

/**
 * Each step: { id, name, when(d), rows(d) -> [{ title?, multi?, choices: [{ id, name, icon, set: [[path, value]], active, hint? }] }] }
 */
const STEPS = [
  { id: 'top', name: 'Top', when: () => true, rows: (d) => [{ choices: [
    { id: 'none', name: 'No top', icon: 'top:none', set: [['meta.upper', null]] },
    { id: 'FittedShirt', name: valueName('FittedShirt'), icon: 'top:FittedShirt', set: [['meta.upper', 'FittedShirt']] },
    { id: 'Shirt', name: valueName('Shirt'), icon: 'top:Shirt', set: [['meta.upper', 'Shirt']] },
  ].map(c => ({ ...c, active: (get(d, 'meta.upper') ?? 'none') === c.id })) }] },

  { id: 'neck', name: 'Neckline', when: (d) => !!get(d, 'meta.upper'), rows: (d) => {
    const strapless = isStrapless(d);
    const front = NECKS.map(v => ({ id: v, name: valueName(v), icon: `neck:${v}`,
      set: [...(strapless ? [['shirt.strapless', false]] : []), ['collar.f_collar', v]], active: !strapless && get(d, 'collar.f_collar') === v }));
    if (get(d, 'meta.upper') === 'FittedShirt') front.push({ id: 'strapless', name: 'Strapless', icon: 'neck:strapless', set: [['shirt.strapless', true]], active: strapless });
    const rows = [{ title: 'Front', choices: front }];
    if (!strapless) rows.push({ title: 'Back', small: true, choices: NECKS.map(v => ({ id: v, name: valueName(v), icon: `neck:${v}`, set: [['collar.b_collar', v]], active: get(d, 'collar.b_collar') === v })) });
    const st = get(d, 'collar.component.style');
    return { rows, note: st === 'Turtle' || st === 'Hood2Panels' ? `The ${valueName(st).toLowerCase()} uses its own round neckline, so these show once you take it off.` : st === 'SimpleLapel' ? 'The lapel follows the front neckline; the back stays round.' : '' };
  } },

  { id: 'collar', name: 'Collar', when: (d) => !!get(d, 'meta.upper') && !isStrapless(d), rows: (d) => [{ choices: [
    { id: 'none', name: 'No collar', icon: 'collar:none', set: [['collar.component.style', null]] },
    { id: 'Turtle', name: valueName('Turtle'), icon: 'collar:Turtle', set: [['collar.component.style', 'Turtle']] },
    { id: 'SimpleLapel', name: valueName('SimpleLapel'), icon: 'collar:SimpleLapel', set: [['collar.component.style', 'SimpleLapel']] },
    { id: 'Hood2Panels', name: valueName('Hood2Panels'), icon: 'collar:Hood2Panels', set: [['collar.component.style', 'Hood2Panels']] },
  ].map(c => ({ ...c, active: (get(d, 'collar.component.style') ?? 'none') === c.id })) }] },

  { id: 'sleeve', name: 'Sleeves', when: (d) => !!get(d, 'meta.upper') && !isStrapless(d), rows: (d) => {
    const cur = sleeveId(d);
    return [{ choices: [
      { id: 'none', name: 'Sleeveless', icon: 'sleeve:none', set: [['sleeve.sleeveless', true]] },
      ...SLEEVES.map(s => ({ id: s.id, name: s.name, icon: `sleeve:${s.id}`, set: [['sleeve.sleeveless', false], ['sleeve.length', s.len]] })),
    ].map(c => ({ ...c, active: c.id === cur })) }];
  } },

  { id: 'cuff', name: 'Cuffs', when: (d) => !!get(d, 'meta.upper') && !isStrapless(d) && !get(d, 'sleeve.sleeveless'), rows: (d) => [{ choices: [
    { id: 'none', name: 'Plain hem', icon: 'cuff:none', set: [['sleeve.cuff.type', null]] },
    ...['CuffBand', 'CuffSkirt', 'CuffBandSkirt'].map(v => ({ id: v, name: valueName(v), icon: `cuff:${v}`, set: [['sleeve.cuff.type', v]] })),
  ].map(c => ({ ...c, active: (get(d, 'sleeve.cuff.type') ?? 'none') === c.id })) }] },

  { id: 'wb', name: 'Waistband', when: () => true, rows: (d) => [{ choices: [
    { id: 'none', name: 'None', icon: 'wb:none', set: [['meta.wb', null]] },
    { id: 'StraightWB', name: valueName('StraightWB'), icon: 'wb:StraightWB', set: [['meta.wb', 'StraightWB']] },
    { id: 'FittedWB', name: valueName('FittedWB'), icon: 'wb:FittedWB', set: [['meta.wb', 'FittedWB']] },
  ].map(c => ({ ...c, active: (get(d, 'meta.wb') ?? 'none') === c.id })) }] },

  { id: 'bottom', name: 'Bottom', when: () => true, rows: (d) => [{ choices: [
    { id: 'none', name: 'No bottom', icon: 'bottom:none', set: [['meta.bottom', null]] },
    ...['Skirt2', 'PencilSkirt', 'SkirtCircle', 'AsymmSkirtCircle', 'SkirtManyPanels', 'GodetSkirt', 'SkirtLevels', 'Pants']
      .map(v => ({ id: v, name: valueName(v).replace(/ skirt$/, ''), icon: `bottom:${v}`, set: [['meta.bottom', v]] })),
  ].map(c => ({ ...c, active: (get(d, 'meta.bottom') ?? 'none') === c.id })) }] },

  { id: 'extras', name: 'Extras', when: (d) => !!get(d, 'meta.upper') || get(d, 'meta.bottom') === 'Pants', rows: (d) => {
    const ch = [];
    if (get(d, 'meta.upper')) {
      const loose = get(d, 'meta.upper') === 'Shirt';
      if (loose) ch.push({ id: 'pocket', name: 'Kangaroo pocket', icon: 'x:pocket', set: [['shirt.pocket.type', get(d, 'shirt.pocket.type') ? null : 'KangarooPocket']], active: !!get(d, 'shirt.pocket.type') });
      ch.push({ id: 'hemband', name: 'Hem band', icon: 'x:hemband', set: [['shirt.hem_band.enable', !get(d, 'shirt.hem_band.enable')]], active: !!get(d, 'shirt.hem_band.enable') });
      ch.push({ id: 'open', name: 'Open front', icon: 'x:open', set: [['shirt.open_front', !get(d, 'shirt.open_front')]], active: !!get(d, 'shirt.open_front') });
    }
    if (get(d, 'meta.bottom') === 'Pants') {
      const cuff = get(d, 'pants.cuff.type');
      ch.push({ id: 'pantcuff', name: 'Leg cuffs', icon: 'x:pantcuff', set: [['pants.cuff.type', cuff === 'CuffBand' ? null : 'CuffBand']], active: cuff === 'CuffBand' });
      ch.push({ id: 'pantflare', name: 'Flared cuffs', icon: 'x:pantflare', set: [['pants.cuff.type', cuff === 'CuffBandSkirt' ? null : 'CuffBandSkirt']], active: cuff === 'CuffBandSkirt' });
    }
    const note = get(d, 'meta.upper') === 'FittedShirt' ? 'The kangaroo pocket needs the loose shirt (the fitted bodice has darts in the way).' : '';
    return { rows: [{ multi: true, choices: ch }], note };
  } },
];
function isStrapless(d) { return get(d, 'meta.upper') === 'FittedShirt' && !!get(d, 'shirt.strapless'); }
function sleeveId(d) {
  if (get(d, 'sleeve.sleeveless')) return 'none';
  const len = get(d, 'sleeve.length') ?? 0.3;
  return SLEEVES.reduce((a, b) => (Math.abs(b.len - len) < Math.abs(a.len - len) ? b : a)).id;
}
const normRows = (r) => (Array.isArray(r) ? { rows: r, note: '' } : r);

/** One-line summary of the outfit, e.g. "Fitted bodice · V-neck · Short sleeves · Circle skirt". */
export function outfitSummary(d) {
  const parts = [];
  const up = get(d, 'meta.upper');
  if (up) {
    parts.push(valueName(up));
    if (isStrapless(d)) parts.push('strapless');
    else {
      const st = get(d, 'collar.component.style');
      const nk = valueName(get(d, 'collar.f_collar')).toLowerCase();
      parts.push(st ? valueName(st).toLowerCase() : /neck/.test(nk) ? nk : `${nk} neck`);
      const sl = sleeveId(d);
      parts.push(sl === 'none' ? 'sleeveless' : `${SLEEVES.find(s => s.id === sl).name.toLowerCase()} sleeves`);
    }
  }
  if (get(d, 'meta.wb')) parts.push(`${valueName(get(d, 'meta.wb')).toLowerCase()} waistband`);
  if (get(d, 'meta.bottom')) parts.push(valueName(get(d, 'meta.bottom')).toLowerCase());
  return parts.join(' · ') || 'Nothing yet';
}

// ---------------------------------------------------------------- UI
let api = null, stepId = 'top', lastNote = '';
/** api: { getState() -> S, commit(pairs) -> Promise } */
export function initMixer(a) { api = a; }

/** Extra changes so a choice doesn't land on a combination GarmentCode refuses. */
function fixups(d, pairs) {
  const next = JSON.parse(JSON.stringify(d));
  for (const [p, v] of pairs) { const n = p.split('.').reduce((x, k) => x?.[k], next); if (n) n.v = v; }
  const extra = [];
  let note = '';
  if (HEAVY.has(get(next, 'meta.bottom')) && !get(next, 'meta.upper') && !get(next, 'meta.wb')) {
    extra.push(['meta.wb', 'StraightWB']);
    note = 'Added a straight waistband: GarmentCode hangs full skirts from a waistband or a top.';
  }
  if (!get(next, 'meta.upper') && !get(next, 'meta.bottom')) {
    stepId = 'bottom';   // nothing left to drape: go straight to the bottoms
    note = 'Nothing to drape without a top: pick a bottom.';
  }
  return { pairs: [...pairs, ...extra], note };
}

async function choose(c) {
  const S = api.getState();
  if (!S.design || S.source) return;
  const { pairs, note } = fixups(S.design, c.set);
  lastNote = note;
  await api.commit(pairs.map(([p, v]) => [p.split('.'), v]));
}

export function renderMixer(root) {
  root = root || document.getElementById('mixer');
  if (!root || !api) return;
  const S = api.getState();
  const d = S.design;
  root.innerHTML = '';
  root.hidden = !!S.source || !d?.meta;
  if (root.hidden) return;
  const steps = STEPS.filter(s => s.when(d));
  if (!steps.find(s => s.id === stepId)) stepId = steps[0].id;
  const i = steps.findIndex(s => s.id === stepId), step = steps[i];

  const head = document.createElement('div');
  head.className = 'mx-head';
  head.innerHTML = `<h3>Sketchbook</h3><span class="mx-sum"></span>`;
  head.querySelector('.mx-sum').textContent = outfitSummary(d);

  const tabs = document.createElement('div');
  tabs.className = 'mx-steps';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Garment parts');
  steps.forEach((s, k) => {
    const cur = normRows(s.rows(d)).rows.flatMap(r => r.choices.filter(c => c.active).map(c => c.name));
    const b = document.createElement('button');
    b.className = 'mx-step' + (s.id === stepId ? ' on' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(s.id === stepId));
    b.innerHTML = `<span class="mx-n">${k + 1}</span><span class="mx-sn"></span><small></small>`;
    b.querySelector('.mx-sn').textContent = s.name;
    b.querySelector('small').textContent = cur.length ? cur.join(' / ') : '–';
    b.onclick = () => { stepId = s.id; lastNote = ''; renderMixer(root); root.querySelector('.mx-step.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
    tabs.append(b);
  });

  const body = document.createElement('div');
  body.className = 'mx-body';
  body.setAttribute('role', 'tabpanel');
  const { rows, note } = normRows(step.rows(d));
  for (const r of rows) {
    if (r.title) { const t = document.createElement('div'); t.className = 'mx-rowhead'; t.textContent = r.title; body.append(t); }
    const row = document.createElement('div');
    row.className = 'mx-row' + (r.small ? ' small' : '');
    row.setAttribute('role', r.multi ? 'group' : 'radiogroup');
    row.setAttribute('aria-label', `${step.name}${r.title ? ' ' + r.title.toLowerCase() : ''}`);
    for (const c of r.choices) {
      const b = document.createElement('button');
      b.className = 'mx-card' + (c.active ? ' on' : '');
      b.setAttribute(r.multi ? 'aria-pressed' : 'aria-checked', String(!!c.active));
      if (!r.multi) b.setAttribute('role', 'radio');
      b.innerHTML = icon(c.icon) + '<span></span>';
      b.querySelector('span').textContent = c.name;
      b.title = r.multi ? `${c.active ? 'Remove' : 'Add'} ${c.name.toLowerCase()}` : c.name;
      b.onclick = () => { if (!r.multi && c.active) return; choose(c); };
      row.append(b);
    }
    if (!r.choices.length) { const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'Nothing to add here.'; row.append(p); }
    body.append(row);
  }
  for (const n of [note, lastNote].filter(Boolean)) { const p = document.createElement('p'); p.className = 'mx-note'; p.textContent = n; body.append(p); }

  const nav = document.createElement('div');
  nav.className = 'mx-nav';
  const go = (k) => { stepId = steps[k].id; lastNote = ''; renderMixer(root); };
  const prev = document.createElement('button'); prev.className = 'btn ghost'; prev.textContent = '‹ Back'; prev.disabled = i === 0; prev.onclick = () => go(i - 1);
  const next = document.createElement('button'); next.className = 'btn'; next.textContent = i < steps.length - 1 ? `Next: ${steps[i + 1].name} ›` : 'Done'; next.onclick = () => (i < steps.length - 1 ? go(i + 1) : document.querySelector('.ft-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const pos = document.createElement('span'); pos.className = 'muted small'; pos.textContent = `${i + 1} / ${steps.length}`;
  nav.append(prev, pos, next);

  const ft = document.createElement('h3');
  ft.className = 'ft-head';
  ft.innerHTML = 'Fine-tune <small class="muted">every GarmentCode parameter</small>';
  root.append(head, tabs, body, nav, ft);
}
