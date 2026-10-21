/* Money Tracker — IndexedDB wrapper. Every write is one atomic transaction with strict durability,
   and the UI only reports "saved" after the transaction has completed. */
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});
  const NAME = 'money-tracker';
  const VERSION = 1;
  let dbp = null;

  const D = (MT.db = { memory: false });

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(NAME, VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath: 'id' }).createIndex('date', 'date');
        ['categories', 'recurring', 'snapshots'].forEach((n) => {
          if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' });
        });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked by another open copy of the app.'));
    });
    return dbp;
  }

  D.init = async () => {
    try {
      await open();
    } catch (e) {
      D.memory = true;
      D.error = e;
    }
    return !D.memory;
  };

  D.all = async (store) => {
    if (D.memory) return [];
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readonly');
      const q = t.objectStore(store).getAll();
      q.onsuccess = () => resolve(q.result || []);
      q.onerror = () => reject(q.error);
    });
  };

  /* ops: [{store, put: obj} | {store, del: key} | {store, clear: true}] — all applied atomically */
  D.write = async (ops) => {
    if (!ops.length || D.memory) return;
    const db = await open();
    const stores = Array.from(new Set(ops.map((o) => o.store)));
    return new Promise((resolve, reject) => {
      let t;
      try {
        t = db.transaction(stores, 'readwrite', { durability: 'strict' });
      } catch (e) {
        t = db.transaction(stores, 'readwrite');
      }
      ops.forEach((o) => {
        const s = t.objectStore(o.store);
        if (o.clear) s.clear();
        else if ('del' in o) s.delete(o.del);
        else s.put(o.put);
      });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('Could not save.'));
      t.onabort = () => reject(t.error || new Error('Save was cancelled.'));
    });
  };

  /* Ask the browser to never evict our storage (Chrome grants this to installed apps) */
  D.persist = async () => {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (e) {
      return null;
    }
  };
  D.persisted = async () => {
    try {
      return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
    } catch (e) {
      return null;
    }
  };
})();
