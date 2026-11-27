// Tally budget widget for Scriptable (iOS).
// Shows what's left in your monthly budget, with a ring for each category you pick.
// Tap the widget to open Tally. Run the script inside Scriptable to preview it or choose categories.
//
// Settings are filled in for you when you use Tally → Settings → Widget → "Copy widget script".

const CONFIG = {
  workerUrl: '__WORKER_URL__',   // your Cloudflare Worker, e.g. https://tally-proxy.you.workers.dev
  key: '__WIDGET_KEY__',         // must match WIDGET_KEY on the worker and in Tally
  tallyUrl: '__TALLY_URL__',     // opened when you tap the widget
};

const C = {
  bg: '#050a17', ink: '#eef3ff', ink2: '#a3b3d4', ink3: '#6b7ea6', track: '#1a2a4b',
  good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', accent: '#4f8cff',
};
const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), 'tally-widget-cache.json');
const CHOICE = fm.joinPath(fm.documentsDirectory(), 'tally-widget-choice.json');

/* ---------- data ---------- */
async function loadData() {
  try {
    const req = new Request(CONFIG.workerUrl.replace(/\/$/, '') + '/summary');
    req.headers = { 'X-Tally-Key': CONFIG.key };
    req.timeoutInterval = 12;
    const data = await req.loadJSON();
    if (req.response.statusCode !== 200) throw new Error(data.error || `Error ${req.response.statusCode}`);
    fm.writeString(CACHE, JSON.stringify(data));
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(CACHE)) return { data: JSON.parse(fm.readString(CACHE)), offline: true };
    return { error: e.message || String(e) };
  }
}
function readChoice() { try { return fm.fileExists(CHOICE) ? JSON.parse(fm.readString(CHOICE)) : null; } catch { return null; } }

// Which categories to show: widget Parameter (names, comma-separated) → choice made in Scriptable → choice made in Tally → biggest budgets.
function pickCategories(data, max) {
  const cats = data.categories || [];
  const param = (args.widgetParameter || '').trim();
  let list = [];
  if (param) {
    const names = param.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    list = names.map(n => cats.find(c => c.name.toLowerCase() === n || c.name.toLowerCase().startsWith(n))).filter(Boolean);
  }
  if (!list.length) {
    const ids = readChoice() || data.selected || [];
    list = ids.map(id => cats.find(c => c.id === id)).filter(Boolean);
  }
  if (!list.length) list = [...cats].sort((a, b) => b.budget - a.budget);
  return list.slice(0, max);
}

/* ---------- helpers ---------- */
const money = n => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
function colorFor(spent, budget, pace) {
  if (!budget) return spent > 0 ? C.bad : C.track;
  const r = spent / budget;
  if (r > 1) return C.bad;
  if (r > pace + 0.1 && r > 0.5) return C.warn;
  return C.good;
}
function ago(ts) {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
function arc(ctx, c, r, from, to, color, lw) {
  const steps = Math.max(2, Math.ceil(120 * (to - from)));
  const p = new Path();
  const pt = f => { const a = -Math.PI / 2 + 2 * Math.PI * f; return new Point(c + r * Math.cos(a), c + r * Math.sin(a)); };
  for (let i = 0; i <= steps; i++) { const q = pt(from + (to - from) * i / steps); i ? p.addLine(q) : p.move(q); }
  ctx.addPath(p); ctx.setStrokeColor(new Color(color)); ctx.setLineWidth(lw); ctx.strokePath();
  if (to - from < 0.999) { // rounded ends
    ctx.setFillColor(new Color(color));
    for (const f of [from, to]) { const q = pt(f); ctx.fillEllipse(new Rect(q.x - lw / 2, q.y - lw / 2, lw, lw)); }
  }
}
function ringImage(spent, budget, color, emoji, size) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const lw = Math.round(size * 0.1), c = size / 2, r = size / 2 - lw / 2 - 1;
  arc(ctx, c, r, 0, 1, C.track, lw);
  const ratio = budget ? Math.min(1, spent / budget) : (spent > 0 ? 1 : 0);
  if (ratio > 0.005) arc(ctx, c, r, 0, ratio, color, lw);
  if (emoji) {
    ctx.setFont(Font.systemFont(size * 0.36)); ctx.setTextAlignedCenter();
    ctx.drawTextInRect(emoji, new Rect(0, size * 0.28, size, size * 0.46));
  }
  return ctx.getImage();
}
function barImage(w, h, ratio, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const track = new Path(); track.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
  ctx.addPath(track); ctx.setFillColor(new Color(C.track)); ctx.fillPath();
  const fw = Math.max(h, Math.min(1, ratio) * w);
  if (ratio > 0) { const f = new Path(); f.addRoundedRect(new Rect(0, 0, fw, h), h / 2, h / 2); ctx.addPath(f); ctx.setFillColor(new Color(color)); ctx.fillPath(); }
  return ctx.getImage();
}
function text(stack, str, size, color, weight = 'regular') {
  const t = stack.addText(str);
  t.font = weight === 'bold' ? Font.boldRoundedSystemFont(size) : weight === 'semibold' ? Font.semiboldRoundedSystemFont(size) : Font.regularRoundedSystemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1; t.minimumScaleFactor = 0.6;
  return t;
}
function centered(parent, build) { const h = parent.addStack(); h.layoutHorizontally(); h.addSpacer(); build(h); h.addSpacer(); return h; }

