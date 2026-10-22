/* Money Tracker — screens */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const X = MT.smart;
  const UI = MT.ui;
  const V = UI.views;
  const A = UI.actions;
  const esc = U.esc;
  const ic = U.icon;

  UI.act = { period: 'month', anchor: U.today(), cat: null };
  UI.homePeriod = 'month';
  UI.insMonth = U.today();

  /* ================= HOME ================= */
  V.home = {
    render() {
      const today = U.today();
      const fc = X.forecast(today);
      const tot = S.totals(S.mStart(today), today);
      const d = U.parse(today);
      let h = `<header class="appbar topbar"><div><p class="eyebrow">${U.dowLong(today)} ${d.getDate()} ${U.MONL[d.getMonth()]}</p><h1 class="h1">Overview</h1></div><button class="icon-btn outline press" data-act="go" data-to="search" aria-label="Search transactions">${ic('search', 20, 1.9)}</button></header>`;
      h += `<div class="stack">`;
      if (MT.db.memory) h += `<div class="banner warn">${ic('alert', 18, 2)}<p><b>Preview mode.</b> Storage isn’t available here, so anything you add disappears when you close this page.</p></div>`;
      if (S.hasExamples()) h += `<div class="banner">${ic('spark', 18, 2)}<p>You’re looking at <b>example data</b>. Remove it before you start logging for real.</p><button class="btn btn-sm btn-soft press" data-act="clear-examples">Remove</button></div>`;
      const last = S.meta.lastFileBackup;
      const unprotected = !MT.db.memory && !MT.PREVIEW && UI.persisted === false && S.tx.some((t) => !t.example);
      if (unprotected) {
        h += `<div class="banner warn">${ic('alert', 18, 2)}<p><b>Storage not protected.</b> Your phone could clear this app’s data to free up space. ${last ? 'Last backup file: ' + U.ago(last) + '.' : 'Save a backup file now.'}</p><button class="btn btn-sm btn-primary press" data-act="backup-now">Back up</button></div>`;
      } else if (!MT.db.memory && S.tx.some((t) => !t.example) && (!last || Date.now() - last > 3 * 86400000)) {
        h += `<div class="banner">${ic('shield', 18, 2)}<p>${last ? 'Your last backup file was ' + U.ago(last) + '.' : 'You haven’t saved a backup file yet.'} Save one so nothing can be lost.</p><button class="btn btn-sm btn-primary press" data-act="backup-now">Back up</button></div>`;
      }
      /* balance */
      const hidden = UI.hideBalance;
      h += `<section class="hero"><div class="hero-top"><span class="hero-label">Total balance</span><button class="hero-eye press" data-act="toggle-balance" aria-pressed="${hidden}" aria-label="${hidden ? 'Show balance' : 'Hide balance'}">${ic(hidden ? 'eyeOff' : 'eye', 20, 1.9)}</button></div><div class="hero-amt${hidden ? ' masked' : ''}" aria-live="polite">${hidden ? '£ ••••••' : U.fmt(S.balance())}</div><div class="hero-bottom"><span class="hero-sub">${ic('wallet', 16, 1.9)} ${S.tx.length ? S.tx.length.toLocaleString('en-GB') + ' transaction' + (S.tx.length === 1 ? '' : 's') : 'No transactions yet'}</span><button class="hero-btn press" data-act="go" data-to="adjust">${ic('sliders', 16, 1.9)} Adjust</button></div></section>`;
      if (!S.tx.length) {
        h += `<section class="card welcome"><h2 class="card-title">Log your first expense</h2><p class="muted">Tap the + button any time. Type “coffee 3.40” in the description and the amount, date and category fill themselves in.</p><button class="btn btn-primary press" data-act="quick-add">${ic('plus', 18, 2.2)} Add a transaction</button></section>`;
      }
      /* watchdog alerts */
      X.alerts().forEach((a) => {
        h += `<div class="alert ${a.kind}" data-alert="${esc(a.id)}"><span class="alert-ic">${ic(a.icon, 18, 2)}</span><button class="alert-main" data-act="edit-tx" data-id="${esc(a.txId)}"><b>${esc(a.title)}</b><span>${esc(a.body)}</span></button><button class="icon-btn sm" data-act="dismiss-alert" data-id="${esc(a.id)}" aria-label="Dismiss">${ic('close', 16, 2)}</button></div>`;
      });
      /* month card */
      h += `<section class="card"><div class="card-head"><h2 class="card-title">${S.mName(today)} so far</h2><span class="muted sm">Day ${fc.dayIdx} of ${fc.days}</span></div>`;
      h += `<div class="pair"><div><span class="lbl">Spent</span><span class="big">${U.fmt(tot.out)}</span></div><div><span class="lbl">Income</span><span class="big in">${U.fmt(tot.in, { plus: true })}</span></div></div>`;
      h += pacePill(fc);
      if (S.tx.length) {
        h += MT.charts.monthLine(fc, { animate: UI.entering });
        h += lineLegend(fc);
      }
      h += `<button class="link-row press" data-act="tab" data-to="insights">See insights ${ic('chevR', 16, 2)}</button></section>`;
      /* top spending */
      const p = UI.homePeriod;
      const from = p === 'week' ? U.weekStart(today, S.settings().weekStart) : S.mStart(today);
      const cats = S.byCategory(from, today, 'expense');
      const totalOut = cats.reduce((a, c) => a + c.total, 0);
      h += `<section class="card"><div class="card-head"><h2 class="card-title">Top spending</h2>${UI.seg('home-period', [{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }], p, 'home-period', 'seg-sm')}</div>`;
      if (cats.length) {
        h += `<div class="cat-bars">` + cats.slice(0, 4).map((c) => catBar(c, totalOut, cats[0].total, from, today)).join('') + `</div>`;
      } else h += `<p class="muted pad-t">Nothing spent ${p === 'week' ? 'this week' : 'this month'} yet.</p>`;
      h += `</section>`;
      /* coming up */
      const up = S.upcoming(10).slice(0, 3);
      if (up.length) {
        h += `<section class="card list-card"><div class="card-head"><h2 class="card-title">Coming up</h2><button class="link press" data-act="go" data-to="recurring">All recurring</button></div>`;
        h += up
          .map((u) => {
            const c = S.cat(u.rule.categoryId);
            return `<button class="tx-row press" data-act="edit-rec" data-id="${esc(u.rule.id)}">${UI.tile(c)}<span class="tx-main"><span class="tx-title">${esc(u.rule.name)}</span><span class="tx-sub">${esc(U.fmtDay(u.date))} · logged automatically</span></span><span class="${u.rule.type === 'income' ? 'amt in' : 'amt'}">${u.rule.type === 'income' ? '+' : '−'}${U.fmt(u.rule.amount)}</span></button>`;
          })
          .join('');
        h += `</section>`;
      }
      /* recent */
      if (S.tx.length) {
        h += `<section class="card list-card"><div class="card-head"><h2 class="card-title">Recent</h2><button class="link press" data-act="see-all">See all</button></div>`;
        h += S.tx.slice(0, 5).map((t) => UI.txRow(t, { showDate: true })).join('');
        h += `</section>`;
      }
      h += `</div>`;
      return h;
    }
  };

  function pacePill(fc) {
    if (fc.avgToDate != null && fc.dayIdx) {
      const diff = fc.avgToDate - fc.spent;
      if (diff >= 0) return `<p class="pill good">${ic('down', 14, 2.2)} ${U.fmt(diff)} under your usual pace</p>`;
      return `<p class="pill warn">${ic('up', 14, 2.2)} ${U.fmt(-diff)} over your usual pace</p>`;
    }
    if (fc.projection) return `<p class="pill">${ic('spark', 14, 2)} Heading for about ${U.fmt(fc.projection)} this month</p>`;
    return '';
  }
  function lineLegend(fc) {
    let l = `<div class="legend"><span><i class="sw sw-out"></i>This month · ${U.fmt(fc.spent)}</span>`;
    if (fc.avg) l += `<span><i class="sw sw-avg"></i>${fc.avgMonths}-month average${fc.avgToDate != null ? ' · ' + U.fmt(fc.avgToDate) : ''}</span>`;
    if (fc.projection) l += `<span><i class="sw sw-proj"></i>Forecast · ${U.fmt(fc.projection)}</span>`;
    return l + `</div>`;
  }
  function catBar(c, total, max, from, to) {
    const pct = total ? Math.round((c.total / total) * 100) : 0;
    const w = max ? Math.max(2, Math.round((c.total / max) * 100)) : 0;
    return `<button class="cat-bar press" data-act="cat-activity" data-cat="${esc(c.cat.id)}" data-from="${from}" data-to="${to}">${UI.tile(c.cat)}<span class="cb-main"><span class="cb-top"><span class="cb-name">${esc(c.cat.name)}</span><span class="cb-amt">${U.fmt(c.total)}</span></span><span class="cb-track"><span class="cb-fill" style="width:${w}%"></span></span></span><span class="cb-pct">${pct}%</span></button>`;
  }

  A['toggle-balance'] = () => {
    UI.hideBalance = !UI.hideBalance;
    const hero = document.querySelector('.hero');
    if (!hero) return UI.refresh();
    const amt = hero.querySelector('.hero-amt');
    const btn = hero.querySelector('.hero-eye');
    amt.classList.add('swap');
    setTimeout(() => {
      amt.textContent = UI.hideBalance ? '£ ••••••' : U.fmt(S.balance());
      amt.classList.toggle('masked', UI.hideBalance);
      amt.classList.remove('swap');
    }, 140);
    btn.innerHTML = ic(UI.hideBalance ? 'eyeOff' : 'eye', 20, 1.9);
    btn.setAttribute('aria-pressed', String(UI.hideBalance));
    btn.setAttribute('aria-label', UI.hideBalance ? 'Show balance' : 'Hide balance');
  };
  A['home-period'] = (el) => {
    UI.homePeriod = el.getAttribute('data-val');
    UI.refresh();
  };
  A['dismiss-alert'] = async (el) => {
    const id = el.getAttribute('data-id');
    const card = el.closest('.alert');
    if (card) card.classList.add('leaving');
    try {
      await S.setMeta('dismissed', (S.meta.dismissed || []).concat([id]).slice(-200));
    } catch (e) {}
    setTimeout(UI.refresh, 220);
  };
  A['see-all'] = () => {
    UI.act = { period: 'month', anchor: U.today(), cat: null };
    UI.tab('activity');
  };
  A['cat-activity'] = (el) => {
    const from = el.getAttribute('data-from');
    const to = el.getAttribute('data-to');
    const period = from === to ? 'day' : UI.route.name === 'home' && UI.homePeriod === 'week' ? 'week' : 'month';
    UI.act = { period: period, anchor: to, cat: el.getAttribute('data-cat') };
    UI.tab('activity');
  };

  /* ================= ACTIVITY ================= */
  function rangeOf(period, anchor) {
    const ws = S.settings().weekStart;
    if (period === 'day') return { from: anchor, to: anchor, label: U.fmtDay(anchor) };
    if (period === 'week') {
      const from = U.weekStart(anchor, ws);
      const to = U.addDays(from, 6);
      const f = U.parse(from);
      const t = U.parse(to);
      const label = f.getMonth() === t.getMonth() ? `${f.getDate()} – ${t.getDate()} ${U.MON[t.getMonth()]}` : `${f.getDate()} ${U.MON[f.getMonth()]} – ${t.getDate()} ${U.MON[t.getMonth()]}`;
      return { from: from, to: to, label: label };
    }
    return { from: S.mStart(anchor), to: S.mEnd(anchor), label: S.mLabel(anchor), sub: S.mSpan(anchor) };
  }
  UI.rangeOf = rangeOf;
  /* "back to now" pill: only shown when you've moved away from the current day, week or month.
     It pops in the first time it appears, not on every swipe after that. */
  UI.pillShown = {};
  UI.nowPill = (route, act, label) => {
    const fresh = !UI.pillShown[route];
    UI.pillShown[route] = true;
    return `<button class="now-pill press${fresh && !U.reducedMotion() ? ' pop' : ''}" data-lift data-act="${act}" aria-label="Back to ${label.toLowerCase()}">${ic('jump', 15, 2.4)}<span>${label}</span></button>`;
  };
  UI.noPill = (route) => {
    UI.pillShown[route] = false;
    return '';
  };
  /* a range title, with the pay month's dates underneath when months run from payday */
  UI.rangeText = (label, sub) => (sub ? `<span class="range-stack"><span>${esc(label)}</span><small>${esc(sub)}</small></span>` : esc(label));
  V.activity = {
    render() {
      const st = UI.act;
      const r = rangeOf(st.period, st.anchor);
      const today = U.today();
      const canNext = r.to < today;
      const away = !(r.from <= today && today <= r.to);
      let h = `<header class="appbar topbar"><h1 class="h1">Activity</h1><div class="bar-actions">${away ? UI.nowPill('activity', 'act-now', { day: 'Today', week: 'This week', month: 'This month' }[st.period]) : UI.noPill('activity')}<button class="icon-btn outline press" data-act="go" data-to="search" aria-label="Search transactions">${ic('search', 20, 1.9)}</button></div></header><div class="stack">`;
      h += UI.seg('Period', [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }], st.period, 'act-period');
      h += `<div class="swipe-area${UI.actEnter ? ' ' + UI.actEnter : ''}">`;
      UI.actEnter = null;
      h += `<div class="range-nav"><button class="icon-btn press" data-act="act-step" data-dir="-1" aria-label="Previous">${ic('chevL', 20, 2)}</button><button class="range-label range-btn press" data-act="pick-period" aria-label="Choose a ${st.period}: ${esc(r.label)}">${UI.rangeText(r.label, r.sub)}${ic('chevD', 16, 2.2)}</button><button class="icon-btn press" data-act="act-step" data-dir="1" aria-label="Next"${canNext ? '' : ' disabled'}>${ic('chevR', 20, 2)}</button></div>`;
      const all = S.range(r.from, r.to);
      const tot = S.totals(r.from, r.to);
      h += `<section class="card summary3"><div><span class="lbl">Money in</span><span class="mid in">${U.fmt(tot.in, { plus: true })}</span></div><div><span class="lbl">Money out</span><span class="mid">${U.fmt(-tot.out)}</span></div><div class="r"><span class="lbl">Net</span><span class="mid">${U.fmt(tot.net, { plus: true })}</span></div></section>`;
      /* category filter */
      const present = {};
      all.forEach((t) => (present[t.categoryId] = (present[t.categoryId] || 0) + t.amount));
      const ids = Object.keys(present).sort((a, b) => present[b] - present[a]);
      if (st.cat && ids.indexOf(st.cat) < 0) ids.unshift(st.cat);
      if (ids.length > 1 || st.cat) {
        h += `<div class="chips scroll-x" role="group" aria-label="Filter by category"><button class="chip${!st.cat ? ' on' : ''}" data-act="act-cat" data-cat="" aria-pressed="${!st.cat}">All</button>`;
        h += ids.map((id) => `<button class="chip${st.cat === id ? ' on' : ''}" data-act="act-cat" data-cat="${esc(id)}" aria-pressed="${st.cat === id}">${esc(S.cat(id).name)}</button>`).join('');
        h += `</div>`;
      }
      const list = st.cat ? all.filter((t) => t.categoryId === st.cat) : all;
      if (!list.length) {
        h += UI.empty('list', st.cat ? 'Nothing in ' + S.cat(st.cat).name : 'Nothing logged', st.period === 'day' ? 'No transactions on this day.' : 'No transactions in this period.', `<button class="btn btn-primary press" data-act="quick-add" data-date="${st.period === 'day' ? st.anchor : ''}">${ic('plus', 18, 2.2)} Add one</button>`);
      } else {
        const groups = [];
        list.forEach((t) => {
          let g = groups[groups.length - 1];
          if (!g || g.date !== t.date) groups.push((g = { date: t.date, items: [] }));
          g.items.push(t);
        });
        h += groups
          .map((g) => {
            const net = g.items.reduce((a, t) => a + S.signed(t), 0);
            const dd = U.parse(g.date);
            const dayName = g.date === today ? 'Today' : g.date === U.addDays(today, -1) ? 'Yesterday' : U.dowLong(g.date);
            return `<section class="card day-group"><div class="day-head"><span class="day-num">${dd.getDate()}</span><span class="day-meta"><b>${dayName}</b><span>${U.MONL[dd.getMonth()]} ${dd.getFullYear()}</span></span><span class="day-net">${U.fmt(net, { plus: true })}</span></div>${g.items.map((t) => UI.txRow(t)).join('')}</section>`;
          })
          .join('');
      }
      h += `</div></div>`;
      return h;
    }
  };
  A['act-period'] = (el) => {
    UI.act.period = el.getAttribute('data-val');
    UI.refresh();
  };
  UI.actCanNext = () => rangeOf(UI.act.period, UI.act.anchor).to < U.today();
  UI.actStep = (dir, from) => {
    const st = UI.act;
    if (dir > 0 && !UI.actCanNext()) return false;
    let a = st.anchor;
    if (st.period === 'day') a = U.addDays(a, dir);
    else if (st.period === 'week') a = U.addDays(a, 7 * dir);
    else a = S.mAdd(a, dir);
    if (a > U.today()) a = U.today();
    st.anchor = a;
    UI.swapPeriod(dir, from);
    return true;
  };
  A['act-now'] = () => {
    UI.act.anchor = U.today();
    U.vibrate(5);
    UI.swapPeriod(1);
  };
  A['act-step'] = (el) => UI.actStep(Number(el.getAttribute('data-dir')));
  /* screens you can swipe between periods on: Activity here, Insights further down */
  UI.swipeNav = { activity: { canNext: () => UI.actCanNext(), step: (dir, from) => UI.actStep(dir, from) } };

  /* Change period with a carousel-style hand-over: the old period keeps moving out while the new one
     slides in from the other side, overlapping, so the screen never goes blank in between.
     from: where the old content already is (mid-swipe), as { x: px, o: opacity }. */
  UI.swapPeriod = (dir, from) => {
    const old = document.querySelector('#view .swipe-area');
    if (!old || U.reducedMotion() || !old.animate) return UI.refresh();
    const r0 = old.getBoundingClientRect();
    const ghost = old.cloneNode(true);
    UI.refresh();
    const neu = document.querySelector('#view .swipe-area');
    if (!neu) return;
    const host = neu.parentNode;
    const hr = host.getBoundingClientRect();
    host.classList.add('swapping');
    ghost.className = 'swipe-ghost';
    ghost.querySelectorAll('.draw').forEach((n) => n.classList.remove('draw'));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.removeAttribute('style');
    ghost.style.top = r0.top - hr.top + 'px';
    const x0 = from ? from.x : 0;
    const o0 = from ? from.o : 1;
    /* the measured box already includes the finger's offset, so take it back out; the animation adds it */
    ghost.style.left = r0.left - x0 - hr.left + 'px';
    ghost.style.width = r0.width + 'px';
    host.insertBefore(ghost, neu);
    const w = r0.width;
    const out = ghost.animate(
      [
        { transform: 'translateX(' + x0 + 'px)', opacity: o0 },
        { transform: 'translateX(' + -dir * w * 0.55 + 'px)', opacity: 0 }
      ],
      { duration: 240, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }
    );
    neu.animate(
      [
        { transform: 'translateX(' + dir * w * 0.35 + 'px)', opacity: 0 },
        { transform: 'none', opacity: 1 }
      ],
      { duration: 320, easing: 'cubic-bezier(.22,.9,.24,1)' }
    );
    const done = () => {
      ghost.remove();
      if (!host.querySelector('.swipe-ghost')) host.classList.remove('swapping');
    };
    out.onfinish = done;
    setTimeout(done, 400);
  };

  /* Swipe anywhere on Activity or Insights: the page follows your finger, then snaps to the previous or next period.
     Insights' spending line is left alone, because sliding a finger along it reads the values. */
  (function () {
    let st = null;
    let swallowClick = false;
    /* a long-press on a row takes over: drop any swipe in progress */
    UI.cancelSwipe = () => {
      if (!st) return;
      st.el.classList.remove('dragging');
      st.el.style.transform = '';
      st.el.style.opacity = '';
      st = null;
    };
    const width = () => Math.min(window.innerWidth, 560);
    document.addEventListener(
      'pointerdown',
      (e) => {
        /* a new touch means the last swipe is over: never let it eat this tap */
        swallowClick = false;
        const nav = UI.swipeNav[UI.route.name];
        if (!nav || UI.sheets.length || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.target.closest('.scroll-x, input, .tabbar, .sheet-wrap, #toast-root, .line-chart')) return;
        if (e.clientX < 18 || e.clientX > window.innerWidth - 18) return; /* leave Android's back gesture alone */
        const el = document.querySelector('#view .swipe-area');
        if (el) st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, lock: null, el: el, nav: nav, last: [e.clientX, e.timeStamp] };
      },
      { passive: true }
    );
    document.addEventListener(
      'pointermove',
      (e) => {
        if (!st || e.pointerId !== st.id) return;
        const dx = e.clientX - st.x;
        const dy = e.clientY - st.y;
        if (st.lock === null) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          st.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
          if (st.lock === 'x') {
            st.el.classList.add('dragging');
            swallowClick = true;
          }
        }
        if (st.lock !== 'x') return;
        const w = width();
        const blocked = dx < 0 && !st.nav.canNext();
        const d = blocked ? dx * 0.22 : dx;
        st.dx = dx;
        st.v = (e.clientX - st.last[0]) / Math.max(1, e.timeStamp - st.last[1]);
        st.last = [e.clientX, e.timeStamp];
        st.el.style.transform = 'translateX(' + d + 'px)';
        st.el.style.opacity = String(1 - Math.min(Math.abs(d) / w, 1) * 0.6);
      },
      { passive: true }
    );
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      setTimeout(() => (swallowClick = false), 400);
      if (s.lock !== 'x') return;
      const w = width();
      const dir = s.dx < 0 ? 1 : -1;
      const fast = Math.abs(s.v || 0) > 0.45 && Math.sign(s.v) === Math.sign(s.dx);
      const go = e.type !== 'pointercancel' && (Math.abs(s.dx) > w * 0.22 || fast) && (dir < 0 || s.nav.canNext());
      s.el.classList.remove('dragging');
      if (!go || U.reducedMotion()) {
        s.el.style.transition = 'transform .32s var(--ease), opacity .32s var(--ease)';
        s.el.style.transform = '';
        s.el.style.opacity = '';
        setTimeout(() => (s.el.style.transition = ''), 340);
        if (go) s.nav.step(dir);
        return;
      }
      /* hand over straight away from wherever your finger left it */
      s.nav.step(dir, { x: s.dx, o: Number(s.el.style.opacity || 1) });
      U.vibrate(5);
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.addEventListener(
      'click',
      (e) => {
        if (!swallowClick) return;
        swallowClick = false;
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
  })();
  A['act-cat'] = (el) => {
    UI.act.cat = el.getAttribute('data-cat') || null;
    UI.refresh();
  };

  /* ================= SEARCH ================= */
  UI.search = { q: '', type: 'all' };
  V.search = {
    render() {
      let h = `<header class="appbar search-bar"><button class="icon-btn" data-act="back" aria-label="Back">${ic('back', 22, 2)}</button><label class="search-field" for="q"><span class="sr">Search transactions</span>${ic('search', 20, 1.9)}<input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Name, note, category or amount" value="${esc(UI.search.q)}" autofocus><button class="icon-btn sm clear" data-act="search-clear" aria-label="Clear search"${UI.search.q ? '' : ' hidden'}>${ic('close', 16, 2.4)}</button></label></header>`;
      h += `<div class="stack"><div class="chips" role="group" aria-label="Type">${[['all', 'All'], ['expense', 'Expenses'], ['income', 'Income']].map((o) => `<button class="chip${UI.search.type === o[0] ? ' on' : ''}" data-act="search-type" data-val="${o[0]}" aria-pressed="${UI.search.type === o[0]}">${o[1]}</button>`).join('')}</div><div id="search-results"></div></div>`;
      return h;
    },
    after(el) {
      const input = el.querySelector('#q');
      const run = () => {
        UI.search.q = input.value;
        el.querySelector('.clear').hidden = !input.value;
        el.querySelector('#search-results').innerHTML = searchResults();
      };
      input.addEventListener('input', run);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
          rememberSearch(input.value);
        }
      });
      run();
      setTimeout(() => {
        try {
          input.focus();
        } catch (e) {}
      }, 50);
    }
  };
  function mark(text, needle) {
    const t = String(text || '');
    if (!needle) return esc(t);
    const i = t.toLowerCase().indexOf(needle);
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + needle.length)) + '</mark>' + esc(t.slice(i + needle.length));
  }
  function searchResults() {
    const q = UI.search.q.trim().toLowerCase();
    const type = UI.search.type;
    if (!q) {
      const rec = S.meta.recentSearches || [];
      let h = '';
      if (rec.length) h += `<h2 class="section-label">Recent searches</h2><div class="chips wrap">${rec.map((r) => `<button class="chip" data-act="search-recent" data-q="${esc(r)}">${ic('history', 14, 2)} ${esc(r)}</button>`).join('')}</div>`;
      h += `<p class="muted pad-t">Results appear as you type. Part of a word is enough, and notes, categories and amounts are searched too.</p>`;
      return h;
    }
    const qMoney = q.replace(/[£,]/g, '');
    const res = S.tx.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      const c = S.cat(t.categoryId).name.toLowerCase();
      const amt = (t.amount / 100).toFixed(2);
      return (t.name || '').toLowerCase().indexOf(q) >= 0 || (t.note || '').toLowerCase().indexOf(q) >= 0 || c.indexOf(q) >= 0 || (qMoney && /^[\d.]+$/.test(qMoney) && amt.indexOf(qMoney) === 0);
    });
    /* best matches first: name starts with it, then a word in the name does, then anywhere; newest first within each */
    const esc_re = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordStart = new RegExp('(^|[^a-z0-9])' + esc_re, 'i');
    const rank = (t) => {
      const n = (t.name || S.cat(t.categoryId).name).toLowerCase();
      if (n.indexOf(q) === 0) return 0;
      if (wordStart.test(n)) return 1;
      if (n.indexOf(q) >= 0) return 2;
      return 3;
    };
    res.sort((a, b) => rank(a) - rank(b));
    if (!res.length) return UI.empty('search', 'No matches', 'Try fewer letters, or check the Expenses / Income filter.');
    const total = res.reduce((a, t) => a + S.signed(t), 0);
    let h = `<div class="res-head"><span>${res.length} result${res.length === 1 ? '' : 's'}</span><span>${U.fmt(total, { plus: true })}</span></div><section class="card list-card">`;
    h += res
      .slice(0, 150)
      .map((t) => {
        const c = S.cat(t.categoryId);
        const title = t.name || c.name;
        const noteHit = t.note && t.note.toLowerCase().indexOf(q) >= 0;
        return UI.txRow(t, { showDate: true, titleHtml: mark(title, q), noteHtml: noteHit ? `<span class="tx-note">“${mark(t.note, q)}”</span>` : '' });
      })
      .join('');
    h += `</section>`;
    if (res.length > 150) h += `<p class="muted sm pad-t">Showing the latest 150. Add more letters to narrow it down.</p>`;
    return h;
  }
  function rememberSearch(q) {
    q = String(q || '').trim();
    if (q.length < 2) return;
    const list = [q].concat((S.meta.recentSearches || []).filter((x) => x.toLowerCase() !== q.toLowerCase())).slice(0, 6);
    S.setMeta('recentSearches', list).catch(() => {});
  }
  UI.rememberSearch = rememberSearch;
  A['search-clear'] = () => {
    const input = document.getElementById('q');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  };
  A['search-type'] = (el) => {
    UI.search.type = el.getAttribute('data-val');
    document.querySelectorAll('[data-act="search-type"]').forEach((b) => {
      const on = b === el;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.getElementById('search-results').innerHTML = searchResults();
  };
  A['search-recent'] = (el) => {
    const input = document.getElementById('q');
    input.value = el.getAttribute('data-q');
    input.dispatchEvent(new Event('input'));
  };

  /* ================= INSIGHTS ================= */
  V.insights = {
    render() {
      const m = S.mStart(UI.insMonth);
      UI.insMonth = m;
      const today = U.today();
      const isCurrent = m === S.mStart(today);
      const end = isCurrent ? today : S.mEnd(m);
      const fc = X.forecast(m);
      const tot = S.totals(m, end);
      let h = `<header class="appbar topbar"><h1 class="h1">Insights</h1>${isCurrent ? UI.noPill('insights') : UI.nowPill('insights', 'ins-now', 'This month')}</header><div class="stack"><div class="swipe-area${UI.insEnter ? ' ' + UI.insEnter : ''}">`;
      UI.insEnter = null;
      h += `<div class="range-nav"><button class="icon-btn press" data-act="ins-step" data-dir="-1" aria-label="Previous month">${ic('chevL', 20, 2)}</button><button class="range-label range-btn press" data-act="pick-ins-month" aria-label="Choose a month: ${S.mLabel(m)}">${UI.rangeText(S.mLabel(m), S.mSpan(m))}${ic('chevD', 16, 2.2)}</button><button class="icon-btn press" data-act="ins-step" data-dir="1" aria-label="Next month"${isCurrent ? ' disabled' : ''}>${ic('chevR', 20, 2)}</button></div>`;
      if (!S.tx.length) {
        h += UI.empty('insights', 'Charts appear as you log', 'Once you’ve added a few transactions, this is where you’ll see where your money goes.', `<button class="btn btn-primary press" data-act="quick-add">${ic('plus', 18, 2.2)} Add a transaction</button>`);
        return h + '</div></div>';
      }
      /* headline */
      h += `<section class="card">`;
      if (isCurrent && fc.projection) {
        h += `<p class="lbl">Forecast for ${S.mName(m)}</p><p class="headline">${U.fmt(fc.projection)}</p><p class="muted">You’ve spent ${U.fmt(fc.spent)} so far${fc.avg ? `. A typical month ends around ${U.fmt(fc.avg[fc.days - 1])}` : ''}.</p>`;
      } else {
        h += `<p class="lbl">Spent in ${S.mName(m)}${isCurrent ? ' so far' : ''}</p><p class="headline">${U.fmt(tot.out)}</p>${fc.avg && !isCurrent ? `<p class="muted">Your ${fc.avgMonths}-month average before this was ${U.fmt(fc.avg[fc.days - 1])}.</p>` : ''}`;
      }
      h += MT.charts.monthLine(fc, { animate: UI.entering }) + lineLegend(fc) + `</section>`;
      /* stat tiles */
      const daily = S.dailySpend(m, end);
      const dayCount = Math.max(1, U.daysBetween(m, end) + 1);
      let bigDay = null;
      Object.keys(daily).forEach((k) => {
        if (!bigDay || daily[k] > daily[bigDay]) bigDay = k;
      });
      const count = S.range(m, end).filter(S.isStat).length;
      const go = `<span class="stat-go" aria-hidden="true">${ic('chevR', 14, 2.2)}</span>`;
      h += `<div class="tiles3">`;
      h += `<button class="stat press" data-act="stat-go" data-period="day" data-anchor="${end}" aria-label="Per day ${U.fmt(Math.round(tot.out / dayCount))}. Open day by day view">${go}<span class="lbl">Per day</span><span class="mid">${U.fmt(Math.round(tot.out / dayCount))}</span><span class="tiny">Day by day</span></button>`;
      h += bigDay
        ? `<button class="stat press" data-act="stat-go" data-period="day" data-anchor="${bigDay}" aria-label="Biggest day ${U.fmt(daily[bigDay])} on ${U.fmtDay(bigDay)}. Open that day">${go}<span class="lbl">Biggest day</span><span class="mid">${U.fmt(daily[bigDay])}</span><span class="tiny">${U.fmtShortDate(bigDay)}</span></button>`
        : `<div class="stat"><span class="lbl">Biggest day</span><span class="mid">£0.00</span><span class="tiny">—</span></div>`;
      h += `<button class="stat press" data-act="stat-go" data-period="month" data-anchor="${end}" aria-label="${count} entries. Open all entries for the month">${go}<span class="lbl">Entries</span><span class="mid">${count}</span><span class="tiny">See all</span></button>`;
      h += `</div>`;
      /* categories */
      const cats = S.byCategory(m, end, 'expense');
      h += `<section class="card"><div class="card-head"><h2 class="card-title">Where it went</h2><span class="muted sm">${U.fmt(tot.out)}</span></div>`;
      if (cats.length) {
        const top = cats.slice(0, 7);
        const rest = cats.slice(7);
        h += `<div class="cat-bars">` + top.map((c) => catBar(c, tot.out, cats[0].total, m, end)).join('');
        if (rest.length) {
          const r = { cat: { id: '', name: rest.length + ' more categories', icon: 'more', color: 'slate' }, total: rest.reduce((a, c) => a + c.total, 0) };
          const pct = Math.round((r.total / tot.out) * 100);
          h += `<div class="cat-bar static">${UI.tile(r.cat)}<span class="cb-main"><span class="cb-top"><span class="cb-name">${esc(r.cat.name)}</span><span class="cb-amt">${U.fmt(r.total)}</span></span><span class="cb-track"><span class="cb-fill muted-fill" style="width:${Math.max(2, Math.round((r.total / cats[0].total) * 100))}%"></span></span></span><span class="cb-pct">${pct}%</span></div>`;
        }
        h += `</div>`;
      } else h += `<p class="muted pad-t">No spending this month.</p>`;
      const inc = S.byCategory(m, end, 'income');
      if (inc.length) h += `<p class="muted sm pad-t">Income: ${inc.slice(0, 3).map((c) => esc(c.cat.name) + ' ' + U.fmt(c.total)).join(' · ')}</p>`;
      h += `</section>`;
      /* 6 months */
      const months = [];
      for (let k = 5; k >= 0; k--) {
        const ms = S.mAdd(m, -k);
        const t = S.totals(ms, S.mEnd(ms));
        months.push({ label: S.mShortName(ms), full: S.mLabel(ms) + (S.payMode() ? ' (' + S.mSpan(ms) + ')' : ''), in: t.in, out: t.out });
      }
      h += `<section class="card"><div class="card-head"><h2 class="card-title">Last 6 months</h2></div><div class="legend top"><span><i class="sw sw-out"></i>Spent</span><span><i class="sw sw-in"></i>Income</span></div>${MT.charts.monthBars(months)}<p class="muted sm">Tap a month for the numbers.</p></section>`;
      h += `</div></div>`;
      return h;
    }
  };
  A['stat-go'] = (el) => {
    UI.act = { period: el.getAttribute('data-period'), anchor: el.getAttribute('data-anchor'), cat: null };
    UI.tab('activity');
  };
  A['pick-period'] = () => {
    const st = UI.act;
    MT.sheets.periodPicker({
      mode: st.period === 'month' ? 'month' : 'day',
      value: st.anchor,
      title: st.period === 'month' ? 'Choose a month' : st.period === 'week' ? 'Choose a week' : 'Choose a day',
      onPick: (iso) => {
        UI.act.anchor = st.period === 'month' ? iso : iso;
        UI.entering = true;
        UI.refresh();
      }
    });
  };
  A['pick-ins-month'] = () => {
    MT.sheets.periodPicker({
      mode: 'month',
      value: UI.insMonth,
      title: 'Choose a month',
      onPick: (iso) => {
        UI.insMonth = iso;
        UI.entering = true;
        UI.refresh();
      }
    });
  };
  UI.insCanNext = () => S.mStart(UI.insMonth) < S.mStart(U.today());
  UI.insStep = (dir, from) => {
    if (dir > 0 && !UI.insCanNext()) return false;
    const next = S.mAdd(UI.insMonth, dir);
    if (next > U.today()) return false;
    UI.insMonth = next;
    UI.swapPeriod(dir, from);
    return true;
  };
  UI.swipeNav.insights = { canNext: () => UI.insCanNext(), step: (dir, from) => UI.insStep(dir, from) };
  A['ins-now'] = () => {
    UI.insMonth = U.today();
    U.vibrate(5);
    UI.swapPeriod(1);
  };
  A['ins-step'] = (el) => UI.insStep(Number(el.getAttribute('data-dir')));

  /* ================= MORE / SETTINGS ================= */
  V.more = {
    render() {
      const st = S.settings();
      const last = S.meta.lastFileBackup;
      let h = `<header class="appbar topbar"><h1 class="h1">More</h1></header><div class="stack">`;
      h += `<h2 class="section-label">Appearance</h2><section class="card">${UI.seg('Theme', [{ id: 'system', label: 'System', icon: 'system' }, { id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }], st.theme, 'theme')}<p class="muted sm pad-t" id="theme-note">${themeNote(st.theme)}</p>`;
      h += `<div class="set-row bordered"><span id="hide-lbl" class="set-text"><b>Hide balance when the app opens</b><span>Tap the eye on Home to show it</span></span>${UI.switch('sw-hide', st.hideOnOpen, 'set-hide', 'hide-lbl')}</div></section>`;
      h += `<h2 class="section-label">Your data</h2><section class="card list-card">`;
      h += navRow('backup', 'shield', 'green', 'Backup & restore', last ? 'Last backup file ' + U.ago(last) : 'No backup file saved yet', !last || Date.now() - last > 3 * 86400000 ? 'warn' : 'good');
      h += navRow('adjust', 'sliders', 'slate', 'Adjust balance', 'Match the app to your bank');
      h += `<label class="tx-row press" for="ml-file"><span class="tile c-orange">${ic('upload', 20)}</span><span class="tx-main"><span class="tx-title">Import from Money Lover</span><span class="tx-sub">Pick the CSV you exported. You’ll see a preview first</span></span><span class="chev">${ic('chevR', 18, 2)}</span><input type="file" id="ml-file" accept=".csv,text/csv,text/comma-separated-values" class="sr"></label>`;
      h += `</section>`;
      h += `<h2 class="section-label">Organise</h2><section class="card list-card">`;
      h += navRow('categories', 'more', 'blue', 'Categories', S.catsOf('expense').length + ' expense · ' + S.catsOf('income').length + ' income');
      h += navRow('recurring', 'repeat', 'purple', 'Recurring transactions', S.rec.filter((r) => !r.paused).length + ' active');
      h += `</section>`;
      h += `<h2 class="section-label">Preferences</h2><section class="card">`;
      h += `<div class="set-row"><span class="set-text"><b>Months run</b></span>${UI.seg('Months run', [{ id: 'calendar', label: '1st – end' }, { id: 'payday', label: 'Payday' }], st.monthMode === 'payday' ? 'payday' : 'calendar', 'month-mode', 'seg-sm')}</div>`;
      if (st.monthMode === 'payday') {
        const pd = S.payDay();
        h += `<div class="stepper-row"><span class="set-text"><b>Usual payday</b></span><div class="stepper" role="group" aria-label="Usual payday"><button type="button" class="step press" data-act="pay-day" data-d="-1" aria-label="Earlier"${pd <= 1 ? ' disabled' : ''}>${ic('minus', 18, 2.4)}</button><output aria-live="polite">${U.ordinal(pd)}</output><button type="button" class="step press" data-act="pay-day" data-d="1" aria-label="Later"${pd >= 31 ? ' disabled' : ''}>${ic('plus', 18, 2.4)}</button></div></div>`;
        const cur = S.mStart(U.today());
        h += `<p class="muted sm pad-t">Each month starts the day your <b>Salary</b> lands, so it holds a full pay cycle of bills. Until pay arrives, the ${U.ordinal(pd)} is assumed, or the Friday before if it’s a weekend. Months are named after the month they end in: this one is <b>${esc(S.mName(cur))}</b>, ${esc(S.mSpan(cur))}.</p>`;
      }
      h += `<div class="set-row bordered"><span class="set-text"><b>Week starts on</b></span>${UI.seg('Week start', [{ id: '1', label: 'Mon' }, { id: '0', label: 'Sun' }], String(st.weekStart), 'weekstart', 'seg-sm')}</div><div class="set-row bordered"><span class="set-text"><b>Currency</b></span><span class="muted">GBP (£)</span></div></section>`;
      h += `<p class="foot-note">Tally · version ${MT.VERSION}<br><span id="storage-status">Checking storage…</span></p>`;
      h += `</div>`;
      return h;
    },
    after(el) {
      UI.bindImport(el);
      MT.db.persisted().then((p) => {
        const s = el.querySelector('#storage-status');
        if (!s) return;
        if (MT.db.memory) s.textContent = 'Storage unavailable: preview mode';
        else s.textContent = p ? 'Protected storage is on: the browser won’t clear your data' : 'Install the app to your home screen to protect its storage';
      });
    }
  };
  function navRow(to, icon, color, title, sub, subKind) {
    return `<button class="tx-row press" data-act="go" data-to="${to}"><span class="tile c-${color}">${ic(icon, 20)}</span><span class="tx-main"><span class="tx-title">${esc(title)}</span><span class="tx-sub${subKind ? ' ' + subKind : ''}">${esc(sub)}</span></span><span class="chev">${ic('chevR', 18, 2)}</span></button>`;
  }
  function themeNote(t) {
    return t === 'system' ? 'Follows your phone’s setting, so it turns dark when your phone does.' : t === 'dark' ? 'Always dark, whatever your phone is set to.' : 'Always light, whatever your phone is set to.';
  }
  A.theme = async (el) => {
    const t = el.getAttribute('data-val');
    const wrap = el.closest('[data-seg]');
    UI.setSeg(wrap, Number(el.getAttribute('data-seg-i')));
    delete UI.segFrom.Theme;
    document.documentElement.classList.add('theming');
    UI.applyTheme(t);
    setTimeout(() => document.documentElement.classList.remove('theming'), 450);
    const note = document.getElementById('theme-note');
    if (note) note.textContent = themeNote(t);
    try {
      await S.setSetting('theme', t);
    } catch (e) {
      UI.error(e);
    }
  };
  A['set-hide'] = async (el) => {
    const on = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(on));
    try {
      await S.setSetting('hideOnOpen', on);
    } catch (e) {
      UI.error(e);
    }
  };
  A['month-mode'] = async (el) => {
    const v = el.getAttribute('data-val');
    try {
      if (v === 'payday' && !S.settings().payDayChosen) {
        const d = S.detectPayDay();
        if (d) await S.setSetting('payDay', d);
      }
      await S.setSetting('monthMode', v);
      UI.refresh();
    } catch (e) {
      UI.error(e);
    }
  };
  A['pay-day'] = async (el) => {
    const d = Math.min(31, Math.max(1, S.payDay() + Number(el.getAttribute('data-d'))));
    try {
      await S.setSetting('payDay', d);
      await S.setSetting('payDayChosen', true);
      UI.refresh();
    } catch (e) {
      UI.error(e);
    }
  };
  A.weekstart = async (el) => {
    try {
      await S.setSetting('weekStart', Number(el.getAttribute('data-val')));
      UI.refresh();
    } catch (e) {
      UI.error(e);
    }
  };

  /* ================= RECURRING ================= */
  UI.freqText = (r) => {
    const n = r.interval || 1;
    const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq] || 'month';
    const every = n === 1 ? { daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' }[r.freq] || 'monthly' : 'every ' + n + ' ' + unit + 's';
    const on = r.freq === 'weekly' ? ' on ' + U.dowLong(r.nextDate) + 's' : r.freq === 'monthly' ? ' on the ' + U.ordinal(r.anchor || Number(r.nextDate.slice(8))) : r.freq === 'yearly' ? ' on ' + U.fmtShortDate(r.nextDate) : '';
    return every + on;
  };
  UI.suggSel = new Set();
  V.recurring = {
    render() {
      let h = UI.subHeader('Recurring', `<button class="icon-btn filled press" data-act="new-rec" aria-label="Add recurring transaction">${ic('plus', 22, 2.2)}</button>`) + `<div class="stack">`;
      const sugg = X.recurringSuggestions();
      UI._sugg = sugg;
      Array.from(UI.suggSel).forEach((k) => {
        if (!sugg.find((x) => x.key === k)) UI.suggSel.delete(k);
      });
      const live = S.rec.filter((r) => !S.recEnded(r));
      const active = live.filter((r) => !r.paused).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
      const paused = live.filter((r) => r.paused);
      const ended = S.rec.filter(S.recEnded);
      if (!S.rec.length && !sugg.length) {
        h += UI.empty('repeat', 'Nothing recurring yet', 'Add bills and subscriptions once and they’ll be logged automatically on their due date.', `<button class="btn btn-primary press" data-act="new-rec">${ic('plus', 18, 2.2)} Add recurring</button>`);
        return h + '</div>';
      }
      if (active.length) {
        const out = active.filter((r) => r.type === 'expense').reduce((a, r) => a + S.monthlyEquivalent(r), 0);
        const inn = active.filter((r) => r.type === 'income').reduce((a, r) => a + S.monthlyEquivalent(r), 0);
        const next = active[0];
        const dn = U.daysBetween(U.today(), next.nextDate);
        h += `<section class="card pair"><div><span class="lbl">Out each month</span><span class="big">${U.fmt(out)}</span>${inn ? `<span class="tiny in">+${U.fmt(inn)} in</span>` : ''}</div><div class="divl"><span class="lbl">Next due</span><span class="mid">${esc(next.name)}</span><span class="tiny accent">${U.fmtDay(next.nextDate)}${dn > 1 ? ' · in ' + dn + ' days' : ''}</span></div></section>`;
      }
      if (sugg.length) {
        const n = UI.suggSel.size;
        const all = n === sugg.length;
        h += `<section class="card list-card sugg"><div class="card-head"><h2 class="card-title">${ic('spark', 18, 2)} Found in your history</h2><button class="link press" data-act="sugg-all">${all ? 'Clear' : 'Select all'}</button></div><p class="muted sm sugg-intro">These look like regular payments. Tick the ones to add, or tap one to check the details first.</p>`;
        h += sugg
          .map((g) => {
            const on = UI.suggSel.has(g.key);
            const sub = 'Monthly · next ' + U.fmtDay(g.nextDate) + (g.prevAmount ? ' · was ' + U.fmt(g.prevAmount) : '');
            return `<div class="sugg-row"><button class="check press${on ? ' on' : ''}" role="checkbox" aria-checked="${on}" data-act="sugg-toggle" data-key="${esc(g.key)}" aria-label="Select ${esc(g.name)}">${ic('check', 16, 3)}</button><button class="tx-row press" data-act="sugg-open" data-key="${esc(g.key)}">${UI.tile(S.cat(g.categoryId))}<span class="tx-main"><span class="tx-title">${esc(g.name)}</span><span class="tx-sub">${esc(sub)}</span></span><span class="${g.type === 'income' ? 'amt in' : 'amt'}">${g.type === 'income' ? '+' : '−'}${U.fmt(g.amount)}</span></button></div>`;
          })
          .join('');
        h += `<div class="btn-row sugg-actions"><button class="btn press" data-act="sugg-hide">Hide ${n ? 'the rest' : 'these'}</button><button class="btn btn-primary press" data-act="sugg-add"${n ? '' : ' disabled'}>${n ? 'Add ' + n : 'Tick to add'}</button></div></section>`;
      }
      if (active.length) h += `<h2 class="section-label">Active</h2><section class="card list-card">${active.map(recRow).join('')}</section>`;
      if (paused.length) h += `<h2 class="section-label">Paused</h2><section class="card list-card">${paused.map(recRow).join('')}</section>`;
      if (ended.length) h += `<h2 class="section-label">Finished</h2><section class="card list-card">${ended.map(recRow).join('')}</section>`;
      if (S.rec.length) h += `<p class="hint">${ic('info', 16, 1.9)} Each one is logged automatically on its due date, the next time you open the app. Tap one to change the amount, frequency or dates, pause it, or delete it.</p>`;
      return h + `</div>`;
    }
  };
  function recRow(r) {
    const c = S.cat(r.categoryId);
    const ended = S.recEnded(r);
    const when = UI.freqText(r) + (r.endDate && !ended ? ' · until ' + U.fmtShortDate(r.endDate) + ' ' + r.endDate.slice(0, 4) : '');
    return `<button class="tx-row press${r.paused || ended ? ' dim' : ''}" data-act="edit-rec" data-id="${esc(r.id)}">${UI.tile(c)}<span class="tx-main"><span class="tx-title">${esc(r.name)}</span><span class="tx-sub">${esc(c.name)} · ${esc(when)}</span></span><span class="tx-end"><span class="${r.type === 'income' ? 'amt in' : 'amt'}">${r.type === 'income' ? '+' : '−'}${U.fmt(r.amount)}</span><span class="tiny">${ended ? 'Ended' : r.paused ? 'Paused' : U.fmtDay(r.nextDate)}</span></span></button>`;
  }
  A['new-rec'] = () => MT.sheets.recurringForm(null);
  A['edit-rec'] = (el) => MT.sheets.recurringForm(S.rec.find((r) => r.id === el.getAttribute('data-id')));
  A['sugg-toggle'] = (el) => {
    const k = el.getAttribute('data-key');
    if (UI.suggSel.has(k)) UI.suggSel.delete(k);
    else UI.suggSel.add(k);
    UI.refresh();
  };
  A['sugg-all'] = () => {
    const list = UI._sugg || [];
    if (UI.suggSel.size === list.length) UI.suggSel.clear();
    else list.forEach((g) => UI.suggSel.add(g.key));
    UI.refresh();
  };
  A['sugg-open'] = (el) => {
    const g = (UI._sugg || []).find((x) => x.key === el.getAttribute('data-key'));
    if (g) MT.sheets.recurringForm(null, g);
  };
  A['sugg-add'] = async (el) => {
    const picks = (UI._sugg || []).filter((g) => UI.suggSel.has(g.key));
    if (!picks.length) return;
    el.disabled = true;
    try {
      const added = await S.addRecurringBatch(picks);
      UI.suggSel.clear();
      UI.toast('Added ' + added.length + ' recurring payment' + (added.length === 1 ? '' : 's'), {
        action: 'Undo',
        onAction: async () => {
          for (const r of added) await S.deleteRecurring(r.id);
          UI.toast('Removed them again');
        }
      });
    } catch (e) {
      el.disabled = false;
      UI.error(e);
    }
  };
  A['sugg-hide'] = async () => {
    const keys = (UI._sugg || []).filter((g) => !UI.suggSel.has(g.key)).map((g) => g.key);
    const before = S.meta.dismissedRec || [];
    try {
      await S.setMeta('dismissedRec', before.concat(keys).slice(-500));
      UI.refresh();
      UI.toast('Hidden ' + keys.length + ' suggestion' + (keys.length === 1 ? '' : 's'), {
        action: 'Undo',
        onAction: async () => {
          await S.setMeta('dismissedRec', before);
          UI.refresh();
        }
      });
    } catch (e) {
      UI.error(e);
    }
  };

  /* ================= CATEGORIES ================= */
  UI.catState = { tab: 'expense', edit: false };
  V.categories = {
    render() {
      const st = UI.catState;
      let h = UI.subHeader('Categories', `<button class="btn btn-sm ${st.edit ? 'btn-primary' : 'btn-soft'} press" data-act="cat-edit" aria-pressed="${st.edit}">${st.edit ? 'Done' : 'Edit'}</button>`) + `<div class="stack">`;
      h += UI.seg('Category type', [{ id: 'expense', label: 'Expense · ' + S.catsOf('expense').length }, { id: 'income', label: 'Income · ' + S.catsOf('income').length }], st.tab, 'cat-tab');
      h += `<button class="btn btn-dashed press" data-act="cat-new">${ic('plus', 18, 2.2)} New ${st.tab} category</button>`;
      const month = U.monthStart(U.today());
      const counts = {};
      S.tx.forEach((t) => (counts[t.categoryId] = (counts[t.categoryId] || 0) + 1));
      h += `<section class="card list-card">`;
      h += S.catsOf(st.tab)
        .map((c) => {
          const n = counts[c.id] || 0;
          const sub = n ? n + ' transaction' + (n === 1 ? '' : 's') : 'Not used yet';
          const left = st.edit && !c.builtIn ? `<button class="minus press" data-act="cat-remove" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}"><span></span></button>` : '';
          const right = c.builtIn ? `<span class="badge">${ic('lock', 13, 2)} Built-in</span>` : st.edit ? '' : `<span class="chev">${ic('chevR', 18, 2)}</span>`;
          return `<div class="cat-row${st.edit ? ' editing' : ''}">${left}<button class="tx-row press" data-act="cat-open" data-id="${esc(c.id)}">${UI.tile(c)}<span class="tx-main"><span class="tx-title">${esc(c.name)}</span><span class="tx-sub">${sub}</span></span>${right}</button></div>`;
        })
        .join('');
      h += `</section><p class="hint">${ic('lock', 16, 1.9)} Built-in categories handle transfers and catch transactions from categories you remove, so they can’t be removed. You can still rename or recolour them.</p>`;
      void month;
      return h + `</div>`;
    }
  };
  A['cat-edit'] = () => {
    UI.catState.edit = !UI.catState.edit;
    UI.refresh();
  };
  A['cat-tab'] = (el) => {
    UI.catState.tab = el.getAttribute('data-val');
    UI.refresh();
  };
  A['cat-new'] = () => MT.sheets.categoryForm(null, UI.catState.tab);
  A['cat-open'] = (el) => MT.sheets.categoryForm(S.cats.find((c) => c.id === el.getAttribute('data-id')), UI.catState.tab);
  A['cat-remove'] = async (el) => {
    const c = S.cats.find((x) => x.id === el.getAttribute('data-id'));
    if (!c) return;
    const n = S.tx.filter((t) => t.categoryId === c.id).length;
    const fb = S.cat(S.fallbackFor(c.type)).name;
    const ok = await UI.confirm({
      title: 'Remove ' + c.name + '?',
      body: n ? `Nothing is deleted. Its ${n} transaction${n === 1 ? '' : 's'} move to <b>${esc(fb)}</b>, and you can undo straight after.` : `It hasn’t been used yet. You can undo straight after.`,
      ok: 'Remove',
      danger: true
    });
    if (!ok) return;
    try {
      const info = await S.removeCategory(c.id);
      UI.toast('Removed ' + c.name, {
        action: 'Undo',
        onAction: async () => {
          try {
            await S.undoRemoveCategory(info);
            UI.toast('Restored ' + c.name);
          } catch (e) {
            UI.error(e);
          }
        }
      });
    } catch (e) {
      UI.error(e);
    }
  };

  /* ================= ADJUST BALANCE ================= */
  V.adjust = {
    render() {
      const bal = S.balance();
      let h = UI.subHeader('Adjust balance') + `<div class="stack">`;
      h += `<p class="muted">Enter what your bank shows right now. The difference is logged as a balance adjustment, so your history still adds up. Adjustments don’t count as spending or income in your charts.</p>`;
      h += `<section class="card"><div class="set-row"><span class="set-text"><span class="lbl">Recorded in the app</span><b class="big">${U.fmt(bal)}</b></span><span class="tile c-blue">${ic('wallet', 20)}</span></div>`;
      h += `<label class="field-block" for="adj-in"><span class="lbl">Actual balance</span><span class="money-input"><span>£</span><input id="adj-in" inputmode="decimal" autocomplete="off" placeholder="${U.penceToInput(Math.abs(bal))}" enterkeyhint="done"></span></label>`;
      h += `<label class="field-inline" for="adj-neg"><input type="checkbox" id="adj-neg"${bal < 0 ? ' checked' : ''}> My account is overdrawn (minus)</label>`;
      h += `<div class="set-row bordered"><span class="lbl">Difference</span><b class="mid" id="adj-diff">—</b></div></section>`;
      h += `<div id="adj-preview"></div>`;
      h += `<label class="field" for="adj-note">${ic('note', 18, 1.9)}<input id="adj-note" placeholder="Note (optional)" autocomplete="off"></label>`;
      h += `<button class="btn btn-primary btn-lg press" data-act="adj-apply" id="adj-apply" disabled>Enter your balance</button></div>`;
      return h;
    },
    after(el) {
      const inp = el.querySelector('#adj-in');
      const neg = el.querySelector('#adj-neg');
      const upd = () => {
        const p = U.parseMoney(inp.value);
        const btn = el.querySelector('#adj-apply');
        const diffEl = el.querySelector('#adj-diff');
        const prev = el.querySelector('#adj-preview');
        if (p == null) {
          diffEl.textContent = inp.value.trim() ? 'Check the amount' : '—';
          prev.innerHTML = '';
          btn.disabled = true;
          btn.textContent = 'Enter your balance';
          UI.adjDiff = null;
          return;
        }
        const actual = neg.checked ? -p : p;
        const diff = actual - S.balance();
        UI.adjDiff = diff;
        diffEl.textContent = U.fmt(diff, { plus: true });
        diffEl.className = 'mid' + (diff > 0 ? ' in' : '');
        if (!diff) {
          prev.innerHTML = `<p class="note-box">Your balance already matches. Nothing to log.</p>`;
          btn.disabled = true;
          btn.textContent = 'Nothing to apply';
        } else {
          prev.innerHTML = `<h2 class="section-label">This will be logged as</h2><section class="card list-card"><div class="tx-row static"><span class="tile c-slate">${ic('sliders', 20)}</span><span class="tx-main"><span class="tx-title">Balance adjustment</span><span class="tx-sub">${diff < 0 ? 'Money out' : 'Money in'} · Today</span></span><span class="${diff > 0 ? 'amt in' : 'amt'}">${U.fmt(diff, { plus: true })}</span></div></section>`;
          btn.disabled = false;
          btn.textContent = 'Apply adjustment';
        }
      };
      inp.addEventListener('input', upd);
      neg.addEventListener('change', upd);
      upd();
    }
  };
  A['adj-apply'] = async (el) => {
    const diff = UI.adjDiff;
    if (!diff) return;
    el.disabled = true;
    try {
      const note = document.getElementById('adj-note').value;
      const t = await S.saveTx({ type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), categoryId: 'adjust', name: 'Balance adjustment', note: note, date: U.today() });
      U.vibrate(10);
      UI.back();
      UI.toast('Balance updated to ' + U.fmt(S.balance()), {
        action: 'Undo',
        onAction: async () => {
          await S.deleteTx(t.id);
          UI.toast('Adjustment removed');
        }
      });
    } catch (e) {
      el.disabled = false;
      UI.error(e);
    }
  };

  /* ================= BACKUP ================= */
  V.backup = {
    render() {
      const last = S.meta.lastFileBackup;
      const fresh = last && Date.now() - last < 3 * 86400000;
      let h = UI.subHeader('Backup & restore') + `<div class="stack">`;
      h += `<section class="card center"><span class="tile tile-xl c-${fresh ? 'green' : 'amber'}">${ic(fresh ? 'shield' : 'alert', 30, 1.8)}</span><h2 class="card-title">${fresh ? 'Your data is backed up' : last ? 'Time for a fresh backup' : 'Save your first backup'}</h2><p class="muted sm">${last ? 'Last backup file: ' + U.ago(last) : 'No backup file yet'}</p><button class="btn btn-primary btn-lg press wide" data-act="backup-now">${ic('download', 18, 2)} Save backup file</button>${navigator.canShare ? `<button class="btn btn-soft press wide" data-act="backup-share">${ic('share', 18, 2)} Send backup to another app</button>` : ''}</section>`;
      h += `<h2 class="section-label">How your data is protected</h2><section class="card list-card">`;
      h += infoRow('phone', 'Saved the moment you tap Save', 'Every entry is written to this phone’s storage before the app says “Saved”.');
      h += infoRow('history', 'Daily snapshots inside the app', 'A copy is taken each day you use the app. The last 30 are kept below.');
      h += infoRow('file', 'Backup files you keep', 'A dated file saved to your phone’s Downloads folder, separate from the app. Keep a copy somewhere else too if you can.');
      h += `</section>`;
      h += `<h2 class="section-label">Restore or export</h2><section class="card list-card">`;
      h += `<label class="tx-row press" for="restore-file"><span class="tile c-blue">${ic('upload', 20)}</span><span class="tx-main"><span class="tx-title">Restore from a backup file</span><span class="tx-sub">You’ll see a preview before anything changes</span></span><span class="chev">${ic('chevR', 18, 2)}</span><input type="file" id="restore-file" accept="application/json,.json" class="sr"></label>`;
      h += `<label class="tx-row press" for="ml-file"><span class="tile c-orange">${ic('upload', 20)}</span><span class="tx-main"><span class="tx-title">Import from Money Lover</span><span class="tx-sub">Pick the CSV you exported. You’ll see a preview first</span></span><span class="chev">${ic('chevR', 18, 2)}</span><input type="file" id="ml-file" accept=".csv,text/csv,text/comma-separated-values" class="sr"></label>`;
      h += `<button class="tx-row press" data-act="export-csv"><span class="tile c-teal">${ic('file', 20)}</span><span class="tx-main"><span class="tx-title">Export as spreadsheet (CSV)</span><span class="tx-sub">Opens in Google Sheets or Excel</span></span><span class="chev">${ic('chevR', 18, 2)}</span></button>`;
      h += `</section><h2 class="section-label">Snapshots on this phone</h2><section class="card list-card" id="snap-list"><p class="muted pad">Loading…</p></section>`;
      return h + `</div>`;
    },
    after(el) {
      UI.bindImport(el);
      UI.bindRestore(el);
      S.listSnapshots()
        .then((snaps) => {
          const box = el.querySelector('#snap-list');
          if (!box) return;
          if (!snaps.length) {
            box.innerHTML = `<p class="muted pad">The first snapshot is taken tomorrow, once you have some entries.</p>`;
            return;
          }
          box.innerHTML = snaps
            .map(
              (s) =>
                `<div class="tx-row static"><span class="tile c-slate">${ic(s.kind === 'daily' ? 'history' : 'shield', 20)}</span><span class="tx-main"><span class="tx-title">${s.kind === 'daily' ? U.fmtDay(U.iso(new Date(s.createdAt))) : 'Before restore · ' + U.fmtDay(U.iso(new Date(s.createdAt)))}</span><span class="tx-sub">${s.count} entries · balance ${U.fmt(s.balance)}</span></span><button class="btn btn-sm btn-soft press" data-act="snap-restore" data-id="${esc(s.id)}">Restore</button></div>`
            )
            .join('');
        })
        .catch(() => {});
    }
  };
  function infoRow(icon, title, body) {
    return `<div class="tx-row static top"><span class="tile c-blue tile-sm">${ic(icon, 18)}</span><span class="tx-main"><span class="tx-title">${esc(title)}</span><span class="tx-sub wrap">${esc(body)}</span></span></div>`;
  }
  function stamp() {
    const d = new Date();
    return U.iso(d) + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  }
  function backupBlob() {
    return new Blob([JSON.stringify(S.exportData(), null, 1)], { type: 'application/json' });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  }
  A['backup-now'] = async () => {
    try {
      download(backupBlob(), 'tally-backup-' + stamp() + '.json');
      await S.setMeta('lastFileBackup', Date.now());
      UI.toast('Backup file saved to Downloads');
      UI.refresh();
    } catch (e) {
      UI.error(e);
    }
  };
  A['backup-share'] = async () => {
    try {
      const file = new File([backupBlob()], 'tally-backup-' + stamp() + '.json', { type: 'application/json' });
      if (!navigator.canShare || !navigator.canShare({ files: [file] })) throw new Error('Sharing files isn’t available here. Use “Save backup file” instead.');
      await navigator.share({ files: [file], title: 'Tally backup' });
      await S.setMeta('lastFileBackup', Date.now());
      UI.toast('Backup sent');
      UI.refresh();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      UI.error(e);
    }
  };
  A['export-csv'] = () => {
    try {
      download(new Blob(['﻿' + S.toCSV()], { type: 'text/csv' }), 'tally-' + U.today() + '.csv');
      UI.toast('Spreadsheet saved to Downloads');
    } catch (e) {
      UI.error(e);
    }
  };
  A['snap-restore'] = async (el) => {
    try {
      const snaps = await S.listSnapshots();
      const s = snaps.find((x) => x.id === el.getAttribute('data-id'));
      if (!s) throw new Error('That snapshot is no longer available.');
      const v = S.validateImport(s.data);
      if (!v.ok) throw new Error(v.error);
      MT.sheets.restorePreview(v, 'Snapshot from ' + U.fmtDay(U.iso(new Date(s.createdAt))));
    } catch (e) {
      UI.error(e);
    }
  };

  /* Restore from a backup file: always previewed before anything changes */
  UI.bindRestore = (root) => {
    const inp = root.querySelector('#restore-file');
    if (!inp) return;
    inp.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const text = await f.text();
        let obj;
        try {
          obj = JSON.parse(text);
        } catch (err) {
          throw new Error('That file couldn’t be read. Pick a .json backup saved from this app.');
        }
        const v = S.validateImport(obj);
        if (!v.ok) throw new Error(v.error);
        if (UI.sheets.length) await UI.closeSheet();
        MT.sheets.restorePreview(v, f.name);
      } catch (err) {
        UI.error(err);
      }
    });
  };

  /* Money Lover import: read the file on the phone, then show a preview */
  UI.bindImport = (root) => {
    const inp = root.querySelector('#ml-file');
    if (!inp) return;
    inp.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        if (/\.json$/i.test(f.name)) throw new Error('That’s a backup file. Use “Restore from a backup file” in Backup & restore instead.');
        const res = MT.importer.fromMoneyLover(await f.text());
        if (!res.ok) throw new Error(res.error);
        if (UI.sheets.length) await UI.closeSheet();
        MT.sheets.importPreview(res, f.name);
      } catch (err) {
        UI.error(err);
      }
    });
  };

  /* quick add & edit entry points */
  A['quick-add'] = (el) => {
    U.vibrate(6);
    const date = el && el.getAttribute && el.getAttribute('data-date');
    MT.sheets.txForm(null, date ? { date: date } : null);
  };
  A['edit-tx'] = (el) => {
    const t = S.tx.find((x) => x.id === el.getAttribute('data-id'));
    if (!t) return UI.toast('That entry no longer exists', { kind: 'error' });
    if (UI.route.name === 'search') UI.rememberSearch(UI.search.q);
    MT.sheets.txForm(t);
  };

})();
