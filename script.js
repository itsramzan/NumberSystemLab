'use strict';
/* ===================== ENGINE (no DOM) =====================
 * Pipeline: text → parseNumber (sign, int digits, frac digits)
 *   → toRat (exact BigInt fraction n/d) → operation → fromRat (target base) → steps.
 * Rational arithmetic keeps everything exact; only non-terminating
 * results are cut at "max fractional digits" and flagged Approximate. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SUBS = '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089', SUPS = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079';
const sub = n => String(n).replace(/\d/g, d => SUBS[d]);
const sup = n => String(n).replace(/\d/g, d => SUPS[d]).replace('-', '\u207b');
const NAMES = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hexadecimal' };
const baseName = b => NAMES[b] || `Base ${b}`;
class MathError extends Error {}
const fail = m => { throw new MathError(m); };
const allowed = b => b === 2 ? '0 and 1' : b <= 10 ? `0–${b - 1}` : `0–9 and A–${DIGITS[b - 1]}`;

function validateBase(v) {
  const b = Number(v);
  if (v === '' || !Number.isInteger(b) || b < 2 || b > 36) fail(`Invalid base ${v === '' ? '(empty)' : v}.\n\nA base must be a whole number from 2 to 36.`);
  return b;
}

// Splits text into sign / integer digits / fraction digits and validates each digit.
function parseNumber(text, base) {
  let s = String(text).replace(/\s+/g, '').toUpperCase();
  if (!s) fail('Please enter a number.');
  if (s.length > 400) fail('Number too large.\n\nPlease use at most 400 digits.');
  let neg = false;
  if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
  if ((s.match(/\./g) || []).length > 1) fail('Invalid number.\n\nA number can have only one decimal point.');
  const [i, f = ''] = s.split('.');
  if (!i && !f) fail('Invalid number.\n\nEnter at least one digit.');
  for (const ch of i + f) {
    const v = DIGITS.indexOf(ch);
    if (v < 0 || v >= base) {
      const sign = ch === '-' ? '\n\nA minus sign is allowed only at the very start.' : '';
      fail(`⚠ Invalid digit ${ch}.\n\n${baseName(base)} (base ${base}) only allows:\n${allowed(base)}${sign}`);
    }
  }
  return { neg, int: i || '0', frac: f, base };
}
const show = p => (p.neg ? '-' : '') + p.int + (p.frac ? '.' + p.frac : '');
const digitsToBig = (s, b) => { const B = BigInt(b); let n = 0n; for (const c of s) n = n * B + BigInt(DIGITS.indexOf(c)); return n; };
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const mk = (n, d) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
// Σ digit × base^position  →  exact fraction (int+frac digits) / base^(frac length)
const toRat = p => mk((p.neg ? -1n : 1n) * digitsToBig(p.int + p.frac, p.base), BigInt(p.base) ** BigInt(p.frac.length));

// Fraction → digits in `b`: integer by BigInt radix, fraction by repeated multiplication.
function fromRat(r, b, maxF) {
  const B = BigInt(b), neg = r.n < 0n, n = neg ? -r.n : r.n, ip = n / r.d;
  let rem = n % r.d, f = '', exact = true;
  for (let k = 0; rem !== 0n; k++) {
    if (k >= maxF) { exact = false; break; }
    rem *= B; f += DIGITS[Number(rem / r.d)]; rem %= r.d;
  }
  const int = ip.toString(b).toUpperCase();
  return { int, frac: f, exact, text: (neg && (ip > 0n || f) ? '-' : '') + int + (f ? '.' + f : '') };
}
const dtxt = (n, d, m = 30) => fromRat(mk(n, d), 10, m).text;

/* ---------- step generators ---------- */
function expandSteps(p, maxF) {
  const b = p.base, B = BigInt(b), dv = c => DIGITS.indexOf(c), lbl = c => dv(c) > 9 ? `${c}(${dv(c)})` : c;
  const iL = [...p.int], st = [];
  const iv = iL.map((c, i) => BigInt(dv(c)) * B ** BigInt(iL.length - 1 - i));
  const intSum = iv.reduce((a, v) => a + v, 0n);
  st.push({ title: 'Integer part — positional expansion', lines: [
    iL.map((c, i) => `${lbl(c)} × ${b}${sup(iL.length - 1 - i)}`).join('\n+ '), '= ' + iv.join(' + '), '= ' + intSum] });
  let fracText = '0';
  if (p.frac) {
    const fL = [...p.frac];
    fracText = dtxt(digitsToBig(p.frac, b), B ** BigInt(fL.length));
    st.push({ title: 'Fractional part — negative powers', lines: [
      fL.map((c, i) => `${lbl(c)} × ${b}${sup(-(i + 1))}`).join('\n+ '),
      '= ' + fL.map((c, i) => dtxt(BigInt(dv(c)), B ** BigInt(i + 1))).join(' + '), '= ' + fracText] });
  }
  const total = fromRat(toRat({ ...p, neg: false }), 10, maxF).text;
  st.push({ title: 'Decimal value', lines: [`${intSum} + ${fracText} = ${total}${sub(10)}`] });
  return st;
}

