/* Money Tracker — app shell: routing with real back-button support, view transitions, sheets, toasts, shared components */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const UI = (MT.ui = {
    route: { name: 'home', params: {} },
    sheets: [],
    segFrom: {},
    actions: {},
    views: {},
    hideBalance: false
  });
  const TOP = ['home', 'activity', 'insights', 'more'];
  const $ = (s, r) => (r || document).querySelector(s);
  UI.$ = $;
  UI.TOP = TOP;

  /* ---------- Theme ---------- */
  const hostTheme = MT.PREVIEW ? document.documentElement.getAttribute('data-theme') : null;
  UI.applyTheme = (theme) => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else if (hostTheme) root.setAttribute('data-theme', hostTheme);
    else root.removeAttribute('data-theme');
    requestAnimationFrame(() => {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        m.setAttribute('content', bg);
        m.removeAttribute('media');
      });
    });
  };

  /* ---------- Rendering ---------- */
  UI.render = (opts) => {
    const o = opts || {};
    const v = UI.views[UI.route.name] || UI.views.home;
    const el = $('#view');
    const y = window.scrollY;
    UI.entering = !!o.entering;
    el.innerHTML = v.render(UI.route.params || {});
    el.setAttribute('data-route', UI.route.name);
    renderTabs();
    if (v.after) v.after(el, UI.route.params || {});
    MT.charts.mount(el);
    animateSegs(el);
    if (o.keepScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    UI.entering = false;
  };
  UI.refresh = () => {
    if (!MT.store.ready) return;
    UI.render({ keepScroll: true });
    const top = UI.sheets[UI.sheets.length - 1];
    if (top && top.opts.onStoreChange) top.opts.onStoreChange(top.el);
  };

  function viewTransition(fn, dir) {
    if (document.startViewTransition && !U.reducedMotion()) {
      document.documentElement.setAttribute('data-dir', dir || 'fwd');
      try {
        document.startViewTransition(fn);
        return;
      } catch (e) {}
    }
    fn();
  }

  UI.go = (name, params, how) => {
    const route = { name: name, params: params || {} };
    if (how === 'replace') history.replaceState({ route: route }, '');
    else history.pushState({ route: route }, '');
    const dir = TOP.indexOf(name) >= 0 && TOP.indexOf(UI.route.name) >= 0 ? (TOP.indexOf(name) > TOP.indexOf(UI.route.name) ? 'right' : 'left') : 'fwd';
    viewTransition(() => {
      UI.route = route;
      UI.render({ entering: true });
    }, dir);
  };
  UI.back = () => history.back();

  UI.tab = (name) => {
    if (name === UI.route.name) {
      window.scrollTo({ top: 0, behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    if (name === 'home') {
      if (history.state && history.state.route && history.state.route.name !== 'home' && UI.pushedFromHome) return history.back();
      return UI.go('home', {}, 'replace');
    }
    if (UI.route.name === 'home') {
      UI.pushedFromHome = true;
      UI.go(name, {}, 'push');
    } else UI.go(name, {}, 'replace');
  };

  window.addEventListener('popstate', (e) => {
    if (UI.sheets.length) {
      closeTopSheetDom();
      return;
    }
    const st = e.state;
    if (st && st.route) {
      if (st.route.name === 'home') UI.pushedFromHome = false;
      const from = UI.route.name;
      viewTransition(() => {
        UI.route = st.route;
        UI.render({ entering: true });
      }, TOP.indexOf(from) >= 0 && TOP.indexOf(st.route.name) >= 0 ? 'left' : 'back');
    }
  });

  /* ---------- Tab bar ---------- */
  function renderTabs() {
    const nav = $('#tabs');
    const name = UI.route.name;
    const show = TOP.indexOf(name) >= 0;
    nav.hidden = !show;
    document.body.classList.toggle('has-tabs', show);
    if (!show) return;
    const item = (to, icon, label) =>
      `<button class="tab${name === to ? ' on' : ''}" data-act="tab" data-to="${to}"${name === to ? ' aria-current="page"' : ''}>${U.icon(icon, 22, 1.9)}<span>${label}</span></button>`;
    nav.innerHTML =
      item('home', 'home', 'Home') +
      item('activity', 'list', 'Activity') +
      `<button class="fab press" data-act="quick-add" aria-label="Add transaction">${U.icon('plus', 26, 2.2)}</button>` +
      item('insights', 'insights', 'Insights') +
      item('more', 'more', 'More');
  }

  /* ---------- Segmented controls: animate the pill between re-renders ---------- */
  UI.seg = (key, options, current, act, extra) => {
    const i = Math.max(0, options.findIndex((o) => o.id === current));
    return (
      `<div class="seg${extra ? ' ' + extra : ''}" role="group" aria-label="${U.esc(key)}" data-seg="${U.esc(key)}" style="--n:${options.length};--i:${i}"><span class="seg-pill" aria-hidden="true"></span>` +
      options
        .map(
          (o, j) =>
            `<button type="button" data-act="${act}" data-val="${U.esc(o.id)}" data-seg-i="${j}" data-seg-key="${U.esc(key)}" aria-pressed="${o.id === current}">${o.icon ? U.icon(o.icon, 16, 2) : ''}${U.esc(o.label)}</button>`
        )
        .join('') +
      `</div>`
    );
  };
  UI.noteSeg = (el) => {
    const key = el.getAttribute('data-seg-key');
    const wrap = el.closest('[data-seg]');
    if (key && wrap) UI.segFrom[key] = Number(getComputedStyle(wrap).getPropertyValue('--i')) || 0;
  };
  function animateSegs(root) {
    root.querySelectorAll('[data-seg]').forEach((w) => {
      const key = w.getAttribute('data-seg');
      if (!(key in UI.segFrom)) return;
      const from = UI.segFrom[key];
      delete UI.segFrom[key];
      const to = w.style.getPropertyValue('--i');
      if (String(from) === String(to)) return;
      const pill = w.querySelector('.seg-pill');
      pill.style.transition = 'none';
      w.style.setProperty('--i', from);
      void pill.offsetWidth;
      pill.style.transition = '';
      w.style.setProperty('--i', to);
    });
  }
  UI.animateSegs = animateSegs;
  /* move a segmented control in place without re-rendering */
  UI.setSeg = (wrap, index) => {
    if (!wrap) return;
    delete UI.segFrom[wrap.getAttribute('data-seg')];
    wrap.style.setProperty('--i', index);
    wrap.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === index)));
  };

  /* ---------- Small components ---------- */
  UI.tile = (cat, size) =>
    `<span class="tile c-${U.esc(cat.color || 'slate')}${size ? ' tile-' + size : ''}">${U.icon(cat.icon, size === 'sm' ? 18 : size === 'lg' ? 24 : 20)}</span>`;
  UI.switch = (id, on, act, labelledby) =>
    `<button type="button" class="switch" role="switch" id="${id}" aria-checked="${on ? 'true' : 'false'}" data-act="${act}"${labelledby ? ` aria-labelledby="${labelledby}"` : ''}><span class="knob" aria-hidden="true"></span></button>`;
  UI.subHeader = (title, right) =>
    `<header class="subhead appbar"><button class="icon-btn" data-act="back" aria-label="Back">${U.icon('back', 22, 2)}</button><h1>${U.esc(title)}</h1><div class="subhead-r">${right || ''}</div></header>`;
  UI.empty = (icon, title, body, actionHtml) =>
    `<div class="empty">${U.icon(icon, 28, 1.6)}<p class="empty-t">${U.esc(title)}</p><p class="empty-b">${U.esc(body)}</p>${actionHtml || ''}</div>`;
  UI.amountClass = (t) => (t.type === 'income' ? 'amt in' : 'amt');
  UI.txRow = (t, opts) => {
    const o = opts || {};
    const S = MT.store;
    const c = S.cat(t.categoryId);
    const title = t.name || c.name;
    const sub = [];
    if (t.name) sub.push(c.name);
    if (o.showDate) sub.push(U.fmtDay(t.date));
    if (t.recurringId) sub.push('Recurring');
    if (t.excluded) sub.push('Not in reports');
    if (t.date > U.today()) sub.push('Upcoming');
    return `<button class="tx-row press" data-act="edit-tx" data-id="${U.esc(t.id)}">${UI.tile(c)}<span class="tx-main"><span class="tx-title">${o.titleHtml || U.esc(title)}</span>${sub.length ? `<span class="tx-sub">${U.esc(sub.join(' · '))}</span>` : ''}${o.noteHtml || ''}</span><span class="${UI.amountClass(t)}">${U.fmtSigned(t)}</span></button>`;
  };

  /* ---------- Sheets (bottom sheets that respect the Android back button) ---------- */
  UI.openSheet = (opts) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="scrim" data-act="sheet-close"></div><section class="sheet${opts.full ? ' full' : ''}${opts.cls ? ' ' + opts.cls : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(opts.label || 'Panel')}"><div class="grab-zone" aria-hidden="true"><div class="grab"></div></div><div class="sheet-body"></div></section>`;
    const body = wrap.querySelector('.sheet-body');
    body.innerHTML = opts.render();
    $('#layer').appendChild(wrap);
    const entry = { el: wrap, opts: opts };
    UI.sheets.push(entry);
    document.body.classList.add('locked');
    history.pushState({ route: UI.route, sheet: true }, '');
    if (opts.after) opts.after(wrap.querySelector('.sheet'));
    MT.charts.mount(wrap);
    animateSegs(wrap);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => wrap.classList.add('open'));
    });
    const focusEl = wrap.querySelector('[autofocus]') || wrap.querySelector('.sheet');
    setTimeout(() => {
      try {
        focusEl.focus({ preventScroll: true });
      } catch (e) {}
    }, 60);
    return entry;
  };
  UI.rerenderSheet = (entry) => {
    const body = entry.el.querySelector('.sheet-body');
    body.innerHTML = entry.opts.render();
    if (entry.opts.after) entry.opts.after(entry.el.querySelector('.sheet'));
    MT.charts.mount(entry.el);
    animateSegs(entry.el);
  };
  let closeResolvers = [];
  function closeTopSheetDom() {
    const entry = UI.sheets.pop();
    if (!entry) return;
    entry.el.classList.remove('open');
    entry.el.classList.add('closing');
    if (entry.opts.onClose) {
      try {
        entry.opts.onClose();
      } catch (e) {}
    }
    setTimeout(() => entry.el.remove(), U.reducedMotion() ? 0 : 280);
    if (!UI.sheets.length) document.body.classList.remove('locked');
    const r = closeResolvers;
    closeResolvers = [];
    r.forEach((fn) => fn());
  }
  UI.closeSheet = () =>
    new Promise((resolve) => {
      if (!UI.sheets.length) return resolve();
      closeResolvers.push(resolve);
      history.back();
    });
  UI.topSheet = () => UI.sheets[UI.sheets.length - 1];

  /* Pull a sheet down to close it. Drag from the handle or the sheet's header: it follows your finger,
     and letting go past a quarter of the way (or with a quick flick) closes it, taking you back to the
     page you were on. A short pull springs back. */
  (function () {
    const ZONES = '.grab-zone, .qa-head, .qa-amount, .sheet-title, .txa-head';
    let d = null;
    let swallowUntil = 0;
    document.addEventListener(
      'pointerdown',
      (e) => {
        d = null;
        const top = UI.topSheet();
        if (!top || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const sheet = top.el.querySelector('.sheet');
        if (!sheet || !sheet.contains(e.target) || !e.target.closest(ZONES)) return;
        const body = sheet.querySelector('.sheet-body');
        if (body && body.contains(e.target) && body.scrollTop > 2) return; /* scrolled down: let it scroll */
        d = { id: e.pointerId, x: e.clientX, y: e.clientY, off: 0, lock: null, sheet: sheet, wrap: top.el, entry: top, last: [e.clientY, e.timeStamp], v: 0 };
      },
      true
    );
    document.addEventListener(
      'pointermove',
      (e) => {
        if (!d || e.pointerId !== d.id) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (d.lock === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          d.lock = dy > 0 && Math.abs(dy) > Math.abs(dx) ? 'y' : 'no';
          if (d.lock !== 'y') return;
          d.sheet.style.transition = 'none';
          d.scrim = d.wrap.querySelector('.scrim');
          if (d.scrim) d.scrim.style.transition = 'none';
          const a = document.activeElement;
          if (a && d.sheet.contains(a) && a.blur && a.tagName === 'INPUT') a.blur();
        }
        if (d.lock !== 'y') return;
        d.off = Math.max(0, dy);
        d.v = (e.clientY - d.last[0]) / Math.max(1, e.timeStamp - d.last[1]);
        d.last = [e.clientY, e.timeStamp];
        d.sheet.style.transform = 'translateY(' + d.off + 'px)';
        if (d.scrim) d.scrim.style.opacity = String(Math.max(0, 1 - d.off / (d.sheet.offsetHeight || 1)));
      },
      { passive: true }
    );
    const end = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const s = d;
      d = null;
      if (s.lock !== 'y') return;
      swallowUntil = Date.now() + 400;
      const h = s.sheet.offsetHeight || 1;
      const go = e.type !== 'pointercancel' && (s.off > h * 0.25 || (s.v > 0.5 && s.off > 24));
      if (go && UI.topSheet() === s.entry) {
        s.sheet.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)';
        s.sheet.style.transform = 'translateY(' + (h + 24) + 'px)';
        if (s.scrim) {
          s.scrim.style.transition = 'opacity .22s';
          s.scrim.style.opacity = '0';
        }
        U.vibrate(6);
        UI.closeSheet();
        return;
      }
      s.sheet.style.transition = 'transform .32s var(--ease)';
      s.sheet.style.transform = '';
      if (s.scrim) {
        s.scrim.style.transition = 'opacity .32s';
        s.scrim.style.opacity = '';
      }
      setTimeout(() => {
        s.sheet.style.transition = '';
        if (s.scrim) s.scrim.style.transition = '';
      }, 340);
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    /* the lift at the end of a pull isn't a tap on whatever is under the finger */
    document.addEventListener(
      'click',
      (e) => {
        if (Date.now() > swallowUntil) return;
        swallowUntil = 0;
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
  })();

  /* ---------- Toast ---------- */
  let toastTimer = null;
  UI.toast = (msg, opts) => {
    const o = opts || {};
    const root = $('#toast-root');
    clearTimeout(toastTimer);
    root.innerHTML = `<div class="toast${o.kind === 'error' ? ' error' : ''}" role="status">${o.kind === 'error' ? U.icon('alert', 18, 2) : U.icon('check', 18, 2.4)}<span class="toast-msg">${U.esc(msg)}</span>${o.action ? `<button class="toast-btn" data-act="toast-action">${U.esc(o.action)}</button>` : ''}</div>`;
    UI._toastAction = o.onAction || null;
    requestAnimationFrame(() => root.firstChild && root.firstChild.classList.add('show'));
    toastTimer = setTimeout(UI.hideToast, o.duration || (o.action ? 5000 : 2600));
  };
  UI.hideToast = () => {
    const t = $('#toast-root').firstChild;
    if (!t) return;
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
    UI._toastAction = null;
  };
  UI.actions['toast-action'] = () => {
    const fn = UI._toastAction;
    UI.hideToast();
    if (fn) fn();
  };
  UI.error = (e) => UI.toast((e && e.message) || 'Something went wrong. Nothing was changed.', { kind: 'error', duration: 4000 });

  /* ---------- Confirm (in-page, since dialogs are blocked in some contexts) ---------- */
  UI.confirm = (o) =>
    new Promise((resolve) => {
      let answered = false;
      UI.openSheet({
        label: o.title,
        cls: 'confirm',
        render: () =>
          `<h2 class="sheet-title">${U.esc(o.title)}</h2>${o.body ? `<p class="sheet-text">${o.body}</p>` : ''}<div class="btn-row"><button class="btn" data-act="confirm-no">Cancel</button><button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm-yes">${U.esc(o.ok || 'Confirm')}</button></div>`,
        after: (sheet) => {
          sheet.querySelector('[data-act="confirm-yes"]').onclick = (e) => {
            e.stopPropagation();
            answered = true;
            UI.closeSheet().then(() => resolve(true));
          };
          sheet.querySelector('[data-act="confirm-no"]').onclick = (e) => {
            e.stopPropagation();
            UI.closeSheet();
          };
        },
        onClose: () => {
          if (!answered) resolve(false);
        }
      });
    });

  /* ---------- Global event delegation ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = UI.actions[el.getAttribute('data-act')];
    if (!fn) return;
    e.preventDefault();
    if (el.hasAttribute('data-seg-key')) UI.noteSeg(el);
    fn(el, e);
  });
  /* Buttons marked data-lift act the moment your finger lifts off them. After a swipe, the phone's
     browser can go a second or more without turning a press into a "click" (confirmed with an
     on-screen tap test), so these buttons don't wait for it. The click that may follow from the same press is ignored. */
  (function () {
    let down = null;
    let ran = null;
    document.addEventListener(
      'pointerdown',
      (e) => {
        const b = e.target.closest && e.target.closest('[data-lift]');
        down = b && (e.pointerType !== 'mouse' || e.button === 0) ? { el: b, id: e.pointerId, x: e.clientX, y: e.clientY } : null;
      },
      true
    );
    document.addEventListener(
      'pointermove',
      (e) => {
        if (down && e.pointerId === down.id && (Math.abs(e.clientX - down.x) > 10 || Math.abs(e.clientY - down.y) > 10)) down = null;
      },
      true
    );
    document.addEventListener('pointercancel', () => (down = null), true);
    document.addEventListener(
      'pointerup',
      (e) => {
        if (!down || e.pointerId !== down.id) return;
        const b = down.el;
        down = null;
        const over = e.target.closest && e.target.closest('[data-lift]');
        if (over !== b || b.disabled || !document.body.contains(b)) return;
        const fn = UI.actions[b.getAttribute('data-act')];
        if (!fn) return;
        ran = { at: Date.now(), x: e.clientX, y: e.clientY };
        fn(b, e);
      },
      true
    );
    document.addEventListener(
      'click',
      (e) => {
        /* only the click from that same press: same spot, straight after. Taps elsewhere go through */
        if (!ran) return;
        const same = Date.now() - ran.at < 600 && Math.abs(e.clientX - ran.x) < 24 && Math.abs(e.clientY - ran.y) < 24;
        ran = null;
        if (!same) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
  })();
  UI.actions.tab = (el) => UI.tab(el.getAttribute('data-to'));
  UI.actions.back = () => UI.back();
  UI.actions.go = (el) => {
    let params = {};
    try {
      params = JSON.parse(el.getAttribute('data-params') || '{}');
    } catch (e) {}
    UI.go(el.getAttribute('data-to'), params);
  };
  UI.actions['sheet-close'] = () => UI.closeSheet();
})();
