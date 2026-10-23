/* Money Tracker — start-up, example data, background upkeep */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const UI = MT.ui;
  const A = UI.actions;
  MT.VERSION = '1.9.0';

  /* ---------- Example data: flagged so it can be removed in one tap ---------- */
  MT.examples = () => {
    const today = U.today();
    let seed = 20261021;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const tx = [];
    const now = Date.now();
    const add = (date, type, cat, name, amount, note) => {
      if (date > today) return;
      tx.push({ id: 'ex_' + tx.length, type: type, amount: amount, categoryId: cat, name: name, note: note || '', date: date, recurringId: null, example: true, createdAt: now - tx.length, updatedAt: now });
    };
    const first = U.addMonths(U.monthStart(today), -3, 1);
    add(first, 'income', 'adjust', 'Opening balance', 185000);
    for (let k = 0; k < 4; k++) {
      const ms = U.addMonths(first, k, 1);
      const dim = Number(U.monthEnd(ms).slice(8));
      const day = (d) => ms.slice(0, 8) + String(Math.min(d, dim)).padStart(2, '0');
      add(day(1), 'income', 'salary', 'Salary', 215000);
      add(day(1), 'expense', 'home', 'Rent', 82500);
      add(day(3), 'expense', 'health', 'Gym membership', 3000);
      add(day(5), 'expense', 'bills', 'Electricity', 6400 + Math.round(rnd() * 900));
      add(day(12), 'expense', 'bills', 'Mobile phone', 1500);
      add(day(21), 'expense', 'bills', 'Broadband', k === 3 ? 3899 : 3599);
      for (let w = 0; w < 5; w++) add(day(2 + w * 7), 'expense', 'food', 'Supermarket shop', 3200 + Math.round(rnd() * 2800));
      for (let c = 0; c < 6; c++) add(day(1 + Math.floor(rnd() * dim)), 'expense', 'food', 'Coffee', [320, 340, 360][Math.floor(rnd() * 3)]);
      add(day(9), 'expense', 'transport', 'Fuel', 4500 + Math.round(rnd() * 1000));
      add(day(24), 'expense', 'transport', 'Fuel', 4200 + Math.round(rnd() * 1200));
      if (rnd() > 0.3) add(day(14), 'expense', 'fun', 'Cinema', 1250);
      add(day(16 + Math.floor(rnd() * 6)), 'expense', 'shopping', 'Online order', 1500 + Math.round(rnd() * 4500));
      add(day(26), 'expense', 'friends', 'Dinner out', 3800 + Math.round(rnd() * 2500), 'Birthday meal');
      if (k === 1) add(day(11), 'income', 'refund', 'Refund', 2499, 'Returned trainers');
    }
    const nextOn = (anchor) => {
      let d = U.addMonths(U.monthStart(today), 0, anchor);
      if (d <= today) d = U.addMonths(U.monthStart(today), 1, anchor);
      return d;
    };
    const rec = [
      ['Salary', 'income', 'salary', 215000, 1],
      ['Rent', 'expense', 'home', 82500, 1],
      ['Gym membership', 'expense', 'health', 3000, 3],
      ['Broadband', 'expense', 'bills', 3899, 21]
    ].map((r, i) => ({ id: 'exrec_' + i, name: r[0], type: r[1], categoryId: r[2], amount: r[3], freq: 'monthly', anchor: r[4], nextDate: nextOn(r[4]), paused: false, note: '', example: true, createdAt: now }));
    return { tx: tx, rec: rec };
  };
  A['load-examples'] = async () => {
    try {
      const ex = MT.examples();
      await S.addExamples(ex.tx, ex.rec);
      await S.setMeta('onboarded', true);
      await UI.closeSheet();
      UI.toast('Example data loaded. Remove it from Home whenever you like');
    } catch (e) {
      UI.error(e);
    }
  };
  A['clear-examples'] = async () => {
    const ok = await UI.confirm({ title: 'Remove example data?', body: 'Only the example entries are removed. Anything you added yourself stays.', ok: 'Remove examples', danger: true });
    if (!ok) return;
    try {
      const n = await S.clearExamples();
      UI.toast('Removed ' + n + ' example entries');
      if (!S.tx.length) MT.sheets.onboarding();
    } catch (e) {
      UI.error(e);
    }
  };

  function storageError(e) {
    const view = document.getElementById('view');
    view.innerHTML = `<div class="fatal"><span class="tile tile-xl c-amber">${U.icon('alert', 30, 1.8)}</span><h1 class="h1">Couldn’t open your data</h1><p>Nothing has been deleted. The app couldn’t reach its storage this time${e && e.message ? ' (' + U.esc(e.message) + ')' : ''}.</p><p>Close every copy of the app and any browser tab showing it, then open it again.</p><button class="btn btn-primary btn-lg" id="retry-storage">Try again</button></div>`;
    document.documentElement.classList.add('ready');
    const b = document.getElementById('retry-storage');
    if (b) b.addEventListener('click', () => location.reload());
  }

  /* ---------- Boot ---------- */
  async function boot() {
    try {
      await S.load();
    } catch (e) {
      storageError(e);
      return;
    }
    /* If storage can't be opened, stop here. Showing an empty, usable app would look like lost data
       and anything typed in would vanish. The preview page is the only place memory mode is allowed. */
    if (MT.db.memory && !MT.PREVIEW) {
      storageError(MT.db.error);
      return;
    }
    /* Drive backup: pick up a sign-in handed back by Google, start watching for changes */
    let driveToken = false;
    try {
      driveToken = MT.cloud.init();
    } catch (e) {
      console.error(e);
    }
    const MARK = 'mt-had-data';
    let mark = null;
    try {
      mark = JSON.parse(localStorage.getItem(MARK) || 'null');
    } catch (e) {}
    const remember = () => {
      try {
        const n = S.tx.filter((t) => !t.example).length;
        if (n) localStorage.setItem(MARK, JSON.stringify({ n: n, at: Date.now() }));
      } catch (e) {}
    };
    const missing = !MT.PREVIEW && mark && mark.n > 0 && !S.tx.some((t) => !t.example);
    const theme = S.settings().theme;
    UI.applyTheme(theme);
    try {
      localStorage.setItem('mt-theme', JSON.stringify(theme));
    } catch (e) {}
    UI.hideBalance = !!S.settings().hideOnOpen;
    let logged = 0;
    try {
      logged = await S.runRecurring();
    } catch (e) {
      console.error(e);
    }
    S.onChange(() => UI.refresh());
    S.onChange(remember);
    remember();
    history.replaceState({ route: { name: 'home', params: {} } }, '');
    UI.render({ entering: true });
    document.documentElement.classList.add('ready');

    let params;
    try {
      params = new URLSearchParams(location.search);
    } catch (e) {
      params = new URLSearchParams('');
    }
    if (UI.resumeDrive && UI.resumeDrive(driveToken)) {
      /* came back from a full-page Google sign-in: carry on where you were */
    } else if (params.get('add')) {
      MT.sheets.txForm(null, { type: params.get('add') === 'income' ? 'income' : 'expense' });
    } else if (params.get('view') === 'search') {
      UI.go('search');
    } else if (missing) {
      MT.sheets.missingData(mark);
    } else if (!S.meta.onboarded && !S.tx.length) {
      MT.sheets.onboarding();
    } else if (logged) {
      UI.toast(logged + ' recurring ' + (logged === 1 ? 'entry' : 'entries') + ' logged');
    }

    setTimeout(() => S.snapshotDaily().catch(() => {}), 1500);
    /* ask the browser to protect our storage every launch; Chrome grants it once the app is installed or used often */
    setTimeout(async () => {
      UI.persisted = await MT.db.persist();
      if (UI.persisted === false && UI.route.name === 'home') UI.refresh();
    }, 1200);
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      let n = 0;
      try {
        n = await S.runRecurring();
      } catch (e) {}
      S.snapshotDaily().catch(() => {});
      if (n) UI.toast(n + ' recurring ' + (n === 1 ? 'entry' : 'entries') + ' logged');
    });
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => UI.applyTheme(S.settings().theme));
    } catch (e) {}
    if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window && !MT.PREVIEW) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  boot();
})();
