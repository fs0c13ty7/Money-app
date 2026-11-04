/* Money Tracker — tidying categories.
   1. "Tidy up": everything in Other Expense / Other Income grouped by name, so a whole group can be moved in one go.
   2. Category changes files: a list of new/renamed/removed categories and entries to move, checked against this
      phone's data and shown as a preview before anything changes. A restore point is saved first. */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const D = MT.db;
  const UI = MT.ui;
  const V = UI.views;
  const A = UI.actions;
  const esc = U.esc;
  const ic = U.icon;
  const T = (MT.tidy = {});

  const low = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();

  /* ---------- moving entries (shared by both) ---------- */
  /* moves: [{ tx, to }]. Recurring payments follow: a rule whose name matches entries that moved
     out of its category moves with them, so future entries land in the right place too. */
  T.recFollow = (moves) => {
    const votes = {};
    moves.forEach((m) => {
      const k = m.tx.categoryId + '|' + low(m.tx.name);
      (votes[k] = votes[k] || {})[m.to] = (votes[k][m.to] || 0) + 1;
    });
    const out = [];
    S.rec.forEach((r) => {
      const v = votes[r.categoryId + '|' + low(r.name)];
      if (!v) return;
      const to = Object.keys(v).sort((a, b) => v[b] - v[a])[0];
      if (to && to !== r.categoryId) out.push({ rec: r, to: to });
    });
    return out;
  };
  T.applyMoves = async (moves, extraOps, recMoves) => {
    const now = Date.now();
    const ops = (extraOps || []).slice();
    moves.forEach((m) => ops.push({ store: 'tx', put: Object.assign({}, m.tx, { categoryId: m.to, updatedAt: now }) }));
    (recMoves || []).forEach((m) => ops.push({ store: 'recurring', put: Object.assign({}, m.rec, { categoryId: m.to }) }));
    await D.write(ops);
    moves.forEach((m) => (m.tx.categoryId = m.to));
    (recMoves || []).forEach((m) => (m.rec.categoryId = m.to));
  };

  /* ================= TIDY UP ================= */
  UI.tidyState = { tab: 'expense' };
  T.groups = (type) => {
    const fb = S.fallbackFor(type);
    const g = {};
    S.tx.forEach((t) => {
      if (t.categoryId !== fb) return;
      const k = low(t.name);
      const x = (g[k] = g[k] || { key: k, name: (t.name || '').trim() || 'No name', n: 0, total: 0, first: t.date, last: t.date, ids: [] });
      x.n++;
      x.total += t.amount;
      if (t.date < x.first) x.first = t.date;
      if (t.date > x.last) x.last = t.date;
      x.ids.push(t.id);
    });
    return Object.keys(g)
      .map((k) => g[k])
      .sort((a, b) => b.n - a.n || b.total - a.total);
  };
  V.tidy = {
    render() {
      const st = UI.tidyState;
      const fb = S.cat(S.fallbackFor(st.tab));
      const groups = T.groups(st.tab);
      const total = groups.reduce((a, g) => a + g.n, 0);
      let h = UI.subHeader('Tidy up') + `<div class="stack">`;
      h += UI.seg('Type', [{ id: 'expense', label: 'Expenses · ' + T.groups('expense').reduce((a, g) => a + g.n, 0) }, { id: 'income', label: 'Income · ' + T.groups('income').reduce((a, g) => a + g.n, 0) }], st.tab, 'tidy-tab');
      if (!groups.length) {
        h += UI.empty('check', 'Nothing left in ' + fb.name, 'Everything has a proper category. New entries that land in ' + fb.name + ' will show up here.');
        return h + `</div>`;
      }
      h += `<p class="muted sm tidy-intro">${total} entr${total === 1 ? 'y is' : 'ies are'} in <b>${esc(fb.name)}</b>, grouped by name. Tap a group to move all of it to a proper category.</p>`;
      h += `<section class="card list-card">`;
      h += groups
        .map((g) => {
          const span = g.first.slice(0, 4) === g.last.slice(0, 4) ? g.first.slice(0, 4) : g.first.slice(0, 4) + '–' + g.last.slice(0, 4);
          return `<button class="tx-row press" data-act="tidy-pick" data-key="${esc(g.key)}"><span class="tile c-slate tidy-n">${g.n > 99 ? '99+' : g.n}</span><span class="tx-main"><span class="tx-title">${esc(g.name)}</span><span class="tx-sub">${g.n} entr${g.n === 1 ? 'y' : 'ies'} · ${span}</span></span><span class="amt${st.tab === 'income' ? ' in' : ''}">${st.tab === 'income' ? '+' : '−'}${U.fmt(g.total)}</span></button>`;
        })
        .join('');
      h += `</section>`;
      return h + `</div>`;
    }
  };
  A['tidy-tab'] = (el) => {
    UI.tidyState.tab = el.getAttribute('data-val');
    UI.refresh();
  };
  A['tidy-open'] = () => UI.go('tidy');

  /* pick where a group goes */
  let pick = null;
  A['tidy-pick'] = (el) => {
    const type = UI.tidyState.tab;
    const g = T.groups(type).find((x) => x.key === el.getAttribute('data-key'));
    if (!g) return;
    const fb = S.fallbackFor(type);
    const render = () => {
      const cats = S.catsByUse(type).filter((c) => c.id !== fb);
      return `<div class="form"><div><h2 class="sheet-title">Move “${esc(g.name)}”</h2><p class="sheet-text">${g.n} entr${g.n === 1 ? 'y' : 'ies'}, ${U.fmt(g.total)} in total. Pick the category ${g.n === 1 ? 'it belongs' : 'they belong'} in.</p></div><section class="card list-card tidy-cats">${cats
        .map((c) => `<button class="tx-row press" data-act="tidy-to" data-id="${esc(c.id)}">${UI.tile(c)}<span class="tx-main"><span class="tx-title">${esc(c.name)}</span></span></button>`)
        .join('')}</section><button type="button" class="btn btn-dashed press" data-act="tidy-new">${ic('plus', 18, 2.2)} New ${type} category</button></div>`;
    };
    pick = { g: g, type: type };
    pick.entry = UI.openSheet({ label: 'Move ' + g.name, cls: 'tall', render: render, onClose: () => (pick = null) });
  };
  A['tidy-new'] = () => {
    if (pick) MT.sheets.categoryForm(null, pick.type);
  };
  /* a category made from here shows up in the list straight away */
  S.onChange(() => {
    if (pick && pick.entry && document.body.contains(pick.entry.el)) UI.rerenderSheet(pick.entry);
  });
  A['tidy-to'] = async (el) => {
    if (!pick) return;
    const p = pick;
    const to = el.getAttribute('data-id');
    const ids = new Set(p.g.ids);
    const moves = S.tx.filter((t) => ids.has(t.id)).map((t) => ({ tx: t, to: to, from: t.categoryId }));
    const recMoves = T.recFollow(moves);
    const undo = moves.map((m) => ({ id: m.tx.id, from: m.from }));
    const recUndo = recMoves.map((m) => ({ id: m.rec.id, from: m.rec.categoryId }));
    try {
      await T.applyMoves(moves, [], recMoves);
      S.emit();
      await UI.closeSheet();
      UI.refresh();
      UI.toast('Moved ' + moves.length + ' to ' + S.cat(to).name, {
        action: 'Undo',
        onAction: async () => {
          const back = undo.map((u) => ({ tx: S.tx.find((t) => t.id === u.id), to: u.from })).filter((m) => m.tx);
          const recBack = recUndo.map((u) => ({ rec: S.rec.find((r) => r.id === u.id), to: u.from })).filter((m) => m.rec);
          await T.applyMoves(back, [], recBack);
          S.emit();
          UI.refresh();
        }
      });
    } catch (e) {
      UI.error(e);
    }
  };

  /* ================= CATEGORY CHANGES FILE ================= */
  /* { app: 'tally-changes', v: 1,
       rename: [{ type, from, to }], create: [{ type, name, icon, color }],
       moves: [{ d: date, t: type, n: name, a: pence, from: category name, to: category name, c: count }],
       remove: [{ type, name }] }
     Category names are matched ignoring case. Entries are matched on date, type, amount, name and current category. */
  T.isChanges = (obj) => !!obj && obj.app === 'tally-changes';
  T.plan = (obj) => {
    if (!T.isChanges(obj) || obj.v !== 1) throw new Error('That isn’t a category changes file this version of Tally understands.');
    const byName = (type, name) => {
      const n = low(name);
      return S.cats.find((c) => c.type === type && low(c.name) === n) || S.cats.find((c) => low(c.name) === n) || null;
    };
    const names = {}; /* "type|lower name" -> category id, after renames and new categories */
    const key = (type, name) => type + '|' + low(name);
    S.cats.forEach((c) => (names[key(c.type, c.name)] = c.id));
    const resolve = (type, name) => names[key(type, name)] || names[key('system', name)] || null;
    const plan = { renames: [], creates: [], moves: [], recMoves: [], removes: [], missing: 0, done: 0, skipped: [], counts: {} };
    (obj.rename || []).forEach((r) => {
      const c = byName(r.type, r.from);
      if (!c) return plan.skipped.push('“' + r.from + '” wasn’t found, so it wasn’t renamed');
      if (low(c.name) === low(r.to)) return;
      if (byName(r.type, r.to)) return plan.skipped.push('“' + r.to + '” already exists, so “' + c.name + '” kept its name');
      plan.renames.push({ cat: c, to: String(r.to).trim() });
      names[key(c.type, r.to)] = c.id;
    });
    (obj.create || []).forEach((n) => {
      if (resolve(n.type, n.name)) return;
      const c = { id: U.uid('cat'), name: String(n.name).trim().slice(0, 40), type: n.type === 'income' ? 'income' : 'expense', icon: U.ICONS[n.icon] ? n.icon : 'box', color: U.COLORS.indexOf(n.color) >= 0 ? n.color : 'slate', builtIn: false };
      plan.creates.push(c);
      names[key(c.type, c.name)] = c.id;
    });
    /* index this phone's entries */
    const idx = {};
    S.tx.forEach((t) => {
      const k = [t.date, t.type, t.amount, low(t.name), t.categoryId].join('|');
      (idx[k] = idx[k] || []).push(t);
    });
    const used = new Set();
    (obj.moves || []).forEach((m) => {
      const from = resolve(m.t, m.from);
      const to = resolve(m.t, m.to);
      const want = Math.max(1, Number(m.c) || 1);
      const base = [m.d, m.t, Math.round(Number(m.a)), low(m.n)].join('|');
      if (!from || !to) {
        /* the old category is gone (renamed or removed by an earlier run): count entries already in place */
        const done = to ? (idx[base + '|' + to] || []).filter((t) => !used.has(t.id)).slice(0, want) : [];
        done.forEach((t) => used.add(t.id));
        plan.done += done.length;
        plan.missing += want - done.length;
        return;
      }
      const list = (idx[base + '|' + from] || []).filter((t) => !used.has(t.id));
      const take = list.slice(0, want);
      take.forEach((t) => {
        used.add(t.id);
        if (to !== from) plan.moves.push({ tx: t, to: to, from: from });
      });
      let short = want - take.length;
      /* already where the file wants it (applied before, or moved by hand) */
      if (short > 0 && to !== from) {
        const done = (idx[base + '|' + to] || []).filter((t) => !used.has(t.id)).slice(0, short);
        done.forEach((t) => used.add(t.id));
        plan.done += done.length;
        short -= done.length;
      }
      plan.missing += short;
    });
    plan.recMoves = T.recFollow(plan.moves);
    /* removals only when nothing would be left in them */
    (obj.remove || []).forEach((r) => {
      const c = byName(r.type, r.name);
      if (!c) return;
      if (c.builtIn) return plan.skipped.push(c.name + ' is built in, so it stays');
      const left = S.tx.filter((t) => t.categoryId === c.id && !used.has(t.id)).length;
      const recLeft = S.rec.filter((x) => x.categoryId === c.id && !plan.recMoves.some((m) => m.rec === x)).length;
      if (left || recLeft) return plan.skipped.push(c.name + ' still has ' + (left ? left + ' entr' + (left === 1 ? 'y' : 'ies') : recLeft + ' recurring payment' + (recLeft === 1 ? '' : 's')) + ', so it stays');
      plan.removes.push(c);
    });
    plan.moves.forEach((m) => {
      const k = m.from + '>' + m.to;
      plan.counts[k] = (plan.counts[k] || 0) + 1;
    });
    return plan;
  };
  const catName = (plan, id) => {
    const r = plan.renames.find((x) => x.cat.id === id);
    if (r) return r.to;
    const n = plan.creates.find((x) => x.id === id);
    return n ? n.name : S.cat(id).name;
  };
  T.apply = async (plan) => {
    if (S.tx.length) await S.snapshot('changes');
    const ops = [];
    plan.renames.forEach((r) => ops.push({ store: 'categories', put: Object.assign({}, r.cat, { name: r.to }) }));
    plan.creates.forEach((c) => ops.push({ store: 'categories', put: c }));
    plan.removes.forEach((c) => ops.push({ store: 'categories', del: c.id }));
    await T.applyMoves(plan.moves, ops, plan.recMoves);
    plan.renames.forEach((r) => (r.cat.name = r.to));
    plan.creates.forEach((c) => S.cats.push(c));
    const gone = new Set(plan.removes.map((c) => c.id));
    S.cats = S.cats.filter((c) => !gone.has(c.id));
    S.emit();
  };
  T.preview = (obj, fileName) => {
    let plan;
    try {
      plan = T.plan(obj);
    } catch (e) {
      return UI.error(e);
    }
    const nothing = !plan.renames.length && !plan.creates.length && !plan.moves.length && !plan.removes.length;
    const render = () => {
      let h = `<div class="form"><div><h2 class="sheet-title">Category changes</h2><p class="sheet-text">From ${esc(fileName || 'the file')}. Nothing changes until you tap Apply, and a restore point is saved first.</p></div>`;
      if (nothing) h += `<p class="muted">There’s nothing left to change. This file may already have been applied.</p>`;
      const sec = (title, items) => (items.length ? `<div class="chg-sec"><p class="lbl">${title}</p><ul class="chg-list">${items.join('')}</ul></div>` : '');
      h += sec('New categories', plan.creates.map((c) => `<li>${UI.tile(c, 'sm')}<span>${esc(c.name)}</span><span class="muted">${c.type === 'income' ? 'Income' : 'Expense'}</span></li>`));
      h += sec('Renamed', plan.renames.map((r) => `<li>${UI.tile(r.cat, 'sm')}<span>${esc(r.cat.name)} → <b>${esc(r.to)}</b></span></li>`));
      const groups = Object.keys(plan.counts)
        .map((k) => ({ from: k.split('>')[0], to: k.split('>')[1], n: plan.counts[k] }))
        .sort((a, b) => b.n - a.n);
      h += sec(
        'Entries moving · ' + plan.moves.length.toLocaleString('en-GB'),
        groups.map((g) => `<li><span>${esc(catName(plan, g.from))} → <b>${esc(catName(plan, g.to))}</b></span><span class="muted">${g.n.toLocaleString('en-GB')}</span></li>`)
      );
      if (plan.recMoves.length) h += sec('Recurring payments following them', plan.recMoves.map((m) => `<li><span>${esc(m.rec.name)} → <b>${esc(catName(plan, m.to))}</b></span></li>`));
      h += sec('Removed (now empty)', plan.removes.map((c) => `<li>${UI.tile(c, 'sm')}<span>${esc(c.name)}</span></li>`));
      const notes = plan.skipped.slice();
      if (plan.done) notes.unshift(plan.done.toLocaleString('en-GB') + ' entr' + (plan.done === 1 ? 'y is' : 'ies are') + ' already in the right category.');
      if (plan.missing) notes.unshift(plan.missing + ' entr' + (plan.missing === 1 ? 'y wasn’t' : 'ies weren’t') + ' found: probably edited or already moved since the file was made. They’re left as they are.');
      h += sec('Notes', notes.map((n) => `<li><span class="muted">${esc(n)}</span></li>`));
      h += `<div class="btn-row"><button type="button" class="btn press" data-act="sheet-close">Cancel</button><button type="button" class="btn btn-primary press" data-act="chg-apply"${nothing ? ' disabled' : ''}>Apply</button></div></div>`;
      return h;
    };
    T.pending = plan;
    UI.openSheet({ label: 'Category changes', cls: 'tall', render: render, onClose: () => (T.pending = null) });
  };
  A['chg-apply'] = async (el) => {
    const plan = T.pending;
    if (!plan) return;
    el.disabled = true;
    try {
      await T.apply(plan);
      await UI.closeSheet();
      UI.refresh();
      UI.toast('Done: ' + plan.moves.length.toLocaleString('en-GB') + ' entries moved. A restore point was saved first', { duration: 5000 });
    } catch (e) {
      el.disabled = false;
      UI.error(e);
    }
  };
  T.bindFile = (root) => {
    const inp = root.querySelector('#chg-file');
    if (!inp) return;
    inp.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        let obj;
        try {
          obj = JSON.parse(await f.text());
        } catch (err) {
          throw new Error('That file couldn’t be read. Pick the .json changes file.');
        }
        if (!T.isChanges(obj)) throw new Error('That isn’t a category changes file.');
        T.preview(obj, f.name);
      } catch (err) {
        UI.error(err);
      }
    });
  };
})();
