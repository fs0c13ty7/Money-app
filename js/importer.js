/* Money Tracker — Money Lover CSV import. Runs entirely on the phone; the file never leaves it. */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const I = (MT.importer = {});

  /* RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF */
  I.parseCSV = (text) => {
    const rows = [];
    let row = [];
    let f = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            f += '"';
            i++;
          } else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        row.push(f);
        f = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f);
        rows.push(row);
        row = [];
        f = '';
      } else f += c;
    }
    if (f !== '' || row.length) {
      row.push(f);
      rows.push(row);
    }
    return rows;
  };

  const ICON_GUESS = { loan: 'percent', debt: 'percent', mortgage: 'house', rent: 'house', education: 'book', kids: 'family', children: 'family', car: 'car', coffee: 'coffee', groceries: 'cart', phone: 'phoneCat', games: 'game' };
  const guessIcon = (name) => {
    const n = name.toLowerCase();
    const k = Object.keys(ICON_GUESS).find((w) => n.indexOf(w) >= 0);
    return k ? ICON_GUESS[k] : 'box';
  };

  I.fromMoneyLover = (text) => {
    const rows = I.parseCSV(String(text || '').replace(/^﻿/, ''));
    if (rows.length < 2) return { ok: false, error: 'That file has no transactions in it.' };
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (n) => head.indexOf(n);
    const iId = col('id');
    const iNote = col('note');
    const iAmt = col('amount');
    const iCat = col('category');
    const iDate = col('date');
    const iCur = col('currency');
    const iEx = col('exclude report');
    if (iAmt < 0 || iCat < 0 || iDate < 0) return { ok: false, error: 'This doesn’t look like a Money Lover export. It needs Amount, Category and Date columns.' };

    const byName = {};
    S.cats.forEach((c) => {
      if (!c.system) byName[c.type + '|' + c.name.toLowerCase()] = c;
    });
    const newCats = {};
    const tx = [];
    let skipped = 0;
    let excluded = 0;
    let otherCurrency = 0;
    const now = Date.now();
    rows.slice(1).forEach((r, n) => {
      if (r.length === 1 && !r[0].trim()) return;
      const raw = String(r[iAmt] || '').trim();
      const neg = raw.charAt(0) === '-';
      const pence = U.parseMoney(raw.replace(/^[-+]/, ''));
      const dm = String(r[iDate] || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!pence || !dm || Number(dm[2]) > 12 || Number(dm[1]) > 31) {
        skipped++;
        return;
      }
      const date = dm[3] + '-' + dm[2].padStart(2, '0') + '-' + dm[1].padStart(2, '0');
      const type = neg ? 'expense' : 'income';
      const cname = String(r[iCat] || '').trim() || (neg ? 'Other Expense' : 'Other Income');
      const key = type + '|' + cname.toLowerCase();
      let cat = byName[key] || newCats[key];
      if (!cat) {
        cat = newCats[key] = { id: 'ml_' + type + '_' + cname.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: cname.slice(0, 40), type: type, icon: guessIcon(cname), color: 'slate', builtIn: false };
      }
      if (iCur >= 0 && r[iCur] && r[iCur].trim() && r[iCur].trim().toUpperCase() !== 'GBP') otherCurrency++;
      const ex = iEx >= 0 && /^true$/i.test(String(r[iEx] || '').trim());
      if (ex) excluded++;
      const text = String(iNote >= 0 ? r[iNote] || '' : '').trim();
      const id = 'ml_' + (iId >= 0 && String(r[iId] || '').trim() ? String(r[iId]).trim() : 'row' + n);
      const t = { id: id, type: type, amount: pence, categoryId: cat.id, name: text.slice(0, 80), note: text.length > 80 ? text : '', date: date, recurringId: null, source: 'moneylover', createdAt: now - n, updatedAt: now };
      if (ex) t.excluded = true;
      tx.push(t);
    });
    if (!tx.length) return { ok: false, error: 'No transactions could be read from that file.' };
    const dates = tx.map((t) => t.date).sort();
    return {
      ok: true,
      tx: tx,
      newCats: Object.values(newCats),
      summary: {
        count: tx.length,
        from: dates[0],
        to: dates[dates.length - 1],
        balance: tx.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0),
        skipped: skipped,
        excluded: excluded,
        otherCurrency: otherCurrency
      }
    };
  };

  /* mode 'replace': the import becomes your full history (a snapshot of the current data is kept first)
     mode 'add': imported entries are added; anything already imported before is skipped */
  I.apply = async (res, mode) => {
    if (mode === 'replace') {
      await S.replaceAll({ tx: res.tx, categories: S.cats.concat(res.newCats.filter((c) => !S.cats.find((x) => x.id === c.id))), recurring: S.rec.slice(), settings: null });
      return res.tx.length;
    }
    const have = new Set(S.tx.map((t) => t.id));
    const fresh = res.tx.filter((t) => !have.has(t.id));
    await S.addBatch(res.newCats.filter((c) => !S.cats.find((x) => x.id === c.id)), fresh);
    return fresh.length;
  };
})();
