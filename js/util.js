/* Money Tracker — shared helpers: escaping, money (integer pence), dates (local YYYY-MM-DD), icons */
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});
  const U = (MT.util = {});

  U.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  U.uid = (prefix) => (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- Money: always integer pence, never floats ---------- */
  U.fmt = (pence, opts) => {
    const o = opts || {};
    const p = Math.round(pence || 0);
    const neg = p < 0;
    const abs = Math.abs(p);
    const pounds = Math.floor(abs / 100).toLocaleString('en-GB');
    const pp = String(abs % 100).padStart(2, '0');
    const sign = neg ? '−' : o.plus && p > 0 ? '+' : '';
    return sign + '£' + pounds + '.' + pp;
  };
  U.fmtSigned = (tx) => (tx.type === 'income' ? '+' : '−') + U.fmt(tx.amount);
  U.fmtShort = (pence) => {
    const v = Math.abs(pence) / 100;
    if (v >= 1000) return '£' + (Math.round(v / 100) / 10).toString().replace(/\.0$/, '') + 'k';
    return '£' + Math.round(v);
  };
  /* Parse "12", "12.4", "£1,204.50", ".5" -> pence, or null when not a valid amount */
  U.parseMoney = (str) => {
    const clean = String(str == null ? '' : str).replace(/[£,\s]/g, '');
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(clean)) return null;
    const parts = clean.split('.');
    const whole = parts[0] ? Number(parts[0]) : 0;
    const frac = Number(((parts[1] || '') + '00').slice(0, 2));
    if (!Number.isSafeInteger(whole)) return null;
    return whole * 100 + frac;
  };
  /* Keypad string ("12.4") -> pence */
  U.keypadPence = (s) => U.parseMoney(s) || 0;
  U.keypadDisplay = (s) => {
    const parts = String(s).split('.');
    const whole = Number(parts[0] || 0).toLocaleString('en-GB');
    return '£' + whole + (parts.length > 1 ? '.' + parts[1] : '');
  };
  U.penceToInput = (p) => (p / 100).toFixed(2);

  /* ---------- Dates: local calendar dates as YYYY-MM-DD strings ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  U.iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  U.parse = (s) => {
    const a = s.split('-').map(Number);
    return new Date(a[0], a[1] - 1, a[2]);
  };
  U.today = () => U.iso(new Date());
  U.addDays = (s, n) => {
    const d = U.parse(s);
    d.setDate(d.getDate() + n);
    return U.iso(d);
  };
  U.dim = (y, m0) => new Date(y, m0 + 1, 0).getDate();
  U.monthStart = (s) => s.slice(0, 8) + '01';
  U.monthEnd = (s) => {
    const d = U.parse(s);
    return s.slice(0, 8) + pad(U.dim(d.getFullYear(), d.getMonth()));
  };
  U.addMonths = (s, n, anchorDay) => {
    const d = U.parse(s);
    const day = anchorDay || d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(day, U.dim(t.getFullYear(), t.getMonth())));
    return U.iso(t);
  };
  U.weekStart = (s, ws) => {
    const d = U.parse(s);
    const diff = (d.getDay() - ws + 7) % 7;
    return U.addDays(s, -diff);
  };
  U.daysBetween = (a, b) => Math.round((U.parse(b) - U.parse(a)) / 86400000);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  U.DOW = DOW;
  U.MON = MON;
  U.MONL = MONL;
  U.fmtDay = (s) => {
    const t = U.today();
    if (s === t) return 'Today';
    if (s === U.addDays(t, -1)) return 'Yesterday';
    if (s === U.addDays(t, 1)) return 'Tomorrow';
    const d = U.parse(s);
    const yr = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + yr;
  };
  U.fmtDayLong = (s) => {
    const d = U.parse(s);
    return DOWL[d.getDay()] + ' ' + d.getDate() + ' ' + MONL[d.getMonth()];
  };
  U.fmtMonth = (s) => {
    const d = U.parse(s);
    return MONL[d.getMonth()] + ' ' + d.getFullYear();
  };
  U.fmtShortDate = (s) => {
    const d = U.parse(s);
    return d.getDate() + ' ' + MON[d.getMonth()];
  };
  U.dowLong = (s) => DOWL[U.parse(s).getDay()];
  U.fmtTime = (ms) => {
    const d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  U.ago = (ms) => {
    if (!ms) return 'never';
    const day = U.iso(new Date(ms));
    const t = U.today();
    if (day === t) return 'today, ' + U.fmtTime(ms);
    if (day === U.addDays(t, -1)) return 'yesterday, ' + U.fmtTime(ms);
    const n = U.daysBetween(day, t);
    return n + ' days ago';
  };
  U.ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  /* ---------- Icons: single-path strokes, 24px grid ---------- */
  const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  U.ICONS = {
    search: circle(11, 11, 7) + 'M20 20l-3.5-3.5',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' + circle(12, 12, 3),
    eyeOff: 'M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    back: 'M15 6l-6 6 6 6',
    chevR: 'M9 6l6 6-6 6',
    chevL: 'M15 6l-6 6 6 6',
    chevD: 'M6 9l6 6 6-6',
    home: 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
    insights: 'M5 20v-8M11 20V5M17 20v-11M3 20h18',
    more: 'M5 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM16 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zM16 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
    wallet: 'M3 7a2 2 0 0 1 2-2h13v4M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7M16.5 14h.01',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12' + circle(16, 6, 2) + circle(10, 12, 2) + circle(18, 18, 2),
    down: 'M3 7l6 6 4-4 8 8M21 11v6h-6',
    up: 'M3 17l6-6 4 4 8-8M21 13V7h-6',
    check: 'M5 12l5 5L20 7',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
    shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
    download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    upload: 'M12 15V3M7 8l5-5 5 5M5 21h14',
    share: 'M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
    calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
    note: 'M4 6h16M4 12h16M4 18h10',
    lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    info: circle(12, 12, 9) + 'M12 11v5M12 8h.01',
    sun: circle(12, 12, 4) + 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    system: 'M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 20h6M12 16v4',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    spark: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    minus: 'M5 12h14',
    backspace: 'M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zM12 9l5 6M17 9l-5 6',
    phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
    pause: 'M8 5v14M16 5v14',
    play: 'M7 4l13 8-13 8z',
    /* category icons */
    bills: 'M13 2L4 14h7l-1 8 9-12h-7z',
    fun: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2zM14 6v2M14 11v2M14 16v2',
    family: circle(9, 8, 3) + 'M3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M16 14.3a5 5 0 0 1 5 4.7',
    fees: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 15l6-6M9.5 9.5h.01M14.5 14.5h.01',
    food: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 1.5-3 4-3 7h3v11',
    heart: 'M12 20s-8.8-6-8.8-11.4A5 5 0 0 1 12 5.4a5 5 0 0 1 8.8 3.2C20.8 14 12 20 12 20z',
    gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-1.5-3-5-3.5-5-1.5S10 8 12 8zM12 8c1.5-3 5-3.5 5-1.5S14 8 12 8z',
    health: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11',
    house: 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    insure: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM12 8v6M9 11h6',
    invest: 'M3 3v18h18M7 15l4-4 3 3 6-6M16 8h4v4',
    music: 'M9 18V5l11-2v13' + circle(6, 18, 3) + circle(17, 16, 3),
    box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    out: 'M7 17L17 7M9 7h8v8',
    in: 'M17 7L7 17M15 17H7V9',
    pet: circle(5, 10, 1.6) + circle(9, 6, 1.8) + circle(15, 6, 1.8) + circle(19, 10, 1.6) + 'M12 12c-3 0-6 4-6 6.5 0 1.5 1.5 2.5 3 2l3-1 3 1c1.5.5 3-.5 3-2C18 16 15 12 12 12z',
    bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
    bus: 'M7 3h10a3 3 0 0 1 3 3v11H4V6a3 3 0 0 1 3-3zM4 11h16M7 17v3M17 17v3',
    plane: 'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
    award: circle(12, 9, 6) + 'M8.2 13.9L7 22l5-3 5 3-1.2-8.1',
    percent: 'M19 5L5 19' + circle(6.5, 6.5, 2.5) + circle(17.5, 17.5, 2.5),
    refund: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    salary: 'M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18',
    tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
    coffee: 'M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3',
    cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M8 20h.01M17 20h.01',
    book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h14',
    car: 'M5 16H3v-4l2-5h14l2 5v4h-2M5 16h14M7 16v3M17 16v3M3 12h18',
    phoneCat: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
    game: 'M6 9h12a3 3 0 0 1 3 3v3a3 3 0 0 1-5.2 2L14 15h-4l-1.8 2A3 3 0 0 1 3 15v-3a3 3 0 0 1 3-3zM8 11v4M6 13h4M16 12h.01M18 14h.01'
  };
  U.icon = (name, size, sw) =>
    `<svg aria-hidden="true" class="ic" width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round"><path d="${U.ICONS[name] || U.ICONS.box}"></path></svg>`;

  U.COLORS = ['blue', 'indigo', 'purple', 'teal', 'green', 'sky', 'amber', 'orange', 'red', 'pink', 'slate'];
  U.COLOR_NAMES = { blue: 'Blue', indigo: 'Indigo', purple: 'Purple', teal: 'Teal', green: 'Green', sky: 'Sky', amber: 'Amber', orange: 'Orange', red: 'Red', pink: 'Pink', slate: 'Slate' };
  U.PICKABLE_ICONS = ['food', 'coffee', 'cart', 'bag', 'bus', 'car', 'plane', 'house', 'bills', 'phoneCat', 'health', 'heart', 'gift', 'pet', 'music', 'game', 'fun', 'book', 'family', 'invest', 'salary', 'tag', 'refund', 'box'];

  U.vibrate = (ms) => {
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 8);
    } catch (e) {}
  };
  U.reducedMotion = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  };
})();
