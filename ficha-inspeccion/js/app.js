/* Ficha de Inspección Técnica - controlador de la app.
   Fichas, responsables, fotografías, coordenadas (WGS84/UTM), mapa con capa base y perímetro, PDF, respaldo y exportaciones. */
(() => {
  'use strict';

  /* ---------- utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmtDate = (d) => PDF.fmtDate(d);
  const safeName = (s) => String(s || 'ficha').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'ficha';

  let toastT = null;
  function toast(msg, ms = 3200) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function busy(on, msg) { $('busy').classList.toggle('hidden', !on); if (msg) $('busy').firstElementChild.textContent = msg; }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function anchorDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  async function download(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    if (isIOS && navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], filename, { type: blob.type || mime });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
      } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    anchorDownload(blob, filename);
    return true;
  }

  /* ---------- estado ---------- */
  const S = {
    inspections: [], people: [], tab: 'fichas',
    ficha: null, detailId: null, q: '',
    map: null, drawn: null, ring: [], baseLayer: 'esri',
    coord: { lat: null, lng: null, e: null, n: null, zone: null, hemi: 'S' },
    fotos: [], firmas: [], lastBackup: ''
  };

  /* ---------- navegación ---------- */
  const TITLES = { fichas: 'Fichas de inspección', detalle: 'Detalle de la ficha', ficha: 'Registro de ficha', responsables: 'Responsables', responsable: 'Responsable', respaldo: 'Respaldo y estado' };
  const TAB_OF = { fichas: 'fichas', detalle: 'fichas', ficha: 'fichas', responsables: 'responsables', responsable: 'responsables', respaldo: 'respaldo' };
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $('v-' + view).classList.remove('hidden');
    $('title').textContent = TITLES[view];
    S.tab = TAB_OF[view];
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    window.scrollTo(0, 0);
  }
  function goTab(tab) {
    if (tab === 'fichas') renderFichas();
    if (tab === 'responsables') renderResponsables();
    if (tab === 'respaldo') renderStatus();
    show(tab);
  }

  async function loadAll() {
    S.inspections = (await DB.all('inspections')).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.fichaNo || '').localeCompare(a.fichaNo || ''));
    S.people = (await DB.all('people')).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  }

  const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  /* =====================================================
     FICHAS (lista y detalle)
     ===================================================== */
  function filteredFichas() {
    const q = S.q.trim().toLowerCase();
    if (!q) return S.inspections;
    return S.inspections.filter((f) => {
      const l = f.lugar || {};
      const hay = [f.fichaNo, f.tema, f.institucion, l.zonal, l.parroquia, l.barrio, l.microcuenca].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function renderFichas() {
    const list = filteredFichas();
    $('totals').innerHTML = `<b>${list.length}</b> ficha${list.length === 1 ? '' : 's'}` + (S.q ? ` de <b>${S.inspections.length}</b>` : '');
    $('fichaList').innerHTML = list.length ? list.map((f) => {
      const l = f.lugar || {};
      const lugar = [l.zonal, l.parroquia, l.barrio, l.microcuenca].filter(Boolean).join(' · ');
      return `<div class="card tap" data-act="f-open" data-id="${f.id}">
        <div><h3>${esc(f.fichaNo || '—')} · ${fmtDate(f.fecha)}</h3>
        <div class="meta">${esc(f.tema || 'Sin tema')}<br>${esc(f.institucion || '')}${lugar ? ' · ' + esc(lugar) : ''} · ${f.fotoCount || 0} foto${f.fotoCount === 1 ? '' : 's'}</div></div>
        <div class="chev">Ver detalle ›</div></div>`;
    }).join('') : '<div class="empty">' + (S.q ? 'Sin resultados para la búsqueda.' : 'Aún no hay fichas. Crea la primera con "+ Nueva ficha".') + '</div>';
  }

  function openDetail(id) {
    const f = S.inspections.find((x) => x.id === id);
    if (!f) { goTab('fichas'); return; }
    S.detailId = id;
    const l = f.lugar || {};
    const row = (lbl, v) => `<div><small>${esc(lbl)}</small><b>${esc(v == null || v === '' ? '-' : v)}</b></div>`;
    const c = f.coord || {};
    const coordTxt = c.e != null && isFinite(c.e) ? `X ${c.e.toFixed(2)} · Y ${c.n.toFixed(2)} · UTM ${c.zone}${c.hemi || ''}${isFinite(c.lat) ? '  (' + c.lat.toFixed(6) + ', ' + c.lng.toFixed(6) + ')' : ''}` : '';
    const ringTxt = (f.ring && f.ring.length > 2) ? (f.area / 10000).toFixed(2) + ' ha · ' + Math.round(f.perimetro) + ' m · ' + f.ring.length + ' vértices' : '';
    $('d-title').textContent = (f.fichaNo || '') + ' · ' + fmtDate(f.fecha);
    $('d-info').innerHTML =
      row('Institución', [f.institucion, f.dirArea, f.unidad].filter(Boolean).join(' · ')) +
      row('Tema', f.tema) +
      row('Lugar', [l.zonal ? 'Zonal: ' + l.zonal : '', l.parroquia ? 'Parroquia: ' + l.parroquia : '', l.barrio ? 'Barrio: ' + l.barrio : '', l.microcuenca ? 'Microcuenca: ' + l.microcuenca : ''].filter(Boolean).join(' · ')) +
      row('Coordenada', coordTxt) +
      (ringTxt ? row('Perímetro de inspección', ringTxt) : '') +
      row('Participantes', (f.participantes || []).join(', ')) +
      row('Recomendaciones', (f.recomendaciones || []).join(', '));
    $('d-mapPanel').classList.toggle('hidden', !f.mapImage);
    $('d-map').innerHTML = f.mapImage ? `<img src="${f.mapImage}" alt="Mapa de ubicación">` : '';
    $('d-share').classList.toggle('hidden', !(navigator.canShare && navigator.share));
    $('d-geo').classList.toggle('hidden', !(f.ring && f.ring.length > 2));
    $('d-zip').classList.toggle('hidden', !(f.fotoCount > 0));
    Fotos.byInsp(id).then((metas) => {
      $('d-fotosPanel').classList.toggle('hidden', !metas.length);
      $('d-fotos').innerHTML = metas.map((m) => `<figure class="dphoto"><img src="${m.thumb}" alt=""><figcaption>${esc(m.pie || '')}</figcaption></figure>`).join('');
    });
    show('detalle');
  }

  /* =====================================================
     FORMULARIO DE FICHA
     ===================================================== */
  function openFicha(id) {
    let f;
    if (id) f = clone(S.inspections.find((x) => x.id === id));
    else f = {};
    if (!f.id) f.id = uid();
    S.ficha = f;
    S.ficha._new = !S.inspections.some((x) => x.id === f.id);

    $('f-inst').value = f.institucion || '';
    $('f-dir').value = f.dirArea || '';
    $('f-unidad').value = f.unidad || '';
    $('f-ficha').value = f.fichaNo || '';
    $('f-tema').value = f.tema || '';
    $('f-fecha').value = f.fecha || todayStr();
    const l = f.lugar || {};
    $('f-zonal').value = l.zonal || ''; $('f-parroquia').value = l.parroquia || '';
    $('f-barrio').value = l.barrio || ''; $('f-microcuenca').value = l.microcuenca || '';
    $('f-objetivo').value = f.objetivo || '';
    $('f-antecedentes').value = f.antecedentes || '';
    $('f-desarrollo').value = f.desarrollo || '';
    $('f-participantes').value = (f.participantes || []).join('\n');
    $('f-recomendaciones').value = (f.recomendaciones || []).join('\n');
    $('prefetchMsg').textContent = '';

    S.ring = (f.ring && f.ring.length) ? f.ring.slice() : [];
    S.coord = { lat: null, lng: null, e: null, n: null, zone: null, hemi: 'S' };
    syncCoordFields();
    updateRingStats();

    S.firmas = (f.firmas || []).map((fr) => ({ detalle: fr.detalle || '', personId: fr.personId || '', fb: { nombre: fr.nombre, cargo: fr.cargo } }));
    if (!S.firmas.length && S.ficha._new) S.firmas = [{ detalle: 'Elaboración', personId: '', fb: null }, { detalle: 'Revisado', personId: '', fb: null }];
    renderFirmas();

    S.fotos = [];
    show('ficha');
    ensureMap();
    S.baseLayer = f.layer || S.baseLayer || 'esri';
    setTimeout(() => {
      if (!S.map) return;
      S.map.invalidateSize();
      setRing(S.ring.slice(), S.ring.length >= 3);
      if (!S.ring.length) {
        const prev = S.inspections.find((x) => x.ring && x.ring.length > 2);
        if (prev) S.map.setView(Geo.centroid(prev.ring), 13);
      }
    }, 60);
    Fotos.byInsp(f.id).then((metas) => { if (S.ficha && S.ficha.id === f.id) { S.fotos = metas; renderFotos(); } });
  }

  async function saveFicha() {
    const fichaNo = $('f-ficha').value.trim();
    const institucion = $('f-inst').value.trim();
    const tema = $('f-tema').value.trim();
    const fecha = $('f-fecha').value;
    const falta = [['fichaNo', 'el número de ficha'], ['institucion', 'la institución'], ['tema', 'el tema'], ['fecha', 'la fecha']].filter(([k]) => !({ fichaNo, institucion, tema, fecha }[k])).map(([, l]) => l);
    if (falta.length) { toast('Falta: ' + falta.join(', ') + '.', 4500); return null; }

    const dup = S.inspections.find((g) => g.id !== S.ficha.id && (g.fichaNo || '').toLowerCase() === fichaNo.toLowerCase());
    if (dup && !confirm('Ya existe otra ficha con el número "' + fichaNo + '". ¿Guardar de todos modos?')) return null;

    const f = Object.assign({}, S.ficha, {
      fichaNo, institucion,
      dirArea: $('f-dir').value.trim(), unidad: $('f-unidad').value.trim(),
      tema, fecha,
      lugar: { zonal: $('f-zonal').value.trim(), parroquia: $('f-parroquia').value.trim(), barrio: $('f-barrio').value.trim(), microcuenca: $('f-microcuenca').value.trim() },
      objetivo: $('f-objetivo').value.trim(), antecedentes: $('f-antecedentes').value.trim(), desarrollo: $('f-desarrollo').value.trim(),
      participantes: lines($('f-participantes').value), recomendaciones: lines($('f-recomendaciones').value)
    });

    f.firmas = S.firmas.map((r) => {
      const p = S.people.find((x) => x.id === r.personId);
      const fb = r.fb || {};
      const nombre = p ? p.nombre : (fb.nombre || '');
      const cargo = p ? p.cargo : (fb.cargo || '');
      return { detalle: r.detalle || '', personId: r.personId || '', nombre, cargo };
    }).filter((x) => x.nombre || x.detalle);

    f.ring = S.ring.slice();
    f.layer = S.baseLayer;
    f.area = f.ring.length > 2 ? Geo.area(f.ring) : 0;
    f.perimetro = f.ring.length > 2 ? Geo.perimeter(f.ring) : 0;
    f.coord = (S.coord.lat != null && S.coord.lng != null) ? { lat: S.coord.lat, lng: S.coord.lng, e: S.coord.e, n: S.coord.n, zone: S.coord.zone, hemi: S.coord.hemi } : null;
    f.fotoCount = S.fotos.length;

    busy(true, 'Guardando…');
    try {
      if (f.coord || f.ring.length > 2) {
        $('busy').firstElementChild.textContent = 'Generando mapa de ubicación…';
        const img = await MapImg.render({
          ring: f.ring.length > 2 ? f.ring : null,
          lat: f.coord ? f.coord.lat : null, lng: f.coord ? f.coord.lng : null,
          legend: f.tema || 'Inspección técnica',
          sub: (f.fichaNo ? 'Ficha N° ' + f.fichaNo + ' · ' : '') + fmtDate(f.fecha),
          layer: f.layer || 'esri'
        });
        if (img) { f.mapImage = img.dataUrl; if (img.tilesOk === 0) toast('Sin mapa de fondo en la imagen (sin conexión y sin teselas guardadas). Se dibujó solo la referencia.', 6500); }
        else f.mapImage = '';
      } else f.mapImage = '';

      if (!f.createdAt) f.createdAt = Date.now();
      f.updatedAt = Date.now();
      await DB.put('inspections', f);
      await loadAll();
      return f;
    } catch (e) {
      console.error(e); toast('No se pudo guardar: ' + e.message, 6000); return null;
    } finally { busy(false); }
  }

  async function discardDraft() {
    if (S.ficha && S.ficha._new) {
      const metas = await Fotos.byInsp(S.ficha.id);
      for (const m of metas) await Fotos.remove(m.id);
    }
  }

  async function delFicha(id) {
    if (!confirm('¿Eliminar esta ficha y sus fotografías? Esta acción no se puede deshacer.')) return;
    const metas = await Fotos.byInsp(id);
    for (const m of metas) await Fotos.remove(m.id);
    await DB.del('inspections', id);
    await loadAll();
    S.detailId = null;
    goTab('fichas');
    toast('Ficha eliminada.');
  }

  function dupFicha(id) {
    const src = S.inspections.find((x) => x.id === id);
    if (!src) return;
    const f = clone(src);
    delete f.id; f.fichaNo = ''; f.fecha = todayStr(); f.fotoCount = 0; f.mapImage = ''; f.createdAt = 0; f.updatedAt = 0;
    f.id = uid();
    S.ficha = f;
    S.ficha._new = true;
    $('f-inst').value = f.institucion || ''; $('f-dir').value = f.dirArea || ''; $('f-unidad').value = f.unidad || '';
    $('f-ficha').value = ''; $('f-tema').value = f.tema || ''; $('f-fecha').value = f.fecha;
    const l = f.lugar || {};
    $('f-zonal').value = l.zonal || ''; $('f-parroquia').value = l.parroquia || ''; $('f-barrio').value = l.barrio || ''; $('f-microcuenca').value = l.microcuenca || '';
    $('f-objetivo').value = ''; $('f-antecedentes').value = ''; $('f-desarrollo').value = '';
    $('f-participantes').value = (f.participantes || []).join('\n');
    $('f-recomendaciones').value = (f.recomendaciones || []).join('\n');
    S.ring = (f.ring && f.ring.length) ? f.ring.slice() : [];
    S.coord = { lat: null, lng: null, e: null, n: null, zone: null, hemi: 'S' };
    syncCoordFields();
    updateRingStats();
    S.firmas = (f.firmas || []).map((fr) => ({ detalle: fr.detalle, personId: fr.personId || '', fb: { nombre: fr.nombre, cargo: fr.cargo } }));
    renderFirmas();
    S.fotos = [];
    renderFotos();
    show('ficha');
    ensureMap();
    S.baseLayer = f.layer || S.baseLayer || 'esri';
    setTimeout(() => { if (S.map) { S.map.invalidateSize(); setRing(S.ring.slice(), S.ring.length >= 3); } }, 60);
    toast('Se duplicaron los datos generales; completa el número de ficha.');
  }

  /* =====================================================
     PDF
     ===================================================== */
  async function preparePdf(id) {
    const f = S.inspections.find((x) => x.id === id);
    if (!f) return null;
    const metas = await Fotos.byInsp(id);
    const fotos = [];
    for (const m of metas) {
      const blob = await Fotos.getBlob(m.id);
      if (blob) { const dataUrl = await Fotos.blobToDataURL(blob); fotos.push({ dataUrl, w: m.w, h: m.h, pie: m.pie }); }
    }
    return { f, fotos };
  }
  async function pdfBlob(id) {
    const r = await preparePdf(id);
    if (!r) return null;
    return PDF.fichaDoc(r.f, r.fotos).output('blob');
  }
  async function pdfNow(id) {
    busy(true, 'Generando PDF…');
    try {
      const blob = await pdfBlob(id);
      if (!blob) return;
      const f = S.inspections.find((x) => x.id === id);
      download(blob, 'Ficha_' + safeName(f.fichaNo || 'sin-numero') + '_' + (f.fecha || '').slice(0, 10) + '.pdf', 'application/pdf');
    } catch (e) { console.error(e); toast('No se pudo generar el PDF: ' + e.message, 6000); }
    finally { busy(false); }
  }
  async function sharePdf(id) {
    busy(true, 'Generando PDF…');
    try {
      const blob = await pdfBlob(id);
      if (!blob) return;
      const f = S.inspections.find((x) => x.id === id);
      const name = 'Ficha_' + safeName(f.fichaNo || 'sin-numero') + '_' + (f.fecha || '').slice(0, 10) + '.pdf';
      const file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
      else download(blob, name, 'application/pdf');
    } catch (e) { if (e && e.name !== 'AbortError') toast('No se pudo compartir: ' + e.message, 5000); }
    finally { busy(false); }
  }

  /* =====================================================
     MAPA / COORDENADAS / PERÍMETRO
     ===================================================== */
  function setDrawLocale() {
    const d = L.drawLocal;
    d.draw.toolbar.actions = { title: 'Cancelar dibujo', text: 'Cancelar' };
    d.draw.toolbar.finish = { title: 'Terminar dibujo', text: 'Terminar' };
    d.draw.toolbar.undo = { title: 'Borrar el último punto', text: 'Borrar último punto' };
    d.draw.toolbar.buttons.polygon = 'Dibujar perímetro (polígono)';
    d.draw.toolbar.buttons.rectangle = 'Dibujar rectángulo';
    d.draw.handlers.polygon.tooltip = { start: 'Toca para iniciar el perímetro', cont: 'Toca para continuar', end: 'Toca el primer punto para cerrar' };
    d.draw.handlers.rectangle.tooltip = { start: 'Arrastra para dibujar un rectángulo' };
    d.draw.handlers.simpleshape = { tooltip: { end: 'Suelta para terminar' } };
    d.edit.toolbar.actions.save = { title: 'Guardar cambios', text: 'Guardar' };
    d.edit.toolbar.actions.cancel = { title: 'Cancelar edición', text: 'Cancelar' };
    d.edit.toolbar.buttons.edit = 'Editar vértices';
    d.edit.toolbar.buttons.editDisabled = 'No hay perímetro que editar';
  }

  const cleanRing = (r) => { const o = r.slice(); if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); return o; };
  const ringFromLatLngs = (ll) => cleanRing(ll.map((p) => [+p.lat.toFixed(7), +p.lng.toFixed(7)]));

  function ensureMap() {
    if (S.map) return;
    setDrawLocale();
    const map = L.map('coordMap', { maxZoom: 19 }).setView([-0.18, -78.47], 12);
    const base = {}, keyByName = {};
    Object.entries(MapImg.LAYERS).forEach(([k, l]) => {
      base[l.name] = L.tileLayer(l.url, { attribution: l.attr, maxZoom: l.maxZoom, maxNativeZoom: l.maxNative, crossOrigin: true });
      keyByName[l.name] = k;
    });
    base[MapImg.LAYERS.esri.name].addTo(map);
    L.control.layers(base, null, { collapsed: true }).addTo(map);
    map.on('baselayerchange', (e) => { S.baseLayer = keyByName[e.name] || 'esri'; });

    const drawn = L.featureGroup().addTo(map);
    const shape = { color: '#ffd400', weight: 3 };
    map.addControl(new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: { allowIntersection: false, showArea: false, shapeOptions: shape },
        rectangle: { showArea: false, shapeOptions: shape },
        polyline: false, circle: false, marker: false, circlemarker: false
      },
      edit: { featureGroup: drawn, remove: false }
    }));
    map.on(L.Draw.Event.CREATED, (e) => setRing(ringFromLatLngs(e.layer.getLatLngs()[0]), true));
    map.on(L.Draw.Event.EDITED, () => { let r = null; drawn.eachLayer((l) => { r = ringFromLatLngs(l.getLatLngs()[0]); }); if (r) setRing(r, false); });

    S.map = map; S.drawn = drawn;
  }

  function setRing(ring, fit) {
    S.ring = ring;
    if (S.drawn) {
      S.drawn.clearLayers();
      if (ring.length >= 3) {
        const poly = L.polygon(ring, { color: '#ffd400', weight: 3, fillOpacity: 0.2 });
        S.drawn.addLayer(poly);
        if (fit && S.map) S.map.fitBounds(poly.getBounds().pad(0.25));
      }
    }
    updateCoordFromRing();
    updateRingStats();
  }

  function updateRingStats() {
    const r = S.ring;
    if (r.length < 3) { $('ringStats').innerHTML = ''; return; }
    const st = (v, l) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`;
    $('ringStats').innerHTML = st((Geo.area(r) / 10000).toFixed(2) + ' ha', 'Área') + st(Math.round(Geo.perimeter(r)) + ' m', 'Perímetro') + st(r.length, 'Vértices');
  }

  function clearRing() {
    if (S.ring.length < 3) { toast('No hay perímetro que borrar.'); return; }
    if (confirm('¿Borrar el perímetro dibujado?')) setRing([], false);
  }

  function syncCoordFields() {
    $('c-lat').value = S.coord.lat != null ? S.coord.lat.toFixed(6) : '';
    $('c-lng').value = S.coord.lng != null ? S.coord.lng.toFixed(6) : '';
    $('c-este').value = S.coord.e != null ? S.coord.e.toFixed(2) : '';
    $('c-norte').value = S.coord.n != null ? S.coord.n.toFixed(2) : '';
    $('c-zona').value = S.coord.zone != null ? S.coord.zone : '';
    $('c-hemi').value = S.coord.hemi || 'S';
  }

  /* Las coordenadas de la ficha salen del centroide del perímetro dibujado. */
  function updateCoordFromRing() {
    if (S.ring.length >= 3) {
      const c = Geo.centroid(S.ring);
      const u = Geo.toUTM(c[0], c[1]);
      S.coord = { lat: c[0], lng: c[1], e: u.e, n: u.n, zone: u.zone, hemi: u.hemi };
    } else {
      S.coord = { lat: null, lng: null, e: null, n: null, zone: null, hemi: 'S' };
    }
    syncCoordFields();
  }

  async function prefetchArea() {
    if (S.ring.length < 3) { toast('Primero dibuja el perímetro.'); return; }
    if (!navigator.onLine) { toast('Necesitas conexión para precargar el mapa.'); return; }
    $('btnPrefetch').disabled = true;
    try {
      const r = await MapImg.prefetch({ ring: S.ring, lat: S.coord.lat, lng: S.coord.lng }, S.baseLayer, (d, t) => { $('prefetchMsg').textContent = 'Descargando ' + d + ' / ' + t + '…'; });
      $('prefetchMsg').textContent = 'Listo: ' + r.ok + ' de ' + r.total + ' teselas guardadas (zoom hasta ' + r.top + ').';
    } catch (e) { $('prefetchMsg').textContent = e.message; }
    $('btnPrefetch').disabled = false;
  }

  /* =====================================================
     FOTOGRAFÍAS
     ===================================================== */
  function renderFotos() {
    const box = $('fotosGrid');
    $('fotosHint').textContent = S.fotos.length ? S.fotos.length + ' foto' + (S.fotos.length === 1 ? '' : 's') + '.' : 'Aún no hay fotos.';
    box.innerHTML = S.fotos.map((p, i) => `<div class="phcard">
      <img src="${p.thumb}" alt="">
      <div class="phmeta">
        <input class="phpie" data-id="${p.id}" maxlength="90" placeholder="Descripción (máx. 90 caracteres)" value="${esc(p.pie)}">
        <div class="phacts">
          <button class="btn small" data-act="photo-l" data-id="${p.id}" ${i === 0 ? 'disabled' : ''}>←</button>
          <button class="btn small" data-act="photo-r" data-id="${p.id}" ${i === S.fotos.length - 1 ? 'disabled' : ''}>→</button>
          <button class="btn small danger" data-act="photo-del" data-id="${p.id}">Eliminar</button>
        </div>
      </div></div>`).join('');
  }

  async function addPhotos(files) {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    busy(true, 'Procesando fotos…');
    let order = S.fotos.length;
    for (const file of arr) {
      try {
        const c = await Fotos.compress(file);
        const id = uid();
        await Fotos.add({ id, inspId: S.ficha.id, blob: c.blob, thumb: c.thumb, w: c.w, h: c.h, pie: '', order });
        S.fotos.push({ id, inspId: S.ficha.id, pie: '', order, thumb: c.thumb, w: c.w, h: c.h });
        order++;
      } catch (e) { toast('No se pudo procesar una foto: ' + e.message, 5000); }
    }
    busy(false);
    renderFotos();
  }

  async function movePhoto(id, dir) {
    const i = S.fotos.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= S.fotos.length) return;
    const a = S.fotos[i], b = S.fotos[j];
    [S.fotos[i], S.fotos[j]] = [S.fotos[j], S.fotos[i]];
    await Fotos.updateMeta(a.id, { order: j });
    await Fotos.updateMeta(b.id, { order: i });
    renderFotos();
  }

  async function delPhoto(id) {
    if (!confirm('¿Eliminar esta fotografía?')) return;
    await Fotos.remove(id);
    S.fotos = S.fotos.filter((p) => p.id !== id);
    S.fotos.forEach((p, i) => Fotos.updateMeta(p.id, { order: i }));
    renderFotos();
  }

  /* =====================================================
     FIRMAS
     ===================================================== */
  function firmaPreview(r) {
    const p = S.people.find((x) => x.id === r.personId);
    const fb = r.fb || {};
    const nombre = p ? p.nombre : (fb.nombre || '');
    const cargo = p ? p.cargo : (fb.cargo || '');
    return { nombre, cargo };
  }

  function renderFirmas() {
    $('firmasRows').innerHTML = S.firmas.map((r, i) => {
      const pv = firmaPreview(r);
      const opts = S.people.map((p) => `<option value="${p.id}" ${p.id === r.personId ? 'selected' : ''}>${esc(p.nombre)} (${esc(p.cargo)})</option>`).join('');
      const extra = (r.personId && !S.people.some((p) => p.id === r.personId)) ? `<option value="${esc(r.personId)}" selected>${esc(pv.nombre || 'Eliminado')} (guardado)</option>` : '';
      return `<div class="firmarow">
        <select class="sig-person" data-i="${i}"><option value="">— Responsable —</option>${opts}${extra}</select>
        <input class="sig-detalle" data-i="${i}" placeholder="Detalle (Elaboración / Revisado / Aprobado)" value="${esc(r.detalle)}">
        <button class="btn small danger" data-act="firma-del" data-i="${i}">×</button>
        <div class="firminfo">${pv.nombre ? esc(pv.nombre + (pv.cargo ? ' · ' + pv.cargo : '')) : 'Sin responsable asignado.'}</div>
      </div>`;
    }).join('');
  }

  /* =====================================================
     RESPONSABLES
     ===================================================== */
  function renderResponsables() {
    const box = $('respList');
    if (!S.people.length) { box.innerHTML = '<div class="empty">Aún no hay responsables.<br>Crea uno para asignarlo a las firmas de las fichas.</div>'; return; }
    box.innerHTML = S.people.map((p) => `<div class="card">
      <div><h3>${esc(p.nombre)}</h3><div class="meta">${esc(p.cargo)}</div></div>
      <div class="acts">
        <button class="btn small" data-act="resp-edit" data-id="${p.id}">Editar</button>
        <button class="btn small danger" data-act="resp-del" data-id="${p.id}">Eliminar</button>
      </div></div>`).join('');
  }

  function openResponsable(id) {
    const p = id ? S.people.find((x) => x.id === id) : null;
    S.resp = p ? clone(p) : { id: null, nombre: '', cargo: '' };
    $('r-nombre').value = S.resp.nombre; $('r-cargo').value = S.resp.cargo;
    show('responsable');
  }

  async function saveResponsable() {
    const p = Object.assign({}, S.resp, { nombre: $('r-nombre').value.trim(), cargo: $('r-cargo').value.trim() });
    const falta = [['nombre', 'nombre completo'], ['cargo', 'cargo']].filter(([k]) => !p[k]).map(([, l]) => l);
    if (falta.length) { toast('Falta: ' + falta.join(', ') + '.', 4500); return; }
    p.id = p.id || uid();
    p.updatedAt = Date.now();
    await DB.put('people', p);
    await loadAll();
    toast('Responsable guardado.');
    goTab('responsables');
  }

  /* =====================================================
     EXPORTACIONES
     ===================================================== */
  const csvQ = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function exportCsv() {
    const list = filteredFichas().slice().reverse();
    if (!list.length) { toast('No hay fichas para exportar.'); return; }
    const cols = ['ficha', 'institucion', 'dir_area', 'unidad', 'tema', 'fecha', 'x_utm', 'y_utm', 'zona', 'lat', 'lon', 'zonal', 'parroquia', 'barrio', 'microcuenca', 'fotos', 'area_ha', 'perim_m', 'participantes', 'recomendaciones'];
    const rows = list.map((f) => {
      const l = f.lugar || {}, c = f.coord || {};
      return [f.fichaNo, f.institucion, f.dirArea, f.unidad, f.tema, f.fecha,
        c.e != null && isFinite(c.e) ? c.e.toFixed(2) : '', c.n != null && isFinite(c.n) ? c.n.toFixed(2) : '', c.zone || '',
        isFinite(c.lat) ? c.lat.toFixed(6) : '', isFinite(c.lng) ? c.lng.toFixed(6) : '',
        l.zonal, l.parroquia, l.barrio, l.microcuenca, f.fotoCount || 0,
        f.area ? (f.area / 10000).toFixed(3) : '', f.perimetro ? Math.round(f.perimetro) : '',
        (f.participantes || []).join(', '), (f.recomendaciones || []).join(', ')].map(csvQ).join(';');
    });
    download('\ufeff' + [cols.join(';')].concat(rows).join('\r\n'), 'fichas_inspeccion_' + todayStr() + '.csv', 'text/csv;charset=utf-8');
  }

  /* GeoJSON de los perímetros de inspección (polígonos) con los datos de cada levantamiento.
     Nombres de campo de hasta 10 caracteres para que no se trunquen al pasar a shapefile. */
  function perimetersGeoJSON(list) {
    const feats = list.filter((f) => f.ring && f.ring.length > 2).map((f) => {
      const l = f.lugar || {}, c = f.coord || {};
      const hasE = c.e != null && isFinite(c.e), hasN = c.n != null && isFinite(c.n);
      const hasLat = c.lat != null && isFinite(c.lat), hasLng = c.lng != null && isFinite(c.lng);
      return {
        ring: f.ring,
        props: {
          ficha: f.fichaNo || '', inst: f.institucion || '', tema: f.tema || '', fecha: f.fecha || '',
          x_utm: hasE ? +c.e.toFixed(2) : null, y_utm: hasN ? +c.n.toFixed(2) : null, zona: c.zone || '',
          lat_cen: hasLat ? +c.lat.toFixed(6) : null, lon_cen: hasLng ? +c.lng.toFixed(6) : null,
          zonal: l.zonal || '', parrq: l.parroquia || '', barrio: l.barrio || '', micro: l.microcuenca || '',
          area_ha: f.area ? +(f.area / 10000).toFixed(3) : 0,
          perim_m: f.perimetro ? Math.round(f.perimetro) : 0,
          verts: f.ring.length, fotos: f.fotoCount || 0
        }
      };
    });
    return { n: feats.length, text: Geo.toPolygonGeoJSON(feats) };
  }

  function exportGeoAll() {
    const r = perimetersGeoJSON(filteredFichas());
    if (!r.n) { toast('Ninguna ficha tiene perímetro dibujado.'); return; }
    download(r.text, 'perimetros_inspeccion_' + todayStr() + '.geojson', 'application/geo+json');
    toast('GeoJSON con ' + r.n + ' perímetro' + (r.n === 1 ? '' : 's') + ' (WGS84).');
  }
  function exportGeoOne(id) {
    const f = S.inspections.find((x) => x.id === id);
    const r = perimetersGeoJSON(f ? [f] : []);
    if (!r.n) { toast('Esta ficha no tiene perímetro dibujado.'); return; }
    download(r.text, 'perimetro_' + safeName(f.fichaNo || 'ficha') + '.geojson', 'application/geo+json');
  }

  async function buildZip(fichas) {
    const entries = [];
    const csvRows = [['ficha', 'archivo', 'pie', 'tema', 'fecha']];
    for (const f of fichas) {
      const metas = await Fotos.byInsp(f.id);
      const dir = safeName(f.fichaNo || f.id);
      let n = 0;
      for (const m of metas) {
        const blob = await Fotos.getBlob(m.id);
        if (!blob) continue;
        n++;
        const arch = dir + '/' + String(n).padStart(3, '0') + '.jpg';
        entries.push({ name: arch, blob });
        csvRows.push([f.fichaNo || '', arch, m.pie || '', f.tema || '', f.fecha || '']);
      }
    }
    if (!entries.length) return null;
    const csv = '\ufeff' + csvRows.map((r) => r.map(csvQ).join(';')).join('\r\n');
    entries.push({ name: 'indice.csv', blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }) });
    return Zip.build(entries);
  }

  async function exportZip(fichas, label) {
    busy(true, 'Preparando ZIP…');
    try {
      const blob = await buildZip(fichas);
      if (!blob) { toast('No hay fotografías para exportar.'); return; }
      download(blob, label || ('fotos_inspeccion_' + todayStr() + '.zip'), 'application/zip');
    } catch (e) { console.error(e); toast('No se pudo generar el ZIP: ' + e.message, 6000); }
    finally { busy(false); }
  }
  function exportZipOne(id) {
    const f = S.inspections.find((x) => x.id === id);
    if (!f) return;
    exportZip([f], 'fotos_' + safeName(f.fichaNo || 'ficha') + '_' + todayStr() + '.zip');
  }
  function exportZipAll() {
    if (!S.inspections.length) { toast('No hay fichas.'); return; }
    exportZip(S.inspections, 'fotos_inspeccion_' + todayStr() + '.zip');
  }

  /* =====================================================
     RESPALDO Y ESTADO
     ===================================================== */
  async function renderStatus() {
    const ctl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    $('offlineState').textContent = ctl ? 'La app está guardada en este teléfono y abre sin conexión.' : 'Aún no está guardada para uso sin conexión. Ábrela una vez con internet (y espera unos segundos) para que quede lista.';
    let t = S.inspections.length + ' fichas · ' + S.people.length + ' responsables guardados.';
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const per = await navigator.storage.persisted();
        const est = navigator.storage.estimate ? await navigator.storage.estimate() : null;
        t += ' Almacenamiento ' + (per ? 'protegido' : 'no protegido contra limpieza automática') + (est ? ' · uso: ' + (est.usage / 1048576).toFixed(1) + ' MB' : '') + '.';
      }
    } catch (e) { /* ignorar */ }
    $('storageInfo').textContent = t;
    $('backupInfo').textContent = S.lastBackup ? 'Último respaldo: ' + fmtDate(S.lastBackup.slice(0, 10)) + '.' : 'Aún no se ha hecho ningún respaldo en este teléfono.';
    let ver = '';
    try { const ks = await caches.keys(); const k = ks.find((x) => x.startsWith('fi-app-')); if (k) ver = k.replace('fi-app-', ''); } catch (e) { /* sin caché */ }
    $('versionInfo').textContent = ver ? 'Versión de la app: ' + ver : '';
  }

  async function backup() {
    const data = { app: 'ficha-inspeccion', version: 1, exportedAt: new Date().toISOString(), inspections: S.inspections, people: S.people };
    const entregado = await download(JSON.stringify(data), 'respaldo_fichas_inspeccion_' + todayStr() + '.json', 'application/json');
    if (!entregado) return;
    S.lastBackup = new Date().toISOString();
    await DB.kvSet('lastBackup', S.lastBackup);
    renderStatus();
    toast('Respaldo exportado.');
  }

  async function restore(file) {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'ficha-inspeccion') throw new Error('No es un respaldo de esta app.');
      const merge = async (store, items, cur) => {
        for (const it of items || []) {
          const mine = cur.find((x) => x.id === it.id);
          if (!mine || (it.updatedAt || 0) > (mine.updatedAt || 0)) await DB.put(store, it);
        }
      };
      if (!confirm('Se combinarán ' + (d.inspections || []).length + ' fichas y ' + (d.people || []).length + ' responsables con los datos actuales. ¿Continuar?')) return;
      await merge('inspections', d.inspections, S.inspections);
      await merge('people', d.people, S.people);
      await loadAll();
      renderStatus();
      toast('Respaldo importado.');
    } catch (e) { toast('No se pudo importar: ' + e.message, 5000); }
    $('fileRestore').value = '';
  }

  /* =====================================================
     EVENTOS
     ===================================================== */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id || S.detailId;
    switch (b.dataset.act) {
      case 'detail-back': goTab('fichas'); break;
      case 'ficha-back':
        if (S.ficha && S.ficha._new) { if (!confirm('¿Descartar esta ficha sin guardar?')) break; await discardDraft(); }
        goTab('fichas'); break;
      case 'f-open': openDetail(id); break;
      case 'f-edit': openFicha(id); break;
      case 'f-dup': dupFicha(id); break;
      case 'f-pdf': pdfNow(id); break;
      case 'f-share': sharePdf(id); break;
      case 'f-geo': exportGeoOne(id); break;
      case 'f-zip': exportZipOne(id); break;
      case 'f-del': await delFicha(id); break;
      case 'photo-l': movePhoto(id, -1); break;
      case 'photo-r': movePhoto(id, 1); break;
      case 'photo-del': await delPhoto(id); break;
      case 'firma-del': S.firmas.splice(+b.dataset.i, 1); renderFirmas(); break;
      case 'resp-back': goTab('responsables'); break;
      case 'resp-edit': openResponsable(id); break;
      case 'resp-del':
        if (confirm('¿Eliminar este responsable? Las fichas ya guardadas conservan su nombre y cargo.')) { await DB.del('people', id); await loadAll(); renderResponsables(); toast('Responsable eliminado.'); }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('phpie')) {
      const m = S.fotos.find((p) => p.id === e.target.dataset.id);
      if (m) { m.pie = e.target.value; Fotos.updateMeta(m.id, { pie: m.pie }); }
    }
    if (e.target.classList.contains('sig-person')) {
      S.firmas[+e.target.dataset.i].personId = e.target.value;
      renderFirmas();
    }
    if (e.target.classList.contains('sig-detalle')) {
      S.firmas[+e.target.dataset.i].detalle = e.target.value;
    }
  });

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
  $('btnNewFicha').onclick = () => openFicha(null);
  $('btnSaveFicha').onclick = async () => { const f = await saveFicha(); if (f) { toast('Ficha guardada (' + (f.fichaNo || '') + ').'); openDetail(f.id); } };
  $('q').addEventListener('input', (e) => { S.q = e.target.value; renderFichas(); });

  $('btnNewResp').onclick = () => openResponsable(null);
  $('btnSaveResp').onclick = saveResponsable;
  $('btnAddFirma').onclick = () => { S.firmas.push({ detalle: '', personId: '', fb: null }); renderFirmas(); };

  $('btnCam').onclick = () => $('camInput').click();
  $('btnGal').onclick = () => $('galInput').click();
  $('camInput').onchange = (e) => { addPhotos(e.target.files); e.target.value = ''; };
  $('galInput').onchange = (e) => { addPhotos(e.target.files); e.target.value = ''; };

  $('btnClearRing').onclick = clearRing;
  $('btnPrefetch').onclick = prefetchArea;

  $('btnCsv').onclick = exportCsv;
  $('btnGeoAll').onclick = exportGeoAll;
  $('btnBackup').onclick = backup;
  $('btnZipAll').onclick = exportZipAll;
  $('fileRestore').onchange = (e) => restore(e.target.files[0]);

  function netState() { const n = $('net'); n.textContent = navigator.onLine ? 'en línea' : 'sin conexión'; n.classList.toggle('off', !navigator.onLine); }
  window.addEventListener('online', netState); window.addEventListener('offline', netState);

  /* ---------- arranque ---------- */
  (async function init() {
    netState();
    try {
      await loadAll();
      S.lastBackup = await DB.kvGet('lastBackup', '');
      const ids = S.inspections.map((f) => f.id);
      await Fotos.purgeOrphans(ids);
    } catch (e) { console.error(e); toast('No se pudo abrir el almacenamiento local: ' + e.message, 8000); }
    goTab('fichas');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('updateBar').classList.remove('hidden'); });
      $('btnReload').onclick = () => location.reload();
      navigator.serviceWorker.register('sw.js').then((reg) => {
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch((e) => console.warn('SW', e));
    }
    window.__FI = { S, DB };
  })();
})();
