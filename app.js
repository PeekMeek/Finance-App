/* Tally — personal finance PWA.
 * All data lives on this device (localStorage). Bank data comes from SimpleFIN Bridge
 * (read-only) or CSV imports. Nothing is sent anywhere else.
 */
'use strict';

/* =========================================================================
   Constants
   ========================================================================= */
const STORE_KEY = 'tally.v1';
const APP_VERSION = '1.0.0';

const ACCOUNT_TYPES = {
  checking:   { label: 'Checking',    group: 'cash',   asset: true },
  savings:    { label: 'Savings',     group: 'cash',   asset: true },
  credit:     { label: 'Credit card', group: 'debt',   asset: false },
  retirement: { label: 'Retirement',  group: 'retire', asset: true },
  investment: { label: 'Investment',  group: 'invest', asset: true },
  loan:       { label: 'Loan',        group: 'debt',   asset: false },
  other:      { label: 'Other asset', group: 'other',  asset: true },
};
const GROUPS = {
  cash:   { label: 'Checking & savings', color: 'var(--c-cash)' },
  retire: { label: 'Retirement',         color: 'var(--c-retire)' },
  invest: { label: 'Investments',        color: 'var(--c-invest)' },
  other:  { label: 'Other assets',       color: 'var(--c-other)' },
  debt:   { label: 'Credit cards & loans', color: 'var(--c-debt)' },
};
// Account types whose transactions count toward the budget.
const SPENDING_TYPES = new Set(['checking', 'savings', 'credit']);

const DEFAULT_CATEGORIES = [
  { id: 'mortgage',      name: 'Mortgage',          emoji: '🏠', group: 'Fixed',     budget: 1850 },
  { id: 'utilities',     name: 'Utilities',         emoji: '💡', group: 'Fixed',     budget: 260 },
  { id: 'phone',         name: 'Phone & internet',  emoji: '📶', group: 'Fixed',     budget: 140 },
  { id: 'insurance',     name: 'Insurance',         emoji: '🛡️', group: 'Fixed',     budget: 180 },
  { id: 'groceries',     name: 'Groceries',         emoji: '🛒', group: 'Everyday',  budget: 650 },
  { id: 'eating-out',    name: 'Eating out',        emoji: '🍽️', group: 'Everyday',  budget: 300 },
  { id: 'gas',           name: 'Gas & auto',        emoji: '⛽', group: 'Everyday',  budget: 200 },
  { id: 'household',     name: 'Household',         emoji: '🧺', group: 'Everyday',  budget: 120 },
  { id: 'shopping',      name: 'Shopping',          emoji: '🛍️', group: 'Lifestyle', budget: 200 },
  { id: 'subscriptions', name: 'Subscriptions',     emoji: '🔁', group: 'Lifestyle', budget: 60 },
  { id: 'entertainment', name: 'Entertainment',     emoji: '🎟️', group: 'Lifestyle', budget: 100 },
  { id: 'health',        name: 'Health',            emoji: '💊', group: 'Lifestyle', budget: 80 },
  { id: 'travel',        name: 'Travel',            emoji: '✈️', group: 'Lifestyle', budget: 150 },
  { id: 'gifts',         name: 'Gifts & giving',    emoji: '🎁', group: 'Lifestyle', budget: 50 },
  { id: 'misc',          name: 'Everything else',   emoji: '📦', group: 'Other',     budget: 100 },
];
// Not budgeted: money in, money moved between your own accounts, and not-yet-sorted.
const SYSTEM_CATEGORIES = [
  { id: 'income',        name: 'Income',            emoji: '💰', system: true },
  { id: 'transfer',      name: 'Transfer / card payment', emoji: '🔄', system: true },
  { id: 'uncategorized', name: 'Uncategorized',     emoji: '❔', system: true },
];
const GROUP_ORDER = ['Fixed', 'Everyday', 'Lifestyle', 'Other'];