/* ---------- layouts ---------- */
function header(w, d, family) {
  const big = family === 'large' ? 32 : family === 'small' ? 24 : 24;
  const top = w.addStack(); top.layoutHorizontally(); top.centerAlignContent();
  const left = top.addStack(); left.layoutVertically();
  const over = d.left < 0;
  text(left, `${money(d.left)} ${over ? 'over' : 'left'}`, family === 'medium' ? 22 : big, over ? C.bad : C.ink, 'bold');
  text(left, family === 'small' ? `of ${money(d.budgeted)}` : family === 'medium' ? `of ${money(d.budgeted)} · ${d.monthLabel}` : `${money(d.spent)} spent of ${money(d.budgeted)} · ${d.monthLabel}`, family === 'large' ? 13 : 11, C.ink3);
  top.addSpacer();
  if (family === 'medium') { // status sits top-right to leave room for the rings
    const st = statusText(d, w.__offline);
    if (st) { const col = top.addStack(); col.layoutVertically(); text(col, st.text, 10, st.warn ? C.warn : C.ink3); col.addSpacer(); }
  }
  return top;
}
function statusText(d, offline) {
  const staleMonth = d.month !== monthNow();
  const bits = [];
  if (d.showSynced) bits.push(`Synced ${ago(d.synced || d.pushed)}`);
  if (offline) bits.push('offline');
  if (staleMonth) bits.push('open Tally');
  return bits.length ? { text: bits.join(' · '), warn: offline || staleMonth } : null;
}
function footer(w, d, offline, family) {
  const st = statusText(d, offline);
  if (!st) return;
  const f = w.addStack(); f.layoutHorizontally();
  text(f, st.text, family === 'large' ? 11 : 10, st.warn ? C.warn : C.ink3);
}
function monthNow() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }

function ringsRow(w, cats, d, size, colW) {
  const row = w.addStack(); row.layoutHorizontally();
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    const left = c.budget - c.spent;
    const col = row.addStack(); col.layoutVertically(); col.size = new Size(colW, 0);
    centered(col, h => { const im = h.addImage(ringImage(c.spent, c.budget, colorFor(c.spent, c.budget, d.pace), c.emoji, size)); im.imageSize = new Size(size, size); });
    col.addSpacer(4);
    centered(col, h => text(h, money(left), size > 50 ? 15 : 13, left < 0 ? C.bad : C.ink, 'bold'));
    centered(col, h => text(h, left < 0 ? 'over' : 'left', size > 50 ? 12 : 10, C.ink3));
    if (i < cats.length - 1) row.addSpacer();
  }
  if (cats.length < 4) row.addSpacer();
}

