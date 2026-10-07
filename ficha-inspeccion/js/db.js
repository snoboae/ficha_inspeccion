/* Almacenamiento local (IndexedDB): fichas de inspección, fotografías, responsables y ajustes.
   Todo queda en el teléfono. Las fotos se guardan en dos stores para no cargar los blobs en memoria:
     - photos: { id, inspId, blob }        (la imagen completa, pesada)
     - pmeta:  { id, inspId, pie, order, thumb, w, h, takenAt }   (metadatos + miniatura, ligera) */
const DB = (() => {
  const NAME = 'ficha-inspeccion';
  const VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('inspections')) d.createObjectStore('inspections', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('people')) d.createObjectStore('people', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('photos')) {
          const p = d.createObjectStore('photos', { keyPath: 'id' });
          p.createIndex('inspId', 'inspId');
        }
        if (!d.objectStoreNames.contains('pmeta')) {
          const m = d.createObjectStore('pmeta', { keyPath: 'id' });
          m.createIndex('inspId', 'inspId');
        }
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const d = await open();
    const names = Array.isArray(store) ? store : [store];
    return new Promise((res, rej) => {
      const t = d.transaction(names, mode);
      const out = {};
      let hasOut = false;
      const req = fn((name) => { const s = t.objectStore(name); return s; });
      if (req && typeof req.then === 'function') {
        req.then((v) => { hasOut = true; out.value = v; });
      } else if (req) {
        req.onsuccess = () => { hasOut = true; out.value = req.result; };
      }
      t.oncomplete = () => res(hasOut ? out.value : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }

  /* Ejecuta `fn` con acceso a varios stores en una sola transacción.
     fn recibe un objeto { name: IDBObjectStore } y devuelve la operación a esperar (o nada). */
  async function txm(storeNames, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(storeNames, mode);
      const s = {};
      storeNames.forEach((n) => { s[n] = t.objectStore(n); });
      try { fn(s); } catch (e) { rej(e); }
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }

  return {
    all: (s) => tx(s, 'readonly', (o) => o(s).getAll()),
    get: (s, id) => tx(s, 'readonly', (o) => o(s).get(id)),
    put: (s, v) => tx(s, 'readwrite', (o) => o(s).put(v)),
    del: (s, id) => tx(s, 'readwrite', (o) => o(s).delete(id)),
    clear: (s) => tx(s, 'readwrite', (o) => o(s).clear()),
    byIndex: (s, idx, val) => tx(s, 'readonly', (o) => o(s).index(idx).getAll(val)),
    txm,
    async kvGet(key, def) {
      const r = await tx('kv', 'readonly', (o) => o('kv').get(key));
      return r ? r.value : def;
    },
    kvSet: (key, value) => tx('kv', 'readwrite', (o) => o('kv').put({ key, value }))
  };
})();
