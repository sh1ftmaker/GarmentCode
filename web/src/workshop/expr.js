// Tiny, safe arithmetic for pattern formulas ("waist / 4 + ease"): numbers, names, + - * / ^,
// parentheses and a few functions. No eval: formulas come from saved designs and share links.

const FUNCS = {
  min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, round: Math.round,
  sin: (d) => Math.sin(d * Math.PI / 180), cos: (d) => Math.cos(d * Math.PI / 180),
  tan: (d) => Math.tan(d * Math.PI / 180),
};

function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\S))/y;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) out.push({ t: 'n', v: +m[1] });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined) {
      if (!'+-*/^(),'.includes(m[3])) throw new Error(`Unexpected “${m[3]}”`);
      out.push({ t: m[3] });
    }
  }
  return out;
}

/** Parse a formula into a function of a variable table. Throws with a readable message. */
export function compile(src) {
  const tk = tokenize(String(src));
  let i = 0;
  const peek = () => tk[i], take = (t) => { if (tk[i]?.t !== t) throw new Error(`Expected “${t}”`); return tk[i++]; };
  const names = new Set();
  function primary() {
    const k = tk[i++];
    if (!k) throw new Error('Formula ends too early');
    if (k.t === 'n') return () => k.v;
    if (k.t === '(') { const e = sum(); take(')'); return e; }
    if (k.t === '-') { const e = power(); return (v) => -e(v); }
    if (k.t === '+') return power();
    if (k.t === 'id') {
      if (peek()?.t === '(') {
        const f = FUNCS[k.v];
        if (!f) throw new Error(`Unknown function “${k.v}”`);
        i++;
        const args = [];
        if (peek()?.t !== ')') { args.push(sum()); while (peek()?.t === ',') { i++; args.push(sum()); } }
        take(')');
        return (v) => f(...args.map(a => a(v)));
      }
      names.add(k.v);
      return (v) => {
        if (!(k.v in v)) throw new Error(`Unknown name “${k.v}”`);
        return v[k.v];
      };
    }
    throw new Error(`Unexpected “${k.t}”`);
  }
  function power() {
    const b = primary();
    if (peek()?.t === '^') { i++; const e = power(); return (v) => b(v) ** e(v); }
    return b;
  }
  function product() {
    let a = power();
    while (peek()?.t === '*' || peek()?.t === '/') {
      const op = tk[i++].t, b = power(), l = a;
      a = op === '*' ? (v) => l(v) * b(v) : (v) => l(v) / b(v);
    }
    return a;
  }
  function sum() {
    let a = product();
    while (peek()?.t === '+' || peek()?.t === '-') {
      const op = tk[i++].t, b = product(), l = a;
      a = op === '+' ? (v) => l(v) + b(v) : (v) => l(v) - b(v);
    }
    return a;
  }
  if (!tk.length) throw new Error('Empty formula');
  const f = sum();
  if (i < tk.length) throw new Error(`Unexpected “${tk[i].t === 'id' || tk[i].t === 'n' ? tk[i].v : tk[i].t}”`);
  f.names = names;
  return f;
}

const cache = new Map();
/** Evaluate a formula (cached compile). Returns NaN-free number or throws. */
export function evaluate(src, vars) {
  let f = cache.get(src);
  if (!f) { f = compile(src); if (cache.size > 2000) cache.clear(); cache.set(src, f); }
  const r = f(vars);
  if (!Number.isFinite(r)) throw new Error('Not a number');
  return r;
}