function build(res, family) {
  const w = new ListWidget();
  w.backgroundColor = new Color(C.bg);
  w.url = CONFIG.tallyUrl;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60000);
  if (res.error) {
    w.setPadding(14, 14, 14, 14);
    text(w, 'Tally', 14, C.ink, 'bold');
    w.addSpacer(6);
    const t = w.addText(res.error.includes('No summary') ? 'Open Tally once so it can send your budget.' : `Can't load budget: ${res.error}`);
    t.font = Font.systemFont(11); t.textColor = new Color(C.ink3);
    return w;
  }
  const d = res.data;
  const ratio = d.budgeted ? d.spent / d.budgeted : 0;
  const overall = colorFor(d.spent, d.budgeted, d.pace);

  if (family === 'small') {
    w.setPadding(14, 14, 12, 14);
    text(w, 'BUDGET', 10, C.ink3, 'semibold');
    w.addSpacer(2);
    header(w, d, family);
    w.addSpacer(8);
    w.addImage(barImage(130, 7, ratio, overall)).imageSize = new Size(130, 7);
    w.addSpacer();
    footer(w, d, res.offline, family);
    return w;
  }

  if (family === 'large') {
    w.setPadding(18, 18, 16, 18);
    header(w, d, family);
    w.addSpacer(8);
    w.addImage(barImage(300, 8, ratio, overall)).imageSize = new Size(300, 8);
    w.addSpacer(16);
    const cats = pickCategories(d, 8);
    ringsRow(w, cats.slice(0, 4), d, 52, 74);
    if (cats.length > 4) { w.addSpacer(14); ringsRow(w, cats.slice(4, 8), d, 52, 74); }
    w.addSpacer();
    footer(w, d, res.offline, family);
    return w;
  }

  // medium
  w.setPadding(12, 16, 10, 16);
  w.__offline = res.offline;
  header(w, d, family);
  w.addSpacer();
  ringsRow(w, pickCategories(d, 4), d, 42, 72);
  return w;
}

/* ---------- choose categories (run inside Scriptable) ---------- */
async function chooseCategories(data) {
  let sel = readChoice() || [...(data.selected || [])];
  const table = new UITable(); table.showSeparators = true;
  const draw = () => {
    table.removeAllRows();
    const head = new UITableRow(); head.isHeader = true; head.height = 60;
    head.addText('Show on widget', `Tap to add or remove · medium shows the first 4, large the first 8 (${sel.length} picked)`);
    table.addRow(head);
    const reset = new UITableRow();
    reset.addText('↺ Use the choice from Tally');
    reset.onSelect = () => { sel = null; }; reset.dismissOnSelect = true;
    table.addRow(reset);
    for (const c of data.categories || []) {
      const r = new UITableRow(); r.dismissOnSelect = false;
      const i = sel ? sel.indexOf(c.id) : -1;
      r.addText(`${i >= 0 ? `${i + 1}.` : '○'}  ${c.emoji}  ${c.name}`, `${money(c.budget - c.spent)} left of ${money(c.budget)}`);
      r.onSelect = () => { sel = sel || []; const j = sel.indexOf(c.id); j >= 0 ? sel.splice(j, 1) : sel.push(c.id); draw(); table.reload(); };
      table.addRow(r);
    }
  };
  draw();
  await table.present();
  if (sel && sel.length) fm.writeString(CHOICE, JSON.stringify(sel));
  else if (fm.fileExists(CHOICE)) fm.remove(CHOICE);
}

/* ---------- run ---------- */
const res = await loadData();
if (config.runsInWidget) {
  Script.setWidget(build(res, config.widgetFamily || 'medium'));
} else {
  const a = new Alert();
  a.title = 'Tally widget';
  a.message = res.error ? res.error : `Last synced ${ago(res.data.synced || res.data.pushed)}`;
  ['Preview medium', 'Preview large', 'Preview small', 'Choose categories'].forEach(x => a.addAction(x));
  a.addCancelAction('Close');
  const pick = await a.presentSheet();
  if (pick === 0) await build(res, 'medium').presentMedium();
  if (pick === 1) await build(res, 'large').presentLarge();
  if (pick === 2) await build(res, 'small').presentSmall();
  if (pick === 3 && res.data) { await chooseCategories(res.data); await build(res, 'medium').presentMedium(); }
}
Script.complete();
