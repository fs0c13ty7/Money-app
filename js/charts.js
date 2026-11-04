/* Money Tracker — hand-drawn SVG charts with touch/hover tooltips. Colours come from CSS tokens. */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const C = (MT.charts = { reg: {} });
  let seq = 0;

  C.niceMax = (v) => {
    if (!v || v <= 0) return 10000;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < steps.length; i++) if (steps[i] * exp >= v) return steps[i] * exp;
    return 10 * exp;
  };
  const f1 = (n) => Math.round(n * 10) / 10;

  /* ---------- Month line: cumulative spend vs 3-month average, with forecast ---------- */
  C.monthLine = (fc, opts) => {
    const o = opts || {};
    const id = 'ch' + ++seq;
    const W = 340;
    const H = 168;
    const top = 12;
    const bottom = 140;
    const days = fc.days;
    const shown = fc.isCurrent ? fc.dayIdx : days;
    const vals = fc.actual.slice(0, shown);
    let max = Math.max(vals[vals.length - 1] || 0, fc.avg ? fc.avg[days - 1] : 0, fc.projection || 0);
    max = C.niceMax(max * 1.05);
    const x = (d) => f1((d / (days - 1)) * W);
    const y = (v) => f1(bottom - (v / max) * (bottom - top));
    const line = (arr, off) => arr.map((v, i) => (i ? 'L' : 'M') + x(i + (off || 0)) + ' ' + y(v)).join('');
    let svg = '';
    [0.5, 1].forEach((g) => {
      const gy = y(max * g);
      svg += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" class="grid"></line><text x="${W}" y="${gy - 5}" text-anchor="end" class="axis">${U.fmtShort(max * g)}</text>`;
    });
    svg += `<line x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" class="base"></line>`;
    if (fc.avg) svg += `<path d="${line(fc.avg)}" class="avg"></path>`;
    if (vals.length) {
      const area = line(vals) + `L${x(vals.length - 1)} ${bottom}L0 ${bottom}Z`;
      svg += `<path d="${area}" class="area"></path>`;
      svg += `<path d="${line(vals)}" class="actual${o.animate ? ' draw' : ''}" pathLength="1"></path>`;
    }
    if (fc.projSeries && fc.projSeries.length > 1) svg += `<path d="${line(fc.projSeries, fc.dayIdx - 1)}" class="proj"></path>`;
    if (fc.isCurrent && fc.dayIdx) {
      const tx = x(fc.dayIdx - 1);
      svg += `<line x1="${tx}" x2="${tx}" y1="${top}" y2="${bottom}" class="today"></line>`;
      if (fc.avg) svg += `<circle cx="${tx}" cy="${y(fc.avg[fc.dayIdx - 1])}" r="3.5" class="dot-avg"></circle>`;
      svg += `<circle cx="${tx}" cy="${y(vals[vals.length - 1] || 0)}" r="5" class="dot"></circle>`;
    }
    const startLbl = U.fmtShortDate(fc.start);
    const endLbl = U.fmtShortDate(MT.store.mEnd(fc.start));
    svg += `<text x="0" y="${H - 4}" class="axis">${startLbl}</text>`;
    if (fc.isCurrent && fc.dayIdx > 4 && fc.dayIdx < days - 3) svg += `<text x="${x(fc.dayIdx - 1)}" y="${H - 4}" text-anchor="middle" class="axis strong">Today</text>`;
    svg += `<text x="${W}" y="${H - 4}" text-anchor="end" class="axis">${endLbl}</text>`;
    svg += `<line class="cross" x1="0" x2="0" y1="${top}" y2="${bottom}" visibility="hidden"></line><circle class="cross-dot" r="4.5" cx="0" cy="0" visibility="hidden"></circle><circle class="cross-dot2" r="3.5" cx="0" cy="0" visibility="hidden"></circle>`;
    C.reg[id] = { kind: 'line', fc: fc, max: max, W: W, top: top, bottom: bottom };
    const label = `Spending so far in ${MT.store.mLabel(fc.start)}: ${U.fmt(fc.spent)}` + (fc.avgToDate != null ? `, against a usual ${U.fmt(fc.avgToDate)} by this point.` : '.');
    return `<div class="chart" data-chart-id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(label)}" class="chart-svg line-chart">${svg}<rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="hit"></rect></svg><div class="chart-tip" hidden></div></div>`;
  };

  /* ---------- Month flow: running totals of money in and money out ---------- */
  C.flowLine = (fl, opts) => {
    const o = opts || {};
    const id = 'ch' + ++seq;
    const W = 340;
    const H = 168;
    const top = 12;
    const bottom = 140;
    const days = fl.days;
    const shown = fl.isCurrent ? fl.dayIdx : days;
    const outV = fl.out.slice(0, shown);
    const inV = fl.inn.slice(0, shown);
    const max = C.niceMax(Math.max(outV[outV.length - 1] || 0, inV[inV.length - 1] || 0) * 1.05);
    const x = (d) => f1((d / (days - 1)) * W);
    const y = (v) => f1(bottom - (v / max) * (bottom - top));
    const line = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(v)).join('');
    let svg = '';
    let labels = '';
    [0.5, 1].forEach((g) => {
      const gy = y(max * g);
      svg += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" class="grid"></line>`;
      labels += `<text x="${W}" y="${gy - 5}" text-anchor="end" class="axis on-top">${U.fmtShort(max * g)}</text>`;
    });
    svg += `<line x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" class="base"></line>`;
    if (outV.length) {
      svg += `<path d="${line(outV)}L${x(outV.length - 1)} ${bottom}L0 ${bottom}Z" class="area"></path>`;
      svg += `<path d="${line(inV)}" class="in-line${o.animate ? ' draw' : ''}" pathLength="1"></path>`;
      svg += `<path d="${line(outV)}" class="actual${o.animate ? ' draw' : ''}" pathLength="1"></path>`;
    }
    if (fl.isCurrent && fl.dayIdx) {
      const tx = x(fl.dayIdx - 1);
      svg += `<line x1="${tx}" x2="${tx}" y1="${top}" y2="${bottom}" class="today"></line>`;
      svg += `<circle cx="${tx}" cy="${y(inV[inV.length - 1] || 0)}" r="4" class="dot-in"></circle>`;
      svg += `<circle cx="${tx}" cy="${y(outV[outV.length - 1] || 0)}" r="5" class="dot"></circle>`;
    }
    svg += labels;
    svg += `<text x="0" y="${H - 4}" class="axis">${U.fmtShortDate(fl.start)}</text>`;
    if (fl.isCurrent && fl.dayIdx > 4 && fl.dayIdx < days - 3) svg += `<text x="${x(fl.dayIdx - 1)}" y="${H - 4}" text-anchor="middle" class="axis strong">Today</text>`;
    svg += `<text x="${W}" y="${H - 4}" text-anchor="end" class="axis">${U.fmtShortDate(MT.store.mEnd(fl.start))}</text>`;
    svg += `<line class="cross" x1="0" x2="0" y1="${top}" y2="${bottom}" visibility="hidden"></line><circle class="cross-dot" r="4.5" cx="0" cy="0" visibility="hidden"></circle><circle class="cross-in" r="3.5" cx="0" cy="0" visibility="hidden"></circle>`;
    C.reg[id] = { kind: 'flow', fl: fl, max: max, W: W, top: top, bottom: bottom };
    const label = `${MT.store.mLabel(fl.start)}${fl.isCurrent ? ' so far' : ''}: money in ${U.fmt(fl.earned)}, money out ${U.fmt(fl.spent)}.`;
    return `<div class="chart" data-chart-id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(label)}" class="chart-svg line-chart">${svg}<rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="hit"></rect></svg><div class="chart-tip" hidden></div></div>`;
  };

  /* ---------- Balance over time: one point per month end ---------- */
  C.balanceLine = (points, opts) => {
    const o = opts || {};
    const id = 'ch' + ++seq;
    const W = 340;
    const H = 160;
    const top = 14;
    const bottom = 134;
    const vs = points.map((p) => p.v);
    let lo = Math.min.apply(null, vs);
    let hi = Math.max.apply(null, vs);
    const pad = (hi - lo) * 0.12 || Math.max(1000, Math.abs(hi) * 0.1);
    lo -= pad;
    hi += pad;
    const n = points.length;
    const x = (i) => f1((i / (n - 1)) * W);
    const y = (v) => f1(bottom - ((v - lo) / (hi - lo)) * (bottom - top));
    const line = points.map((p, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(p.v)).join('');
    let svg = '';
    let labels = '';
    [hi - pad, lo + pad].forEach((v) => {
      svg += `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"></line>`;
      labels += `<text x="${W}" y="${y(v) - 5}" text-anchor="end" class="axis on-top">${U.fmtShort(v)}</text>`;
    });
    if (lo < 0 && hi > 0) svg += `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="base"></line>`;
    svg += `<path d="${line}L${W} ${bottom}L0 ${bottom}Z" class="area"></path>`;
    svg += `<path d="${line}" class="actual${o.animate ? ' draw' : ''}" pathLength="1"></path>`;
    svg += `<circle cx="${x(n - 1)}" cy="${y(vs[n - 1])}" r="5" class="dot"></circle>`;
    svg += labels;
    const step = n > 7 ? 2 : 1;
    points.forEach((p, i) => {
      if ((n - 1 - i) % step === 0) svg += `<text x="${x(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" class="axis${i === n - 1 ? ' strong' : ''}">${U.esc(p.label)}</text>`;
    });
    svg += `<line class="cross" x1="0" x2="0" y1="${top}" y2="${bottom}" visibility="hidden"></line><circle class="cross-dot" r="4.5" cx="0" cy="0" visibility="hidden"></circle>`;
    C.reg[id] = { kind: 'bal', points: points, W: W, x: x, y: y };
    const label = `Balance over the last ${n} months: ${U.fmt(points[0].v)} to ${U.fmt(vs[n - 1])}.`;
    return `<div class="chart" data-chart-id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(label)}" class="chart-svg line-chart">${svg}<rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="hit"></rect></svg><div class="chart-tip" hidden></div></div>`;
  };

  /* ---------- Grouped bars: income vs spending by month ---------- */
  C.monthBars = (months) => {
    const id = 'ch' + ++seq;
    const W = 340;
    const H = 176;
    const top = 14;
    const bottom = 150;
    const n = months.length;
    const max = C.niceMax(Math.max.apply(null, months.map((m) => Math.max(m.in, m.out)).concat([1])) * 1.05);
    const gw = W / n;
    const bw = Math.min(16, gw / 3);
    const y = (v) => f1(bottom - (v / max) * (bottom - top));
    const bar = (x0, v, cls) => {
      const h = bottom - y(v);
      if (v <= 0) return '';
      const r = Math.min(4, h, bw / 2);
      const x1 = f1(x0 + bw);
      const yt = y(v);
      return `<path class="${cls}" d="M${f1(x0)} ${bottom}V${f1(yt + r)}Q${f1(x0)} ${yt} ${f1(x0 + r)} ${yt}H${f1(x1 - r)}Q${x1} ${yt} ${x1} ${f1(yt + r)}V${bottom}Z"></path>`;
    };
    let svg = '';
    [0.5, 1].forEach((g) => {
      const gy = y(max * g);
      svg += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" class="grid"></line><text x="0" y="${gy - 5}" class="axis">${U.fmtShort(max * g)}</text>`;
    });
    svg += `<line x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" class="base"></line>`;
    months.forEach((m, i) => {
      const cx = gw * i + gw / 2;
      svg += `<g class="grp" data-i="${i}">`;
      svg += bar(cx - bw - 1, m.out, 'bar-out');
      svg += bar(cx + 1, m.in, 'bar-in');
      svg += `<text x="${f1(cx)}" y="${H - 6}" text-anchor="middle" class="axis${i === n - 1 ? ' strong' : ''}">${m.label}</text>`;
      svg += `<rect x="${f1(gw * i)}" y="0" width="${f1(gw)}" height="${H}" fill="transparent" class="hit-g" data-i="${i}"></rect></g>`;
    });
    C.reg[id] = { kind: 'bars', months: months, W: W, gw: gw };
    const last = months[n - 1];
    const label = `Income and spending for the last ${n} months. ${last.label}: spent ${U.fmt(last.out)}, income ${U.fmt(last.in)}.`;
    return `<div class="chart" data-chart-id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(label)}" class="chart-svg bar-chart">${svg}</svg><div class="chart-tip" hidden></div></div>`;
  };

  /* ---------- Tooltip wiring ---------- */
  function showTip(wrap, html, xPct) {
    const tip = wrap.querySelector('.chart-tip');
    tip.innerHTML = html;
    tip.hidden = false;
    const w = wrap.clientWidth;
    const tw = tip.offsetWidth;
    let left = (xPct / 100) * w - tw / 2;
    left = Math.max(0, Math.min(w - tw, left));
    tip.style.transform = `translateX(${Math.round(left)}px)`;
  }
  function hideTip(wrap) {
    const tip = wrap.querySelector('.chart-tip');
    if (tip) tip.hidden = true;
  }

  C.mount = (root) => {
    root.querySelectorAll('[data-chart-id]').forEach((wrap) => {
      const d = C.reg[wrap.getAttribute('data-chart-id')];
      if (!d) return;
      const svg = wrap.querySelector('svg');
      if (d.kind === 'line') {
        const fc = d.fc;
        const cross = svg.querySelector('.cross');
        const dot = svg.querySelector('.cross-dot');
        const dot2 = svg.querySelector('.cross-dot2');
        const y = (v) => d.bottom - (v / d.max) * (d.bottom - d.top);
        const move = (ev) => {
          const r = svg.getBoundingClientRect();
          const px = Math.max(0, Math.min(r.width, ev.clientX - r.left));
          const di = Math.round((px / r.width) * (fc.days - 1));
          const X = (di / (fc.days - 1)) * d.W;
          const date = U.addDays(fc.start, di);
          const past = !fc.isCurrent || di < fc.dayIdx;
          let val = null;
          let lines = '';
          if (past) {
            val = fc.actual[di];
            lines += `<div class="tip-row"><span class="sw sw-out"></span>Spent <b>${U.fmt(val)}</b></div>`;
          } else if (fc.projSeries) {
            val = fc.projSeries[di - (fc.dayIdx - 1)];
            lines += `<div class="tip-row"><span class="sw sw-proj"></span>Forecast <b>${U.fmt(val)}</b></div>`;
          }
          if (fc.avg) lines += `<div class="tip-row"><span class="sw sw-avg"></span>Usual <b>${U.fmt(fc.avg[di])}</b></div>`;
          cross.setAttribute('x1', X);
          cross.setAttribute('x2', X);
          cross.setAttribute('visibility', 'visible');
          if (val != null) {
            dot.setAttribute('cx', X);
            dot.setAttribute('cy', y(val));
            dot.setAttribute('visibility', 'visible');
          } else dot.setAttribute('visibility', 'hidden');
          if (fc.avg) {
            dot2.setAttribute('cx', X);
            dot2.setAttribute('cy', y(fc.avg[di]));
            dot2.setAttribute('visibility', 'visible');
          }
          showTip(wrap, `<div class="tip-h">${U.fmtDay(date)}</div>${lines}`, (X / d.W) * 100);
        };
        const leave = () => {
          cross.setAttribute('visibility', 'hidden');
          dot.setAttribute('visibility', 'hidden');
          dot2.setAttribute('visibility', 'hidden');
          hideTip(wrap);
        };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerdown', move);
        svg.addEventListener('pointerleave', leave);
        svg.addEventListener('pointercancel', leave);
      } else if (d.kind === 'bal') {
        const cross = svg.querySelector('.cross');
        const dot = svg.querySelector('.cross-dot');
        const n = d.points.length;
        const move = (ev) => {
          const r = svg.getBoundingClientRect();
          const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left) / r.width) * (n - 1))));
          const p = d.points[i];
          const X = d.x(i);
          cross.setAttribute('x1', X);
          cross.setAttribute('x2', X);
          cross.setAttribute('visibility', 'visible');
          dot.setAttribute('cx', X);
          dot.setAttribute('cy', d.y(p.v));
          dot.setAttribute('visibility', 'visible');
          const prev = i ? p.v - d.points[i - 1].v : null;
          showTip(wrap, `<div class="tip-h">${U.esc(p.full)}</div><div class="tip-row"><span class="sw sw-out"></span>Balance <b>${U.fmt(p.v)}</b></div>${prev != null ? `<div class="tip-row muted">That month <b>${U.fmt(prev, { plus: true })}</b></div>` : ''}`, (X / d.W) * 100);
        };
        const leave = () => {
          cross.setAttribute('visibility', 'hidden');
          dot.setAttribute('visibility', 'hidden');
          hideTip(wrap);
        };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerdown', move);
        svg.addEventListener('pointerleave', leave);
        svg.addEventListener('pointercancel', leave);
      } else if (d.kind === 'flow') {
        const fl = d.fl;
        const cross = svg.querySelector('.cross');
        const dot = svg.querySelector('.cross-dot');
        const dotIn = svg.querySelector('.cross-in');
        const y = (v) => d.bottom - (v / d.max) * (d.bottom - d.top);
        const last = fl.isCurrent ? fl.dayIdx - 1 : fl.days - 1;
        const move = (ev) => {
          const r = svg.getBoundingClientRect();
          const px = Math.max(0, Math.min(r.width, ev.clientX - r.left));
          const di = Math.min(last, Math.round((px / r.width) * (fl.days - 1)));
          if (di < 0) return;
          const X = (di / (fl.days - 1)) * d.W;
          const o = fl.out[di];
          const i = fl.inn[di];
          cross.setAttribute('x1', X);
          cross.setAttribute('x2', X);
          cross.setAttribute('visibility', 'visible');
          dot.setAttribute('cx', X);
          dot.setAttribute('cy', y(o));
          dot.setAttribute('visibility', 'visible');
          dotIn.setAttribute('cx', X);
          dotIn.setAttribute('cy', y(i));
          dotIn.setAttribute('visibility', 'visible');
          showTip(wrap, `<div class="tip-h">${U.fmtDay(U.addDays(fl.start, di))}</div><div class="tip-row"><span class="sw sw-in"></span>Money in <b>${U.fmt(i)}</b></div><div class="tip-row"><span class="sw sw-out"></span>Money out <b>${U.fmt(o)}</b></div>`, (X / d.W) * 100);
        };
        const leave = () => {
          cross.setAttribute('visibility', 'hidden');
          dot.setAttribute('visibility', 'hidden');
          dotIn.setAttribute('visibility', 'hidden');
          hideTip(wrap);
        };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerdown', move);
        svg.addEventListener('pointerleave', leave);
        svg.addEventListener('pointercancel', leave);
      } else if (d.kind === 'bars') {
        let sel = -1;
        const pick = (i) => {
          sel = i;
          svg.classList.toggle('has-sel', i >= 0);
          svg.querySelectorAll('.grp').forEach((g) => g.classList.toggle('sel', Number(g.getAttribute('data-i')) === i));
          if (i < 0) return hideTip(wrap);
          const m = d.months[i];
          const net = m.in - m.out;
          showTip(
            wrap,
            `<div class="tip-h">${U.esc(m.full)}</div><div class="tip-row"><span class="sw sw-out"></span>Spent <b>${U.fmt(m.out)}</b></div><div class="tip-row"><span class="sw sw-in"></span>Income <b>${U.fmt(m.in)}</b></div><div class="tip-row muted">Net <b>${U.fmt(net, { plus: true })}</b></div>`,
            ((d.gw * i + d.gw / 2) / d.W) * 100
          );
        };
        svg.addEventListener('pointerover', (ev) => {
          if (ev.pointerType !== 'mouse') return;
          const t = ev.target.closest('.hit-g');
          if (t) pick(Number(t.getAttribute('data-i')));
        });
        svg.addEventListener('pointerleave', (ev) => {
          if (ev.pointerType === 'mouse') pick(-1);
        });
        svg.addEventListener('click', (ev) => {
          const t = ev.target.closest('.hit-g');
          if (!t) return;
          const i = Number(t.getAttribute('data-i'));
          pick(sel === i ? -1 : i);
        });
      }
    });
  };
})();