function decToBaseSteps(r, b, maxF) {
  const n = r.n < 0n ? -r.n : r.n, B = BigInt(b), ip = n / r.d, st = [], lines = [];
  let q = ip;
  if (q === 0n) lines.push(`0 ÷ ${b} = 0 remainder 0`);
  while (q > 0n && lines.length < 80) {
    const rem = q % B;
    lines.push(`${q} ÷ ${b} = ${q / B} remainder ${rem}${rem > 9n ? ` (${DIGITS[Number(rem)]})` : ''}`);
    q /= B;
  }
  st.push({ title: `Integer part ${ip} → base ${b} (repeated division)`, lines: [...lines, '', 'Read remainders from bottom to top:', ip.toString(b).toUpperCase() + sub(b)] });
  let rem = n % r.d;
  if (rem > 0n) {
    const fl = []; let digs = '';
    for (let k = 0; rem > 0n && k < maxF; k++) {
      const prev = rem, prod = rem * B, d = prod / r.d; rem = prod % r.d; digs += DIGITS[Number(d)];
      fl.push(`${dtxt(prev, r.d)} × ${b} = ${dtxt(prod, r.d)} → ${DIGITS[Number(d)]}`);
    }
    fl.push('', 'Read integer parts from top to bottom:', '0.' + digs + sub(b));
    if (rem > 0n) fl.push('', `Still not zero after ${maxF} digits → approximate result.`);
    st.push({ title: 'Fractional part (repeated multiplication)', lines: fl });
  }
  return st;
}

// Binary ↔ Octal/Hex shortcut (3-bit and 4-bit groups)
function groupSteps(p, t) {
  const f = p.base;
  if (f === 2 && (t === 8 || t === 16)) {
    const k = t === 8 ? 3 : 4, pad = (s, left) => { const m = (k - s.length % k) % k; return left ? '0'.repeat(m) + s : s + '0'.repeat(m); };
    const split = s => s.match(new RegExp(`.{${k}}`, 'g')) || [];
    const gi = split(pad(p.int, true)), gf = p.frac ? split(pad(p.frac, false)) : [], dg = g => DIGITS[parseInt(g, 2)];
    return { title: `Shortcut — group bits in ${k}s`, hl: true, lines: [
      `${show(p)}${sub(2)}`, 'Group around the point (pad with 0):', gi.join(' ') + (gf.length ? ' . ' + gf.join(' ') : ''), '',
      ...gi.concat(gf).map(g => `${g}${sub(2)} = ${dg(g)}`), '',
      `= ${gi.map(dg).join('')}${gf.length ? '.' + gf.map(dg).join('') : ''}${sub(t)}`] };
  }
  if (t === 2 && (f === 8 || f === 16)) {
    const k = f === 8 ? 3 : 4, bits = c => parseInt(c, f).toString(2).padStart(k, '0'), m = s => [...s].map(c => `${c} = ${bits(c)}`);
    return { title: `Shortcut — each base-${f} digit → ${k} bits`, hl: true, lines: [
      ...m(p.int), ...(p.frac ? ['.', ...m(p.frac)] : []), '',
      `= ${[...p.int].map(bits).join('')}${p.frac ? '.' + [...p.frac].map(bits).join('') : ''}${sub(2)} (leading zeros can be dropped)`] };
  }
  return null;
}

