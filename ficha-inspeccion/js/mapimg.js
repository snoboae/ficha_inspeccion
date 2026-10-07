/* Capas base, imagen del mapa de ubicación (canvas) y precarga de teselas para uso sin conexión.
   Soporta un perímetro (polígono/rectángulo) y/o un punto, con caja de leyenda, norte, escala y
   recuadro de contexto, al estilo de la bitácora de vuelo. */
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

  function wrapText(ctx, text, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
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

  function drawDiamond(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.fillStyle = '#ffd400'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#0b4f4a'; g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.28, 0, Math.PI * 2); g.fillStyle = '#0b4f4a'; g.fill();
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

  function drawLegend(g, legend, sub, hasRing) {
    const pad = 14, x0 = 24, y0 = 24;
    g.font = 'bold 15px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const labelW = g.measureText('Leyenda').width;
    g.font = '13px Arial';
    const lines = wrapText(g, legend, 300);
    let textW = labelW;
    for (const l of lines) textW = Math.max(textW, g.measureText(l).width);
    if (hasRing) textW = Math.max(textW, g.measureText('Perímetro de inspección').width);
    if (sub) { g.font = '11px Arial'; textW = Math.max(textW, g.measureText(sub).width); }
    const boxW = Math.min(430, pad * 2 + 26 + 12 + textW);
    let rows = (hasRing ? 1 : 0) + lines.length + (sub ? 1 : 0);
    const boxH = pad * 2 + 20 + rows * 17;
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.strokeStyle = 'rgba(11,79,74,0.35)'; g.lineWidth = 1;
    g.beginPath();
    if (g.roundRect) { g.roundRect(x0, y0, boxW, boxH, 10); g.fill(); g.stroke(); }
    else { g.rect(x0, y0, boxW, boxH); g.fill(); g.stroke(); }
    g.fillStyle = '#0b4f4a'; g.font = 'bold 15px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('Leyenda', x0 + pad, y0 + pad + 14);
    let ty = y0 + pad + 20 + 13;
    if (hasRing) {
      const sx = x0 + pad + 9, sy = ty - 6;
      g.beginPath(); g.rect(sx - 8, sy - 6, 16, 12);
      g.fillStyle = 'rgba(0,220,200,0.5)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#ffd400'; g.stroke();
      g.fillStyle = '#172026'; g.font = '13px Arial';
      g.fillText('Perímetro de inspección', x0 + pad + 26 + 12, ty);
      ty += 17;
    }
    drawDiamond(g, x0 + pad + 9, ty - 5, 9);
    g.fillStyle = '#172026'; g.font = '13px Arial';
    for (const l of lines) { g.fillText(l, x0 + pad + 26 + 12, ty); ty += 17; }
    if (sub) { g.fillStyle = '#5d6a72'; g.font = '11px Arial'; g.fillText(sub, x0 + pad + 26 + 12, ty + 1); }
  }

  async function render(map) {
    const { ring, lat, lng, legend, sub, layer = 'esri', z = 16, W = 1200, H = 800 } = map || {};
    const ringOk = Array.isArray(ring) && ring.length >= 3;
    const ptOk = isFinite(lat) && isFinite(lng);
    if (!ringOk && !ptOk) return null;

    let zoom = z, cx, cy;
    if (ringOk) {
      const b = Geo.bounds(ring);
      zoom = 18;
      const padF = 0.18;
      for (; zoom > 1; zoom--) {
        const a = worldPx(b.n, b.w, zoom), c = worldPx(b.s, b.e, zoom);
        if ((c[0] - a[0]) * (1 + 2 * padF) <= W && (c[1] - a[1]) * (1 + 2 * padF) <= H) break;
      }
      const a = worldPx(b.n, b.w, zoom), c = worldPx(b.s, b.e, zoom);
      cx = (a[0] + c[0]) / 2; cy = (a[1] + c[1]) / 2;
    } else {
      [cx, cy] = worldPx(lat, lng, zoom);
    }
    // Punto a marcar: el dado o el centroide del perímetro.
    let plat = lat, plng = lng;
    if (ringOk && !ptOk) { const cen = Geo.centroid(ring); plat = cen[0]; plng = cen[1]; }

    const r = await tilesIn(layer, zoom, cx, cy, W, H);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    paintBase(g, W, H, r.imgs, r.tilesOk, r.ox, r.oy);
    if (ringOk) drawPolygon(g, ring, zoom, r.ox, r.oy);
    if (isFinite(plat) && isFinite(plng)) {
      const [px, py] = worldPx(plat, plng, zoom);
      drawDiamond(g, px - r.ox, py - r.oy, 16);
    }
    drawLegend(g, legend, sub, ringOk);
    drawNorth(g, W);
    drawScale(g, isFinite(plat) ? plat : 0, zoom, W, H);
    drawAttribution(g, layer, r.tilesOk, W, H);

    // Recuadro de contexto (vista regional, abajo a la derecha).
    const IW = 320, IH = 230, iz = Math.max(4, zoom - 6);
    const icx = cx / Math.pow(2, zoom - iz), icy = cy / Math.pow(2, zoom - iz);
    const ictx = await tilesIn(layer, iz, icx, icy, IW, IH);
    const ic = document.createElement('canvas');
    ic.width = IW; ic.height = IH;
    const ig = ic.getContext('2d');
    paintBase(ig, IW, IH, ictx.imgs, ictx.tilesOk, ictx.ox, ictx.oy);
    if (ringOk) drawPolygon(ig, ring, iz, ictx.ox, ictx.oy);
    if (isFinite(plat) && isFinite(plng)) {
      const [ix, iy] = worldPx(plat, plng, iz);
      drawDiamond(ig, ix - ictx.ox, iy - ictx.oy, 8);
    }
    const mainHalfPx = (W / 2) * Math.pow(2, iz - zoom);
    ig.strokeStyle = 'rgba(11,79,74,0.9)'; ig.lineWidth = 2;
    ig.strokeRect(icx - ictx.ox - mainHalfPx, icy - ictx.oy - mainHalfPx * (H / W), mainHalfPx * 2, mainHalfPx * 2 * (H / W));

    const ix0 = W - IW - 24, iy0 = H - IH - 24;
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = 'rgba(11,79,74,0.4)'; g.lineWidth = 1;
    g.fillRect(ix0 - 4, iy0 - 26, IW + 8, IH + 30);
    g.strokeRect(ix0 - 4, iy0 - 26, IW + 8, IH + 30);
    g.fillStyle = '#0b4f4a'; g.font = 'bold 12px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('Ubicación', ix0, iy0 - 10);
    g.drawImage(ic, ix0, iy0);
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.strokeRect(ix0, iy0, IW, IH);

    let dataUrl;
    try { dataUrl = cv.toDataURL('image/jpeg', 0.88); }
    catch (e) {
      g.clearRect(0, 0, W, H);
      paintBase(g, W, H, [], 0, 0, 0);
      if (ringOk) drawPolygon(g, ring, zoom, 0, 0);
      if (isFinite(plat) && isFinite(plng)) drawDiamond(g, W / 2, H / 2, 16);
      drawLegend(g, legend, sub, ringOk); drawNorth(g, W); drawScale(g, isFinite(plat) ? plat : 0, zoom, W, H); drawAttribution(g, layer, 0, W, H);
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

  function geomBbox(geom) {
    if (geom.ring && geom.ring.length >= 3) return Geo.bounds(geom.ring);
    const dLat = 0.009, dLng = 0.009 / Math.max(0.1, Math.cos(geom.lat * Math.PI / 180));
    return { s: geom.lat - dLat, n: geom.lat + dLat, w: geom.lng - dLng, e: geom.lng + dLng };
  }

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
