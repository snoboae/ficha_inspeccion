/* Capas base, imagen del mapa de ubicación (canvas) y precarga de teselas para uso sin conexión.
   Dibuja el área de inspección (polígono/rectángulo) con su leyenda, norte, escala y atribución. */
const MapImg = (() => {
  const LAYERS = {
    esri: {
      name: 'Satélite (Esri)',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: 'Imágenes © Esri, Maxar, Earthstar Geographics y la comunidad GIS',
      maxNative: 18, maxZoom: 19
    },
    osm: {
      name: 'Calles (OSM)',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '© Colaboradores de OpenStreetMap',
      maxNative: 19, maxZoom: 19
    }
  };
  const TILE_CACHE = 'bv-tiles-v1';

  const tileUrl = (key, z, x, y) => LAYERS[key].url.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  const worldPx = (lat, lng, z) => {
    const s = 256 * Math.pow(2, z);
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
  };

  function loadImg(src, timeout = 9000) {
    return new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      const t = setTimeout(() => { im.src = ''; res(null); }, timeout);
      im.onload = () => { clearTimeout(t); res(im); };
      im.onerror = () => { clearTimeout(t); res(null); };
      im.src = src;
    });
  }

  function niceLen(m) {
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / p;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
  }

  async function tilesIn(layerKey, z, cx, cy, W, H) {
    const ox = cx - W / 2, oy = cy - H / 2;
    const x0 = Math.floor(ox / 256), x1 = Math.floor((ox + W) / 256);
    const y0 = Math.floor(oy / 256), y1 = Math.floor((oy + H) / 256);
    const max = Math.pow(2, z);
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= max) continue;
      const xw = ((x % max) + max) % max;
      jobs.push(loadImg(tileUrl(layerKey, z, xw, y)).then((im) => ({ im, x, y })));
    }
    const imgs = await Promise.all(jobs);
    return { imgs, tilesOk: imgs.filter((t) => t.im).length, total: jobs.length, ox, oy, z };
  }

  function paintBase(g, W, H, imgs, tilesOk, ox, oy) {
    g.fillStyle = '#e9edef'; g.fillRect(0, 0, W, H);
    if (!tilesOk) {
      g.strokeStyle = '#cfd6da'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    }
    imgs.forEach(({ im, x, y }) => { if (im) g.drawImage(im, x * 256 - ox, y * 256 - oy); });
  }

  function drawPolygon(g, ring, z, ox, oy) {
    const pts = ring.map(([lat, lng]) => { const p = worldPx(lat, lng, z); return [p[0] - ox, p[1] - oy]; });
    if (pts.length >= 2) {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (pts.length >= 3) g.closePath();
      g.fillStyle = 'rgba(0, 220, 200, 0.22)'; g.fill();
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 6; g.stroke();
      g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.stroke();
    }
    g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    pts.forEach(([x, y], i) => {
      g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2);
      g.fillStyle = '#0b4f4a'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#ffd400'; g.stroke();
      g.fillStyle = '#fff'; g.fillText(String(i + 1), x, y + 0.5);
    });
  }

  function drawNorth(g, W) {
    const nx = W - 40, ny = 54;
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.beginPath(); g.arc(nx, ny, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b4f4a'; g.beginPath(); g.moveTo(nx, ny - 22); g.lineTo(nx + 10, ny + 12); g.lineTo(nx, ny + 6); g.lineTo(nx - 10, ny + 12); g.closePath(); g.fill();
    g.fillStyle = '#000'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('N', nx, ny + 26);
  }

  function drawScale(g, lat, z, W, H) {
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
    const len = niceLen(mpp * W * 0.22);
    const px = len / mpp;
    const bx = 24, by = H - 44;
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(bx - 10, by - 24, px + 20, 44);
    g.fillStyle = '#000'; g.fillRect(bx, by, px, 5);
    g.font = 'bold 14px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(len >= 1000 ? len / 1000 + ' km' : len + ' m', bx, by - 6);
  }

  function drawAttribution(g, layerKey, tilesOk, W, H) {
    const attr = tilesOk ? LAYERS[layerKey].attr : 'Sin imagen base (sin conexión al generar) - solo referencia';
    g.font = '12px Arial'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    const tw = g.measureText(attr).width;
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(W - tw - 14, H - 22, tw + 14, 22);
    g.fillStyle = '#222'; g.fillText(attr, W - 7, H - 7);
  }

  /* Leyenda con una sola entrada: el polígono del área de inspección. */
  function drawLegend(g) {
    const pad = 14, x0 = 24, y0 = 24, label = 'Área de inspección';
    g.font = 'bold 15px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const textW = Math.max(g.measureText('Leyenda').width, g.measureText(label).width);
    const boxW = Math.min(430, pad * 2 + 26 + 12 + textW);
    const boxH = pad * 2 + 20 + 17;
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.strokeStyle = 'rgba(11,79,74,0.35)'; g.lineWidth = 1;
    g.beginPath();
    if (g.roundRect) { g.roundRect(x0, y0, boxW, boxH, 10); g.fill(); g.stroke(); }
    else { g.rect(x0, y0, boxW, boxH); g.fill(); g.stroke(); }
    g.fillStyle = '#0b4f4a'; g.font = 'bold 15px Arial';
    g.fillText('Leyenda', x0 + pad, y0 + pad + 14);
    const ty = y0 + pad + 20 + 13, sx = x0 + pad + 9;
    g.beginPath(); g.rect(sx - 8, ty - 12, 16, 12);
    g.fillStyle = 'rgba(0,220,200,0.5)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#ffd400'; g.stroke();
    g.fillStyle = '#172026'; g.font = '13px Arial';
    g.fillText(label, x0 + pad + 26 + 12, ty);
  }

  /* Imagen del mapa de ubicación. Solo dibuja el área de inspección (sin símbolo de punto). */
  async function render(map) {
    const { ring, layer = 'esri', W = 1200, H = 800 } = map || {};
    if (!Array.isArray(ring) || ring.length < 3) return null;

    const b = Geo.bounds(ring);
    let zoom = 18;
    const padF = 0.18;
    for (; zoom > 1; zoom--) {
      const a = worldPx(b.n, b.w, zoom), c = worldPx(b.s, b.e, zoom);
      if ((c[0] - a[0]) * (1 + 2 * padF) <= W && (c[1] - a[1]) * (1 + 2 * padF) <= H) break;
    }
    const a = worldPx(b.n, b.w, zoom), c = worldPx(b.s, b.e, zoom);
    const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
    const latRef = Geo.centroid(ring)[0];

    const r = await tilesIn(layer, zoom, cx, cy, W, H);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    paintBase(g, W, H, r.imgs, r.tilesOk, r.ox, r.oy);
    drawPolygon(g, ring, zoom, r.ox, r.oy);
    drawLegend(g);
    drawNorth(g, W);
    drawScale(g, latRef, zoom, W, H);
    drawAttribution(g, layer, r.tilesOk, W, H);

    let dataUrl;
    try { dataUrl = cv.toDataURL('image/jpeg', 0.88); }
    catch (e) {
      // Canvas contaminado por teselas sin CORS: se redibuja sin fondo.
      g.clearRect(0, 0, W, H);
      paintBase(g, W, H, [], 0, 0, 0);
      drawPolygon(g, ring, zoom, 0, 0);
      drawLegend(g); drawNorth(g, W); drawScale(g, latRef, zoom, W, H); drawAttribution(g, layer, 0, W, H);
      dataUrl = cv.toDataURL('image/jpeg', 0.88);
      return { dataUrl, tilesOk: 0, z: zoom, layer };
    }
    return { dataUrl, tilesOk: r.tilesOk, z: zoom, layer };
  }

  function tilesFor(bbox, layerKey, cap) {
    const maxZ = Math.min(18, LAYERS[layerKey].maxNative);
    for (let top = maxZ; top >= 12; top--) {
      const list = [];
      for (let z = Math.max(12, top - 3); z <= top; z++) {
        const a = worldPx(bbox.n, bbox.w, z), c = worldPx(bbox.s, bbox.e, z);
        const padPx = 128;
        const xa = Math.floor((a[0] - padPx) / 256), xb = Math.floor((c[0] + padPx) / 256);
        const ya = Math.floor((a[1] - padPx) / 256), yb = Math.floor((c[1] + padPx) / 256);
        const max = Math.pow(2, z);
        for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
          if (y < 0 || y >= max) continue;
          list.push([z, ((x % max) + max) % max, y]);
        }
      }
      if (list.length <= cap) return { list, top };
    }
    return { list: [], top: 0 };
  }

  const geomBbox = (geom) => Geo.bounds(geom.ring);

  async function prefetch(geom, layerKey, onProgress, cap = 300) {
    const bbox = geomBbox(geom);
    const { list, top } = tilesFor(bbox, layerKey, cap);
    if (!list.length) throw new Error('El área es demasiado grande para precargar.');
    const cache = await caches.open(TILE_CACHE);
    let done = 0, ok = 0;
    const queue = list.slice();
    async function worker() {
      while (queue.length) {
        const [z, x, y] = queue.shift();
        const url = tileUrl(layerKey, z, x, y);
        try {
          if (!(await cache.match(url))) {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) { await cache.put(url, res); ok++; }
          } else ok++;
        } catch (e) { /* sin conexión */ }
        done++;
        onProgress && onProgress(done, list.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { ok, total: list.length, top };
  }

  return { LAYERS, tileUrl, render, prefetch };
})();