function convertNumber(input, from, to, maxF = 10) {
  const p = parseNumber(input, from), r = toRat(p), out = fromRat(r, to, maxF), steps = [];
  if (p.neg) steps.push({ title: 'Sign', lines: ['The number is negative.', 'Convert the magnitude, then put − in front.'] });
  const g = groupSteps(p, to);
  if (from === to) steps.push({ title: 'Same base', lines: ['Source and target base are equal, so the number is unchanged.'] });
  else if (g) steps.push(g);
  else {
    if (from !== 10) steps.push(...expandSteps(p, maxF));
    if (to !== 10) steps.push(...decToBaseSteps(r, to, maxF));
  }
  steps.push({ title: 'Final answer', lines: [`${show(p)}${sub(from)} = ${out.text}${sub(to)}`, out.exact ? 'Exact result' : `Approximate result (cut at ${maxF} fractional digits)`] });
  return { operation: 'conversion', sourceBase: from, targetBase: to, input: show(p), result: out.text, exact: out.exact, maxF,
    inputText: show(p) + sub(from), resultText: out.text + sub(to), steps };
}

const OPS = {
  '+': (a, b) => mk(a.n * b.d + b.n * a.d, a.d * b.d),
  '-': (a, b) => mk(a.n * b.d - b.n * a.d, a.d * b.d),
  '×': (a, b) => mk(a.n * b.n, a.d * b.d),
  '÷': (a, b) => { if (b.n === 0n) fail('Division by zero is undefined.\n\nChange the divisor to a non-zero number.'); return mk(a.n * b.d, a.d * b.n); }
};

function columnAdd(a, b, base) {
  const n = Math.max(a.length, b.length); a = a.padStart(n, '0'); b = b.padStart(n, '0');
  let c = 0, res = '', notes = []; const car = Array(n + 1).fill(' ');
  for (let i = n - 1; i >= 0; i--) {
    const x = DIGITS.indexOf(a[i]), y = DIGITS.indexOf(b[i]), s = x + y + c, d = s % base, co = Math.floor(s / base);
    notes.push(`Column ${n - i}: ${a[i]} + ${b[i]}${c ? ' + carry ' + c : ''} = ${s}` + (s >= base ? ` = ${DIGITS[co]}${DIGITS[d]}${sub(base)} → write ${DIGITS[d]}, carry ${co}` : ` → write ${DIGITS[d]}`));
    res = DIGITS[d] + res; c = co; if (co) car[i] = DIGITS[co];
  }
  if (c) res = DIGITS[c] + res;
  const w = n + 1;
  return { title: 'Column addition with carries', hl: true, lines: ['Carry: ' + car.join(''), '       ' + ' ' + a, '     + ' + b, '       ' + '-'.repeat(w), '       ' + res.padStart(w), '', ...notes] };
}

