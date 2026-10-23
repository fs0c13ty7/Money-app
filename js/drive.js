/* Tally — screens for Google Drive backup: setting it up, restoring from it, and its status */
(function () {
  'use strict';
  const MT = window.MT;
  const U = MT.util;
  const S = MT.store;
  const C = MT.cloud;
  const UI = MT.ui;
  const M = MT.sheets;
  const A = UI.actions;
  const esc = U.esc;
  const ic = U.icon;
  const PENDING = 'mt-cloud-setup';

  /* ---------- status ---------- */
  let lastKey = '';
  UI.refreshCloud = () => {
    const st = C.state();
    const k = st.kind === 'uploading' ? 'up' : JSON.stringify(st);
    const r = UI.route && UI.route.name;
    if (r === 'backup') return UI.refresh();
    if (k === lastKey || k === 'up') return;
    lastKey = k;
    if (r === 'home' || r === 'more') UI.refresh();
  };
  const ago = (t) => (t ? U.ago(t) : 'not yet');
  UI.cloudLine = () => {
    const st = C.state();
    return (
      {
        off: 'Off',
        uploading: 'Backing up now…',
        ok: 'Backed up ' + ago(st.at),
        pending: 'Backing up in a moment',
        signin: 'Waiting for you to sign in to Google',
        offline: 'Waiting for a connection',
        paused: 'Paused: needs your OK',
        error: 'Last attempt failed'
      }[st.kind] || ''
    );
  };
  UI.cloudHealthy = (withinMs) => {
    const st = C.state();
    const at = S.meta.cloud && S.meta.cloud.lastUpload;
    return C.enabled() && (st.kind === 'ok' || st.kind === 'uploading' || st.kind === 'pending') && at && Date.now() - at < withinMs;
  };
  /* Home banner: only when something needs you */
  UI.cloudBanner = () => {
    const st = C.state();
    if (st.kind === 'signin')
      return `<div class="banner warn">${ic('cloud', 18, 2)}<p><b>Not backed up to Drive yet.</b> Google needs you to sign in again, one tap.</p><button class="btn btn-sm btn-primary press" data-act="drive-now">Back up now</button></div>`;
    if (st.kind === 'offline') return `<div class="banner">${ic('cloud', 18, 2)}<p><b>You’re offline.</b> Your latest changes are safe on this phone and will back up to Drive when you’re connected.</p></div>`;
    if (st.kind === 'paused')
      return `<div class="banner warn">${ic('alert', 18, 2)}<p><b>Drive backup paused.</b> This phone has much less data than your last Drive backup, so Tally hasn’t replaced it.</p><button class="btn btn-sm btn-primary press" data-act="drive-review">Review</button></div>`;
    if (st.kind === 'error') return `<div class="banner warn">${ic('alert', 18, 2)}<p><b>Drive backup didn’t go through.</b> ${esc(C.errorText(st.error))}</p><button class="btn btn-sm btn-primary press" data-act="drive-now">Back up now</button></div>`;
    return '';
  };
  /* Backup screen card */
  UI.cloudCard = () => {
    if (!C.supported()) return `<section class="card"><div class="card-head"><h2 class="card-title">${ic('cloud', 20, 2)} Google Drive backup</h2></div><p class="muted sm">Available in the installed app.</p></section>`;
    if (!C.enabled())
      return `<section class="card drive-card"><div class="drive-head"><span class="tile c-blue">${ic('cloud', 22, 2)}</span><div><h2 class="card-title">Back up to Google Drive</h2><p class="muted sm">Automatic after every change, encrypted with a passphrase only you know.</p></div></div><button class="btn btn-primary press wide" data-act="drive-setup">Set up Drive backup</button></section>`;
    const st = C.state();
    const c = S.meta.cloud;
    const good = st.kind === 'ok' || st.kind === 'uploading' || st.kind === 'pending';
    let h = `<section class="card drive-card"><div class="drive-head"><span class="tile c-${good ? 'green' : 'amber'}">${ic(good ? 'cloud' : 'alert', 22, 2)}</span><div><h2 class="card-title">Google Drive backup is on</h2><p class="muted sm drive-status">${esc(UI.cloudLine())}${c.lastSize ? ' · ' + Math.max(1, Math.round(c.lastSize / 1024)) + ' KB' : ''}</p></div></div>`;
    if (st.kind === 'error') h += `<p class="note-box warn">${esc(C.errorText(st.error))}</p>`;
    if (st.kind === 'paused') h += `<p class="note-box warn">This phone has much less data than your newest Drive backup, so Tally paused rather than replace it. If you meant to delete lots of entries, back up anyway. If not, restore from Drive.</p>`;
    h += `<div class="btn-row"><button class="btn btn-soft press" data-act="${st.kind === 'paused' ? 'drive-anyway' : 'drive-now'}">${st.kind === 'paused' ? 'Back up anyway' : 'Back up now'}</button><button class="btn btn-soft press" data-act="drive-restore">Restore</button></div>`;
    h += `<p class="muted sm pad-t">Encrypted on this phone before upload. Google stores it but can’t read it. Kept: one copy per day for 30 days, then one a month for a year.</p>`;
    h += `<button class="btn btn-text press" data-act="drive-off">Turn off Drive backup</button></section>`;
    return h;
  };

  /* ---------- shared pieces ---------- */
  const howTo = () => {
    const origin = location.origin;
    const back = C.returnUrl();
    return `<details class="howto"><summary>How to get a Client ID (about 10 minutes, once)</summary><ol>
<li>On a computer or your phone, open <b>console.cloud.google.com</b> and sign in with the Google account whose Drive you want to use.</li>
<li>Create a project (any name, for example “Tally”).</li>
<li>Go to <b>APIs &amp; Services › Library</b>, search for <b>Google Drive API</b> and tap <b>Enable</b>.</li>
<li>Go to <b>Google Auth Platform</b> (or <b>OAuth consent screen</b>) and set it up: app name “Tally”, your email, audience <b>External</b>. Then under <b>Audience › Test users</b>, add your own Gmail address.</li>
<li>Go to <b>Clients</b> (or <b>Credentials</b>) › <b>Create client</b> › <b>Web application</b>.</li>
<li>Under <b>Authorised JavaScript origins</b> add:<br><code>${esc(origin)}</code></li>
<li>Under <b>Authorised redirect URIs</b> add:<br><code>${esc(back)}</code></li>
<li>Tap <b>Create</b>, copy the <b>Client ID</b> (it ends in .apps.googleusercontent.com) and paste it above.</li>
</ol><p class="muted sm">The Client ID isn’t a password: it only tells Google which app is asking. Keep a note of it with your passphrase, as you’ll need both to restore on a new phone.</p></details>`;
  };
  const idField = (val) =>
    `<label class="field-block" for="dr-id"><span class="lbl">Google Client ID</span><input class="input mono" id="dr-id" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="1234…apps.googleusercontent.com" value="${esc(val || '')}"></label>`;
  const passFields = (two) =>
    `<label class="field-block" for="dr-p1"><span class="lbl">${two ? 'Choose a passphrase' : 'Your passphrase'}</span><input class="input" type="password" id="dr-p1" autocomplete="${two ? 'new-password' : 'current-password'}" autocapitalize="off" spellcheck="false" placeholder="${two ? 'At least 8 characters' : 'The one you chose for Drive backup'}"></label>` +
    (two ? `<label class="field-block" for="dr-p2"><span class="lbl">Type it again</span><input class="input" type="password" id="dr-p2" autocomplete="new-password" autocapitalize="off" spellcheck="false"></label>` : '') +
    `<label class="field-inline" for="dr-show"><input type="checkbox" id="dr-show"> Show passphrase</label>`;
  const bindShow = (el) => {
    const box = el.querySelector('#dr-show');
    if (!box) return;
    box.addEventListener('change', () => el.querySelectorAll('input[id^="dr-p"]').forEach((i) => (i.type = box.checked ? 'text' : 'password')));
  };
  const signInError = (e) => {
    const m = (e && e.message) || '';
    if (m === 'not-ready' || m === 'offline') return 'Couldn’t reach Google. Check you’re online and try again.';
    if (m === 'popup_closed') return 'The Google window was closed before you finished. Try again.';
    if (m === 'access_denied' || m === 'denied') return 'Google sign-in was cancelled, or access to Drive wasn’t allowed.';
    if (/popup/.test(m)) return 'The Google sign-in window couldn’t open here. Use the full-page sign-in below.';
    if (m === 'api-off') return C.errorText('api-off');
    if (/invalid_client|idpiframe|origin/i.test(m)) return 'Google didn’t accept this Client ID for this app. Check the Client ID and the two addresses in step 6 and 7.';
    return 'Google sign-in didn’t work (' + m + '). Try again, or use the full-page sign-in below.';
  };
  const fileLabel = (f) => {
    const d = f.name.slice(6, 16);
    const t = f.modifiedTime ? new Date(f.modifiedTime) : null;
    return U.fmtDay(d) + (t ? ' · ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '');
  };
  const remember = (mode, clientId) => {
    try {
      localStorage.setItem(PENDING, JSON.stringify({ mode: mode, clientId: clientId, at: Date.now() }));
    } catch (e) {}
  };

  /* ---------- set up ---------- */
  M.driveSetup = (resume) => {
    const st = { step: resume ? 'connect' : 'id', clientId: (resume && resume.clientId) || (S.meta.cloud && S.meta.cloud.clientId) || '', err: '', busy: false, files: [], replace: false };
    let entry = null;
    const render = () => {
      let h = `<div class="form drive-form"><h2 class="sheet-title">Back up to Google Drive</h2>`;
      if (st.step === 'id') {
        h += `<p class="sheet-text">After every change, Tally encrypts a backup on this phone and saves it to a hidden Tally folder in your Google Drive. Only your passphrase can unlock it.</p>${idField(st.clientId)}${howTo()}`;
        if (st.err) h += `<p class="note-box warn">${esc(st.err)}</p>`;
        h += `<div class="btn-row"><button type="button" class="btn press" data-act="sheet-close">Cancel</button><button type="button" class="btn btn-primary press" data-act="ds-id">Continue</button></div>`;
      } else if (st.step === 'connect') {
        h += `<p class="sheet-text">Sign in with the Google account whose Drive you want to use, and allow Tally to use its own app folder. Tally can’t see anything else in your Drive.</p>`;
        if (st.err) h += `<p class="note-box warn">${esc(st.err)}</p>`;
        h += `<button type="button" class="btn btn-primary btn-lg press" data-act="ds-connect"${st.busy ? ' disabled' : ''}>${ic('cloud', 18, 2)} ${st.busy ? 'Waiting for Google…' : 'Connect Google Drive'}</button>`;
        if (st.err) h += `<button type="button" class="btn btn-soft press" data-act="ds-full">Sign in on a full page instead</button>`;
        h += `<button type="button" class="btn btn-text press" data-act="ds-back">Change Client ID</button>`;
      } else if (st.step === 'found') {
        const f = st.files[0];
        h += `<p class="sheet-text">This Google account already has Tally backups. The newest is from <b>${esc(fileLabel(f))}</b>.</p><p class="note-box">If this is a new or reset phone, restore first so nothing is lost. Choosing this phone’s data instead replaces what’s in Drive from now on (older daily copies stay for 30 days).</p>`;
        h += `<button type="button" class="btn btn-primary btn-lg press" data-act="ds-restore">Restore from Drive</button><button type="button" class="btn btn-soft press" data-act="ds-replace">Use this phone’s data instead</button>`;
      } else {
        h += `<p class="sheet-text">Choose a passphrase. Backups are locked with it before they leave this phone.</p>${passFields(true)}<p class="note-box warn"><b>Don’t lose it.</b> Without it, nobody can open your Drive backups, not even you. Your data on this phone is never affected. Keep it with your Client ID, for example in a password manager.</p>`;
        if (st.err) h += `<p class="note-box warn">${esc(st.err)}</p>`;
        h += `<button type="button" class="btn btn-primary btn-lg press" data-act="ds-on"${st.busy ? ' disabled' : ''}>${st.busy ? 'Encrypting and uploading…' : 'Turn on Drive backup'}</button>`;
      }
      return h + `</div>`;
    };
    const re = () => UI.rerenderSheet(entry);
    M.ds = {
      id: () => {
        const v = (entry.el.querySelector('#dr-id') || {}).value || '';
        st.clientId = v.trim();
        if (!C.validClientId(st.clientId)) {
          st.err = 'That doesn’t look like a Client ID. It should look like 1234567890-abc123.apps.googleusercontent.com';
          return re();
        }
        st.err = '';
        st.step = 'connect';
        C.loadGis().catch(() => {});
        re();
      },
      connect: async () => {
        st.err = '';
        st.busy = true;
        re();
        try {
          await C.signIn(st.clientId);
          await M.ds.afterSignIn();
        } catch (e) {
          st.busy = false;
          st.err = signInError(e);
          re();
        }
      },
      afterSignIn: async () => {
        st.busy = true;
        re();
        try {
          st.files = await C.list();
        } catch (e) {
          st.busy = false;
          st.err = signInError(e);
          return re();
        }
        st.busy = false;
        st.step = st.files.length ? 'found' : 'pass';
        re();
      },
      full: () => {
        remember('setup', st.clientId);
        C.signInFullPage(st.clientId);
      },
      back: () => {
        st.step = 'id';
        st.err = '';
        re();
      },
      restore: async () => {
        await UI.closeSheet();
        M.driveRestore({ clientId: st.clientId, files: st.files });
      },
      replace: () => {
        st.replace = true;
        st.step = 'pass';
        re();
      },
      on: async () => {
        const p1 = entry.el.querySelector('#dr-p1').value;
        const p2 = entry.el.querySelector('#dr-p2').value;
        if (p1.length < 8) {
          st.err = 'Use at least 8 characters. A few random words work well.';
          return re();
        }
        if (p1 !== p2) {
          st.err = 'The two passphrases don’t match.';
          return re();
        }
        st.err = '';
        st.busy = true;
        re();
        try {
          await C.enable(st.clientId, p1);
          const r = st.replace ? await C.backupNow(true) : await C.flush();
          await UI.closeSheet();
          if (r === 'ok' || r === 'clean') UI.toast('Drive backup is on. Backed up just now');
          else UI.toast('Drive backup is on. ' + UI.cloudLine());
          UI.refresh();
        } catch (e) {
          st.busy = false;
          st.err = (e && e.message) || 'Something went wrong.';
          re();
        }
      }
    };
    entry = UI.openSheet({ label: 'Back up to Google Drive', cls: 'tall', render: render, after: (el) => bindShow(el), onClose: () => (M.ds = null) });
    if (resume && resume.signedIn) M.ds.afterSignIn();
  };
  ['id', 'connect', 'full', 'back', 'restore', 'replace', 'on'].forEach((k) => (A['ds-' + k] = () => M.ds && M.ds[k]()));

  /* ---------- restore ---------- */
  M.driveRestore = (opts) => {
    const o = opts || {};
    const st = { clientId: o.clientId || (S.meta.cloud && S.meta.cloud.clientId) || '', files: o.files || null, sel: 0, err: '', busy: false, step: '' };
    st.step = !st.clientId ? 'id' : st.files ? 'list' : C.tokenValid() ? 'loading' : 'connect';
    let entry = null;
    const render = () => {
      let h = `<div class="form drive-form"><h2 class="sheet-title">Restore from Google Drive</h2>`;
      if (st.step === 'id') {
        h += `<p class="sheet-text">Paste the Client ID you used when you set up Drive backup.</p>${idField(st.clientId)}${howTo()}`;
        if (st.err) h += `<p class="note-box warn">${esc(st.err)}</p>`;
        h += `<div class="btn-row"><button type="button" class="btn press" data-act="sheet-close">Cancel</button><button type="button" class="btn btn-primary press" data-act="dr-id">Continue</button></div>`;
      } else if (st.step === 'connect' || st.step === 'loading') {
        h += `<p class="sheet-text">Sign in with the Google account that holds your Tally backups.</p>`;
        if (st.err) h += `<p class="note-box warn">${esc(st.err)}</p>`;
        h += `<button type="button" class="btn btn-primary btn-lg press" data-act="dr-connect"${st.busy || st.step === 'loading' ? ' disabled' : ''}>${ic('cloud', 18, 2)} ${st.busy || st.step === 'loading' ? 'Looking for backups…' : 'Connect Google Drive'}</button>`;
        if (st.err) h += `<button type="button" class="btn btn-soft press" data-act="dr-full">Sign in on a full page instead</button>`;
      } else {
        if (!st.files.length) {
          h += `<p class="note-box warn">No Tally backups in this Google account. If you have more than one Google account, check you signed in with the right one.</p><button type="button" class="btn press" data-act="sheet-close">Close</button>`;
          return h + `</div>`;
        }
        h += `<p class="sheet-text">Choose a backup. The newest is first.</p><div class="drive-files" role="radiogroup" aria-label="Backups">`;
        h += st.files
          .slice(0, 40)
          .map((f, i) => `<button type="button" class="drive-file press${i === st.sel ? ' on' : ''}" role="radio" aria-checked="${i === st.sel}" data-act="dr-pick" data-i="${i}"><span class="radio" aria-hidden="true"></span><span class="tx-main"><span class="tx-title">${esc(fileLabel(f))}${i === 0 ? ' · newest' : ''}</span><span class="tx-sub">${Math.max(1, Math.round(f.size / 1024))} KB</span></span></button>`)
          .join('');
        h += `</div>${passFields(false)}`;
        if (st.err) h += `<p class="note-box warn">${esc(st.err)}</p>`;
        h += `<button type="button" class="btn btn-primary btn-lg press" data-act="dr-go"${st.busy ? ' disabled' : ''}>${st.busy ? 'Unlocking…' : 'Unlock and preview'}</button>`;
      }
      return h + `</div>`;
    };
    const re = () => UI.rerenderSheet(entry);
    const load = async () => {
      st.busy = true;
      st.err = '';
      re();
      try {
        st.files = await C.list();
        st.step = 'list';
      } catch (e) {
        st.step = 'connect';
        st.err = signInError(e);
      }
      st.busy = false;
      re();
    };
    M.dr = {
      id: () => {
        const v = ((entry.el.querySelector('#dr-id') || {}).value || '').trim();
        if (!C.validClientId(v)) {
          st.err = 'That doesn’t look like a Client ID. It should look like 1234567890-abc123.apps.googleusercontent.com';
          return re();
        }
        st.clientId = v;
        st.err = '';
        st.step = 'connect';
        C.loadGis().catch(() => {});
        re();
      },
      connect: async () => {
        st.err = '';
        st.busy = true;
        re();
        try {
          await C.signIn(st.clientId);
          await load();
        } catch (e) {
          st.busy = false;
          st.err = signInError(e);
          re();
        }
      },
      full: () => {
        remember('restore', st.clientId);
        C.signInFullPage(st.clientId);
      },
      pick: (i) => {
        st.sel = Number(i);
        st.err = '';
        entry.el.querySelectorAll('.drive-file').forEach((b, j) => {
          b.classList.toggle('on', j === st.sel);
          b.setAttribute('aria-checked', String(j === st.sel));
        });
      },
      go: async () => {
        const f = st.files[st.sel];
        const pass = entry.el.querySelector('#dr-p1').value;
        if (!pass) {
          st.err = 'Enter your passphrase.';
          return re();
        }
        st.busy = true;
        st.err = '';
        re();
        try {
          const text = await C.download(f.id);
          const out = await C.decrypt(text, pass);
          const v = S.validateImport(out.data);
          if (!v.ok) throw new Error(v.error);
          await UI.closeSheet();
          /* after you confirm the restore, keep backing up with the same passphrase */
          M.restorePreview(v, 'Google Drive backup from ' + fileLabel(f), async () => {
            if (!C.enabled()) await C.enable(st.clientId, pass, out.salt, out.iter);
          });
        } catch (e) {
          st.busy = false;
          const m = (e && e.message) || '';
          st.err = m === 'wrong-pass' ? 'That passphrase doesn’t unlock this backup. Check it and try again. (If you changed your passphrase, older backups need the old one.)' : m === 'not-tally' ? 'This file isn’t a Tally backup.' : signInError(e);
          re();
        }
      }
    };
    entry = UI.openSheet({ label: 'Restore from Google Drive', cls: 'tall', render: render, after: (el) => bindShow(el), onClose: () => (M.dr = null) });
    if (st.step === 'loading') load();
  };
  A['dr-id'] = () => M.dr && M.dr.id();
  A['dr-connect'] = () => M.dr && M.dr.connect();
  A['dr-full'] = () => M.dr && M.dr.full();
  A['dr-pick'] = (el) => M.dr && M.dr.pick(el.getAttribute('data-i'));
  A['dr-go'] = () => M.dr && M.dr.go();

  /* ---------- actions on the Backup screen and banners ---------- */
  A['drive-setup'] = () => M.driveSetup();
  A['drive-restore'] = () => M.driveRestore();
  /* from the welcome or "entries missing" screens: close that first */
  A['drive-restore-new'] = async () => {
    await UI.closeSheet();
    M.driveRestore();
  };
  A['drive-now'] = async () => {
    try {
      const r = await C.backupNow(false);
      if (r === 'ok' || r === 'clean') UI.toast('Backed up to Google Drive');
      else if (r === 'paused') UI.toast('Paused: this phone has much less data than Drive. See Backup', { kind: 'error' });
      else if (r && r !== 'busy') UI.toast(C.errorText(r), { kind: 'error', duration: 5000 });
    } catch (e) {
      UI.openSheet({
        label: 'Sign in to Google',
        render: () =>
          `<div class="form"><h2 class="sheet-title">Sign in to Google</h2><p class="sheet-text">${esc(signInError(e))}</p><div class="btn-row"><button type="button" class="btn press" data-act="sheet-close">Not now</button><button type="button" class="btn btn-primary press" data-act="drive-full">Full-page sign-in</button></div></div>`
      });
    }
  };
  A['drive-full'] = () => {
    remember('backup', S.meta.cloud && S.meta.cloud.clientId);
    C.signInFullPage();
  };
  A['drive-review'] = () => UI.go('backup');
  A['drive-anyway'] = async () => {
    const ok = await UI.confirm({ title: 'Replace your Drive backup?', body: 'Your newest Drive backup has much more data than this phone. Only do this if you meant to delete lots of entries. Older daily copies stay in Drive for 30 days.', ok: 'Back up anyway', danger: true });
    if (!ok) return;
    try {
      const r = await C.backupNow(true);
      if (r === 'ok') UI.toast('Backed up to Google Drive');
    } catch (e) {
      UI.toast(signInError(e), { kind: 'error' });
    }
  };
  A['drive-off'] = () => {
    UI.openSheet({
      label: 'Turn off Drive backup',
      render: () =>
        `<div class="form"><h2 class="sheet-title">Turn off Drive backup?</h2><p class="sheet-text">New changes won’t be backed up to Drive. Your data on this phone isn’t affected.</p><button type="button" class="btn btn-primary press" data-act="drive-off-keep">Turn off, keep backups in Drive</button><button type="button" class="btn btn-ghost-danger press" data-act="drive-off-delete">Turn off and delete backups from Drive</button><button type="button" class="btn press" data-act="sheet-close">Cancel</button></div>`
    });
  };
  A['drive-off-keep'] = async () => {
    await C.disable();
    await UI.closeSheet();
    UI.toast('Drive backup is off');
    UI.refresh();
  };
  A['drive-off-delete'] = async () => {
    try {
      await C.signIn();
      const n = await C.deleteAll();
      await C.disable();
      await UI.closeSheet();
      UI.toast('Drive backup is off. Deleted ' + n + ' backup' + (n === 1 ? '' : 's') + ' from Drive');
      UI.refresh();
    } catch (e) {
      UI.toast(signInError(e), { kind: 'error', duration: 5000 });
    }
  };

  /* ---------- coming back from a full-page sign-in ---------- */
  UI.resumeDrive = (gotToken) => {
    let p = null;
    try {
      p = JSON.parse(localStorage.getItem(PENDING) || 'null');
      localStorage.removeItem(PENDING);
    } catch (e) {}
    if (!p || Date.now() - p.at > 15 * 60000) return false;
    if (p.mode === 'setup') M.driveSetup({ clientId: p.clientId, signedIn: gotToken });
    else if (p.mode === 'restore') M.driveRestore({ clientId: p.clientId });
    else if (gotToken) C.flush().then((r) => r === 'ok' && UI.toast('Backed up to Google Drive'));
    return true;
  };
})();
