/* Generación del PDF de la ficha de inspección técnica (jsPDF).
   Diseño propio: banda institucional, datos generales y 8 secciones numeradas con barra. */
const PDF = (() => {
  const M = 14, PW = 210, BOTTOM = 280, CW = PW - 2 * M;
  const TEAL = [11, 79, 74], GRAY = [105, 113, 120], LINE = [198, 205, 209], SOFT = [232, 241, 240];
  const LH = 4.3;

  const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : d || '-');
  const hhmm = (min) => (min == null || isNaN(min) ? '-' : String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(Math.round(min % 60)).padStart(2, '0'));

  function newDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  }

  function ensure(ctx, h, onNewPage) {
    if (ctx.y + h > BOTTOM) { ctx.doc.addPage(); ctx.y = 16; if (onNewPage) onNewPage(); return true; }
    return false;
  }

  /* ---------- banda institucional ---------- */
  function header(doc, f) {
    doc.setFillColor(...TEAL); doc.rect(0, 0, PW, 31, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(f.institucion || '(Institución)', M, 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (f.dirArea) { doc.text(f.dirArea, M, 14.5); }
    if (f.unidad) { doc.text(f.unidad, M, 19.5); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('INFORME DE INSPECCIÓN TÉCNICA', M, 27);

    // Recuadro FICHA N°
    doc.setFillColor(255); doc.rect(150, 6.5, 46, 16, 'F');
    doc.setTextColor(...TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text('FICHA N°', 154, 11);
    doc.setFontSize(13);
    doc.text(f.fichaNo || '-', 154, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(fmtDate(f.fecha), 154, 22);
    doc.setTextColor(0);
  }

  /* ---------- rejilla de datos generales ---------- */
  function grid(ctx, cells, cols) {
    const d = ctx.doc, cw = CW / cols;
    let i = 0;
    while (i < cells.length) {
      const row = []; let used = 0;
      while (i < cells.length && used < cols) {
        const c = cells[i]; const span = Math.min(c.span || 1, cols - used);
        row.push({ l: c.l, v: c.v, span }); used += span; i++;
      }
      if (used < cols) row[row.length - 1].span += cols - used;
      d.setFont('helvetica', 'normal'); d.setFontSize(9.5);
      let hMax = 0;
      row.forEach((c) => {
        c.lines = Array.isArray(c.v)
          ? c.v.map((t) => String(t))
          : d.splitTextToSize(c.v === '' || c.v == null ? '-' : String(c.v), cw * c.span - 5);
        c.h = 4.4 + c.lines.length * LH + 1.4;
        hMax = Math.max(hMax, c.h);
      });
      ensure(ctx, hMax);
      let x = M;
      row.forEach((c) => {
        const w = cw * c.span;
        d.setDrawColor(...LINE); d.setLineWidth(0.2); d.rect(x, ctx.y, w, hMax);
        d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...GRAY); d.text(c.l, x + 2.5, ctx.y + 3.6);
        d.setFontSize(9.5); d.setTextColor(0); d.text(c.lines, x + 2.5, ctx.y + 8);
        x += w;
      });
      ctx.y += hMax;
    }
    ctx.y += 3;
  }

  /* Solo coordenadas UTM. */
  const coordText = (f) => {
    const c = f.coord || {};
    if (c.e == null || !isFinite(c.e)) return '-';
    return 'X ' + c.e.toFixed(2) + ' · Y ' + c.n.toFixed(2) + ' · UTM ' + c.zone + (c.hemi || '');
  };
  /* Un ítem por línea. */
  const lugarLines = (f) => {
    const l = f.lugar || {};
    const out = [];
    if (l.zonal) out.push('Administración Zonal: ' + l.zonal);
    if (l.parroquia) out.push('Parroquia: ' + l.parroquia);
    if (l.barrio) out.push('Barrio: ' + l.barrio);
    if (l.microcuenca) out.push('Microcuenca: ' + l.microcuenca);
    return out.length ? out : ['-'];
  };

  function dataBlock(ctx, f) {
    const cells = [
      { l: 'TEMA', v: f.tema, span: 2 },
      { l: 'FECHA', v: fmtDate(f.fecha) },
      { l: 'COORDENADA', v: coordText(f) }
    ];
    if (f.ring && f.ring.length >= 3 && f.area != null && isFinite(f.area)) {
      cells.push({ l: 'ÁREA DE INSPECCIÓN', v: (f.area / 10000).toFixed(2) + ' ha', span: 2 });
    }
    cells.push({ l: 'LUGAR', v: lugarLines(f), span: 2 });
    grid(ctx, cells, 2);
  }

  /* ---------- secciones numeradas ---------- */
  function sectionBar(ctx, num, title) {
    const d = ctx.doc;
    d.setFillColor(...TEAL); d.rect(M, ctx.y, CW, 7, 'F');
    d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(10.5);
    d.text((num ? num + '. ' : '') + title.toUpperCase(), M + 2.5, ctx.y + 4.9);
    d.setTextColor(0);
    ctx.y += 9.5;
  }
  /* Dibuja la barra de sección asegurando que quepa también un mínimo de contenido,
     para que ningún título quede solo al final de una página. */
  function section(ctx, num, title, minContent) {
    const need = 9.5 + (minContent == null ? 14 : minContent);
    if (ctx.y + need > BOTTOM) { ctx.doc.addPage(); ctx.y = 16; }
    sectionBar(ctx, num, title);
  }

  function para(ctx, text) {
    const d = ctx.doc;
    const t = (text || '').trim();
    if (!t) { d.setFont('helvetica', 'normal'); d.setFontSize(9.5); d.setTextColor(...GRAY); d.text('-', M, ctx.y + 3); d.setTextColor(0); ctx.y += 8; return; }
    d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(0);
    const lines = d.splitTextToSize(t, CW);
    ensure(ctx, lines.length * LH + 2);
    d.text(lines, M, ctx.y + 3);
    ctx.y += lines.length * LH + 4;
  }

  function numList(ctx, items) {
    const d = ctx.doc;
    const arr = (items || []).map((s) => String(s).trim()).filter(Boolean);
    if (!arr.length) { para(ctx, ''); return; }
    d.setFont('helvetica', 'normal'); d.setFontSize(10);
    arr.forEach((t, i) => {
      const lines = d.splitTextToSize(t, CW - 8);
      ensure(ctx, lines.length * LH + 1.6);
      d.text(String(i + 1) + '.', M, ctx.y + 3);
      d.text(lines, M + 7, ctx.y + 3);
      ctx.y += lines.length * LH + 1.6;
    });
    ctx.y += 2;
  }

  function photoGrid(ctx, num, title, photos) {
    const gap = 8, cw = (CW - gap) / 2, ph = 58, capH = 13;
    const rowH = ph + capH + 6;
    // El título y la primera fila de fotos deben caber juntos: si no, se pasa de página
    // antes de escribir el título (nunca un título solo al final de la página).
    if (ctx.y + 9.5 + rowH > BOTTOM) { ctx.doc.addPage(); ctx.y = 16; }
    sectionBar(ctx, num, title);
    if (!photos || !photos.length) { para(ctx, 'Sin fotografías registradas.'); return; }
    let i = 0;
    while (i < photos.length) {
      if (ctx.y + rowH > BOTTOM) { ctx.doc.addPage(); ctx.y = 16; sectionBar(ctx, num, title); }
      const yTop = ctx.y;
      for (let c = 0; c < 2 && i < photos.length; c++, i++) {
        const p = photos[i];
        const x = M + c * (cw + gap);
        ctx.doc.setDrawColor(...LINE); ctx.doc.setLineWidth(0.2); ctx.doc.rect(x, yTop, cw, ph);
        if (p.dataUrl && p.w && p.h) {
          try {
            const s = Math.min((cw - 4) / p.w, (ph - 4) / p.h);
            const dw = p.w * s, dh = p.h * s;
            ctx.doc.addImage(p.dataUrl, 'JPEG', x + (cw - dw) / 2, yTop + (ph - dh) / 2, dw, dh);
          } catch (e) { /* imagen inválida */ }
        }
        // pie de foto (hasta 2 líneas; el resto se corta con puntos suspensivos)
        ctx.doc.setFont('helvetica', 'normal'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(...GRAY);
        const cap = ctx.doc.splitTextToSize('Foto ' + (i + 1) + (p.pie ? ': ' + p.pie : ''), cw - 3);
        const shown = cap.slice(0, 2);
        if (cap.length > 2) shown[1] = shown[1] + '…';
        ctx.doc.text(shown, x + 1.5, yTop + ph + 4.5);
        ctx.doc.setTextColor(0);
      }
      ctx.y = yTop + rowH;
    }
  }

  /* El mapa se ajusta al alto disponible para que siempre quede en la primera página. */
  function mapBlock(ctx, f) {
    if (!f.mapImage) { para(ctx, 'Sin mapa de ubicación (no se dibujó el área de inspección).'); return; }
    const d = ctx.doc;
    let w = CW, h = CW * 800 / 1200;
    const avail = Math.max(40, BOTTOM - ctx.y);
    if (h > avail) { const k = avail / h; h = avail; w = CW * k; }
    const x = M + (CW - w) / 2;
    d.addImage(f.mapImage, 'JPEG', x, ctx.y, w, h);
    d.setDrawColor(...LINE); d.setLineWidth(0.2); d.rect(x, ctx.y, w, h);
    ctx.y += h + 5;
  }

  function signatureTable(ctx, firmas) {
    const d = ctx.doc;
    if (!firmas || !firmas.length) { para(ctx, ''); return; }
    const cols = [{ t: 'DETALLE', w: 32 }, { t: 'NOMBRE', w: 50 }, { t: 'CARGO', w: 44 }, { t: 'FIRMA', w: 56 }];
    ensure(ctx, 38);
    d.setFillColor(...TEAL); d.rect(M, ctx.y, CW, 7, 'F');
    d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(8.5);
    let hx = M; cols.forEach((c) => { d.text(c.t, hx + 2, ctx.y + 4.9); hx += c.w; });
    d.setTextColor(0); ctx.y += 7;
    firmas.forEach((fr) => {
      ensure(ctx, 32);
      const h = 30, y = ctx.y;
      let x = M;
      cols.forEach((c, k) => {
        d.setDrawColor(...LINE); d.setLineWidth(0.2); d.rect(x, y, c.w, h);
        if (k === 3) {
          // Espacio en blanco para firmar a mano el PDF impreso.
          d.setDrawColor(...GRAY); d.line(x + 6, y + h - 7, x + c.w - 6, y + h - 7);
        } else {
          d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(0);
          const txt = k === 0 ? fr.detalle : k === 1 ? fr.nombre : fr.cargo;
          d.text(d.splitTextToSize(txt || '-', c.w - 6), x + 3, y + 6);
        }
        x += c.w;
      });
      ctx.y += h + 3;
    });
  }

  function footers(doc, label) {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, h - 12, w - M, h - 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(label, M, h - 7.5);
      doc.text('Página ' + p + ' de ' + n, w - M, h - 7.5, { align: 'right' });
      doc.setTextColor(0);
    }
  }

  /* ---------- documento completo ---------- */
  function fichaDoc(f, fotos) {
    const doc = newDoc();
    const ctx = { doc, y: 0 };
    header(doc, f);
    ctx.y = 34;
    dataBlock(ctx, f);

    // 1. Mapa de ubicación: cierra la primera página.
    section(ctx, '1', 'Mapa de ubicación');
    mapBlock(ctx, f);

    // 2. Objetivo: siempre comienza en la página 2.
    doc.addPage();
    ctx.y = 16;
    section(ctx, '2', 'Objetivo');
    para(ctx, f.objetivo);
    section(ctx, '3', 'Antecedentes');
    para(ctx, f.antecedentes);
    section(ctx, '4', 'Desarrollo de actividades');
    para(ctx, f.desarrollo);
    section(ctx, '5', 'Participantes');
    numList(ctx, f.participantes);
    photoGrid(ctx, '6', 'Registro fotográfico', fotos);
    section(ctx, '7', 'Recomendaciones');
    numList(ctx, f.recomendaciones);
    section(ctx, '8', 'Firmas de responsabilidad', 38);
    signatureTable(ctx, f.firmas);

    footers(doc, (f.institucion || 'Ficha de inspección') + ' · FICHA N° ' + (f.fichaNo || '-'));
    return doc;
  }

  return { fichaDoc, hhmm, fmtDate };
})();