function performOperation(operands, op, outBase, maxF = 10) {
  if (operands.length < 2) fail('Enter at least two numbers.');
  const ps = operands.map(o => parseNumber(o.text, o.base)), rs = ps.map(toRat);
  const dec = r => { const x = fromRat(r, 10, maxF); return (x.exact ? '' : '≈ ') + x.text; };
  const steps = [{ title: 'Step 1 — Convert operands to decimal', lines: ps.map((p, i) => `${show(p)}${sub(p.base)} = ${dec(rs[i])}${sub(10)}`) }];
  let acc = rs[0]; const l = [];
  for (let i = 1; i < rs.length; i++) { const nx = OPS[op](acc, rs[i]); l.push(`${dec(acc)} ${op} ${dec(rs[i])} = ${dec(nx)}`); acc = nx; }
  steps.push({ title: 'Step 2 — Perform the operation', lines: l });
  const out = fromRat(acc, outBase, maxF);
  steps.push({ title: `Step 3 — Convert result to base ${outBase}`, lines: outBase === 10 ? ['Result is already decimal.'] : [] });
  if (outBase !== 10) steps.push(...decToBaseSteps(acc, outBase, maxF));
  if (op === '+' && ps.length === 2 && ps.every(p => p.base === outBase && !p.frac && !p.neg)) steps.push(columnAdd(ps[0].int, ps[1].int, outBase));
  const expr = ps.map(p => show(p) + sub(p.base)).join(` ${op} `);
  steps.push({ title: 'Final answer', lines: [`${expr} = ${out.text}${sub(outBase)}`, out.exact ? 'Exact result' : `Approximate result (cut at ${maxF} fractional digits)`] });
  return { operation: 'calculation', targetBase: outBase, result: out.text, exact: out.exact, maxF, inputText: expr, resultText: out.text + sub(outBase), steps };
}

/* ===================== UI ===================== */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Fonts often lack subscript/superscript digit glyphs (shown as boxes), so display them as real <sub>/<sup> tags.
const SUB_RE = new RegExp(`[${SUBS}]+`, 'g'), SUP_RE = new RegExp(`[\u207b${SUPS}]+`, 'g');
const rich = s => esc(s)
  .replace(SUB_RE, m => `<sub>${[...m].map(c => SUBS.indexOf(c)).join('')}</sub>`)
  .replace(SUP_RE, m => `<sup>${[...m].map(c => (c === '\u207b' ? '−' : SUPS.indexOf(c))).join('')}</sup>`);
const state = { last: null, q: null, score: { r: 0, t: 0 } };
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

function toast(msg = '✓ Copied to clipboard') { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1600); }
const errHtml = e => `<div class="err" role="alert">${e instanceof MathError ? '⚠ ' + esc(e.message.replace(/^⚠ /, '')).replace(/\n/g, '<br>') : '⚠ Something went wrong. Please check your input.'}</div>`;
const stepsHtml = steps => `<h3>Step-by-step solution</h3>` + steps.map(s => `<details open class="step${s.hl ? ' hl' : ''}"><summary>${rich(s.title)}</summary><pre>${rich(s.lines.join('\n'))}</pre></details>`).join('');
const stepsText = r => r.steps.map(s => s.title + '\n' + s.lines.join('\n')).join('\n\n');

function showResult(r, el) {
  state.last = r;
  el.innerHTML = `<div class="card result"><div class="eq mono"><span>${rich(r.inputText)}</span><i>=</i><b>${rich(r.resultText)}</b></div>
    <p class="${r.exact ? 'ok' : 'warn'}">${r.exact ? '✓ Exact' : '≈ Approximate result'}</p>
    <div class="row wrap"><button class="btn" data-act="copyR">Copy result</button><button class="btn" data-act="copyS">Copy solution</button></div></div>${stepsHtml(r.steps)}`;
}
const copy = t => navigator.clipboard.writeText(t).then(() => toast(), () => toast('Copy failed'));

/* base selectors: 2, 8, 10, 16 or custom (2–36) */
const STD = [2, 8, 10, 16];
function initBaseSelect(sel) {
  sel.innerHTML = STD.map(b => `<option value="${b}">${baseName(b)} (${b})</option>`).join('') + '<option value="c">Custom Base</option>';
  sel.value = sel.dataset.def;
  sel.addEventListener('change', () => { sel.nextElementSibling.hidden = sel.value !== 'c'; if (sel.id === 'cvFrom' || sel.id === 'cvTo') { updateTag(); buildKeypad(); } });
}
const readBase = sel => sel.value === 'c' ? validateBase(sel.nextElementSibling.value) : +sel.value;
function setBase(sel, b) { if (STD.includes(b)) sel.value = b; else { sel.value = 'c'; sel.nextElementSibling.value = b; } sel.nextElementSibling.hidden = sel.value !== 'c'; }
const safeBase = sel => { try { return readBase(sel); } catch { return 10; } };
const updateTag = () => { const b = safeBase($('#cvFrom')); $('#cvTag').textContent = `${baseName(b)} • Base ${b}`; };