// First match wins. Your own "remember this merchant" choices always override these.
const KEYWORD_RULES = [
  [/payment.*thank|autopay|auto pay|epayment|online payment|card payment|pymt|amex epayment|applecard gsbank|apple card payment|citi card|payment received/i, 'transfer'],
  [/transfer|xfer|to share|from share|internal|withdrawal to|deposit from/i, 'transfer'],
  [/payroll|direct dep|salary|paycheck|dir dep|irs treas|tax ref|interest paid|dividend/i, 'income'],
  [/mortgage|mtg|loan servic|mr\.? ?cooper|rocket mort|home loan|escrow/i, 'mortgage'],
  [/\bdte\b|consumers energy|electric|water|sewer|gas co|semco|utility|trash|waste mgmt/i, 'utilities'],
  [/comcast|xfinity|verizon|t-?mobile|at&t|spectrum|wow!|internet|wireless/i, 'phone'],
  [/insurance|geico|progressive|state farm|allstate|auto-owners|usaa ins|frankenmuth/i, 'insurance'],
  [/kroger|meijer|aldi|whole foods|trader joe|costco whse|costco wholesale|sam'?s club|walmart grocery|safeway|publix|wegmans|heb|grocery|market|spartan|busch'?s|fresh thyme|instacart/i, 'groceries'],
  [/restaurant|mcdonald|starbucks|chipotle|doordash|uber ?eats|grubhub|pizza|cafe|coffee|taco|panera|chick-?fil|wendy|burger|subway|tim hortons|culver|grill|kitchen|bar &|diner|sushi|bistro|tst\*|sq \*.*(cafe|coffee)/i, 'eating-out'],
  [/shell|bp#|\bbp\b|speedway|exxon|mobil|marathon|sunoco|costco gas|citgo|circle k|chevron|valero|gas station|fuel|jiffy|autozone|oil change|car wash|tire/i, 'gas'],
  [/netflix|spotify|hulu|disney|apple\.com\/bill|youtube|prime video|amazon prime|max\.com|hbo|paramount|peacock|icloud|patreon|subscription|adobe|microsoft 365|chatgpt|claude\.ai|anthropic/i, 'subscriptions'],
  [/pharmacy|cvs|walgreens|rite aid|doctor|dental|dentist|clinic|hospital|medical|optical|vision|urgent care|labcorp|quest diag/i, 'health'],
  [/airline|delta air|united air|southwest|american air|airbnb|hotel|marriott|hilton|hyatt|expedia|booking\.com|uber trip|lyft|amtrak/i, 'travel'],
  [/movie|cinema|amc |regal|theater|theatre|ticketmaster|stubhub|steam|playstation|xbox|nintendo|bowling|museum|concert/i, 'entertainment'],
  [/home depot|lowe'?s|menards|ace hardware|ikea|bed bath|target|walmart|dollar|cleaning/i, 'household'],
  [/amazon|amzn|etsy|ebay|best buy|apple store|apple\.com(?!\/bill)|nike|old navy|gap|kohl|macy|tj ?maxx|marshalls|rei |clothing/i, 'shopping'],
  [/salon|barber|haircut|spa|nail|gym|fitness|planet fitness/i, 'misc'],
  [/donation|church|charity|gofundme|giving|gift/i, 'gifts'],
];

/* =========================================================================
   State
   ========================================================================= */
let state = loadState();
let ui = {
  tab: 'overview',
  settingsOpen: false,
  range: '3M',
  txnSearch: '',
  txnAccount: 'all',
  txnFilter: 'all',
  txnLimit: 150,
  budgetMonth: monthKey(new Date()),
  syncing: false,
};

function freshState() {
  return {
    version: 1,
    demo: false,
    accounts: [],
    transactions: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    budgetOverrides: {},      // { 'YYYY-MM': { catId: amount } }
    rules: {},                // { merchantKey: catId }
    goals: [],
    snapshots: [],            // [{ d, nw, cash, retire, invest, other, debt }]
    settings: {
      sfAccess: null,         // SimpleFIN access URL (contains credentials — stays on device)
      proxy: '',
      autoSyncHours: 4,
      lastSync: null,
      lastSyncError: null,
      privacy: false,
    },
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const base = freshState();
    return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  } catch (e) {
    console.error('Could not load saved data', e);
    return null;
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — device storage is full'); console.error(e); }
}

/* =========================================================================
   Helpers
   ========================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const round2 = n => Math.round(n * 100) / 100;

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtUSD0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function money(n, { cents = true, sign = false } = {}) {
  const v = Number(n) || 0;
  const s = (cents ? fmtUSD : fmtUSD0).format(Math.abs(v));
  if (v < 0) return '−' + s;
  return (sign && v > 0 ? '+' : '') + s;
}
function compact(n) {
  const a = Math.abs(n);
  const sgn = n < 0 ? '−' : '';
  if (a >= 1e6) return sgn + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e4) return sgn + '$' + Math.round(a / 1e3) + 'k';
  return sgn + fmtUSD0.format(a);
}
function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); }
function monthLabel(key) { return parseISO(key + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
function addMonths(key, n) { const d = parseISO(key + '-01'); d.setMonth(d.getMonth() + n); return monthKey(d); }
function dayLabel(iso) {
  const d = parseISO(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
function allCategories() { return [...state.categories, ...SYSTEM_CATEGORIES]; }
function cat(id) { return allCategories().find(c => c.id === id) || SYSTEM_CATEGORIES[2]; }
function acct(id) { return state.accounts.find(a => a.id === id); }
function acctName(a) { return a ? (a.nickname || a.name) : 'Unknown account'; }
function merchantKey(desc) {
  return String(desc || '').toLowerCase()
    .replace(/(pos|debit|purchase|ach|recurring|card|visa|mc|checkcard)\s/g, ' ')
    .replace(/[#*0-9]+/g, ' ').replace(/[^a-z&' .\/-]/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}
function prettyDesc(desc) {
  const s = String(desc || '').replace(/\s{2,}/g, ' ').trim();
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) return s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
  return s;
}
function orgColor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('american express') || n.includes('amex')) return '#2671b9';
  if (n.includes('apple')) return '#1d1d1f';
  if (n.includes('costco') || n.includes('citi')) return '#c8102e';
  if (n.includes('loc')) return '#00563f';
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 40% 40%)`;
}
function initials(name) {
  const n = (name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  if (/american express|amex/i.test(n)) return 'AX';
  return n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

/* =========================================================================
   Categorizing
   ========================================================================= */
function autoCategory(t, account) {
  const key = merchantKey(t.desc);
  if (state.rules[key]) return state.rules[key];
  for (const [re, id] of KEYWORD_RULES) if (re.test(t.desc)) return id;
  if (t.amount > 0) {
    if (account && (account.type === 'credit' || account.type === 'loan')) return 'transfer';
    return 'income';
  }
  return 'uncategorized';
}

/* =========================================================================
   Totals
   ========================================================================= */
function visibleAccounts() { return state.accounts.filter(a => !a.hidden); }
function totals() {
  const t = { cash: 0, retire: 0, invest: 0, other: 0, debt: 0 };
  for (const a of visibleAccounts()) {
    const g = ACCOUNT_TYPES[a.type]?.group || 'other';
    if (g === 'debt') t.debt -= a.balance; // owed balances are negative
    else t[g] += a.balance;
  }
  t.assets = t.cash + t.retire + t.invest + t.other;
  t.nw = t.assets - t.debt;
  return t;
}
function takeSnapshot() {
  if (!state.accounts.length) return;
  const t = totals();
  const d = isoDate(new Date());
  const snap = { d, nw: round2(t.nw), cash: round2(t.cash), retire: round2(t.retire), invest: round2(t.invest), other: round2(t.other), debt: round2(t.debt) };
  const i = state.snapshots.findIndex(s => s.d === d);
  if (i >= 0) state.snapshots[i] = snap; else state.snapshots.push(snap);
  state.snapshots.sort((a, b) => a.d.localeCompare(b.d));
}
function budgetFor(catId, month) {
  const o = state.budgetOverrides[month];
  if (o && o[catId] != null) return o[catId];
  return cat(catId).budget || 0;
}
function monthTxns(month) {
  return state.transactions.filter(t => {
    if (!t.date.startsWith(month)) return false;
    const a = acct(t.accountId);
    return a && !a.hidden && SPENDING_TYPES.has(a.type);
  });
}
function monthSpending(month) {
  const byCat = {};
  let income = 0;
  for (const t of monthTxns(month)) {
    if (t.category === 'transfer') continue;
    if (t.category === 'income') { income += t.amount; continue; }
    byCat[t.category] = (byCat[t.category] || 0) - t.amount; // outflow is negative → positive spend
  }
  return { byCat, income };
}

/* =========================================================================
   SimpleFIN
   ========================================================================= */
function sfParse(accessUrl) {
  const u = new URL(accessUrl.trim());
  const auth = 'Basic ' + btoa(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password));
  u.username = ''; u.password = '';
  return { base: u.toString().replace(/\/$/, ''), auth };
}
function viaProxy(url) {
  const p = (state.settings.proxy || '').trim().replace(/\/$/, '');
  return p ? `${p}/?target=${encodeURIComponent(url)}` : url;
}
async function sfClaim(setupToken) {
  let claimUrl;
  try { claimUrl = atob(setupToken.trim()); new URL(claimUrl); }
  catch { throw new Error('That doesn’t look like a SimpleFIN setup token. Copy the whole token from the Bridge.'); }
  let res;
  try { res = await fetch(viaProxy(claimUrl), { method: 'POST' }); }
  catch { throw new Error(corsHelp()); }
  if (res.status === 403) throw new Error('This setup token was already used or has expired. Create a new one in SimpleFIN Bridge.');
  if (!res.ok) throw new Error(`SimpleFIN returned ${res.status} while claiming the token.`);
  const access = (await res.text()).trim();
  if (!/^https?:\/\//.test(access)) throw new Error('Unexpected reply from SimpleFIN while claiming the token.');
  return access;
}
function corsHelp() {
  return state.settings.proxy
    ? 'Couldn’t reach SimpleFIN through your proxy. Check the proxy URL in Settings.'
    : 'Your browser blocked the request to SimpleFIN. Add a sync proxy in Settings (see README — it’s a free 5-minute Cloudflare Worker), then try again.';
}
async function sfFetchAccounts(startTs) {
  const { base, auth } = sfParse(state.settings.sfAccess);
  const url = `${base}/accounts?pending=1&start-date=${Math.floor(startTs / 1000)}`;
  let res;
  try { res = await fetch(viaProxy(url), { headers: { Authorization: auth } }); }
  catch { throw new Error(corsHelp()); }
  if (res.status === 403 || res.status === 401) throw new Error('SimpleFIN refused access. The connection may have been revoked — reconnect in Settings.');
  if (res.status === 402) throw new Error('SimpleFIN says payment is required on your Bridge account.');
  if (!res.ok) throw new Error(`SimpleFIN returned ${res.status}.`);
  return res.json();
}
function guessType(name, orgName, balance) {
  const s = `${name} ${orgName}`.toLowerCase().replace(/credit union|federal credit/g, 'cu');
  const n = name.toLowerCase();
  if (/401\s*\(?k|403\s*\(?b|457|\bira\b|roth|retire|pension|tsp|\bsep\b|simple ira/.test(s)) return 'retirement';
  if (/brokerage|invest|individual|stock|hsa|529/.test(s)) return 'investment';
  if (/mortgage|loan|heloc|line of credit/.test(n)) return 'loan';
  if (/checking|share draft|spend/.test(n)) return 'checking';
  if (/saving|money market|\bshare\b|certificate|\bcd\b/.test(n)) return 'savings';
  if (/american express|amex|apple card|costco|citi|visa|mastercard|credit|card|platinum|gold|blue cash|sapphire|discover/.test(s)) return 'credit';
  return balance < 0 ? 'credit' : 'checking';
}
function unixToISO(ts) { return isoDate(new Date(ts * 1000)); }

async function syncNow({ quiet = false } = {}) {
  if (ui.syncing) return;
  if (!state.settings.sfAccess) {
    if (!quiet) { ui.settingsOpen = true; render(); toast('Connect your accounts first'); }
    return;
  }
  ui.syncing = true; renderSyncStatus();
  try {
    const last = state.settings.lastSync;
    const start = last ? last - 10 * 86400000 : Date.now() - 60 * 86400000;
    const data = await sfFetchAccounts(start);
    const errs = (data.errors || []).concat((data.errlist || []).map(e => e.msg || e.message || JSON.stringify(e)));
    const { added } = mergeSimpleFIN(data, start);
    state.settings.lastSync = Date.now();
    state.settings.lastSyncError = errs.length ? errs.join(' • ') : null;
    takeSnapshot(); save(); render();
    if (!quiet || added) toast(added ? `${added} new transaction${added === 1 ? '' : 's'}` : 'Up to date');
    if (errs.length) toast('Some accounts need attention — see Settings');
  } catch (e) {
    state.settings.lastSyncError = e.message; save();
    if (!quiet) toast(e.message);
    console.warn(e);
  } finally {
    ui.syncing = false; renderSyncStatus();
    if (ui.settingsOpen) render();
  }
}
function mergeSimpleFIN(data, windowStart) {
  if (state.demo) clearDemo();
  const orgs = {};
  for (const c of data.connections || []) orgs[c.conn_id] = c.name;
  let added = 0;
  const windowStartISO = isoDate(new Date(windowStart));
  for (const sa of data.accounts || []) {
    const orgName = sa.org?.name || orgs[sa.conn_id] || sa.org?.domain || '';
    let a = state.accounts.find(x => x.source === 'simplefin' && x.extId === sa.id);
    const balance = Number(sa.balance);
    if (!a) {
      a = { id: uid(), source: 'simplefin', extId: sa.id, name: sa.name, org: orgName, type: guessType(sa.name, orgName, balance), hidden: false };
      state.accounts.push(a);
    }
    a.name = sa.name; a.org = orgName;
    a.balance = balance;
    a.available = sa['available-balance'] != null ? Number(sa['available-balance']) : null;
    a.balanceDate = sa['balance-date'] ? sa['balance-date'] * 1000 : Date.now();
    a.currency = sa.currency;

    const seen = new Set();
    for (const st of sa.transactions || []) {
      const id = `sf:${sa.id}:${st.id}`;
      seen.add(id);
      const ts = st.posted && st.posted > 0 ? st.posted : (st.transacted_at || Date.now() / 1000);
      const fields = {
        accountId: a.id,
        date: unixToISO(st.transacted_at && st.transacted_at > 0 ? st.transacted_at : ts),
        amount: Number(st.amount),
        desc: st.payee || st.description || st.memo || 'Transaction',
        raw: st.description || '',
        pending: !!st.pending || !(st.posted > 0),
      };
      const existing = state.transactions.find(t => t.id === id);
      if (existing) Object.assign(existing, fields);
      else {
        const t = { id, source: 'simplefin', note: '', ...fields };
        t.category = autoCategory(t, a);
        state.transactions.push(t);
        added++;
      }
    }
    // Pending charges that vanished from the feed were replaced by posted ones — drop them.
    state.transactions = state.transactions.filter(t =>
      !(t.accountId === a.id && t.source === 'simplefin' && t.pending && t.date >= windowStartISO && !seen.has(t.id)));
  }
  sortTxns();
  return { added };
}
function sortTxns() {
  state.transactions.sort((a, b) => b.date.localeCompare(a.date) || (b.pending - a.pending));
}
function maybeAutoSync() {
  if (!state) return;
  const s = state.settings;
  if (!s.sfAccess || !s.autoSyncHours || ui.syncing || !navigator.onLine) return;
  if (!s.lastSync || Date.now() - s.lastSync > s.autoSyncHours * 3600000) syncNow({ quiet: true });
}

/* =========================================================================
   CSV import (Apple Card, any bank export)
   ========================================================================= */
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}
function parseAnyDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad(m[1])}-${pad(m[2])}`; }
  const d = new Date(s);
  return isNaN(d) ? null : isoDate(d);
}
function parseAmount(s) {
  if (s == null) return NaN;
  let v = String(s).trim();
  const neg = /^\(.*\)$/.test(v) || /^-/.test(v) || /-$/.test(v);
  v = v.replace(/[^0-9.]/g, '');
  const n = parseFloat(v);
  return isNaN(n) ? NaN : (neg ? -n : n);
}
function findCol(headers, patterns) {
  const h = headers.map(x => x.toLowerCase().trim());
  for (const p of patterns) { const i = h.findIndex(x => p.test(x)); if (i >= 0) return i; }
  return -1;
}

function openCSVImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(reader.result);
    if (rows.length < 2) return toast('That file has no rows');
    const headers = rows[0];
    const body = rows.slice(1);
    const isApple = headers.some(h => /clearing date/i.test(h)) && headers.some(h => /amount \(usd\)/i.test(h));
    const isAmex = !isApple && headers.some(h => /^date$/i.test(h.trim())) && headers.some(h => /^description$/i.test(h.trim())) && headers.some(h => /card member/i.test(h));
    const guess = {
      date: findCol(headers, [/^transaction date$/, /^trans\.? date$/, /^date$/, /posted/, /date/]),
      desc: findCol(headers, [/^merchant$/, /^description$/, /payee/, /memo/, /name/, /description/]),
      amount: findCol(headers, [/^amount \(usd\)$/, /^amount$/, /amount/]),
      debit: findCol(headers, [/^debit/, /withdrawal/]),
      credit: findCol(headers, [/^credit/, /deposit/]),
    };
    const opts = headers.map((h, i) => `<option value="${i}">${esc(h || `Column ${i + 1}`)}</option>`).join('');
    const sel = (name, v, allowNone) => `<select class="input" name="${name}">${allowNone ? '<option value="-1">—</option>' : ''}${opts.replace(`value="${v}"`, `value="${v}" selected`)}</select>`;
    const importable = state.accounts.filter(a => a.source !== 'simplefin');
    const defaultName = isApple ? 'Apple Card' : isAmex ? 'American Express' : file.name.replace(/\.csv$/i, '');
    const preselect = importable.find(a => a.name.toLowerCase() === defaultName.toLowerCase());

    openModal(`
      <h2>Import ${esc(file.name)}</h2>
      <p class="faint">${body.length} rows found${isApple ? ' · recognized as an Apple Card export' : ''}${isAmex ? ' · looks like an American Express export' : ''}.</p>
      <label class="field"><span>Into account</span>
        <select class="input" name="target">
          <option value="new">+ New account…</option>
          ${importable.map(a => `<option value="${a.id}" ${preselect?.id === a.id ? 'selected' : ''}>${esc(acctName(a))}</option>`).join('')}
        </select>
      </label>
      <div class="row" id="new-acct-fields" ${preselect ? 'hidden' : ''}>
        <label class="field"><span>Account name</span><input class="input" name="newName" value="${esc(defaultName)}"></label>
        <label class="field"><span>Type</span><select class="input" name="newType">
          ${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${k === (isApple || isAmex ? 'credit' : 'checking') ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select></label>
      </div>
      <div class="row">
        <label class="field"><span>Date column</span>${sel('cDate', guess.date)}</label>
        <label class="field"><span>Description column</span>${sel('cDesc', guess.desc)}</label>
      </div>
      <div class="row">
        <label class="field"><span>Amount column</span>${sel('cAmt', guess.amount, true)}</label>
        <label class="field"><span>…or Debit / Credit</span>
          <div class="row">${sel('cDebit', guess.amount >= 0 ? -1 : guess.debit, true)}${sel('cCredit', guess.amount >= 0 ? -1 : guess.credit, true)}</div>
        </label>
      </div>
      <label class="check"><input type="checkbox" name="flip" ${isApple || isAmex ? 'checked' : ''}> Purchases are positive numbers in this file</label>
      <p class="faint">Duplicates are skipped, so it’s safe to import overlapping statements. Card balances aren’t in CSV files — set the current balance by tapping the account on Overview.</p>
      <div class="modal-actions">
        <button class="btn" value="cancel">Cancel</button>
        <button class="btn primary" value="ok" data-default>Import</button>
      </div>`,
      (form) => {
        const f = Object.fromEntries(new FormData(form));
        let a;
        if (f.target === 'new') {
          a = { id: uid(), source: 'csv', name: (f.newName || 'Imported account').trim(), org: '', type: f.newType, balance: 0, hidden: false, balanceDate: Date.now() };
          state.accounts.push(a);
        } else a = acct(f.target);
        if (state.demo) clearDemo(a);
        const ci = { date: +f.cDate, desc: +f.cDesc, amt: +f.cAmt, debit: +f.cDebit, credit: +f.cCredit };
        const existingKeys = new Set(state.transactions.filter(t => t.accountId === a.id).map(t => `${t.date}|${t.amount}|${t.desc}`));
        let added = 0, skipped = 0, bad = 0;
        for (const r of body) {
          const date = parseAnyDate(r[ci.date]);
          let amount;
          if (ci.amt >= 0) amount = parseAmount(r[ci.amt]);
          else {
            const d = ci.debit >= 0 ? Math.abs(parseAmount(r[ci.debit])) || 0 : 0;
            const c = ci.credit >= 0 ? Math.abs(parseAmount(r[ci.credit])) || 0 : 0;
            amount = c - d;
          }
          if (!date || isNaN(amount)) { bad++; continue; }
          if (f.flip) amount = -amount;
          amount = round2(amount);
          const desc = (r[ci.desc] || 'Transaction').trim();
          const key = `${date}|${amount}|${desc}`;
          if (existingKeys.has(key)) { skipped++; continue; }
          existingKeys.add(key);
          const t = { id: 'csv:' + uid(), accountId: a.id, source: 'csv', date, amount, desc, pending: false, note: '' };
          t.category = autoCategory(t, a);
          state.transactions.push(t);
          added++;
        }
        sortTxns(); takeSnapshot(); save(); render();
        toast(`Imported ${added}${skipped ? ` · ${skipped} duplicates skipped` : ''}${bad ? ` · ${bad} unreadable rows` : ''}`);
      },
      (form) => {
        form.target.addEventListener('change', () => { $('#new-acct-fields', form).hidden = form.target.value !== 'new'; });
      });
  };
  reader.readAsText(file);
}

/* =========================================================================
   Demo data
   ========================================================================= */
function loadDemo() {
  state = freshState();
  state.demo = true;
  const A = (name, org, type, balance) => ({ id: uid(), source: 'demo', name, org, type, balance, hidden: false, balanceDate: Date.now() });
  const chk = A('Checking', 'LOC Credit Union', 'checking', 6284.17);
  const sav = A('Savings', 'LOC Credit Union', 'savings', 14820.55);
  const amex = A('Blue Cash Preferred', 'American Express', 'credit', -1186.42);
  const apple = A('Apple Card', 'Apple', 'credit', -642.08);
  const costco = A('Costco Anywhere Visa', 'Citi', 'credit', -418.9);
  const k401 = A('401(k)', 'Retirement plan', 'retirement', 148312.4);
  const roth = A('Roth IRA', 'Retirement plan', 'retirement', 41987.15);
  state.accounts = [chk, sav, amex, apple, costco, k401, roth];

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const T = (daysAgo, a, desc, amount, pending = false) => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    const t = { id: 'demo:' + uid(), accountId: a.id, source: 'demo', date: isoDate(d), amount: round2(amount), desc, pending, note: '' };
    t.category = autoCategory(t, a);
    state.transactions.push(t);
  };
  const eat = ['Starbucks', 'Chipotle', 'Panera Bread', 'Culver’s', 'Jet’s Pizza', 'Tim Hortons', 'Sushi Bistro', 'DoorDash'];
  const groc = ['Meijer', 'Kroger', 'Aldi', 'Trader Joe’s', 'Costco Whse #0389'];
  const shop = ['Amazon.com', 'Target', 'Etsy', 'Best Buy', 'Old Navy'];
  for (let d = 0; d < 75; d++) {
    if (rnd() < .55) T(d, pick([amex, apple, chk]), pick(eat), -(8 + rnd() * 42), d < 2 && rnd() < .5);
    if (d % 4 === 1) T(d, pick([costco, amex]), pick(groc), -(45 + rnd() * 150), d < 2);
    if (d % 6 === 3) T(d, costco, pick(['Costco Gas #0389', 'Speedway', 'Shell Oil']), -(35 + rnd() * 25));
    if (rnd() < .18) T(d, pick([apple, amex]), pick(shop), -(12 + rnd() * 110));
    if (rnd() < .05) T(d, apple, pick(['AMC Theatres', 'Steam Games', 'Ticketmaster']), -(15 + rnd() * 60));
    if (rnd() < .04) T(d, chk, pick(['CVS Pharmacy', 'Walgreens']), -(9 + rnd() * 30));
  }
  const today = new Date();
  for (let m = 0; m < 3; m++) {
    const first = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const ago = dd => Math.round((midnight - new Date(first.getFullYear(), first.getMonth(), dd)) / 86400000);
    const ifPast = (dd, fn) => { const a = ago(dd); if (a >= 0) fn(a); };
    ifPast(1, a => T(a, chk, 'Mr. Cooper Mortgage', -1842.33));
    ifPast(15, a => T(a, chk, 'Payroll Direct Dep ACME CORP', 3412.88));
    ifPast(28, a => T(a, chk, 'Payroll Direct Dep ACME CORP', 3412.88));
    ifPast(9, a => T(a, chk, 'DTE Energy', -(140 + rnd() * 60)));
    ifPast(11, a => T(a, chk, 'Consumers Energy', -(60 + rnd() * 40)));
    ifPast(12, a => T(a, chk, 'Xfinity Internet', -79.99));
    ifPast(14, a => T(a, chk, 'Verizon Wireless', -62.5));
    ifPast(5, a => T(a, chk, 'Progressive Insurance', -164.2));
    ifPast(3, a => T(a, apple, 'Netflix.com', -15.49));
    ifPast(7, a => T(a, apple, 'Spotify USA', -11.99));
    ifPast(18, a => { T(a, chk, 'AMEX EPAYMENT ACH PMT', -1250); T(a, amex, 'Payment Received - Thank You', 1250); });
    ifPast(20, a => { T(a, chk, 'APPLECARD GSBANK PAYMENT', -700); T(a, apple, 'ACH Deposit Internet Transfer', 700); });
    ifPast(22, a => { T(a, chk, 'CITI CARD ONLINE PAYMENT', -520); T(a, costco, 'Online Payment, Thank You', 520); });
    ifPast(16, a => { T(a, chk, 'Transfer to Share 01', -500); T(a, sav, 'Transfer from Share 00', 500); });
  }
  sortTxns();

  // A year of net-worth history with a gentle market wobble.
  for (let i = 365; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const p = 1 - i / 365;
    const wob = Math.sin(i / 23) * 2400 + Math.sin(i / 7) * 600;
    const retire = 162000 + p * 28300 + wob;
    const cash = 17500 + p * 3600 + Math.sin(i / 15) * 900;
    const debt = 1900 + Math.sin(i / 11) * 500;
    state.snapshots.push({ d: isoDate(d), nw: round2(cash + retire - debt), cash: round2(cash), retire: round2(retire), invest: 0, other: 0, debt: round2(debt) });
  }
  takeSnapshot();

  const g = (emoji, name, target, saved, months, contribs) => ({
    id: uid(), emoji, name, target, start: saved,
    due: (() => { const d = new Date(); d.setMonth(d.getMonth() + months); return isoDate(d); })(),
    contributions: contribs.map(([daysAgo, amt]) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return { id: uid(), date: isoDate(d), amount: amt }; }),
  });
  state.goals = [
    g('🛟', 'Emergency fund', 20000, 12000, 10, [[40, 500], [10, 500]]),
    g('🏝️', 'Philippines trip', 6000, 1500, 14, [[35, 300], [5, 300]]),
    g('🚗', 'Next car down payment', 8000, 2200, 24, [[20, 250]]),
  ];
  save(); render();
  toast('Sample data loaded');
}
function clearDemo(keepAccount) {
  if (!state.demo) return;
  const settings = state.settings;
  const keep = keepAccount ? [keepAccount] : [];
  state = { ...freshState(), settings, accounts: keep };
  state.demo = false;
}

/* =========================================================================
   Rendering
   ========================================================================= */
const TITLES = { overview: 'Overview', transactions: 'Transactions', budget: 'Budget', goals: 'Goals' };

function render() {
  if (!state) { renderWelcome(); return; }
  document.body.classList.toggle('privacy', !!state.settings.privacy);
  $$('.tabbar button').forEach(b => b.classList.toggle('active', !ui.settingsOpen && b.dataset.tab === ui.tab));
  $('#page-title').textContent = ui.settingsOpen ? 'Accounts & settings' : TITLES[ui.tab];
  const view = $('#view');
  const demoBanner = state.demo ? `<div class="note warn">You’re looking at sample data. <button class="link-btn" data-act="open-settings">Connect your accounts</button> to replace it.</div>` : '';
  if (ui.settingsOpen) view.innerHTML = renderSettings();
  else view.innerHTML = demoBanner + ({ overview: renderOverview, transactions: renderTransactions, budget: renderBudget, goals: renderGoals }[ui.tab])();
  renderSyncStatus();
}
function renderSyncStatus() {
  const el = $('#sync-status'), btn = $('#btn-sync');
  btn.classList.toggle('spinning', ui.syncing);
  if (!state || !state.settings.sfAccess) { el.textContent = ''; return; }
  el.textContent = ui.syncing ? 'Syncing…' : (state.settings.lastSyncError ? '⚠︎ ' : '') + (state.settings.lastSync ? timeAgo(state.settings.lastSync) : '');
}

function renderWelcome() {
  $('#page-title').textContent = 'Tally';
  $('#view').innerHTML = `
    <div class="welcome">
      <span class="brand-mark"></span>
      <h2>Your money, in one place</h2>
      <p>Connect LOC Credit Union, your cards and retirement accounts through SimpleFIN Bridge, or import CSV statements. Everything stays on this device.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="start-connect">Connect accounts</button>
        <button class="btn" data-act="start-demo">Explore with sample data</button>
      </div>
    </div>`;
}

/* ---------- Overview ---------- */
function renderOverview() {
  if (!state.accounts.length) return emptyAccounts();
  const t = totals();
  const series = rangeSeries();
  const first = series[0];
  const change = first ? t.nw - first.nw : 0;
  const changePct = first && first.nw ? change / Math.abs(first.nw) * 100 : 0;
  const parts = [
    ['cash', t.cash], ['retire', t.retire], ['invest', t.invest], ['other', t.other],
  ].filter(([, v]) => v > 0);
  const month = monthKey(new Date());
  const { byCat } = monthSpending(month);
  const spent = Object.entries(byCat).reduce((s, [, v]) => s + v, 0);
  const budgeted = state.categories.reduce((s, c) => s + budgetFor(c.id, month), 0);
  const monthPct = new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  return `
    <section class="card hero">
      <div class="card-head">
        <span class="eyebrow">Net worth</span>
        <div class="range-tabs">${['1M', '3M', '1Y', 'All'].map(r => `<button data-range="${r}" class="${ui.range === r ? 'active' : ''}">${r}</button>`).join('')}</div>
      </div>
      <div class="big-number num">${money(t.nw, { cents: false })}</div>
      ${first ? `<div class="delta num ${change >= 0 ? 'pos' : 'neg'}">${change >= 0 ? '▲' : '▼'} ${money(Math.abs(change), { cents: false })} (${Math.abs(changePct).toFixed(1)}%) <span class="faint">over ${rangeLabel()}</span></div>` : `<div class="faint">History builds up as you sync</div>`}
      <div class="spark">${sparkline(series.concat([{ nw: t.nw }]))}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Where it is</h2><span class="faint num">${money(t.assets, { cents: false })} in assets</span></div>
      <div class="dist-wrap">
        <div class="donut">${donut(parts.map(([g, v]) => ({ v, color: GROUPS[g].color })), t.assets)}</div>
        <div class="legend">
          ${parts.map(([g, v]) => `
            <div class="legend-item">
              <span class="sw" style="background:${GROUPS[g].color}"></span>
              <div><div class="lbl">${GROUPS[g].label}</div><div class="pct">${(v / t.assets * 100).toFixed(1)}% of assets</div></div>
              <div class="num acct-bal">${money(v, { cents: false })}</div>
            </div>`).join('')}
          ${t.debt > 0 ? `
            <div class="legend-item">
              <span class="sw" style="background:${GROUPS.debt.color}"></span>
              <div><div class="lbl">Owed on cards & loans</div><div class="pct">subtracted from net worth</div></div>
              <div class="num acct-bal neg">−${money(t.debt, { cents: false })}</div>
            </div>` : ''}
        </div>
      </div>
      ${t.cash > 0 && t.retire > 0 ? `
        <div class="split-bar"><div style="width:${t.cash / (t.cash + t.retire) * 100}%;background:var(--c-cash)"></div><div style="flex:1;background:var(--c-retire)"></div></div>
        <div class="faint">Checking & savings vs. retirement: <b class="num">${Math.round(t.cash / (t.cash + t.retire) * 100)}%</b> / <b class="num">${Math.round(t.retire / (t.cash + t.retire) * 100)}%</b></div>` : ''}
    </section>

    <section class="card" data-act="goto" data-tab="budget" style="cursor:pointer">
      <div class="card-head"><h2>${new Date().toLocaleDateString('en-US', { month: 'long' })} spending</h2><span class="faint">Budget →</span></div>
      <div class="row" style="align-items:baseline">
        <div><span class="num" style="font-size:22px;font-weight:700">${money(spent, { cents: false })}</span> <span class="faint num">of ${money(budgeted, { cents: false })}</span></div>
        <div style="text-align:right" class="faint num ${spent > budgeted ? 'neg' : ''}">${spent > budgeted ? money(spent - budgeted, { cents: false }) + ' over' : money(budgeted - spent, { cents: false }) + ' left'}</div>
      </div>
      <div class="bar ${spent > budgeted ? 'over' : spent / budgeted > monthPct + .1 ? 'near' : ''}" style="margin-top:8px"><i style="width:${Math.min(100, budgeted ? spent / budgeted * 100 : 0)}%"></i><span class="tick" style="left:${monthPct * 100}%"></span></div>
    </section>

    <div class="section-title"><h2>Accounts</h2><button class="btn small" data-act="open-settings">Manage</button></div>
    ${['cash', 'debt', 'retire', 'invest', 'other'].map(g => {
      const list = visibleAccounts().filter(a => ACCOUNT_TYPES[a.type].group === g);
      if (!list.length) return '';
      const sum = list.reduce((s, a) => s + a.balance, 0);
      return `<section class="card acct-group">
        <div class="card-head"><h3>${GROUPS[g].label}</h3><span class="num faint">${money(sum, { cents: false })}</span></div>
        ${list.map(acctRow).join('')}
      </section>`;
    }).join('')}`;
}
function acctRow(a) {
  const sub = [a.org, ACCOUNT_TYPES[a.type].label, a.source === 'csv' ? 'CSV import' : a.source === 'manual' ? 'Manual' : a.balanceDate ? 'updated ' + timeAgo(a.balanceDate) : ''].filter(Boolean).join(' · ');
  return `<div class="acct" data-act="edit-account" data-id="${a.id}" style="cursor:pointer">
    <div class="acct-logo" style="background:${orgColor(a.org || a.name)}">${esc(initials(a.org || a.name))}</div>
    <div><div class="acct-name">${esc(acctName(a))}</div><div class="acct-sub">${esc(sub)}</div></div>
    <div class="acct-bal num ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</div>
  </div>`;
}
function emptyAccounts() {
  return `<div class="empty card">
    <div style="font-size:34px">🏦</div>
    <h3>No accounts yet</h3>
    <p>Connect your bank through SimpleFIN, import a CSV, or add an account by hand.</p>
    <div class="btn-row" style="justify-content:center"><button class="btn primary" data-act="open-settings">Add accounts</button><button class="btn" data-act="start-demo">Try sample data</button></div>
  </div>`;
}
function rangeLabel() { return { '1M': 'the last month', '3M': 'the last 3 months', '1Y': 'the last year', All: 'all time' }[ui.range]; }
function rangeSeries() {
  const days = { '1M': 30, '3M': 91, '1Y': 365, All: 1e5 }[ui.range];
  const cutoff = isoDate(new Date(Date.now() - days * 86400000));
  const today = isoDate(new Date());
  return state.snapshots.filter(s => s.d >= cutoff && s.d < today);
}
function sparkline(points) {
  if (points.length < 2) return '';
  const W = 600, H = 90, vals = points.map(p => p.nw);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const xy = vals.map((v, i) => [i / (vals.length - 1) * W, H - 6 - (v - min) / span * (H - 14)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const up = vals[vals.length - 1] >= vals[0];
  const c = up ? 'var(--good)' : 'var(--bad)';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d}L${W},${H}L0,${H}Z" fill="url(#sg)" stroke="none"/>
    <path d="${d}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
function donut(parts, total) {
  const r = 58, C = 2 * Math.PI * r;
  let off = 0;
  const gap = parts.length > 1 ? 3 : 0;
  const segs = parts.map(p => {
    const len = Math.max(0, p.v / total * C - gap);
    const s = `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${p.color}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)"/>`;
    off += p.v / total * C;
    return s;
  }).join('');
  return `<svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="18"/>${segs}
    <text x="75" y="70" text-anchor="middle" font-size="11" fill="var(--ink-3)" stroke="none" font-weight="600">ASSETS</text>
    <text x="75" y="90" text-anchor="middle" font-size="17" fill="var(--ink)" stroke="none" font-weight="700" class="num">${compact(total)}</text></svg>`;
}

/* ---------- Transactions ---------- */
function filteredTxns() {
  const q = ui.txnSearch.trim().toLowerCase();
  return state.transactions.filter(t => {
    const a = acct(t.accountId);
    if (!a || a.hidden) return false;
    if (ui.txnAccount !== 'all' && t.accountId !== ui.txnAccount) return false;
    if (ui.txnFilter === 'pending' && !t.pending) return false;
    if (ui.txnFilter === 'uncategorized' && t.category !== 'uncategorized') return false;
    if (ui.txnFilter === 'income' && t.category !== 'income') return false;
    if (ui.txnFilter === 'spending' && (t.amount >= 0 || ['transfer', 'income'].includes(t.category))) return false;
    if (q) {
      const hay = `${t.desc} ${t.note} ${cat(t.category).name} ${acctName(a)} ${Math.abs(t.amount).toFixed(2)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function renderTransactions() {
  if (!state.accounts.length) return emptyAccounts();
  const list = filteredTxns();
  const shown = list.slice(0, ui.txnLimit);
  const uncategorized = state.transactions.filter(t => t.category === 'uncategorized').length;
  let html = `
    <div class="toolbar">
      <input class="input" type="search" placeholder="Search merchant, amount, note…" value="${esc(ui.txnSearch)}" data-input="txn-search">
      <select class="input" data-input="txn-account">
        <option value="all">All accounts</option>
        ${visibleAccounts().filter(a => SPENDING_TYPES.has(a.type) || state.transactions.some(t => t.accountId === a.id)).map(a => `<option value="${a.id}" ${ui.txnAccount === a.id ? 'selected' : ''}>${esc(acctName(a))}</option>`).join('')}
      </select>
    </div>
    <div class="chips">
      ${[['all', 'All'], ['spending', 'Spending'], ['income', 'Income'], ['pending', 'Pending'], ['uncategorized', `Needs category${uncategorized ? ` (${uncategorized})` : ''}`]].map(([k, l]) => `<button class="chip ${ui.txnFilter === k ? 'active' : ''}" data-act="txn-filter" data-f="${k}">${l}</button>`).join('')}
      <button class="chip" data-act="add-txn">+ Add</button>
    </div>`;
  if (!shown.length) return html + `<div class="empty">No transactions match.</div>`;
  let day = null, open = false;
  for (const t of shown) {
    if (t.date !== day) {
      if (open) html += '</div>';
      const dayTotal = list.filter(x => x.date === t.date && !['transfer'].includes(x.category)).reduce((s, x) => s + x.amount, 0);
      html += `<div class="day-head"><span>${dayLabel(t.date)}</span><span class="num">${money(dayTotal, { sign: true })}</span></div><div class="txn-list">`;
      day = t.date; open = true;
    }
    html += txnRow(t);
  }
  if (open) html += '</div>';
  if (list.length > shown.length) html += `<div style="text-align:center;margin-top:14px"><button class="btn" data-act="more-txns">Show more (${list.length - shown.length})</button></div>`;
  return html;
}
function txnRow(t) {
  const c = cat(t.category), a = acct(t.accountId);
  return `<div class="txn" data-act="edit-txn" data-id="${esc(t.id)}">
    <div class="txn-ico">${c.emoji}</div>
    <div style="min-width:0">
      <div class="txn-desc">${esc(prettyDesc(t.desc))}</div>
      <div class="txn-meta">${t.pending ? '<span class="pill pending">Pending</span>' : ''}<span>${esc(c.name)}</span><span>·</span><span>${esc(acctName(a))}</span>${t.note ? `<span>· ${esc(t.note)}</span>` : ''}</div>
    </div>
    <div class="txn-amt num ${t.amount > 0 ? 'pos' : ''}">${money(t.amount, { sign: true })}</div>
  </div>`;
}

/* ---------- Budget ---------- */
function renderBudget() {
  const m = ui.budgetMonth;
  const { byCat, income } = monthSpending(m);
  const isCurrent = m === monthKey(new Date());
  const monthPct = isCurrent ? new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() : (m < monthKey(new Date()) ? 1 : 0);
  const budgeted = state.categories.reduce((s, c) => s + budgetFor(c.id, m), 0);
  const spent = Object.values(byCat).reduce((s, v) => s + v, 0);
  const left = budgeted - spent;
  const groups = [...new Set([...GROUP_ORDER, ...state.categories.map(c => c.group)])];

  const catRow = c => {
    const b = budgetFor(c.id, m), s = byCat[c.id] || 0;
    const ratio = b ? s / b : (s > 0 ? 2 : 0);
    const cls = ratio > 1 ? 'over' : (ratio > monthPct + .1 && ratio > .5) ? 'near' : '';
    return `<div class="bcat" data-act="edit-budget" data-id="${c.id}">
      <div class="bcat-top">
        <div class="bcat-name"><span>${c.emoji}</span>${esc(c.name)}</div>
        <div class="bcat-nums num"><b>${money(s, { cents: false })}</b> / ${money(b, { cents: false })}</div>
      </div>
      <div class="bar ${cls}"><i style="width:${Math.min(100, ratio * 100)}%"></i>${isCurrent ? `<span class="tick" style="left:${monthPct * 100}%"></span>` : ''}</div>
      <div class="faint num" style="margin-top:4px">${b - s >= 0 ? money(b - s, { cents: false }) + ' left' : `<span class="neg">${money(s - b, { cents: false })} over</span>`}</div>
    </div>`;
  };
  const unc = byCat.uncategorized || 0;
  return `
    <div class="month-nav">
      <button class="icon-btn" data-act="month" data-d="-1" aria-label="Previous month"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <h2>${monthLabel(m)}</h2>
      <button class="icon-btn" data-act="month" data-d="1" aria-label="Next month"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <section class="card">
      <div class="budget-summary">
        <div><div class="k">Budgeted</div><div class="v num">${money(budgeted, { cents: false })}</div></div>
        <div><div class="k">Spent</div><div class="v num">${money(spent, { cents: false })}</div></div>
        <div><div class="k">${left >= 0 ? 'Left' : 'Over'}</div><div class="v num ${left < 0 ? 'neg' : 'pos'}">${money(Math.abs(left), { cents: false })}</div></div>
      </div>
      <div class="bar ${spent > budgeted ? 'over' : ''}" style="margin:14px 0 8px"><i style="width:${Math.min(100, budgeted ? spent / budgeted * 100 : 0)}%"></i>${isCurrent ? `<span class="tick" style="left:${monthPct * 100}%"></span>` : ''}</div>
      <div class="faint">Income this month: <b class="num pos">${money(income, { cents: false })}</b>${income ? ` · ${income - spent >= 0 ? 'kept' : 'short'} <b class="num">${money(Math.abs(income - spent), { cents: false })}</b>` : ''}</div>
    </section>
    ${unc > 0 ? `<div class="note warn">${money(unc, { cents: false })} of spending isn’t categorized yet. <button class="link-btn" data-act="show-uncat">Sort it</button></div>` : ''}
    ${groups.map(g => {
      const cats = state.categories.filter(c => c.group === g);
      if (!cats.length) return '';
      const gb = cats.reduce((s, c) => s + budgetFor(c.id, m), 0), gs = cats.reduce((s, c) => s + (byCat[c.id] || 0), 0);
      return `<section class="card"><div class="card-head"><div class="bgroup-title">${esc(g)}</div><span class="faint num">${money(gs, { cents: false })} / ${money(gb, { cents: false })}</span></div>${cats.map(catRow).join('')}</section>`;
    }).join('')}
    <button class="btn block" data-act="add-category">+ Add category</button>`;
}

/* ---------- Goals ---------- */
function goalSaved(g) { return (g.start || 0) + g.contributions.reduce((s, c) => s + c.amount, 0); }
function renderGoals() {
  const total = state.goals.reduce((s, g) => s + goalSaved(g), 0);
  const target = state.goals.reduce((s, g) => s + g.target, 0);
  const thisMonth = monthKey(new Date());
  const contributedThisMonth = state.goals.reduce((s, g) => s + g.contributions.filter(c => c.date.startsWith(thisMonth)).reduce((x, c) => x + c.amount, 0), 0);
  return `
    ${state.goals.length ? `<section class="card">
      <div class="budget-summary">
        <div><div class="k">Saved</div><div class="v num">${money(total, { cents: false })}</div></div>
        <div><div class="k">Of targets</div><div class="v num">${money(target, { cents: false })}</div></div>
        <div><div class="k">This month</div><div class="v num pos">${money(contributedThisMonth, { cents: false })}</div></div>
      </div>
    </section>` : `<div class="empty card"><div style="font-size:34px">🎯</div><h3>No goals yet</h3><p>Set a target, pick a date, and log what you put toward it.</p></div>`}
    <div class="goal-grid">${state.goals.map(goalCard).join('')}</div>
    <button class="btn block primary" style="margin-top:14px" data-act="add-goal">+ New goal</button>`;
}
function goalCard(g) {
  const saved = goalSaved(g), pct = Math.min(1, g.target ? saved / g.target : 0);
  const r = 26, C = 2 * Math.PI * r;
  const months = g.due ? Math.max(0, (parseISO(g.due).getFullYear() - new Date().getFullYear()) * 12 + parseISO(g.due).getMonth() - new Date().getMonth()) : null;
  const remaining = Math.max(0, g.target - saved);
  let hint = '';
  if (remaining <= 0) hint = '🎉 Goal reached!';
  else if (months != null && months > 0) hint = `Put in <b class="num">${money(remaining / months, { cents: false })}</b>/month to hit it by ${parseISO(g.due).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  else if (months === 0) hint = `Due this month — <b class="num">${money(remaining, { cents: false })}</b> to go`;
  return `<section class="card goal">
    <div class="goal-top" data-act="edit-goal" data-id="${g.id}" style="cursor:pointer">
      <div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${pct * C} ${C}"/></svg><span>${Math.round(pct * 100)}%</span></div>
      <div style="min-width:0"><div class="goal-emoji">${esc(g.emoji || '🎯')}</div><h3>${esc(g.name)}</h3></div>
    </div>
    <div class="goal-stats"><span class="num"><b style="color:var(--ink)">${money(saved, { cents: false })}</b> saved</span><span class="num">of ${money(g.target, { cents: false })}</span></div>
    ${hint ? `<div class="goal-hint">${hint}</div>` : ''}
    <button class="btn primary small" data-act="contribute" data-id="${g.id}">+ Contribute</button>
  </section>`;
}

/* ---------- Settings ---------- */
function renderSettings() {
  const s = state.settings;
  const connected = !!s.sfAccess;
  return `
    <div style="margin-bottom:10px"><button class="btn small" data-act="close-settings">← Back</button></div>

    <section class="card">
      <div class="card-head"><h2>Bank connection</h2><span class="pill">${connected ? 'SimpleFIN connected' : 'Not connected'}</span></div>
      ${connected ? `
        <p class="faint">Last sync: ${s.lastSync ? new Date(s.lastSync).toLocaleString() : 'never'}. Tally checks for new transactions when you open it and every ${s.autoSyncHours} hours while it’s open.</p>
        ${s.lastSyncError ? `<div class="note warn">${esc(s.lastSyncError)}</div>` : ''}
        <div class="btn-row">
          <button class="btn primary" data-act="sync">Sync now</button>
          <button class="btn" data-act="sf-add-more">Add another bank</button>
          <button class="btn danger" data-act="sf-disconnect">Disconnect</button>
        </div>` : `
        <p class="muted">Tally reads your accounts through <b>SimpleFIN Bridge</b> — a read-only service ($15/year) that links to LOC Credit Union, American Express, Citi (Costco Visa) and most retirement providers. Tally never sees your bank passwords.</p>
        <ol class="steps">
          <li>Open <a href="https://bridge.simplefin.org" target="_blank" rel="noopener">bridge.simplefin.org</a>, create an account and add each institution.</li>
          <li>Under <b>Apps</b>, choose <b>New connection</b> and copy the setup token.</li>
          <li>Paste it below. The token works once.</li>
        </ol>
        <label class="field"><span>SimpleFIN setup token</span><textarea class="input" id="sf-token" placeholder="aHR0cHM6Ly9…"></textarea></label>
        <button class="btn primary" data-act="sf-connect">Connect</button>`}
      <div class="note" style="margin-top:14px">🍎 <b>Apple Card</b> doesn’t share data with web apps — Apple only allows native iPhone apps. Export it instead: Wallet → Apple Card → Card Balance → pick a statement → <i>Export Transactions</i> (CSV), then import it below.</div>
      <details>
        <summary class="faint" style="cursor:pointer">Sync proxy & schedule</summary>
        <div style="margin-top:10px">
          <label class="field"><span>Proxy URL (only if syncing is blocked by your browser)</span><input class="input" id="sf-proxy" placeholder="https://tally-proxy.yourname.workers.dev" value="${esc(s.proxy)}"></label>
          <label class="field"><span>Check for new transactions every</span>
            <select class="input" id="sf-interval">${[1, 2, 4, 6, 12, 24].map(h => `<option value="${h}" ${s.autoSyncHours === h ? 'selected' : ''}>${h} hour${h > 1 ? 's' : ''}</option>`).join('')}<option value="0" ${!s.autoSyncHours ? 'selected' : ''}>Only when I tap sync</option></select>
          </label>
          <button class="btn small" data-act="save-sync-settings">Save</button>
          <p class="faint">SimpleFIN refreshes from banks about once a day and limits apps to roughly 24 requests a day, so syncing more often than hourly won’t bring in anything new.</p>
        </div>
      </details>
    </section>

    <section class="card">
      <div class="card-head"><h2>Accounts</h2><button class="btn small" data-act="add-manual">+ Manual account</button></div>
      ${state.accounts.length ? state.accounts.map(a => `
        <div class="settings-acct">
          <div><div class="acct-name">${esc(acctName(a))} ${a.hidden ? '<span class="pill">hidden</span>' : ''}</div><div class="acct-sub">${esc([a.org, a.source === 'simplefin' ? 'SimpleFIN' : a.source === 'csv' ? 'CSV' : a.source === 'demo' ? 'Sample' : 'Manual'].filter(Boolean).join(' · '))} · <span class="num">${money(a.balance)}</span></div></div>
          <button class="btn small" data-act="edit-account" data-id="${a.id}">Edit</button>
        </div>`).join('') : '<p class="faint">No accounts yet.</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>Import a CSV statement</h2></div>
      <p class="faint">Works with Apple Card exports and any bank’s CSV download. Duplicates are skipped.</p>
      <label class="btn"><input type="file" accept=".csv,text/csv" id="csv-file" hidden>Choose CSV file…</label>
    </section>

    <section class="card">
      <div class="card-head"><h2>Your data</h2></div>
      <p class="faint">Everything is stored only in this browser on this device. Back it up now and then — clearing browser data would erase it.</p>
      <div class="btn-row">
        <button class="btn" data-act="export">Download backup</button>
        <label class="btn"><input type="file" accept=".json,application/json" id="restore-file" hidden>Restore backup…</label>
        <button class="btn" data-act="start-demo">Load sample data</button>
        <button class="btn danger" data-act="wipe">Erase everything</button>
      </div>
      <p class="faint" style="margin-top:12px">Tally ${APP_VERSION}</p>
    </section>`;
}

/* =========================================================================
   Modals
   ========================================================================= */
let modalHandlers = null;
function openModal(html, onOk, onOpen, onAlt) {
  const dlg = $('#modal'), form = $('#modal-form');
  form.innerHTML = html;
  modalHandlers = { onOk, onAlt };
  dlg.returnValue = '';
  dlg.showModal();
  if (onOpen) onOpen(form);
  const first = form.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea');
  if (first && window.matchMedia('(pointer:fine)').matches) first.focus();
}
$('#modal-form').addEventListener('submit', e => {
  const btn = e.submitter;
  const v = btn ? btn.value : 'ok';
  const form = e.target;
  if (v === 'ok' && modalHandlers?.onOk) {
    if (!form.reportValidity()) { e.preventDefault(); return; }
    const r = modalHandlers.onOk(form);
    if (r === false) { e.preventDefault(); return; }
  } else if (v && v !== 'cancel' && modalHandlers?.onAlt) {
    const r = modalHandlers.onAlt(v, form);
    if (r === false) { e.preventDefault(); return; }
  }
});
$('#modal-form').addEventListener('click', e => {
  const b = e.target.closest('.cat-opt');
  if (b) {
    e.preventDefault();
    $$('.cat-opt', e.currentTarget).forEach(x => x.classList.toggle('active', x === b));
    e.currentTarget.querySelector('input[name=category]').value = b.dataset.cat;
  }
});

function catPicker(current, { includeSystem = true } = {}) {
  const cats = includeSystem ? allCategories() : state.categories;
  return `<input type="hidden" name="category" value="${esc(current)}">
    <div class="cat-grid">${cats.map(c => `<button type="button" class="cat-opt ${c.id === current ? 'active' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('')}</div>`;
}

function editTxn(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  const a = acct(t.accountId);
  const editable = t.source !== 'simplefin';
  openModal(`
    <h2>${esc(prettyDesc(t.desc))}</h2>
    <p class="faint num">${money(t.amount, { sign: true })} · ${dayLabel(t.date)} · ${esc(acctName(a))}${t.pending ? ' · pending' : ''}</p>
    ${editable ? `<div class="row">
      <label class="field"><span>Description</span><input class="input" name="desc" value="${esc(t.desc)}" required></label>
      <label class="field"><span>Amount</span><input class="input" name="amount" type="number" step="0.01" value="${t.amount}" required></label>
    </div>
    <label class="field"><span>Date</span><input class="input" name="date" type="date" value="${t.date}" required></label>` : ''}
    <div class="field"><span>Category</span>${catPicker(t.category)}</div>
    <label class="check"><input type="checkbox" name="remember" checked> Always use this category for “${esc(merchantKey(t.desc) || t.desc)}”</label>
    <label class="field"><span>Note</span><input class="input" name="note" value="${esc(t.note || '')}" placeholder="Optional"></label>
    <div class="modal-actions">
      ${editable ? '<button class="btn danger" value="delete" formnovalidate>Delete</button><span class="spacer"></span>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Save</button>
    </div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      const changed = f.category !== t.category;
      t.category = f.category; t.note = f.note.trim();
      if (editable) { t.desc = f.desc.trim(); t.amount = round2(+f.amount); t.date = f.date; }
      if (f.remember && changed) {
        const key = merchantKey(t.desc);
        if (key) {
          state.rules[key] = f.category;
          let n = 0;
          for (const o of state.transactions) if (o !== t && merchantKey(o.desc) === key && o.category !== f.category) { o.category = f.category; n++; }
          if (n) toast(`Also updated ${n} other ${prettyDesc(key)} transaction${n === 1 ? '' : 's'}`);
        }
      }
      sortTxns(); save(); render();
    }, null,
    (v) => {
      if (v === 'delete') {
        state.transactions = state.transactions.filter(x => x.id !== id);
        save(); render(); toast('Transaction deleted');
      }
    });
}

function addTxn() {
  const accts = visibleAccounts();
  if (!accts.length) return toast('Add an account first');
  openModal(`
    <h2>Add transaction</h2>
    <label class="field"><span>Description</span><input class="input" name="desc" required placeholder="e.g. Farmers market"></label>
    <div class="row">
      <label class="field"><span>Amount</span><input class="input" name="amount" type="number" step="0.01" min="0" required></label>
      <label class="field"><span>Type</span><select class="input" name="dir"><option value="out">Money out</option><option value="in">Money in</option></select></label>
    </div>
    <div class="row">
      <label class="field"><span>Date</span><input class="input" name="date" type="date" value="${isoDate(new Date())}" required></label>
      <label class="field"><span>Account</span><select class="input" name="account">${accts.map(a => `<option value="${a.id}">${esc(acctName(a))}</option>`).join('')}</select></label>
    </div>
    <div class="field"><span>Category</span>${catPicker('misc')}</div>
    <div class="modal-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Add</button></div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      const amt = Math.abs(+f.amount) * (f.dir === 'out' ? -1 : 1);
      state.transactions.push({ id: 'man:' + uid(), accountId: f.account, source: 'manual', date: f.date, amount: round2(amt), desc: f.desc.trim(), pending: false, note: '', category: f.category });
      sortTxns(); save(); render();
    });
}

function editAccount(id) {
  const a = acct(id);
  if (!a) return;
  const balanceEditable = a.source !== 'simplefin';
  const isDebt = !ACCOUNT_TYPES[a.type].asset;
  openModal(`
    <h2>${esc(acctName(a))}</h2>
    <p class="faint">${esc([a.org, a.source === 'simplefin' ? 'Synced via SimpleFIN' : a.source === 'csv' ? 'Imported from CSV' : a.source === 'demo' ? 'Sample account' : 'Manual account'].filter(Boolean).join(' · '))}</p>
    <label class="field"><span>Display name</span><input class="input" name="nickname" value="${esc(a.nickname || a.name)}"></label>
    <label class="field"><span>Account type</span><select class="input" name="type">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    ${balanceEditable ? `<label class="field"><span>${isDebt ? 'Amount owed right now' : 'Current balance'}</span><input class="input" name="balance" type="number" step="0.01" value="${isDebt ? Math.abs(a.balance) : a.balance}"></label>` : ''}
    <label class="check"><input type="checkbox" name="hidden" ${a.hidden ? 'checked' : ''}> Hide this account (leave it out of totals and budget)</label>
    <div class="modal-actions">
      ${a.source !== 'simplefin' ? '<button class="btn danger" value="delete" formnovalidate>Delete</button><span class="spacer"></span>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Save</button>
    </div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      a.nickname = f.nickname.trim() && f.nickname.trim() !== a.name ? f.nickname.trim() : '';
      a.type = f.type;
      a.hidden = !!f.hidden;
      if (balanceEditable && f.balance !== '') {
        const v = +f.balance;
        a.balance = round2(ACCOUNT_TYPES[a.type].asset ? v : -Math.abs(v));
        a.balanceDate = Date.now();
      }
      takeSnapshot(); save(); render();
    }, null,
    v => {
      if (v === 'delete') {
        if (!confirmInline('Delete this account and its transactions?')) return false;
        state.accounts = state.accounts.filter(x => x.id !== id);
        state.transactions = state.transactions.filter(t => t.accountId !== id);
        takeSnapshot(); save(); render(); toast('Account deleted');
      }
    });
}
function confirmInline(msg) { return window.confirm(msg); }

function addManualAccount() {
  openModal(`
    <h2>Add an account by hand</h2>
    <p class="faint">Use this for anything SimpleFIN can’t reach — update the balance whenever you check it.</p>
    <label class="field"><span>Name</span><input class="input" name="name" required placeholder="e.g. Pension, HSA, Car"></label>
    <div class="row">
      <label class="field"><span>Type</span><select class="input" name="type">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${k === 'retirement' ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="field"><span>Balance (or amount owed)</span><input class="input" name="balance" type="number" step="0.01" required></label>
    </div>
    <label class="field"><span>Institution (optional)</span><input class="input" name="org"></label>
    <div class="modal-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Add</button></div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      if (state.demo) clearDemo();
      const asset = ACCOUNT_TYPES[f.type].asset;
      state.accounts.push({ id: uid(), source: 'manual', name: f.name.trim(), org: f.org.trim(), type: f.type, balance: round2(asset ? +f.balance : -Math.abs(+f.balance)), hidden: false, balanceDate: Date.now() });
      takeSnapshot(); save(); render();
    });
}

function editBudget(catId) {
  const c = cat(catId), m = ui.budgetMonth;
  const recent = state.transactions.filter(t => t.category === catId && t.date.startsWith(m)).slice(0, 8);
  openModal(`
    <h2>${c.emoji} ${esc(c.name)}</h2>
    <div class="row">
      <label class="field"><span>Monthly budget</span><input class="input" name="amount" type="number" step="1" min="0" value="${budgetFor(catId, m)}" required></label>
      <label class="field"><span>Applies to</span><select class="input" name="scope"><option value="all">Every month</option><option value="month">${monthLabel(m)} only</option></select></label>
    </div>
    <div class="row">
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(c.name)}" required></label>
      <label class="field" style="flex:0 0 80px"><span>Emoji</span><input class="input" name="emoji" value="${esc(c.emoji)}" maxlength="4"></label>
    </div>
    <label class="field"><span>Group</span><input class="input" name="group" value="${esc(c.group)}" list="group-list"><datalist id="group-list">${GROUP_ORDER.map(g => `<option value="${g}">`).join('')}</datalist></label>
    ${recent.length ? `<div class="field"><span>${monthLabel(m)}</span><div class="txn-list">${recent.map(txnRow).join('')}</div></div>` : ''}
    <div class="modal-actions">
      <button class="btn danger" value="delete" formnovalidate>Delete category</button><span class="spacer"></span>
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Save</button>
    </div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      const amt = Math.max(0, +f.amount);
      if (f.scope === 'month') { (state.budgetOverrides[m] ||= {})[catId] = amt; }
      else { c.budget = amt; for (const k in state.budgetOverrides) delete state.budgetOverrides[k][catId]; }
      c.name = f.name.trim(); c.emoji = f.emoji.trim() || c.emoji; c.group = f.group.trim() || 'Other';
      save(); render();
    }, form => {
      form.addEventListener('click', e => { const r = e.target.closest('.txn'); if (r) { e.preventDefault(); $('#modal').close(); editTxn(r.dataset.id); } });
    },
    v => {
      if (v === 'delete') {
        if (!confirmInline(`Delete “${c.name}”? Its transactions move to Uncategorized.`)) return false;
        state.categories = state.categories.filter(x => x.id !== catId);
        for (const t of state.transactions) if (t.category === catId) t.category = 'uncategorized';
        for (const k in state.rules) if (state.rules[k] === catId) delete state.rules[k];
        save(); render();
      }
    });
}
function addCategory() {
  openModal(`
    <h2>New budget category</h2>
    <div class="row">
      <label class="field"><span>Name</span><input class="input" name="name" required placeholder="e.g. Pets"></label>
      <label class="field" style="flex:0 0 80px"><span>Emoji</span><input class="input" name="emoji" value="🏷️" maxlength="4"></label>
    </div>
    <div class="row">
      <label class="field"><span>Monthly budget</span><input class="input" name="amount" type="number" min="0" step="1" required></label>
      <label class="field"><span>Group</span><input class="input" name="group" value="Lifestyle" list="group-list2"><datalist id="group-list2">${GROUP_ORDER.map(g => `<option value="${g}">`).join('')}</datalist></label>
    </div>
    <div class="modal-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Add</button></div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      state.categories.push({ id: 'c-' + uid(), name: f.name.trim(), emoji: f.emoji.trim() || '🏷️', group: f.group.trim() || 'Other', budget: Math.max(0, +f.amount) });
      save(); render();
    });
}

function editGoal(id) {
  const g = id ? state.goals.find(x => x.id === id) : null;
  openModal(`
    <h2>${g ? 'Edit goal' : 'New goal'}</h2>
    <div class="row">
      <label class="field" style="flex:0 0 80px"><span>Emoji</span><input class="input" name="emoji" value="${esc(g?.emoji || '🎯')}" maxlength="4"></label>
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(g?.name || '')}" required placeholder="e.g. Emergency fund"></label>
    </div>
    <div class="row">
      <label class="field"><span>Target amount</span><input class="input" name="target" type="number" step="1" min="1" value="${g?.target ?? ''}" required></label>
      <label class="field"><span>Target date (optional)</span><input class="input" name="due" type="date" value="${g?.due || ''}"></label>
    </div>
    <label class="field"><span>Already saved before tracking</span><input class="input" name="start" type="number" step="0.01" value="${g?.start ?? 0}"></label>
    ${g && g.contributions.length ? `<div class="field"><span>Contributions</span><div class="txn-list">${[...g.contributions].reverse().map(c => `<div class="txn" style="cursor:default"><div class="txn-ico">${c.amount >= 0 ? '➕' : '➖'}</div><div><div class="txn-desc">${dayLabel(c.date)}</div>${c.note ? `<div class="txn-meta">${esc(c.note)}</div>` : ''}</div><div class="txn-amt num ${c.amount >= 0 ? 'pos' : 'neg'}">${money(c.amount, { sign: true })} <button class="link-btn" value="rm:${c.id}" formnovalidate title="Remove">✕</button></div></div>`).join('')}</div></div>` : ''}
    <div class="modal-actions">
      ${g ? '<button class="btn danger" value="delete" formnovalidate>Delete goal</button><span class="spacer"></span>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">${g ? 'Save' : 'Create'}</button>
    </div>`,
    form => {
      const f = Object.fromEntries(new FormData(form));
      const data = { emoji: f.emoji.trim() || '🎯', name: f.name.trim(), target: +f.target, due: f.due || null, start: +f.start || 0 };
      if (g) Object.assign(g, data); else state.goals.push({ id: uid(), contributions: [], ...data });
      save(); render();
    }, null,
    v => {
      if (v === 'delete') {
        if (!confirmInline(`Delete “${g.name}”?`)) return false;
        state.goals = state.goals.filter(x => x.id !== id); save(); render();
      } else if (v.startsWith('rm:')) {
        g.contributions = g.contributions.filter(c => c.id !== v.slice(3)); save(); render();
        setTimeout(() => editGoal(id), 0);
      }
    });
}
function contribute(id) {
  const g = state.goals.find(x => x.id === id);
  const remaining = Math.max(0, g.target - goalSaved(g));
  openModal(`
    <h2>${esc(g.emoji)} ${esc(g.name)}</h2>
    <p class="faint num">${money(goalSaved(g), { cents: false })} saved · ${money(remaining, { cents: false })} to go</p>
    <div class="row">
      <label class="field"><span>Amount</span><input class="input" name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal"></label>
      <label class="field"><span>Date</span><input class="input" name="date" type="date" value="${isoDate(new Date())}" required></label>
    </div>
    <div class="btn-row" style="margin-bottom:12px">${[25, 50, 100, 250, 500].map(v => `<button type="button" class="btn small" data-quick="${v}">$${v}</button>`).join('')}</div>
    <label class="field"><span>Note</span><input class="input" name="note" placeholder="Optional — e.g. moved from LOC savings"></label>
    <div class="modal-actions">
      <button class="btn" value="withdraw">Withdraw</button><span class="spacer"></span>
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Add</button>
    </div>`,
    form => add(form, 1),
    form => form.addEventListener('click', e => { const q = e.target.closest('[data-quick]'); if (q) form.amount.value = q.dataset.quick; }),
    (v, form) => { if (v === 'withdraw') { if (!form.reportValidity()) return false; add(form, -1); } });
  function add(form, sign) {
    const f = Object.fromEntries(new FormData(form));
    const before = goalSaved(g);
    g.contributions.push({ id: uid(), date: f.date, amount: round2(sign * Math.abs(+f.amount)), note: f.note.trim() });
    save(); render();
    if (before < g.target && goalSaved(g) >= g.target) toast(`🎉 ${g.name} reached!`);
    else toast(sign > 0 ? `Added ${money(+f.amount)} to ${g.name}` : `Withdrew ${money(+f.amount)}`);
  }
}

/* =========================================================================
   Events
   ========================================================================= */
document.addEventListener('click', async e => {
  const tabBtn = e.target.closest('.tabbar button');
  if (tabBtn) {
    if (!state) return;
    ui.tab = tabBtn.dataset.tab; ui.settingsOpen = false; render(); window.scrollTo(0, 0); return;
  }
  const r = e.target.closest('[data-range]');
  if (r) { ui.range = r.dataset.range; render(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('dialog')) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'start-demo':
      if (state && !state.demo && state.accounts.length && !confirmInline('Replace your data with sample data? Download a backup first if you want to keep it.')) return;
      ui.settingsOpen = false; ui.tab = 'overview'; loadDemo(); break;
    case 'start-connect':
      state = freshState(); save(); ui.settingsOpen = true; render(); break;
    case 'open-settings': ui.settingsOpen = true; render(); window.scrollTo(0, 0); break;
    case 'close-settings': ui.settingsOpen = false; render(); break;
    case 'goto': ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'sync': syncNow(); break;
    case 'sf-connect': {
      const token = $('#sf-token').value.trim();
      if (!token) return toast('Paste your setup token first');
      el.disabled = true; el.textContent = 'Connecting…';
      try {
        const proxyEl = $('#sf-proxy'); if (proxyEl) state.settings.proxy = proxyEl.value.trim();
        state.settings.sfAccess = await sfClaim(token);
        state.settings.lastSync = null;
        save();
        await syncNow();
        ui.settingsOpen = false; ui.tab = 'overview'; render();
      } catch (err) {
        toast(err.message); el.disabled = false; el.textContent = 'Connect';
        state.settings.lastSyncError = err.message; save();
      }
      break;
    }
    case 'sf-add-more':
      toast('Add the bank in SimpleFIN Bridge — it shows up here on the next sync');
      window.open('https://bridge.simplefin.org', '_blank', 'noopener'); break;
    case 'sf-disconnect':
      if (!confirmInline('Disconnect SimpleFIN? Your existing accounts and transactions stay here. You can also revoke Tally’s access in SimpleFIN Bridge.')) return;
      state.settings.sfAccess = null; state.settings.lastSync = null; state.settings.lastSyncError = null; save(); render(); break;
    case 'save-sync-settings':
      state.settings.proxy = $('#sf-proxy').value.trim();
      state.settings.autoSyncHours = +$('#sf-interval').value;
      save(); toast('Saved'); render(); break;
    case 'edit-account': editAccount(id); break;
    case 'add-manual': addManualAccount(); break;
    case 'edit-txn': editTxn(id); break;
    case 'add-txn': addTxn(); break;
    case 'txn-filter': ui.txnFilter = el.dataset.f; ui.txnLimit = 150; render(); break;
    case 'more-txns': ui.txnLimit += 300; render(); break;
    case 'month': ui.budgetMonth = addMonths(ui.budgetMonth, +el.dataset.d); render(); break;
    case 'edit-budget': editBudget(id); break;
    case 'add-category': addCategory(); break;
    case 'show-uncat': ui.tab = 'transactions'; ui.txnFilter = 'uncategorized'; render(); window.scrollTo(0, 0); break;
    case 'add-goal': editGoal(null); break;
    case 'edit-goal': editGoal(id); break;
    case 'contribute': contribute(id); break;
    case 'export': exportBackup(); break;
    case 'wipe':
      if (!confirmInline('Erase all accounts, transactions, budgets and goals from this device? This can’t be undone.')) return;
      localStorage.removeItem(STORE_KEY); state = null; ui.settingsOpen = false; render(); break;
  }
});
document.addEventListener('input', e => {
  const k = e.target.dataset.input;
  if (k === 'txn-search') {
    ui.txnSearch = e.target.value; ui.txnLimit = 150;
    const pos = e.target.selectionStart;
    render();
    const inp = $('[data-input="txn-search"]'); inp.focus(); inp.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.input === 'txn-account') { ui.txnAccount = e.target.value; ui.txnLimit = 150; render(); }
  if (e.target.id === 'csv-file' && e.target.files[0]) { openCSVImport(e.target.files[0]); e.target.value = ''; }
  if (e.target.id === 'restore-file' && e.target.files[0]) { restoreBackup(e.target.files[0]); e.target.value = ''; }
});
$('#btn-sync').addEventListener('click', () => { if (state) syncNow(); });
$('#btn-settings').addEventListener('click', () => { if (!state) state = freshState(), save(); ui.settingsOpen = !ui.settingsOpen; render(); window.scrollTo(0, 0); });
$('#btn-privacy').addEventListener('click', () => {
  if (!state) return;
  state.settings.privacy = !state.settings.privacy; save(); render();
  toast(state.settings.privacy ? 'Amounts hidden' : 'Amounts shown');
});

function exportBackup() {
  const copy = JSON.parse(JSON.stringify(state));
  const keep = confirmInline('Include your SimpleFIN connection in the backup?\n\nOK = include (anyone with the file could read your transactions)\nCancel = leave it out (you’d reconnect after restoring)');
  if (!keep) copy.settings.sfAccess = null;
  const blob = new Blob([JSON.stringify(copy, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tally-backup-${isoDate(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function restoreBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.accounts || !data.transactions) throw new Error();
      if (!confirmInline('Replace everything on this device with this backup?')) return;
      const base = freshState();
      state = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
      save(); ui.settingsOpen = false; render(); toast('Backup restored');
    } catch { toast('That isn’t a Tally backup file'); }
  };
  reader.readAsText(file);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2600, msg.length * 55));
}

/* =========================================================================
   Boot
   ========================================================================= */
if (state) { takeSnapshot(); save(); }
render();
maybeAutoSync();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state) { maybeAutoSync(); render(); } });
setInterval(() => state && maybeAutoSync(), 5 * 60000);
window.addEventListener('online', () => state && maybeAutoSync());

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const showUpdate = w => {
      $('#update-banner').hidden = false;
      $('#btn-update').onclick = () => w.postMessage('skip-waiting');
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
    });
    setInterval(() => reg.update(), 60 * 60000);
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
