/* Money Tracker — in-memory state mirrored to IndexedDB. Memory is only updated after a write commits. */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const D = MT.db;

  const S = (MT.store = { tx: [], cats: [], rec: [], meta: {}, ready: false, listeners: [] });

  const DEFAULT_CATS = [
    ['bills', 'Bills & Utilities', 'expense', 'bills', 'blue'],
    ['fun', 'Entertainment', 'expense', 'fun', 'indigo'],
    ['family', 'Family', 'expense', 'family', 'teal'],
    ['fees', 'Fees & Charges', 'expense', 'fees', 'amber'],
    ['food', 'Food & Beverage', 'expense', 'food', 'orange'],
    ['friends', 'Friends & Lover', 'expense', 'heart', 'red'],
    ['gifts', 'Gifts & Donations', 'expense', 'gift', 'pink'],
    ['health', 'Health & Fitness', 'expense', 'health', 'green'],
    ['home', 'Home', 'expense', 'house', 'slate'],
    ['insure', 'Insurances', 'expense', 'insure', 'sky'],
    ['invest', 'Investment', 'expense', 'invest', 'green'],
    ['music', 'Music', 'expense', 'music', 'purple'],
    ['other', 'Other Expense', 'expense', 'box', 'slate', true],
    ['tout', 'Outgoing transfer', 'expense', 'out', 'slate', true],
    ['pet', 'Pet', 'expense', 'pet', 'amber'],
    ['shopping', 'Shopping', 'expense', 'bag', 'pink'],
    ['transport', 'Transportation', 'expense', 'bus', 'amber'],
    ['travel', 'Travel', 'expense', 'plane', 'sky'],
    ['award', 'Award', 'income', 'award', 'amber'],
    ['interest', 'Collect Interest', 'income', 'percent', 'orange'],
    ['igifts', 'Gifts', 'income', 'gift', 'pink'],
    ['tin', 'Incoming transfer', 'income', 'in', 'slate', true],
    ['iother', 'Other Income', 'income', 'box', 'slate', true],
    ['refund', 'Refund', 'income', 'refund', 'green'],
    ['salary', 'Salary', 'income', 'salary', 'green'],
    ['selling', 'Selling', 'income', 'tag', 'sky']
  ].map((c) => ({ id: c[0], name: c[1], type: c[2], icon: c[3], color: c[4], builtIn: !!c[5] }));

  const ADJUST = { id: 'adjust', name: 'Balance adjustment', type: 'system', icon: 'sliders', color: 'slate', builtIn: true, system: true };

  const DEFAULT_SETTINGS = { theme: 'system', hideOnOpen: false, weekStart: 1 };
  const DEFAULT_META = {
    onboarded: false,
    lastFileBackup: null,
    lastSnapshot: null,
    dismissed: [],
    recentSearches: []
  };

  S.onChange = (fn) => S.listeners.push(fn);
  S.emit = () => S.listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });

  S.sortTx = () =>
    S.tx.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));

  S.load = async () => {
    await D.init();
    const res = await Promise.all(['tx', 'categories', 'recurring', 'meta'].map((s) => D.all(s)));
    S.tx = res[0];
    S.cats = res[1];
    S.rec = res[2];
    S.meta = {};
    res[3].forEach((m) => (S.meta[m.key] = m.value));
    const ops = [];
    if (!S.cats.length) {
      S.cats = DEFAULT_CATS.map((c) => Object.assign({}, c));
      S.cats.forEach((c) => ops.push({ store: 'categories', put: c }));
    }
    if (!S.cats.find((c) => c.id === 'adjust')) {
      S.cats.push(Object.assign({}, ADJUST));
      ops.push({ store: 'categories', put: ADJUST });
    }
    Object.keys(DEFAULT_META).forEach((k) => {
      if (!(k in S.meta)) S.meta[k] = JSON.parse(JSON.stringify(DEFAULT_META[k]));
    });
    S.meta.settings = Object.assign({}, DEFAULT_SETTINGS, S.meta.settings || {});
    await D.write(ops);
    S.sortTx();
    S.ready = true;
  };

  S.setMeta = async (key, value) => {
    await D.write([{ store: 'meta', put: { key: key, value: value } }]);
    S.meta[key] = value;
  };
  S.settings = () => S.meta.settings;
  S.setSetting = async (k, v) => {
    const next = Object.assign({}, S.meta.settings, { [k]: v });
    await S.setMeta('settings', next);
    if (k === 'theme') {
      try {
        localStorage.setItem('mt-theme', JSON.stringify(v));
      } catch (e) {}
    }
  };

  /* ---------- Categories ---------- */
  S.cat = (id) => S.cats.find((c) => c.id === id) || { id: id, name: 'Unknown', icon: 'box', color: 'slate', type: 'expense' };
  S.catsOf = (type) =>
    S.cats.filter((c) => c.type === type && !c.system).sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }));
  S.fallbackFor = (type) => (type === 'income' ? 'iother' : 'other');

  /* categories ordered by how often they've been used in the last 6 months */
  S.catsByUse = (type) => {
    const since = U.addDays(U.today(), -183);
    const n = {};
    S.tx.forEach((t) => {
      if (t.date >= since) n[t.categoryId] = (n[t.categoryId] || 0) + 1;
    });
    return S.catsOf(type).sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0));
  };

  S.saveCategory = async (c) => {
    const name = String(c.name || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Give the category a name.');
    if (name.length > 40) throw new Error('Keep the name under 40 characters.');
    const clash = S.cats.find((x) => x.type === c.type && x.id !== c.id && x.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new Error('You already have a category called ' + clash.name + '.');
    const existing = c.id ? S.cats.find((x) => x.id === c.id) : null;
    const out = Object.assign({}, existing || {}, {
      id: c.id || U.uid('cat'),
      name: name,
      type: c.type,
      icon: c.icon || 'box',
      color: c.color || 'slate',
      builtIn: existing ? !!existing.builtIn : false
    });
    await D.write([{ store: 'categories', put: out }]);
    const i = S.cats.findIndex((x) => x.id === out.id);
    if (i >= 0) S.cats[i] = out;
    else S.cats.push(out);
    S.emit();
    return out;
  };

  /* Removing a category never deletes transactions: they move to Other Expense / Other Income */
  S.removeCategory = async (id) => {
    const c = S.cats.find((x) => x.id === id);
    if (!c || c.builtIn) throw new Error('Built-in categories can’t be removed.');
    const fb = S.fallbackFor(c.type);
    const txs = S.tx.filter((t) => t.categoryId === id);
    const recs = S.rec.filter((r) => r.categoryId === id);
    const ops = [];
    txs.forEach((t) => ops.push({ store: 'tx', put: Object.assign({}, t, { categoryId: fb, updatedAt: Date.now() }) }));
    recs.forEach((r) => ops.push({ store: 'recurring', put: Object.assign({}, r, { categoryId: fb }) }));
    ops.push({ store: 'categories', del: id });
    await D.write(ops);
    txs.forEach((t) => (t.categoryId = fb));
    recs.forEach((r) => (r.categoryId = fb));
    S.cats = S.cats.filter((x) => x.id !== id);
    S.emit();
    return { cat: c, txIds: txs.map((t) => t.id), recIds: recs.map((r) => r.id), fallback: fb };
  };
  S.undoRemoveCategory = async (info) => {
    const ops = [{ store: 'categories', put: info.cat }];
    const txs = S.tx.filter((t) => info.txIds.indexOf(t.id) >= 0);
    const recs = S.rec.filter((r) => info.recIds.indexOf(r.id) >= 0);
    txs.forEach((t) => ops.push({ store: 'tx', put: Object.assign({}, t, { categoryId: info.cat.id }) }));
    recs.forEach((r) => ops.push({ store: 'recurring', put: Object.assign({}, r, { categoryId: info.cat.id }) }));
    await D.write(ops);
    txs.forEach((t) => (t.categoryId = info.cat.id));
    recs.forEach((r) => (r.categoryId = info.cat.id));
    S.cats.push(info.cat);
    S.emit();
  };

  /* ---------- Transactions ---------- */
  function cleanTx(t) {
    const amount = Math.round(Number(t.amount));
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter an amount above £0.00.');
    if (amount > 100000000000) throw new Error('That amount looks too large.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) throw new Error('Pick a valid date.');
    if (t.type !== 'expense' && t.type !== 'income') throw new Error('Choose expense or income.');
    if (!S.cats.find((c) => c.id === t.categoryId)) throw new Error('Pick a category.');
    const prev = t.id ? S.tx.find((x) => x.id === t.id) : null;
    return {
      id: t.id || U.uid('tx'),
      type: t.type,
      amount: amount,
      categoryId: t.categoryId,
      name: String(t.name || '').trim().slice(0, 80),
      note: String(t.note || '').trim().slice(0, 500),
      date: t.date,
      recurringId: t.recurringId || (prev && prev.recurringId) || null,
      example: prev ? !!prev.example : !!t.example,
      excluded: prev ? !!prev.excluded : !!t.excluded,
      source: (prev && prev.source) || t.source || null,
      createdAt: (prev && prev.createdAt) || t.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  /* ---------- Example data (clearly flagged, removable in one tap) ---------- */
  S.hasExamples = () => S.tx.some((t) => t.example) || S.rec.some((r) => r.example);
  S.addExamples = async (txs, recs) => {
    const ops = [];
    txs.forEach((t) => ops.push({ store: 'tx', put: t }));
    recs.forEach((r) => ops.push({ store: 'recurring', put: r }));
    await D.write(ops);
    txs.forEach((t) => S.tx.push(t));
    recs.forEach((r) => S.rec.push(r));
    S.sortTx();
    S.emit();
  };
  S.addBatch = async (cats, txs) => {
    const ops = cats.map((c) => ({ store: 'categories', put: c })).concat(txs.map((t) => ({ store: 'tx', put: t })));
    await D.write(ops);
    cats.forEach((c) => S.cats.push(c));
    txs.forEach((t) => S.tx.push(t));
    S.sortTx();
    S.emit();
  };
  S.clearExamples = async () => {
    const txs = S.tx.filter((t) => t.example);
    const recs = S.rec.filter((r) => r.example);
    await D.write(txs.map((t) => ({ store: 'tx', del: t.id })).concat(recs.map((r) => ({ store: 'recurring', del: r.id }))));
    S.tx = S.tx.filter((t) => !t.example);
    S.rec = S.rec.filter((r) => !r.example);
    S.emit();
    return txs.length;
  };
  S.saveTx = async (t) => {
    const c = cleanTx(t);
    await D.write([{ store: 'tx', put: c }]);
    const i = S.tx.findIndex((x) => x.id === c.id);
    if (i >= 0) S.tx[i] = c;
    else S.tx.push(c);
    S.sortTx();
    S.emit();
    return c;
  };
  S.deleteTx = async (id) => {
    const t = S.tx.find((x) => x.id === id);
    if (!t) return null;
    await D.write([{ store: 'tx', del: id }]);
    S.tx = S.tx.filter((x) => x.id !== id);
    S.emit();
    return t;
  };
  S.restoreTx = async (t) => {
    await D.write([{ store: 'tx', put: t }]);
    if (!S.tx.find((x) => x.id === t.id)) S.tx.push(t);
    S.sortTx();
    S.emit();
  };

  S.signed = (t) => (t.type === 'income' ? t.amount : -t.amount);
  S.balance = () => S.tx.reduce((a, t) => a + S.signed(t), 0);
  S.isStat = (t) => t.categoryId !== 'adjust' && !t.excluded;
  S.range = (from, to) => S.tx.filter((t) => t.date >= from && t.date <= to);
  S.totals = (from, to) => {
    let inn = 0;
    let out = 0;
    S.range(from, to).forEach((t) => {
      if (!S.isStat(t)) return;
      if (t.type === 'income') inn += t.amount;
      else out += t.amount;
    });
    return { in: inn, out: out, net: inn - out };
  };
  S.byCategory = (from, to, type) => {
    const m = {};
    S.range(from, to).forEach((t) => {
      if (!S.isStat(t) || t.type !== (type || 'expense')) return;
      const r = m[t.categoryId] || (m[t.categoryId] = { cat: S.cat(t.categoryId), total: 0, count: 0 });
      r.total += t.amount;
      r.count += 1;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  };
  S.dailySpend = (from, to) => {
    const m = {};
    S.range(from, to).forEach((t) => {
      if (S.isStat(t) && t.type === 'expense') m[t.date] = (m[t.date] || 0) + t.amount;
    });
    return m;
  };
  /* cumulative spend per day of a month: array index 0 = day 1 */
  S.monthCumulative = (monthIso) => {
    const start = U.monthStart(monthIso);
    const end = U.monthEnd(monthIso);
    const days = Number(end.slice(8));
    const daily = S.dailySpend(start, end);
    const out = [];
    let run = 0;
    for (let d = 1; d <= days; d++) {
      run += daily[start.slice(0, 8) + String(d).padStart(2, '0')] || 0;
      out.push(run);
    }
    return out;
  };
  S.firstDate = () => (S.tx.length ? S.tx[S.tx.length - 1].date : null);

  /* ---------- Recurring ---------- */
  S.nextOcc = (r, iso) => {
    const n = Math.max(1, Math.min(99, Math.round(r.interval || 1)));
    if (r.freq === 'daily') return U.addDays(iso, n);
    if (r.freq === 'weekly') return U.addDays(iso, 7 * n);
    if (r.freq === 'yearly') return U.addMonths(iso, 12 * n, r.anchor);
    return U.addMonths(iso, n, r.anchor);
  };
  S.recEnded = (r) => !!(r.endDate && r.nextDate > r.endDate);
  S.saveRecurring = async (r) => {
    const amount = Math.round(Number(r.amount));
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter an amount above £0.00.');
    if (!String(r.name || '').trim()) throw new Error('Give it a name, like “Netflix”.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.nextDate || '')) throw new Error('Pick the next due date.');
    if (!S.cats.find((c) => c.id === r.categoryId)) throw new Error('Pick a category.');
    const interval = Math.round(Number(r.interval || 1));
    if (!(interval >= 1 && interval <= 99)) throw new Error('Repeat every 1 to 99.');
    const endDate = r.endDate && /^\d{4}-\d{2}-\d{2}$/.test(r.endDate) ? r.endDate : null;
    if (endDate && endDate < r.nextDate) throw new Error('The end date is before the next payment.');
    const prev = r.id ? S.rec.find((x) => x.id === r.id) : null;
    const out = {
      id: r.id || U.uid('rec'),
      type: r.type === 'income' ? 'income' : 'expense',
      amount: amount,
      categoryId: r.categoryId,
      name: String(r.name).trim().slice(0, 80),
      note: String(r.note || '').trim().slice(0, 500),
      freq: ['daily', 'weekly', 'monthly', 'yearly'].indexOf(r.freq) >= 0 ? r.freq : 'monthly',
      interval: interval,
      endDate: endDate,
      anchor: r.anchor && r.anchor >= 1 && r.anchor <= 31 ? r.anchor : Number(r.nextDate.slice(8)),
      nextDate: r.nextDate,
      paused: !!r.paused,
      example: prev ? !!prev.example : false,
      createdAt: (prev && prev.createdAt) || Date.now()
    };
    await D.write([{ store: 'recurring', put: out }]);
    const i = S.rec.findIndex((x) => x.id === out.id);
    if (i >= 0) S.rec[i] = out;
    else S.rec.push(out);
    await S.runRecurring();
    S.emit();
    return out;
  };
  S.deleteRecurring = async (id) => {
    const r = S.rec.find((x) => x.id === id);
    await D.write([{ store: 'recurring', del: id }]);
    S.rec = S.rec.filter((x) => x.id !== id);
    S.emit();
    return r;
  };
  S.restoreRecurring = async (r) => {
    await D.write([{ store: 'recurring', put: r }]);
    S.rec.push(r);
    S.emit();
  };
  /* Log every due occurrence up to today. Ids are deterministic, so this can never double-log. */
  S.runRecurring = async () => {
    const today = U.today();
    const ops = [];
    const added = [];
    const updated = [];
    S.rec.forEach((r) => {
      if (r.paused) return;
      let n = r.nextDate;
      let guard = 0;
      while (n <= today && (!r.endDate || n <= r.endDate) && guard < 2000) {
        const id = 'r_' + r.id + '_' + n;
        if (!S.tx.find((t) => t.id === id)) {
          const cat = S.cats.find((c) => c.id === r.categoryId) ? r.categoryId : S.fallbackFor(r.type);
          const t = { id: id, type: r.type, amount: r.amount, categoryId: cat, name: r.name, note: r.note || '', date: n, recurringId: r.id, example: !!r.example, createdAt: Date.now(), updatedAt: Date.now() };
          ops.push({ store: 'tx', put: t });
          added.push(t);
        }
        n = S.nextOcc(r, n);
        guard++;
      }
      if (n !== r.nextDate) {
        const nr = Object.assign({}, r, { nextDate: n });
        ops.push({ store: 'recurring', put: nr });
        updated.push(nr);
      }
    });
    if (!ops.length) return 0;
    await D.write(ops);
    added.forEach((t) => S.tx.push(t));
    updated.forEach((nr) => {
      const i = S.rec.findIndex((x) => x.id === nr.id);
      if (i >= 0) S.rec[i] = nr;
    });
    S.sortTx();
    S.emit();
    return added.length;
  };
  S.upcoming = (days) => {
    const end = U.addDays(U.today(), days);
    const out = [];
    S.rec.forEach((r) => {
      if (r.paused) return;
      let n = r.nextDate;
      let g = 0;
      while (n <= end && (!r.endDate || n <= r.endDate) && g < 60) {
        out.push({ rule: r, date: n });
        n = S.nextOcc(r, n);
        g++;
      }
    });
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  };
  S.monthlyEquivalent = (r) => {
    const n = Math.max(1, r.interval || 1);
    const perMonth = r.freq === 'daily' ? 365.25 / 12 / n : r.freq === 'weekly' ? 52 / 12 / n : r.freq === 'yearly' ? 1 / (12 * n) : 1 / n;
    return Math.round(r.amount * perMonth);
  };
  /* Add several recurring rules in one go (from suggestions) */
  S.addRecurringBatch = async (rules) => {
    const out = rules.map((r) => ({
      id: U.uid('rec'), type: r.type, amount: r.amount, categoryId: r.categoryId, name: String(r.name).trim().slice(0, 80), note: '',
      freq: 'monthly', interval: 1, endDate: null, anchor: r.anchor, nextDate: r.nextDate, paused: false, example: false, createdAt: Date.now()
    }));
    await D.write(out.map((r) => ({ store: 'recurring', put: r })));
    out.forEach((r) => S.rec.push(r));
    await S.runRecurring();
    S.emit();
    return out;
  };

  /* ---------- Backup, restore, snapshots ---------- */
  S.exportData = () => ({
    app: 'money-tracker',
    format: 1,
    exportedAt: new Date().toISOString(),
    tx: S.tx,
    categories: S.cats,
    recurring: S.rec,
    settings: S.meta.settings
  });

  S.validateImport = (obj) => {
    if (!obj || obj.app !== 'money-tracker' || !Array.isArray(obj.tx) || !Array.isArray(obj.categories)) {
      return { ok: false, error: 'This isn’t a Money Tracker backup file.' };
    }
    const cats = obj.categories.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
    if (!cats.find((c) => c.id === 'adjust')) cats.push(Object.assign({}, ADJUST));
    DEFAULT_CATS.filter((c) => c.builtIn).forEach((c) => {
      if (!cats.find((x) => x.id === c.id)) cats.push(Object.assign({}, c));
    });
    const ids = new Set(cats.map((c) => c.id));
    let skipped = 0;
    const tx = [];
    obj.tx.forEach((t) => {
      const ok = t && typeof t.id === 'string' && Number.isSafeInteger(t.amount) && t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && (t.type === 'income' || t.type === 'expense');
      if (!ok) {
        skipped++;
        return;
      }
      tx.push(Object.assign({}, t, { categoryId: ids.has(t.categoryId) ? t.categoryId : S.fallbackFor(t.type) }));
    });
    const rec = (obj.recurring || []).filter((r) => r && typeof r.id === 'string' && Number.isSafeInteger(r.amount) && /^\d{4}-\d{2}-\d{2}$/.test(r.nextDate));
    const dates = tx.map((t) => t.date).sort();
    return {
      ok: true,
      data: { tx: tx, categories: cats, recurring: rec, settings: obj.settings || null },
      summary: {
        tx: tx.length,
        skipped: skipped,
        cats: cats.filter((c) => !c.system).length,
        rec: rec.length,
        from: dates[0] || null,
        to: dates[dates.length - 1] || null,
        balance: tx.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0),
        exportedAt: obj.exportedAt || null
      }
    };
  };

  S.snapshot = async (kind) => {
    const now = Date.now();
    const snap = { id: (kind === 'daily' ? 'd_' + U.today() : 'p_' + now), kind: kind, createdAt: now, count: S.tx.length, balance: S.balance(), data: S.exportData() };
    await D.write([{ store: 'snapshots', put: snap }]);
    return snap;
  };
  S.snapshotDaily = async () => {
    if (D.memory || !S.tx.length || S.meta.lastSnapshot === U.today()) return;
    await S.snapshot('daily');
    await S.setMeta('lastSnapshot', U.today());
    const all = await D.all('snapshots');
    const daily = all.filter((s) => s.kind === 'daily').sort((a, b) => b.createdAt - a.createdAt);
    const other = all.filter((s) => s.kind !== 'daily').sort((a, b) => b.createdAt - a.createdAt);
    const drop = daily.slice(30).concat(other.slice(10));
    if (drop.length) await D.write(drop.map((s) => ({ store: 'snapshots', del: s.id })));
  };
  S.listSnapshots = async () => (await D.all('snapshots')).sort((a, b) => b.createdAt - a.createdAt);

  S.replaceAll = async (data) => {
    if (S.tx.length) await S.snapshot('restore');
    const ops = [{ store: 'tx', clear: true }, { store: 'categories', clear: true }, { store: 'recurring', clear: true }];
    data.tx.forEach((t) => ops.push({ store: 'tx', put: t }));
    data.categories.forEach((c) => ops.push({ store: 'categories', put: c }));
    data.recurring.forEach((r) => ops.push({ store: 'recurring', put: r }));
    await D.write(ops);
    S.tx = data.tx.slice();
    S.cats = data.categories.slice();
    S.rec = data.recurring.slice();
    S.sortTx();
    if (data.settings) await S.setMeta('settings', Object.assign({}, DEFAULT_SETTINGS, data.settings));
    await S.runRecurring();
    S.emit();
  };

  S.toCSV = () => {
    const q = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [['Date', 'Type', 'Category', 'Name', 'Note', 'Amount (GBP)']];
    S.tx
      .slice()
      .reverse()
      .forEach((t) => rows.push([t.date, t.type, S.cat(t.categoryId).name, t.name, t.note, ((t.type === 'income' ? 1 : -1) * t.amount / 100).toFixed(2)]));
    return rows.map((r) => r.map(q).join(',')).join('\n');
  };
})();