function buildKeypad() {
  const b = safeBase($('#cvFrom')), n = Math.max(16, b);
  let h = ''; for (let i = 0; i < n; i++) h += `<button data-key="${DIGITS[i]}"${i >= b ? ' disabled' : ''}>${DIGITS[i]}</button>`;
  $('#keypad').innerHTML = h + '<button data-key=".">.</button><button data-key="-">−</button><button data-key="bs" aria-label="Backspace">⌫</button><button data-key="clr">Clear</button>';
}

/* converter / calculator actions */
function doConvert() {
  const el = $('#cvOut');
  try {
    const from = readBase($('#cvFrom')), to = readBase($('#cvTo')), text = $('#cvIn').value;
    const r = convertNumber(text, from, to, +$('#cvMax').value);
    r.args = { text, from, to }; showResult(r, el); saveHistory(r);
  } catch (e) { el.innerHTML = errHtml(e); }
}
function opRow(text = '', base = 10) {
  const d = document.createElement('div'); d.className = 'oprow';
  d.innerHTML = `<input class="mono" aria-label="Operand" autocomplete="off" value="${text}"><select class="bsel" aria-label="Operand base" data-def="${STD.includes(base) ? base : 10}"></select><input type="number" min="2" max="36" value="20" hidden aria-label="Custom base (2 to 36)"><button class="btn icon-btn" data-act="delop" aria-label="Remove operand">✕</button>`;
  const sel = d.querySelector('select'); initBaseSelect(sel); // initBaseSelect toggles the custom input right after the select
  d.cust = sel.nextElementSibling; $('#ops').appendChild(d);
}
function doCalc() {
  const el = $('#clOut');
  try {
    const operands = $$('.oprow').map(r => { const s = r.querySelector('select'); return { text: r.querySelector('input').value, base: s.value === 'c' ? validateBase(r.cust.value) : +s.value }; });
    const r = performOperation(operands, $('#clOp').value, readBase($('#clTo')), +$('#clMax').value);
    showResult(r, el); saveHistory(r);
  } catch (e) { el.innerHTML = errHtml(e); }
}

/* history */
function saveHistory(r) { const h = store.get('nsl-history', []); h.unshift({ t: Date.now(), k: r.operation, i: r.inputText, r: r.resultText, a: r.args }); store.set('nsl-history', h.slice(0, 100)); }
function renderHistory() {
  const h = store.get('nsl-history', []);
  $('#hsOut').innerHTML = h.length ? `<button class="btn" data-act="clearh">Clear all</button>` + h.map((x, i) => `<div class="card hsi"><div><div class="mono">${rich(x.i)} = <b>${rich(x.r)}</b></div><small>${esc(x.k)} • ${new Date(x.t).toLocaleString()}</small></div><div class="row">${x.a ? `<button class="btn" data-act="reuse" data-i="${i}">Reuse</button>` : ''}<button class="btn" data-act="copyH" data-i="${i}">Copy</button><button class="btn" data-act="delh" data-i="${i}">Delete</button></div></div>`).join('') : '<div class="card">No history yet. Convert or calculate something first.</div>';
}

