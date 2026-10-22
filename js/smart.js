/* Money Tracker — on-device smart features: auto-category, type-to-log, forecast, watchdog alerts.
   Nothing here leaves the phone. */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const X = (MT.smart = {});

  X.norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9& ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const KEYWORDS = {
    food: 'coffee lunch dinner breakfast brunch cafe café restaurant pizza takeaway tea pub bar drinks snack snacks food groceries grocery tesco sainsbury sainsburys asda aldi lidl morrisons waitrose coop co op greggs mcdonalds mcdonald kfc nandos starbucks costa pret deliveroo justeat ubereats burger chippy fish chips sushi ramen curry kebab sandwich noodles bakery chicken wings steak tacos donut donuts cake icecream milkshake subway wagamama nando toby harvester wetherspoons spoons',
    transport: 'uber bolt taxi cab bus train rail tfl fuel petrol diesel parking toll trainline metro tram',
    bills: 'broadband electric electricity gas water council tax phone mobile rent ee vodafone o2 three bt sky virgin licence wifi energy octopus',
    shopping: 'amazon ebay clothes shoes argos primark ikea asos shopping',
    health: 'gym pharmacy boots dentist doctor physio vitamins',
    fun: 'cinema film netflix disney steam playstation xbox concert gig theatre bowling',
    music: 'spotify music vinyl guitar',
    pet: 'vet pet dog cat pets',
    travel: 'hotel flight flights airbnb holiday hostel',
    gifts: 'gift present donation charity birthday',
    insure: 'insurance',
    fees: 'fee fees charge overdraft',
    home: 'diy furniture homebase cleaning',
    invest: 'invest isa shares stocks',
    salary: 'salary wage wages pay payroll payday',
    refund: 'refund refunded return',
    selling: 'sold vinted sale',
    interest: 'interest',
    award: 'bonus award prize'
  };
  const KW = {};
  Object.keys(KEYWORDS).forEach((cat) => KEYWORDS[cat].split(' ').forEach((w) => (KW[w] = cat)));

  /* Best category for a name: your own history first, then common keywords */
  /* word -> how often each category was used for entries containing it */
  const STOP = new Set('the and for with from to of at in on a an my me our your new old mum dad my x2 x3 pay payment card online shop store ltd uk co com www'.split(' '));
  const stem = (w) => (w.length > 4 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
  const wordsOf = (n) => n.split(' ').map(stem).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w));
  let wordIdx = { rev: -1, n: -1, map: null };
  const wordIndex = () => {
    if (wordIdx.rev === S.rev && wordIdx.n === S.tx.length && wordIdx.map) return wordIdx.map;
    const map = new Map();
    S.tx.forEach((t) => {
      if (!t.name || !S.isStat(t)) return;
      new Set(wordsOf(X.norm(t.name))).forEach((w) => {
        const key = t.type + ':' + w;
        let m = map.get(key);
        if (!m) map.set(key, (m = { total: 0, cats: {} }));
        m.total += 1;
        m.cats[t.categoryId] = (m.cats[t.categoryId] || 0) + 1;
      });
    });
    wordIdx = { rev: S.rev, n: S.tx.length, map: map };
    return map;
  };
  const fromWords = (n, type) => {
    const idx = wordIndex();
    const score = {};
    let seen = 0;
    wordsOf(n).forEach((w) => {
      const m = idx.get(type + ':' + w);
      if (!m || m.total < 2) return; /* a word seen once is too thin to learn from */
      seen += 1;
      /* words that always meant the same category count most; very common words count less */
      const weight = 1 / Math.log2(2 + Math.min(m.total, 50) / 10);
      Object.keys(m.cats).forEach((c) => (score[c] = (score[c] || 0) + (m.cats[c] / m.total) * weight));
    });
    if (!seen) return null;
    const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
    const top = ranked[0];
    const total = ranked.reduce((a, c) => a + score[c], 0);
    if (!top || score[top] / total < 0.6) return null;
    const c = S.cats.find((x) => x.id === top);
    return c && c.type === type ? top : null;
  };

  X.suggestCategory = (name, type) => {
    const n = X.norm(name);
    if (!n) return null;
    const counts = {};
    S.tx.forEach((t) => {
      if (t.type === type && S.isStat(t) && X.norm(t.name) === n) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
    });
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (best && S.cats.find((c) => c.id === best)) return best;
    /* learn from the words in your own history: a word you've always filed under one category points to it */
    const learned = fromWords(n, type);
    if (learned) return learned;
    const words = n.split(' ');
    for (let i = 0; i < words.length; i++) {
      const id = KW[words[i]];
      const c = id && S.cats.find((x) => x.id === id);
      if (c && c.type === type) return id;
    }
    const joined = n.replace(/ /g, '');
    if (KW[joined]) {
      const c = S.cats.find((x) => x.id === KW[joined]);
      if (c && c.type === type) return c.id;
    }
    return null;
  };

  /* Past names that start with / contain what's typed, most recent first */
  X.nameSuggestions = (text, type, limit) => {
    const n = X.norm(text);
    if (n.length < 1) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < S.tx.length && out.length < (limit || 4); i++) {
      const t = S.tx[i];
      if (t.type !== type || !t.name || !S.isStat(t)) continue;
      const tn = X.norm(t.name);
      if (seen.has(tn) || tn === n || tn.indexOf(n) === -1) continue;
      seen.add(tn);
      out.push({ name: t.name, categoryId: t.categoryId, amount: t.amount });
    }
    return out;
  };

  /* "coffee 3.40 yesterday" -> { amount, date, name, type, categoryId } */
  const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  X.parse = (text, currentType) => {
    let s = ' ' + String(text || '').trim() + ' ';
    if (!s.trim()) return null;
    const out = {};
    const amt = s.match(/\s([+-])?£?(\d{1,7}(?:[.,]\d{1,2})?)(?=\s)/);
    if (amt) {
      const p = U.parseMoney(amt[2].replace(',', '.'));
      if (p) {
        out.amount = p;
        if (amt[1] === '+') out.type = 'income';
        s = s.replace(amt[0], ' ');
      }
    }
    const today = U.today();
    const lower = s.toLowerCase();
    let m;
    if (/\b(today|tonight)\b/.test(lower)) {
      out.date = today;
      s = s.replace(/\b(today|tonight)\b/i, ' ');
    } else if (/\byesterday\b/.test(lower)) {
      out.date = U.addDays(today, -1);
      s = s.replace(/\byesterday\b/i, ' ');
    } else if ((m = lower.match(/\b(?:last |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
      const idx = WD.indexOf(m[1]);
      if (idx >= 0) {
        const d = U.parse(today);
        let back = (d.getDay() - idx + 7) % 7;
        if (back === 0 && /last/.test(m[0])) back = 7;
        out.date = U.addDays(today, -back);
        s = s.replace(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
      }
    } else if ((m = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      let yy = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
      if (yy < 100) yy += 2000;
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= U.dim(yy, mm - 1)) {
        let iso = yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
        if (!m[3] && iso > today) iso = yy - 1 + iso.slice(4);
        out.date = iso;
        s = s.replace(m[0], ' ');
      }
    }
    if (/\b(income|received|got paid)\b/i.test(s)) {
      out.type = 'income';
      s = s.replace(/\b(income|received|got paid)\b/i, ' ');
    }
    const name = s.replace(/\b(on|for|at|spent|paid)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (name) out.name = name.charAt(0).toUpperCase() + name.slice(1);
    const type = out.type || currentType || 'expense';
    let cat = out.name ? X.suggestCategory(out.name, type) : null;
    if (!cat && !out.type && out.name) {
      const inc = X.suggestCategory(out.name, 'income');
      if (inc && ['salary', 'refund', 'selling', 'interest', 'award'].indexOf(inc) >= 0) {
        out.type = 'income';
        cat = inc;
      }
    }
    if (cat) out.categoryId = cat;
    if (!out.amount && !out.date) return null;
    return out;
  };

  /* ---------- Forecast: where this month's spending is heading ---------- */
  X.forecast = (monthIso) => {
    const start = S.mStart(monthIso);
    const days = S.mDays(start);
    const today = U.today();
    const isCurrent = S.mStart(today) === start;
    const dayIdx = isCurrent ? U.daysBetween(start, today) + 1 : today > start ? days : 0;
    const actual = S.monthCumulative(start);
    /* average cumulative of the previous 3 months that have data */
    const prev = [];
    for (let k = 1; k <= 3; k++) {
      const ms = S.mAdd(start, -k);
      const first = S.firstDate();
      if (!first || S.mEnd(ms) < first) continue;
      const cum = S.monthCumulative(ms);
      if (cum[cum.length - 1] > 0) prev.push(cum);
    }
    let avg = null;
    if (prev.length) {
      avg = [];
      for (let d = 0; d < days; d++) {
        let sum = 0;
        prev.forEach((c) => (sum += c[Math.min(d, c.length - 1)]));
        avg.push(Math.round(sum / prev.length));
      }
    }
    const spent = dayIdx ? actual[dayIdx - 1] : 0;
    let projection = null;
    let projSeries = null;
    if (isCurrent && dayIdx < days) {
      if (avg) {
        const base = avg[dayIdx - 1];
        projSeries = [];
        for (let d = dayIdx - 1; d < days; d++) projSeries.push(spent + Math.max(0, avg[d] - base));
        projection = projSeries[projSeries.length - 1];
      } else if (dayIdx >= 5 && spent > 0) {
        const perDay = spent / dayIdx;
        projSeries = [];
        for (let d = dayIdx - 1; d < days; d++) projSeries.push(Math.round(perDay * (d + 1)));
        projection = projSeries[projSeries.length - 1];
      }
    }
    return {
      start: start,
      days: days,
      dayIdx: dayIdx,
      isCurrent: isCurrent,
      actual: actual,
      avg: avg,
      avgMonths: prev.length,
      spent: spent,
      avgToDate: avg && dayIdx ? avg[dayIdx - 1] : null,
      projection: projection,
      projSeries: projSeries
    };
  };

  /* ---------- Recurring payments spotted in your history ----------
     Same name, about a month apart, roughly the same amount, at most about once a month. */
  X.recurringSuggestions = () => {
    const today = U.today();
    const since = U.addDays(today, -200);
    const have = new Set(S.rec.map((r) => r.type + '|' + X.norm(r.name)));
    const dismissed = new Set(S.meta.dismissedRec || []);
    const groups = {};
    S.tx.forEach((t) => {
      if (!t.name || t.recurringId || t.categoryId === 'adjust' || t.date < since) return;
      const k = t.type + '|' + X.norm(t.name);
      (groups[k] = groups[k] || []).push(t);
    });
    const out = [];
    Object.keys(groups).forEach((k) => {
      if (have.has(k) || dismissed.has(k)) return;
      const list = groups[k].slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const byMonth = {};
      const perMonth = {};
      list.forEach((t) => {
        const m = t.date.slice(0, 7);
        byMonth[m] = t;
        perMonth[m] = (perMonth[m] || 0) + 1;
      });
      const months = Object.keys(byMonth).sort();
      if (months.length < 2) return;
      const last = byMonth[months[months.length - 1]];
      const prev = byMonth[months[months.length - 2]];
      const gap = U.daysBetween(prev.date, last.date);
      if (gap < 20 || gap > 45 || last.date < U.addDays(today, -40)) return;
      const recent = months.slice(-3);
      if (recent.reduce((a, m) => a + perMonth[m], 0) > recent.length + 1) return;
      if (recent.some((m) => Math.abs(byMonth[m].amount - last.amount) / last.amount > 0.2)) return;
      const days = recent.map((m) => Number(byMonth[m].date.slice(8)));
      const count = {};
      days.forEach((d) => (count[d] = (count[d] || 0) + 1));
      let anchor = days[days.length - 1];
      Object.keys(count).forEach((d) => {
        if (count[d] > count[anchor]) anchor = Number(d);
      });
      let next = U.addMonths(last.date, 1, anchor);
      while (next <= today) next = U.addMonths(next, 1, anchor);
      out.push({ key: k, name: last.name, type: last.type, amount: last.amount, categoryId: S.cats.find((c) => c.id === last.categoryId) ? last.categoryId : S.fallbackFor(last.type), anchor: anchor, nextDate: next, months: months.length, prevAmount: prev.amount !== last.amount ? prev.amount : null });
    });
    return out.sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : b.amount - a.amount));
  };

  /* ---------- Watchdog alerts ---------- */
  X.alerts = () => {
    const out = [];
    const today = U.today();
    const recent = S.tx.filter((t) => S.isStat(t) && t.date >= U.addDays(today, -14));
    /* possible double charges */
    for (let i = 0; i < recent.length; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        const a = recent[i];
        const b = recent[j];
        if (a.type !== 'expense' || b.type !== 'expense' || a.amount !== b.amount) continue;
        if (a.recurringId && b.recurringId) continue;
        if (Math.abs(U.daysBetween(a.date, b.date)) > 1) continue;
        const sameName = X.norm(a.name) && X.norm(a.name) === X.norm(b.name);
        const sameCatNoName = !a.name && !b.name && a.categoryId === b.categoryId;
        if (!sameName && !sameCatNoName) continue;
        const ids = [a.id, b.id].sort();
        out.push({
          id: 'dup:' + ids.join(':'),
          kind: 'warn',
          icon: 'alert',
          title: 'Possible double entry',
          body: (a.name || S.cat(a.categoryId).name) + ' · ' + U.fmt(a.amount) + ' logged twice, ' + U.fmtDay(b.date === a.date ? a.date : b.date) + '.',
          txId: a.id
        });
      }
    }
    /* price changes on regular payments (same name, roughly monthly) */
    const byName = {};
    S.tx.forEach((t) => {
      if (t.type !== 'expense' || !S.isStat(t) || !t.name) return;
      (byName[X.norm(t.name)] = byName[X.norm(t.name)] || []).push(t);
    });
    Object.keys(byName).forEach((k) => {
      const list = byName[k];
      /* only for steady payments: the two before the latest were the same price, about a month apart */
      if (list.length < 3) return;
      const a = list[0];
      const b = list[1];
      const c = list[2];
      const gap = U.daysBetween(b.date, a.date);
      const gap2 = U.daysBetween(c.date, b.date);
      if (a.date < U.addDays(today, -40) || gap < 24 || gap > 38 || gap2 < 24 || gap2 > 38) return;
      if (b.amount !== c.amount || a.amount === b.amount) return;
      const up = a.amount > b.amount;
      out.push({
        id: 'price:' + a.id,
        kind: up ? 'warn' : 'info',
        icon: up ? 'up' : 'down',
        title: a.name + (up ? ' went up' : ' went down'),
        body: U.fmt(b.amount) + ' → ' + U.fmt(a.amount) + ' (' + (up ? '+' : '−') + U.fmt(Math.abs(a.amount - b.amount)) + ' a month).',
        txId: a.id
      });
    });
    /* unusually large spends in the last week, against that category's last 90 days */
    S.tx.forEach((t) => {
      if (t.type !== 'expense' || !S.isStat(t) || t.date < U.addDays(today, -7) || t.recurringId) return;
      const pool = S.tx.filter((h) => h.id !== t.id && h.type === 'expense' && h.date < t.date && h.date >= U.addDays(t.date, -90));
      const sameName = X.norm(t.name) ? pool.filter((h) => X.norm(h.name) === X.norm(t.name)) : [];
      const hist = (sameName.length >= 3 ? sameName : pool.filter((h) => h.categoryId === t.categoryId && !(X.norm(t.name) && X.norm(h.name) && X.norm(h.name) !== X.norm(t.name))))
        .map((h) => h.amount)
        .sort((x, y) => x - y);
      if (hist.length < 3) return;
      const median = hist[Math.floor(hist.length / 2)];
      if (t.amount >= 2000 && t.amount > median * 3) {
        out.push({
          id: 'big:' + t.id,
          kind: 'info',
          icon: 'info',
          title: 'Bigger than usual',
          body: (t.name || S.cat(t.categoryId).name) + ' · ' + U.fmt(t.amount) + ' is about ' + Math.round(t.amount / median) + '× what you usually spend' + (sameName.length >= 3 ? ' there.' : ' on ' + S.cat(t.categoryId).name + '.'),
          txId: t.id
        });
      }
    });
    const dismissed = new Set(S.meta.dismissed || []);
    return out.filter((a) => !dismissed.has(a.id)).slice(0, 3);
  };
})();
