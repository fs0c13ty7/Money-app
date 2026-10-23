/* Tally — encrypted backup to your own Google Drive.
   After every change, a fresh backup is encrypted on this phone with a passphrase only you know,
   then uploaded to Tally's hidden app folder in your Drive. Google stores it but can't read it.
   One file per day is kept (the latest state of that day): the last 30 days, then one a month for a year. */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const UI = MT.ui;
  const C = (MT.cloud = {});

  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const ITER = 600000; /* PBKDF2-SHA256 rounds: slow enough to make guessing a passphrase impractical */
  const TOKEN_KEY = 'mt-gtoken';
  const STATE_KEY = 'mt-gstate';
  const DEBOUNCE = 3000;
  const PREFIX = 'tally-';

  let token = null; /* { value, exp } in memory, mirrored to localStorage on this phone only */
  let key = null; /* the AES key made from your passphrase (cannot be read back out) */
  let gisClient = null;
  let gisLoading = null;
  let tokenWaiters = [];
  let timer = null;
  let busy = false;
  let again = false;
  let listCache = null;
  C.status = { uploading: false };

  const cfg = () => S.meta.cloud || null;
  C.enabled = () => !!(cfg() && cfg().enabled && cfg().clientId && cfg().salt);
  C.supported = () => !!(window.crypto && crypto.subtle && window.fetch && !MT.PREVIEW);
  const saveCfg = async (patch) => {
    const next = Object.assign({}, cfg() || {}, patch);
    await S.setMeta('cloud', next);
    return next;
  };

  /* ---------- encoding helpers ---------- */
  const te = new TextEncoder();
  const td = new TextDecoder();
  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  const pipe = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();

  /* ---------- encryption ---------- */
  C.deriveKey = async (pass, salt, iter) => {
    const base = await crypto.subtle.importKey('raw', te.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter || ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };
  C.encrypt = async (obj, k, saltB64, iter) => {
    let bytes = te.encode(JSON.stringify(obj));
    const z = canGzip() ? 'gzip' : 'none';
    if (z === 'gzip') bytes = new Uint8Array(await pipe(bytes, new CompressionStream('gzip')));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, bytes);
    return JSON.stringify({ app: 'tally-cloud', v: 1, kdf: 'PBKDF2-SHA256', iter: iter || ITER, salt: saltB64, iv: b64(iv), z: z, ct: b64(ct) });
  };
  /* returns the backup object, or throws 'wrong-pass' / 'not-tally' */
  C.decrypt = async (text, pass, knownKey) => {
    let env;
    try {
      env = JSON.parse(text);
    } catch (e) {
      throw new Error('not-tally');
    }
    if (!env || env.app !== 'tally-cloud' || !env.ct || !env.iv || !env.salt) throw new Error('not-tally');
    const k = knownKey || (await C.deriveKey(pass, unb64(env.salt), env.iter));
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, k, unb64(env.ct));
    } catch (e) {
      throw new Error('wrong-pass');
    }
    if (env.z === 'gzip') plain = await pipe(new Uint8Array(plain), new DecompressionStream('gzip'));
    return { data: JSON.parse(td.decode(plain)), salt: env.salt, iter: env.iter };
  };

  /* ---------- Google sign-in ---------- */
  const tokenValid = () => token && token.exp - Date.now() > 120000;
  const loadToken = () => {
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (t && t.value && t.exp > Date.now()) token = t;
    } catch (e) {}
  };
  const setToken = (value, expiresIn) => {
    token = { value: value, exp: Date.now() + (Number(expiresIn) || 3600) * 1000 };
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    } catch (e) {}
    const w = tokenWaiters;
    tokenWaiters = [];
    w.forEach((fn) => fn.ok(token.value));
  };
  const dropToken = () => {
    token = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  };
  const failWaiters = (err) => {
    const w = tokenWaiters;
    tokenWaiters = [];
    w.forEach((fn) => fn.fail(err));
  };
  C.loadGis = () => {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisLoading = null;
        reject(new Error('offline'));
      };
      document.head.appendChild(s);
    });
    return gisLoading;
  };
  const client = (clientId) => {
    if (gisClient && gisClient.id === clientId) return gisClient.c;
    const c = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r && r.access_token) {
          C.popupFailedAt = 0;
          setToken(r.access_token, r.expires_in);
          UI.refreshCloud();
        } else failWaiters(new Error((r && r.error) || 'denied'));
      },
      error_callback: (e) => {
        if (!e || e.type !== 'popup_closed') C.popupFailedAt = Date.now();
        failWaiters(new Error((e && e.type) || 'popup_failed'));
        UI.refreshCloud();
      }
    });
    gisClient = { id: clientId, c: c };
    return c;
  };
  /* Must be called straight from a tap: Google only opens its sign-in window in response to one.
     Resolves with a token, or rejects if you close the window or it can't open. */
  C.signIn = (clientId) => {
    const id = clientId || (cfg() && cfg().clientId);
    if (!id) return Promise.reject(new Error('no-client'));
    if (tokenValid()) return Promise.resolve(token.value);
    const p = new Promise((ok, fail) => tokenWaiters.push({ ok: ok, fail: fail }));
    if (window.google && google.accounts && google.accounts.oauth2) {
      try {
        client(id).requestAccessToken({ prompt: '' });
      } catch (e) {
        failWaiters(e);
      }
    } else {
      /* Google's script still loading: wait for it (the tap still counts for a few seconds), then ask */
      C.loadGis()
        .then(() => client(id).requestAccessToken({ prompt: '' }))
        .catch(() => failWaiters(new Error('not-ready')));
    }
    return p;
  };
  /* Full-page sign-in, for when the pop-up window can't open: leaves the app and comes straight back */
  C.signInFullPage = (clientId) => {
    const id = clientId || (cfg() && cfg().clientId);
    if (!id) return;
    const state = U.uid('st');
    try {
      localStorage.setItem(STATE_KEY, state);
    } catch (e) {}
    const back = C.returnUrl();
    location.href =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({ client_id: id, redirect_uri: back, response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state: state }).toString();
  };
  /* the address Google sends you back to: the app's folder, the same however it was opened */
  C.returnUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
  /* On start-up: pick up a token handed back by the full-page sign-in */
  C.takeRedirect = () => {
    if (!location.hash || location.hash.indexOf('access_token=') < 0) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    let expect = null;
    try {
      expect = localStorage.getItem(STATE_KEY);
      localStorage.removeItem(STATE_KEY);
    } catch (e) {}
    history.replaceState(history.state, '', location.pathname + location.search);
    if (!expect || p.get('state') !== expect) return false;
    setToken(p.get('access_token'), p.get('expires_in'));
    return true;
  };
  /* Called first thing on Save: if sign-in has lapsed, ask now while we still have your tap */
  C.prime = () => {
    if (!C.enabled() || tokenValid() || !navigator.onLine) return;
    if (C.popupFailedAt && Date.now() - C.popupFailedAt < 86400000) return; /* pop-up didn't work today: use the banner instead */
    if (!(window.google && google.accounts && google.accounts.oauth2)) return;
    C.signIn().catch(() => {});
  };

  /* ---------- Drive ---------- */
  const http = async (url, opts) => {
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({ Authorization: 'Bearer ' + token.value }, o.headers || {});
    let res;
    try {
      res = await fetch(url, o);
    } catch (e) {
      throw new Error('offline');
    }
    if (res.status === 401) {
      dropToken();
      throw new Error('signin');
    }
    if (!res.ok) {
      let msg = '';
      try {
        msg = (await res.json()).error.message || '';
      } catch (e) {}
      if (res.status === 403 && /has not been used|is disabled|not enabled/i.test(msg)) throw new Error('api-off');
      if (res.status === 403 && /insufficient|scope/i.test(msg)) throw new Error('scope');
      throw new Error('drive ' + res.status + (msg ? ': ' + msg : ''));
    }
    return res;
  };
  C.list = async () => {
    const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'files(id,name,modifiedTime,size)', pageSize: '200', orderBy: 'name desc', q: "name contains '" + PREFIX + "'" });
    const res = await http(API + '?' + q.toString());
    const files = ((await res.json()).files || []).filter((f) => /^tally-\d{4}-\d{2}-\d{2}\.enc$/.test(f.name));
    files.sort((a, b) => (a.name < b.name ? 1 : -1));
    files.forEach((f) => (f.size = Number(f.size) || 0));
    listCache = { at: Date.now(), files: files };
    return files;
  };
  const listFresh = async () => (listCache && Date.now() - listCache.at < 300000 ? listCache.files : C.list());
  C.download = async (id) => (await http(API + '/' + encodeURIComponent(id) + '?alt=media')).text();
  const put = async (name, body, existing) => {
    if (existing) {
      await http(UPLOAD + '/' + encodeURIComponent(existing.id) + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: body });
      existing.size = body.length;
      existing.modifiedTime = new Date().toISOString();
      return existing;
    }
    const boundary = 'tally' + Math.random().toString(36).slice(2);
    const meta = { name: name, parents: ['appDataFolder'], mimeType: 'application/octet-stream' };
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await http(UPLOAD + '?uploadType=multipart&fields=id,name,modifiedTime,size', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: multipart });
    const f = await res.json();
    f.size = body.length;
    if (listCache) listCache.files.unshift(f);
    return f;
  };
  /* keep the last 30 days, then the newest copy of each month for a year */
  const prune = async (files) => {
    const cut30 = U.addDays(U.today(), -30);
    const cut1y = U.addDays(U.today(), -366);
    const seenMonth = new Set();
    const drop = [];
    files.forEach((f) => {
      const d = f.name.slice(PREFIX.length, PREFIX.length + 10);
      if (d >= cut30) return;
      const m = d.slice(0, 7);
      if (d >= cut1y && !seenMonth.has(m)) {
        seenMonth.add(m);
        return;
      }
      drop.push(f);
    });
    for (const f of drop) {
      try {
        await http(API + '/' + encodeURIComponent(f.id), { method: 'DELETE' });
        if (listCache) listCache.files = listCache.files.filter((x) => x.id !== f.id);
      } catch (e) {
        if (e.message === 'signin' || e.message === 'offline') throw e;
      }
    }
  };

  /* ---------- the backup itself ---------- */
  const getKey = async () => {
    if (key) return key;
    if (S.meta.cloudKey) key = S.meta.cloudKey;
    return key;
  };
  /* reasons a backup is waiting, shown on Home and in Backup */
  C.state = () => {
    const c = cfg();
    if (!C.enabled()) return { kind: 'off' };
    if (C.status.uploading) return { kind: 'uploading' };
    if (c.paused) return { kind: 'paused', size: c.paused };
    if (c.error && c.error !== 'signin' && c.error !== 'offline') return { kind: 'error', error: c.error };
    if (c.dirty) {
      if (!navigator.onLine || c.error === 'offline') return { kind: 'offline' };
      if (!tokenValid()) return { kind: 'signin' };
      return { kind: 'pending' };
    }
    return { kind: 'ok', at: c.lastUpload };
  };
  C.errorText = (e) =>
    ({
      'api-off': 'The Google Drive API is switched off in your Google Cloud project. Turn it on, then tap Back up now.',
      scope: 'Google didn’t give Tally access to its Drive folder. Tap Back up now and allow access.',
      'no-key': 'This phone has forgotten your passphrase. Set up Drive backup again with the same passphrase.'
    })[e] || 'Couldn’t reach Google Drive (' + e + '). Your data is safe on this phone; Tally will try again.';

  const schedule = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => C.flush().catch(() => {}), ms == null ? DEBOUNCE : ms);
  };
  /* something changed: mark it and upload shortly */
  C.changed = async () => {
    if (!C.enabled()) return;
    try {
      await saveCfg({ dirty: Date.now() });
    } catch (e) {}
    schedule();
  };
  /* upload now if we can. force=true: you confirmed a much smaller backup should replace the one in Drive */
  C.flush = async (force) => {
    if (!C.enabled()) return 'off';
    if (busy) {
      again = true;
      return 'busy';
    }
    if (!cfg().dirty && !force) return 'clean';
    if (!navigator.onLine) {
      await saveCfg({ error: 'offline' });
      UI.refreshCloud();
      return 'offline';
    }
    if (!tokenValid()) {
      await saveCfg({ error: 'signin' });
      UI.refreshCloud();
      return 'signin';
    }
    const k = await getKey();
    if (!k) {
      await saveCfg({ error: 'no-key' });
      UI.refreshCloud();
      return 'no-key';
    }
    busy = true;
    C.status.uploading = true;
    UI.refreshCloud();
    const startedDirty = cfg().dirty;
    try {
      const body = await C.encrypt(S.exportData(), k, cfg().salt, cfg().iter);
      const files = await listFresh();
      const name = PREFIX + U.today() + '.enc';
      const newest = files[0];
      /* safety: never quietly replace a backup with one much smaller (a wiped or reset phone, say) */
      if (!force && !cfg().allowShrink && newest && newest.size > 20000 && body.length < newest.size * 0.5) {
        await saveCfg({ paused: newest.size, error: null });
        return 'paused';
      }
      await put(name, body, files.find((f) => f.name === name));
      const stillDirty = cfg().dirty !== startedDirty; /* changed again while uploading */
      await saveCfg({ lastUpload: Date.now(), lastSize: body.length, dirty: stillDirty ? cfg().dirty : 0, error: null, paused: 0, allowShrink: false });
      try {
        await prune(listCache ? listCache.files : files);
      } catch (e) {}
      if (stillDirty) again = true;
      return 'ok';
    } catch (e) {
      const m = e.message || 'error';
      if (m === 'drive 404') listCache = null;
      await saveCfg({ error: m });
      return m;
    } finally {
      busy = false;
      C.status.uploading = false;
      UI.refreshCloud();
      if (again) {
        again = false;
        schedule(600);
      }
    }
  };
  /* a tap on "Back up now": sign in if needed (from the tap), then upload */
  C.backupNow = async (force) => {
    if (!C.enabled()) return;
    if (!tokenValid()) {
      try {
        await C.signIn();
      } catch (e) {
        await saveCfg({ error: 'signin' });
        UI.refreshCloud();
        throw e;
      }
    }
    if (force) await saveCfg({ allowShrink: true, paused: 0 });
    if (!cfg().dirty) await saveCfg({ dirty: Date.now() });
    return C.flush(!!force);
  };

  /* ---------- turning it on and off ---------- */
  C.validClientId = (s) => /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(String(s || '').trim());
  /* set up with a passphrase: a new random salt, so the key is unique to you */
  C.enable = async (clientId, pass, existingSalt, existingIter) => {
    const salt = existingSalt ? unb64(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
    const iter = existingIter || ITER;
    const k = await C.deriveKey(pass, salt, iter);
    key = k;
    await S.setMeta('cloudKey', k);
    await saveCfg({ enabled: true, clientId: String(clientId).trim(), salt: b64(salt), iter: iter, dirty: Date.now(), error: null, paused: 0, allowShrink: false, since: Date.now() });
    schedule(1000);
  };
  C.disable = async () => {
    clearTimeout(timer);
    key = null;
    dropToken();
    await S.setMeta('cloudKey', null);
    await saveCfg({ enabled: false, dirty: 0, error: null, paused: 0 });
  };
  /* delete every Tally backup from Drive (only when you ask) */
  C.deleteAll = async () => {
    const files = await C.list();
    for (const f of files) await http(API + '/' + encodeURIComponent(f.id), { method: 'DELETE' });
    listCache = { at: Date.now(), files: [] };
    return files.length;
  };

  /* ---------- start-up ---------- */
  C.init = () => {
    loadToken();
    const got = C.takeRedirect();
    if (C.enabled() || got) C.loadGis().catch(() => {});
    S.onChange(() => C.changed());
    /* settings changes count too (theme, payday and so on) */
    const setSetting = S.setSetting;
    S.setSetting = async (k, v) => {
      const r = await setSetting(k, v);
      C.changed();
      return r;
    };
    window.addEventListener('online', () => {
      if (C.enabled() && cfg().dirty) schedule(500);
      UI.refreshCloud();
    });
    window.addEventListener('offline', () => UI.refreshCloud());
    document.addEventListener('visibilitychange', () => {
      if (!C.enabled()) return;
      if (document.visibilityState === 'hidden' && cfg().dirty && tokenValid()) C.flush().catch(() => {});
      if (document.visibilityState === 'visible' && cfg().dirty) schedule(800);
    });
    if (C.enabled() && cfg().dirty) schedule(1500);
    return got;
  };
  C.tokenValid = tokenValid;
})();