/* practice */
function newQuestion() {
  const lv = $('#pLevel').value, R = (a, b) => a + Math.floor(Math.random() * (b - a + 1)), pick = a => a[R(0, a.length - 1)];
  const lo = s => baseName(s).toLowerCase(), q = {};
  if (lv !== 'hard') {
    const from = pick(STD), to = pick(STD.filter(x => x !== from)), text = R(1, lv === 'easy' ? 255 : 4095).toString(from).toUpperCase();
    Object.assign(q, { to, prompt: `Convert (${text})${sub(from)} to ${lo(to)}.`, res: convertNumber(text, from, to, 20) });
  } else {
    const t = R(0, 2);
    if (t === 0) {
      const from = pick([2, 8, 16]), to = pick(STD.filter(x => x !== from)), text = R(1, 120).toString(from).toUpperCase() + '.' + Array.from({ length: R(1, 3) }, () => DIGITS[R(0, from - 1)]).join('');
      Object.assign(q, { to, prompt: `Convert (${text})${sub(from)} to ${lo(to)}.`, res: convertNumber(text, from, to, 20) });
    } else if (t === 1) {
      const b = R(3, 36), text = R(10, 5000).toString(b).toUpperCase();
      Object.assign(q, { to: 10, prompt: `Convert (${text})${sub(b)} to decimal.`, res: convertNumber(text, b, 10, 20) });
    } else {
      const ba = pick(STD), bb = pick(STD), op = pick(['+', '-', '×']), to = pick(STD), a = R(1, 60).toString(ba).toUpperCase(), b = R(1, 60).toString(bb).toUpperCase();
      Object.assign(q, { to, prompt: `Calculate (${a})${sub(ba)} ${op} (${b})${sub(bb)} and give the answer in ${lo(to)}.`, res: performOperation([{ text: a, base: ba }, { text: b, base: bb }], op, to, 20) });
    }
  }
  state.q = q; $('#pQ').innerHTML = rich(q.prompt); $('#pAns').value = ''; $('#pOut').innerHTML = ''; $('#pAns').focus();
}
function checkAnswer() {
  const q = state.q, out = $('#pOut'); if (!q) return;
  try {
    const u = toRat(parseNumber($('#pAns').value, q.to)), c = toRat(parseNumber(q.res.result, q.to)), ok = u.n === c.n && u.d === c.d;
    if (!q.done) { q.done = true; state.score.t++; if (ok) state.score.r++; $('#score').textContent = `Score ${state.score.r} / ${state.score.t}`; }
    out.innerHTML = `<div class="card"><p class="${ok ? 'ok' : 'warn'}"><b>${ok ? '✓ Correct' : '✗ Not quite'}</b></p><p>Correct answer: <b class="mono">${rich(q.res.resultText)}</b></p></div>` + stepsHtml(q.res.steps);
  } catch (e) { out.innerHTML = errHtml(e); }
}

/* reference */
function renderRef() {
  const chips = (n, k, b) => Array.from({ length: n }, (_, i) => `<span>${i.toString(2).padStart(k, '0')} = ${i.toString(b).toUpperCase()}</span>`).join('');
  $('#refOut').innerHTML = `<div class="grid2">${[[2, '0, 1'], [8, '0–7'], [10, '0–9'], [16, '0–9, A–F']].map(([b, d]) => `<div class="card"><h4>${baseName(b)} <small>Base ${b}</small></h4><p class="mono">${d}</p></div>`).join('')}</div>
    <div class="card"><h4>Binary ↔ Octal</h4><div class="chips">${chips(8, 3, 8)}</div></div>
    <div class="card"><h4>Binary ↔ Hexadecimal</h4><div class="chips">${chips(16, 4, 16)}</div></div>
    <div class="card"><h4>Bases above 10</h4><p class="mono">A=10 B=11 C=12 D=13 E=14 F=15 G=16 … Z=35</p></div>`;
}

/* tabs & theme */
function switchTab(id) {
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === id));
  $$('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', b.dataset.tab === id); });
  if (id === 'history') renderHistory();
  if (id === 'reference') renderRef();
  if (id === 'solver') { const el = $('#svOut'); state.last ? showResult(state.last, el) : (el.innerHTML = '<div class="card">Run a conversion or calculation first — its full solution appears here.</div>'); }
}
const MODES = ['dark', 'light', 'system'];
function applyTheme(m) {
  document.documentElement.dataset.theme = m === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : m;
  $('#themeBtn').title = `Theme: ${m}`; $('#themeBtn').setAttribute('aria-label', `Theme: ${m}. Click to change`);
}
function randomBinary() { const r = n => Array.from({ length: n }, () => Math.round(Math.random())).join(''); return '1' + r(2 + Math.floor(Math.random() * 6)) + '.' + r(1 + Math.floor(Math.random() * 4)); }

