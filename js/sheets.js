/* Money Tracker — bottom sheets: quick add / edit, recurring, category editor, first run, restore preview */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const X = MT.smart;
  const UI = MT.ui;
  const A = UI.actions;
  const esc = U.esc;
  const ic = U.icon;
  const M = (MT.sheets = {});

  const trimAmt = (p) => {
    const pounds = Math.floor(p / 100);
    const pp = p % 100;
    return pp ? pounds + '.' + String(pp).padStart(2, '0') : String(pounds);
  };

  /* ================= QUICK ADD / EDIT ================= */
  M.txForm = (existing, preset) => {
    const isEdit = !!existing;
    /* preset.copy: a transaction to duplicate as a new entry dated today */
    const copy = !existing && preset && preset.copy ? preset.copy : null;
    const st = {
      id: existing ? existing.id : null,
      type: existing ? existing.type : copy ? copy.type : (preset && preset.type) || 'expense',
      amt: existing ? trimAmt(existing.amount) : copy ? trimAmt(copy.amount) : '0',
      categoryId: existing ? existing.categoryId : copy ? copy.categoryId : null,
      catTouched: isEdit || !!copy,
      name: existing ? existing.name : copy ? copy.name : '',
      note: existing ? existing.note : copy ? copy.note : '',
      date: existing ? existing.date : (preset && preset.date) || U.today(),
      repeat: false,
      saving: false,
      recurringId: existing ? existing.recurringId : null,
      parsed: null,
      nameSugs: []
    };
    const defaultCat = (type) => (S.catsByUse(type)[0] || S.cat(S.fallbackFor(type))).id;
    if (!st.categoryId) st.categoryId = defaultCat(st.type);
    let sheet = null;

    const catsHtml = () => {
      let list = S.catsByUse(st.type);
      if (!list.find((c) => c.id === st.categoryId)) list = [S.cat(st.categoryId)].concat(list);
      return list
        .map((c) => `<button type="button" class="chip cat-chip press${c.id === st.categoryId ? ' on' : ''}" data-act="qa-cat" data-id="${esc(c.id)}" aria-pressed="${c.id === st.categoryId}">${UI.tile(c, 'sm')}${esc(c.name)}</button>`)
        .join('');
    };
    const datesHtml = () => {
      const t = U.today();
      const y = U.addDays(t, -1);
      const custom = st.date !== t && st.date !== y;
      return `<button type="button" class="chip${st.date === t ? ' on' : ''}" data-act="qa-date" data-val="${t}" aria-pressed="${st.date === t}">Today</button><button type="button" class="chip${st.date === y ? ' on' : ''}" data-act="qa-date" data-val="${y}" aria-pressed="${st.date === y}">Yesterday</button><label class="chip date-chip${custom ? ' on' : ''}" for="qa-date-in">${ic('calendar', 16, 2)}<span>${custom ? esc(U.fmtDay(st.date)) : 'Other date'}</span><input type="date" id="qa-date-in" value="${st.date}" max="${t}" aria-label="Pick a date"></label>`;
    };
    const keypadHtml = () =>
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
        .map((k) => `<button type="button" class="key${k === 'del' ? ' key-del' : ''}" data-act="qa-key" data-k="${k}" aria-label="${k === 'del' ? 'Delete (hold to clear)' : k === '.' ? 'Decimal point' : k}">${k === 'del' ? ic('backspace', 24, 1.9) : k}</button>`)
        .join('');

    const render = () => {
      let h = `<div class="qa"><div class="qa-head"><button type="button" class="icon-btn" data-act="sheet-close" aria-label="Close">${ic('close', 22, 2)}</button><h2 class="qa-title">${isEdit ? 'Edit transaction' : copy ? 'Duplicate' : 'New transaction'}</h2>${isEdit ? `<button type="button" class="icon-btn danger" data-act="qa-delete" aria-label="Delete this transaction">${ic('trash', 20, 1.9)}</button>` : '<span class="icon-spacer"></span>'}</div>`;
      h += `<div class="qa-scroll">`;
      h += UI.seg('qa-type', [{ id: 'expense', label: 'Expense' }, { id: 'income', label: 'Income' }], st.type, 'qa-type');
      h += `<button type="button" class="qa-amount" data-act="qa-keypad" aria-label="Amount"><span class="qa-amt" aria-live="polite"></span></button>`;
      h += `<label class="field qa-name" for="qa-name">${ic('edit', 18, 1.9)}<span class="sr">Description</span><input id="qa-name" autocomplete="off" enterkeyhint="done" placeholder="What for? Try “coffee 3.40 yesterday”" value="${esc(st.name)}"></label>`;
      h += `<div class="qa-suggest" id="qa-suggest"></div>`;
      h += `<div class="qa-label">Category</div><div class="chips scroll-x qa-cats" id="qa-cats" role="group" aria-label="Category">${catsHtml()}</div>`;
      h += `<div class="chips qa-dates" id="qa-dates" role="group" aria-label="Date">${datesHtml()}</div>`;
      h += `<label class="field" for="qa-note">${ic('note', 18, 1.9)}<span class="sr">Note</span><input id="qa-note" autocomplete="off" enterkeyhint="done" placeholder="Note (optional)" value="${esc(st.note)}"></label>`;
      if (!isEdit) h += `<div class="set-row qa-repeat"><span id="qa-rep-lbl" class="set-text"><b>Repeat monthly</b><span>Logs it automatically each month</span></span>${UI.switch('qa-rep', st.repeat, 'qa-repeat', 'qa-rep-lbl')}</div>`;
      else if (st.recurringId) h += `<p class="hint">${ic('repeat', 16, 1.9)} Part of a recurring payment. Changes here only affect this entry.</p>`;
      h += `</div><div class="qa-bottom"><div class="keypad" id="qa-keypad">${keypadHtml()}</div><button type="button" class="btn btn-primary btn-lg qa-save press" data-act="qa-save"></button></div></div>`;
      return h;
    };

    const $ = (s) => sheet.querySelector(s);
    const updAmount = (bump) => {
      const pence = U.keypadPence(st.amt);
      const el = $('.qa-amt');
      el.textContent = (st.type === 'income' && pence ? '+' : '') + U.keypadDisplay(st.amt);
      el.classList.toggle('zero', !pence);
      el.classList.toggle('in', st.type === 'income' && !!pence);
      if (bump && !U.reducedMotion()) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
      updSaveBtn();
    };
    /* the button shows the amount you typed in the description too ("tesco 23.40"), so Save just works */
    const updSaveBtn = () => {
      const btn = $('.qa-save');
      if (!btn) return;
      const pence = U.keypadPence(st.amt);
      const typed = !pence && st.parsed && st.parsed.amount ? st.parsed : null;
      const amt = pence || (typed ? typed.amount : 0);
      const type = typed && typed.type ? typed.type : st.type;
      btn.textContent = amt ? (isEdit ? 'Save changes · ' : 'Save ' + type + ' · ') + U.fmt(amt) : 'Enter an amount';
      btn.classList.toggle('btn-disabled', !amt);
    };
    const updCats = (auto) => {
      const box = $('#qa-cats');
      box.innerHTML = catsHtml();
      const on = box.querySelector('.on');
      if (on) {
        if (auto && !U.reducedMotion()) on.classList.add('pulse');
        const bl = box.getBoundingClientRect();
        const r = on.getBoundingClientRect();
        if (r.left < bl.left || r.right > bl.right) box.scrollTo({ left: box.scrollLeft + r.left - bl.left - 20, behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      }
    };
    const updDates = () => {
      $('#qa-dates').innerHTML = datesHtml();
      bindDate();
    };
    const bindDate = () => {
      const d = $('#qa-date-in');
      d.addEventListener('click', () => {
        try {
          if (d.showPicker) d.showPicker();
        } catch (e) {}
      });
      d.addEventListener('change', () => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d.value)) {
          st.date = d.value;
          updDates();
        }
      });
    };
    const updSuggest = () => {
      const box = $('#qa-suggest');
      const p = X.parse(st.name, st.type);
      st.parsed = p && (p.amount || (p.date && p.date !== st.date)) ? p : null;
      st.nameSugs = X.nameSuggestions(st.name, st.type, 3);
      let h = '';
      if (st.parsed) {
        const parts = [];
        if (p.amount) parts.push((p.type === 'income' ? '+' : '') + U.fmt(p.amount));
        if (p.date) parts.push(U.fmtDay(p.date));
        if (p.name) parts.push(p.name);
        if (p.categoryId) parts.push(S.cat(p.categoryId).name);
        h += `<button type="button" class="fill-chip press" data-act="qa-apply">${ic('spark', 16, 2)}<span>Fill in: ${esc(parts.join(' · '))}</span></button>`;
      }
      if (st.nameSugs.length) {
        h += `<div class="chips scroll-x">` + st.nameSugs.map((s, i) => `<button type="button" class="chip press" data-act="qa-name-pick" data-i="${i}">${UI.tile(S.cat(s.categoryId), 'sm')}${esc(s.name)} · ${U.fmt(s.amount)}</button>`).join('') + `</div>`;
      }
      box.innerHTML = h;
      updSaveBtn();
    };
    const autoCat = () => {
      if (st.catTouched) return;
      const p = X.parse(st.name, st.type);
      const c = X.suggestCategory(p && p.name ? p.name : st.name, st.type);
      if (c && c !== st.categoryId) {
        st.categoryId = c;
        updCats(true);
      }
    };
    const setType = (t, keepCat) => {
      if (t === st.type) return;
      st.type = t;
      const seg = sheet.querySelector('[data-seg="qa-type"]');
      if (seg) UI.setSeg(seg, t === 'expense' ? 0 : 1);
      if (!keepCat || S.cat(st.categoryId).type !== t) {
        st.categoryId = X.suggestCategory(st.name, t) || defaultCat(t);
        st.catTouched = false;
      }
      updCats();
      updAmount();
      updSuggest();
    };
    const applyParse = () => {
      const p = st.parsed;
      if (!p) return;
      if (p.type && p.type !== st.type) setType(p.type, true);
      if (p.amount) st.amt = trimAmt(p.amount);
      if (p.date) st.date = p.date;
      if (p.name) st.name = p.name;
      if (p.categoryId && S.cat(p.categoryId).type === st.type) st.categoryId = p.categoryId;
      $('#qa-name').value = st.name;
      updAmount(true);
      updCats(true);
      updDates();
      updSuggest();
      U.vibrate(8);
    };

    const save = async () => {
      if (st.saving) return;
      if (!U.keypadPence(st.amt) && st.parsed && st.parsed.amount) applyParse();
      const amount = U.keypadPence(st.amt);
      if (!amount) {
        const a = $('.qa-amount');
        a.classList.remove('shake');
        void a.offsetWidth;
        a.classList.add('shake');
        sheet.classList.remove('typing');
        U.vibrate(20);
        return;
      }
      st.saving = true;
      $('.qa-save').disabled = true;
      try {
        let rule = null;
        if (!isEdit && st.repeat) {
          rule = await S.saveRecurring({
            type: st.type,
            amount: amount,
            categoryId: st.categoryId,
            name: st.name.trim() || S.cat(st.categoryId).name,
            note: st.note,
            freq: 'monthly',
            anchor: Number(st.date.slice(8)),
            nextDate: U.addMonths(st.date, 1, Number(st.date.slice(8)))
          });
        }
        const before = existing ? Object.assign({}, existing) : null;
        const t = await S.saveTx({ id: st.id, type: st.type, amount: amount, categoryId: st.categoryId, name: st.name, note: st.note, date: st.date, recurringId: rule ? rule.id : st.recurringId });
        U.vibrate(12);
        await UI.closeSheet();
        const label = (t.type === 'income' ? '+' : '−') + U.fmt(t.amount) + ' · ' + S.cat(t.categoryId).name;
        UI.toast(isEdit ? 'Changes saved' : 'Saved ' + label + (rule ? ' · repeats monthly' : ''), {
          action: 'Undo',
          onAction: async () => {
            try {
              if (isEdit) await S.restoreTx(before);
              else {
                await S.deleteTx(t.id);
                if (rule) await S.deleteRecurring(rule.id);
              }
              UI.toast(isEdit ? 'Change undone' : 'Entry removed');
            } catch (e) {
              UI.error(e);
            }
          }
        });
      } catch (e) {
        st.saving = false;
        $('.qa-save').disabled = false;
        UI.error(e);
      }
    };

    M.cur = {
      key: (k) => {
        let a = st.amt;
        if (k === 'del') a = a.length > 1 ? a.slice(0, -1) : '0';
        else if (k === '.') {
          if (a.indexOf('.') < 0) a += '.';
        } else {
          const dec = a.split('.')[1];
          if (dec !== undefined && dec.length >= 2) return;
          if (a.replace('.', '').length >= 8) return;
          a = a === '0' ? k : a + k;
        }
        st.amt = a;
        updAmount(true);
      },
      clear: () => {
        st.amt = '0';
        updAmount(true);
      },
      type: (t) => setType(t),
      cat: (id) => {
        st.categoryId = id;
        st.catTouched = true;
        sheet.querySelectorAll('.cat-chip').forEach((b) => {
          const on = b.getAttribute('data-id') === id;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
      },
      date: (d) => {
        st.date = d;
        updDates();
      },
      repeat: (el) => {
        st.repeat = !st.repeat;
        el.setAttribute('aria-checked', String(st.repeat));
      },
      apply: applyParse,
      namePick: (i) => {
        const s = st.nameSugs[i];
        if (!s) return;
        st.name = s.name;
        $('#qa-name').value = s.name;
        st.categoryId = s.categoryId;
        st.catTouched = true;
        if (!U.keypadPence(st.amt)) st.amt = trimAmt(s.amount);
        updAmount(true);
        updCats(true);
        updSuggest();
      },
      keypad: () => {
        const f = document.activeElement;
        if (f && f.blur && sheet.contains(f)) f.blur();
        sheet.classList.remove('typing');
      },
      save: save,
      del: async () => {
        try {
          const t = await S.deleteTx(st.id);
          await UI.closeSheet();
          UI.toast('Deleted ' + (t.name || S.cat(t.categoryId).name), {
            action: 'Undo',
            onAction: async () => {
              await S.restoreTx(t);
              UI.toast('Entry restored');
            }
          });
        } catch (e) {
          UI.error(e);
        }
      }
    };

    UI.openSheet({
      label: isEdit ? 'Edit transaction' : 'New transaction',
      full: true,
      cls: 'qa-sheet',
      render: render,
      after: (el) => {
        sheet = el;
        updAmount();
        updSuggest();
        bindDate();
        const nameIn = $('#qa-name');
        const noteIn = $('#qa-note');
        nameIn.addEventListener('input', () => {
          st.name = nameIn.value;
          autoCat();
          updSuggest();
        });
        nameIn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (st.parsed) applyParse();
            nameIn.blur();
          }
        });
        noteIn.addEventListener('input', () => (st.note = noteIn.value));
        noteIn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            noteIn.blur();
          }
        });
        [nameIn, noteIn].forEach((i) => {
          i.addEventListener('focus', () => sheet.classList.add('typing'));
          i.addEventListener('blur', () =>
            setTimeout(() => {
              if (!sheet.contains(document.activeElement) || !/INPUT/.test(document.activeElement.tagName) || document.activeElement.type === 'date') sheet.classList.remove('typing');
            }, 80)
          );
        });
        /* hold delete to clear */
        const del = sheet.querySelector('.key-del');
        let holdTimer = null;
        del.addEventListener('pointerdown', () => {
          holdTimer = setTimeout(() => {
            holdTimer = 'fired';
            M.cur.clear();
            U.vibrate(15);
          }, 450);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
          del.addEventListener(ev, () => {
            if (holdTimer && holdTimer !== 'fired') clearTimeout(holdTimer);
            setTimeout(() => (holdTimer = null), 0);
          })
        );
        del.addEventListener(
          'click',
          (e) => {
            if (holdTimer === 'fired') {
              e.stopPropagation();
              e.preventDefault();
            }
          },
          true
        );
        /* physical keyboard support */
        sheet.addEventListener('keydown', (e) => {
          if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
          if (/^[0-9]$/.test(e.key)) M.cur.key(e.key);
          else if (e.key === '.' || e.key === ',') M.cur.key('.');
          else if (e.key === 'Backspace') M.cur.key('del');
          else if (e.key === 'Enter') save();
          else if (e.key === 'Escape') UI.closeSheet();
          else return;
          e.preventDefault();
        });
      },
      onClose: () => {
        M.cur = null;
      }
    });
  };
  A['qa-key'] = (el) => M.cur && M.cur.key(el.getAttribute('data-k'));
  A['qa-type'] = (el) => M.cur && M.cur.type(el.getAttribute('data-val'));
  A['qa-cat'] = (el) => M.cur && M.cur.cat(el.getAttribute('data-id'));
  A['qa-date'] = (el) => M.cur && M.cur.date(el.getAttribute('data-val'));
  A['qa-repeat'] = (el) => M.cur && M.cur.repeat(el);
  A['qa-apply'] = () => M.cur && M.cur.apply();
  A['qa-name-pick'] = (el) => M.cur && M.cur.namePick(Number(el.getAttribute('data-i')));
  A['qa-keypad'] = () => M.cur && M.cur.keypad();
  A['qa-save'] = () => M.cur && M.cur.save();
  A['qa-delete'] = () => M.cur && M.cur.del();

  /* ================= RECURRING ================= */
  /* existing: a rule to edit. prefill: values for a new rule (e.g. a suggestion from your history) */
  M.recurringForm = (existing, prefill) => {
    const isEdit = !!existing;
    const base = existing || prefill || {};
    const r = {
      id: existing ? existing.id : null,
      type: base.type || 'expense',
      amountStr: base.amount ? U.penceToInput(base.amount) : '',
      name: base.name || '',
      categoryId: base.categoryId || 'bills',
      freq: base.freq || 'monthly',
      interval: base.interval || 1,
      nextDate: base.nextDate || U.addDays(U.today(), 1),
      anchor: base.anchor || null,
      hasEnd: !!base.endDate,
      endDate: base.endDate || '',
      paused: !!base.paused,
      note: base.note || ''
    };
    let sheet = null;
    const UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
    const catsHtml = () => {
      let list = S.catsByUse(r.type);
      if (!list.find((c) => c.id === r.categoryId)) list = [S.cat(r.categoryId)].concat(list);
      return list.map((c) => `<button type="button" class="chip cat-chip press${c.id === r.categoryId ? ' on' : ''}" data-act="rec-cat" data-id="${esc(c.id)}" aria-pressed="${c.id === r.categoryId}">${UI.tile(c, 'sm')}${esc(c.name)}</button>`).join('');
    };
    const summary = () => {
      const p = U.parseMoney(r.amountStr);
      if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(r.nextDate)) return 'Fill in the amount and the next date.';
      const anchor = r.anchor && r.nextDate === base.nextDate ? r.anchor : Number(r.nextDate.slice(8));
      const rule = { freq: r.freq, interval: r.interval, anchor: anchor, nextDate: r.nextDate };
      let t = (r.paused ? 'Paused. When resumed it logs ' : 'Logs ') + (r.type === 'income' ? '+' : '−') + U.fmt(p) + ' ' + UI.freqText(rule) + ', starting ' + U.fmtDay(r.nextDate);
      if (r.hasEnd && /^\d{4}-\d{2}-\d{2}$/.test(r.endDate)) t += ', with the last one on or before ' + U.fmtDay(r.endDate);
      t += '.';
      if ((r.freq === 'monthly' || r.freq === 'yearly') && anchor > 28) t += ' In shorter months it uses the last day.';
      return t;
    };
    const render = () => {
      let h = `<div class="form"><div class="qa-head"><button type="button" class="icon-btn" data-act="sheet-close" aria-label="Close">${ic('close', 22, 2)}</button><h2 class="qa-title">${isEdit ? 'Edit recurring' : 'New recurring'}</h2>${isEdit ? `<button type="button" class="icon-btn danger" data-act="rec-delete" aria-label="Delete">${ic('trash', 20, 1.9)}</button>` : '<span class="icon-spacer"></span>'}</div>`;
      h += UI.seg('rec-type', [{ id: 'expense', label: 'Expense' }, { id: 'income', label: 'Income' }], r.type, 'rec-type');
      h += `<label class="field-block" for="rec-name"><span class="lbl">Name</span><input class="input" id="rec-name" autocomplete="off" placeholder="e.g. Netflix" value="${esc(r.name)}"></label>`;
      h += `<label class="field-block" for="rec-amt"><span class="lbl">Amount</span><span class="money-input"><span>£</span><input id="rec-amt" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(r.amountStr)}"></span></label>`;
      h += `<div class="field-block"><span class="lbl">Category</span><div class="chips scroll-x" id="rec-cats" role="group" aria-label="Category">${catsHtml()}</div></div>`;
      h += `<div class="field-block"><span class="lbl">How often</span>${UI.seg('rec-freq', [{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }, { id: 'yearly', label: 'Yearly' }], r.freq, 'rec-freq')}`;
      h += `<div class="stepper-row"><span class="set-text"><b>Repeat every</b></span><div class="stepper" role="group" aria-label="Repeat every"><button type="button" class="step press" data-act="rec-int" data-d="-1" aria-label="Less often"${r.interval <= 1 ? ' disabled' : ''}>${ic('minus', 18, 2.4)}</button><output id="rec-int-val" aria-live="polite">${r.interval} ${UNIT[r.freq]}${r.interval === 1 ? '' : 's'}</output><button type="button" class="step press" data-act="rec-int" data-d="1" aria-label="Less frequently, more ${UNIT[r.freq]}s between"${r.interval >= 99 ? ' disabled' : ''}>${ic('plus', 18, 2.4)}</button></div></div></div>`;
      h += `<label class="field-block" for="rec-date"><span class="lbl">${isEdit ? 'Next due' : 'Next payment'}</span><input class="input" type="date" id="rec-date" value="${r.nextDate}"></label>`;
      h += `<div class="set-row"><span id="rec-e-lbl" class="set-text"><b>Has an end date</b><span>For loans or fixed-term plans</span></span>${UI.switch('rec-e', r.hasEnd, 'rec-end', 'rec-e-lbl')}</div>`;
      h += `<label class="field-block" for="rec-enddate"${r.hasEnd ? '' : ' hidden'} id="rec-end-wrap"><span class="lbl">Last payment on or before</span><input class="input" type="date" id="rec-enddate" value="${r.endDate}" min="${r.nextDate}"></label>`;
      h += `<label class="field" for="rec-note">${ic('note', 18, 1.9)}<span class="sr">Note</span><input id="rec-note" autocomplete="off" placeholder="Note (optional)" value="${esc(r.note)}"></label>`;
      if (isEdit) h += `<div class="set-row"><span id="rec-p-lbl" class="set-text"><b>Paused</b><span>Nothing is logged while paused, for example months with no council tax</span></span>${UI.switch('rec-p', r.paused, 'rec-pause', 'rec-p-lbl')}</div>`;
      h += `<p class="note-box" id="rec-sum" aria-live="polite">${esc(summary())}</p>`;
      h += `<button type="button" class="btn btn-primary btn-lg press" data-act="rec-save">${isEdit ? 'Save changes' : 'Add recurring'}</button></div>`;
      return h;
    };
    const upd = () => (sheet.querySelector('#rec-sum').textContent = summary());
    const updInterval = () => {
      sheet.querySelector('#rec-int-val').textContent = r.interval + ' ' + UNIT[r.freq] + (r.interval === 1 ? '' : 's');
      const [minus, plus] = sheet.querySelectorAll('.step');
      minus.disabled = r.interval <= 1;
      plus.disabled = r.interval >= 99;
      upd();
    };
    M.rec = {
      type: (t) => {
        r.type = t;
        UI.setSeg(sheet.querySelector('[data-seg="rec-type"]'), t === 'expense' ? 0 : 1);
        if (S.cat(r.categoryId).type !== t) r.categoryId = (S.catsByUse(t)[0] || {}).id;
        sheet.querySelector('#rec-cats').innerHTML = catsHtml();
        upd();
      },
      cat: (id) => {
        r.categoryId = id;
        sheet.querySelector('#rec-cats').innerHTML = catsHtml();
      },
      freq: (f, el) => {
        r.freq = f;
        UI.setSeg(el.closest('[data-seg]'), Number(el.getAttribute('data-seg-i')));
        updInterval();
      },
      interval: (d) => {
        r.interval = Math.max(1, Math.min(99, r.interval + d));
        updInterval();
      },
      end: (el) => {
        r.hasEnd = !r.hasEnd;
        el.setAttribute('aria-checked', String(r.hasEnd));
        sheet.querySelector('#rec-end-wrap').hidden = !r.hasEnd;
        upd();
      },
      pause: (el) => {
        r.paused = !r.paused;
        el.setAttribute('aria-checked', String(r.paused));
        upd();
      },
      save: async (btn) => {
        btn.disabled = true;
        try {
          const amount = U.parseMoney(r.amountStr);
          if (amount == null || !amount) throw new Error('Enter the amount, like 9.99.');
          if (r.hasEnd && !/^\d{4}-\d{2}-\d{2}$/.test(r.endDate)) throw new Error('Pick the end date, or turn off “Has an end date”.');
          const keepAnchor = (isEdit && r.nextDate === existing.nextDate) || (!isEdit && prefill && r.nextDate === prefill.nextDate);
          await S.saveRecurring({ id: r.id, type: r.type, amount: amount, name: r.name, categoryId: r.categoryId, freq: r.freq, interval: r.interval, nextDate: r.nextDate, endDate: r.hasEnd ? r.endDate : null, paused: r.paused, note: r.note, anchor: keepAnchor ? r.anchor : null });
          U.vibrate(10);
          await UI.closeSheet();
          UI.toast(isEdit ? 'Recurring updated' : 'Recurring added');
        } catch (e) {
          btn.disabled = false;
          UI.error(e);
        }
      },
      del: async () => {
        const ok = await UI.confirm({ title: 'Delete ' + (r.name || 'this') + '?', body: 'Entries it has already logged stay in your history. Nothing new will be logged.', ok: 'Delete', danger: true });
        if (!ok) return;
        try {
          const gone = await S.deleteRecurring(r.id);
          await UI.closeSheet();
          UI.toast('Deleted ' + gone.name, {
            action: 'Undo',
            onAction: async () => {
              await S.restoreRecurring(gone);
              UI.toast('Recurring restored');
            }
          });
        } catch (e) {
          UI.error(e);
        }
      }
    };
    UI.openSheet({
      label: isEdit ? 'Edit recurring' : 'New recurring',
      cls: 'tall',
      render: render,
      after: (el) => {
        sheet = el;
        const bind = (id, key) => {
          const i = el.querySelector(id);
          const f = () => {
            r[key] = i.value;
            if (key === 'nextDate') el.querySelector('#rec-enddate').min = i.value;
            upd();
          };
          i.addEventListener('input', f);
          i.addEventListener('change', f);
        };
        bind('#rec-name', 'name');
        bind('#rec-amt', 'amountStr');
        bind('#rec-date', 'nextDate');
        bind('#rec-enddate', 'endDate');
        bind('#rec-note', 'note');
      },
      onClose: () => (M.rec = null)
    });
  };
  A['rec-type'] = (el) => M.rec && M.rec.type(el.getAttribute('data-val'));
  A['rec-cat'] = (el) => M.rec && M.rec.cat(el.getAttribute('data-id'));
  A['rec-freq'] = (el) => M.rec && M.rec.freq(el.getAttribute('data-val'), el);
  A['rec-int'] = (el) => M.rec && M.rec.interval(Number(el.getAttribute('data-d')));
  A['rec-end'] = (el) => M.rec && M.rec.end(el);
  A['rec-pause'] = (el) => M.rec && M.rec.pause(el);
  A['rec-save'] = (el) => M.rec && M.rec.save(el);
  A['rec-delete'] = () => M.rec && M.rec.del();

  /* ================= CATEGORY EDITOR ================= */
  M.categoryForm = (existing, type) => {
    const isEdit = !!existing;
    const c = existing ? Object.assign({}, existing) : { name: '', type: type, icon: 'box', color: 'blue' };
    let sheet = null;
    const preview = () => `${UI.tile(c, 'lg')}`;
    const render = () => {
      let h = `<div class="form"><div class="qa-head"><button type="button" class="icon-btn" data-act="sheet-close" aria-label="Close">${ic('close', 22, 2)}</button><h2 class="qa-title">${isEdit ? 'Edit category' : 'New ' + c.type + ' category'}</h2><span class="icon-spacer"></span></div>`;
      h += `<div class="cat-name-row"><span id="cf-prev">${preview()}</span><label class="field-block grow" for="cf-name"><span class="lbl">Name</span><input class="input" id="cf-name" autocomplete="off" placeholder="e.g. Coffee" value="${esc(c.name)}" ${isEdit ? '' : 'autofocus'}></label></div>`;
      h += `<div class="field-block"><span class="lbl">Colour</span><div class="swatches" role="group" aria-label="Colour">${U.COLORS.map((k) => `<button type="button" class="swatch c-${k}${c.color === k ? ' on' : ''}" data-act="cf-color" data-val="${k}" aria-label="${U.COLOR_NAMES[k]}" aria-pressed="${c.color === k}"><span></span></button>`).join('')}</div></div>`;
      h += `<div class="field-block"><span class="lbl">Icon</span><div class="icon-grid" role="group" aria-label="Icon">${U.PICKABLE_ICONS.map((k) => `<button type="button" class="icon-opt${c.icon === k ? ' on' : ''}" data-act="cf-icon" data-val="${k}" aria-label="${k}" aria-pressed="${c.icon === k}">${ic(k, 20)}</button>`).join('')}</div></div>`;
      const inc = c.type === 'income';
      h += `<div class="set-row bordered cf-ns"><span id="cf-ns-lbl" class="set-text"><b>${inc ? 'Not real income' : 'Not spending'}</b><span>${inc ? 'For money moved in from your own accounts. It still counts in your balance, but not in income totals or charts.' : 'For savings, investments and transfers to your own accounts. It still counts in your balance, but not in spending totals or charts.'}</span></span>${UI.switch('cf-ns', !!c.notSpending, 'cf-ns', 'cf-ns-lbl')}</div>`;
      h += `<button type="button" class="btn btn-primary btn-lg press" data-act="cf-save">${isEdit ? 'Save changes' : 'Add category'}</button>`;
      if (isEdit && !c.builtIn) h += `<button type="button" class="btn btn-ghost-danger press" data-act="cf-remove">Remove category</button>`;
      return h + `</div>`;
    };
    const setOn = (sel, val) =>
      sheet.querySelectorAll(sel).forEach((b) => {
        const on = b.getAttribute('data-val') === val;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    M.cf = {
      color: (k) => {
        c.color = k;
        setOn('.swatch', k);
        sheet.querySelector('#cf-prev').innerHTML = preview();
      },
      ns: (on) => (c.notSpending = on),
      icon: (k) => {
        c.icon = k;
        setOn('.icon-opt', k);
        sheet.querySelector('#cf-prev').innerHTML = preview();
      },
      save: async (btn) => {
        btn.disabled = true;
        try {
          c.name = sheet.querySelector('#cf-name').value;
          const out = await S.saveCategory(c);
          await UI.closeSheet();
          UI.toast((isEdit ? 'Saved ' : 'Added ') + out.name);
        } catch (e) {
          btn.disabled = false;
          UI.error(e);
        }
      },
      remove: async () => {
        await UI.closeSheet();
        const btn = document.createElement('button');
        btn.setAttribute('data-id', c.id);
        A['cat-remove'](btn);
      }
    };
    UI.openSheet({
      label: isEdit ? 'Edit category' : 'New category',
      cls: 'tall',
      render: render,
      after: (el) => {
        sheet = el;
      },
      onClose: () => (M.cf = null)
    });
  };
  A['cf-color'] = (el) => M.cf && M.cf.color(el.getAttribute('data-val'));
  A['cf-icon'] = (el) => M.cf && M.cf.icon(el.getAttribute('data-val'));
  A['cf-save'] = (el) => M.cf && M.cf.save(el);
  A['cf-ns'] = (el) => {
    if (!M.cf) return;
    const on = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(on));
    M.cf.ns(on);
  };
  A['cf-remove'] = () => M.cf && M.cf.remove();

  /* ================= FIRST RUN ================= */
  M.onboarding = () => {
    UI.openSheet({
      label: 'Welcome',
      cls: 'welcome-sheet',
      render: () =>
        `<div class="form"><span class="tile tile-xl c-blue">${ic('tally', 30, 2)}</span><h2 class="sheet-title">Welcome to Tally</h2><p class="sheet-text">Everything you log stays on this phone. To start, enter what’s in your account right now. You can bring in your Money Lover history later.</p><label class="field-block" for="ob-bal"><span class="lbl">Current balance</span><span class="money-input"><span>£</span><input id="ob-bal" inputmode="decimal" autocomplete="off" placeholder="0.00"></span></label><label class="field-inline" for="ob-neg"><input type="checkbox" id="ob-neg"> My account is overdrawn (minus)</label><button type="button" class="btn btn-primary btn-lg press" data-act="ob-start">Start tracking</button><label class="btn btn-soft press" for="restore-file">${ic('history', 18, 2)} Restore from a backup file<input type="file" id="restore-file" accept="application/json,.json" class="sr"></label><label class="btn btn-soft press" for="ml-file">${ic('upload', 18, 2)} Import from Money Lover<input type="file" id="ml-file" accept=".csv,text/csv,text/comma-separated-values" class="sr"></label><button type="button" class="btn btn-text press" data-act="ob-skip">Skip for now</button><button type="button" class="btn btn-text press" data-act="load-examples">${ic('spark', 16, 2)} Explore with example data first</button></div>`,
      after: (el) => {
        UI.bindImport(el);
        UI.bindRestore(el);
      },
      onClose: () => {
        if (!S.meta.onboarded) S.setMeta('onboarded', true).catch(() => {});
      }
    });
  };
  A['ob-start'] = async (el) => {
    const inp = document.getElementById('ob-bal');
    const p = U.parseMoney(inp.value || '0');
    if (p == null) return UI.toast('Enter an amount like 1250.00', { kind: 'error' });
    el.disabled = true;
    try {
      if (p > 0) {
        const neg = document.getElementById('ob-neg').checked;
        await S.saveTx({ type: neg ? 'expense' : 'income', amount: p, categoryId: 'adjust', name: 'Opening balance', note: '', date: U.today() });
      }
      await S.setMeta('onboarded', true);
      MT.db.persist();
      await UI.closeSheet();
      UI.toast('All set. Tap + to log your first expense');
    } catch (e) {
      el.disabled = false;
      UI.error(e);
    }
  };
  A['ob-skip'] = async () => {
    await S.setMeta('onboarded', true).catch(() => {});
    MT.db.persist();
    UI.closeSheet();
  };

  /* ================= MONEY LOVER IMPORT ================= */
  M.importPreview = (res, fileName) => {
    const s = res.summary;
    const mine = S.tx.filter((t) => !t.example).length;
    const addBal = S.balance() + s.balance;
    let mode = 'replace';
    const opt = (val, title, body) =>
      `<button type="button" class="choice-opt press${mode === val ? ' on' : ''}" role="radio" aria-checked="${mode === val}" data-act="imp-mode" data-val="${val}"><span class="radio" aria-hidden="true"></span><span class="choice-text"><b>${title}</b><span>${body}</span></span></button>`;
    const render = () =>
      `<div class="form"><h2 class="sheet-title">Import from Money Lover</h2><p class="sheet-text">${esc(fileName)}</p>` +
      `<div class="kv"><span>Transactions</span><b>${s.count.toLocaleString('en-GB')}</b><span>Covering</span><b>${U.fmtShortDate(s.from)} ${s.from.slice(0, 4)} – ${U.fmtShortDate(s.to)} ${s.to.slice(0, 4)}</b><span>Balance in the file</span><b>${U.fmt(s.balance)}</b>${s.excluded ? `<span>Kept out of reports</span><b>${s.excluded}</b>` : ''}${res.newCats.length ? `<span>New ${res.newCats.length === 1 ? 'category' : 'categories'}</span><b>${esc(res.newCats.map((c) => c.name).join(', '))}</b>` : ''}</div>` +
      (s.skipped ? `<p class="note-box warn">${s.skipped} row${s.skipped === 1 ? '' : 's'} couldn’t be read and will be skipped.</p>` : '') +
      (s.otherCurrency ? `<p class="note-box warn">${s.otherCurrency} entr${s.otherCurrency === 1 ? 'y is' : 'ies are'} not in GBP. They’ll be imported as pounds.</p>` : '') +
      `<div class="choice" role="radiogroup" aria-label="How to import">` +
      opt('replace', 'Replace what’s in the app', mine ? `Recommended. Your Money Lover history already includes your starting balance. Your ${mine} current entr${mine === 1 ? 'y is' : 'ies are'} saved as a snapshot first.` : 'Recommended. Your Money Lover history already includes your starting balance.') +
      opt('add', 'Add to what’s here', `Keeps your current entries. Your balance would become ${U.fmt(addBal)}.`) +
      `</div><button type="button" class="btn btn-primary btn-lg press" data-act="imp-go">Import ${s.count.toLocaleString('en-GB')} transactions</button></div>`;
    let entry = null;
    M.imp = {
      mode: (v) => {
        mode = v;
        UI.rerenderSheet(entry);
      },
      go: async (btn) => {
        btn.disabled = true;
        btn.textContent = 'Importing…';
        try {
          const n = await MT.importer.apply(res, mode);
          await UI.closeSheet();
          if (UI.route.name !== 'home') UI.go('home', {}, 'replace');
          UI.toast('Imported ' + n.toLocaleString('en-GB') + ' transactions · balance ' + U.fmt(S.balance()), { duration: 4500 });
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Try again';
          UI.error(e);
        }
      }
    };
    entry = UI.openSheet({ label: 'Import from Money Lover', cls: 'tall', render: render, onClose: () => (M.imp = null) });
  };
  A['imp-mode'] = (el) => M.imp && M.imp.mode(el.getAttribute('data-val'));
  A['imp-go'] = (el) => M.imp && M.imp.go(el);

  /* ================= PERIOD PICKER ================= */
  /* mode 'month': a year of months with what you spent in each. mode 'day': a calendar; tap its title to jump by month. */
  M.periodPicker = (o) => {
    const today = U.today();
    const first = S.firstDate() || today;
    const minYear = Number(first.slice(0, 4));
    /* month mode follows the month setting (pay months are named after the month they end in); the day calendar is always calendar months */
    const pm = o.mode === 'month';
    const maxYear = pm ? S.mYear(today) : Number(today.slice(0, 4));
    let view = pm ? 'months' : 'days';
    let year = pm ? S.mYear(o.value) : Number(o.value.slice(0, 4));
    let month = U.monthStart(o.value);
    let entry = null;
    const pick = async (iso) => {
      await UI.closeSheet();
      o.onPick(iso);
    };
    const monthsHtml = () => {
      let h = `<div class="pk-nav"><button class="icon-btn press" data-act="pk-year" data-d="-1" aria-label="Previous year"${year <= minYear ? ' disabled' : ''}>${ic('chevL', 20, 2)}</button><span class="pk-title">${year}</span><button class="icon-btn press" data-act="pk-year" data-d="1" aria-label="Next year"${year >= maxYear ? ' disabled' : ''}>${ic('chevR', 20, 2)}</button></div><div class="pk-months">`;
      for (let m = 0; m < 12; m++) {
        const ms = pm ? S.mNamed(year, m) : year + '-' + String(m + 1).padStart(2, '0') + '-01';
        const future = ms > today;
        const t = future ? null : S.totals(ms, pm ? S.mEnd(ms) : U.monthEnd(ms));
        const sel = pm ? ms === S.mStart(o.value) : ms === U.monthStart(o.value);
        const cur = pm ? ms === S.mStart(today) : ms === U.monthStart(today);
        h += `<button class="pk-month press${sel ? ' sel' : ''}${cur ? ' cur' : ''}" data-act="pk-month" data-val="${ms}"${future ? ' disabled' : ''} aria-label="${U.MONL[m]} ${year}${t && t.out ? ', spent ' + U.fmt(t.out) : ''}"><b>${U.MON[m]}</b><span>${t && t.out ? U.fmtShort(t.out) : '—'}</span></button>`;
      }
      h += `</div>`;
      if (pm && S.payMode()) h += `<p class="muted sm pk-hint">Pay months, named after the month they end in.</p>`;
      return h + `<div class="btn-row"><button class="btn press" data-act="sheet-close">Cancel</button><button class="btn btn-soft press" data-act="pk-today">${o.mode === 'month' ? 'This month' : 'Today'}</button></div>`;
    };
    const daysHtml = () => {
      const ws = S.settings().weekStart;
      const end = U.monthEnd(month);
      const days = Number(end.slice(8));
      const daily = S.dailySpend(month, end);
      const lead = (U.parse(month).getDay() - ws + 7) % 7;
      const prevOk = month > U.monthStart(first);
      const nextOk = U.addMonths(month, 1, 1) <= today;
      let h = `<div class="pk-nav"><button class="icon-btn press" data-act="pk-mon" data-d="-1" aria-label="Previous month"${prevOk ? '' : ' disabled'}>${ic('chevL', 20, 2)}</button><button class="pk-title pk-title-btn press" data-act="pk-to-months" aria-label="Choose a different month">${U.fmtMonth(month)}${ic('chevD', 16, 2.2)}</button><button class="icon-btn press" data-act="pk-mon" data-d="1" aria-label="Next month"${nextOk ? '' : ' disabled'}>${ic('chevR', 20, 2)}</button></div><div class="pk-days">`;
      for (let i = 0; i < 7; i++) h += `<span class="pk-dow" aria-hidden="true">${U.DOW[(i + ws) % 7].charAt(0)}</span>`;
      for (let i = 0; i < lead; i++) h += `<span></span>`;
      for (let d = 1; d <= days; d++) {
        const iso = month.slice(0, 8) + String(d).padStart(2, '0');
        const sel = iso === o.value;
        h += `<button class="pk-day press${sel ? ' sel' : ''}${iso === today ? ' cur' : ''}${daily[iso] ? ' has' : ''}" data-act="pk-day" data-val="${iso}"${iso > today ? ' disabled' : ''} aria-label="${U.fmtDay(iso)}${daily[iso] ? ', spent ' + U.fmt(daily[iso]) : ''}">${d}</button>`;
      }
      return h + `</div><p class="muted sm pk-hint">Days with a dot have spending. Tap the month name to jump further.</p><div class="btn-row"><button class="btn press" data-act="sheet-close">Cancel</button><button class="btn btn-soft press" data-act="pk-today">Today</button></div>`;
    };
    const render = () => `<div class="form pk"><h2 class="sheet-title">${esc(view === 'months' && o.mode === 'day' ? 'Choose a month' : o.title)}</h2>${view === 'months' ? monthsHtml() : daysHtml()}</div>`;
    M.pk = {
      year: (d) => {
        year = Math.max(minYear, Math.min(maxYear, year + d));
        UI.rerenderSheet(entry);
      },
      mon: (d) => {
        month = U.addMonths(month, d, 1);
        UI.rerenderSheet(entry);
      },
      toMonths: () => {
        view = 'months';
        year = Number(month.slice(0, 4));
        UI.rerenderSheet(entry);
      },
      month: (ms) => {
        if (o.mode === 'month') return pick(ms);
        month = ms;
        view = 'days';
        UI.rerenderSheet(entry);
      },
      day: (iso) => pick(iso),
      today: () => pick(pm ? S.mStart(today) : today)
    };
    entry = UI.openSheet({ label: o.title, cls: 'picker', render: render, onClose: () => (M.pk = null) });
  };
  A['pk-year'] = (el) => M.pk && M.pk.year(Number(el.getAttribute('data-d')));
  A['pk-mon'] = (el) => M.pk && M.pk.mon(Number(el.getAttribute('data-d')));
  A['pk-to-months'] = () => M.pk && M.pk.toMonths();
  A['pk-month'] = (el) => M.pk && M.pk.month(el.getAttribute('data-val'));
  A['pk-day'] = (el) => M.pk && M.pk.day(el.getAttribute('data-val'));
  A['pk-today'] = () => M.pk && M.pk.today();

  /* ================= DATA MISSING ================= */
  /* Shown when this phone had entries before but storage now opens empty */
  M.missingData = (mark) => {
    UI.openSheet({
      label: 'Your entries are missing',
      cls: 'welcome-sheet',
      render: () =>
        `<div class="form"><span class="tile tile-xl c-amber">${ic('alert', 30, 1.8)}</span><h2 class="sheet-title">Your entries are missing</h2><p class="sheet-text">This app had ${Number(mark.n).toLocaleString('en-GB')} transactions on this phone${mark.at ? ', last seen ' + esc(U.ago(mark.at)) : ''}, but its storage has come back empty. App updates never delete your data, so something on the phone cleared it.</p><p class="sheet-text">Restore your latest backup file, or import from Money Lover again.</p><label class="btn btn-primary btn-lg press" for="restore-file">${ic('history', 18, 2)} Restore from a backup file<input type="file" id="restore-file" accept="application/json,.json" class="sr"></label><label class="btn btn-soft press" for="ml-file">${ic('upload', 18, 2)} Import from Money Lover<input type="file" id="ml-file" accept=".csv,text/csv,text/comma-separated-values" class="sr"></label><button type="button" class="btn btn-text press" data-act="missing-fresh">Start fresh instead</button></div>`,
      after: (el) => {
        UI.bindRestore(el);
        UI.bindImport(el);
      }
    });
  };
  A['missing-fresh'] = async () => {
    try {
      localStorage.removeItem('mt-had-data');
    } catch (e) {}
    await UI.closeSheet();
    M.onboarding();
  };

  /* ================= RESTORE PREVIEW ================= */
  M.restorePreview = (v, source) => {
    const s = v.summary;
    UI.openSheet({
      label: 'Restore preview',
      render: () =>
        `<div class="form"><h2 class="sheet-title">Restore this backup?</h2><p class="sheet-text">${esc(source)}</p><div class="kv"><span>Transactions</span><b>${s.tx}</b><span>Covering</span><b>${s.from ? U.fmtShortDate(s.from) + ' ' + s.from.slice(0, 4) + ' – ' + U.fmtShortDate(s.to) + ' ' + s.to.slice(0, 4) : '—'}</b><span>Balance</span><b>${U.fmt(s.balance)}</b><span>Categories</span><b>${s.cats}</b><span>Recurring</span><b>${s.rec}</b></div>${s.skipped ? `<p class="note-box warn">${s.skipped} damaged entr${s.skipped === 1 ? 'y' : 'ies'} will be skipped.</p>` : ''}<p class="note-box">This replaces what’s in the app now (${S.tx.length} transactions, balance ${U.fmt(S.balance())}). A snapshot of your current data is saved first, so you can switch back from Backup.</p><div class="btn-row"><button type="button" class="btn" data-act="sheet-close">Cancel</button><button type="button" class="btn btn-danger" data-act="restore-go">Replace data</button></div></div>`
    });
    UI._restore = v;
  };
  A['restore-go'] = async (el) => {
    const v = UI._restore;
    if (!v) return;
    el.disabled = true;
    try {
      await S.replaceAll(v.data);
      UI._restore = null;
      UI.applyTheme(S.settings().theme);
      await UI.closeSheet();
      UI.toast('Restored ' + v.summary.tx + ' transactions');
    } catch (e) {
      el.disabled = false;
      UI.error(e);
    }
  };

  /* ================= HOLD A TRANSACTION FOR ACTIONS ================= */
  /* Press and hold a row for about half a second: it sinks slightly while you hold, buzzes once,
     and a small menu opens. Any movement (scrolling, swiping months) cancels it, and the tap that
     ends a hold never opens the edit form, so nothing fires by accident. */
  const sameName = (t) => {
    const n = X.norm(t.name);
    return n ? S.tx.filter((x) => x.type === t.type && X.norm(x.name) === n) : [];
  };
  /* choose a category for every entry with this name (and any recurring payment with it) */
  M.moveAll = (t) => {
    const list = sameName(t);
    let entry = null;
    const render = () =>
      `<div class="form"><h2 class="sheet-title">Move all “${esc(t.name)}”</h2><p class="sheet-text">${list.length} entries. Pick their new category.</p><div class="move-cats">${S.catsOf(t.type)
        .map((c) => `<button type="button" class="chip cat-chip press${c.id === t.categoryId ? ' on' : ''}" data-act="mv-pick" data-id="${esc(c.id)}">${UI.tile(c, 'sm')}${esc(c.name)}${c.notSpending ? ' <span class="muted sm">· not ' + (c.type === 'income' ? 'income' : 'spending') + '</span>' : ''}</button>`)
        .join('')}</div><button type="button" class="btn press" data-act="sheet-close">Cancel</button></div>`;
    M.mv = {
      pick: async (id) => {
        try {
          const before = list.filter((x) => x.categoryId !== id);
          const now = Date.now();
          const changed = before.map((x) => Object.assign({}, x, { categoryId: id, updatedAt: now }));
          const n = X.norm(t.name);
          const recBefore = S.rec.filter((r) => r.type === t.type && X.norm(r.name) === n && r.categoryId !== id);
          const recChanged = recBefore.map((r) => Object.assign({}, r, { categoryId: id }));
          await S.putTxBatch(changed);
          await S.putRecBatch(recChanged);
          await UI.closeSheet();
          UI.toast('Moved ' + changed.length + ' to ' + S.cat(id).name + (recChanged.length ? ' (and its recurring payment)' : ''), {
            action: 'Undo',
            onAction: async () => {
              await S.putTxBatch(before);
              await S.putRecBatch(recBefore);
              UI.toast('Move undone');
            }
          });
        } catch (e) {
          UI.error(e);
        }
      }
    };
    entry = UI.openSheet({ label: 'Move all ' + t.name, cls: 'tall', render: render, onClose: () => (M.mv = null) });
    return entry;
  };
  A['mv-pick'] = (el) => M.mv && M.mv.pick(el.getAttribute('data-id'));

  M.txActions = (t) => {
    const c = S.cat(t.categoryId);
    let entry = null;
    const opt = (act, icon, title, sub, cls) => `<button type="button" class="txa-opt press${cls ? ' ' + cls : ''}" data-act="${act}"><span class="txa-ic">${ic(icon, 20, 1.9)}</span><span class="txa-txt"><b>${title}</b><span>${sub}</span></span></button>`;
    const render = () => {
      const cur = S.tx.find((x) => x.id === t.id) || t;
      let h = `<div class="form txa"><div class="txa-head">${UI.tile(c)}<span class="tx-main"><span class="tx-title">${esc(cur.name || c.name)}</span><span class="tx-sub">${esc(U.fmtDay(cur.date))}${cur.name ? ' · ' + esc(c.name) : ''}</span></span><span class="${UI.amountClass(cur)}">${U.fmtSigned(cur)}</span></div><div class="txa-list">`;
      h += opt('txa-dup', 'copy', 'Duplicate', 'Opens a copy dated today, ready to save');
      h += opt('txa-edit', 'edit', 'Edit', 'Change the amount, category, date or note');
      h += cur.excluded ? opt('txa-excl', 'eye', 'Include in reports', 'Count it in charts and totals again') : opt('txa-excl', 'eyeOff', 'Leave out of reports', 'Stays in your balance, but not in charts or totals');
      const same = cur.name ? sameName(cur) : [];
      if (same.length > 1) h += opt('txa-move', 'more', 'Move all “' + esc(cur.name) + '”', 'Change the category of all ' + same.length + ' entries with this name');
      h += opt('txa-del', 'trash', 'Delete', 'You can undo straight after', 'danger');
      return h + `</div></div>`;
    };
    const run = async (fn) => {
      try {
        await fn(S.tx.find((x) => x.id === t.id) || t);
      } catch (e) {
        UI.error(e);
      }
    };
    M.txa = {
      dup: () =>
        run(async (cur) => {
          await UI.closeSheet();
          M.txForm(null, { copy: cur });
        }),
      edit: () =>
        run(async (cur) => {
          await UI.closeSheet();
          M.txForm(cur);
        }),
      move: () =>
        run(async (cur) => {
          await UI.closeSheet();
          M.moveAll(cur);
        }),
      excl: () =>
        run(async (cur) => {
          const on = !cur.excluded;
          await S.setExcluded(cur.id, on);
          await UI.closeSheet();
          UI.toast(on ? 'Left out of reports' : 'Back in reports', {
            action: 'Undo',
            onAction: async () => {
              await S.setExcluded(cur.id, !on);
              UI.toast(on ? 'Back in reports' : 'Left out of reports');
            }
          });
        }),
      del: () =>
        run(async (cur) => {
          const gone = await S.deleteTx(cur.id);
          await UI.closeSheet();
          if (!gone) return;
          UI.toast('Deleted ' + (gone.name || S.cat(gone.categoryId).name), {
            action: 'Undo',
            onAction: async () => {
              await S.restoreTx(gone);
              UI.toast('Entry restored');
            }
          });
        })
    };
    entry = UI.openSheet({ label: 'Actions for ' + (t.name || c.name), cls: 'txa-sheet', render: render, onClose: () => (M.txa = null) });
    return entry;
  };
  A['txa-dup'] = () => M.txa && M.txa.dup();
  A['txa-edit'] = () => M.txa && M.txa.edit();
  A['txa-excl'] = () => M.txa && M.txa.excl();
  A['txa-del'] = () => M.txa && M.txa.del();
  A['txa-move'] = () => M.txa && M.txa.move();

  (function () {
    const HOLD = 480;
    const SLOP = 8;
    let h = null;
    let firedId = null;
    let swallowUntil = 0;
    const clear = () => {
      if (!h) return;
      clearTimeout(h.timer);
      clearTimeout(h.sink);
      h.row.classList.remove('holding');
      h = null;
    };
    document.addEventListener(
      'pointerdown',
      (e) => {
        clear();
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (UI.sheets.length) return;
        const row = e.target.closest && e.target.closest('.tx-row[data-act="edit-tx"]');
        if (!row || !row.closest('#view')) return;
        const id = row.getAttribute('data-id');
        const pid = e.pointerId;
        firedId = null;
        h = { id: pid, x: e.clientX, y: e.clientY, row: row };
        /* show the press-and-hold only once it's clearly not a tap */
        h.sink = setTimeout(() => h && h.row.classList.add('holding'), 140);
        h.timer = setTimeout(() => {
          const t = S.tx.find((x) => x.id === id);
          const r = h && h.row;
          clear();
          if (!t || !r || !document.body.contains(r)) return;
          firedId = pid;
          if (UI.cancelSwipe) UI.cancelSwipe();
          U.vibrate(14);
          r.classList.add('held');
          setTimeout(() => r.classList.remove('held'), 420);
          M.txActions(t);
        }, HOLD);
      },
      { passive: true }
    );
    document.addEventListener(
      'pointermove',
      (e) => {
        if (h && e.pointerId === h.id && (Math.abs(e.clientX - h.x) > SLOP || Math.abs(e.clientY - h.y) > SLOP)) clear();
      },
      { passive: true }
    );
    ['pointerup', 'pointercancel'].forEach((n) =>
      document.addEventListener(n, (e) => {
        if (h && e.pointerId === h.id) clear();
        /* the finger lifting after a hold: swallow the click it makes, wherever it lands (the menu may now be under it) */
        if (firedId !== null && e.pointerId === firedId) {
          firedId = null;
          swallowUntil = Date.now() + 450;
        }
      }, true)
    );
    window.addEventListener('scroll', clear, { passive: true, capture: true });
    /* the finger lifting after a hold must not also open the edit form */
    document.addEventListener(
      'click',
      (e) => {
        if (firedId === null && Date.now() > swallowUntil) return;
        swallowUntil = 0;
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
    /* no browser long-press menu or text selection on rows */
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest && e.target.closest('.tx-row')) e.preventDefault();
    });
  })();
})();
