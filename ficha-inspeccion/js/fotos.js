/* Fotografías: compresión con redimensionado en canvas, miniaturas y persistencia en dos stores. */
const Fotos = (() => {
  const MAX_FULL = 1600;   // lado mayor de la imagen completa
  const MAX_THUMB = 240;   // lado mayor de la miniatura

  function loadBitmap(file) {
    if ('createImageBitmap' in window) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .then((bm) => { const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); bm.close(); return c; });
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); URL.revokeObjectURL(url); res(c); };
      im.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
      im.src = url;
    });
  }

  function scale(src, maxDim) {
    const w = src.width, h = src.height;
    const k = Math.min(1, maxDim / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function canvasToBlob(c, quality) {
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo crear la imagen.'))), 'image/jpeg', quality));
  }

  /* file -> { blob, thumb (dataURL), w, h } */
  async function compress(file) {
    const src = await loadBitmap(file);
    const full = scale(src, MAX_FULL);
    const blob = await canvasToBlob(full, 0.78);
    const th = scale(src, MAX_THUMB);
    const thumb = th.toDataURL('image/jpeg', 0.6);
    const w = full.width, h = full.height;
    return { blob, thumb, w, h };
  }

  /* Guarda una foto (blob + metadatos) en una sola transacción. */
  async function add(rec) {
    const { id, inspId, blob, thumb, pie, order, w, h } = rec;
    await DB.txm(['photos', 'pmeta'], 'readwrite', (s) => {
      s.photos.put({ id, inspId, blob });
      s.pmeta.put({ id, inspId, pie: pie || '', order: order || 0, thumb, w, h, takenAt: Date.now() });
    });
  }

  function byInsp(id) {
    return DB.byIndex('pmeta', 'inspId', id).then((rows) => rows.sort((a, b) => (a.order || 0) - (b.order || 0)));
  }

  async function getBlob(id) {
    const r = await DB.get('photos', id);
    return r ? r.blob : null;
  }

  async function updateMeta(id, patch) {
    const r = await DB.get('pmeta', id);
    if (!r) return;
    await DB.put('pmeta', Object.assign(r, patch));
  }

  async function remove(id) {
    await DB.txm(['photos', 'pmeta'], 'readwrite', (s) => {
      s.photos.delete(id);
      s.pmeta.delete(id);
    });
  }

  /* Borra fotos cuyo inspId no pertenece a ninguna ficha (borradores abandonados). */
  async function purgeOrphans(validIds) {
    const set = new Set(validIds);
    const metas = await DB.all('pmeta');
    for (const m of metas) {
      if (!set.has(m.inspId)) await remove(m.id);
    }
  }

  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  return { compress, add, byInsp, getBlob, updateMeta, remove, purgeOrphans, blobToDataURL };
})();