/* events */
document.addEventListener('click', e => {
  const k = e.target.closest('[data-key]');
  if (k) { const i = $('#cvIn'), v = k.dataset.key; i.value = v === 'bs' ? i.value.slice(0, -1) : v === 'clr' ? '' : i.value + v; i.focus(); return; }
  const t = e.target.closest('[data-tab]'); if (t) return switchTab(t.dataset.tab);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const h = store.get('nsl-history', []), i = +b.dataset.i;
  ({
    swap: () => {
      const f = $('#cvFrom'), t = $('#cvTo'); let a, c;
      try { a = readBase(f); c = readBase(t); } catch (e) { $('#cvOut').innerHTML = errHtml(e); return; }
      setBase(f, c); setBase(t, a);
      const r = state.last; // if the last result was a → c, its answer becomes the new input
      if (r && r.operation === 'conversion' && r.sourceBase === a && r.targetBase === c) $('#cvIn').value = r.result;
      updateTag(); buildKeypad(); doConvert();
    },
    convert: doConvert, calc: doCalc, newq: newQuestion, check: checkAnswer,
    cvclear: () => { $('#cvIn').value = ''; $('#cvOut').innerHTML = ''; $('#cvIn').focus(); },
    keypad: () => { buildKeypad(); $('#keypad').hidden = !$('#keypad').hidden; },
    another: () => { setBase($('#cvFrom'), 2); setBase($('#cvTo'), 10); $('#cvIn').value = randomBinary(); updateTag(); buildKeypad(); doConvert(); },
    addop: () => opRow('', 10), delop: () => { if ($$('.oprow').length > 2) b.closest('.oprow').remove(); else toast('Keep at least two operands'); },
    copyR: () => copy(state.last.resultText), copyS: () => copy(`${state.last.inputText} = ${state.last.resultText}\n\n${stepsText(state.last)}`),
    closehelp: () => $('#helpDlg').close(),
    clearh: () => { store.set('nsl-history', []); renderHistory(); },
    delh: () => { h.splice(i, 1); store.set('nsl-history', h); renderHistory(); },
    copyH: () => copy(`${h[i].i} = ${h[i].r}`),
    reuse: () => { const a = h[i].a; setBase($('#cvFrom'), a.from); setBase($('#cvTo'), a.to); $('#cvIn').value = a.text; updateTag(); buildKeypad(); switchTab('converter'); doConvert(); }
  })[b.dataset.act]?.();
});
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); switchTab('converter'); $('#cvIn').focus(); }
  else if (mod && e.key === 'Enter') { e.preventDefault(); $('#calculator').classList.contains('on') ? doCalc() : doConvert(); }
  else if (e.key === 'Enter' && e.target.id === 'cvIn') doConvert();
  else if (e.key === 'Enter' && e.target.id === 'pAns') checkAnswer();
});

function init() {
  $$('.bsel').forEach(initBaseSelect);
  $$('.maxsel').forEach(s => { s.innerHTML = [5, 10, 15, 20, 30, 50].map(n => `<option ${n === 10 ? 'selected' : ''}>${n}</option>`).join(''); });
  opRow('1011', 2); opRow('27', 8);
  let mode = store.get('nsl-theme', 'dark'); applyTheme(mode);
  $('#themeBtn').onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; store.set('nsl-theme', mode); applyTheme(mode); toast(`Theme: ${mode}`); };
  $('#helpBtn').onclick = () => $('#helpDlg').showModal();
  $('#histBtn').onclick = () => switchTab('history');
  $('#resetBtn').onclick = () => { $('#cvIn').value = '101101.101'; setBase($('#cvFrom'), 2); setBase($('#cvTo'), 10); $('#cvMax').value = 10; updateTag(); buildKeypad(); switchTab('converter'); doConvert(); };
  $('#cvIn').addEventListener('input', updateTag);
  updateTag(); buildKeypad(); doConvert();
}
init();
